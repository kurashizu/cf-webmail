<script lang="ts">
	import { onMount } from 'svelte';
	import { invalidateAll } from '$app/navigation';
	import { formatDate, initials } from '$lib/format';

	let { data } = $props();
	let messages = $state<any[]>([]);
	let busy = $state<Set<string>>(new Set());
	let actionError = $state('');
	let refreshing = $state(false);
	let lastUpdated = $state<Date | null>(null);
	let newMessageCount = $state(0);
	let previousIds = new Set<string>();

	async function refreshInbox(manual = false) {
		if (refreshing || document.visibilityState !== 'visible') return;
		refreshing = true;
		if (manual) actionError = '';
		try {
			await invalidateAll();
			lastUpdated = new Date();
		} catch {
			if (manual) actionError = 'Could not refresh Inbox. Please try again.';
		} finally {
			refreshing = false;
		}
	}

	onMount(() => {
		lastUpdated = new Date();
		const timer = window.setInterval(() => refreshInbox(), 10_000);
		const onVisible = () => { if (document.visibilityState === 'visible') refreshInbox(); };
		document.addEventListener('visibilitychange', onVisible);
		return () => {
			window.clearInterval(timer);
			document.removeEventListener('visibilitychange', onVisible);
		};
	});

	$effect(() => {
		const incoming = data.messages.filter((message: any) => previousIds.size > 0 && !previousIds.has(message.id));
		if (incoming.length) newMessageCount += incoming.length;
		previousIds = new Set(data.messages.map((message: any) => message.id));
		messages = data.messages.map((message: any) => ({ ...message, flags: [...message.flags] }));
	});

	function isUnread(message: any) {
		return !message.flags.includes('\\Seen');
	}

	function isStarred(message: any) {
		return message.flags.includes('\\Flagged');
	}

	function setBusy(id: string, value: boolean) {
		const next = new Set(busy);
		if (value) next.add(id);
		else next.delete(id);
		busy = next;
	}

	async function toggleStar(message: any) {
		if (busy.has(message.id)) return;
		setBusy(message.id, true);
		actionError = '';
		try {
			const response = await fetch(`/api/messages/${message.id}/star`, { method: 'POST' });
			if (!response.ok) throw new Error();
			const result = await response.json();
			message.flags = result.flags;
			await invalidateAll();
		} catch {
			actionError = 'Could not update the message. Please try again.';
		} finally {
			setBusy(message.id, false);
		}
	}

	async function toggleRead(message: any) {
		if (busy.has(message.id)) return;
		setBusy(message.id, true);
		actionError = '';
		try {
			const response = await fetch(`/api/messages/${message.id}/read`, {
				method: isUnread(message) ? 'POST' : 'DELETE'
			});
			if (!response.ok) throw new Error();
			const result = await response.json();
			message.flags = result.flags;
			await invalidateAll();
		} catch {
			actionError = 'Could not update the message. Please try again.';
		} finally {
			setBusy(message.id, false);
		}
	}

	async function moveToTrash(message: any) {
		if (busy.has(message.id)) return;
		setBusy(message.id, true);
		actionError = '';
		try {
			const response = await fetch(`/api/messages/${message.id}/move`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ folder: 'Trash' })
			});
			if (!response.ok) throw new Error();
			messages = messages.filter((item) => item.id !== message.id);
			await invalidateAll();
		} catch {
			actionError = 'Could not move the message to Trash. Please try again.';
		} finally {
			setBusy(message.id, false);
		}
	}
</script>

<svelte:head><title>Inbox · KRSZ Mail</title></svelte:head>

<section class="page">
	<header class="page-head">
		<div>
			<p class="eyebrow">Mailbox</p>
			<h1>Inbox</h1>
		</div>
		<div class="head-actions">
			<div class="sync-status" title={lastUpdated ? `Last updated ${lastUpdated.toLocaleTimeString()}` : 'Checking for mail'}>
				<span class:syncing={refreshing}></span>{refreshing ? 'Checking…' : 'Live'}
			</div>
			<button class="refresh" type="button" onclick={() => refreshInbox(true)} disabled={refreshing} aria-label="Refresh Inbox" title="Refresh Inbox">
				<svg viewBox="0 0 24 24" fill="none"><path d="M20 7v5h-5M4 17v-5h5M18.4 10a7 7 0 0 0-12-3L4 9m16 6-2.4 2a7 7 0 0 1-12-3" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>
			</button>
			<span class="count">{messages.length} {messages.length === 1 ? 'message' : 'messages'}</span>
		</div>
	</header>

	{#if newMessageCount > 0}
		<button class="new-mail" type="button" onclick={() => (newMessageCount = 0)}>
			<svg viewBox="0 0 24 24" fill="none"><path d="M4 6h16v12H4V6Zm0 1 8 6 8-6" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/></svg>
			{newMessageCount} new {newMessageCount === 1 ? 'message' : 'messages'} received
			<span>Dismiss</span>
		</button>
	{/if}

	{#if actionError}
		<div class="action-error" role="alert">{actionError}</div>
	{/if}

	{#if messages.length === 0}
		<div class="empty">
			<div class="empty-icon" aria-hidden="true">✉</div>
			<h2>Your inbox is clear</h2>
			<p>New messages sent to <code>{data.userEmail}</code> will appear here.</p>
		</div>
	{:else}
		<ul class="list" aria-label="Inbox messages">
			{#each messages as message (message.id)}
				<li class="msg" class:unread={isUnread(message)}>
					<a href={`/inbox/${message.id}`} class="message-link" aria-label={`Open ${message.subject}`}>
						<div class="avatar" aria-hidden="true">{initials(message.fromName || message.fromAddr)}</div>
						<div class="meta">
							<div class="line">
								<span class="from">{message.fromName || message.fromAddr || 'Unknown sender'}</span>
								<span class="time">{formatDate(message.receivedAt)}</span>
							</div>
							<div class="subject">{message.subject}</div>
							<div class="preview">{message.preview || 'No preview available'}</div>
						</div>
						{#if message.hasAttachments}
							<span class="attachment" title="Has attachments" aria-label="Has attachments">⌕</span>
						{/if}
					</a>
					<div class="row-actions" aria-label="Message actions">
						<button
							class="icon-button star"
							class:active={isStarred(message)}
							type="button"
							disabled={busy.has(message.id)}
							onclick={() => toggleStar(message)}
							aria-label={isStarred(message) ? 'Remove star' : 'Add star'}
							title={isStarred(message) ? 'Remove star' : 'Add star'}
						>{isStarred(message) ? '★' : '☆'}</button>
						<button
							class="icon-button"
							type="button"
							disabled={busy.has(message.id)}
							onclick={() => toggleRead(message)}
							aria-label={isUnread(message) ? 'Mark as read' : 'Mark as unread'}
							title={isUnread(message) ? 'Mark as read' : 'Mark as unread'}
						>{isUnread(message) ? '○' : '●'}</button>
						<button
							class="icon-button danger"
							type="button"
							disabled={busy.has(message.id)}
							onclick={() => moveToTrash(message)}
							aria-label="Move to Trash"
							title="Move to Trash"
						>×</button>
					</div>
				</li>
			{/each}
		</ul>
	{/if}
</section>

<style>
	.page { width: min(100%, 1040px); margin: 0 auto; padding: var(--space-6); }
	.page-head { display: flex; justify-content: space-between; align-items: end; margin-bottom: var(--space-5); }
	.eyebrow { margin: 0 0 4px; color: var(--accent); font-size: 11px; font-weight: 700; letter-spacing: .12em; text-transform: uppercase; }
	.page-head h1 { margin: 0; font-size: clamp(25px, 3vw, 34px); font-weight: 600; letter-spacing: -.025em; }
	.head-actions { display: flex; align-items: center; gap: 8px; }
	.sync-status { display: inline-flex; align-items: center; gap: 6px; color: var(--text-muted); font-size: 10px; text-transform: uppercase; letter-spacing: .06em; }
	.sync-status > span { width: 6px; height: 6px; border-radius: 50%; background: #67c98b; box-shadow: 0 0 0 3px rgba(103,201,139,.1); }
	.sync-status > span.syncing { background: var(--accent); animation: pulse 1s ease infinite; }
	.refresh { width: 32px; height: 32px; display: grid; place-items: center; border-radius: var(--radius-md); color: var(--text-muted); }
	.refresh:hover:not(:disabled) { background: var(--accent-subtle); color: var(--accent); }
	.refresh:disabled { cursor: wait; opacity: .55; }
	.refresh svg { width: 17px; height: 17px; }
	.new-mail { width: 100%; display: flex; align-items: center; gap: 9px; margin-bottom: var(--space-4); padding: 10px 13px; border: 1px solid rgba(255,107,53,.25); border-radius: var(--radius-md); background: var(--accent-subtle); color: var(--accent); font-size: 12px; text-align: left; }
	.new-mail svg { width: 17px; height: 17px; }
	.new-mail span { margin-left: auto; color: var(--text-muted); font-size: 10px; text-transform: uppercase; }
	@keyframes pulse { 50% { opacity: .35; transform: scale(.8); } }
	.count { color: var(--text-muted); font-size: 12px; padding-bottom: 5px; }
	.action-error { margin-bottom: var(--space-4); padding: 10px 12px; border: 1px solid rgba(255,80,80,.3); border-radius: var(--radius-md); color: #ff9b9b; background: rgba(255,80,80,.08); font-size: 13px; }
	.empty { min-height: 380px; display: grid; place-content: center; justify-items: center; text-align: center; border: 1px dashed var(--border); border-radius: var(--radius-lg); padding: var(--space-8); color: var(--text-secondary); }
	.empty-icon { display: grid; place-items: center; width: 48px; height: 48px; margin-bottom: var(--space-4); border-radius: 50%; background: var(--accent-subtle); color: var(--accent); font-size: 20px; }
	.empty h2 { margin: 0 0 var(--space-2); color: var(--text-primary); font-size: 18px; font-weight: 600; }
	.empty p { margin: 0; font-size: 13px; }
	.empty code { padding: 2px 6px; border-radius: var(--radius-sm); background: var(--bg-elevated); font-size: 12px; }
	.list { list-style: none; margin: 0; padding: 0; border: 1px solid var(--border); border-radius: var(--radius-lg); overflow: hidden; background: var(--bg-secondary); }
	.msg { position: relative; display: grid; grid-template-columns: minmax(0, 1fr) auto; border-bottom: 1px solid var(--border); transition: background var(--transition-fast); }
	.msg:last-child { border-bottom: 0; }
	.msg:hover, .msg:focus-within { background: var(--bg-card); }
	.msg.unread { background: color-mix(in srgb, var(--accent-subtle) 42%, var(--bg-secondary)); }
	.message-link { min-width: 0; display: grid; grid-template-columns: 40px minmax(0, 1fr) auto; align-items: center; gap: var(--space-3); padding: 14px 8px 14px 16px; color: inherit; }
	.message-link:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }
	.avatar { width: 40px; height: 40px; display: grid; place-items: center; flex: none; border: 1px solid var(--border); border-radius: 50%; background: var(--bg-elevated); color: var(--accent); font-size: 12px; font-weight: 700; }
	.meta { min-width: 0; }
	.line { display: flex; align-items: baseline; justify-content: space-between; gap: var(--space-3); }
	.from { min-width: 0; overflow: hidden; color: var(--text-secondary); font-size: 14px; text-overflow: ellipsis; white-space: nowrap; }
	.unread .from, .unread .subject { color: var(--text-primary); font-weight: 650; }
	.time { flex: none; color: var(--text-muted); font-size: 11px; }
	.subject, .preview { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	.subject { margin-top: 2px; color: var(--text-primary); font-size: 14px; }
	.preview { margin-top: 2px; color: var(--text-muted); font-size: 12px; }
	.attachment { color: var(--text-muted); font-size: 14px; }
	.row-actions { display: flex; align-items: center; gap: 2px; padding: 0 12px 0 4px; opacity: .28; transition: opacity var(--transition-fast); }
	.msg:hover .row-actions, .msg:focus-within .row-actions { opacity: 1; }
	.icon-button { width: 32px; height: 32px; display: grid; place-items: center; padding: 0; border: 0; border-radius: var(--radius-md); background: transparent; color: var(--text-muted); cursor: pointer; font-size: 17px; transition: background var(--transition-fast), color var(--transition-fast); }
	.icon-button:hover:not(:disabled) { background: var(--bg-elevated); color: var(--text-primary); }
	.icon-button:focus-visible { outline: 2px solid var(--accent); }
	.icon-button:disabled { cursor: wait; opacity: .45; }
	.icon-button.star.active { color: var(--accent); opacity: 1; }
	.icon-button.danger:hover:not(:disabled) { color: #ff8888; }

	@media (max-width: 720px) {
		.page { padding: var(--space-4); }
		.page-head { margin-bottom: var(--space-4); }
		.message-link { grid-template-columns: 34px minmax(0, 1fr) auto; padding: 12px 6px 12px 12px; gap: 10px; }
		.avatar { width: 34px; height: 34px; }
		.row-actions { padding-right: 6px; opacity: 1; }
		.icon-button { width: 30px; }
		.icon-button.danger { display: none; }
		.preview { max-width: 60vw; }
	}

	@media (max-width: 480px) {
		.page { padding: 14px 10px; }
		.sync-status, .count { display: none; }
		.list { border-right: 0; border-left: 0; border-radius: 0; }
		.avatar { display: none; }
		.message-link { grid-template-columns: minmax(0, 1fr) auto; padding-left: 10px; }
		.row-actions .icon-button:not(.star) { display: none; }
	}
</style>
