import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig, type Plugin } from 'vite';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

/**
 * Vite plugin: append the email handler into the adapter-generated worker.
 *
 * adapter-cloudflare emits a `worker_default` object with `fetch`, then
 * re-exports it via `export { worker_default as default }`. We rename the
 * existing default to `__skDefault` and add a fresh `default` that
 * includes both `fetch` and `email`.
 */
function injectEmailHandler(): Plugin {
	return {
		name: 'cf-webmail:inject-email-handler',
		async closeBundle() {
			const workerPath = '.svelte-kit/cloudflare/_worker.js';
			if (!existsSync(workerPath)) return;

			let workerSource = readFileSync(workerPath, 'utf-8');

			// Strip any previous injection.
			workerSource = workerSource.replace(
				/\/\/ === Injected by cf-webmail:inject-email-handler ===[\s\S]*?\/\/ === End inject ===\n?/,
				''
			);
			workerSource = workerSource.replace(
				/\/\/ === Injected by cf-webmail:inject-do-export ===[\s\S]*?export \{ ImapSessionDO \};\n\/\/ === End inject ===\n?/,
				''
			);

			// Rename worker_default -> __skDefault and replace the re-export
			// so we control the default object.
			workerSource = workerSource.replace(
				/export\s*\{\s*worker_default\s+as\s+default\s*\}\s*;?/,
				'export { __skDefault as __skDefault };'
			);
			workerSource = workerSource.replace(/\bvar\s+worker_default\b/g, 'var __skDefault');

			// Read the inbound module(s). We need both inbound.js (pipeline)
						// and db/queries.js (its only dependency).
						const sources = [
							readFileSync('src/lib/server/mail/inbound.js', 'utf-8'),
							readFileSync('src/lib/server/db/queries.js', 'utf-8')
						];

			const stripImports = (s) =>
				s
					.replace(/^import\s+[^;]+from\s+['"]\.\.?\/[^'"]+['"];?\s*$/gm, '')
					.replace(/^import\s+\{[^}]+\}\s+from\s+['"]\.\.?\/[^'"]+['"];?\s*$/gm, '')
					.replace(/^import\s+[^;]+from\s+['"]postal-mime['"];?\s*$/gm, '');

			const stripExports = (s) =>
				stripImports(s)
					.replace(/^export\s+(async\s+)?function\s+/gm, '$1function ')
					.replace(/^export\s+const\s+/gm, 'const ')
					.replace(/^export\s+class\s+/m, 'class ')
					.replace(/^export\s+\{[^}]+\};?\s*$/gm, '')
					.trim();

			const mailBundle =
				`import PostalMime from 'postal-mime';\n` +
				sources.map(stripExports).join('\n\n');

			const tail = `
			async function __cfWebmailEmail(message, env, ctx) {
			  try {
			    await handleInbound(message, env, ctx);
			  } catch (err) {
			    			console.error('[email handler] failed', {
			    				recipient: message.to || null,
			    				error: err instanceof Error ? err.message : String(err)
			    			});
			    			try { message.setReject('Unable to process message'); } catch (_) {}
			  }
			}

			async function __cfWebmailScheduled(event, env, ctx) {
			  try {
			    const { runMaintenance } = await import('./src/lib/server/cron/maintenance.js');
			    ctx.waitUntil(runMaintenance(env, ctx));
			  } catch (err) {
			    console.error('[cron] dispatch failed', err);
			  }
			}

			const __cfWebmailDefault = {
			  fetch: __skDefault.fetch,
			  email: __cfWebmailEmail,
			  scheduled: __cfWebmailScheduled
			};
			export default __cfWebmailDefault;
			`;

			workerSource +=
				`\n\n// === Injected by cf-webmail:inject-email-handler ===\n` +
				`${mailBundle}\n${tail}\n// === End inject ===\n`;

			writeFileSync(workerPath, workerSource);
			console.log('[cf-webmail] Injected email() handler + mail bundle into _worker.js');
		}
	};
}

export default defineConfig({
	plugins: [sveltekit(), injectEmailHandler()]
});
