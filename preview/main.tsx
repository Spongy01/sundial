/**
 * Preview harness (not shipped). Open:
 *   http://localhost:5199/?page=popup
 *   http://localhost:5199/?page=dashboard[#/settings]
 * Add &empty to see empty states, &theme=dark to force dark tokens.
 */
import { createRoot } from 'react-dom/client';
import '../src/ui/index.css';
import { installFakeChrome } from './fakeChrome';
import { seed } from './seed';

const params = new URLSearchParams(location.search);
installFakeChrome(params.has('empty'));
if (params.get('range')) localStorage.setItem('sundial.range', JSON.stringify({ preset: params.get('range'), custom: { from: '', to: '' } }));

async function main() {
  await seed(params.has('empty'));
  const root = createRoot(document.getElementById('root')!);
  if (params.get('page') === 'popup') {
    const { Popup } = await import('../src/popup/Popup');
    document.body.style.display = 'inline-block';
    root.render(<Popup />);
  } else {
    const { App } = await import('../src/dashboard/App');
    root.render(<App />);
  }
}
void main();
