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
	/* Folder-specific: empty-trash action and read-only row indicators. */
	.empty-trash {
		border-color: var(--color-danger-border);
		color: var(--color-danger);
		background: var(--color-danger-bg);
	}
	.star {
		color: var(--accent);
	}
</style>
