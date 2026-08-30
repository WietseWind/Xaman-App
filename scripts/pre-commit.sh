#!/usr/bin/env bash

# node_modules/.bin/{eslint,tsc} are copies, not npm symlinks, so
# require('../package.json') / require('../lib/tsc.js') miss. Invoke the
# real package CLIs; prefer bun when present.
ROOT=$(git rev-parse --show-toplevel)
cd "$ROOT"

if command -v bun >/dev/null 2>&1; then
    RUN=(bun)
else
    RUN=(node)
fi

ESLINT="$ROOT/node_modules/eslint/bin/eslint.js"
TSC="$ROOT/node_modules/typescript/bin/tsc"

files=$(git diff --cached --name-only --diff-filter=ACM | grep -E  '\.(js|ts|tsx)$')
if [ -n "$files" ]; then
    # check for any linting errors
    lintError=$("${RUN[@]}" "$ESLINT" --quiet $files)
    if [[ -n "$lintError" ]]; then
        echo "ERROR: Check eslint hints."
        echo "$lintError"
        exit 1
    fi

    # check tsc for only relevant files
    typeScriptFiles=$(echo $files | tr ' ' '\n' | grep -E '\.(ts|tsx)$')
    if [[ -z "$typeScriptFiles" ]]; then
        echo "No TypeScript files changed. Skipping TSC check."
    else
        tscError=$("${RUN[@]}" "$TSC" --noEmit)
        if [[ -n "$tscError" ]]; then
            echo "ERROR: Check TSC hints."
            echo "$tscError"
            exit 1
        fi
    fi
fi

# checking for any translations mismatch
translationsError=$("${RUN[@]}" scripts/locales.js --check 2>&1)
if [[ -n "$translationsError" ]]; then
    echo "ERROR: Check translation files hints."
    echo "$translationsError"
    exit 1
fi

# guard production endpoint values
scripts/check-endpoints.sh || exit 1
