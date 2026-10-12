// Application renderer entry point: mounts the React app into #root.
// The React app is only the "shell" (title bar, sidebar, pages); the real
// Instagram web page is a native WebContentsView positioned on top of the
// shell's Instagram page by the main process.

import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
