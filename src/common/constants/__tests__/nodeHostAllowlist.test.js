const { readFileSync } = jest.requireActual('fs');
const { join } = jest.requireActual('path');

const REQUIRED_HOSTS = ['xahau-test.net', 'rpc.xahau-test.net', 'rpc.xrpl-labs.com'];

const repoRoot = join(__dirname, '../../../..');

function quotedHosts(listSource) {
    return [...listSource.matchAll(/"([^"]+)"/g)].map((match) => match[1]);
}

function lineContaining(source, marker) {
    const line = source.split('\n').find((entry) => entry.includes(marker));

    if (!line) {
        throw new Error(`Allowlist line not found: ${marker}`);
    }

    return quotedHosts(line);
}

function iosWebsocketHosts() {
    const patch = readFileSync(join(repoRoot, 'patches/react-native+0.74.2.patch'), 'utf8');

    return lineContaining(patch, 'static NSSet *allowedEndpoints');
}

function androidHttpHosts() {
    const source = readFileSync(
        join(repoRoot, 'android/app/src/main/java/libs/common/HTTPClientFactory.java'),
        'utf8',
    );

    return lineContaining(source, 'trustedHosts = Arrays.asList');
}

describe('node host allowlists', () => {
    test.each([
        ['iOS websocket', iosWebsocketHosts],
        ['Android HTTP', androidHttpHosts],
    ])('%s allows Xahau testnet and the XRPL Labs RPC hosts', (_label, readHosts) => {
        const hosts = readHosts();

        REQUIRED_HOSTS.forEach((host) => {
            expect(hosts).toContain(host);
        });
    });
});
