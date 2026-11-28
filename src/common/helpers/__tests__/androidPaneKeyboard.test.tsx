import React, { useRef } from 'react';
import renderer, { act } from 'react-test-renderer';
import { View } from 'react-native';

import { paneHeightAboveKeyboard, useAndroidPaneKeyboard } from '../androidPaneKeyboard';

const mockHandlers: Record<string, () => void> = {};
const mockQuery = jest.fn();
const mockRelease = jest.fn();
const mockWatch = jest.fn();
let mockFrame: () => void;
jest.mock('../androidKeyboardGeometry', () => ({
    watchAndroidKeyboardGeometry: (callback: () => void) => mockWatch(callback),
}));
jest.mock('react-native', () => ({
    View: 'View',
    NativeModules: { KeyboardModule: { getWindowGeometry: () => mockQuery() } },
    Keyboard: { addListener: (name: string, callback: () => void) => {
        mockHandlers[name] = callback;
        return { remove: () => { delete mockHandlers[name]; } };
    } },
}));

const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
let latest: ReturnType<typeof useAndroidPaneKeyboard>;
const Probe = ({ active }: { active: boolean }) => {
    const ref = useRef<View>(null);
    latest = useAndroidPaneKeyboard(active, ref, 600, 411);
    return <View ref={ref} onLayout={latest.onLayout} />;
};

beforeEach(() => {
    jest.clearAllMocks();
    mockQuery.mockResolvedValue({ keyboardTop: 411, visible: false });
    mockWatch.mockImplementation((callback) => { mockFrame = callback; return mockRelease; });
});

it('uses the actual viewport origin and bounds a 350dp card above a 150dp keyboard boundary', () => {
    const visibleHeight = paneHeightAboveKeyboard(411, 30, 180);
    const cardHeight = Math.min(350, visibleHeight - 20);
    const bottomMargin = 411 - visibleHeight;
    const cardTop = (411 - bottomMargin - cardHeight) / 2;
    expect(visibleHeight).toBe(150);
    expect(cardTop).toBe(10);
    expect(30 + cardTop + cardHeight).toBeLessThan(180);
    expect(paneHeightAboveKeyboard(411, 30, 20)).toBe(0);
    expect(paneHeightAboveKeyboard(411, 30, 900)).toBe(411);
});

it('leases frames only for a full-pane IME, clears on hide, and ignores late work after leaving split', async () => {
    let tree: renderer.ReactTestRenderer;
    await act(async () => {
        tree = renderer.create(<Probe active={false} />, { createNodeMock: () => ({
            measureInWindow: (callback: any) => callback(0, 30, 600, 411),
        }) });
        await flush();
    });
    expect(mockQuery).not.toHaveBeenCalled();
    await act(async () => { tree!.update(<Probe active />); await flush(); });
    expect(mockWatch).not.toHaveBeenCalled();
    await act(async () => {
        mockQuery.mockResolvedValue({ keyboardTop: 180, visible: true });
        mockHandlers.keyboardDidShow();
        await flush();
    });
    expect(latest.availableHeight).toBe(150);
    expect(mockWatch).toHaveBeenCalledTimes(1);
    await act(async () => { mockHandlers.keyboardDidHide(); await flush(); });
    expect(latest.availableHeight).toBe(411);
    expect(mockRelease).toHaveBeenCalledTimes(1);
    let resolve: (value: any) => void = () => undefined;
    mockQuery.mockImplementation(() => new Promise((done) => { resolve = done; }));
    await act(async () => { mockHandlers.keyboardDidShow(); await flush(); });
    const oldFrame = mockFrame;
    await act(async () => { tree!.update(<Probe active={false} />); await flush(); });
    const queries = mockQuery.mock.calls.length;
    await act(async () => { resolve({ keyboardTop: 100, visible: true }); oldFrame(); await flush(); });
    expect(latest.availableHeight).toBe(411);
    expect(mockQuery).toHaveBeenCalledTimes(queries);
    expect(mockRelease).toHaveBeenCalledTimes(2);
    act(() => tree!.unmount());
});
