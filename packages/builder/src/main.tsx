import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { PersistenceProvider } from './contexts/PersistenceContext';
import './styles/main.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <PersistenceProvider
      autoSave={true}
      autoSaveDelay={30000}
      debug={false}
    >
      <App />
    </PersistenceProvider>
  </React.StrictMode>
);