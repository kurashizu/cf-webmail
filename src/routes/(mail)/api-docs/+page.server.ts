import type { PageServerLoad } from './$types';
import { error, redirect } from '@sveltejs/kit';
import { apiMeta, apiSections } from '$lib/server/api-docs/spec';

export const load: PageServerLoad = async ({ locals, url, platform }) => {
	if (!locals.user) throw redirect(303, '/login');
	return {
		// No need to leak client secret material: the spec is static.
		sections: apiSections,
		meta: apiMeta,
		domain: platform?.env?.MAIL_DOMAIN ?? 'krsz.in',
		baseUrl: `${url.protocol}//${url.host}`,
		jsonPath: '/api/docs'
	};
};
