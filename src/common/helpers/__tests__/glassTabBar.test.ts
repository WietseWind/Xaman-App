import { glassTabScrollPaddingFor } from '../glassTabBar';

describe('glass tab bar end padding', () => {
    it('stays off on iOS before the glass tab bar', () => {
        expect(glassTabScrollPaddingFor('ios', '18.5')).toBe(0);
        expect(glassTabScrollPaddingFor('ios', 15)).toBe(0);
    });

    it('is a short clearance on iOS 26 and 27', () => {
        expect(glassTabScrollPaddingFor('ios', '26.5')).toBe(28);
        expect(glassTabScrollPaddingFor('ios', '27.0.1')).toBe(28);
    });

    it('stays off on Android', () => {
        expect(glassTabScrollPaddingFor('android', 36)).toBe(0);
        expect(glassTabScrollPaddingFor('android', '27')).toBe(0);
    });
});
