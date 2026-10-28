import React from 'react';
import { Text, View } from 'react-native';

import AccountElement from '@components/Modules/AccountElement/AccountElement';
import { Icon } from '@components/General/Icon';
import { InfoMessage } from '@components/General/InfoMessage';
import { delegationPermissionDetail, delegationPermissionValues } from '@common/libs/ledger/utils/delegationDetails';
import Localize from '@locale';
import { AppStyles } from '@theme';
import styles from './styles';

export interface Props {
    owner?: string;
    authorize?: string;
    permissions?: unknown[];
    transactionTypes: Record<string, number>;
    nativeAsset?: string;
    mode: 'grant' | 'revoke' | 'object';
}

const DelegationDetails = ({ owner, authorize, permissions, transactionTypes, nativeAsset, mode }: Props) => {
    const values = delegationPermissionValues(permissions);
    return (
        <View testID="delegation-details">
            <InfoMessage type={mode === 'revoke' ? 'neutral' : 'warning'}
                label={Localize.t(mode === 'revoke' ? 'delegation.revokeExplanation' : 'delegation.explanation')} />
            <Text style={styles.label}>
                {Localize.t(mode === 'revoke' ? 'delegation.ownerRevoke' : 'delegation.owner')}
            </Text>
            {owner ? <AccountElement address={owner} containerStyle={styles.account} />
                : <Text style={styles.value}>{Localize.t('txDelegateSet.empty')}</Text>}
            <Text style={styles.label}>
                {Localize.t(mode === 'revoke' ? 'delegation.delegateRevoke' : 'delegation.delegate')}
            </Text>
            {authorize ? <AccountElement address={authorize} containerStyle={styles.account} />
                : <Text style={styles.value}>{Localize.t('txDelegateSet.empty')}</Text>}
            {mode === 'grant' && <InfoMessage type="warning" label={Localize.t('delegation.replacesPermissions')} />}
            {mode !== 'revoke' && <Text style={styles.value}>{Localize.t('delegation.wholeTransaction')}</Text>}
            {mode !== 'revoke' && (
                <>
                    <Text style={styles.label}>{Localize.t('txDelegateSet.permissionsGranted')}</Text>
                    {values.length === 0 && (
                        <Text style={styles.value}>{Localize.t('global.noInformationToShow')}</Text>
                    )}
                    {values.map((value, index) => {
                        const detail = delegationPermissionDetail(value, transactionTypes, nativeAsset);
                        return (
                            <View key={`${index}-${detail.name}`} style={styles.permission}
                                testID={`delegation-permission-${index}`}>
                                <View style={styles.heading}>
                                    <Icon
                                        name={detail.icon}
                                        size={22}
                                        style={[styles.icon, detail.critical && AppStyles.imgColorRed]}
                                    />
                                    <Text selectable style={[styles.title, detail.critical && AppStyles.colorRed]}>
                                        {detail.action}
                                    </Text>
                                </View>
                                {detail.name !== detail.action && (
                                    <Text selectable style={styles.protocolName}>{detail.name}</Text>
                                )}
                                <Text selectable style={styles.value}>{detail.explanation}</Text>
                                <InfoMessage type={detail.critical ? 'error' : 'warning'} label={detail.risk} />
                            </View>
                        );
                    })}
                </>
            )}
        </View>
    );
};

export default DelegationDetails;
