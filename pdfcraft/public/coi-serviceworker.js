/*! coi-serviceworker v0.1.7 - modified for PDFCraft & LibreOffice WASM */
let coepCredentialless = false;
if (typeof window === 'undefined') {
  self.addEventListener('install', () => self.skipWaiting());
  self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

  self.addEventListener('message', (ev) => {
    if (!ev.data) return;
    if (ev.data.type === 'deregister') {
      self.registration.unregister().then(() => {
        return self.clients.matchAll();
      }).then(clients => {
        clients.forEach(client => client.navigate(client.url));
      });
    }
  });

  self.addEventListener('fetch', function (event) {
    const r = event.request;
    if (r.cache === 'only-if-cached' && r.mode !== 'same-origin') return;

    const url = new URL(r.url);
    // CRITICAL: Bypass heavy WASM binaries and data files to prevent ServiceWorker
    // memory exhaustion, but allow scripts (.js) through so they receive CORP/COEP headers.
    const isHeavyBinary =
      url.pathname.endsWith('.wasm') ||
      url.pathname.endsWith('.wasm.bin') ||
      url.pathname.endsWith('.data') ||
      url.pathname.endsWith('.data.bin');
    if (isHeavyBinary) {
      return;
    }

    const coep = coepCredentialless ? 'credentialless' : 'require-corp';

    event.respondWith(
      fetch(r).then((response) => {
        if (response.status === 0) return response;

        const newHeaders = new Headers(response.headers);
        newHeaders.set('Cross-Origin-Embedder-Policy', coep);
        newHeaders.set('Cross-Origin-Opener-Policy', 'same-origin');
        newHeaders.set('Cross-Origin-Resource-Policy', 'cross-origin');

        return new Response(response.body, {
          status: response.status,
          statusText: response.statusText,
          headers: newHeaders,
        });
      }).catch((e) => {
        console.error('[coi-serviceworker] fetch error:', e);
        return fetch(r);
      })
    );
  });
} else {
  (() => {
    // Only register if we are in a browser environment and NOT already crossOriginIsolated
    if (typeof window === 'undefined') return;
    if (window.crossOriginIsolated) return;

    const n = navigator;
    if (!n || !n.serviceWorker) return;

    // Do not run in Tauri desktop app (Tauri has native desktop isolation)
    if (window.__TAURI_INTERNALS__ || window.__TAURI__) return;

    let basePath = '';
    const script = document.querySelector('script[data-coi]');
    if (script && script.getAttribute('src')) {
      const src = script.getAttribute('src') || '';
      basePath = src.substring(0, src.lastIndexOf('/') + 1);
    }
    const swUrl = basePath ? basePath + 'coi-serviceworker.js' : '/coi-serviceworker.js';

    n.serviceWorker.register(swUrl).then(
      (registration) => {
        registration.addEventListener('updatefound', () => {
          window.location.reload();
        });
        if (registration.active && !n.serviceWorker.controller) {
          window.location.reload();
        }
      },
      (err) => {
        console.warn('[coi-serviceworker] registration failed:', err);
      }
    );
  })();
}
