// KRSZ Mail service worker.
//
// Strategy:
//   - Cache the app shell (HTML routes) network-first, fall back to a cached
//     copy when offline so the UI still loads when the network drops.
//   - Pass API requests straight through to the network — mail data has to
//     be live.
//   - Pre-cache the manifest, brand-mark, and icon assets on install so the
//     PWA install flow works offline too.

const VERSION = 'v2';
const STATIC_CACHE = `krsz-static-${VERSION}`;
const SHELL_CACHE = `krsz-shell-${VERSION}`;

const PRECACHE_URLS = [
	'/manifest.webmanifest',
	'/favicon.ico',
	'/favicon.svg',
	'/icon.png',
	'/icon-192.png',
	'/icon-512.png',
	'/apple-touch-icon.png',
	'/brand-mark.svg'
];

const OFFLINE_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>KRSZ Mail · Offline</title>
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<meta name="theme-color" content="#0d1116" media="(prefers-color-scheme: dark)">
<meta name="theme-color" content="#e6e9ed" media="(prefers-color-scheme: light)">
<style>
	:root { color-scheme: dark; }
	body { margin: 0; min-height: 100vh; background: #0d1116; color: #c5cdd8;
		font-family: 'JetBrains Mono', ui-monospace, 'SF Mono', monospace;
		display: grid; place-items: center; padding: 24px; }
	.card { max-width: 420px; text-align: center; padding: 32px 28px;
		background: #161b23; border: 1px solid #262d37;
		box-shadow: 0 1px 2px rgba(0,0,0,0.35), 0 6px 18px rgba(0,0,0,0.28);
		border-radius: 0; }
	.brand { display: inline-flex; align-items: center; gap: 10px;
		margin-bottom: 18px; color: #c5cdd8; font-weight: 700; letter-spacing: -0.5px; }
	.brand img { width: 28px; height: 28px; }
	.dot { width: 40px; height: 40px; margin: 0 auto 14px;
		background: rgba(126, 179, 160, 0.12); color: #7eb3a0;
		display: grid; place-items: center; font-size: 18px;
		border: 1px solid rgba(126, 179, 160, 0.28); }
	h1 { margin: 0 0 10px; font-size: 16px; font-weight: 600;
		letter-spacing: 0.5px; text-transform: uppercase; }
	p { margin: 0 0 18px; color: #8995a2; font-size: 12px; line-height: 1.55; }
	button { display: inline-flex; align-items: center; gap: 7px; padding: 8px 14px;
		border: 1px solid #7eb3a0; border-radius: 0; background: transparent;
		color: #7eb3a0; font: inherit; font-weight: 500; cursor: pointer;
		text-transform: uppercase; letter-spacing: 0.5px; font-size: 11px; }
	button:hover { background: rgba(126, 179, 160, 0.12); border-color: #92c5b3; color: #92c5b3; }
	@media (prefers-color-scheme: light) {
		:root { color-scheme: light; }
		body { background: #e6e9ed; color: #1c242d; }
		.card { background: #fafbfc; border-color: #c1c9d2;
			box-shadow: 0 1px 2px rgba(28,36,45,0.06), 0 6px 18px rgba(28,36,45,0.12); }
		.brand { color: #1c242d; }
		.dot { background: rgba(74, 130, 117, 0.12); color: #4a8275;
			border-color: rgba(74, 130, 117, 0.28); }
		p { color: #4a5764; }
		button { border-color: #4a8275; color: #4a8275; }
		button:hover { background: rgba(74, 130, 117, 0.12); border-color: #5d9689; color: #5d9689; }
	}
</style>
</head>
<body>
<div class="card">
	<div class="brand"><img src="/brand-mark.svg" alt="" width="28" height="28">KRSZ Mail</div>
	<div class="dot">⌁</div>
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
		url.pathname === '/favicon.svg' ||
		url.pathname === '/icon.png' ||
		url.pathname === '/icon-192.png' ||
		url.pathname === '/icon-512.png' ||
		url.pathname === '/apple-touch-icon.png' ||
		url.pathname === '/brand-mark.svg' ||
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
					.catch(() => caches.match('/brand-mark.svg'));
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
