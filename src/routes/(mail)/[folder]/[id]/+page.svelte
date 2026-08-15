<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { onMount } from 'svelte';
	import { formatAddresses, formatDate, initials } from '$lib/format';
	import { toastStore } from '$lib/toast';
	import { themeStore } from '$lib/stores/theme';
	import { t, type Locale } from '$lib/i18n';

	let { data } = $props();
	const tt = (key: string, params?: Record<string, string | number>) =>
		t(data.locale as Locale, key, params);

	const FOLDER_KEY: Record<string, string> = {
		INBOX: 'nav.inbox',
		Starred: 'nav.starred',
		Sent: 'nav.sent',
		Drafts: 'nav.drafts',
		Junk: 'nav.junk',
		Trash: 'nav.trash'
	};
	function folderLabel(name: string): string {
		const key = FOLDER_KEY[name];
		return key ? tt(key) : name;
	}

	let bodyHtml = $state('');
	let bodyText = $state('');
	let renderMode = $state<'html' | 'text'>('html');
	let bodyFrame = $state<HTMLIFrameElement | null>(null);
	let loading = $state(true);
	let actionBusy = $state(false);
	let error = $state<string | null>(null);
	let starred = $state(false);
	$effect(() => {
		starred = data.message.flags.includes('\\Flagged');
	});
	let frameHeight = $state(420);
	let readProgress = $state(0);

	const replySubject = $derived(
		/^re:/i.test(data.message.subject) ? data.message.subject : `${tt('message.subjectPrefix')} ${data.message.subject}`
	);
	const replyHref = $derived(
		`/compose?to=${encodeURIComponent(data.message.fromAddr || '')}&subject=${encodeURIComponent(replySubject)}`
	);

	async function loadBodies() {
		loading = true;
		error = null;
		try {
			await Promise.all([fetchBody('html'), fetchBody('text')]);
		} catch {
			error = tt('message.bodyError');
		} finally {
			loading = false;
		}
	}

	/** Dark/light wrapper for the email photos. Parent CSS vars don't cascade
	 * into a srcdoc iframe, so use literal theme colours, re-derived whenever
	 * the user flips the theme toggle. Emails that declare their own colours
	 * keep them; anything without explicit styling falls onto the theme canvas. */
	function injectBaseStyles(html: string, theme: 'dark' | 'light'): string {
		const canvas = theme === 'light' ? '#ffffff' : '#121722';
		const link = theme === 'light' ? '#0f8f6f' : '#4fd3b2';
		return `<style>:root{color-scheme:${theme}}html{background:${canvas}!important;color-scheme:${theme}}body{background-color:transparent!important}a{color:${link}}</style>${html}`;
	}

	// bodyHtml holds the raw fetched HTML; the iframe srcdoc is re-derived from
	// it on every theme change so the rendered mail follows the switch.
	const emailSrcdoc = $derived(bodyHtml ? injectBaseStyles(bodyHtml, $themeStore) : '');

	async function fetchBody(kind: 'html' | 'text') {
		const has = kind === 'html' ? data.message.hasHtml : data.message.hasText;
		const loaded = kind === 'html' ? bodyHtml : bodyText;
		if (!has || loaded !== '') return;
		try {
			const response = await fetch(`/api/messages/${data.message.id}/body?kind=${kind}`);
			if (response.ok) {
				const result = (await response.json()) as { body?: string };
				const body = result.body || '';
				if (kind === 'html') bodyHtml = body;
				else bodyText = body;
			}
		} catch {
			// Ignore — the sibling body (or the empty state) still renders.
		}
	}

	function setRenderMode(mode: 'html' | 'text') {
		if (mode === 'html' && !data.message.hasHtml) return;
		if (mode === 'text' && !data.message.hasText) return;
		renderMode = mode;
		if (mode === 'html' && bodyHtml === '' && data.message.hasHtml) void fetchBody('html');
		if (mode === 'text' && bodyText === '' && data.message.hasText) void fetchBody('text');
	}

	let currentId = '';
	$effect(() => {
		const id = data.message.id;
		if (id === currentId) return;
		currentId = id;
		renderMode = data.message.hasHtml ? 'html' : 'text';
		bodyHtml = '';
		bodyText = '';
		void loadBodies();
	});

	/** Let mail links open in a new tab instead of being swallowed by the sandbox. */
	function hijackFrameClicks(event: MouseEvent) {
		try {
			const target = event.target as Element | null;
			if (!target || typeof target.closest !== 'function') return;
			const anchor = target.closest('a[href]') as HTMLAnchorElement | null;
			if (!anchor) return;
			const href = String(anchor.getAttribute('href') || '').trim();
			if (/^(https?:\/\/|mailto:)/i.test(href)) {
				event.preventDefault();
				event.stopPropagation();
				window.open(href, '_blank', 'noopener,noreferrer');
			}
		} catch {
			// Sandbox may refuse to expose the document — ignore.
		}
	}

	function resizeFrame(event: Event) {
		const frame = event.currentTarget as HTMLIFrameElement;
		try {
			const doc = frame.contentDocument;
			const height = doc?.documentElement.scrollHeight || 420;
			// No upper cap: the iframe grows to fit the full message body.
			frameHeight = Math.max(height + 24, 320);
			// Keep re-measuring as the content changes (e.g. images finishing loading).
			if (doc?.body && !(frame as unknown as { __mailResizeObserved?: boolean }).__mailResizeObserved) {
				(frame as unknown as { __mailResizeObserved?: boolean }).__mailResizeObserved = true;
				const observer = new ResizeObserver(() => {
					try {
						const h = doc.documentElement.scrollHeight;
						if (h) frameHeight = Math.max(h + 24, 320);
					} catch {
						/* ignore */
					}
				});
				observer.observe(doc.body);
			}
			// Hook link handling once per iframe load (srcdoc is freshly created).
			if (doc && !(frame as unknown as { __mailLinksHooked?: boolean }).__mailLinksHooked) {
				(frame as unknown as { __mailLinksHooked?: boolean }).__mailLinksHooked = true;
				doc.addEventListener('click', hijackFrameClicks, true);
			}
		} catch {
			frameHeight = 520;
		}
	}

	async function toggleStar() {
		if (actionBusy) return;
		actionBusy = true;
		error = null;
		try {
			const response = await fetch(`/api/messages/${data.message.id}/star`, { method: 'POST' });
			if (!response.ok) throw new Error();
			const result = (await response.json()) as { flags: string[] };
			starred = result.flags.includes('\Flagged');
			await invalidateAll();
			toastStore.success(starred ? tt('toast.message.starred') : tt('toast.message.unstarred'));
		} catch {
			toastStore.error(tt('message.failed'));
		} finally {
			actionBusy = false;
		}
	}

	async function moveTo(folder: string) {
		if (actionBusy) return;
		actionBusy = true;
		error = null;
		try {
			const response = await fetch(`/api/messages/${data.message.id}/move`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ folder })
			});
			if (!response.ok) throw new Error();
			toastStore.info(folder === 'Trash' ? tt('message.movedToTrash') : tt('message.movedToFolder', { folder }));
			location.href = data.folderSlug === 'starred' ? '/starred' : '/inbox';
		} catch {
			toastStore.error(tt('message.failedMove'));
			actionBusy = false;
		}
	}

	async function markUnread() {
		if (actionBusy) return;
		actionBusy = true;
		error = null;
		try {
			const response = await fetch(`/api/messages/${data.message.id}/read`, { method: 'DELETE' });
			if (!response.ok) throw new Error();
			toastStore.info(tt('toast.message.markedUnread'));
			location.href = `/${data.folderSlug}`;
		} catch {
			toastStore.error(tt('message.failed'));
			actionBusy = false;
		}
	}

	onMount(async () => {
		const response = await fetch(`/api/messages/${data.message.id}/read`, { method: 'POST' });
		if (response.ok) await invalidateAll();
	});

	onMount(() => {
		// Reading progress — track how far through the article the user has scrolled.
		// Done off the .main element (which is the scroll container in the mail layout)
		// so the calculation stays accurate on long bodies inside the iframe-less view.
		const main = document.querySelector<HTMLElement>('.main');
		if (!main) return;
		let ticking = false;
		const update = () => {
			ticking = false;
			const max = main.scrollHeight - main.clientHeight;
			readProgress = max > 0 ? Math.min(1, Math.max(0, main.scrollTop / max)) : 0;
		};
		const onScroll = () => {
			if (ticking) return;
			ticking = true;
			requestAnimationFrame(update);
		};
		main.addEventListener('scroll', onScroll, { passive: true });
		update();
		return () => main.removeEventListener('scroll', onScroll);
	});
</script>

<svelte:head><title>{data.message.subject} · KRSZ Mail</title></svelte:head>

<article class="page">
	<div class="read-progress" aria-hidden="true" style:transform={`scaleX(${readProgress})`}></div>
	<nav class="toolbar" aria-label="Message actions">
		<a class="back" href="/{data.folderSlug}">
			<svg viewBox="0 0 24 24" fill="none"><path d="m15 18-6-6 6-6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
			<span>{data.folder === 'INBOX' ? 'Inbox' : data.folder}</span>
		</a>
		<div class="toolbar-actions">
			{#if data.message.hasHtml && data.message.hasText}
				<div class="view-toggle" role="group" aria-label={tt('message.viewModeAria')}>
					<button type="button" class:active={renderMode === 'html'} onclick={() => setRenderMode('html')}>{tt('message.htmlView')}</button>
					<button type="button" class:active={renderMode === 'text'} onclick={() => setRenderMode('text')}>{tt('message.textView')}</button>
				</div>
			{/if}
			<a class="tool primary" href={replyHref} title={tt('message.reply')}>
				<svg viewBox="0 0 24 24" fill="none"><path d="m9 8-5 4 5 4v-3h4a7 7 0 0 1 7 7v-2a9 9 0 0 0-9-9H9V8Z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/></svg><span>{tt('message.reply')}</span>
			</a>
			<button class="tool" class:active={starred} onclick={toggleStar} disabled={actionBusy} title={starred ? tt('message.starRemove') : tt('message.starAdd')} data-action="star">
				<svg viewBox="0 0 24 24" fill={starred ? 'currentColor' : 'none'}><path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-2.9-5.6 2.9 1.1-6.2L3 9.6l6.2-.9L12 3Z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/></svg><span>{starred ? tt('message.starred') : tt('message.star')}</span>
			</button>
			<button class="tool" onclick={markUnread} disabled={actionBusy} title={tt('message.markUnread')} data-action="mark-unread">
				<svg viewBox="0 0 24 24" fill="none"><path d="M4 6h16v12H4V6Zm0 1 8 6 8-6" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><circle cx="18" cy="6" r="3" fill="currentColor"/></svg><span>{tt('message.markUnread')}</span>
			</button>
			{#if data.folder !== 'Trash'}
				<button class="tool danger" onclick={() => moveTo('Trash')} disabled={actionBusy} title={tt('inbox.moveToTrash')} data-action="trash">
					<svg viewBox="0 0 24 24" fill="none"><path d="M4 7h16M9 11v6m6-6v6M6 7l1 14h10l1-14M9 7l1-4h4l1 4" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg><span>{tt('common.delete')}</span>
				</button>
			{/if}
		</div>
	</nav>

	{#if error}<div class="notice" role="alert">{error}</div>{/if}

	<section class="message-card">
		<header class="message-head">
			<h1>{data.message.subject}</h1>
			<div class="sender-row">
				<div class="avatar" aria-hidden="true">{initials(data.message.fromName || data.message.fromAddr)}</div>
				<div class="sender">
					<div><strong>{data.message.fromName || data.message.fromAddr || tt('inbox.unknownSender')}</strong>{#if data.message.fromName}<span>&lt;{data.message.fromAddr}&gt;</span>{/if}</div>
					<p>{tt('compose.to')} {formatAddresses(data.message.to) || tt('inbox.unknownRecipient')}</p>
				</div>
				<time datetime={new Date(data.message.receivedAt).toISOString()}>{formatDate(data.message.receivedAt)}</time>
			</div>
			{#if data.message.cc?.length}<div class="cc">{tt('compose.cc')}: {formatAddresses(data.message.cc)}</div>{/if}
		</header>

		{#if data.attachments.length}
			<section class="attachments" aria-label={tt('message.attachmentsHeading')}>
				<div class="attachments-title"><svg viewBox="0 0 24 24" fill="none"><path d="m9 12 5-5a3 3 0 0 1 4 4l-7 7a5 5 0 0 1-7-7l7-7" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg><span>{tt('common.messageCount', { count: data.attachments.length })}</span></div>
				<div class="attachment-grid">{#each data.attachments as attachment (attachment.id)}
					<a class="attachment-card" href="/api/messages/{data.message.id}/attachments/{attachment.id}">
						<div><svg viewBox="0 0 24 24" fill="none"><path d="M6 3h8l4 4v14H6V3Zm8 0v5h4" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg></div>
						<span><strong>{attachment.filename || tt('message.attachmentsHeading')}</strong><small>{Math.max(1, Math.ceil((attachment.size || 0) / 1024))} KB</small></span>
						<svg class="download" viewBox="0 0 24 24" fill="none"><path d="M12 3v12m0 0 4-4m-4 4-4-4M5 21h14" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>
					</a>
				{/each}</div>
			</section>
		{/if}

		<section class="body">
			{#if loading}<div class="skeleton"><span></span><span></span><span></span><span></span></div>
			{:else if renderMode === 'html' && data.message.hasHtml && bodyHtml}<iframe bind:this={bodyFrame} srcdoc={emailSrcdoc} title="Message body" sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox" style:height={`${frameHeight}px`} onload={resizeFrame}></iframe>
			{:else if bodyText || data.message.hasText}<pre>{bodyText || ''}</pre>
			{:else}<p class="empty">{tt('inbox.noPreview')}</p>{/if}
		</section>
	</section>
</article>

<style>
	.page { position: relative; width: min(100%, 980px); margin: 0 auto; padding: var(--space-5) var(--space-6) var(--space-10); }
	/* Reading progress — phosphor bar at the top of the article. */
	.read-progress {
		position: absolute;
		left: 0;
		right: 0;
		top: 0;
		height: 2px;
		background: linear-gradient(90deg, var(--accent), var(--accent-hover));
		transform-origin: left center;
		transform: scaleX(0);
		transition: transform 80ms linear;
		box-shadow: 0 0 12px var(--accent-glow);
	}
	.toolbar { display: flex; align-items: center; justify-content: space-between; gap: var(--space-4); margin-bottom: var(--space-4); }
	.back { display: inline-flex; align-items: center; gap: 7px; color: var(--text-secondary); font-size: 12px; }
	.back svg { width: 18px; }
	.toolbar-actions { display: flex; align-items: center; gap: 3px; }
	.tool { min-height: 34px; display: inline-flex; align-items: center; gap: 6px; padding: 0 9px; border-radius: var(--radius-md); color: var(--text-muted); font-size: 11px; }
	.tool svg { width: 17px; height: 17px; }
	.tool:hover:not(:disabled), .tool.active { background: var(--accent-subtle); color: var(--accent); }
	.tool.primary { background: var(--accent-subtle); color: var(--accent); }
	.tool.danger:hover:not(:disabled) { background: var(--color-danger-subtle); color: var(--color-danger-bright); }
	.tool:disabled { opacity: .45; cursor: wait; }
	.notice { margin-bottom: var(--space-4); padding: 10px 12px; border: 1px solid var(--color-danger-border); border-radius: var(--radius-md); background: var(--color-danger-bg); color: var(--color-danger); font-size: 12px; }
	.message-card { overflow: hidden; border: 1px solid var(--border); border-radius: var(--radius-lg); background: var(--bg-secondary); box-shadow: var(--shadow-sm); }
	.message-head { padding: var(--space-6); border-bottom: 1px solid var(--border); }
	.message-head h1 { margin: 0 0 var(--space-5); font-size: clamp(21px, 3vw, 29px); font-weight: 600; line-height: 1.25; letter-spacing: -.025em; overflow-wrap: anywhere; }
	.sender-row { display: grid; grid-template-columns: 42px minmax(0, 1fr) auto; align-items: center; gap: var(--space-3); }
	.avatar { width: 42px; height: 42px; display: grid; place-items: center; border: 1px solid var(--border); border-radius: 50%; background: var(--accent-subtle); color: var(--accent); font-size: 12px; font-weight: 700; }
	.sender { min-width: 0; }
	.sender > div { min-width: 0; display: flex; align-items: baseline; gap: 7px; }
	.sender strong { overflow: hidden; color: var(--text-primary); font-size: 13px; text-overflow: ellipsis; white-space: nowrap; }
	.sender span, .sender p, .cc, time { color: var(--text-muted); font-size: 11px; }
	.sender span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	.sender p { margin: 3px 0 0; }
	time { align-self: start; padding-top: 2px; white-space: nowrap; }
	.cc { margin: 10px 0 0 54px; }
	.attachments { padding: var(--space-4) var(--space-6); border-bottom: 1px solid var(--border); background: var(--bg-card); }
	.attachments-title { display: flex; align-items: center; gap: 7px; margin-bottom: 10px; color: var(--text-muted); font-size: 10px; text-transform: uppercase; letter-spacing: .06em; }
	.attachments-title svg { width: 15px; }
	.attachment-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); gap: 8px; }
	.attachment-card { display: grid; grid-template-columns: 34px minmax(0, 1fr) auto; align-items: center; gap: 9px; padding: 9px; border: 1px solid var(--border); border-radius: var(--radius-md); background: var(--bg-secondary); }
	.attachment-card:hover { border-color: var(--border-hover); background: var(--bg-elevated); }
	.attachment-card > div { width: 32px; height: 32px; display: grid; place-items: center; border-radius: var(--radius-sm); background: var(--accent-subtle); color: var(--accent); }
	.attachment-card > div svg, .download { width: 16px; }
	.attachment-card > span { min-width: 0; display: grid; }
	.attachment-card strong { overflow: hidden; color: var(--text-primary); font-size: 11px; text-overflow: ellipsis; white-space: nowrap; }
	.attachment-card small { color: var(--text-muted); font-size: 9px; }
	.download { color: var(--text-muted); }
	.body { min-height: 320px; padding: var(--space-6); background: var(--bg-secondary); }
	.view-toggle {
		display: inline-flex;
		align-items: center;
		gap: 2px;
		padding: 2px;
		margin: 0 4px 0 0;
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		background: var(--bg-card);
	}
	.view-toggle button {
		min-height: 28px;
		padding: 0 11px;
		border: 0;
		border-radius: 6px;
		background: transparent;
		color: var(--text-muted);
		font-size: 11px;
		cursor: pointer;
		transition: all var(--transition-fast);
	}
	.view-toggle button:hover {
		color: var(--text-primary);
	}
	.view-toggle button.active {
		background: var(--accent-subtle);
		color: var(--accent);
	}
	.body iframe { display: block; width: 100%; min-height: 320px; border: 0; border-radius: var(--radius-md); background: transparent; transition: height var(--transition-base); }
	.body pre { margin: 0; white-space: pre-wrap; word-break: break-word; font-family: inherit; font-size: 14px; color: var(--text-primary); line-height: 1.75; }
	.body .empty { color: var(--text-muted); font-size: 13px; }
	.skeleton { display: grid; gap: 12px; padding-top: 5px; }
	.skeleton span { height: 11px; border-radius: var(--radius-full); background: linear-gradient(90deg, var(--bg-card), var(--bg-elevated), var(--bg-card)); background-size: 200% 100%; animation: shimmer 1.4s infinite; }
	.skeleton span:nth-child(1) { width: 85%; }.skeleton span:nth-child(2) { width: 72%; }.skeleton span:nth-child(3) { width: 92%; }.skeleton span:nth-child(4) { width: 54%; }
	@keyframes shimmer { to { background-position: -200% 0; } }
	@media (max-width: 760px) {
		.page { padding: 10px 10px calc(72px + var(--space-8) + env(safe-area-inset-bottom, 0px)); }
		.toolbar { gap: 6px; flex-wrap: nowrap; align-items: center; }
		.tool:not(.primary) span { display: none; }
		.tool:not(.primary) { width: 38px; justify-content: center; padding: 0; }
		.tool { min-height: 38px; }
		.tool.primary { padding: 0 11px; font-size: 12px; }
		.back { min-height: 38px; padding: 0 4px; }
		.back span { display: none; }
		.back svg { width: 20px; height: 20px; }
		.message-head, .body { padding: var(--space-4); }
		.attachments { padding: var(--space-3) var(--space-4); }
		.sender-row { grid-template-columns: 36px minmax(0, 1fr); }
		.avatar { width: 36px; height: 36px; }
		time { grid-column: 2; margin-top: -8px; }
		.cc { margin-left: 48px; }
		.attachment-grid { grid-template-columns: 1fr; }
	}
</style>
