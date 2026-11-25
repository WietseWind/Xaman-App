#!/usr/bin/env bash

set -e

CURRENT_DIR=$(pwd)

# Android
# get the current version code value from android/app/build.gradle
android_gradle_file="${CURRENT_DIR}"/android/app/build.gradle
ios_project_path="${CURRENT_DIR}"/ios

regex="canonicalVersionCode = ([0-9]+)"
[[ $(cat "$android_gradle_file") =~ $regex ]]
android_version_code=${BASH_REMATCH[1]}

# iOS
iOS_build_number=$(xcodebuild -project "$ios_project_path"/Xaman.xcodeproj -scheme Xaman clean -showBuildSettings | grep CURRENT_PROJECT_VERSION | tr -d 'CURRENT_PROJECT_VERSION = ')

# increase build number and version code and apply changes
(( android_version_code++ )) || true
(( iOS_build_number++ )) || true

# xcode
cd $ios_project_path
/usr/bin/xcrun agvtool new-version -all "$iOS_build_number"

cd $CURRENT_DIR

# gradle
sed -i "" "s/canonicalVersionCode = [0-9]*/canonicalVersionCode = $android_version_code/" "$android_gradle_file"

echo "Updated canonicalVersionCode in "$android_gradle_file" to $android_version_code"
echo

# over-the-air updates: the runtime version is {version}.{build} of this native build (scripts/ota/check-config.js)
ios_version=$(sed -nE 's/.*MARKETING_VERSION = "?([^";]+)"?;.*/\1/p' "$ios_project_path"/Xaman.xcodeproj/project.pbxproj | head -1)
android_version_name=$(sed -nE 's/^def canonicalVersionName = "([^"]+)".*/\1/p' "$android_gradle_file")
ios_runtime="$ios_version.$iOS_build_number"
android_runtime="$android_version_name.$android_version_code"

perl -0pi -e "s|(<key>EXUpdatesRuntimeVersion</key>\\s*<string>)[^<]*(</string>)|\${1}$ios_runtime\${2}|" "$ios_project_path"/Xaman/Expo.plist
sed -i "" -E "s|(<string name=\"expo_runtime_version\"[^>]*>)[^<]*(</string>)|\\1$android_runtime\\2|" "$CURRENT_DIR"/android/app/src/main/res/values/strings.xml

echo "Updated the over-the-air runtime version to $ios_runtime (iOS) and $android_runtime (Android)"
echo



