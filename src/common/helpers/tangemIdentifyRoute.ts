import { get } from 'lodash';
import { Navigation } from 'react-native-navigation';

import { AppScreens } from '@common/constants';
import { hasTangemIdentifyExit, prepareForTangemIdentifyNavigation } from '@common/utils/tangemIdentifyNavigation';
import NavigationService from '@services/NavigationService';

export interface TangemIdentifyRoute {
    release: () => void;
    needsPreparation: () => boolean;
    prepare: () => Promise<boolean>;
    fork: () => TangemIdentifyRoute;
}

type RouteContext = {
    root: ReturnType<typeof NavigationService.getCurrentRoot>;
    interrupted: boolean;
    changedRoot: boolean;
    requestedLock: boolean;
};

/** Records context while a route waits; it only constrains routes interrupted by Identify. */
export const captureTangemIdentifyRoute = (inherited?: RouteContext): TangemIdentifyRoute => {
    const root = inherited?.root ?? NavigationService.getCurrentRoot();
    let interrupted = !!inherited?.interrupted || hasTangemIdentifyExit();
    let changedRoot = !!inherited?.changedRoot;
    let requestedLock = !!inherited?.requestedLock ||
        NavigationService.getCurrentOverlay() === AppScreens.Overlay.Lock;
    let released = false;
    let commandListener: { remove: () => void } | undefined;
    const onRootChange = () => { changedRoot = true; };
    const release = () => {
        if (released) return;
        released = true;
        NavigationService.off('setRoot', onRootChange);
        commandListener?.remove();
    };
    const valid = () => !released && !changedRoot && !requestedLock &&
        NavigationService.getCurrentRoot() === root &&
        NavigationService.getCurrentOverlay() !== AppScreens.Overlay.Lock;
    try {
        NavigationService.on('setRoot', onRootChange);
        commandListener = Navigation.events().registerCommandListener((name, params) => {
            if (name === 'setRoot') changedRoot = true;
            if (name === 'showOverlay' && (
                get(params, 'layout.id') === AppScreens.Overlay.Lock ||
                get(params, 'layout.data.name') === AppScreens.Overlay.Lock ||
                get(params, 'layout.component.id') === AppScreens.Overlay.Lock ||
                get(params, 'layout.component.name') === AppScreens.Overlay.Lock
            )) requestedLock = true;
        });
    } catch (error) {
        release();
        throw error;
    }
    return {
        release,
        needsPreparation: () => interrupted || hasTangemIdentifyExit(),
        // A decoded link can still fetch data or wait on its existing timer after
        // the entry guard closes Identify. Preserve that interrupted context.
        fork: () => captureTangemIdentifyRoute({
            root, interrupted, changedRoot: changedRoot || released, requestedLock,
        }),
        prepare: async (): Promise<boolean> => {
            interrupted = interrupted || hasTangemIdentifyExit();
            if (!interrupted) return !released;
            if (!valid()) return false;
            // Native Cancel remains available. This waits for the owned scan and cleanup.
            await prepareForTangemIdentifyNavigation(valid);
            return valid();
        },
    };
};
