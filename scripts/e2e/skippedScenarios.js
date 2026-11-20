/**
 * Scenarios that a step skipped on purpose (the device can not do them: no root on a phone, for
 * example) are not failures. Cucumber's rerun file names every scenario that did not pass, the
 * skipped ones too; the runner must not run the story again for those, nor report them as failed.
 *
 *   node scripts/e2e/skippedScenarios.js <artifacts dir>
 *
 * reads cucumber.json and rerun.txt in that folder, writes skipped.txt ("file:line # name" per
 * scenario) and takes the skipped scenarios out of rerun.txt (the file as cucumber wrote it stays
 * as rerun-all.txt).
 */

const NOT_PASSED = ['failed', 'ambiguous', 'undefined', 'pending'];

// "file:line" -> name, for every scenario with a skipped step and no failed step in any attempt
const skippedScenarios = (features) => {
    const seen = {};
    (Array.isArray(features) ? features : []).forEach((feature) => {
        (feature.elements || []).forEach((element) => {
            const key = `${feature.uri}:${element.line}`;
            const statuses = (element.steps || []).map((step) => (step.result && step.result.status) || '');
            const entry = seen[key] || { name: element.name, failed: false, skipped: false };
            entry.failed = entry.failed || statuses.some((status) => NOT_PASSED.indexOf(status) !== -1);
            entry.skipped = entry.skipped || statuses.indexOf('skipped') !== -1;
            seen[key] = entry;
        });
    });
    const skipped = {};
    Object.keys(seen).forEach((key) => {
        if (seen[key].skipped && !seen[key].failed) {
            skipped[key] = seen[key].name;
        }
    });
    return skipped;
};

// cucumber's rerun text ("file:line:line" per feature file) without the skipped scenarios
const withoutSkipped = (rerunText, skipped) =>
    String(rerunText || '')
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => {
            const parts = line.split(':');
            const file = parts[0];
            const lines = parts.slice(1).filter((number) => !(`${file}:${number}` in skipped));
            return lines.length ? `${file}:${lines.join(':')}` : '';
        })
        .filter(Boolean)
        .join('\n');

module.exports = { skippedScenarios, withoutSkipped };

if (require.main === module) {
    // eslint-disable-next-line global-require
    const fs = require('fs');
    // eslint-disable-next-line global-require
    const path = require('path');
    const dir = process.argv[2];
    const read = (name) => {
        try {
            return fs.readFileSync(path.join(dir, name), 'utf8');
        } catch (e) {
            return '';
        }
    };
    let features = [];
    try {
        features = JSON.parse(read('cucumber.json') || '[]');
    } catch (e) {
        // a run that was cut off leaves no complete report: nothing is known to be skipped
    }
    const skipped = skippedScenarios(features);
    const keys = Object.keys(skipped);
    if (keys.length) {
        const rerun = read('rerun.txt');
        fs.writeFileSync(path.join(dir, 'rerun-all.txt'), rerun);
        const left = withoutSkipped(rerun, skipped);
        fs.writeFileSync(path.join(dir, 'rerun.txt'), left ? `${left}\n` : '');
        fs.writeFileSync(path.join(dir, 'skipped.txt'), `${keys.map((key) => `${key} # ${skipped[key]}`).join('\n')}\n`);
    }
}
