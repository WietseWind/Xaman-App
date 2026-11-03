import React from 'react';
import { Text } from 'react-native';
import { Icon } from '@components/General/Icon';
import { AppStyles } from '@theme';
import renderer from 'react-test-renderer';
import { binary } from 'xrpl-accountlib';
import NetworkService from '@services/NetworkService';
import { AccountRepository } from '@store/repositories';
import { TransactionFactory, LedgerObjectFactory, ExplainerFactory } from '@common/libs/ledger/factory';
import { createNetworkDefinitions } from '@common/libs/ledger/utils/normalizeDefinitions';
import { InfoMessage } from '@components/General/InfoMessage';
import AccountElement from '@components/Modules/AccountElement/AccountElement';
import DelegateSetTemplate from '@screens/Modal/ReviewTransaction/Steps/Review/Templates/genuine/DelegateSet';
import BatchTemplate from '@screens/Modal/ReviewTransaction/Steps/Review/Templates/genuine/Batch';
import DelegationWidget from '@components/Modules/MutationWidgets/Delegation';
import DelegationDetails from '../DelegationDetails';

jest.mock('@services/NetworkService');
jest.mock('@components/Modules/AccountElement/AccountElement', () => ({
    __esModule: true, default: () => null,
}));
jest.mock('@components/Modules', () => ({ AccountElement: () => null }));
jest.mock('@screens/Modal/ReviewTransaction/Steps/Review/Templates/genuine/registry', () => ({
    DelegateSet: jest.requireActual(
        '@screens/Modal/ReviewTransaction/Steps/Review/Templates/genuine/DelegateSet',
    ).default,
    Global: () => null,
}));

const owner = 'rQQQrUdN1cLdNmxH4dHfKgmX5P4kf3ZrM';
const delegate = 'rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh';
const account = { address: owner } as any;
const defs = createNetworkDefinitions(binary.DEFAULT_DEFINITIONS);
const permissions = (values: (number | string)[]) => values.map(value => ({ Permission: { PermissionValue: value } }));
const json = { TransactionType: 'DelegateSet', Account: owner, Authorize: delegate, Permissions: permissions([1]) };
const text = (tree: renderer.ReactTestRenderer) => tree.root.findAllByType(Text)
    .map(node => node.props.children).flat().join(' ');

beforeEach(() => {
    jest.spyOn(AccountRepository, 'findOne').mockReturnValue(undefined);
    jest.spyOn(NetworkService, 'getNetworkDefinitions').mockReturnValue(defs);
    jest.spyOn(NetworkService, 'getRawNetworkDefinitions').mockReturnValue(defs.rawDefinitions);
});
afterEach(() => jest.restoreAllMocks());

it('shows both resolving account blocks and all ten permissions with no text truncation', () => {
    const values = [1, 2, 3, 4, 5, 6, 7, 8, 9, 65545];
    const tree = renderer.create(<DelegationDetails owner={owner} authorize={delegate} mode="grant"
        permissions={permissions(values)} transactionTypes={defs.rawDefinitions.TRANSACTION_TYPES} />);
    expect(tree.root.findAllByType(AccountElement).map(node => node.props.address)).toEqual([owner, delegate]);
    expect(tree.root.findAll(node => node.props.testID?.startsWith('delegation-permission-') &&
        typeof node.type !== 'string')).toHaveLength(10);
    expect(text(tree)).toContain('Previous permissions not listed will be revoked');
    expect(text(tree)).toContain('Create more of your issued tokens');
    tree.root.findAllByType(Text).forEach(node => expect(node.props.numberOfLines).toBeUndefined());
});

it('uses the red icon color for a critical permission and the normal color otherwise', () => {
    const critical = renderer.create(<DelegationDetails owner={owner} authorize={delegate} mode="grant"
        permissions={permissions(['Payment'])} transactionTypes={{ Payment: 0 }} />);
    expect(critical.root.findByType(Icon).props.style).toEqual(
        expect.arrayContaining([AppStyles.imgColorRed]),
    );
    const safe = renderer.create(<DelegationDetails owner={owner} authorize={delegate} mode="grant"
        permissions={permissions(['NFTokenModify'])} transactionTypes={{ NFTokenModify: 61 }} />);
    expect(safe.root.findByType(Icon).props.style).not.toEqual(
        expect.arrayContaining([AppStyles.imgColorRed]),
    );
});

it('gives an explicit warning for a future permission while retaining the general delegation explanation', () => {
    const tree = renderer.create(<DelegationDetails owner={owner} authorize={delegate} mode="object"
        permissions={permissions([4095])} transactionTypes={{ FuturePermission: 4094 }} />);
    expect(text(tree)).toContain('FuturePermission');
    expect(text(tree)).toContain('cannot explain');
    expect(text(tree)).toContain('do not proceed');
    expect(text(tree)).toContain('without approving each use');
    expect(tree.root.findAllByType(InfoMessage).some(node => node.props.type === 'error')).toBe(true);
});

it('explains that revocation affects only this account pair and does not show a grant list', () => {
    const tree = renderer.create(<DelegationDetails owner={owner} authorize={delegate} mode="revoke"
        permissions={[]} transactionTypes={defs.rawDefinitions.TRANSACTION_TYPES} />);
    expect(text(tree)).toContain('Other delegations are unchanged');
    expect(text(tree)).not.toContain('Signing permissions to grant');
    expect(text(tree)).not.toContain('Signing permissions granted');
    expect(text(tree)).toContain('Account revoking permissions');
    expect(text(tree)).toContain('Account losing permissions');
    expect(text(tree)).not.toContain('Account granting permissions');
    expect(text(tree)).not.toContain('Account receiving permissions');
    expect(text(tree)).not.toContain('This list replaces');
    expect(tree.root.findAllByType(AccountElement).map(node => node.props.address)).toEqual([owner, delegate]);
});

it('names held permissions on a ledger object and lists the permissions a revoke will remove', () => {
    const held = renderer.create(<DelegationDetails owner={owner} authorize={delegate} mode="object"
        permissions={permissions(['NFTokenModify'])} transactionTypes={{ NFTokenModify: 61 }} />);
    expect(text(held)).toContain('Signing permissions granted');
    expect(text(held)).not.toContain('Signing permissions to grant');
    const revoke = renderer.create(<DelegationDetails owner={owner} authorize={delegate} mode="revoke"
        permissions={permissions(['NFTokenModify'])} transactionTypes={{ NFTokenModify: 61 }} />);
    expect(text(revoke)).toContain('Signing permissions to revoke');
    expect(text(revoke)).toContain('Modify NFT');
    expect(text(revoke)).not.toContain('Signing permissions to grant');
});

it('uses the same component and pinned permission definitions for review, history and ledger objects', () => {
    const transaction = TransactionFactory.fromJson(json as any);
    const before = binary.encode(transaction.JsonForSigning, defs);
    const template = renderer.create(<DelegateSetTemplate transaction={transaction as any} source={account} /> as any);
    const history = renderer.create(<DelegationWidget item={transaction as any} account={account} /> as any);
    const item = LedgerObjectFactory.fromLedger({ ...json, TransactionType: undefined, LedgerEntryType: 'Delegate',
        index: 'A'.repeat(64), OwnerNode: '0', Flags: 0 } as any)!;
    const object = renderer.create(<DelegationWidget item={item} account={account} /> as any);
    for (const tree of [template, history, object]) {
        const details = tree.root.findByType(DelegationDetails);
        expect(details.props.owner).toBe(owner);
        expect(details.props.authorize).toBe(delegate);
        expect(text(tree)).toContain('destination and amount');
    }
    expect(transaction.JsonForSigning.Permissions).toEqual(json.Permissions);
    expect(binary.encode(transaction.JsonForSigning, defs)).toBe(before);
    expect(object.root.findByType(DelegationDetails).props.mode).toBe('object');
    expect(ExplainerFactory.fromLedgerObject(item, account)!.getParticipants()).toEqual({
        start: { address: owner, tag: undefined }, end: { address: delegate, tag: undefined },
    });
    jest.mocked(NetworkService.getRawNetworkDefinitions).mockReturnValue({ TRANSACTION_TYPES: { Payment: 61 } });
    expect(object.root.findByType(DelegationDetails).props.transactionTypes)
        .toEqual(defs.rawDefinitions.TRANSACTION_TYPES);
});

it('renders every DelegateSet inner transaction in a Batch with its own delegate', () => {
    const secondDelegate = 'rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe';
    const batch = TransactionFactory.fromJson({ TransactionType: 'Batch', Account: owner, Flags: 65536,
        RawTransactions: [
            { RawTransaction: { ...json, Flags: 1073741824, Sequence: 1, Fee: '0' } },
            { RawTransaction: { ...json, Authorize: secondDelegate, Flags: 1073741824, Sequence: 2, Fee: '0' } },
        ] } as any);
    const template = new BatchTemplate({ transaction: batch, source: account } as any);
    const tree = renderer.create(<>{template.renderInnerTransactions()}</>);
    expect(tree.root.findAllByType(DelegationDetails).map(node => node.props.authorize))
        .toEqual([delegate, secondDelegate]);
});
