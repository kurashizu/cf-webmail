import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';

export const GET: RequestHandler = async ({ platform }) => {
	const env = platform?.env;
	return json({
		ok: true,
		app: env?.APP_NAME || 'CF WebMail',
		bindings: {
			DB: !!env?.DB,
			SESSIONS: !!env?.SESSIONS,
			MAIL: !!env?.MAIL
		},
		domain: env?.MAIL_DOMAIN,
		ts: Date.now()
	});
};
