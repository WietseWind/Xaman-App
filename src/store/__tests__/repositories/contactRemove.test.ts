import ContactRepository from '../../repositories/contact';
import { ContactModel } from '@store/models';

it('emits the destinationTag used by resolver invalidation before the Realm object is deleted', async () => {
    const contact = { id: 'test-contact', address: 'rTagged', destinationTag: '123' } as unknown as ContactModel;
    (ContactRepository as any).model = { schema: { primaryKey: 'id' } };
    const remove = jest.spyOn(ContactRepository, 'deleteById').mockImplementation(async () => {
        Object.assign(contact, { destinationTag: undefined });
    });
    const emit = jest.spyOn(ContactRepository, 'emit');
    await ContactRepository.remove(contact);
    expect(emit).toHaveBeenCalledWith('contactRemove', {
        id: 'test-contact', address: 'rTagged', destinationTag: '123',
    });
    remove.mockRestore(); emit.mockRestore();
});
