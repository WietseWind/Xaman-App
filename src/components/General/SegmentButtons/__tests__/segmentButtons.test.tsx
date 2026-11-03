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

    const footer = tree.root.findByType(FlatList).props.ListFooterComponent;
    expect(footer.props.style.width).toBe(AppSizes.paddingSml);
});

it('scrolls the selected last tab into view', () => {
    const scrollToOffset = jest.fn();
    const buttons = new SegmentButtons({
        activeButton: 'AUTHORISATIONS',
        onItemPress: () => undefined,
        buttons: [
            { label: 'All', value: 'ALL' },
            { label: 'Authorisations', value: 'AUTHORISATIONS' },
        ],
    });
    buttons.list = { current: { scrollToOffset } } as any;
    buttons.contentWidth = 320;
    buttons.viewportWidth = 200;
    buttons.offset = 100;
    buttons.revealActive();
    expect(scrollToOffset).toHaveBeenCalledWith({ offset: 120, animated: false });
    scrollToOffset.mockClear();
    buttons.offset = 120;
    buttons.revealActive();
    expect(scrollToOffset).not.toHaveBeenCalled();
});
