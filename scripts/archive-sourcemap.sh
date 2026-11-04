#!/usr/bin/env bash
# Archive the JS source map of a release build outside the repo, one folder per build.
# Nothing is ever overwritten, so the map of every build that ships stays available to
# symbolicate Crashlytics JS stacks (scripts/symbolicate-crash.js, docs/crash-reporting.md).
# Called by the Xcode bundle phase (Release) and after createBundleReleaseJsAndAssets (Android).
#
#   scripts/archive-sourcemap.sh <ios|android> <version> <build> <source map>
#
# Archive: ${XAMAN_SOURCEMAPS_DIR:-~/xaman-sourcemaps}/<platform>/<version>-<build>/<UTC time>-<commit>[-dirty]/
#   main.jsbundle.map.gz | index.android.bundle.map.gz   the source map, gzipped
#   build-info.json   platform, version, build, commit, dirty, time, host
# Exits non-zero (failing the build) when the map is missing or can't be stored.
set -euo pipefail

if [ $# -ne 4 ]; then
    echo "usage: $0 <ios|android> <version> <build> <source map>" >&2
    exit 2
fi

platform=$1
version=$2
build=$3
map=$4

case "$platform" in
    ios) archived_name=main.jsbundle.map.gz ;;
    android) archived_name=index.android.bundle.map.gz ;;
    *)
        echo "error: unknown platform: $platform" >&2
        exit 2
        ;;
esac

if [ ! -s "$map" ]; then
    echo "error: JS source map missing or empty: $map" >&2
    exit 1
fi

base=${XAMAN_SOURCEMAPS_DIR:-$HOME/xaman-sourcemaps}
repo=$(cd "$(dirname "$0")/.." && pwd)
commit=$(git -C "$repo" rev-parse HEAD 2>/dev/null || echo unknown)
dirty=false
if [ "$commit" != unknown ] && [ -n "$(git -C "$repo" status --porcelain 2>/dev/null)" ]; then
    dirty=true
fi

name="$(date -u +%Y%m%d-%H%M%S)-${commit:0:10}"
if [ "$dirty" = true ]; then
    name="$name-dirty"
fi

parent="$base/$platform/$version-$build"
mkdir -p "$parent"

# a new folder for every build, also for a rebuild in the same second
dir="$parent/$name"
n=1
while ! mkdir "$dir" 2>/dev/null; do
    if [ ! -d "$dir" ]; then
        echo "error: cannot create $dir" >&2
        exit 1
    fi
    n=$((n + 1))
    dir="$parent/$name-$n"
done

archived="$dir/$archived_name"
gzip -9 -c "$map" >"$archived"
cat >"$dir/build-info.json" <<EOF
{
  "platform": "$platform",
  "version": "$version",
  "build": "$build",
  "commit": "$commit",
  "dirty": $dirty,
  "createdAt": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "host": "$(hostname -s 2>/dev/null || echo unknown)"
}
EOF

echo "JS source map archived: $archived"
