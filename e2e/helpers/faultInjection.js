// Faults on purpose, to prove that the harness recovers from them. Never set these for a run whose
// result counts.
//
// E2E_DROP_TAP="<test id>:<n>"   the n-th tap on that test id is not sent (once);
// E2E_DROP_TAP="<test id>:*<n>"  every n-th tap on it is not sent.
//     On a repeatable button (androidTapCheck.js) the check has to notice and tap again. On any other
//     button the scenario fails in the middle of a flow, which is what the retry has to recover from.
//
// E2E_FAIL_SCENARIO="<part of a scenario name>" fails that scenario at its start:
//     E2E_FAIL_SCENARIO_MODE=once    its first attempt only (the retry passes: "flaky");
//     E2E_FAIL_SCENARIO_MODE=run     every attempt of the first run, not in the rerun the runner starts
//                                    (run-throwaway.sh sets E2E_RERUN=1 there: "passed on rerun");
//     E2E_FAIL_SCENARIO_MODE=always  every attempt ("failed").

const parseDropTap = (value) => {
    const m = /^(.+):(\*?)(\d+)$/.exec(String(value || '').trim());
    if (!m || Number(m[3]) < 1) {
        return null;
    }
    return { testId: m[1], every: m[2] === '*', n: Number(m[3]) };
};

const drop = parseDropTap(process.env.E2E_DROP_TAP);
let dropCount = 0;

const shouldDrop = (rule, count) => {
    if (!rule) {
        return false;
    }
    return rule.every ? count % rule.n === 0 : count === rule.n;
};

const dropTap = (testId) => {
    if (!drop || drop.testId !== testId) {
        return false;
    }
    dropCount += 1;
    return shouldDrop(drop, dropCount);
};

const failName = String(process.env.E2E_FAIL_SCENARIO || '').trim();
const failMode = String(process.env.E2E_FAIL_SCENARIO_MODE || 'once').toLowerCase();
const attempts = {};

const shouldFail = (mode, attempt, isRerun) => {
    if (mode === 'always') {
        return true;
    }
    if (mode === 'run') {
        return !isRerun;
    }
    return attempt === 1 && !isRerun;
};

// Throws when this scenario has to fail now.
const failScenarioIfAsked = (scenarioName) => {
    if (!failName || String(scenarioName).indexOf(failName) === -1) {
        return;
    }
    attempts[scenarioName] = (attempts[scenarioName] || 0) + 1;
    if (shouldFail(failMode, attempts[scenarioName], process.env.E2E_RERUN === '1')) {
        throw new Error(`e2e: failed on purpose (E2E_FAIL_SCENARIO, mode ${failMode}, attempt ${attempts[scenarioName]})`);
    }
};

module.exports = { dropTap, failScenarioIfAsked, parseDropTap, shouldDrop, shouldFail };
