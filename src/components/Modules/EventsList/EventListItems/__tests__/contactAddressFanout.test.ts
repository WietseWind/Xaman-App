import { EventEmitter } from 'events';

import { ContactAddressListener, ContactAddressSource, createContactAddressFanout } from '../contactAddressFanout';

const createSource = (): ContactAddressSource & { emitAddress(address?: string): void } => {
    const emitter = new EventEmitter();

    return {
        on(event, listener: ContactAddressListener) {
            emitter.on(event, listener);
        },
        off(event, listener: ContactAddressListener) {
            emitter.off(event, listener);
        },
        emitAddress(address?: string) {
            emitter.emit('contactCreate', { address });
            emitter.emit('contactUpdate', { address }, {});
            emitter.emit('contactRemove', { address });
        },
    };
};

describe('contactAddressFanout', () => {
    it('binds the repository once and fans a changed address out to current rows', () => {
        const source = createSource();
        const on = jest.spyOn(source, 'on');
        const fanout = createContactAddressFanout(source);
        const first = jest.fn();
        const second = jest.fn();

        const unsubscribeFirst = fanout.subscribe(first);
        fanout.subscribe(second);

        source.emitAddress('rMatch');

        expect(on).toHaveBeenCalledTimes(3);
        expect(first).toHaveBeenCalledTimes(3);
        expect(first).toHaveBeenCalledWith('rMatch');
        expect(second).toHaveBeenCalledTimes(3);

        unsubscribeFirst();
        source.emitAddress('rMatch');

        expect(first).toHaveBeenCalledTimes(3);
        expect(second).toHaveBeenCalledTimes(6);
        expect(on).toHaveBeenCalledTimes(3);
    });

    it('ignores a contact change that has no address', () => {
        const source = createSource();
        const fanout = createContactAddressFanout(source);
        const listener = jest.fn();

        fanout.subscribe(listener);
        source.emitAddress(undefined);
        source.emitAddress('');

        expect(listener).not.toHaveBeenCalled();
    });
});
