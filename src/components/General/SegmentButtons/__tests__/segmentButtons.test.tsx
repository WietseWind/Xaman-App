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
