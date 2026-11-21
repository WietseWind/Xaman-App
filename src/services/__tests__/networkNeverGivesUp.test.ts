/**
 * The connection to the node of a network never gives up.
 *
 * The client (xrpl-client) can end in a state that it does not leave by itself:
 *   - it stops for good after its last connection attempt when the network has one node (Xahau, Xahau
 *     Testnet, Devnet, a custom node): "Max. connection attempts exceeded", and `reinstate` does not start
 *     it again. Seen on a device: the app stayed "Disconnected" until it was started again.
 *   - its socket is open but silent. Seen on a device: "Connected" for minutes with a node that was gone.
 *   - its socket opened and the node never answered.
 * The app makes a new client after a pause, again and again. The pause doubles to 30 seconds (exponential
 * backoff). A watch looks at the connection every 10 seconds while the app is in use.
 */
import { EventEmitter } from 'events';

import { Navigator } from '@common/helpers/navigator';
import AppService, { AppStateStatus, NetStateStatus } from '@services/AppService';

import NetworkService, { NetworkStateStatus } from '../NetworkService';

/* The client ==================================================================== */
class FakeClient extends EventEmitter {
    static made: FakeClient[] = [];

    // what the real client says about itself
    online = false;
    secLastContact: number | null = null;

    close = jest.fn();
    destroy = jest.fn();
    reinstate = jest.fn();
    send = jest.fn(async () => ({ id: 'x.network' }));
    getState = jest.fn(() => ({
        online: this.online,
        secLastContact: this.secLastContact,
        server: { uri: this.endpoints[0], publicKey: 'NODE' },
    }));

    constructor(public endpoints: string[], public options: unknown) {
        super();
        FakeClient.made.push(this);
    }

    // what the real client does after its last attempt on a network with one node
    giveUp() {
        this.emit('error', new Error('Max. connection attempts exceeded'));
    }

    // connected, and the node talks
    comeOnline() {
        this.online = true;
        this.secLastContact = 1;
        this.emit('online');
    }
}

jest.mock('xrpl-client', () => ({
    __esModule: true,
    XrplClient: jest.fn((endpoints: string[], options: unknown) => new FakeClient(endpoints, options)),
}));

const service = NetworkService as any;
const clients = () => FakeClient.made;
const latest = () => clients()[clients().length - 1];
const wait = (seconds: number) => jest.advanceTimersByTime(seconds * 1000);
// the timers of the service: the watch (always one while it is connected to a root), and a retry that waits
const WATCH = 1;

const oneNode = {
    id: { equals: () => true, toHexString: () => 'network', toString: () => 'network' },
    key: 'XAHAU',
    networkId: 21337,
    defaultNode: { endpoint: 'wss://xahau.network' },
    nodes: [{ endpoint: 'wss://xahau.network' }],
};

beforeEach(() => {
    jest.useFakeTimers();
    FakeClient.made = [];
    service.stopWatch();
    service.network = oneNode;
    service.connection = undefined;
    service.connectionGaveUp = false;
    service.retryCount = 0;
    service.retryTimer = undefined;
    service.lastNetworkErrorId = undefined;
    AppService.currentAppState = AppStateStatus.Active;
    AppService.netStatus = NetStateStatus.Connected;
    jest.spyOn(Navigator, 'showOverlay').mockImplementation(jest.fn() as any);
    // what a connection does when it is up is not the subject here
    ['updateNetworkReserve', 'updateNetworkDefinitions', 'updateNetworkFeatures'].forEach((name) =>
        jest.spyOn(service, name).mockImplementation(jest.fn()),
    );
    service.connect();
});

afterEach(() => {
    service.stopWatch();
    jest.clearAllTimers();
    jest.restoreAllMocks();
    jest.useRealTimers();
});

describe('the client gave up', () => {
    it('a new client is made after a short pause, and the old one is destroyed', () => {
        const first = latest();
        first.giveUp();

        expect(service.getConnectionStatus()).toBe(NetworkStateStatus.Disconnected);
        wait(1.9);
        expect(clients()).toHaveLength(1);
        wait(0.2);
        expect(clients()).toHaveLength(2);
        expect(first.destroy).toHaveBeenCalledTimes(1);
        // not a reinstate: that does not start a client that gave up
        expect(first.reinstate).not.toHaveBeenCalled();
        expect(service.connection).toBe(latest());
        expect(service.getConnectionStatus()).toBe(NetworkStateStatus.Connecting);
    });

    it('it never stops: the pause doubles (2, 4, 8, 16 seconds) to 30 seconds and stays there', () => {
        const pauses = [2, 4, 8, 16, 30, 30, 30, 30, 30, 30, 30, 30];
        pauses.forEach((pause, index) => {
            latest().giveUp();
            wait(pause - 0.1);
            expect(clients()).toHaveLength(index + 1);
            wait(0.2);
            expect(clients()).toHaveLength(index + 2);
        });
    });

    it('the user is told once that there is no connection, not for every new try', () => {
        for (let i = 0; i < 4; i += 1) {
            latest().giveUp();
            wait(31);
        }
        expect(Navigator.showOverlay).toHaveBeenCalledTimes(1);
    });

    it('connected again: the next problem starts with the short pause', () => {
        latest().giveUp();
        wait(2.1);
        latest().giveUp();
        wait(4.1);
        expect(clients()).toHaveLength(3);

        latest().comeOnline();
        expect(service.getConnectionStatus()).toBe(NetworkStateStatus.Connected);

        latest().giveUp();
        wait(1.9);
        expect(clients()).toHaveLength(3);
        wait(0.2);
        expect(clients()).toHaveLength(4);
    });

    it('after days without a connection the pause is still 30 seconds, and one retry waits at most', () => {
        for (let i = 0; i < 3000; i += 1) {
            latest().giveUp();
            // more errors of the same client while it waits make no more timers
            latest().giveUp();
            latest().giveUp();
            expect(jest.getTimerCount()).toBe(WATCH + 1);
            wait(30);
        }
        expect(clients()).toHaveLength(3001);
        expect(jest.getTimerCount()).toBe(WATCH);
        // every client that was replaced is destroyed and has no listener of the app left
        clients()
            .slice(0, -1)
            .forEach((client) => {
                expect(client.destroy).toHaveBeenCalledTimes(1);
                // only the empty listener for a late error
                expect(client.eventNames()).toStrictEqual(['error']);
            });
        expect(latest().eventNames().sort()).toStrictEqual(['error', 'nodeswitch', 'offline', 'online', 'round']);
    });

    it('connected, or a new connection for another reason: no retry is left', () => {
        latest().giveUp();
        expect(jest.getTimerCount()).toBe(WATCH + 1);
        wait(2.1);
        latest().comeOnline();
        expect(jest.getTimerCount()).toBe(WATCH);

        latest().giveUp();
        expect(jest.getTimerCount()).toBe(WATCH + 1);
        service.destroyConnection();
        service.connect();
        expect(jest.getTimerCount()).toBe(WATCH);
    });

    it('a request to a client that gave up is refused at once: it does not wait for a time-out', async () => {
        const first = latest();
        first.giveUp();
        await expect(service.send({ command: 'ledger_current' })).rejects.toThrow('Not connected to the node.');
        expect(first.send).not.toHaveBeenCalled();

        // the new client takes requests again
        wait(2.1);
        await service.send({ command: 'ledger_current' });
        expect(latest().send).toHaveBeenCalledTimes(1);
    });
});

describe('a connection that is there, but dead', () => {
    it('connected and silent for more than 30 seconds: a new client', () => {
        const first = latest();
        first.comeOnline();
        // the node talks: nothing happens, for hours
        wait(3 * 3600);
        expect(clients()).toHaveLength(1);

        first.secLastContact = 31;
        // the watch sees it at its next look (10 seconds at most), then the short pause
        wait(10 + 2 + 0.1);
        expect(clients()).toHaveLength(2);
        expect(first.destroy).toHaveBeenCalledTimes(1);
    });

    it('connected, and the socket is not open any more (a close that never ended): a new client', () => {
        const first = latest();
        first.comeOnline();
        first.online = false;
        wait(10 + 2 + 0.1);
        expect(clients()).toHaveLength(2);
    });

    it('a socket that opened and a node that never answers: a new client after 30 seconds', () => {
        // no event at all from the client
        wait(39);
        expect(clients()).toHaveLength(1);
        // the look at 40 seconds sees more than 30 seconds without a connection, then the short pause
        wait(1 + 2 + 0.1);
        expect(clients()).toHaveLength(2);
        // and again, with the longer pause, for as long as it takes
        wait(30 + 10 + 4 + 0.1);
        expect(clients()).toHaveLength(3);
    });

    it('a client that connects again by itself gets its time: no new client while it reports', () => {
        const first = latest();
        first.comeOnline();
        // the socket closed; the client reconnects by itself and is online again 5 seconds later
        first.online = false;
        first.emit('offline');
        expect(service.getConnectionStatus()).toBe(NetworkStateStatus.Disconnected);
        wait(5);
        first.comeOnline();
        wait(600);
        expect(clients()).toHaveLength(1);
    });

    it('a network with more nodes goes from node to node by itself ("round"): no new client', () => {
        // every round is reported; the client is busy, the app leaves it alone
        for (let i = 0; i < 40; i += 1) {
            latest().emit('round');
            wait(20);
        }
        expect(clients()).toHaveLength(1);
        // it stops reporting: after 30 seconds the watch takes over
        wait(30 + 10 + 2 + 0.1);
        expect(clients()).toHaveLength(2);
    });

    it('nothing is watched after the app left its main screens (the service is reinstated)', () => {
        latest().giveUp();
        service.reinstate();
        expect(jest.getTimerCount()).toBe(0);
        wait(600);
        expect(clients()).toHaveLength(1);
    });
});

describe('the app is not in use, or the phone has no network', () => {
    it('nothing is tried while the app is in the background; back in the app, a new client is made', () => {
        const first = latest();
        first.giveUp();
        AppService.currentAppState = AppStateStatus.Background;
        wait(600);
        expect(clients()).toHaveLength(1);

        // what the service does when the app is active again after it was inactive
        AppService.currentAppState = AppStateStatus.Active;
        service.onAppStateChange(AppStateStatus.Active, AppStateStatus.Inactive);
        expect(clients()).toHaveLength(2);
        expect(first.reinstate).not.toHaveBeenCalled();
    });

    it('nothing is tried without a network; when the network is back, a new client is made', () => {
        const first = latest();
        first.giveUp();
        AppService.netStatus = NetStateStatus.Disconnected;
        wait(600);
        expect(clients()).toHaveLength(1);

        AppService.netStatus = NetStateStatus.Connected;
        service.onNetStateChange(NetStateStatus.Connected);
        expect(clients()).toHaveLength(2);
        expect(first.reinstate).not.toHaveBeenCalled();
    });

    it('a short time in the background while a retry came due: taken up again at once on the return', () => {
        latest().giveUp();
        wait(2.1);
        latest().giveUp();
        // the retry comes due in the background and is not done
        AppService.currentAppState = AppStateStatus.Background;
        wait(4.1);
        expect(clients()).toHaveLength(2);

        // active again from the background (not from inactive): the service does not reconnect, it looks
        AppService.currentAppState = AppStateStatus.Active;
        service.onAppStateChange(AppStateStatus.Active, AppStateStatus.Background);
        // the short pause again, because the user is back
        wait(2.1);
        expect(clients()).toHaveLength(3);
    });

    it('the same without the return being reported: the watch takes it up at its next look', () => {
        latest().giveUp();
        AppService.currentAppState = AppStateStatus.Background;
        wait(2.1);
        expect(clients()).toHaveLength(1);

        AppService.currentAppState = AppStateStatus.Active;
        wait(10 + 4 + 0.1);
        expect(clients()).toHaveLength(2);
    });
});

describe('reconnect, asked by the app', () => {
    it('unchanged: it closes and reinstates a client that is connected', () => {
        const first = latest();
        first.comeOnline();
        service.reconnect();
        expect(first.close).toHaveBeenCalledTimes(1);
        expect(first.reinstate).toHaveBeenCalledTimes(1);
        expect(first.destroy).not.toHaveBeenCalled();
        expect(clients()).toHaveLength(1);
    });

    it('a new client that only just started to connect is left alone', () => {
        const first = latest();
        // what a request that was pending in the old client does when it is refused (the fee fallback)
        service.reconnect();
        service.reconnect();
        expect(first.close).not.toHaveBeenCalled();
        expect(first.reinstate).not.toHaveBeenCalled();

        // not for ever: after 15 seconds a reconnect is done again
        wait(15.1);
        service.reconnect();
        expect(first.reinstate).toHaveBeenCalledTimes(1);
    });

    it('after a long time without a connection, another network starts with the short pause', () => {
        for (let i = 0; i < 8; i += 1) {
            latest().giveUp();
            wait(31);
        }
        const before = clients().length;
        // what switchNetwork does
        service.destroyConnection();
        service.retryCount = 0;
        service.connect();
        latest().giveUp();
        wait(2.1);
        expect(clients()).toHaveLength(before + 2);
    });

    it('the network or the user is back after a long time: the short pause again', () => {
        for (let i = 0; i < 8; i += 1) {
            latest().giveUp();
            wait(31);
        }
        latest().giveUp();
        const before = clients().length;
        service.reconnect();
        expect(clients()).toHaveLength(before + 1);
        latest().giveUp();
        wait(2.1);
        expect(clients()).toHaveLength(before + 2);
    });
});

describe('a client that was replaced', () => {
    it('what it still reports does not change the state of the connection', () => {
        const first = latest();
        first.giveUp();
        wait(2.1);
        const second = latest();
        second.comeOnline();
        expect(service.getConnectionStatus()).toBe(NetworkStateStatus.Connected);

        // a late error of the client that is gone is not thrown, and changes nothing
        first.emit('offline');
        expect(() => first.emit('error', new Error('Max. connection attempts exceeded'))).not.toThrow();
        first.emit('round');
        expect(service.getConnectionStatus()).toBe(NetworkStateStatus.Connected);
        wait(600);
        expect(clients()).toHaveLength(2);
    });

    it('a late "online" of the old client does not make the app connected', () => {
        const first = latest();
        first.giveUp();
        wait(2.1);
        first.emit('online');
        expect(service.getConnectionStatus()).toBe(NetworkStateStatus.Connecting);
    });

    it('a new connection for another reason (a network switch) ends the waiting try', () => {
        latest().giveUp();
        // what switchNetwork does
        service.destroyConnection();
        service.connect();
        expect(clients()).toHaveLength(2);
        latest().comeOnline();
        wait(600);
        expect(clients()).toHaveLength(2);
    });
});
