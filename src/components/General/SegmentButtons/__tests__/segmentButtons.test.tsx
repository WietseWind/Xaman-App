import React from 'react';
import { FlatList } from 'react-native';
import renderer from 'react-test-renderer';

import { AppSizes } from '@theme';

import SegmentButtons from '../SegmentButtons';

jest.mock('@components/General/Button', () => ({ Button: () => null }));

it('leaves space after the last horizontal tab', () => {
    const tree = renderer.create(
        <SegmentButtons
            activeButton="ALL"
            onItemPress={() => undefined}
            buttons={[
                { label: 'All', value: 'ALL' },
                { label: 'Authorisations', value: 'AUTHORISATIONS' },
            ]}
        />,
    );

    expect(tree.root.findByType(FlatList).props.contentContainerStyle.paddingRight).toBe(AppSizes.paddingSml);
});

it('scrolls the selected last tab into view', () => {
    const scrollToEnd = jest.fn();
    const frame = jest.spyOn(global, 'requestAnimationFrame').mockImplementation((callback) => {
        callback(0);
        return 0;
    });
    const buttons = new SegmentButtons({
        activeButton: 'AUTHORISATIONS',
        onItemPress: () => undefined,
        buttons: [
            { label: 'All', value: 'ALL' },
            { label: 'Authorisations', value: 'AUTHORISATIONS' },
        ],
    });
    buttons.list = { current: { scrollToEnd } } as any;
    buttons.revealActive();
    expect(scrollToEnd).toHaveBeenCalledWith({ animated: false });
    frame.mockRestore();
});
