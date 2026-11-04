// import './.cosmos/cosmos.app';

import './debug';
import './global';
// resolve images from a downloaded over-the-air update instead of the app bundle
import 'expo-asset';

import Application from './src/app';

// run the app
Application.run();
