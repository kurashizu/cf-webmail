import type { RequestHandler } from './$types';
import { error, json } from '@sveltejs/kit';
import { apiMeta, apiSections } from '$lib/server/api-docs/spec';

export const GET: RequestHandler = async ({ locals, url }) => {
	if (!locals.user) throw error(401, 'Unauthorized');

	// Stretch the public base URL to match the current origin so the doc reads
	// correctly regardless of whether the user is hitting the worker subdomain
	// (cf-webmail.kurashizu123.workers.dev) or the custom domain (mail.krsz.in).
	const baseUrl = `${url.protocol}//${url.host}`;

	return json({
		ok: true,
		meta: {
			title: apiMeta.title,
			tagline: apiMeta.tagline,
			baseUrl,
			docsPath: apiMeta.docsPath,
			jsonPath: apiMeta.jsonPath,
			auth: 'Session cookie (JWT). Sign in at /login.',
			generatedAt: new Date().toISOString()
		},
		sections: apiSections
	});
};
