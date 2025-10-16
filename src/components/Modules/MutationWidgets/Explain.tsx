import React, { PureComponent } from 'react';
import { View, Text, InteractionManager } from 'react-native';

import Localize from '@locale';

import styles from './styles';

/* Types ==================================================================== */
import { Props } from './types';

interface State {
    description?: string;
}

/* Component ==================================================================== */
class Explain extends PureComponent<Props, State> {
    constructor(props: Props) {
        super(props);

        this.state = {
            description: undefined,
        };
    }

    componentDidMount() {
        InteractionManager.runAfterInteractions(this.setDescription);
    }

    setDescription = () => {
        const { explainer } = this.props;

        this.setState({
            description: explainer?.generateDescription(),
        });
    };

    render() {
        const { description } = this.state;
        const { item } = this.props;

        if (typeof description === 'undefined') {
            return null;
        }

        const parentBatch = (item as any || {})?.MetaData?.ParentBatchID;

        return (
            <View style={styles.detailContainer}>
                <Text style={styles.detailsLabelText}>{Localize.t('global.description')}</Text>
                <Text selectable style={styles.detailsValueText}>
                    {parentBatch && Localize.t('txBatch.thisTxIsPartOfBatchTransaction')}
                    {description}
                </Text>
            </View>
        );
    }
}

export default Explain;
