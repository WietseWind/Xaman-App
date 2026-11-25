// import './.cosmos/cosmos.app';

// must stay first: scrubs secrets from every uncaught error (see docs/crash-reporting.md)
import '@common/libs/crash/install';

import './debug';
import './global';
// resolve images from a downloaded over-the-air update instead of the app bundle
import 'expo-asset';

import Application from './src/app';

// run the app
Application.run();
