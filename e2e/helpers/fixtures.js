const fetch = require('node-fetch');
const { XrplClient } = require('xrpl-client');
const AccountLib = require('xrpl-accountlib');

let testNetCredits;

// generate family seed
const generateMnemonic = () => {
    const generatedAccount = AccountLib.generate.mnemonic();

    return generatedAccount.secret.mnemonic.split(' ');
};

// generate family seed
const generateFamilySeed = () => {
    const generatedAccount = AccountLib.generate.familySeed();

    return generatedAccount.secret.familySeed;
};

// generate secret numbers
const generateSecretNumbers = () => {
    const generatedAccount = AccountLib.generate.secretNumbers();

    const numbers = [...Array(8)].map(() => Array(6));
    for (let r = 0; r < 8; r++) {
        const row = generatedAccount.secret.secretNumbers[r].split('');
        for (let c = 0; c < 6; c++) {
            numbers[r][c] = row[c];
        }
    }
    return numbers;
};

const sleep = (ms) =>
    new Promise((resolve) => {
        setTimeout(resolve, ms);
    });

// get funded testnet account
const generateTestnetAccount = async () => {
    if (testNetCredits) {
        return testNetCredits;
    }

    // the faucet rate-limits per IP, retry with backoff
    for (let attempt = 0; attempt < 6; attempt++) {
        const resp = await fetch('https://xahau-test.net/newcreds', { method: 'POST' });
        const json = await resp.json();

        if (json.secret && json.address) {
            testNetCredits = {
                address: json.address,
                secret: json.secret,
            };
            break;
        }

        await sleep(15000);
    }

    if (!testNetCredits) {
        throw new Error('unable to get funded account from the testnet faucet');
    }

    // give the faucet funding transaction time to validate
    await sleep(10000);

    return testNetCredits;
};

const activateAccount = async (address) => {
    const fundedAccount = await generateTestnetAccount();

    const Connection = new XrplClient('wss://xahau-test.net');

    await Connection.ready();

    try {
        const accountInfo = await Connection.send({
            command: 'account_info',
            account: fundedAccount.address,
        });

        if (!accountInfo.account_data) {
            throw new Error(`funded account not found on ledger: ${accountInfo.error}`);
        }

        const Transaction = {
            TransactionType: 'Payment',
            Account: fundedAccount.address,
            Destination: address,
            Amount: '100000000',
            Fee: '1000',
            NetworkID: 21338,
            Sequence: accountInfo.account_data.Sequence,
        };

        const signedObject = AccountLib.sign(Transaction, AccountLib.derive.familySeed(fundedAccount.secret));

        const submitResult = await Connection.send({
            command: 'submit',
            tx_blob: signedObject.signedTransaction,
        });

        if (submitResult.engine_result !== 'tesSUCCESS') {
            throw new Error(`activation payment failed: ${submitResult.engine_result}`);
        }

        // only return once the destination account actually exists on ledger
        for (let attempt = 0; attempt < 10; attempt++) {
            await sleep(3000);
            const destinationInfo = await Connection.send({
                command: 'account_info',
                account: address,
            });
            if (destinationInfo.account_data) {
                return;
            }
        }

        throw new Error('activation payment did not validate in time');
    } finally {
        Connection.close();
    }
};

module.exports = {
    activateAccount,
    generateTestnetAccount,
    generateSecretNumbers,
    generateFamilySeed,
    generateMnemonic,
};
