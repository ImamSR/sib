// metro.config.js
const { getDefaultConfig } = require('expo/metro-config');
const config = getDefaultConfig(__dirname);

// Ensure .cjs is resolved
config.resolver.sourceExts = [...config.resolver.sourceExts, 'cjs'];

module.exports = config;
