// Small fetch helper that injects the X-Mail-Password header automatically.
import { get } from 'svelte/store';
import { sessionPassword } from './stores/session';

export class ApiError extends Error {
	constructor(public status: number, message: string) {
		super(message);
	}
}

async function request(path: string, init: RequestInit = {}) {
	const password = get(sessionPassword);
	if (!password && needsMailboxAuth(path)) {
		throw new ApiError(401, 'Session password not set');
	}

	const headers = new Headers(init.headers);
	if (password) headers.set('X-Mail-Password', password);

	const res = await fetch(path, { ...init, headers });
	const ct = res.headers.get('content-type') || '';
	const data = ct.includes('json') ? await res.json() : await res.text();

	if (!res.ok) {
		const msg = (typeof data === 'object' && data && 'message' in data
			? data.message
			: typeof data === 'string'
				? data
				: res.statusText) as string;
		throw new ApiError(res.status, msg);
	}
	return data;
}

function needsMailboxAuth(path: string) {
	return (
		path.startsWith('/api/mailboxes') ||
		path.startsWith('/api/messages')
	);
}

export const api = {
	get: (path: string) => request(path, { method: 'GET' }),
	post: (path: string, body?: unknown) =>
		request(path, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: body !== undefined ? JSON.stringify(body) : undefined
		}),
	delete: (path: string) => request(path, { method: 'DELETE' })
};