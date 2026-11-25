import { formatBackendResponseDetails, shouldShowBackendResponseDetails } from '../backendResponseReport';

describe('backend response reporting', () => {
    it('shows details only for developer mode on a debug or TestFlight build', () => {
        expect(shouldShowBackendResponseDetails(true, true, false)).toBe(true);
        expect(shouldShowBackendResponseDetails(true, false, true)).toBe(true);
        expect(shouldShowBackendResponseDetails(true, false, false)).toBe(false);
        expect(shouldShowBackendResponseDetails(false, true, true)).toBe(false);
    });

    it('formats the method, url, status, and body', () => {
        expect(
            formatBackendResponseDetails({
                method: 'PATCH',
                url: 'https://xaman.app/api/v1/app/payload/abc',
                status: 0,
                body: '{"error":true}',
            }),
        ).toBe('Method: PATCH\nURL: https://xaman.app/api/v1/app/payload/abc\nHTTP: 0\n\n{"error":true}');
    });

    it('notes an empty body', () => {
        expect(
            formatBackendResponseDetails({
                method: 'GET',
                url: 'https://xaman.app/api/v1/app/ping',
                status: 0,
                body: '',
            }),
        ).toContain('(empty)');
    });
});
