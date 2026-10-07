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
  action: { default_popup: 'src/popup/index.html', default_title: 'Sundial' },
  incognito: 'spanning',
});
