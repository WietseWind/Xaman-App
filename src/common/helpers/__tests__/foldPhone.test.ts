/**
 * The state of a fold phone for JavaScript code (issue 544, iPhone Duo).
 */
import { FoldPhone, foldPhoneStateFor } from '../foldPhone';

const COVER = 466;

describe('the mode, from the window and the place of the app in it', () => {
    it('closed: the cover screen', () => {
        const state = foldPhoneStateFor(
            { width: 466, height: 678 },
            { left: 0, top: 0, width: 382, height: 678 },
            COVER,
        );
        expect(state.mode).toBe('cover');
        expect(state.free).toBeUndefined();
    });

    it('open, the app on the whole inner screen: the left half is free', () => {
        const state = foldPhoneStateFor(
            { width: 951, height: 669 },
            { left: 485, top: 0, width: 382, height: 669 },
            COVER,
        );
        expect(state).toEqual({
            mode: 'open',
            window: { width: 951, height: 669 },
            app: { left: 485, top: 0, width: 382, height: 669 },
            free: { left: 0, top: 0, width: 485, height: 669 },
        });
    });

    it('open, the app at the left edge: the right part is free', () => {
        const state = foldPhoneStateFor(
            { width: 951, height: 669 },
            { left: 84, top: 0, width: 382, height: 669 },
            COVER,
        );
        expect(state.free).toEqual({ left: 466, top: 0, width: 485, height: 669 });
    });

    it('in one half of the screen beside another app', () => {
        const left = foldPhoneStateFor(
            { width: 469, height: 669 },
            { left: 84, top: 0, width: 382, height: 669 },
            COVER,
        );
        const right = foldPhoneStateFor(
            { width: 469, height: 669 },
            { left: 3, top: 0, width: 382, height: 669 },
            COVER,
        );
        expect([left.mode, right.mode]).toEqual(['split', 'split']);
        expect(left.free).toBeUndefined();
    });

    it('open and turned a quarter: a box in the middle', () => {
        const state = foldPhoneStateFor(
            { width: 669, height: 951 },
            { left: 143.5, top: 136.5, width: 382, height: 678 },
            COVER,
        );
        expect(state.mode).toBe('turned');
        expect(state.free).toBeUndefined();
    });

    it('nothing known: none', () => {
        expect(foldPhoneStateFor({ width: 0, height: 0 }, { left: 0, top: 0, width: 0, height: 0 }, COVER).mode).toBe(
            'none',
        );
    });
});

describe('on a phone that is no fold phone nothing ever tells a state', () => {
    it('the mode is none and there is no free area', () => {
        jest.isolateModules(() => {
            // eslint-disable-next-line global-require
            const fresh = require('../foldPhone').FoldPhone;
            expect(fresh.getState().mode).toBe('none');
            expect(fresh.hasFreeArea()).toBe(false);
        });
    });

    it('a listener that fails does not stop the others', () => {
        const seen: string[] = [];
        const bad = FoldPhone.addListener(() => {
            throw new Error('no');
        });
        const good = FoldPhone.addListener((state) => seen.push(state.mode));
        FoldPhone.update(
            foldPhoneStateFor({ width: 951, height: 669 }, { left: 485, top: 0, width: 382, height: 669 }, COVER),
        );
        FoldPhone.update(
            foldPhoneStateFor({ width: 466, height: 678 }, { left: 0, top: 0, width: 382, height: 678 }, COVER),
        );
        expect(seen.slice(-2)).toEqual(['open', 'cover']);
        bad.remove();
        good.remove();
    });
});
