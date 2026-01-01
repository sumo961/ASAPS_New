import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.asaps.player',
  appName: 'ASAPS Player',
  webDir: 'dist',
  server: {
    // Enable for development with live reload
    // url: 'http://192.168.1.x:5173',
    // cleartext: true,
  },
  plugins: {
    StatusBar: {
      style: 'dark',
      backgroundColor: '#1a1a2e',
    },
    Filesystem: {
      // Allow reading from various locations
    },
    Preferences: {
      // Default preferences storage
    },
  },
  ios: {
    contentInset: 'automatic',
    preferredContentMode: 'mobile',
    scheme: 'ASAPS Player',
  },
  android: {
    allowMixedContent: false,
    captureInput: true,
    webContentsDebuggingEnabled: false,
  },
};

export default config;
