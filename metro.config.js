const { getDefaultConfig } = require('expo/metro-config');

/**
 * Metro configuration
 *
 * Expo's config extends the React Native default. expo-updates needs it: it hashes
 * assets the same way for the embedded bundle and for over-the-air updates, so an
 * update can reuse images that already ship in the app.
 *
 * @type {import('metro-config').MetroConfig}
 */
module.exports = getDefaultConfig(__dirname);
