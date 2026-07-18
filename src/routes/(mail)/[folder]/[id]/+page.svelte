<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { onMount } from 'svelte';
	import { formatAddresses, formatDate, initials } from '$lib/format';
	let { data } = $props();

	let bodyHtml = $state('');
	let bodyText = $state('');
	let loading = $state(true);
	let actionBusy = $state(false);
	let error = $state<string | null>(null);
	let starred = $state(false);
	$effect(() => {
		starred = data.message.flags.includes('\\Flagged');
	});
	let frameHeight = $state(420);

	const replySubject = $derived(/^re:/i.test(data.message.subject) ? data.message.subject : `Re: ${data.message.subject}`);
	const replyHref = $derived(`/compose?to=${encodeURIComponent(data.message.fromAddr || '')}&subject=${encodeURIComponent(replySubject)}`);

	async function loadBody() {
		loading = true;
		error = null;
		try {
			if (data.message.hasHtml) {
				const response = await fetch(`/api/messages/${data.message.id}/body?kind=html`);
				if (response.ok) {
					const result = await response.json();
					bodyHtml = result.body || '';
					if (bodyHtml) return;
				}
			}
			if (data.message.hasText) {
				const response = await fetch(`/api/messages/${data.message.id}/body?kind=text`);
				if (response.ok) {
					const result = await response.json();
					bodyText = result.body || '';
				}
			}
		} catch {
			error = 'Failed to load the message body.';
		} finally {
			loading = false;
		}
	}

	function resizeFrame(event: Event) {
		const frame = event.currentTarget as HTMLIFrameElement;
		try {
			const height = frame.contentDocument?.documentElement.scrollHeight || 420;
			frameHeight = Math.min(Math.max(height + 24, 320), 1800);
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
			const result = await response.json();
			starred = result.flags.includes('\\Flagged');
			await invalidateAll();
		} catch {
			error = 'Failed to update the message.';
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
			location.href = data.folderSlug === 'starred' ? '/starred' : '/inbox';
		} catch {
			error = 'Failed to move the message.';
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
			location.href = `/${data.folderSlug}`;
		} catch {
			error = 'Failed to update the message.';
			actionBusy = false;
		}
	}

	onMount(async () => {
		loadBody();
		const response = await fetch(`/api/messages/${data.message.id}/read`, { method: 'POST' });
		if (response.ok) await invalidateAll();
	});
</script>

<svelte:head><title>{data.message.subject} · KRSZ Mail</title></svelte:head>

<article class="page">
	<nav class="toolbar" aria-label="Message actions">
		<a class="back" href="/{data.folderSlug}">
			<svg viewBox="0 0 24 24" fill="none"><path d="m15 18-6-6 6-6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
			<span>{data.folder === 'INBOX' ? 'Inbox' : data.folder}</span>
		</a>
		<div class="toolbar-actions">
			<a class="tool primary" href={replyHref} title="Reply">
				<svg viewBox="0 0 24 24" fill="none"><path d="m9 8-5 4 5 4v-3h4a7 7 0 0 1 7 7v-2a9 9 0 0 0-9-9H9V8Z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/></svg><span>Reply</span>
			</a>
			<button class="tool" class:active={starred} onclick={toggleStar} disabled={actionBusy} title={starred ? 'Remove star' : 'Star message'}>
				<svg viewBox="0 0 24 24" fill={starred ? 'currentColor' : 'none'}><path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-2.9-5.6 2.9 1.1-6.2L3 9.6l6.2-.9L12 3Z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/></svg><span>{starred ? 'Starred' : 'Star'}</span>
			</button>
			<button class="tool" onclick={markUnread} disabled={actionBusy} title="Mark unread">
				<svg viewBox="0 0 24 24" fill="none"><path d="M4 6h16v12H4V6Zm0 1 8 6 8-6" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><circle cx="18" cy="6" r="3" fill="currentColor"/></svg><span>Unread</span>
			</button>
			{#if data.folder !== 'Trash'}
				<button class="tool danger" onclick={() => moveTo('Trash')} disabled={actionBusy} title="Move to Trash">
					<svg viewBox="0 0 24 24" fill="none"><path d="M4 7h16M9 11v6m6-6v6M6 7l1 14h10l1-14M9 7l1-4h4l1 4" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg><span>Delete</span>
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
					<div><strong>{data.message.fromName || data.message.fromAddr || 'Unknown sender'}</strong>{#if data.message.fromName}<span>&lt;{data.message.fromAddr}&gt;</span>{/if}</div>
					<p>To {formatAddresses(data.message.to) || 'undisclosed recipients'}</p>
				</div>
				<time datetime={new Date(data.message.receivedAt).toISOString()}>{formatDate(data.message.receivedAt)}</time>
			</div>
			{#if data.message.cc?.length}<div class="cc">Cc: {formatAddresses(data.message.cc)}</div>{/if}
		</header>

		{#if data.attachments.length}
			<section class="attachments" aria-label="Attachments">
				<div class="attachments-title"><svg viewBox="0 0 24 24" fill="none"><path d="m9 12 5-5a3 3 0 0 1 4 4l-7 7a5 5 0 0 1-7-7l7-7" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg><span>{data.attachments.length} {data.attachments.length === 1 ? 'attachment' : 'attachments'}</span></div>
				<div class="attachment-grid">{#each data.attachments as attachment (attachment.id)}
					<a class="attachment-card" href="/api/messages/{data.message.id}/attachments/{attachment.id}">
						<div><svg viewBox="0 0 24 24" fill="none"><path d="M6 3h8l4 4v14H6V3Zm8 0v5h4" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg></div>
						<span><strong>{attachment.filename || 'attachment'}</strong><small>{Math.max(1, Math.ceil((attachment.size || 0) / 1024))} KB</small></span>
						<svg class="download" viewBox="0 0 24 24" fill="none"><path d="M12 3v12m0 0 4-4m-4 4-4-4M5 21h14" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>
					</a>
				{/each}</div>
			</section>
		{/if}

		<section class="body">
			{#if loading}<div class="skeleton"><span></span><span></span><span></span><span></span></div>
			{:else if bodyHtml}<iframe srcdoc={bodyHtml} title="Message body" sandbox="allow-same-origin" style:height={`${frameHeight}px`} onload={resizeFrame}></iframe>
			{:else if bodyText}<pre>{bodyText}</pre>
			{:else}<p class="empty">This message has no body.</p>{/if}
		</section>
	</section>
</article>

<style>
	.page { width: min(100%, 980px); margin: 0 auto; padding: var(--space-5) var(--space-6) var(--space-10); }
	.toolbar { display: flex; align-items: center; justify-content: space-between; gap: var(--space-4); margin-bottom: var(--space-4); }
	.back { display: inline-flex; align-items: center; gap: 7px; color: var(--text-secondary); font-size: 12px; }
	.back svg { width: 18px; }
	.toolbar-actions { display: flex; align-items: center; gap: 3px; }
	.tool { min-height: 34px; display: inline-flex; align-items: center; gap: 6px; padding: 0 9px; border-radius: var(--radius-md); color: var(--text-muted); font-size: 11px; }
	.tool svg { width: 17px; height: 17px; }
	.tool:hover:not(:disabled), .tool.active { background: var(--accent-subtle); color: var(--accent); }
	.tool.primary { background: var(--accent-subtle); color: var(--accent); }
	.tool.danger:hover:not(:disabled) { background: rgba(255,80,80,.1); color: #ff9292; }
	.tool:disabled { opacity: .45; cursor: wait; }
	.notice { margin-bottom: var(--space-4); padding: 10px 12px; border: 1px solid rgba(255,80,80,.3); border-radius: var(--radius-md); background: rgba(255,80,80,.08); color: #ff9b9b; font-size: 12px; }
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
	.body iframe { display: block; width: 100%; min-height: 320px; border: 0; border-radius: var(--radius-md); background: white; transition: height var(--transition-base); }
	.body pre { margin: 0; white-space: pre-wrap; word-break: break-word; font-family: inherit; font-size: 14px; color: var(--text-primary); line-height: 1.75; }
	.body .empty { color: var(--text-muted); font-size: 13px; }
	.skeleton { display: grid; gap: 12px; padding-top: 5px; }
	.skeleton span { height: 11px; border-radius: var(--radius-full); background: linear-gradient(90deg, var(--bg-card), var(--bg-elevated), var(--bg-card)); background-size: 200% 100%; animation: shimmer 1.4s infinite; }
	.skeleton span:nth-child(1) { width: 85%; }.skeleton span:nth-child(2) { width: 72%; }.skeleton span:nth-child(3) { width: 92%; }.skeleton span:nth-child(4) { width: 54%; }
	@keyframes shimmer { to { background-position: -200% 0; } }
	@media (max-width: 680px) {
		.page { padding: 12px 10px var(--space-8); }
		.toolbar { align-items: flex-start; }
		.tool span { display: none; }
		.tool { width: 34px; justify-content: center; padding: 0; }
		.back span { display: none; }
		.message-head, .body { padding: var(--space-4); }
		.attachments { padding: var(--space-3) var(--space-4); }
		.sender-row { grid-template-columns: 36px minmax(0, 1fr); }
		.avatar { width: 36px; height: 36px; }
		time { grid-column: 2; margin-top: -8px; }
		.cc { margin-left: 48px; }
	}
</style>
