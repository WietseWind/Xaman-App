import NetworkService from '../NetworkService';

import { NetworkConfig } from '@common/constants';

const WebSocketImpl = jest.requireActual('ws');
const https = jest.requireActual('https');

const REQUEST_TIMEOUT_MS = 12000;

/**
 * Cluster endpoints are opened at wss://host/xaman/<version>/<os>[?user_id=].
 * The same path must accept a websocket command and an HTTP POST RPC.
 */
function mergedUrl(endpoint: string): string {
    NetworkService.setUserId('reachability-test');

    return NetworkService.normalizeEndpoint(endpoint);
}

function websocketPing(fullUrl: string): Promise<void> {
    return new Promise((resolve, reject) => {
        const ws = new WebSocketImpl(fullUrl, { handshakeTimeout: REQUEST_TIMEOUT_MS });
        let settled = false;
        let timer: ReturnType<typeof setTimeout>;

        const finish = (error?: Error) => {
            if (settled) {
                return;
            }
            settled = true;
            clearTimeout(timer);
            ws.terminate();
            if (error) {
                reject(error);
                return;
            }
            resolve();
        };

        timer = setTimeout(() => {
            finish(new Error(`websocket timeout for ${fullUrl}`));
        }, REQUEST_TIMEOUT_MS);

        ws.on('open', () => {
            ws.send(JSON.stringify({ id: 1, command: 'ping' }));
        });

        ws.on('message', (data: { toString: () => string }) => {
            const text = data.toString();
            let parsed: { status?: string };

            try {
                parsed = JSON.parse(text);
            } catch (error) {
                finish(error as Error);
                return;
            }

            if (parsed.status !== 'success') {
                finish(new Error(`websocket ping rejected by ${fullUrl}: ${text.slice(0, 200)}`));
                return;
            }

            finish();
        });

        ws.on('error', (error: Error) => finish(error));
    });
}

function postPing(fullUrl: string): Promise<void> {
    const url = new URL(fullUrl.replace(/^wss:/, 'https:'));
    const body = JSON.stringify({ method: 'ping', params: [{}] });

    return new Promise((resolve, reject) => {
        const request = https.request(
            {
                protocol: url.protocol,
                hostname: url.hostname,
                path: `${url.pathname}${url.search}`,
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(body),
                },
                timeout: REQUEST_TIMEOUT_MS,
                agent: false,
            },
            (response: { statusCode?: number; on: (event: string, cb: (chunk?: string) => void) => void }) => {
                let data = '';

                response.on('data', (chunk) => {
                    data += chunk;
                });
                response.on('end', () => {
                    if (response.statusCode !== 200) {
                        reject(new Error(`POST ${url.href} status ${response.statusCode}: ${data.slice(0, 200)}`));
                        return;
                    }

                    let parsed: { result?: { status?: string } };
                    try {
                        parsed = JSON.parse(data);
                    } catch (error) {
                        reject(error);
                        return;
                    }

                    if (parsed.result?.status !== 'success') {
                        reject(new Error(`POST ${url.href} rejected ping: ${data.slice(0, 200)}`));
                        return;
                    }

                    resolve();
                });
            },
        );

        request.on('error', (error: Error) => {
            request.destroy();
            reject(error);
        });
        request.on('timeout', () => {
            request.destroy(new Error(`POST timeout for ${url.href}`));
        });
        request.write(body);
        request.end();
    });
}

describe('cluster origin endpoints', () => {
    test.each(NetworkConfig.clusterEndpoints)(
        '%s accepts a websocket and a POST RPC on the merged /xaman URL',
        async (endpoint) => {
            const fullUrl = mergedUrl(endpoint);

            expect(fullUrl.startsWith(`${endpoint}${NetworkService.Origin}`)).toBe(true);
            expect(fullUrl).toContain('user_id=reachability-test');

            const [socket, post] = await Promise.allSettled([websocketPing(fullUrl), postPing(fullUrl)]);
            const failures = [socket, post].filter((result) => result.status === 'rejected');

            if (failures.length > 0) {
                const detail = failures
                    .map((result) => (result.reason instanceof Error ? result.reason.message : String(result.reason)))
                    .join('\n');
                throw new Error(detail);
            }
        },
        20000,
    );
});
