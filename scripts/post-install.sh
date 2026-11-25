#!/usr/bin/env bash

CYAN='\033[1;36m'
RED='\033[1;31m'
GREEN='\033[1;32m'
NC='\033[0m' # No Color

function _git_hook() {
    echo -e "${GREEN}[-] Installing git hooks... ${NC}"

    # Hooks live in the main checkout's .git, also for linked worktrees. Install them from the main checkout
    # only: a link made from a worktree would point at that worktree's scripts.
    GIT_DIR=$(git rev-parse --git-dir 2> /dev/null) || return 0
    if [ "$(cd "$GIT_DIR" && pwd)" != "$(cd "$(git rev-parse --git-common-dir)" && pwd)" ]; then
        echo -e "    a linked worktree: the main checkout's hooks apply"
        return 0
    fi
    mkdir -p "$GIT_DIR/hooks"

    # pre-commit: lint and type checks. post-merge and post-checkout: say when node_modules no longer
    # matches the checkout after a pull or a branch switch (scripts/check-native-deps.sh).
    for hook in pre-commit post-merge post-checkout; do
        rm -f "$GIT_DIR/hooks/$hook" 2> /dev/null
    done
    ln -s ../../scripts/pre-commit.sh "$GIT_DIR/hooks/pre-commit"
    ln -s ../../scripts/git-hooks/post-merge "$GIT_DIR/hooks/post-merge"
    ln -s ../../scripts/git-hooks/post-checkout "$GIT_DIR/hooks/post-checkout"
    chmod +x scripts/pre-commit.sh scripts/git-hooks/post-merge scripts/git-hooks/post-checkout
}

function _patch(){
    echo -e "${GREEN}[-] Patching packages... ${NC}"
    # A patch that does not apply fails the install. Before, npm ci went on and builds used unpatched packages.
    if ! npx patch-package --error-on-fail; then
        echo -e "\n${RED}[!] A patch in patches/ did not apply (see above), so this install is not usable.${NC}"
        exit 1
    fi
    # and every patch in patches/ must now be in node_modules
    if ! scripts/check-native-deps.sh --patches-only; then
        exit 1
    fi
}

function _check_pod_install() {
    # npm ci deletes React Native's iOS codegen output, so iOS needs pod install after every npm ci.
    if [ -d ios/Pods ] && ! scripts/check-native-deps.sh --ios --quiet 2> /dev/null; then
        echo -e ""
        echo -e "${RED}[!] Before building iOS, run 'pod install' in '/ios' (npm ci removed React Native's codegen output) ${NC}"
    fi
}



#  Main ==================================================================== */
echo -e "${CYAN}[*] Post Install.. ${NC}"

_git_hook
_patch
_check_pod_install

echo -e "\n${GREEN}[*] Everything went well! ${NC}"
