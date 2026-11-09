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

// The site behaves like an app on phones: no pinch or double-tap zoom.
// iOS Safari ignores user-scalable=no in the viewport tag, so block its pinch gesture events too.
for (const type of ['gesturestart', 'gesturechange', 'gestureend']) {
  document.addEventListener(type, event => event.preventDefault(), { passive: false });
}
// Newer iOS versions can still start a pinch from touch events: cancel any multi-finger move.
document.addEventListener('touchmove', event => {
  if (event.touches.length > 1 || ((event as TouchEvent & { scale?: number }).scale ?? 1) !== 1) event.preventDefault();
}, { passive: false });

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
