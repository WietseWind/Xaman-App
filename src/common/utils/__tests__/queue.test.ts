import { PromiseQueue } from '../queue';

const deferred = () => {
    let resolve: () => void = () => undefined;
    const promise = new Promise<void>((res) => { resolve = res; });
    return { promise, resolve };
};

const flush = async () => {
    await Promise.resolve();
    await Promise.resolve();
};

describe('token metadata queue', () => {
    it('runs one request per issuer and keeps one follow-up for tokens added during that request', async () => {
        const queue = new PromiseQueue(3);
        const firstReply = deferred();
        const nextReply = deferred();
        let calls = 0;
        let tokens = ['first'];
        const updates: string[][] = [];
        const refresh = async () => {
            calls++;
            const snapshot = [...tokens];
            await (calls === 1 ? firstReply.promise : nextReply.promise);
            updates.push(snapshot);
        };

        queue.enqueue('issuer', refresh);
        tokens = ['first', 'added-during-request'];
        for (let i = 0; i < 25; i++) queue.enqueue('issuer', refresh);
        const requestsBeforeReply = calls;
        firstReply.resolve();
        await flush();
        nextReply.resolve();
        await flush();

        expect(requestsBeforeReply).toBe(1);
        expect(calls).toBe(2);
        expect(updates).toEqual([['first'], ['first', 'added-during-request']]);
    });

    it('does not let a waiting repeat block other issuers and keeps the concurrency limit', async () => {
        const queue = new PromiseQueue(3);
        const reply = deferred();
        let active = 0;
        let maximum = 0;
        const started: string[] = [];
        const task = (issuer: string) => async () => {
            active++;
            maximum = Math.max(maximum, active);
            started.push(issuer);
            await reply.promise;
            active--;
        };
        queue.enqueue('a', task('a'));
        queue.enqueue('a', task('a-follow-up'));
        queue.enqueue('b', task('b'));
        queue.enqueue('c', task('c'));
        queue.enqueue('d', task('d'));
        const initial = [...started];
        reply.resolve();
        await flush();
        await flush();

        expect(initial).toEqual(['a', 'b', 'c']);
        expect(maximum).toBe(3);
        expect(started).toEqual(['a', 'b', 'c', 'a-follow-up', 'd']);
        expect(active).toBe(0);
    });

    it('allows a later refresh after an issuer finishes', async () => {
        const queue = new PromiseQueue(3);
        const refresh = jest.fn().mockResolvedValue(undefined);
        queue.enqueue('issuer', refresh);
        await flush();
        queue.enqueue('issuer', refresh);
        await flush();
        expect(refresh).toHaveBeenCalledTimes(2);
    });

    it('continues after a failed lookup handled by the metadata caller', async () => {
        const queue = new PromiseQueue(1);
        const warn = jest.fn();
        const failed = jest.fn(async () => { throw new Error('Offline'); });
        const retry = jest.fn().mockResolvedValue(undefined);
        queue.enqueue('issuer', () => failed().catch(warn));
        queue.enqueue('issuer', retry);
        await flush();
        await flush();
        expect(warn).toHaveBeenCalledTimes(1);
        expect(retry).toHaveBeenCalledTimes(1);
    });
});
