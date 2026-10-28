import React from 'react';
import { Text, TouchableOpacity } from 'react-native';
import renderer, { act } from 'react-test-renderer';
import { binary, XrplDefinitions } from 'xrpl-accountlib';
import NetworkService from '@services/NetworkService';
import { Payment, SignIn } from '@common/libs/ledger/transactions';
import { TransactionFactory } from '@common/libs/ledger/factory';
import { InfoMessage } from '@components/General/InfoMessage';
import ExtraFields from '../ExtraFields';

jest.mock('@services/NetworkService');

const payment = { TransactionType: 'Payment', Account: 'rKSiVNmweBdFwsS2hiszCEU3a6FEUM9bSn',
    Destination: 'rQHGELnuopj4fWjsrbMA53ViqRLt5bS8Hb', Amount: '1', Fee: '12', Sequence: 1 };

describe('Extra fields review', () => {
    beforeEach(() => jest.spyOn(NetworkService, 'getNetworkDefinitions').mockReturnValue(new XrplDefinitions({
        ...binary.DEFAULT_DEFINITIONS,
        FIELDS: [...binary.DEFAULT_DEFINITIONS.FIELDS, ['HookName', {
            nth: 97, type: 'Blob', isSerialized: true, isSigningField: true, isVLEncoded: true,
        }]],
    } as any)));
    afterEach(() => jest.restoreAllMocks());

    it('is absent for recognized fields and fields the definitions do not know', () => {
        expect(renderer.create(<ExtraFields transaction={new Payment(payment as any)} />).toJSON()).toBeNull();
        const tx = new Payment({ ...payment, NotDefined: 'ignore' } as any);
        expect(renderer.create(<ExtraFields transaction={tx} />).toJSON()).toBeNull();
    });

    it.each(['Payment', 'SignIn', 'DefinitionOnlyTransaction'])('shows exact data and the warning for %s', (type) => {
        const raw = { ...payment, TransactionType: type, HookName: '6177616B656E' };
        const transaction = type === 'SignIn' ? new SignIn(raw as any) : TransactionFactory.fromJson(raw as any);
        const tree = renderer.create(<ExtraFields transaction={transaction} />);
        const text = tree.root.findAllByType(Text).map((node) => node.props.children).join(' ');
        expect(text).toContain('Extra fields');
        expect(text).toContain('HookName');
        expect(text).toContain('awaken');
        expect(text).not.toContain('6177616B656E');
        act(() => { tree.root.findByType(TouchableOpacity).props.onPress(); });
        const toggled = tree.root.findAllByType(Text).map((node) => node.props.children).join(' ');
        expect(toggled).toContain('6177616B656E');
        const warning = tree.root.findByType(InfoMessage);
        expect(warning.props.type).toBe('warning');
        expect(warning.props.label).toContain('Only sign if you understand');
        expect(warning.props.label).toContain('Stop if someone promises');
    });

    it('lists an unimplemented nested object one field at a time', () => {
        const transaction = {
            ExtraFields: [{
                name: 'FutureObject',
                value: { FutureChild: 1, FutureNested: { FutureChild: 2 }, Items: ['aa'] },
            }],
        } as any;
        const text = renderer.create(<ExtraFields transaction={transaction} />).root
            .findAllByType(Text).map((node) => node.props.children).join(' ');
        expect(text).toContain('FutureObject.FutureChild');
        expect(text).toContain('1');
        expect(text).toContain('FutureObject.FutureNested.FutureChild');
        expect(text).toContain('2');
        expect(text).toContain('FutureObject.Items[0]');
        expect(text).toContain('aa');
        expect(text).not.toContain('{');
    });
});
