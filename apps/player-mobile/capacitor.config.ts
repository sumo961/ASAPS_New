import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.asaps.player',
  appName: 'ASAPS Player',
  webDir: 'dist',
  // The native view behind the web view shows through in the safe areas
  // (status bar, home indicator) — match the app's own background.
  backgroundColor: '#1a1a2e',
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
    // The page pads itself by the safe-area insets (index.html); an inset
    // web view on top of that counted them twice.
    contentInset: 'never',
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
