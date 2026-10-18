import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './workspace/Application.tsx';
import 'bootstrap/dist/css/bootstrap.min.css';
import './index.css';

// After a new deploy, a tab left open still references old JS chunk
// filenames that no longer exist, so lazy-loading a not-yet-visited
// route (e.g. a Dashboard section) fails silently and the page appears
// to "disappear". Vite fires this event on such failures — recover by
// reloading so the browser picks up the current build.
window.addEventListener('vite:preloadError', () => {
  window.location.reload();
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
