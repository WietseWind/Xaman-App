// import './.cosmos/cosmos.app';

// must stay first: scrubs secrets from every uncaught error (see docs/crash-reporting.md)
import '@common/libs/crash/install';

import './debug';
import './global';

import Application from './src/app';

// run the app
Application.run();
