import type { LayoutServerLoad } from './$types';
import { redirect } from '@sveltejs/kit';
import { listFolders } from '$lib/server/db/queries';

export const load: LayoutServerLoad = async ({ locals, platform, url }) => {
	if (!locals.user) {
		throw redirect(303, '/login');
	}
	const folders = await listFolders(platform!.env.DB, locals.user.accountId);
	return {
		user: locals.user,
		folders,
		domain: platform!.env.MAIL_DOMAIN || 'krsz.in',
		currentPath: url.pathname
	};
};
