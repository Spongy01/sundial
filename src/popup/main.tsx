import { createRoot } from 'react-dom/client';
import '../ui/index.css';

createRoot(document.getElementById('root')!).render(
  <div className="w-72 p-4 text-sm">Sundial is tracking. Open the service worker console to see logs.</div>,
);
