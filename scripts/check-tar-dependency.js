#!/usr/bin/env node
/**
 * The `tar` package of the Expo tools (issue 546): the two places of @expo/cli that unpack an archive, run for real
 * with the installed tar. Prints "tar <version>: ok", or the fault and exit code 1.
 *
 * See scripts/__tests__/tarDependency.test.js for the why. Plain Node on purpose: the unit test environment gives
 * an empty `fs` to every module (the rewrite-require alias of babel.config.js), so this cannot run inside a jest test.
 */
/* eslint-disable no-console */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'xaman-tar-'));
const savedPath = process.env.PATH;

const main = async () => {
    fs.mkdirSync(path.join(dir, 'src', 'pkg', 'sub'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'src', 'pkg', 'a.txt'), 'hello');
    fs.writeFileSync(path.join(dir, 'src', 'pkg', 'sub', 'b.txt'), 'deep');
    const archive = path.join(dir, 'pkg.tgz');
    execFileSync('tar', ['-czf', archive, 'pkg'], {
        cwd: path.join(dir, 'src'),
        env: { ...process.env, COPYFILE_DISABLE: '1' },
    });
    const same = (file, text) => {
        if (fs.readFileSync(file, 'utf8') !== text) throw new Error(`${file} is not as packed`);
    };

    // 1. extractAsync uses the tar tool of the machine first. Without one it must use the JavaScript tar.
    // eslint-disable-next-line global-require, import/no-extraneous-dependencies
    const { extractAsync } = require('@expo/cli/build/src/utils/tar');
    const outFile = path.join(dir, 'out-file');
    fs.mkdirSync(outFile);
    const { log } = console;
    console.log = () => {};
    process.env.PATH = path.join(dir, 'no-tools-here');
    try {
        // proof that the tar tool cannot run here: else it would unpack the archive, and the JavaScript tar is not used
        const tool = spawnSync('tar', ['--version']);
        if (!tool.error || tool.error.code !== 'ENOENT') throw new Error('the tar tool of the machine is still found');
        await extractAsync(archive, outFile);
    } finally {
        process.env.PATH = savedPath;
        console.log = log;
    }
    same(path.join(outFile, 'pkg', 'a.txt'), 'hello');
    same(path.join(outFile, 'pkg', 'sub', 'b.txt'), 'deep');

    // 2. extractNpmTarballAsync: an archive that comes in as a stream (a template from npm)
    // eslint-disable-next-line global-require, import/no-extraneous-dependencies
    const { extractNpmTarballAsync } = require('@expo/cli/build/src/utils/npm');
    const outStream = path.join(dir, 'out-stream');
    fs.mkdirSync(outStream);
    await extractNpmTarballAsync(fs.createReadStream(archive), { cwd: outStream, name: 'probe', strip: 1 });
    same(path.join(outStream, 'a.txt'), 'hello');
    same(path.join(outStream, 'sub', 'b.txt'), 'deep');

    // eslint-disable-next-line global-require, import/no-extraneous-dependencies
    console.log(`tar ${require('tar/package.json').version}: ok`);
};

main()
    .catch((error) => {
        console.log(`tar check failed: ${error && error.message}`);
        process.exitCode = 1;
    })
    .finally(() => {
        process.env.PATH = savedPath;
        fs.rmSync(dir, { recursive: true, force: true });
    });
