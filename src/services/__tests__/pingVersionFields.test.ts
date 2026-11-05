/**
 * Regression: over-the-air updates add a separate otaUpdateId to ping. appVersion (devices.device_appVersion)
 * stays the store build's version, also while an update runs.
 */

import { NativeModules } from 'react-native';

import BackendService from '../BackendService';
import ApiService from '../ApiService';
import UpdateService from '../UpdateService';
import PushNotificationsService from '../PushNotificationsService';

import CoreRepository from '@store/repositories/core';
import { AccountRepository } from '@store/repositories';

jest.mock('@services/ApiService', () => ({ __esModule: true, default: { fetch: jest.fn() } }));
jest.mock('@services/LoggerService', () => ({
    __esModule: true,
    default: { createLogger: () => ({ debug: jest.fn(), warn: jest.fn(), error: jest.fn() }) },
}));

const { AppUtilsModule } = NativeModules;

beforeEach(() => {
    jest.clearAllMocks();
    AppUtilsModule.appVersion = '5.4.0';
    AppUtilsModule.buildNumber = '456';
    jest.mocked(ApiService.fetch).mockResolvedValue({});
    jest.spyOn(CoreRepository, 'getSettings').mockReturnValue({
        hideAdvisoryTransactions: true,
        hideServiceFeeTransactions: false,
        showReservePanel: true,
        showPerAssetWorth: false,
        accountWorthActive: true,
    } as any);
    jest.spyOn(CoreRepository, 'getAppCurrency').mockReturnValue('EUR' as any);
    jest.spyOn(CoreRepository, 'isDeveloperModeEnabled').mockReturnValue(false);
    jest.spyOn(AccountRepository, 'getAccounts').mockReturnValue([] as any);
    jest.spyOn(PushNotificationsService, 'getToken').mockResolvedValue('push-token');
});

afterAll(() => {
    AppUtilsModule.appVersion = '0.0.1';
    AppUtilsModule.buildNumber = '1';
});

const pingBody = async () => {
    await BackendService.ping();
    const [endpoint, method, params, body] = jest.mocked(ApiService.fetch).mock.calls[0];
    expect([endpoint, method, params]).toEqual(['/v1/app/ping', 'POST', null]);
    return body;
};

it('store version: appVersion x.y.z.build and otaUpdateId 0', async () => {
    jest.spyOn(UpdateService, 'getOtaUpdateId').mockReturnValue(0);
    const body = await pingBody();
    expect(body.appVersion).toBe('5.4.0.456');
    expect(body.otaUpdateId).toBe(0);
});

it('while update 12 runs: appVersion unchanged, the update only in otaUpdateId', async () => {
    jest.spyOn(UpdateService, 'getOtaUpdateId').mockReturnValue(12);
    const body = await pingBody();
    expect(body.appVersion).toBe('5.4.0.456');
    expect(body.otaUpdateId).toBe(12);
});

it('the payload keeps every field it had', async () => {
    jest.spyOn(UpdateService, 'getOtaUpdateId').mockReturnValue(0);
    const body = await pingBody();
    expect(Object.keys(body).sort()).toEqual(
        [
            'appVersion',
            'otaUpdateId',
            'appLanguage',
            'appCurrency',
            'devicePushToken',
            'developerMode',
            'hideSpamEvents',
            'hideServiceFeeEvents',
            'reserveOnHomescreen',
            'assetPricesOnHomescreen',
            'accountWorthOnHomescreen',
            'accounts',
        ].sort(),
    );
});
