import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles.css';

// Initialize Capacitor plugins
import { StatusBar, Style } from '@capacitor/status-bar';
import { Capacitor } from '@capacitor/core';

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
