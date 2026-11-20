#!/bin/bash
# Two phones sign for one transaction (e2e/18_two_phones.feature): one run of the suite on each phone,
# one after the other, with a state file that the runs share (the accounts of the run, the transactions,
# and what the first phone signed).
#
#   scripts/e2e/two-phones.sh --name NAME --first "<runner arguments>" --second "<runner arguments>"
#
#   --first, --second   the arguments of scripts/e2e/run-throwaway.sh for that phone, as one string,
#                       without --name and without features, for example
#                         --first  "android --release --usb R58NA2ZV7TK"
#                         --second "ios --device 00008101-… --app /path/Xaman.ipa"
#                       An emulator or a simulator works too ("android --release", "ios").
#   --name NAME         the run names are NAME-first and NAME-second (default: two-phones-<date>-<time>)
#   --only second       only the second phone, with the state file that an earlier call with the same
#                       --name left behind (see below): the first phone does not have to sign again
#
# What the runner says about a phone holds here too: Xaman on it is REPLACED by the test build and its data
# is deleted. Each phone runs the set-up, makes one account, and then its half of the feature.
#
# The state file has the seeds of throwaway testnet accounts. It is in $E2E_WORK (outside the checkout) and
# readable by this user only. It is deleted when both phones are done. When a phone failed it stays, so
# the second phone can be run again with --only second; delete it by hand when it is not needed any more.
# The sign requests need the API key file of the suite (see e2e/helpers/signRequests.js).

set -eo pipefail

usage() { awk 'NR > 1 && /^#/ { sub(/^# ?/, ""); print; next } NR > 1 { exit }' "$0"; exit "${1:-0}"; }

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
NAME="two-phones-$(date +%Y%m%d-%H%M%S)"
FIRST=""
SECOND=""
ONLY=""
while [ $# -gt 0 ]; do
    case "$1" in
        --name) NAME="$2"; shift 2 ;;
        --first) FIRST="$2"; shift 2 ;;
        --second) SECOND="$2"; shift 2 ;;
        --only) ONLY="$2"; shift 2 ;;
        -h | --help) usage 0 ;;
        *) usage 2 ;;
    esac
done
[ -n "$SECOND" ] || usage 2
[ -n "$FIRST" ] || [ "$ONLY" = second ] || usage 2
[ -z "$ONLY" ] || [ "$ONLY" = second ] || usage 2

E2E_WORK="${E2E_WORK:-$HOME/Code/e2e-runs}"
export E2E_WORK
mkdir -p "$E2E_WORK"
umask 077
E2E_TWO_PHONES_STATE="$E2E_WORK/$NAME.state.json"
export E2E_TWO_PHONES_STATE
if [ "$ONLY" = second ]; then
    [ -s "$E2E_TWO_PHONES_STATE" ] || { echo "no state file $E2E_TWO_PHONES_STATE: run both phones" >&2; exit 2; }
else
    rm -f "$E2E_TWO_PHONES_STATE"
fi
DONE=no
finish() {
    if [ "$DONE" = yes ]; then
        rm -f "$E2E_TWO_PHONES_STATE"
    elif [ -e "$E2E_TWO_PHONES_STATE" ]; then
        echo "[two-phones $(date +%T)] not done: the state file stays for --only second: $E2E_TWO_PHONES_STATE" >&2
    fi
}
trap finish EXIT

# the set-up of the app, one account (lines of the scenarios: generate, Xahau Testnet, activate), then the
# two phone feature; a failed half is not run again from the start (the other phone depends on its state)
FEATURES=(e2e/01_setup.feature e2e/02_generate_account.feature:2:36:41 e2e/18_two_phones.feature)
export E2E_RERUN_FAILED=no

run() { # run <first|second> <runner arguments as one string>
    local which="$1" arguments
    read -r -a arguments <<< "$2"
    echo "[two-phones $(date +%T)] the $which phone: ${arguments[*]}"
    E2E_TWO_PHONES="$which" "$ROOT/scripts/e2e/run-throwaway.sh" "${arguments[@]}" --name "$NAME-$which" \
        -- "${FEATURES[@]}"
}

[ "$ONLY" = second ] || run first "$FIRST"
run second "$SECOND"
DONE=yes
echo "[two-phones $(date +%T)] both phones are done; results in $E2E_WORK/results/$NAME-first and $NAME-second"
