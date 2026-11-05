/**
 * expo-updates ships ES modules and needs its native module, so Jest can't load it. Tests run as the
 * embedded bundle with updates disabled; a test of UpdateService can override any of these.
 */

export const isEnabled = false;
export const isEmbeddedLaunch = true;
export const isEmergencyLaunch = false;
export const updateId: string | null = null;
export const runtimeVersion: string | null = null;
export const createdAt: Date | null = null;
export const manifest = {};

export const checkForUpdateAsync = jest.fn(async () => ({ isAvailable: false, isRollBackToEmbedded: false }));
export const fetchUpdateAsync = jest.fn(async () => ({ isNew: false, isRollBackToEmbedded: false }));
export const setExtraParamAsync = jest.fn(async () => undefined);
export const reloadAsync = jest.fn(async () => undefined);
