#!/bin/bash
# Runs the Detox + Cucumber e2e suite on a throwaway APFS clone of a checkout, on a simulator or
# emulator made for this run only. Nothing else is touched: not the developer's simulators or
# emulators (emulator-5554 / AVD Xaman_API36), not a USB phone, not the checkout itself.
#
#   scripts/e2e/run-throwaway.sh ios|android [options] [-- cucumber paths]
#
#   --name NAME         run name; the clone is $E2E_WORK/xaman-e2e-NAME (default: <platform>-<date>-<time>)
#   --source DIR        checkout to clone (default: this one); needs node_modules, and ios/Pods for iOS
#   --release|--debug   Android build type (default: release; debug starts its own Metro)
#   --port N            Android emulator console port: even, 5556-5584 (default: the first free one)
#   --avd NAME          Android AVD to start read-only (default: $E2E_AVD, else the first AVD that is
#                       not Xaman_API36)
#   --device-type TYPE  iOS simulator type for the new simulator (default: "iPhone 17 Pro")
#   --runtime ID        iOS runtime for it, e.g. com.apple.CoreSimulator.SimRuntime.iOS-26-5 (default: newest)
#   --skip-build        reuse the build already in the clone (use with --name of an earlier run)
#   --keep-device       leave the simulator or emulator running afterwards
#
# Paths after -- go to cucumber-js (default: ./e2e). The run stops with exit code 124 when its log
# stays silent for E2E_STALL_MINUTES (default 20). Results land in <clone>/.e2e-artifacts.

set -eo pipefail # no -u: bash 3.2 (macOS) rejects empty arrays under it

usage() { awk 'NR > 1 && /^#/ { sub(/^# ?/, ""); print; next } NR > 1 { exit }' "$0"; exit "${1:-0}"; }

PLATFORM="${1:-}"
case "$PLATFORM" in
    ios | android) shift ;;
    -h | --help) usage 0 ;;
    *) usage 2 ;;
esac

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
SOURCE="$ROOT"
NAME="$PLATFORM-$(date +%Y%m%d-%H%M%S)"
BUILD_TYPE=release
PORT=""
AVD="${E2E_AVD:-}"
DEVICE_TYPE="iPhone 17 Pro"
RUNTIME=""
SKIP_BUILD=no
KEEP_DEVICE=no
FEATURES=()

while [ $# -gt 0 ]; do
    case "$1" in
        --name) NAME="$2"; shift 2 ;;
        --source) SOURCE="$(cd "$2" && pwd)"; shift 2 ;;
        --release) BUILD_TYPE=release; shift ;;
        --debug) BUILD_TYPE=debug; shift ;;
        --port) PORT="$2"; shift 2 ;;
        --avd) AVD="$2"; shift 2 ;;
        --device-type) DEVICE_TYPE="$2"; shift 2 ;;
        --runtime) RUNTIME="$2"; shift 2 ;;
        --skip-build) SKIP_BUILD=yes; shift ;;
        --keep-device) KEEP_DEVICE=yes; shift ;;
        --) shift; FEATURES=("$@"); break ;;
        -h | --help) usage 0 ;;
        *) echo "unknown option: $1" >&2; usage 2 ;;
    esac
done
[ ${#FEATURES[@]} -eq 0 ] && FEATURES=(./e2e)

WORK="${E2E_WORK:-$HOME/Code/e2e-runs}"
CLONE="$WORK/xaman-e2e-$NAME"
ART="$CLONE/.e2e-artifacts"
STALL_MINUTES="${E2E_STALL_MINUTES:-20}"

log() { echo "[e2e-throwaway $(date +%H:%M:%S)] $*"; }
die() { echo "[e2e-throwaway] ERROR: $*" >&2; exit 1; }

SDK="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-$HOME/Library/Android/sdk}}"
ADB="$SDK/platform-tools/adb"
EMULATOR="$SDK/emulator/emulator"

# ---------------------------------------------------------------- checks (before anything is made)
if [ "$PLATFORM" = android ]; then
    [ -x "$ADB" ] && [ -x "$EMULATOR" ] || die "Android SDK not found at $SDK"
    if [ -n "$PORT" ]; then
        case "$PORT" in *[!0-9]*) die "--port must be a number" ;; esac
        if [ "$PORT" -lt 5556 ] || [ "$PORT" -gt 5584 ] || [ $((PORT % 2)) -ne 0 ]; then
            die "--port must be even and within 5556-5584 (5554 is the developer emulator; adb ignores ports above 5584)"
        fi
        if "$ADB" devices | grep -q "^emulator-$PORT[[:space:]]" &&
            [ "$(cat "$CLONE/.e2e-device" 2>/dev/null)" != "emulator-$PORT" ]; then
            die "emulator-$PORT is already running; it is not this run's device"
        fi
    fi
    [ "$AVD" = Xaman_API36 ] && die "AVD Xaman_API36 is the developer emulator; pass another --avd"
else
    xcrun simctl list devicetypes | grep -q "^$DEVICE_TYPE (" || die "no simulator type \"$DEVICE_TYPE\""
fi

# ---------------------------------------------------------------- clone
if [ -d "$CLONE" ]; then
    [ "$SKIP_BUILD" = yes ] || die "$CLONE exists; pass --skip-build to reuse its build, or another --name"
    log "reusing $CLONE"
else
    [ -d "$SOURCE/node_modules" ] || die "$SOURCE has no node_modules (run npm ci there first)"
    if [ "$PLATFORM" = ios ] && [ ! -d "$SOURCE/ios/Pods" ]; then
        die "$SOURCE has no ios/Pods (run pod install there first)"
    fi
    mkdir -p "$WORK"
    log "cloning $SOURCE -> $CLONE (APFS clone, copy-on-write)"
    cp -Rc "$SOURCE" "$CLONE"
    SKIP_BUILD=no
fi
cd "$CLONE"
# A throwaway build is debug-signed (CI=1) and never holds the release key.
find android/app -maxdepth 1 -name '*.keystore' ! -name 'debug.keystore' -exec rm -f {} +
mkdir -p "$ART"
export CI=1
export XAMAN_SOURCEMAPS_DIR="$CLONE/.sourcemaps"

CLEANUP=()
cleanup() {
    local i
    for ((i = ${#CLEANUP[@]} - 1; i >= 0; i--)); do
        eval "${CLEANUP[$i]}" || true
    done
}
trap cleanup EXIT

# ---------------------------------------------------------------- device
if [ "$PLATFORM" = ios ]; then
    SIM_NAME="Xaman-e2e-$NAME"
    UDID="$(xcrun simctl list devices available | sed -n "s/^ *$SIM_NAME (\([0-9A-F-]*\)) .*/\1/p" | head -1)"
    if [ -z "$UDID" ]; then
        log "creating simulator $SIM_NAME ($DEVICE_TYPE)"
        UDID="$(xcrun simctl create "$SIM_NAME" "$DEVICE_TYPE" $RUNTIME)"
    fi
    log "booting $SIM_NAME ($UDID); a first boot takes minutes"
    xcrun simctl bootstatus "$UDID" -b >/dev/null
    # bootstatus returns before the home screen is up: wait until an app actually launches.
    for _ in $(seq 1 120); do
        if xcrun simctl launch "$UDID" com.apple.Preferences >/dev/null 2>&1; then
            xcrun simctl terminate "$UDID" com.apple.Preferences >/dev/null 2>&1 || true
            break
        fi
        sleep 5
    done
    [ "$KEEP_DEVICE" = yes ] || CLEANUP+=("xcrun simctl shutdown $UDID")
    export E2E_IOS_SIMULATOR="$SIM_NAME" E2E_CAMERA_IOS_SIMULATOR_NAME="$SIM_NAME"
    export DETOX_CONFIGURATION=ios.e2e+xaman.ios
else
    # An emulator this clone started earlier (--keep-device) is reused; any other one is refused.
    KEPT="$(cat .e2e-device 2>/dev/null || true)"
    if [ -n "$KEPT" ] && "$ADB" devices | grep -q "^$KEPT[[:space:]]*device" &&
        { [ -z "$PORT" ] || [ "$KEPT" = "emulator-$PORT" ]; }; then
        SERIAL="$KEPT"
        log "reusing this clone's emulator $SERIAL"
        [ "$KEEP_DEVICE" = yes ] || CLEANUP+=("'$ADB' -s $SERIAL emu kill >/dev/null 2>&1")
    else
        if [ -z "$PORT" ]; then
            for p in $(seq 5584 -2 5556); do
                if ! "$ADB" devices | grep -q "^emulator-$p[[:space:]]" && ! nc -z localhost "$p" 2>/dev/null; then
                    PORT=$p
                    break
                fi
            done
            [ -n "$PORT" ] || die "no free emulator port in 5556-5584"
        fi
        if [ "$PORT" -lt 5556 ] || [ "$PORT" -gt 5584 ] || [ $((PORT % 2)) -ne 0 ]; then
            die "--port must be even and within 5556-5584 (5554 is the developer emulator; adb ignores ports above 5584)"
        fi
        SERIAL="emulator-$PORT"
        "$ADB" devices | grep -q "^$SERIAL[[:space:]]" && die "$SERIAL is already running; it is not this run's device"
        if [ -z "$AVD" ]; then
            AVD="$("$EMULATOR" -list-avds | grep -v -x 'Xaman_API36' | head -1)"
        fi
        [ -n "$AVD" ] || die "no AVD to start; pass --avd or set E2E_AVD"
        log "starting $AVD read-only as $SERIAL (4 GB RAM, no window)"
        # Its own process group (set -m): QEMU handles SIGHUP itself, so nohup alone did not keep a
        # --keep-device emulator alive when the shell around this script (e.g. screen) closed.
        set -m
        nohup "$EMULATOR" -avd "$AVD" -port "$PORT" -memory 4096 -read-only -no-snapshot -no-window -no-audio \
            >"$ART/emulator.log" 2>&1 &
        EMULATOR_PID=$!
        set +m
        echo "$SERIAL" >.e2e-device
        [ "$KEEP_DEVICE" = yes ] || CLEANUP+=("'$ADB' -s $SERIAL emu kill >/dev/null 2>&1 || kill $EMULATOR_PID")
        for _ in $(seq 1 120); do
            [ "$("$ADB" -s "$SERIAL" shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')" = 1 ] && break
            kill -0 "$EMULATOR_PID" 2>/dev/null || die "the emulator exited; see $ART/emulator.log"
            sleep 5
        done
    fi
    [ "$("$ADB" -s "$SERIAL" shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')" = 1 ] ||
        die "$SERIAL did not boot in 10 minutes"
    export ANDROID_SERIAL="$SERIAL"
    if [ "$BUILD_TYPE" = release ]; then
        export DETOX_CONFIGURATION=android.e2e+xaman.android.arm64
    else
        export DETOX_CONFIGURATION=android.e2e+xaman.android.debug.arm64
        # The debug build has its Metro port baked in: a reused build keeps the port it was made with.
        METRO_PORT=""
        if [ "$SKIP_BUILD" = yes ] && [ -f .e2e-metro-port ]; then
            METRO_PORT="$(cat .e2e-metro-port)"
            nc -z localhost "$METRO_PORT" 2>/dev/null && die "Metro port $METRO_PORT of this build is in use"
        else
            for p in $(seq 8082 8099); do
                nc -z localhost "$p" 2>/dev/null || { METRO_PORT=$p; break; }
            done
            [ -n "$METRO_PORT" ] || die "no free Metro port in 8082-8099"
            echo "$METRO_PORT" >.e2e-metro-port
        fi
        log "starting Metro on $METRO_PORT from the clone"
        nohup node node_modules/react-native/cli.js start --port "$METRO_PORT" >"$ART/metro.log" 2>&1 &
        METRO_PID=$!
        CLEANUP+=("kill $METRO_PID")
    fi
fi

# ---------------------------------------------------------------- build
if [ "$SKIP_BUILD" = no ]; then
    log "building the $PLATFORM app$([ "$PLATFORM" = android ] && echo " ($BUILD_TYPE)"); log: $ART/build.log"
    if [ "$PLATFORM" = ios ]; then
        npx detox build -c "$DETOX_CONFIGURATION" >"$ART/build.log" 2>&1 || die "build failed; see $ART/build.log"
    else
        GRADLE_ARGS=(--no-daemon -PreactNativeArchitectures=arm64-v8a)
        if [ "$BUILD_TYPE" = release ]; then
            GRADLE_ARGS+=(app:assembleRelease app:assembleAndroidTest -DtestBuildType=release
                -x uploadCrashlyticsMappingFileRelease -x uploadCrashlyticsSymbolFileRelease)
        else
            GRADLE_ARGS+=(app:assembleDebug app:assembleAndroidTest -DtestBuildType=debug
                "-PreactNativeDevServerPort=$METRO_PORT")
        fi
        (cd android && ./gradlew "${GRADLE_ARGS[@]}") >"$ART/build.log" 2>&1 || die "build failed; see $ART/build.log"
    fi
fi
# ---------------------------------------------------------------- run
export DETOX_REINSTALL=yes
export E2E_ARTIFACTS_DIR="$ART"
export DETOX_CONTINUE_ON_FAIL="${DETOX_CONTINUE_ON_FAIL:-yes}"
log "running ${FEATURES[*]} on ${ANDROID_SERIAL:-$E2E_IOS_SIMULATOR} ($DETOX_CONFIGURATION); log: $ART/run.log"
set -m
npx cucumber-js "${FEATURES[@]}" \
    --require ./e2e/support --require ./e2e/step_definitions --require ./e2e/helpers \
    --format progress \
    --format "summary:$ART/summary.txt" \
    --format "json:$ART/cucumber.json" \
    --format "rerun:$ART/rerun.txt" >"$ART/run.log" 2>&1 &
RUN_PID=$!
set +m

# Watchdog: a run whose log stays silent for STALL_MINUTES is stuck; stop its whole process group.
last_size=-1
quiet=0
STATUS=0
while kill -0 "$RUN_PID" 2>/dev/null; do
    sleep 60
    size=$(wc -c <"$ART/run.log" | tr -d ' ')
    if [ "$size" = "$last_size" ]; then quiet=$((quiet + 1)); else quiet=0; fi
    last_size=$size
    if [ "$quiet" -ge "$STALL_MINUTES" ]; then
        log "no output for $STALL_MINUTES minutes: stopping the stuck run"
        kill -TERM -- "-$RUN_PID" 2>/dev/null || true
        sleep 15
        kill -KILL -- "-$RUN_PID" 2>/dev/null || true
        STATUS=124
        break
    fi
done
if [ "$STATUS" = 0 ]; then
    wait "$RUN_PID" || STATUS=$?
fi

tail -n 4 "$ART/run.log" || true
log "exit $STATUS; artifacts in $ART"
log "delete the clone when done: rm -rf '$CLONE'"
exit "$STATUS"
