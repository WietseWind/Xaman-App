/* eslint-disable no-console */
// Read-only audit of the installed codec against current public network definitions.
const fs = require('fs');
const WebSocket = require('ws');
const { XrplDefinitions } = require('xrpl-accountlib');

const networks = [
    ['XRPL Mainnet', 'wss://xrplcluster.com', 0],
    ['XRPL Testnet', 'wss://testnet.xrpl-labs.com', 1],
    ['XRPL Devnet', 'wss://s.devnet.rippletest.net:51233', 2],
    ['Xahau Mainnet', 'wss://xahau.network', 21337],
    ['Xahau Testnet', 'wss://xahau-test.net', 21338],
];

const audit = (name, raw) => {
    const definitions = new XrplDefinitions(raw);
    const fields = raw.FIELDS.filter(([field, info]) => info.isSerialized &&
        !(field === 'Generic' && info.type === 'Unknown' && info.nth === 0));
    const missing = fields.filter(([field]) => {
        const encoder = definitions.field.fromString(field)?.associatedType;
        return !encoder || typeof encoder.from !== 'function' || typeof encoder.fromParser !== 'function';
    }).map(([field, info]) => `${field} (${info.type})`);
    console.log(`${name}: ${fields.length} fields, ${missing.length} missing encoders`);
    if (missing.length) throw new Error(`${name}: ${missing.join(', ')}`);
};

const readNetwork = (name, endpoint, expectedId) => new Promise((resolve, reject) => {
    const socket = new WebSocket(endpoint, { handshakeTimeout: 15000 });
    const replies = {};
    let settled = false;
    let timeout;
    const finish = (error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        socket.terminate();
        if (error) reject(error);
        else resolve(replies.definitions.result);
    };
    timeout = setTimeout(() => finish(new Error(`${name}: request timed out`)), 20000);
    socket.on('error', finish);
    socket.on('close', () => finish(new Error(`${name}: connection closed before response`)));
    socket.on('open', () => {
        socket.send(JSON.stringify({ id: 'definitions', command: 'server_definitions' }));
        socket.send(JSON.stringify({ id: 'info', command: 'server_info' }));
    });
    socket.on('message', (data) => {
        try {
            const message = JSON.parse(data.toString());
            if (!['definitions', 'info'].includes(message.id)) return;
            if (message.error) throw new Error(`${name}: ${message.error}`);
            replies[message.id] = message;
            if (replies.definitions && replies.info) {
                if (replies.info.result?.info?.network_id !== expectedId) {
                    throw new Error(`${name}: server returned a different network ID`);
                }
                if (!Array.isArray(replies.definitions.result?.FIELDS)) {
                    throw new Error(`${name}: server returned invalid definitions`);
                }
                finish();
            }
        } catch (error) {
            finish(error);
        }
    });
});

const main = async () => {
    const files = process.argv.slice(2);
    if (files.length) {
        files.forEach((file) => audit(file, JSON.parse(fs.readFileSync(file, 'utf8'))));
        return;
    }
    const results = await Promise.allSettled(networks.map(async ([name, endpoint, networkId]) => {
        audit(name, await readNetwork(name, endpoint, networkId));
    }));
    results.forEach((result) => {
        if (result.status === 'rejected') {
            console.error(result.reason.message);
            process.exitCode = 1;
        }
    });
};

main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
});
