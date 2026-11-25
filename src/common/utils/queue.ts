export class PromiseQueue {
    private queue: Map<string, () => Promise<any>> = new Map();
    private activeKeys = new Set<string>();
    private activeCount: number = 0;
    private concurrency: number;

    constructor(concurrency: number) {
        this.concurrency = concurrency;
    }

    private async runNext() {
        if (this.activeCount >= this.concurrency || this.queue.size === 0) {
            return;
        }

        for (const [key, task] of this.queue) {
            // A repeat waits for the current lookup, without blocking other issuers.
            if (this.activeKeys.has(key)) continue;
            this.queue.delete(key);
            this.activeKeys.add(key);
            this.activeCount++;
            try {
                await task();
            } finally {
                this.activeKeys.delete(key);
                this.activeCount--;
                this.runNext();
            }
            return;
        }
    }

    enqueue(key: string, task: () => Promise<any>) {
        // Keep one follow-up even while this key is active: its inputs may have changed.
        if (!this.queue.has(key)) {
            this.queue.set(key, task);
            this.runNext();
        }
    }
}
