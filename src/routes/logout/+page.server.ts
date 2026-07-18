import type { Actions, PageServerLoad } from './$types';
import { redirect } from '@sveltejs/kit';
import { destroySession } from '$lib/server/auth/session';

export const load: PageServerLoad = async () => {
	throw redirect(303, '/inbox');
};

export const actions: Actions = {
	default: async ({ locals, platform, cookies }) => {
		if (locals.user && platform?.env?.SESSIONS) {
			await destroySession(platform.env.SESSIONS, locals.user.accountId);
		}
		cookies.delete('session', { path: '/' });
		throw redirect(303, '/login');
	}
};
