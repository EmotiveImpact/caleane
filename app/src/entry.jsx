import './hosted-demo.css';
import {watchForNewVersion} from './lib/app-version.js';
async function start() {
  if (import.meta.env.VITE_HOSTED_DEMO === '1') {
    document.documentElement.dataset.hostedDemo = 'true';
    if (!('serviceWorker' in navigator)) throw new Error('Open the demo in a browser that supports service workers.');
    await navigator.serviceWorker.register('/demo-worker.js', { scope: '/' });
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller) await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Please reload to open the demo.')), 15000);
      navigator.serviceWorker.addEventListener('controllerchange', () => { clearTimeout(timeout); resolve(); }, { once: true });
    });
    const notice = document.createElement('aside');
    notice.className = 'hosted-demo-notice';
    const text = document.createElement('span');
    text.textContent = 'Demo workspace · Sample details only · Saved in this browser';
    const reset = document.createElement('button');
    reset.type = 'button';
    reset.textContent = 'Reset demo';
    reset.onclick = async () => {
      reset.disabled = true;
      const channel = new MessageChannel();
      channel.port1.onmessage = () => { location.href = '/login'; };
      navigator.serviceWorker.controller.postMessage('reset-caleane-demo', [channel.port2]);
    };
    notice.append(text, reset);
    document.body.append(notice);
  }
  await import('./app.jsx');
  watchForNewVersion();
}
start().catch(error => { document.querySelector('#root').textContent = error.message; });
