import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles.css';

// Initialize Capacitor plugins
import { StatusBar, Style } from '@capacitor/status-bar';
import { Capacitor } from '@capacitor/core';
import { installNativeGeolocation } from './nativeGeolocation';
import { installNativeOverpass } from './nativeOverpass';

// Story positions come from the native location service, not WebKit's.
installNativeGeolocation();
// Street-snapped pin placement needs an identifying user agent (see nativeOverpass).
installNativeOverpass();

// Configure status bar for native platforms
if (Capacitor.isNativePlatform()) {
  StatusBar.setStyle({ style: Style.Dark }).catch(console.warn);
  StatusBar.setBackgroundColor({ color: '#1a1a2e' }).catch(console.warn);
}

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
