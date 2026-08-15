<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { onMount } from 'svelte';
	import { formatDate, initials } from '$lib/format';
	import { toastStore } from '$lib/toast';
	import Pager from '$lib/components/Pager.svelte';
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

	let messages = $state<any[]>([]);
	let emptying = $state(false);
	let actionError = $state('');
	let selected = $state<Set<string>>(new Set());
	let bulkBusy = $state(false);
	let selectAllInput = $state<HTMLInputElement | null>(null);
	let storage = $state<{ used_bytes: number; quota_bytes: number; message_count: number; quota_messages: number } | null>(null);
	let storageDismissed = $state(false);

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
	function formatMB(bytes: number) {
		return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
	}

	function storageQuotaText(): string {
		if (!storage) return '';
		const used = formatMB(Number(storage.used_bytes || 0));
		const total = storage.quota_bytes ? formatMB(storage.quota_bytes) : tt('settings.storageQuotaUnlimited');
		const count = Number(storage.message_count || 0).toLocaleString();
		const countLimit = storage.quota_messages ? storage.quota_messages.toLocaleString() : '∞';
		return `${used} / ${total} · ${count} / ${countLimit}`;
	}

	onMount(() => {
		loadStorageSnapshot();
		const timer = window.setInterval(loadStorageSnapshot, 60_000);
		return () => window.clearInterval(timer);
	});

	$effect(() => {
		const source = data.messages;
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
	function updateFlags(flags: string[], action: string) {
		const flag = action === 'read' || action === 'unread' ? '\\Seen' : '\\Flagged';
		const on = action === 'read' || action === 'star';
		return on
			? flags.includes(flag)
				? flags
				: [...flags, flag]
			: flags.filter((item) => item !== flag);
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
			if (action === 'move' || (data.folder === 'Starred' && action === 'unstar'))
				messages = messages.filter((message) => !selected.has(message.id));
			else
				messages = messages.map((message) =>
					selected.has(message.id)
						? { ...message, flags: updateFlags(message.flags, action) }
						: message
				);
			selected = new Set();
			await invalidateAll();
		} catch (error) {
			actionError = error instanceof Error ? error.message : tt('toast.bulk.error');
		} finally {
			bulkBusy = false;
		}
	}
	async function emptyTrash() {
		if (emptying || messages.length === 0) return;
		const confirmed = window.confirm(tt('folder.emptyConfirm', { count: messages.length }));
		if (!confirmed) return;
		emptying = true;
		actionError = '';
		try {
			const response = await fetch('/api/trash', { method: 'DELETE' });
			if (!response.ok) throw new Error();
			messages = [];
			await invalidateAll();
			toastStore.success(tt('toast.trash.emptied'));
		} catch {
			toastStore.error(tt('toast.trash.error'));
		} finally {
			emptying = false;
		}
	}

	function addressLabel(message: any) {
		if (message.direction !== 'outbound')
			return message.fromName || message.fromAddr || tt('inbox.unknownSender');
		const recipients = message.to || [];
		if (!recipients.length) return tt('inbox.noRecipients');
		const first = recipients[0];
		const label = first.name || first.addr || tt('inbox.unknownRecipient');
		return recipients.length > 1 ? `${label} +${recipients.length - 1}` : label;
	}

	function messageHref(message: any) {
		if (data.folderSlug === 'drafts') return `/compose?draft=${message.id}`;
		if (data.folderSlug !== 'starred') return `/${data.folderSlug}/${message.id}`;
		const original = message.folder === 'INBOX' ? 'inbox' : String(message.folder).toLowerCase();
		return `/${original}/${message.id}`;
	}
</script>

<svelte:head>
	<title>{folderLabel(data.folder)} · {tt('common.brandName')}</title>
</svelte:head>

<section class="page">
	<header class="page-head">
		<div>
			<p class="eyebrow">{tt('nav.inbox')}</p>
			<h1>{folderLabel(data.folder)}</h1>
		</div>
		<div class="head-actions">
			<span class="count">{tt('common.messageCount', { count: messages.length })}</span>
			{#if data.folder === 'Trash' && messages.length > 0}
				<button class="btn empty-trash" type="button" onclick={emptyTrash} disabled={emptying}>
					<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"
						><path
							d="M4 7h16M9 11v6m6-6v6M6 7l1 14h10l1-14M9 7l1-4h4l1 4"
							stroke="currentColor"
							stroke-width="1.7"
							stroke-linecap="round"
							stroke-linejoin="round"
						/></svg
					>
					{emptying ? tt('folder.emptying') : tt('folder.emptyTrash')}
				</button>
			{/if}
		</div>
	</header>

	{#if actionError}<div class="action-error" role="alert">{actionError}</div>{/if}

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

	{#if messages.length > 0}
		<div class="bulk-bar card" class:has-selection={selected.size > 0}>
			<label class="select-all">
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
			{#if selected.size}
				<div class="bulk-actions">
					<button data-action="mark-read" disabled={bulkBusy} onclick={() => bulkAction('read')}>{tt('inbox.bulkRead')}</button>
					<button data-action="mark-unread" disabled={bulkBusy} onclick={() => bulkAction('unread')}>{tt('inbox.bulkUnread')}</button>
					<button disabled={bulkBusy} onclick={() => bulkAction('star')}>☆ {tt('inbox.bulkStar')}</button>
					<button disabled={bulkBusy} onclick={() => bulkAction('unstar')}>★ {tt('inbox.bulkUnstar')}</button>
					<button class="danger" disabled={bulkBusy} onclick={() => bulkAction('move', data.folder === 'Trash' ? 'INBOX' : 'Trash')}>
						{data.folder === 'Trash' ? tt('folder.moveToInbox') : tt('folder.moveToTrash')}
					</button>
				</div>
			{/if}
		</div>
	{/if}

	{#if messages.length === 0}
		<div class="empty">
			<div class="empty-icon" aria-hidden="true">{data.folder === 'Starred' ? '☆' : '✉'}</div>
			<h2>{data.folder === 'Starred' ? tt('folder.emptyStarredTitle') : tt('folder.emptyTitle')}</h2>
			<p>{data.folder === 'Starred' ? tt('folder.emptyStarredBody') : tt('folder.emptyBody', { folder: folderLabel(data.folder) })}</p>
		</div>
	{:else}
		<ul class="list" aria-label={`${folderLabel(data.folder)} ${tt('inbox.title')}`}>
			{#each messages as message (message.id)}
				{@const unread = !message.flags.includes('\\Seen')}
				<li class="msg" class:unread class:selected={selected.has(message.id)}>
					<span class="unread-dot" aria-hidden="true"></span>
					<label class="row-select" aria-label={`Select ${message.subject}`}>
						<input type="checkbox" checked={selected.has(message.id)} onchange={() => toggleSelected(message.id)} />
					</label>
					<a href={messageHref(message)} class="row">
						<div class="avatar" aria-hidden="true">{initials(addressLabel(message))}</div>
						<div class="meta">
							<div class="line">
								<span class="from">{message.direction === 'outbound' ? `${tt('compose.to')}: ` : ''}{addressLabel(message)}</span>
								<span class="time">{formatDate(message.receivedAt)}</span>
							</div>
							<div class="subject">{message.subject}</div>
							<div class="preview">{message.preview || tt('inbox.noPreview')}</div>
						</div>
						<div class="indicators">
							{#if message.flags.includes('\\Flagged')}<span class="star" title={tt('folder.starred')}>★</span>{/if}
							{#if message.hasAttachments}<span title={tt('inbox.hasAttachments')}>⌕</span>{/if}
						</div>
					</a>
				</li>
			{/each}
		</ul>
	{/if}

	<Pager page={data.pagination.page} totalPages={data.pagination.totalPages} baseHref={`/${data.folderSlug}`} />
</section>

<style>
	.card { border: 1px solid var(--border); border-radius: var(--radius-lg); background: var(--bg-card); }
	.bulk-bar { min-height: 47px; display: flex; align-items: center; gap: 14px; margin-bottom: 10px; padding: 7px 12px; }
	.bulk-bar.has-selection { border-color: var(--accent-soft); }
	.select-all { display: flex; align-items: center; gap: 8px; color: var(--text-muted); font-size: 11px; cursor: pointer; }
	.select-all input, .row-select input {
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
	.select-all input:hover, .row-select input:hover { border-color: var(--accent); }
	.select-all input:focus-visible, .row-select input:focus-visible { outline: 2px solid color-mix(in srgb, var(--accent) 45%, transparent); outline-offset: 2px; }
	.select-all input:checked, .row-select input:checked, .select-all input:indeterminate {
		border-color: var(--accent);
		background-color: var(--accent);
		box-shadow: inset 0 0 0 1px color-mix(in srgb, white 10%, transparent);
	}
	.select-all input:checked, .row-select input:checked {
		background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E%3Cpath d='m3.5 8 3 3 6-6' fill='none' stroke='white' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");
	}
	.select-all input:indeterminate {
		background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E%3Cpath d='M4 8h8' fill='none' stroke='white' stroke-width='2' stroke-linecap='round'/%3E%3C/svg%3E");
	}
	.bulk-actions { display: flex; gap: 3px; padding-left: 12px; border-left: 1px solid var(--border); }
	.bulk-actions button { padding: 7px 9px; border: 0; border-radius: 7px; background: transparent; color: var(--text-muted); font-size: 11px; }
	.bulk-actions button:hover:not(:disabled) { background: var(--bg-elevated); color: var(--text-primary); }
	.bulk-actions .danger:hover { color: var(--color-danger-bright); }
	.bulk-actions button:disabled { opacity: .45; }
	.page-head { display: flex; justify-content: space-between; align-items: end; margin-bottom: var(--space-5); }
	.eyebrow { margin: 0 0 4px; color: var(--accent); font-size: 11px; font-weight: 700; letter-spacing: .12em; text-transform: uppercase; }
	.page-head h1 { margin: 0; font-size: clamp(25px, 3vw, 34px); font-weight: 600; letter-spacing: -.025em; }
	.head-actions { display: flex; align-items: center; gap: var(--space-3); }
	.empty-trash { border-color: var(--color-danger-border); color: var(--color-danger); background: var(--color-danger-bg); }
	.count { color: var(--text-muted); font-size: 12px; padding-bottom: 5px; }
	.action-error { margin-bottom: var(--space-4); padding: 10px 12px; border: 1px solid rgba(255,80,80,.3); border-radius: var(--radius-md); color: #ff9b9b; background: rgba(255,80,80,.08); font-size: 13px; }
	.storage-banner { display: flex; align-items: center; gap: 12px; margin-bottom: var(--space-4); padding: 11px 14px; border: 1px solid; border-radius: var(--radius-md); font-size: 12px; }
	.storage-banner[data-level='high'] { border-color: var(--color-warning-border); background: var(--color-warning-bg); color: var(--color-warning); }
	.storage-banner[data-level='critical'] { border-color: var(--color-danger-border); background: var(--color-danger-bg); color: var(--color-danger); }
	.storage-banner svg { width: 18px; height: 18px; flex: none; }
	.storage-banner strong { display: block; font-size: 12px; font-weight: 600; }
	.storage-banner span { display: block; margin-top: 2px; font-size: 11px; opacity: .9; }
	.storage-banner .btn { margin-left: auto; padding: 6px 12px; font-size: 11px; }
	.storage-banner > button { width: 28px; height: 28px; border: 0; border-radius: 50%; background: transparent; color: inherit; font-size: 18px; opacity: .65; }
	.storage-banner > button:hover { background: color-mix(in srgb, var(--text-primary) 8%, transparent); opacity: 1; }
	.empty { min-height: 380px; display: grid; place-content: center; justify-items: center; text-align: center; border: 1px dashed var(--border); border-radius: var(--radius-lg); padding: var(--space-8); color: var(--text-secondary); }
	.empty-icon { display: grid; place-items: center; width: 48px; height: 48px; margin-bottom: var(--space-4); border-radius: 50%; background: var(--accent-subtle); color: var(--accent); font-size: 22px; }
	.empty h2 { margin: 0 0 var(--space-2); color: var(--text-primary); font-size: 18px; font-weight: 600; }
	.empty p { margin: 0; font-size: 13px; }
	.list { list-style: none; margin: 0; padding: 0; border: 1px solid var(--border); border-radius: var(--radius-lg); overflow: hidden; background: var(--bg-secondary); }
	.msg {
		position: relative;
		display: grid;
		grid-template-columns: 8px 32px minmax(0, 1fr);
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
	.row { display: grid; grid-template-columns: 36px minmax(0, 1fr) auto; gap: 12px; padding: 12px 14px; color: inherit; min-width: 0; }
	.row:hover { background: var(--bg-elevated); }
	.avatar { width: 36px; height: 36px; display: grid; place-items: center; border-radius: 50%; background: var(--accent-subtle); color: var(--accent); font-family: var(--font-mono); font-size: 11px; font-weight: 700; flex: none; }
	.meta { min-width: 0; }
	.line { display: flex; align-items: baseline; gap: 10px; }
	.from { font-size: 13px; font-weight: 600; color: var(--text-primary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; flex: 1; min-width: 0; }
	.time { color: var(--text-muted); font-size: 11px; font-family: var(--font-mono); flex: none; }
	.subject { margin-top: 3px; font-size: 13px; color: var(--text-secondary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
	.preview { margin-top: 2px; font-size: 12px; color: var(--text-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
	.indicators { display: flex; gap: 6px; color: var(--accent); font-size: 14px; }
	.star { color: var(--accent); }
	.msg.unread .from, .msg.unread .subject { color: var(--text-primary); font-weight: 600; }
	@media (max-width: 720px) {
		.row-select { padding-left: 4px; }
		.row { padding: 10px 10px; }
	}
</style>
