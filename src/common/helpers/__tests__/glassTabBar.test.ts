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

describe('glass tab bar cover with a safe area on a side (iPhone Duo: the bar stands on that side)', () => {
    it('does not change when there is no safe area on a side', () => {
        [50, 84, 96].forEach((tabbar) => {
            ['26.5', '27.2'].forEach((version) => {
                const before = glassTabBarHeightFor('ios', version, tabbar);
                expect(glassTabBarHeightFor('ios', version, tabbar, { sideInsets: 0, bottomInset: 34 })).toBe(before);
                expect(glassTabBarHeightFor('ios', version, tabbar, { sideInsets: 0, bottomInset: 0 })).toBe(before);
                expect(glassTabBarHeightFor('ios', version, tabbar, { sideInsets: -3, bottomInset: 34 })).toBe(before);
                expect(glassTabBarHeightFor('ios', version, tabbar, { sideInsets: NaN, bottomInset: 34 })).toBe(before);
            });
        });
    });

    it('is only the safe area at the end of the screen when the bar is on a side', () => {
        expect(glassTabBarHeightFor('ios', '27.2', 84, { sideInsets: 84, bottomInset: 34 })).toBe(34);
        expect(glassTabBarHeightFor('ios', '27.2', 84, { sideInsets: 84, bottomInset: 0 })).toBe(0);
        expect(glassTabBarHeightFor('ios', '27.2', 84, { sideInsets: 84, bottomInset: NaN })).toBe(0);
        expect(glassTabBarHeightFor('ios', '27.2', 84, { sideInsets: 84, bottomInset: -2 })).toBe(0);
    });

    it('stays nothing where the tab bar has its own space', () => {
        expect(glassTabBarHeightFor('ios', '18.5', 84, { sideInsets: 84, bottomInset: 34 })).toBe(0);
        expect(glassTabBarHeightFor('android', 36, 60, { sideInsets: 84, bottomInset: 34 })).toBe(0);
    });
});
