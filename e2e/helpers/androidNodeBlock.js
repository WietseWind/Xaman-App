// Block the node of a network on an Android emulator, and only that: the phone keeps its network, and the
// Xaman backend stays reachable. This is the case the app did not recover from: the node can not be reached
// for some seconds while the phone still has a network (issue: the connection gave up for good).
//
// Needs adbd as root (iptables). The runner asks for it when it starts an emulator (scripts/e2e/
// run-throwaway.sh); a phone, or an image without root, can not do this and the scenarios are skipped.
const dns = require('dns').promises;
const { execFileSync } = require('child_process');

const { androidSerial } = require('./androidSerial');

// host -> the addresses that are blocked for it now
const blocked = new Map();

const adb = (args, options = {}) =>
    execFileSync('adb', ['-s', androidSerial(), ...args], { timeout: 15000, encoding: 'utf8', ...options });

/** Can this device block a host? Only an emulator with adbd as root. */
const canBlockNodes = () => {
    try {
        if (!/^emulator-/.test(androidSerial())) {
            return false;
        }
        return adb(['shell', 'id', '-u']).trim() === '0';
    } catch (e) {
        return false;
    }
};

const addresses = async (host) => {
    const v4 = await dns.resolve4(host).catch(() => []);
    const v6 = await dns.resolve6(host).catch(() => []);
    if (!v4.length && !v6.length) {
        throw new Error(`no address for ${host}`);
    }
    return { v4, v6 };
};

// both ways: what the emulator sends to the address, and what comes from it
const rule = (table, action, address) => {
    [
        ['OUTPUT', '-d'],
        ['INPUT', '-s'],
    ].forEach(([chain, side]) => {
        try {
            adb(['shell', table, `-${action}`, chain, side, address, '-j', 'DROP'], { stdio: 'pipe' });
        } catch (e) {
            // ip6tables on an emulator without IPv6, or a rule that is gone already
        }
    });
};

/**
 * Drop everything between the emulator and this host, without an answer: a new connection gets no reply
 * (as on a network that lost its way), and the phone still has its network.
 */
const blockHost = async (host) => {
    if (blocked.has(host)) {
        return;
    }
    const found = await addresses(host);
    found.v4.forEach((address) => rule('iptables', 'I', address));
    found.v6.forEach((address) => rule('ip6tables', 'I', address));
    blocked.set(host, found);
};

const unblockHost = (host) => {
    const found = blocked.get(host);
    if (!found) {
        return;
    }
    found.v4.forEach((address) => rule('iptables', 'D', address));
    found.v6.forEach((address) => rule('ip6tables', 'D', address));
    blocked.delete(host);
};

/** Take every block away: also when a scenario failed half way. */
const unblockAll = () => {
    [...blocked.keys()].forEach(unblockHost);
};

module.exports = { canBlockNodes, blockHost, unblockHost, unblockAll };
