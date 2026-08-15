<script lang="ts">
	import { onMount } from 'svelte';
	import { invalidate } from '$app/navigation';
	import { formatDate, initials } from '$lib/format';
	import { toastStore } from '$lib/toast';
	import Pager from '$lib/components/Pager.svelte';
	import { t, type Locale } from '$lib/i18n';

	let { data } = $props();
	const tt = (key: string, params?: Record<string, string | number>) =>
		t(data.locale as Locale, key, params);

	let messages = $state<any[]>([]);
	let busy = $state<Set<string>>(new Set());
	let actionError = $state('');
	let refreshing = $state(false);
	let lastUpdated = $state<Date | null>(null);
	let newMessageCount = $state(0);
	let previousIds = new Set<string>();
	let currentPage = 0;
	let selected = $state<Set<string>>(new Set());
	let bulkBusy = $state(false);
	let selectAllInput = $state<HTMLInputElement | null>(null);
	let storageDismissed = $state(false);
	let markAllReadBusy = $state(false);
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

	async function markAllRead() {
		if (markAllReadBusy) return;
		markAllReadBusy = true;
		try {
			const ids = messages.filter((m) => isUnread(m)).map((m) => m.id);
			if (!ids.length) {
				toastStore.info(tt('toast.markAllRead.allRead'));
				return;
			}
			const response = await fetch('/api/messages/bulk', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ ids, action: 'read' })
			});
			if (!response.ok) throw new Error();
			messages = messages.map((m) => ({
				...m,
				flags: m.flags.includes('\\Seen') ? m.flags : [...m.flags, '\\Seen']
			}));
			selected = new Set();
			await invalidate('/inbox');
			toastStore.success(tt('toast.markAllRead.success', { count: ids.length }));
		} catch {
			toastStore.error(tt('toast.markAllRead.error'));
		} finally {
			markAllReadBusy = false;
		}
	}

	async function loadStorageSnapshot() {
		try {
			const response = await fetch('/api/storage', { headers: { accept: 'application/json' } });
			if (response.ok) storage = await response.json();
		} catch {
			/* silent */
		}
	}

	function formatMB(bytes: number) {
		return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
	}

	async function refreshInbox(manual = false) {
		if (refreshing) return;
		if (data.pagination.page !== 1) return;
		if (!manual && document.visibilityState !== 'visible') return;
		refreshing = true;
		if (manual) actionError = '';
		try {
			const resp = await fetch(`/api/inbox?page=${data.pagination.page}`);
			if (!resp.ok) throw new Error();
			const fresh = (await resp.json()) as { messages: any[] };
			if (fresh && Array.isArray(fresh.messages)) {
				const incoming = fresh.messages.filter(
					(m: any) => previousIds.size > 0 && !previousIds.has(m.id)
				);
				if (incoming.length) newMessageCount += incoming.length;
				previousIds = new Set(fresh.messages.map((m: any) => m.id));
				messages = fresh.messages.map((m: any) => ({ ...m, flags: [...m.flags] }));
				selected = new Set();
			}
			lastUpdated = new Date();
			if (manual) toastStore.success(tt('toast.inbox.refreshed'));
		} catch {
			if (manual) toastStore.error(tt('toast.inbox.refreshError'));
		} finally {
			refreshing = false;
		}
	}

	onMount(() => {
		lastUpdated = new Date();
		loadStorageSnapshot();
		const storageTimer = window.setInterval(loadStorageSnapshot, 60_000);
		const timer = window.setInterval(() => refreshInbox(), 10_000);
		const onVisible = () => {
			if (document.visibilityState === 'visible') refreshInbox();
		};
		document.addEventListener('visibilitychange', onVisible);
		return () => {
			window.clearInterval(timer);
			window.clearInterval(storageTimer);
			document.removeEventListener('visibilitychange', onVisible);
		};
	});

	$effect(() => {
		const source = data.messages;
		if (data.pagination.page !== currentPage) {
			currentPage = data.pagination.page;
			previousIds = new Set(source.map((message: any) => message.id));
		}
		messages = source.map((message: any) => ({ ...message, flags: [...message.flags] }));
		selected = new Set();
	});

	$effect(() => {
		if (selectAllInput) selectAllInput.indeterminate = partiallySelected;
	});

	function toggleSelected(id: string) {
		const next = new Set(selected);
		if (next.has(id)) next.delete(id);
		else next.add(id);
		selected = next;
	}

	function toggleAll() {
		selected = allSelected ? new Set() : new Set(messages.map((message) => message.id));
	}

	async function bulkAction(action: string, folder?: string) {
		if (!selected.size || bulkBusy) return;
		bulkBusy = true;
		actionError = '';
		try {
			const response = await fetch('/api/messages/bulk', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ ids: [...selected], action, folder })
			});
			if (!response.ok)
				throw new Error(
					((await response.json().catch(() => ({}))) as { message?: string }).message ||
						tt('toast.bulk.error')
				);
			if (action === 'move')
				messages = messages.filter((message) => !selected.has(message.id));
			else
				messages = messages.map((message) =>
					selected.has(message.id)
						? { ...message, flags: updateLocalFlags(message.flags, action) }
						: message
				);
			selected = new Set();
			await invalidate('/inbox');
		} catch (error) {
			actionError = error instanceof Error ? error.message : tt('toast.bulk.error');
		} finally {
			bulkBusy = false;
		}
	}

	function updateLocalFlags(flags: string[], action: string) {
		const flag = action === 'read' || action === 'unread' ? '\\Seen' : '\\Flagged';
		const enabled = action === 'read' || action === 'star';
		return enabled
			? flags.includes(flag)
				? flags
				: [...flags, flag]
			: flags.filter((item) => item !== flag);
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
			const result = (await response.json()) as { flags: string[] };
			message.flags = result.flags;
			await invalidate('/inbox');
		} catch {
			actionError = tt('toast.message.error');
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
			const result = (await response.json()) as { flags: string[] };
			message.flags = result.flags;
			await invalidate('/inbox');
		} catch {
			actionError = tt('toast.message.error');
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
			toastStore.info(tt('toast.message.movedToTrash'));
		} catch {
			toastStore.error(tt('toast.message.moveToTrashError'));
		} finally {
			setBusy(message.id, false);
		}
	}

	/** Format "X used · Y messages" line in the storage banner. */
	function storageQuotaText(): string {
		if (!storage) return '';
		const used = formatMB(Number(storage.used_bytes || 0));
		const total = storage.quota_bytes ? formatMB(storage.quota_bytes) : tt('settings.storageQuotaUnlimited');
		const count = Number(storage.message_count || 0).toLocaleString();
		const countLimit = storage.quota_messages
			? storage.quota_messages.toLocaleString()
			: '∞';
		return `${used} / ${total} · ${count} / ${countLimit}`;
	}
</script>

<svelte:head>
	<title>{tt('inbox.title')} · {tt('common.brandName')}</title>
</svelte:head>

<section class="page">
	<header class="page-head">
		<div>
			<p class="eyebrow">{tt('nav.inbox')}</p>
			<h1>{tt('inbox.title')}</h1>
		</div>
		<div class="head-actions">
			<div
				class="sync-status"
				title={lastUpdated
					? tt('inbox.lastUpdated', { time: lastUpdated.toLocaleTimeString() })
					: tt('inbox.checkingMail')}
			>
				<span class="dot" class:syncing={refreshing}></span>{refreshing
					? tt('inbox.checking')
					: tt('inbox.live')}
			</div>
			<button
				class="refresh"
				type="button"
				onclick={() => refreshInbox(true)}
				disabled={refreshing}
				aria-label={tt('inbox.refreshAria')}
				title={tt('inbox.refreshAria')}
			>
				<svg viewBox="0 0 24 24" fill="none"
					><path
						d="M20 7v5h-5M4 17v-5h5M18.4 10a7 7 0 0 0-12-3L4 9m16 6-2.4 2a7 7 0 0 1-12-3"
						stroke="currentColor"
						stroke-width="1.7"
						stroke-linecap="round"
						stroke-linejoin="round"
					/></svg
				>
			</button>
			<button
				class="mark-all-read"
				type="button"
				onclick={markAllRead}
				disabled={markAllReadBusy}
				title={tt('inbox.markAllRead')}
				aria-label={tt('inbox.markAllReadAria')}
			>
				<svg viewBox="0 0 24 24" fill="none"
					><path
						d="M3 6h18v12H3V6Zm0 1 9 7 9-7"
						stroke="currentColor"
						stroke-width="1.7"
						stroke-linejoin="round"
					/></svg
				>
			</button>
			<span class="count">{tt('common.messageCount', { count: messages.length })}</span>
		</div>
	</header>

	{#if storageLevel && !storageDismissed}
		<div class="storage-banner" data-level={storageLevel} role="status">
			<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"
				><path
					d="M12 9v4m0 4h.01M10.3 3.86c.77-1.36 2.63-1.36 3.4 0l8.45 14.86A2 2 0 0 1 20.4 22H3.6a2 2 0 0 1-1.75-3.28L10.3 3.86Z"
					stroke="currentColor"
					stroke-width="1.7"
					stroke-linecap="round"
					stroke-linejoin="round"
				/></svg
			>
			<div>
				<strong>{storageLevel === 'critical' ? tt('mail.storageCritical') : tt('mail.storageHigh')}</strong>
				<span>{storageQuotaText()}</span>
			</div>
			<a class="btn btn-ghost" href="/settings#storage">{tt('common.manage')}</a>
			<button type="button" aria-label={tt('common.dismiss')} onclick={() => (storageDismissed = true)}>×</button>
		</div>
	{/if}

	{#if newMessageCount > 0}
		<button class="new-mail" type="button" onclick={() => (newMessageCount = 0)}>
			<svg viewBox="0 0 24 24" fill="none"
				><path
					d="M4 6h16v12H4V6Zm0 1 8 6 8-6"
					stroke="currentColor"
					stroke-width="1.7"
					stroke-linejoin="round"
				/></svg
			>
			{tt('inbox.newMessages', { count: newMessageCount })}
			<span>{tt('common.dismiss')}</span>
		</button>
	{/if}

	{#if actionError}
		<div class="action-error" role="alert">{actionError}</div>
	{/if}

	{#if messages.length > 0}
		<div class="bulk-bar card" class:has-selection={selected.size > 0}>
			<label class="select-all" title={tt('inbox.selectAll')}>
				<input
					bind:this={selectAllInput}
					type="checkbox"
					checked={allSelected}
					onchange={toggleAll}
				/>
				<span>{selected.size
					? tt('inbox.selectedCount', { count: selected.size })
					: tt('inbox.selectAll')}</span>
			</label>
			{#if selected.size > 0}
				<div class="bulk-actions">
					<button
						data-action="mark-read"
						disabled={bulkBusy}
						onclick={() => bulkAction('read')}
						title={tt('inbox.markAsRead')}
					>
						<svg viewBox="0 0 24 24" fill="none"
							><path
								d="M3 6h18v12H3V6Zm0 1 9 7 9-7"
								stroke="currentColor"
								stroke-width="1.7"
								stroke-linejoin="round"
							/></svg
						>
						<span>{tt('inbox.bulkRead')}</span>
					</button>
					<button
						data-action="mark-unread"
						disabled={bulkBusy}
						onclick={() => bulkAction('unread')}
						title={tt('message.markUnread')}
					>
						<svg viewBox="0 0 24 24" fill="none"
							><path
								d="M3 7h18v11H3V7Zm0 0 9 6 9-6"
								stroke="currentColor"
								stroke-width="1.7"
							/></svg
						>
						<span>{tt('inbox.bulkUnread')}</span>
					</button>
					<button
						data-action="star"
						disabled={bulkBusy}
						onclick={() => bulkAction('star')}
						title={tt('inbox.addStar')}
					>
						☆<span>{tt('inbox.bulkStar')}</span>
					</button>
					<button
						data-action="unstar"
						disabled={bulkBusy}
						onclick={() => bulkAction('unstar')}
						title={tt('inbox.removeStar')}
					>
						★<span>{tt('inbox.bulkUnstar')}</span>
					</button>
					<button
						class="trash"
						data-action="trash"
						disabled={bulkBusy}
						onclick={() => bulkAction('move', 'Trash')}
						title={tt('inbox.moveToTrash')}
					>
						<svg viewBox="0 0 24 24" fill="none"
							><path
								d="M5 7h14m-11 0 1 13h6l1-13m-6 4v5m4-5v5M9 7l1-3h4l1 3"
								stroke="currentColor"
								stroke-width="1.7"
								stroke-linecap="round"
							/></svg
						>
						<span>{tt('inbox.bulkTrash')}</span>
					</button>
				</div>
			{/if}
		</div>
	{/if}

	{#if messages.length === 0}
		<div class="empty">
			<div class="empty-icon" aria-hidden="true">✉</div>
			<h2>{tt('inbox.empty.title')}</h2>
			<p>{tt('inbox.empty.bodyBefore')}<code>{data.userEmail}</code>{tt('inbox.empty.bodyAfter')}</p>
		</div>
	{:else}
		<ul class="list" aria-label={tt('inbox.title')}>
			{#each messages as message (message.id)}
				<li class="msg" class:unread={isUnread(message)} class:selected={selected.has(message.id)}>
					<span class="unread-dot" aria-hidden="true"></span>
					<label class="row-select" aria-label={`Select ${message.subject}`}>
						<input
							type="checkbox"
							checked={selected.has(message.id)}
							onchange={() => toggleSelected(message.id)}
						/>
					</label>
					<a href={`/inbox/${message.id}`} class="message-link" aria-label={`Open ${message.subject}`}>
						<div class="avatar" aria-hidden="true">{initials(message.fromName || message.fromAddr)}</div>
						<div class="meta">
							<div class="line">
								<span class="from">{message.fromName || message.fromAddr || tt('inbox.unknownSender')}</span>
								<span class="time">{formatDate(message.receivedAt)}</span>
							</div>
							<div class="subject">{message.subject}</div>
							<div class="preview">{message.preview || tt('inbox.noPreview')}</div>
						</div>
						{#if message.hasAttachments}
							<span class="attachment" title={tt('inbox.hasAttachments')} aria-label={tt('inbox.hasAttachments')}>⌕</span>
						{/if}
					</a>
					<div class="row-actions" aria-label="Message actions">
						<button
							class="icon-button star"
							class:active={isStarred(message)}
							type="button"
							disabled={busy.has(message.id)}
							onclick={() => toggleStar(message)}
							aria-label={isStarred(message) ? tt('inbox.removeStar') : tt('inbox.addStar')}
							title={isStarred(message) ? tt('inbox.removeStar') : tt('inbox.addStar')}
							data-action="star"
						>{isStarred(message) ? '★' : '☆'}</button>
						<button
							class="icon-button"
							type="button"
							disabled={busy.has(message.id)}
							onclick={() => toggleRead(message)}
							aria-label={isUnread(message) ? tt('inbox.markAsRead') : tt('inbox.markAsUnread')}
							title={isUnread(message) ? tt('inbox.markAsRead') : tt('inbox.markAsUnread')}
							data-action="mark-unread"
						>{isUnread(message) ? '○' : '●'}</button>
						<button
							class="icon-button danger"
							type="button"
							disabled={busy.has(message.id)}
							onclick={() => moveToTrash(message)}
							aria-label={tt('inbox.moveToTrash')}
							title={tt('inbox.moveToTrash')}
							data-action="trash"
						>×</button>
					</div>
				</li>
			{/each}
		</ul>
	{/if}

	<Pager page={data.pagination.page} totalPages={data.pagination.totalPages} baseHref="/inbox" />
</section>

<style>
	.page { width: min(100%, 1040px); margin: 0 auto; padding: var(--space-6); }
	.page-head { display: flex; justify-content: space-between; align-items: end; margin-bottom: var(--space-5); }
	.eyebrow { margin: 0 0 4px; color: var(--accent); font-size: 11px; font-weight: 700; letter-spacing: .12em; text-transform: uppercase; }
	.page-head h1 { margin: 0; font-size: clamp(25px, 3vw, 34px); font-weight: 600; letter-spacing: -.025em; }
	.head-actions { display: flex; align-items: center; gap: 8px; }
	.sync-status { display: inline-flex; align-items: center; gap: 6px; color: var(--text-muted); font-size: 10px; text-transform: uppercase; letter-spacing: .06em; }
	.sync-status > span { width: 6px; height: 6px; border-radius: 50%; background: var(--color-online); box-shadow: 0 0 0 3px var(--color-success-bg); }
	.sync-status > span.syncing { background: var(--accent); animation: pulse 1s ease infinite; }
	.refresh { width: 32px; height: 32px; display: grid; place-items: center; border-radius: var(--radius-md); color: var(--text-muted); }
	.refresh:hover:not(:disabled) { background: var(--accent-subtle); color: var(--accent); }
		.storage-banner { display: flex; align-items: center; gap: 12px; margin-bottom: var(--space-4); padding: 11px 14px; border: 1px solid; border-radius: var(--radius-md); font-size: 12px; }
		.storage-banner[data-level='high'] { border-color: var(--color-warning-border); background: var(--color-warning-bg); color: var(--color-warning); }
		.storage-banner[data-level='critical'] { border-color: var(--color-danger-border); background: var(--color-danger-bg); color: var(--color-danger); }
		.storage-banner svg { width: 18px; height: 18px; flex: none; }
		.storage-banner strong { display: block; font-size: 12px; font-weight: 600; }
		.storage-banner span { display: block; margin-top: 2px; font-size: 11px; opacity: .9; }
		.storage-banner .btn { margin-left: auto; padding: 6px 12px; font-size: 11px; }
		.storage-banner > button { width: 28px; height: 28px; border: 0; border-radius: 50%; background: transparent; color: inherit; font-size: 18px; opacity: .65; }
		.storage-banner > button:hover { background: color-mix(in srgb, var(--text-primary) 8%, transparent); opacity: 1; }
	.mark-all-read { width: 32px; height: 32px; display: grid; place-items: center; border-radius: var(--radius-md); color: var(--text-muted); }
		.mark-all-read:hover:not(:disabled) { background: var(--accent-subtle); color: var(--accent); }
		.mark-all-read:disabled { cursor: wait; opacity: .55; }
		.mark-all-read svg { width: 17px; height: 17px; }
		.refresh:disabled { cursor: wait; opacity: .55; }
	.refresh svg { width: 17px; height: 17px; }
	.new-mail { width: 100%; display: flex; align-items: center; gap: 9px; margin-bottom: var(--space-4); padding: 10px 13px; border: 1px solid var(--accent-soft); border-radius: var(--radius-md); background: var(--accent-subtle); color: var(--accent); font-size: 12px; text-align: left; }
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
	.msg {
		position: relative;
		display: grid;
		grid-template-columns: 8px 32px minmax(0, 1fr) auto;
		border-bottom: 1px solid var(--border);
		transition: background var(--transition-fast);
	}
	/* Left accent stripe — slides in on hover, locks in on selection. */
	.msg::before {
		content: '';
		position: absolute;
		left: 0;
		top: 0;
		bottom: 0;
		width: 2px;
		background: var(--accent);
		transform: scaleY(0);
		transform-origin: center;
		transition: transform var(--transition-base) var(--ease-snap);
	}
	.msg:hover::before { transform: scaleY(0.6); }
	.msg.selected::before { transform: scaleY(1); }
	/* Unread dot — small phosphor marker in the gutter. */
	.unread-dot {
		display: block;
		align-self: center;
		justify-self: center;
		width: 6px;
		height: 6px;
		border-radius: 50%;
		background: transparent;
		transform: scale(0.5);
		transition: background var(--transition-base), transform var(--transition-base), box-shadow var(--transition-base);
	}
	.msg.unread .unread-dot {
		background: var(--accent);
		box-shadow: 0 0 8px var(--accent-glow);
		transform: scale(1);
	}
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
	}
	.row-select input:checked, .select-all input:checked { background: var(--accent); border-color: var(--accent); }
	.message-link { display: grid; grid-template-columns: 36px minmax(0, 1fr) auto; gap: 12px; padding: 12px 14px; color: inherit; min-width: 0; }
	.message-link:hover { background: var(--bg-elevated); }
	.avatar { width: 36px; height: 36px; display: grid; place-items: center; border-radius: 50%; background: var(--accent-subtle); color: var(--accent); font-family: var(--font-mono); font-size: 11px; font-weight: 700; flex: none; }
	.meta { min-width: 0; }
	.line { display: flex; align-items: baseline; gap: 10px; }
	.from { font-size: 13px; font-weight: 600; color: var(--text-primary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; flex: 1; min-width: 0; }
	.time { color: var(--text-muted); font-size: 11px; font-family: var(--font-mono); flex: none; }
	.subject { margin-top: 3px; font-size: 13px; color: var(--text-secondary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
	.preview { margin-top: 2px; font-size: 12px; color: var(--text-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
	.attachment { color: var(--accent); font-size: 14px; }
	.row-actions { display: flex; align-items: center; gap: 4px; padding-right: 6px; opacity: 0; transition: opacity var(--transition-fast); }
	.msg:hover .row-actions, .msg.unread .row-actions { opacity: 1; }
	.icon-button { width: 28px; height: 28px; display: grid; place-items: center; border: 0; background: transparent; border-radius: var(--radius-sm); color: var(--text-muted); cursor: pointer; font-size: 14px; }
	.icon-button:hover:not(:disabled) { background: var(--bg-elevated); color: var(--text-primary); }
	.icon-button:disabled { opacity: .4; cursor: wait; }
	.icon-button.star.active { color: var(--accent); }
	.icon-button.danger:hover { color: var(--color-danger); }
	.bulk-bar { display: flex; align-items: center; gap: 12px; padding: 10px 14px; margin-bottom: var(--space-4); }
	.bulk-bar.has-selection { border-color: var(--accent); }
	.select-all { display: flex; align-items: center; gap: 9px; font-size: 12px; color: var(--text-secondary); cursor: pointer; }
	.bulk-actions { margin-left: auto; display: flex; align-items: center; gap: 4px; }
	.bulk-actions button { display: inline-flex; align-items: center; gap: 6px; padding: 6px 10px; border: 0; background: transparent; border-radius: var(--radius-sm); color: var(--text-secondary); font-size: 12px; cursor: pointer; }
	.bulk-actions button:hover:not(:disabled) { background: var(--bg-elevated); color: var(--text-primary); }
	.bulk-actions button:disabled { opacity: .4; cursor: wait; }
	.bulk-actions button.trash:hover { color: var(--color-danger); }
	.bulk-actions button svg { width: 14px; height: 14px; }
	.msg.unread .from, .msg.unread .subject { color: var(--text-primary); font-weight: 600; }
	@media (max-width: 720px) {
		.row-actions { opacity: 1; }
		.row-select { padding-left: 4px; }
		.message-link { padding: 10px 10px; }
	}
</style>
