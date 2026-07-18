// KRSZ Mail service worker.
//
// Strategy:
//   - Cache the app shell (HTML routes) network-first, fall back to a cached
//     copy when offline so the UI still loads when the network drops.
//   - Pass API requests straight through to the network — mail data has to
//     be live.
//   - Pre-cache the manifest and icon assets on install so the PWA install
//     flow works offline too.

const VERSION = 'v1';
const STATIC_CACHE = `krsz-static-${VERSION}`;
const SHELL_CACHE = `krsz-shell-${VERSION}`;

const PRECACHE_URLS = [
	'/manifest.webmanifest',
	'/favicon.ico',
	'/icon.png',
	'/icon-192.png',
	'/icon-512.png',
	'/apple-touch-icon.png'
];

const OFFLINE_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>KRSZ Mail · Offline</title>
<link rel="icon" href="/favicon.ico" type="image/x-icon">
<style>
	body { margin: 0; min-height: 100vh; background: #0a0a0f; color: #e8e8ed;
		font-family: ui-sans-serif, system-ui, -apple-system, sans-serif;
		display: grid; place-items: center; padding: 24px; }
	.card { max-width: 420px; text-align: center; padding: 32px 28px;
		background: #1a1a24; border: 1px solid #2a2a3a; border-radius: 16px; }
	.dot { width: 48px; height: 48px; margin: 0 auto 18px; border-radius: 50%;
		background: rgba(255, 107, 53, 0.12); color: #ff6b35;
		display: grid; place-items: center; font-size: 22px; }
	h1 { margin: 0 0 10px; font-size: 19px; font-weight: 600; }
	p { margin: 0 0 18px; color: #9090a0; font-size: 13px; line-height: 1.55; }
	button { display: inline-flex; align-items: center; gap: 7px; padding: 9px 16px;
		border: 0; border-radius: 999px; background: #ff6b35; color: white;
		font: inherit; font-weight: 500; cursor: pointer; }
	button:hover { background: #ff8555; }
</style>
</head>
<body>
<div class="card">
	<div class="dot">⚡</div>
	<h1>You&rsquo;re offline</h1>
	<p>KRSZ Mail needs a connection to load your mailbox. We&rsquo;ll retry as soon as you&rsquo;re back online.</p>
	<button onclick="location.reload()">Try again</button>
</div>
</body>
</html>`;

self.addEventListener('install', (event) => {
	event.waitUntil(
		caches
			.open(STATIC_CACHE)
			.then((cache) => cache.addAll(PRECACHE_URLS))
			.catch(() => undefined)
			.then(() => self.skipWaiting())
	);
});

self.addEventListener('activate', (event) => {
	event.waitUntil(
		caches
			.keys()
			.then((keys) =>
				Promise.all(
					keys
						.filter((key) => key !== STATIC_CACHE && key !== SHELL_CACHE)
						.map((key) => caches.delete(key))
				)
			)
			.then(() => self.clients.claim())
	);
});

function isHtmlRequest(request) {
	const accept = request.headers.get('accept') || '';
	return request.mode === 'navigate' || (request.method === 'GET' && accept.includes('text/html'));
}

function isAssetRequest(url) {
	return (
		url.pathname.startsWith('/_app/') ||
		url.pathname.startsWith('/icons/') ||
		url.pathname === '/favicon.ico' ||
		url.pathname === '/icon.png' ||
		url.pathname === '/icon-192.png' ||
		url.pathname === '/icon-512.png' ||
		url.pathname === '/apple-touch-icon.png' ||
		url.pathname === '/manifest.webmanifest'
	);
}

self.addEventListener('fetch', (event) => {
	const { request } = event;
	if (request.method !== 'GET') return;

	const url = new URL(request.url);
	if (url.origin !== self.location.origin) return;

	// API and live data: always hit the network.
	if (url.pathname.startsWith('/api/')) return;

	// Hashed SvelteKit assets: cache-first because they're content-addressed.
	if (isAssetRequest(url)) {
		event.respondWith(
			caches.match(request).then((cached) => {
				if (cached) return cached;
				return fetch(request)
					.then((response) => {
						if (response && response.status === 200) {
							const copy = response.clone();
							caches.open(STATIC_CACHE).then((cache) => cache.put(request, copy));
						}
						return response;
					})
					.catch(() => caches.match('/icon-192.png'));
			})
		);
		return;
	}

	// HTML navigation: network-first, fall back to shell cache, then offline page.
	if (isHtmlRequest(request)) {
		event.respondWith(
			fetch(request)
				.then((response) => {
					if (response && response.status === 200) {
						const copy = response.clone();
						caches.open(SHELL_CACHE).then((cache) => cache.put(request, copy));
					}
					return response;
				})
				.catch(
					() =>
						caches
							.match(request)
							.then(
								(cached) =>
									cached ||
									new Response(OFFLINE_HTML, {
										status: 503,
										headers: { 'content-type': 'text/html; charset=utf-8' }
									})
							)
				)
		);
		return;
	}
});
