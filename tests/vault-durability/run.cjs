/* Run via compile.py. Only synthetic secrets in isolated temporary stores.
 * Actual JS recovery + actual Android PrefsStorage/Keychain/VaultManager.
 * Android APIs and the hardware wrapping cipher are explicit host doubles.
 * Settings use the real encrypted Realm engine, not an in-memory settings mock.
 */
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const readline = require('node:readline');
const ts = require('typescript');
const RealmExport = require('realm');
const Realm = RealmExport.default || RealmExport;
const ROOT = path.resolve(__dirname, '../..');
const JOURNAL = 'xaman-passcode-change-v1';
const [classes, javaHome] = process.argv.slice(2);
const java = javaHome ? path.join(javaHome, 'bin/java') : 'java';
const testRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'xaman-recovery-matrix-'));

const moduleObject = { exports: {} };
const source = ts.transpileModule(fs.readFileSync(path.join(ROOT, 'src/common/libs/passcodeChange.ts'), 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, esModuleInterop: true },
}).outputText;
vm.runInNewContext('(function(require,module,exports){' + source + '\n})', { Buffer })(
    (id) => id === '@store/types' ? { EncryptionLevels: { Passcode: 'Passcode' } } : {},
    moduleObject, moduleObject.exports,
);
const { createPasscodeChange } = moduleObject.exports;

class Native {
    constructor(folder) {
        this.serial = 0;
        this.pending = new Map();
        this.child = spawn(java, ['-cp', classes, 'fixture.Fixture', folder]);
        this.done = new Promise((resolve) => this.child.once('close', resolve));
        this.child.stdin.on('error', () => undefined);
        readline.createInterface({ input: this.child.stdout }).on('line', (line) => {
            const [id, status, data] = line.split('\t');
            const entry = this.pending.get(id);
            if (!entry) return;
            this.pending.delete(id);
            const value = Buffer.from(data || '', 'base64').toString();
            if (status === 'ok') entry.resolve(value);
            else entry.reject(new Error(value));
        });
        this.child.stderr.on('data', (data) => { this.stderr = String(data); });
        this.child.on('error', (error) => this.abort(error));
        this.child.on('close', (code) => this.abort(new Error('Native process exited: ' + code)));
        this.vault = {
            create: async (name, data, key) => (await this.call('create', name, data, key)) === 'true',
            open: async (name, key) => {
                try { return await this.call('open', name, key); } catch { return undefined; }
            },
            exist: async (name) => (await this.call('exists', name)) === 'true',
            purge: async (name) => (await this.call('purge', name)) === 'true',
            reKeyBatch: async (names, oldKey, newKey) =>
                (await this.call('rekey', names.join(','), oldKey, newKey)) === 'true',
            getStorageEncryptionKey: async () => Buffer.from(await this.call('storageKey'), 'hex'),
        };
    }
    abort(error) {
        this.dead = true;
        for (const { reject } of this.pending.values()) reject(error);
        this.pending.clear();
    }
    call(command, ...args) {
        if (this.dead) return Promise.reject(new Error('Native process unavailable'));
        const id = String(++this.serial);
        const request = [id, command, ...args.map((value) => Buffer.from(String(value)).toString('base64'))].join('\t');
        return new Promise((resolve, reject) => {
            this.pending.set(id, { resolve, reject });
            this.child.stdin.write(request + '\n');
        });
    }
    fault(kill = 0, fail = 0, persistent = false, afterWrite = false, throws = false) {
        return this.call('fault', kill, fail, persistent, afterWrite, throws);
    }
    async stop() {
        if (!this.dead) {
            this.abort(new Error('Fixture process interrupted'));
            this.child.kill('SIGKILL');
        }
        await this.done;
    }
}

let cases = 0;
async function scenario(task, initial = true) {
    const folder = fs.mkdtempSync(path.join(testRoot, 'case-'));
    let native = new Native(folder);
    let realm;
    const openSettings = () => {
        realm = new Realm({
            path: path.join(folder, 'settings.realm'),
            encryptionKey: Buffer.alloc(64, 7),
            schema: [{ name: 'Settings', primaryKey: 'id', properties: { id: 'int', passcode: 'string' } }],
        });
        if (!realm.objectForPrimaryKey('Settings', 1)) {
            realm.write(() => realm.create('Settings', { id: 1, passcode: 'old' }));
        }
    };
    openSettings();
    const context = {
        get native() { return native; },
        hash: () => realm.objectForPrimaryKey('Settings', 1).passcode,
        restart: async () => {
            await native.stop();
            realm.close();
            native = new Native(folder);
            openSettings();
        },
        service: (interrupt) => createPasscodeChange({
            vault: native.vault,
            readHash: () => context.hash(),
            writeHash: (hash) => {
                if (interrupt === 'before settings') {
                    native.abort(new Error('JS interrupted')); native.child.kill('SIGKILL');
                    throw new Error('JS interrupted before Realm commit');
                }
                realm.write(() => { realm.objectForPrimaryKey('Settings', 1).passcode = hash; });
                if (interrupt === 'after settings') {
                    native.abort(new Error('JS interrupted')); native.child.kill('SIGKILL');
                    throw new Error('JS interrupted after Realm commit');
                }
            },
            hash: async () => 'new',
            names: () => ['A', 'B'],
        }),
        verify: async () => {
            await context.service().recover();
            for (const name of ['A', 'B']) {
                assert.equal(await native.vault.open(name, context.hash()), 'fixture-secret-' + name);
                assert.equal(await native.vault.exist(name + '_RECOVER'), false);
                assert.equal(await native.vault.exist(name + '_PASSCODE_RECOVER'), false);
            }
            assert.equal(await native.vault.exist(JOURNAL), false);
        },
    };
    try {
        if (initial) {
            for (const name of ['A', 'B']) await native.vault.create(name, 'fixture-secret-' + name, 'old');
            await native.vault.getStorageEncryptionKey();
            // Establish a durable pre-upgrade fixture, including for the old apply() implementation.
            await native.call('flushFixtureSeed');
        }
        await native.fault();
        await task(context);
        cases++;
        if (cases % 20 === 0) process.stdout.write('Verified ' + cases + ' persistence/recovery cases\n');
    } finally {
        await native.stop();
        realm.close();
    }
}

async function main() {
    let changeTrace;
    await scenario(async (c) => {
        await c.service().change('fixture-passcode');
        changeTrace = (await c.native.call('trace')).split('\n');
        assert.equal(c.hash(), 'new');
        await c.restart(); await c.verify();
    });
    const commitCount = changeTrace.filter((event) => event === 'commit:before').length;
    assert.ok(commitCount > 0, 'Native writes must commit before acknowledging success');

    // Abrupt child-process death at every observed preferences/Keystore boundary.
    for (let cut = 1; cut <= changeTrace.length; cut++) {
        await scenario(async (c) => {
            await c.native.fault(cut);
            await c.service().change('fixture-passcode').catch(() => undefined);
            await c.restart(); await c.verify();
        });
    }

    // commit(false) can mean no disk update or an ambiguous write, and can recur.
    for (let commit = 1; commit <= commitCount; commit++) {
        for (const persistent of [false, true]) for (const afterWrite of [false, true]) for (const throws of [false, true]) {
            await scenario(async (c) => {
                await c.native.fault(0, commit, persistent, afterWrite, throws);
                await c.service().change('fixture-passcode').catch(() => undefined);
                await c.restart(); await c.verify();
            });
        }
    }

    for (const moment of ['before settings', 'after settings']) {
        await scenario(async (c) => {
            await c.service(moment).change('fixture-passcode').catch(() => undefined);
            await c.restart(); await c.verify();
        });
    }

    // A previously acknowledged journal remains through interruptions of recovery itself.
    const partialCut = changeTrace.indexOf('key-delete:after') + 1;
    assert.ok(partialCut > 0);
    let recoveryTrace;
    const partial = async (c) => {
        await c.native.fault(partialCut);
        await c.service().change('fixture-passcode').catch(() => undefined);
        await c.restart();
    };
    await scenario(async (c) => {
        await partial(c); await c.native.fault(); await c.verify();
        recoveryTrace = (await c.native.call('trace')).split('\n');
    });
    for (let cut = 1; cut <= recoveryTrace.length; cut++) {
        await scenario(async (c) => {
            await partial(c); await c.native.fault(cut);
            await c.service().recover().catch(() => undefined);
            await c.restart(); await c.verify();
        });
    }
    const recoveryCommits = recoveryTrace.filter((event) => event === 'commit:before').length;
    for (let commit = 1; commit <= recoveryCommits; commit++) {
        await scenario(async (c) => {
            await partial(c); await c.native.fault(0, commit, true);
            await c.service().recover().catch(() => undefined);
            await c.restart(); await c.verify();
        });
    }

    // A failed overwrite must never become committed by a later cache read.
    for (const afterWrite of [false, true]) await scenario(async (c) => {
        await c.native.fault(0, 1, false, afterWrite);
        await assert.rejects(c.native.vault.create('A', 'different-fixture-data', 'different-key'), /persist/);
        await c.native.call('newManager');
        assert.equal(await c.native.vault.open('A', 'old'), 'fixture-secret-A');
        await c.restart(); await c.verify();
    });

    // Failed purge/wipe must retain keys for ciphertext still durable on disk.
    for (const action of ['purge', 'clear']) await scenario(async (c) => {
        await c.native.fault(0, 1, true);
        await assert.rejects(c.native.call(action, 'A'), /persist/);
        assert.equal(await c.native.call('keyExists', 'A'), 'true');
        assert.equal(await c.native.call('keyExists', 'B'), 'true');
        await c.restart(); await c.verify();
    });

    // A second module sharing the dirty cache must neither report a new Realm
    // key as durable nor proceed while the write remains unsuccessful.
    await scenario(async (c) => {
        await c.native.fault(0, 1, true);
        await assert.rejects(c.native.vault.getStorageEncryptionKey(), /persist/);
        await c.native.call('newManager');
        await assert.rejects(c.native.vault.getStorageEncryptionKey(), /persist/);
        await c.native.fault();
        const key = await c.native.vault.getStorageEncryptionKey();
        await c.restart();
        assert.deepEqual(await c.native.vault.getStorageEncryptionKey(), key);
    }, false);

    // Read/retry fencing must also handle a failed deletion and a failed wipe.
    for (const action of ['purge', 'clear']) await scenario(async (c) => {
        await c.native.fault(0, 1, true);
        await assert.rejects(c.native.call(action, 'A'), /persist/);
        await c.native.call('newManager');
        await assert.rejects(c.native.vault.exist('A'), /persist/);
        await c.native.fault();
        await c.native.call(action, 'A');
        assert.equal(await c.native.vault.exist('A'), false);
        assert.equal(await c.native.call('keyExists', 'A'), 'false');
        if (action === 'clear') {
            assert.equal(await c.native.call('keyExists', 'B'), 'false');
        }
        await c.restart();
        assert.equal(await c.native.vault.exist('A'), false);
    });

    await scenario(async (c) => {
        await c.native.fault(0, 1, true);
        await assert.rejects(c.native.call('purge', 'A'), /persist/);
        await c.native.fault();
        await c.native.call('clear');
        for (const name of ['A', 'B']) assert.equal(await c.native.call('keyExists', name), 'false');
        await c.restart();
        for (const name of ['A', 'B']) assert.equal(await c.native.vault.exist(name), false);
    });

    await scenario(async (c) => {
        assert.equal(await c.native.call('race'), 'true');
        await c.restart(); await c.verify();
    });

    // Prove that Realm's settings commit survives abrupt JS process death,
    // without relying on close() to flush it.
    const realmKillFile = path.join(testRoot, 'realm-kill.realm');
    const { spawnSync } = require('node:child_process');
    const realmKill = spawnSync(process.execPath, ['-e', `
        const R=require('realm');const Realm=R.default||R;
        const realm=new Realm({path:process.argv[1],encryptionKey:Buffer.alloc(64,7),
          schema:[{name:'Settings',primaryKey:'id',properties:{id:'int',passcode:'string'}}]});
        realm.write(()=>realm.create('Settings',{id:1,passcode:'new'}));
        process.kill(process.pid,'SIGKILL');
    `, realmKillFile], { cwd: ROOT, encoding: 'utf8' });
    assert.equal(realmKill.signal, 'SIGKILL');
    const killedSettings = new Realm({
        path: realmKillFile, encryptionKey: Buffer.alloc(64, 7),
        schema: [{ name: 'Settings', primaryKey: 'id', properties: { id: 'int', passcode: 'string' } }],
    });
    assert.equal(killedSettings.objectForPrimaryKey('Settings', 1).passcode, 'new');
    killedSettings.close();

    process.stdout.write(JSON.stringify({
        cases, changeBoundaries: changeTrace.length, recoveryBoundaries: recoveryTrace.length,
        encryptedRealm: true, nativeClasses: ['PrefsStorage', 'Keychain', 'VaultManagerModule'],
        hardware: 'explicit host double', result: 'passed',
    }) + '\n');
}

main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => {
    fs.rmSync(testRoot, { recursive: true, force: true });
    process.exit(process.exitCode || 0);
});
