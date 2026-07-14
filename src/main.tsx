import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
// Self-hosted via @fontsource and bundled by Vite: no render-blocking round-trip to a
// third-party font CDN, which matters on Pi Browser. The weight-only axis is imported --
// Fraunces' optical-size, soft and wonk axes aren't used and aren't worth the bytes.
import '@fontsource-variable/inter/wght.css';
import '@fontsource-variable/fraunces/wght.css';
import App from './App.tsx';
import './index.css';
import 'leaflet/dist/leaflet.css';

const rootElement = document.getElementById('root');
if (rootElement) {
  createRoot(rootElement).render(
    <StrictMode>
      <App />
    </StrictMode>
  );
}
