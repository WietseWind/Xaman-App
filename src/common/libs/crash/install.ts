/**
 * First import in index.js: installs the crash reporter before any other app module runs, so
 * every uncaught error is scrubbed before React Native Firebase, React Native or the native
 * crash handler see it.
 */
import CrashReporter from './reporter';

CrashReporter.install();
