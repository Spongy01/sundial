import { defineManifest } from '@crxjs/vite-plugin';
import pkg from './package.json' with { type: 'json' };

export default defineManifest({
  manifest_version: 3,
  name: 'Sundial',
  version: pkg.version,
  description: 'See how your browser time splits between productive and entertainment. 100% local.',
  minimum_chrome_version: '116',
  permissions: ['tabs', 'idle', 'alarms', 'storage', 'unlimitedStorage', 'favicon'],
  background: { service_worker: 'src/background/index.ts', type: 'module' },
  icons: { 16: 'icons/icon-16.png', 32: 'icons/icon-32.png', 48: 'icons/icon-48.png', 128: 'icons/icon-128.png' },
  action: {
    default_popup: 'src/popup/index.html',
    default_title: 'Sundial',
    default_icon: { 16: 'icons/icon-16.png', 32: 'icons/icon-32.png' },
  },
  incognito: 'spanning',
});
