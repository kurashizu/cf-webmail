import type { Handle } from '@sveltejs/kit';
import { verifySession, isSessionValid } from '$lib/server/auth/session';

const PUBLIC_PATHS = ['/', '/login', '/register', '/api/health'];

export const handle: Handle = async ({ event, resolve }) => {
	event.locals.user = null;

	const token = event.cookies.get('session');
	if (token && event.platform?.env) {
		try {
			const payload = await verifySession(token, event.platform.env.JWT_SECRET);
			const valid = await isSessionValid(
				event.platform.env.SESSIONS,
				payload.accountId,
				token
			);
			const disabled = await event.platform.env.SESSIONS.get(`disabled:${payload.accountId}`);
			if (valid && disabled !== '1') {
				event.locals.user = {
					email: payload.email,
					accountId: payload.accountId,
					role: payload.role === 'admin' ? 'admin' : 'user'
				};
			}
		} catch {
			// Token invalid or expired — ignore.
		}
	}

	const path = event.url.pathname;
	const isPublic = PUBLIC_PATHS.some((p) => path === p || path.startsWith(p + '/'));

	if (!event.locals.user && !isPublic) {
		return new Response(null, {
			status: 303,
			headers: { location: `/login?next=${encodeURIComponent(path)}` }
		});
	}

	if (event.locals.user && (path === '/login' || path === '/register')) {
		return new Response(null, {
			status: 303,
			headers: { location: '/inbox' }
		});
	}

	return resolve(event);
};
