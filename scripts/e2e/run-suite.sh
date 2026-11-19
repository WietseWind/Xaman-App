#!/bin/bash
# The e2e suite on iOS and on Android, one platform after the other, each on its own throwaway clone
# and device (scripts/e2e/run-throwaway.sh), in the one fixed way that gives the same result every time.
#
#   scripts/e2e/run-suite.sh [options] [-- cucumber paths]
#
#   --name NAME         name of this round (default: <date>-<time>); its runs are NAME-ios, NAME-android
#   --source DIR        checkout to test (default: this one); needs node_modules, and ios/Pods for iOS
#   --only ios|android  one platform
#   --rounds N          run it all N times (default 1), to show that the result repeats
#   --keep              keep the clones and the simulator for a look (default: deleted, the results stay)
#
# iOS: Release on a new simulator: E2E_IOS_DEVICE_TYPE (default "iPhone 17 Pro"), E2E_IOS_RUNTIME
#      (e.g. com.apple.CoreSimulator.SimRuntime.iOS-26-5; default: the newest installed).
# Android: Release with its release test APK on a read-only emulator: E2E_AVD.
#
# Results: $E2E_WORK/results/<run>/ per run (outcome.txt, logs, notes, evidence of failures) and
# $E2E_WORK/results/NAME/outcome.txt for the round. Exit code 0 only when every run passed; the round's
# outcome also says when a run needed a second attempt or a rerun.

set -eo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
SOURCE="$ROOT"
NAME="$(date +%Y%m%d-%H%M%S)"
ONLY=""
ROUNDS=1
KEEP=no
FEATURES=()

usage() { awk 'NR > 1 && /^#/ { sub(/^# ?/, ""); print; next } NR > 1 { exit }' "$0"; exit "${1:-0}"; }

while [ $# -gt 0 ]; do
    case "$1" in
        --name) NAME="$2"; shift 2 ;;
        --source) SOURCE="$(cd "$2" && pwd)"; shift 2 ;;
        --only) ONLY="$2"; shift 2 ;;
        --rounds) ROUNDS="$2"; shift 2 ;;
        --keep) KEEP=yes; shift ;;
        --) shift; FEATURES=("$@"); break ;;
        -h | --help) usage 0 ;;
        *) echo "unknown option: $1" >&2; usage 2 ;;
    esac
done
case "$ONLY" in "" | ios | android) ;; *) echo "--only takes ios or android" >&2; exit 2 ;; esac
case "$ROUNDS" in "" | *[!0-9]* | 0) echo "--rounds takes a number from 1" >&2; exit 2 ;; esac

WORK="${E2E_WORK:-$HOME/Code/e2e-runs}"
OUT="$WORK/results/$NAME"
mkdir -p "$OUT"
: >"$OUT/outcome.txt"

log() { echo "[e2e-suite $(date +%H:%M:%S)] $*"; }

PLATFORMS=(ios android)
[ -n "$ONLY" ] && PLATFORMS=("$ONLY")

WORST=0
HELPED=no
for round in $(seq 1 "$ROUNDS"); do
    for platform in "${PLATFORMS[@]}"; do
        run="$NAME-$platform"
        [ "$ROUNDS" -gt 1 ] && run="$NAME-r$round-$platform"
        args=("$platform" --name "$run" --source "$SOURCE")
        [ "$KEEP" = yes ] || args+=(--cleanup)
        if [ "$platform" = ios ]; then
            [ -n "${E2E_IOS_DEVICE_TYPE:-}" ] && args+=(--device-type "$E2E_IOS_DEVICE_TYPE")
            [ -n "${E2E_IOS_RUNTIME:-}" ] && args+=(--runtime "$E2E_IOS_RUNTIME")
        else
            args+=(--release)
        fi
        [ ${#FEATURES[@]} -gt 0 ] && args+=(-- "${FEATURES[@]}")

        log "starting $run; log: $OUT/$run.log"
        status=0
        "$ROOT/scripts/e2e/run-throwaway.sh" "${args[@]}" >"$OUT/$run.log" 2>&1 </dev/null || status=$?

        result="$({ sed -n 's/^result: //p' "$WORK/results/$run/outcome.txt" 2>/dev/null || true; } | head -1)"
        [ -n "$result" ] || result="no outcome (exit $status): see $OUT/$run.log"
        log "$run: $result"
        {
            echo "== $run: $result"
            if [ -f "$WORK/results/$run/outcome.txt" ]; then
                sed -n '2,$p' "$WORK/results/$run/outcome.txt" | sed 's/^/   /'
            fi
            echo
        } >>"$OUT/outcome.txt"
        if [ "$status" != 0 ]; then WORST=1; fi
        if [ "$result" != passed ]; then HELPED=yes; fi
    done
done

if [ "$WORST" != 0 ]; then
    ROUND_RESULT=failed
elif [ "$HELPED" = yes ]; then
    ROUND_RESULT="passed, but not every run passed at the first go (see below)"
else
    ROUND_RESULT=passed
fi
{
    echo "result: $ROUND_RESULT"
    echo "round: $NAME, $ROUNDS time(s), ${PLATFORMS[*]}, source $SOURCE"
    echo
    cat "$OUT/outcome.txt"
} >"$OUT/outcome.tmp"
mv "$OUT/outcome.tmp" "$OUT/outcome.txt"

echo
cat "$OUT/outcome.txt"
exit "$WORST"
