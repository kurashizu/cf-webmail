<script lang="ts">
	import { onMount } from 'svelte';
	import { invalidate } from '$app/navigation';
	import { formatDate, initials } from '$lib/format';

	let { data } = $props();
	let messages = $state<any[]>([]);
	let busy = $state<Set<string>>(new Set());
	let actionError = $state('');
	let refreshing = $state(false);
	let lastUpdated = $state<Date | null>(null);
	let newMessageCount = $state(0);
	let previousIds = new Set<string>();
	let selected = $state<Set<string>>(new Set());
	let bulkBusy = $state(false);
	let selectAllInput = $state<HTMLInputElement | null>(null);
	let storageDismissed = $state(false);
	let storage = $state<{ used_bytes: number; quota_bytes: number; message_count: number; quota_messages: number } | null>(null);
	const allSelected = $derived(messages.length > 0 && selected.size === messages.length);
	const partiallySelected = $derived(selected.size > 0 && selected.size < messages.length);

	const storageLevel = $derived.by(() => {
		if (!storage) return null;
		const qBytes = Number(storage.quota_bytes || 0);
		const qMessages = Number(storage.quota_messages || 0);
		const bytesRatio = qBytes > 0 ? Number(storage.used_bytes || 0) / qBytes : 0;
		const messagesRatio = qMessages > 0 ? Number(storage.message_count || 0) / qMessages : 0;
		const ratio = Math.max(bytesRatio, messagesRatio);
		if (ratio >= 0.95) return 'critical';
		if (ratio >= 0.85) return 'high';
		return null;
	});

	async function loadStorageSnapshot() {
		try {
			const response = await fetch('/api/storage', { headers: { accept: 'application/json' } });
			if (response.ok) storage = await response.json();
		} catch {
			/* silent */
		}
	}

	function formatMB(bytes: number) { return `${(bytes / 1024 / 1024).toFixed(1)} MB`; }

	async function refreshInbox(manual = false) {
		if (refreshing || document.visibilityState !== 'visible') return;
		refreshing = true;
		if (manual) actionError = '';
		try {
			await invalidate('/inbox');
			lastUpdated = new Date();
		} catch {
			if (manual) actionError = 'Could not refresh Inbox. Please try again.';
		} finally {
			refreshing = false;
		}
	}

	onMount(() => {
			lastUpdated = new Date();
			loadStorageSnapshot();
			const storageTimer = window.setInterval(loadStorageSnapshot, 60_000);
			const timer = window.setInterval(() => refreshInbox(), 10_000);
			const onVisible = () => { if (document.visibilityState === 'visible') refreshInbox(); };
			document.addEventListener('visibilitychange', onVisible);
			return () => {
				window.clearInterval(timer);
				window.clearInterval(storageTimer);
				document.removeEventListener('visibilitychange', onVisible);
			};
		});

	$effect(() => {
		const source = data.messages;
		const nextMessages = source.map((message: any) => ({ ...message, flags: [...message.flags] }));
		const incoming = nextMessages.filter((message: any) => previousIds.size > 0 && !previousIds.has(message.id));
		if (incoming.length) newMessageCount += incoming.length;
		previousIds = new Set(nextMessages.map((message: any) => message.id));
		messages = nextMessages;
		selected = new Set();
	});

	$effect(() => {
		if (selectAllInput) selectAllInput.indeterminate = partiallySelected;
	});

	function toggleSelected(id: string) {
		const next = new Set(selected);
		if (next.has(id)) next.delete(id); else next.add(id);
		selected = next;
	}

	function toggleAll() {
		selected = allSelected ? new Set() : new Set(messages.map((message) => message.id));
	}

	async function bulkAction(action: string, folder?: string) {
		if (!selected.size || bulkBusy) return;
		bulkBusy = true; actionError = '';
		try {
			const response = await fetch('/api/messages/bulk', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ids: [...selected], action, folder }) });
			if (!response.ok) throw new Error((await response.json().catch(() => ({}))).message || 'Bulk action failed.');
			if (action === 'move') messages = messages.filter((message) => !selected.has(message.id));
			else messages = messages.map((message) => selected.has(message.id) ? { ...message, flags: updateLocalFlags(message.flags, action) } : message);
			selected = new Set(); await invalidate('/inbox');
		} catch (error) { actionError = error instanceof Error ? error.message : 'Bulk action failed.'; }
		finally { bulkBusy = false; }
	}

	function updateLocalFlags(flags: string[], action: string) {
		const flag = action === 'read' || action === 'unread' ? '\\Seen' : '\\Flagged';
		const enabled = action === 'read' || action === 'star';
		return enabled ? (flags.includes(flag) ? flags : [...flags, flag]) : flags.filter((item) => item !== flag);
	}
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
			await invalidate('/inbox');
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
			await invalidate('/inbox');
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
			await invalidate('/inbox');
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

	{#if storageLevel && !storageDismissed}
			<div class="storage-banner" data-level={storageLevel} role="status">
				<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 9v4m0 4h.01M10.3 3.86c.77-1.36 2.63-1.36 3.4 0l8.45 14.86A2 2 0 0 1 20.4 22H3.6a2 2 0 0 1-1.75-3.28L10.3 3.86Z" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>
				<div>
					<strong>{storageLevel === 'critical' ? 'Mailbox full — incoming mail will be rejected.' : 'Mailbox nearly full.'}</strong>
					<span>
						{#if storage}
							{formatMB(Number(storage.used_bytes || 0))} of {storage.quota_bytes ? formatMB(storage.quota_bytes) : 'unlimited'} used ·
							{Number(storage.message_count || 0).toLocaleString()} of {storage.quota_messages ? storage.quota_messages.toLocaleString() : '∞'} messages
						{/if}
					</span>
				</div>
				<a class="btn btn-ghost" href="/settings#storage">Manage</a>
				<button type="button" aria-label="Dismiss" onclick={() => (storageDismissed = true)}>×</button>
			</div>
		{/if}

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

		{#if messages.length > 0}<div class="bulk-bar card" class:has-selection={selected.size > 0}><label class="select-all" title="Select all messages"><input bind:this={selectAllInput} type="checkbox" checked={allSelected} onchange={toggleAll} /><span>{selected.size ? `${selected.size} selected` : 'Select all'}</span></label>{#if selected.size > 0}<div class="bulk-actions"><button disabled={bulkBusy} onclick={() => bulkAction('read')} title="Mark as read"><svg viewBox="0 0 24 24" fill="none"><path d="M3 6h18v12H3V6Zm0 1 9 7 9-7" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/></svg><span>Read</span></button><button disabled={bulkBusy} onclick={() => bulkAction('unread')} title="Mark as unread"><svg viewBox="0 0 24 24" fill="none"><path d="M3 7h18v11H3V7Zm0 0 9 6 9-6" stroke="currentColor" stroke-width="1.7"/></svg><span>Unread</span></button><button disabled={bulkBusy} onclick={() => bulkAction('star')} title="Add star">☆<span>Star</span></button><button disabled={bulkBusy} onclick={() => bulkAction('unstar')} title="Remove star">★<span>Unstar</span></button><button class="trash" disabled={bulkBusy} onclick={() => bulkAction('move', 'Trash')} title="Move to Trash"><svg viewBox="0 0 24 24" fill="none"><path d="M5 7h14m-11 0 1 13h6l1-13m-6 4v5m4-5v5M9 7l1-3h4l1 3" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg><span>Trash</span></button></div>{/if}</div>{/if}

		{#if messages.length === 0}
		<div class="empty">
			<div class="empty-icon" aria-hidden="true">✉</div>
			<h2>Your inbox is clear</h2>
			<p>New messages sent to <code>{data.userEmail}</code> will appear here.</p>
		</div>
	{:else}
		<ul class="list" aria-label="Inbox messages">
			{#each messages as message (message.id)}
				<li class="msg" class:unread={isUnread(message)} class:selected={selected.has(message.id)}>
					<label class="row-select" aria-label={`Select ${message.subject}`}><input type="checkbox" checked={selected.has(message.id)} onchange={() => toggleSelected(message.id)} /></label>
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
		.storage-banner { display: flex; align-items: center; gap: 12px; margin-bottom: var(--space-4); padding: 11px 14px; border: 1px solid; border-radius: var(--radius-md); font-size: 12px; }
		.storage-banner[data-level='high'] { border-color: rgba(245,165,36,.3); background: rgba(245,165,36,.08); color: #f5c97b; }
		.storage-banner[data-level='critical'] { border-color: rgba(255,80,80,.3); background: rgba(255,80,80,.08); color: #ff9b9b; }
		.storage-banner svg { width: 18px; height: 18px; flex: none; }
		.storage-banner strong { display: block; font-size: 12px; font-weight: 600; }
		.storage-banner span { display: block; margin-top: 2px; font-size: 11px; opacity: .9; }
		.storage-banner .btn { margin-left: auto; padding: 6px 12px; font-size: 11px; }
		.storage-banner > button { width: 28px; height: 28px; border: 0; border-radius: 50%; background: transparent; color: inherit; font-size: 18px; opacity: .65; }
		.storage-banner > button:hover { background: rgba(255,255,255,.06); opacity: 1; }
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
	.msg { position: relative; display: grid; grid-template-columns: 32px minmax(0, 1fr) auto; border-bottom: 1px solid var(--border); transition: background var(--transition-fast); }
	.msg.selected { background: var(--accent-subtle); }
	.row-select { display: grid; place-items: center; padding-left: 8px; cursor: pointer; }
	.row-select input, .select-all input {
		width: 16px;
		min-width: 16px;
		max-width: 16px;
		height: 16px;
		min-height: 16px;
		max-height: 16px;
		aspect-ratio: 1 / 1;
		flex: 0 0 16px;
		padding: 0;
		margin: 0;
		appearance: none;
		-webkit-appearance: none;
		border: 1px solid var(--border-hover);
		border-radius: 4px;
		background: color-mix(in srgb, var(--bg-elevated) 78%, transparent);
		cursor: pointer;
		transition: border-color var(--transition-fast), background var(--transition-fast), box-shadow var(--transition-fast);
	}
	.row-select input:hover, .select-all input:hover { border-color: var(--accent); }
	.row-select input:focus-visible, .select-all input:focus-visible { outline: 2px solid color-mix(in srgb, var(--accent) 45%, transparent); outline-offset: 2px; }
	.row-select input:checked, .select-all input:checked, .select-all input:indeterminate {
		border-color: var(--accent);
		background-color: var(--accent);
		box-shadow: inset 0 0 0 1px color-mix(in srgb, white 10%, transparent);
	}
	.row-select input:checked, .select-all input:checked {
		background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E%3Cpath d='m3.5 8 3 3 6-6' fill='none' stroke='white' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");
	}
	.select-all input:indeterminate {
		background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E%3Cpath d='M4 8h8' fill='none' stroke='white' stroke-width='2' stroke-linecap='round'/%3E%3C/svg%3E");
	}
	.bulk-bar { min-height: 47px; display: flex; align-items: center; gap: 14px; margin-bottom: 10px; padding: 7px 12px; overflow: hidden; }
	.bulk-bar.has-selection { border-color: rgba(255,107,53,.3); }
	.select-all { display: flex; flex: none; align-items: center; gap: 8px; color: var(--text-muted); font-size: 11px; cursor: pointer; }
	.bulk-actions { min-width: 0; display: flex; flex: 1; align-items: center; gap: 3px; padding-left: 12px; border-left: 1px solid var(--border); overflow-x: auto; scrollbar-width: thin; }
	.bulk-actions button { min-height: 31px; display: flex; flex: none; align-items: center; gap: 5px; padding: 5px 8px; border: 0; border-radius: 7px; background: transparent; color: var(--text-muted); font-size: 11px; white-space: nowrap; }
	.bulk-actions button:hover:not(:disabled) { background: var(--bg-elevated); color: var(--text-primary); }
	.bulk-actions button.trash:hover:not(:disabled) { color: #ff9292; }
	.bulk-actions svg { width: 16px; height: 16px; }
	.bulk-actions button:disabled { opacity: .45; }
	.msg:last-child { border-bottom: 0; }
	.msg:hover, .msg:focus-within { background: var(--bg-card); }
	.msg.unread { background: color-mix(in srgb, var(--accent-subtle) 42%, var(--bg-secondary)); }
	.message-link { min-width: 0; display: grid; grid-template-columns: 40px minmax(0, 1fr) auto; align-items: center; gap: var(--space-3); padding: 14px 8px 14px 4px; color: inherit; }
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
		.message-link { grid-template-columns: 34px minmax(0, 1fr) auto; padding: 12px 6px 12px 4px; gap: 10px; }
		.avatar { width: 34px; height: 34px; }
		.row-actions { padding-right: 6px; opacity: 1; }
		.icon-button { width: 30px; }
		.icon-button.danger { display: none; }
		.preview { max-width: 100%; }
	}

	@media (max-width: 480px) {
		.page { padding: 14px 10px; }
		.bulk-actions span { display: none; }
		.bulk-actions { gap: 0; padding-left: 7px; }
		.bulk-actions button { padding: 6px; }
		.bulk-bar { padding: 7px 9px; }
		.list { border-right: 0; border-left: 0; border-radius: 0; }
		.avatar { display: none; }
		.message-link { grid-template-columns: minmax(0, 1fr) auto; padding-left: 10px; }
		.row-actions .icon-button:not(.star) { display: none; }
	}
</style>
