import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ platform }) => {
	return {
		domain: platform?.env?.MAIL_DOMAIN ?? 'krsz.in'
	};
};
