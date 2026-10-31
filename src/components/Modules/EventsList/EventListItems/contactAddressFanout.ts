export type ContactAddressEvent = 'contactCreate' | 'contactUpdate' | 'contactRemove';

export type ContactAddressListener = (contact?: { address?: string }) => void;

export interface ContactAddressSource {
    on(event: ContactAddressEvent, listener: ContactAddressListener): void;
    off(event: ContactAddressEvent, listener: ContactAddressListener): void;
}

const CONTACT_ADDRESS_EVENTS: ContactAddressEvent[] = ['contactCreate', 'contactUpdate', 'contactRemove'];

/**
 * One repository subscription shared by every event row.
 * Each row only re-resolves when the changed address is the one it is showing.
 */
export function createContactAddressFanout(source: ContactAddressSource) {
    const listeners = new Set<(address: string) => void>();
    let bound = false;

    const onRepositoryEvent: ContactAddressListener = (contact) => {
        const address = contact?.address;
        if (!address) {
            return;
        }

        listeners.forEach((listener) => {
            listener(address);
        });
    };

    const ensureBound = () => {
        if (bound) {
            return;
        }

        bound = true;
        CONTACT_ADDRESS_EVENTS.forEach((event) => {
            source.on(event, onRepositoryEvent);
        });
    };

    return {
        subscribe(listener: (address: string) => void) {
            ensureBound();
            listeners.add(listener);

            return () => {
                listeners.delete(listener);
            };
        },
    };
}
