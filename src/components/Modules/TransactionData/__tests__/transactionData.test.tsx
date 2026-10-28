import React from 'react';
import { Text } from 'react-native';
import renderer from 'react-test-renderer';
import { binary, XrplDefinitions } from 'xrpl-accountlib';
import NetworkService from '@services/NetworkService';
import { TransactionFactory } from '@common/libs/ledger/factory';
import { InfoMessage } from '@components/General/InfoMessage';
import JsonTree from '@components/General/JsonTree/JsonTree';
import TransactionData from '../TransactionData';

jest.mock('@services/NetworkService');

const account = 'rQQQrUdN1cLdNmxH4dHfKgmX5P4kf3ZrM';
const hex = 'ABCD'.repeat(256);
const raw = { TransactionType: 'DefinitionOnly', Account: account, Fee: '12', Sequence: 1,
    HookParameters: [{ HookParameter: { HookParameterName: 'AA', HookParameterValue: hex } }] };

beforeEach(() => jest.spyOn(NetworkService, 'getNetworkDefinitions').mockReturnValue(new XrplDefinitions({
    ...binary.DEFAULT_DEFINITIONS,
    TRANSACTION_TYPES: { ...binary.DEFAULT_DEFINITIONS.TRANSACTION_TYPES, DefinitionOnly: 4094 },
} as any)));
afterEach(() => jest.restoreAllMocks());

describe('universal transaction data', () => {
    it('shows the warning and every nested signed field, including full hex and the account', () => {
        const transaction = TransactionFactory.fromJson(raw as any);
        const tree = renderer.create(<TransactionData transaction={transaction} />);
        const warning = tree.root.findByType(InfoMessage);
        expect(warning.props.type).toBe('warning');
        expect(warning.props.label).toContain('no specific screen');
        expect(warning.props.label).toContain('Check all fields');
        expect(warning.props.label).toContain('Only sign');
        const text = tree.root.findAllByType(Text).map((node) => node.props.children).flat().join(' ');
        expect(text).toContain('DefinitionOnly');
        expect(text).toContain(account);
        expect(text).toContain('HookParameterValue');
        expect(text).toContain(hex);
        expect(tree.root.findAllByType(Text).filter((node) => node.props.children === `"${hex}"`))
            .toHaveLength(1);
        expect(tree.root.findAllByType(Text).find((node) => node.props.children === `"${hex}"`)!
            .props.numberOfLines).toBeUndefined();
        for (const node of tree.root.findAllByType(JsonTree)) expect(node.instance.state.collapsed).toBe(false);
    });

    it('shows historical fields without requiring them in the current definitions, including null', () => {
        const history = { ...raw, HistoricalField: { Nested: [null, false, 0, 'value'] } };
        const transaction = TransactionFactory.fromJson(history as any);
        const tree = renderer.create(<TransactionData transaction={transaction} history />);
        const text = tree.root.findAllByType(Text).map((node) => node.props.children).flat().join(' ');
        expect(text).toContain('HistoricalField');
        expect(text).toContain('Nested');
        expect(text).toContain('null');
        expect(text).toContain('false');
        expect(text).toContain('value');
        expect(transaction.JsonRaw).toEqual(history);
    });

    it('keeps the existing JSON tree truncation default for other screens', () => {
        const tree = renderer.create(<JsonTree data="a long string" />);
        const value = tree.root.findAllByType(Text).find((node) => node.props.children === '"a long string"');
        expect(value!.props.numberOfLines).toBe(1);
    });
});
