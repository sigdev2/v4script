// Cross-origin isolation on a static host that sends no headers of its own
// (GitHub Pages): this service worker adds COOP and COEP to every response
// of the site. Then the page has SharedArrayBuffer, and a program in the
// worker can wait for a line that the user types. app.js registers it and
// reloads the page once. See docs/playground.md.
'use strict';

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('fetch', (event) => {
    const request = event.request;
    if (new URL(request.url).origin !== self.location.origin)
        return;
    if (request.cache === 'only-if-cached' && request.mode !== 'same-origin')
        return;
    event.respondWith(fetch(request).then((response) => {
        if (response.status === 0)
            return response;
        const headers = new Headers(response.headers);
        headers.set('Cross-Origin-Opener-Policy', 'same-origin');
        headers.set('Cross-Origin-Embedder-Policy', 'require-corp');
        return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
    }));
});
