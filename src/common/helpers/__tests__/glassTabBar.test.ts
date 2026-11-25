import { glassTabBarHeightFor, glassTabScrollPaddingFor } from '../glassTabBar';

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

describe('glass tab bar cover for a tab state that does not scroll', () => {
    it('is the reach of the floating bar on iOS 26 and 27', () => {
        expect(glassTabBarHeightFor('ios', '26.5', 84)).toBe(84);
        expect(glassTabBarHeightFor('ios', '27.2.1', 84)).toBe(84);
    });

    it('is as much on a phone without a home indicator, where the old tab bar was 50pt', () => {
        expect(glassTabBarHeightFor('ios', '26.5', 50)).toBe(84);
        expect(glassTabBarHeightFor('ios', '27.2', 50)).toBe(84);
    });

    it('follows a taller tab bar', () => {
        expect(glassTabBarHeightFor('ios', '27.0', 96)).toBe(96);
    });

    it('is nothing where the tab bar has its own space', () => {
        expect(glassTabBarHeightFor('ios', '18.5', 84)).toBe(0);
        expect(glassTabBarHeightFor('ios', 15, 50)).toBe(0);
        expect(glassTabBarHeightFor('android', 36, 60)).toBe(0);
        expect(glassTabBarHeightFor('android', '27', 60)).toBe(0);
    });

    it('never drops below the reach of the bar when the height is unknown', () => {
        expect(glassTabBarHeightFor('ios', '27.0', -10)).toBe(84);
        expect(glassTabBarHeightFor('ios', '27.0', NaN)).toBe(84);
    });
});
