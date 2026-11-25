const detox = require('detox/internals');

class DetoxCucumberAdapter {
    constructor(d) {
        this.detox = d;
        this.testFailed = false;
    }

    // After a failure the app is restarted (support/init.js) and the run goes on, so one failure
    // does not turn every later scenario into "Force stop". DETOX_CONTINUE_ON_FAIL=no stops at
    // the first failure instead.
    // eslint-disable-next-line class-methods-use-this
    continueOnFail() {
        return String(process.env.DETOX_CONTINUE_ON_FAIL || 'yes').toLowerCase() !== 'no';
    }

    async beforeEach(context) {
        if (this.testFailed && !this.continueOnFail()) {
            throw new Error('Force stop');
        }

        await this.detox.onTestStart({
            title: context.pickle.uri,
            fullName: context.pickle.name,
            status: 'running',
        });
    }

    async afterEach(context) {
        const { pickle, result } = context;

        const status = this.mapStatus(result);

        if (status === 'failed') {
            this.testFailed = true;
        }

        await this.detox.onTestDone({
            title: pickle.uri,
            fullName: pickle.name,
            status,
            timedOut: result.duration,
        });
    }

    // eslint-disable-next-line class-methods-use-this
    mapStatus(result) {
        switch (result.status) {
            case 'PASSED':
                return 'passed';
            case 'FAILED':
                return 'failed';
            default:
                return 'failed';
        }
    }
}

module.exports = new DetoxCucumberAdapter(detox);
