#!/bin/bash
# Runs the Detox + Cucumber e2e suite on a throwaway APFS clone of a checkout, on a simulator or
# emulator made for this run only. Nothing else is touched: not the developer's simulators or
# emulators (emulator-5554 / AVD Xaman_API36), not a USB phone, not the checkout itself.
#
#   scripts/e2e/run-throwaway.sh ios|android [options] [-- cucumber paths]
#
#   --name NAME         run name; the clone is $E2E_WORK/clones.noindex/xaman-e2e-NAME
#                       (default: <platform>-<date>-<time>)
#   --source DIR        checkout to clone (default: this one); needs node_modules, and ios/Pods for iOS
#   --release|--debug   Android build type (default: release; debug starts its own Metro)
#   --port N            Android emulator console port: even, 5556-5584 (default: the first free one)
#   --avd NAME          Android AVD to start read-only (default: $E2E_AVD, else the first AVD that is
#                       not Xaman_API36)
#   --device-type TYPE  iOS simulator type for the new simulator (default: "iPhone 17 Pro")
#   --runtime ID        iOS runtime for it, e.g. com.apple.CoreSimulator.SimRuntime.iOS-26-5 (default: newest)
#   --skip-build        reuse the build already in the clone (use with --name of an earlier run)
#   --keep-device       leave the simulator or emulator running afterwards
#   --cleanup           afterwards delete the clone and, on iOS, the simulator (the results are kept, see below)
#
# Paths after -- go to cucumber-js (default: ./e2e). The run stops with exit code 124 when its log
# stays silent for E2E_STALL_MINUTES (default 20). Results land in <clone>/.e2e-artifacts; what is
# worth keeping (outcome, logs, notes, evidence of failures) is copied to $E2E_WORK/results/NAME.
#
# A failed scenario gets a second attempt at once (E2E_RETRY, default 1; the app is restarted first).
# When a scenario still failed, the story is run once more from its first feature on a clean app, up to
# the last feature with a failure (E2E_RERUN_FAILED=no: never; E2E_RERUN_MAX=N: only when at most N
# scenarios failed). The suite is one story, so one failure usually takes the scenarios that build on
# it with it: the rerun shows whether the story holds from start to end.
# outcome.txt says which it was: passed / passed, with scenarios that needed a second attempt /
# passed on the rerun / failed. Exit code 0 for the first three: read the outcome, not only the code.
#
# One run at a time: a second run on the same machine waits until the first has ended, because two
# runs next to each other make both slow and their timing different (E2E_PARALLEL=yes: do not wait).

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
CLEAN_UP=no
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
        --cleanup) CLEAN_UP=yes; shift ;;
        --) shift; FEATURES=("$@"); break ;;
        -h | --help) usage 0 ;;
        *) echo "unknown option: $1" >&2; usage 2 ;;
    esac
done
[ ${#FEATURES[@]} -eq 0 ] && FEATURES=(./e2e)

WORK="${E2E_WORK:-$HOME/Code/e2e-runs}"
# Clones live in a folder Spotlight skips (a name ending in .noindex) and Time Machine leaves out. A
# clone is some 600,000 files: indexing each new one kept the machine at twice its core count in load
# for the whole run, which changes the timing of everything in it.
CLONES="$WORK/clones.noindex"
CLONE="$CLONES/xaman-e2e-$NAME"
# a clone of before this layout is still found (--skip-build)
[ -d "$WORK/xaman-e2e-$NAME" ] && CLONE="$WORK/xaman-e2e-$NAME"
ART="$CLONE/.e2e-artifacts"
STALL_MINUTES="${E2E_STALL_MINUTES:-20}"

log() { echo "[e2e-throwaway $(date +%H:%M:%S)] $*"; }
die() { echo "[e2e-throwaway] ERROR: $*" >&2; exit 1; }

SDK="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-$HOME/Library/Android/sdk}}"
ADB="$SDK/platform-tools/adb"
EMULATOR="$SDK/emulator/emulator"

# The run that starts an emulator tags it with its name (a debug property that is gone once the
# emulator stops), so an emulator that another run started on a reused port is never taken as ours.
owner_of() { "$ADB" -s "$1" shell getprop debug.xaman.e2e.owner 2>/dev/null | tr -d '\r'; }

# ---------------------------------------------------------------- checks (before anything is made)
if [ "$PLATFORM" = android ]; then
    [ -x "$ADB" ] && [ -x "$EMULATOR" ] || die "Android SDK not found at $SDK"
    if [ -n "$PORT" ]; then
        case "$PORT" in *[!0-9]*) die "--port must be a number" ;; esac
        if [ "$PORT" -lt 5556 ] || [ "$PORT" -gt 5584 ] || [ $((PORT % 2)) -ne 0 ]; then
            die "--port must be even and within 5556-5584 (5554 is the developer emulator; adb ignores ports above 5584)"
        fi
        if "$ADB" devices | grep -q "^emulator-$PORT[[:space:]]" && [ "$(owner_of "emulator-$PORT")" != "$NAME" ]; then
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
    # The source's node_modules must match its commit: package.json, every patch applied and, for iOS,
    # the Pods and React Native's codegen output (npm ci deletes it; the build otherwise fails minutes
    # in, at "[RN]Check rncore"). The check prints what differs and what to run.
    if [ "$PLATFORM" = ios ]; then deps_scope=--ios; else deps_scope=--no-ios; fi
    "$ROOT/scripts/check-native-deps.sh" "$deps_scope" "$SOURCE" || die "$SOURCE: the installed packages do not match its commit (see above)"
    if [ ! -d "$CLONES" ]; then
        mkdir -p "$CLONES"
        tmutil addexclusion "$CLONES" >/dev/null 2>&1 || true
    fi
    log "cloning $SOURCE -> $CLONE (APFS clone, copy-on-write)"
    cp -Rc "$SOURCE" "$CLONE"
    SKIP_BUILD=no
fi
cd "$CLONE"
# A throwaway build is debug-signed (CI=1) and never holds the release key.
find android/app -maxdepth 1 -name '*.keystore' ! -name 'debug.keystore' -exec rm -f {} +
# Swift's module cache keeps absolute paths: one copied from another checkout fails the build
# ("was compiled with module cache path ..."). Xcode rebuilds it.
rm -rf ios/build/ModuleCache.noindex
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

# ---------------------------------------------------------------- one run at a time
LOCK="$WORK/.e2e-run.lock"
if [ "${E2E_PARALLEL:-no}" != yes ]; then
    told=no
    while ! mkdir "$LOCK" 2>/dev/null; do
        owner="$(cat "$LOCK/pid" 2>/dev/null || true)"
        if [ -n "$owner" ] && ! kill -0 "$owner" 2>/dev/null; then
            # the run that held it is gone (killed, or the machine restarted)
            rm -rf "$LOCK"
            continue
        fi
        if [ "$told" = no ]; then
            log "another e2e run is going ($(cat "$LOCK/name" 2>/dev/null || echo unknown), pid ${owner:-unknown}): waiting for it to end"
            told=yes
        fi
        sleep 20
    done
    echo $$ >"$LOCK/pid"
    echo "$NAME" >"$LOCK/name"
    CLEANUP+=("rm -rf '$LOCK'")
fi
machine_load() { uptime | sed 's/.*load averages*: *//'; }
LOAD_START="$(machine_load)"
OTHER_BUILDS="$({ pgrep -f 'xcodebuild|GradleDaemon|GradleWrapperMain' 2>/dev/null || true; } | wc -l | tr -d ' ')"

# ---------------------------------------------------------------- device
boot_simulator() {
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
}

if [ "$PLATFORM" = ios ]; then
    SIM_NAME="Xaman-e2e-$NAME"
    UDID="$(xcrun simctl list devices available | sed -n "s/^ *$SIM_NAME (\([0-9A-F-]*\)) .*/\1/p" | head -1)"
    if [ -z "$UDID" ]; then
        log "creating simulator $SIM_NAME ($DEVICE_TYPE)"
        UDID="$(xcrun simctl create "$SIM_NAME" "$DEVICE_TYPE" $RUNTIME)"
    elif [ "$(printf '%s' "${DETOX_REUSE:-no}" | tr '[:upper:]' '[:lower:]')" != yes ]; then
        # A simulator of an earlier run keeps its keychain (the app's keys outlive a reinstall): a run
        # that installs the app fresh has to start on an empty one, or it starts in another state.
        log "erasing simulator $SIM_NAME of an earlier run"
        xcrun simctl shutdown "$UDID" >/dev/null 2>&1 || true
        xcrun simctl erase "$UDID"
    fi
    boot_simulator
    [ "$KEEP_DEVICE" = yes ] || CLEANUP+=("xcrun simctl shutdown $UDID")
    export E2E_IOS_SIMULATOR="$SIM_NAME" E2E_CAMERA_IOS_SIMULATOR_NAME="$SIM_NAME"
    export DETOX_CONFIGURATION=ios.e2e+xaman.ios
else
    # An emulator this run started earlier (--keep-device) is reused; any other one is refused.
    KEPT="$(cat .e2e-device 2>/dev/null || true)"
    if [ -n "$KEPT" ] && "$ADB" devices | grep -q "^$KEPT[[:space:]]*device" && [ "$(owner_of "$KEPT")" = "$NAME" ] &&
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
    # boot_completed comes before external storage is there, and the UI dumps of a release build can
    # only be read from the app's external files directory: a run started too early died in BeforeAll.
    for _ in $(seq 1 60); do
        "$ADB" -s "$SERIAL" shell 'ls -d /sdcard/Android/data' </dev/null >/dev/null 2>&1 && break
        sleep 2
    done
    "$ADB" -s "$SERIAL" shell setprop debug.xaman.e2e.owner "$NAME"
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
export DETOX_CONTINUE_ON_FAIL="${DETOX_CONTINUE_ON_FAIL:-yes}"
RETRY="${E2E_RETRY:-1}"
RERUN_FAILED="${E2E_RERUN_FAILED:-yes}"
RERUN_MAX="${E2E_RERUN_MAX:-0}" # 0: no limit

# The run starts on a quiet machine. A simulator that just booted for the first time (new or erased)
# keeps the whole machine busy for minutes (no idle CPU at all, a load of 150 on 10 cores): the app is
# then several times slower and a passcode save that takes 2 seconds did not finish in 15. The same
# goes for the last work of a build, or for anything else that happens to run. So: wait until the CPU
# is mostly idle for half a minute, at most E2E_QUIET_MAX_SECONDS (default 600).
cpu_idle() { top -l 2 -n 0 -s 1 2>/dev/null | awk '/CPU usage/ { v = $7 } END { sub("%", "", v); printf "%d\n", v }'; }
QUIET_NOTE=""
wait_until_quiet() {
    local need="${E2E_QUIET_IDLE:-60}" max="${E2E_QUIET_MAX_SECONDS:-600}" quiet=0 idle=0
    local started=$SECONDS
    while [ $((SECONDS - started)) -lt "$max" ]; do
        idle="$(cpu_idle)"
        if [ "${idle:-0}" -ge "$need" ]; then quiet=$((quiet + 1)); else quiet=0; fi
        if [ "$quiet" -ge 6 ]; then break; fi
        sleep 4
    done
    if [ "$quiet" -ge 6 ]; then
        QUIET_NOTE="the machine was quiet after $((SECONDS - started)) s (CPU ${idle}% idle)"
    else
        QUIET_NOTE="the machine did NOT get quiet in $max s (CPU ${idle}% idle): the timing of this run may differ"
    fi
    log "$QUIET_NOTE"
}

# Runs cucumber on the given features with its results in the given directory; sets STATUS.
# A run whose log stays silent for STALL_MINUTES is stuck: its whole process group is stopped (124).
run_cucumber() {
    local art="$1"
    shift
    mkdir -p "$art"
    export E2E_ARTIFACTS_DIR="$art"
    # nothing of an earlier run in a reused clone may end up in this run's results
    rm -f "$art/text-entry-fallbacks.txt" "$art/tap-checks.txt" "$art/tap-effects.tsv" "$art/outcome.txt"
    rm -rf "$art/failures" "$art/steps" "$art/rerun"
    wait_until_quiet
    echo "$QUIET_NOTE" >"$art/quiet.txt"
    log "running $* on ${ANDROID_SERIAL:-$E2E_IOS_SIMULATOR} ($DETOX_CONFIGURATION); log: $art/run.log"
    set -m
    npx cucumber-js "$@" \
        --require ./e2e/support --require ./e2e/step_definitions --require ./e2e/helpers \
        --retry "$RETRY" \
        --format progress \
        --format "summary:$art/summary.txt" \
        --format "json:$art/cucumber.json" \
        --format "rerun:$art/rerun.txt" >"$art/run.log" 2>&1 &
    RUN_PID=$!
    set +m

    local last_size=-1 quiet=0 size
    STATUS=0
    while kill -0 "$RUN_PID" 2>/dev/null; do
        sleep 60
        size=$(wc -c <"$art/run.log" | tr -d ' ')
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
    tail -n 4 "$art/run.log" || true
    # Android: text that only arrived by a second route (see e2e/helpers/androidTextEntry.js)
    if [ -s "$art/text-entry-fallbacks.txt" ]; then
        log "text entry needed a second route $(grep -c 'nothing arrived' "$art/text-entry-fallbacks.txt" | tr -d ' ') time(s): $art/text-entry-fallbacks.txt"
    fi
    # Android: taps that did not arrive and were sent a second time (see e2e/helpers/androidTapCheck.js)
    if [ -s "$art/tap-checks.txt" ]; then
        log "taps sent a second time: $(grep -c ': tapped again' "$art/tap-checks.txt" | tr -d ' '); see $art/tap-checks.txt"
    fi
}

# Scenarios that failed an attempt and passed a later one, one per line ("name # file:line").
flaky_scenarios() {
    [ -f "$1/summary.txt" ] || return 0
    sed -n 's/^[0-9]*) Scenario: \(.*\) (attempt [0-9]*, retried) \(# .*\)$/\1 \2/p' "$1/summary.txt" | sort -u |
        while IFS= read -r line; do
            where="${line##*# }"
            # still failing after its last attempt: a failure, not a flaky scenario
            grep -q "^${where%%:*}:.*\b${where##*:}\b" "$1/rerun.txt" 2>/dev/null || echo "$line"
        done
}

# The scenarios that failed their last attempt, as cucumber's rerun file names them (file:line[:line]).
failed_count() {
    [ -s "$1/rerun.txt" ] || { echo 0; return; }
    { grep -o ':[0-9][0-9]*' "$1/rerun.txt" || true; } | wc -l | tr -d ' '
}

# The feature files of this run, in order, up to and including the last one with a failed scenario.
# The suite is one story: a feature needs the state the features before it left behind.
story_until_last_failure() {
    local entry file last=""
    local files=()
    for entry in "${FEATURES[@]}"; do
        entry="${entry#./}"
        if [ -d "$entry" ]; then
            while IFS= read -r file; do files+=("$file"); done < <(ls "$entry"/*.feature | sort)
        else
            files+=("${entry%%:*}")
        fi
    done
    for file in "${files[@]}"; do
        if grep -q "^$file:" "$1/rerun.txt"; then last="$file"; fi
    done
    [ -n "$last" ] || return 0
    for file in "${files[@]}"; do
        echo "$file"
        if [ "$file" = "$last" ]; then break; fi
    done
}

run_cucumber "$ART" "${FEATURES[@]}"
FIRST_STATUS=$STATUS
FLAKY="$(flaky_scenarios "$ART")"
FAILED=$(failed_count "$ART")
RESULT=passed
if [ -n "$FLAKY" ]; then RESULT="passed, with scenarios that needed a second attempt"; fi
if [ "$STATUS" != 0 ]; then RESULT=failed; fi

# Scenarios failed every attempt: run the story again from its start on a clean app, once. A stuck
# run (124) is not run again.
if [ "$STATUS" != 0 ] && [ "$STATUS" != 124 ] && [ "$RERUN_FAILED" != no ] && [ "$FAILED" -ge 1 ] &&
    { [ "$RERUN_MAX" = 0 ] || [ "$FAILED" -le "$RERUN_MAX" ]; }; then
    STORY=()
    while IFS= read -r file; do STORY+=("$file"); done < <(story_until_last_failure "$ART")
    if [ ${#STORY[@]} -gt 0 ]; then
        log "$FAILED scenario(s) failed: running the story again on a clean app (${#STORY[@]} feature file(s))"
        if [ "$PLATFORM" = ios ]; then
            # the keychain outlives the app on a simulator: erase it
            xcrun simctl shutdown "$UDID" >/dev/null 2>&1 || true
            xcrun simctl erase "$UDID"
            boot_simulator
        fi
        export E2E_RERUN=1
        run_cucumber "$ART/rerun" "${STORY[@]}"
        if [ "$STATUS" = 0 ]; then
            RESULT="passed on the rerun (failed in the first run)"
        else
            RESULT="failed (also in the rerun)"
        fi
    fi
fi

{
    echo "result: $RESULT"
    echo "run: $NAME, $PLATFORM$([ "$PLATFORM" = android ] && echo " $BUILD_TYPE"), ${FEATURES[*]}"
    echo "code: $(git rev-parse --short HEAD 2>/dev/null || echo unknown)$([ -n "$(git status --porcelain --untracked-files=no 2>/dev/null | head -1)" ] && echo " + uncommitted changes")"
    if [ "$PLATFORM" = ios ]; then
        echo "device: $DEVICE_TYPE, $(xcrun simctl list devices | grep -B 30 "$UDID" | grep '^-- ' | tail -1 | tr -d '-' | xargs), $(xcodebuild -version 2>/dev/null | tr '\n' ' ')"
    else
        echo "device: AVD ${AVD:-kept emulator}, Android $("$ADB" -s "$SERIAL" shell getprop ro.build.version.release 2>/dev/null | tr -d '\r') (API $("$ADB" -s "$SERIAL" shell getprop ro.build.version.sdk 2>/dev/null | tr -d '\r'))"
    fi
    echo "node: $(node --version 2>/dev/null)"
    echo "machine load (1, 5, 15 min) at the start: $LOAD_START; at the end: $(machine_load); other builds running at the start: $OTHER_BUILDS"
    echo "before the first run: $(cat "$ART/quiet.txt" 2>/dev/null)"
    if [ -f "$ART/rerun/quiet.txt" ]; then echo "before the rerun: $(cat "$ART/rerun/quiet.txt")"; fi
    echo "first run: exit $FIRST_STATUS, $(grep -E '^[0-9]+ scenarios' "$ART/summary.txt" 2>/dev/null | tail -1)"
    if [ -n "$FLAKY" ]; then
        echo
        echo "needed a second attempt in the first run (failed once, then passed):"
        echo "$FLAKY" | sed 's/^/  /'
    fi
    if [ "$FAILED" -gt 0 ]; then
        echo
        echo "failed every attempt in the first run:"
        sed 's/^/  /' "$ART/rerun.txt"
        echo
    fi
    if [ -f "$ART/rerun/summary.txt" ]; then
        echo "rerun: exit $STATUS, $(grep -E '^[0-9]+ scenarios' "$ART/rerun/summary.txt" | tail -1)"
        RERUN_FLAKY="$(flaky_scenarios "$ART/rerun")"
        if [ -n "$RERUN_FLAKY" ]; then
            echo "needed a second attempt in the rerun:"
            echo "$RERUN_FLAKY" | sed 's/^/  /'
        fi
        if [ -s "$ART/rerun/rerun.txt" ]; then
            echo "failed every attempt in the rerun:"
            sed 's/^/  /' "$ART/rerun/rerun.txt"
            echo
        fi
    fi
    for notes in "$ART/tap-checks.txt" "$ART/rerun/tap-checks.txt" "$ART/text-entry-fallbacks.txt" "$ART/rerun/text-entry-fallbacks.txt"; do
        if [ -s "$notes" ]; then echo "notes: ${notes#"$ART/"} ($(wc -l <"$notes" | tr -d ' ') line(s))"; fi
    done
    if [ -d "$ART/failures" ]; then echo "evidence of failed attempts: failures/"; fi
    if [ -d "$ART/rerun/failures" ]; then echo "evidence of failed attempts in the rerun: rerun/failures/"; fi
} >"$ART/outcome.txt"

# What is worth keeping goes out of the clone, so deleting the clone does not delete the evidence.
KEEP="$WORK/results/$NAME"
[ -n "$NAME" ] && rm -rf "$KEEP"
mkdir -p "$KEEP"
for part in "" rerun/; do
    [ -d "$ART/$part" ] || continue
    mkdir -p "$KEEP/$part"
    for file in outcome.txt summary.txt run.log rerun.txt tap-checks.txt tap-effects.tsv text-entry-fallbacks.txt; do
        if [ -f "$ART/$part$file" ]; then cp "$ART/$part$file" "$KEEP/$part"; fi
    done
    if [ -d "$ART/${part}failures" ]; then cp -R "$ART/${part}failures" "$KEEP/$part"; fi
done

echo
cat "$ART/outcome.txt"
log "exit $STATUS; results kept in $KEEP"
if [ "$CLEAN_UP" = yes ]; then
    cd "$WORK"
    cleanup
    CLEANUP=()
    if [ "$PLATFORM" = ios ]; then xcrun simctl delete "$UDID" >/dev/null 2>&1 || true; fi
    rm -rf "$CLONE"
    log "the clone$([ "$PLATFORM" = ios ] && echo " and the simulator") of this run are deleted"
else
    log "all artifacts in $ART; delete the clone when done: rm -rf '$CLONE'"
fi
exit "$STATUS"
