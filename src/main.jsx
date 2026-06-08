import React from 'react';
import ReactDOM from 'react-dom/client';
// Display fonts bundled locally (Fontsource) — no CDN, fully offline at runtime.
// Restores the exact look the old Google Fonts @import used to provide.
import '@fontsource/share-tech-mono/latin-400.css';
import '@fontsource/orbitron/latin-400.css';
import '@fontsource/orbitron/latin-700.css';
import '@fontsource/orbitron/latin-900.css';
import App from './App.jsx';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
