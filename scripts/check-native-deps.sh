#!/usr/bin/env bash
# Checks that the installed packages of a checkout match its commit, the way every build needs them:
#   - node_modules matches package.json (npm ls),
#   - every patch in patches/ is applied. patch-package only runs on npm ci / npm install, so a checkout keeps the
#     patches of its last install: a later commit that changes a patch is not in node_modules until the next install,
#   - iOS (when ios/Pods exists, or with --ios): the Pods match ios/Podfile.lock, and React Native's codegen output
#     exists. npm ci deletes that output; only pod install makes it again.
# Exits 1, listing what does not match and what to run, when anything is off.
#
#   scripts/check-native-deps.sh [--ios | --no-ios] [--patches-only] [--quiet] [CHECKOUT]
#
# CHECKOUT defaults to the checkout this script is in. Used by scripts/post-install.sh, the git hooks in
# scripts/git-hooks, scripts/e2e/run-throwaway.sh and the store builds.

IOS=auto
PATCHES_ONLY=no
QUIET=no
ROOT=""
while [ $# -gt 0 ]; do
    case "$1" in
        --ios) IOS=yes ;;
        --no-ios) IOS=no ;;
        --patches-only) PATCHES_ONLY=yes ;;
        --quiet) QUIET=yes ;;
        -h | --help) awk 'NR > 1 && /^#/ { sub(/^# ?/, ""); print; next } NR > 1 { exit }' "$0"; exit 0 ;;
        -*) echo "unknown option: $1" >&2; exit 2 ;;
        *) ROOT="$1" ;;
    esac
    shift
done
[ -n "$ROOT" ] || ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT" || exit 2

problems=()

if [ ! -d node_modules ]; then
    problems+=("there is no node_modules")
else
    if [ "$PATCHES_ONLY" = no ] && command -v npm >/dev/null 2>&1; then
        if ! npm ls --depth=0 >/dev/null 2>&1; then
            problems+=("node_modules does not match package.json (npm ls --depth=0 lists what differs)")
        fi
    fi
    for patch in patches/*.patch; do
        [ -f "$patch" ] || continue
        if ! git apply --check --reverse "$patch" >/dev/null 2>&1; then
            problems+=("$patch is not applied in node_modules")
        fi
    done
fi

if [ "$PATCHES_ONLY" = no ] && { [ "$IOS" = yes ] || { [ "$IOS" = auto ] && [ -d ios/Pods ]; }; }; then
    if [ ! -f ios/Pods/Manifest.lock ] || ! cmp -s ios/Podfile.lock ios/Pods/Manifest.lock; then
        problems+=("iOS: the Pods do not match ios/Podfile.lock")
    fi
    if [ ! -f node_modules/react-native/ReactCommon/react/renderer/components/rncore/ComponentDescriptors.h ]; then
        problems+=("iOS: React Native's codegen output is missing (npm ci deletes it)")
    fi
fi

if [ ${#problems[@]} -eq 0 ]; then
    [ "$QUIET" = yes ] || echo "[✓] node_modules matches this checkout ($(ls patches/*.patch 2>/dev/null | wc -l | tr -d ' ') patches applied)"
    exit 0
fi

RED='\033[1;31m'
NC='\033[0m'
{
    echo -e "${RED}[!] The installed packages do not match this checkout ($ROOT):${NC}"
    for p in "${problems[@]}"; do
        echo "      - $p"
    done
    echo "    Builds, Metro and e2e runs would use the wrong code. Run:"
    echo "      npm ci && (cd ios && pod install)"
} >&2
exit 1
