<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { formatDate, initials } from '$lib/format';
	let { data } = $props();
	let messages = $state<any[]>([]);
	let emptying = $state(false);
	let actionError = $state('');
	let selected = $state<Set<string>>(new Set());
	let bulkBusy = $state(false);
	let selectAllInput = $state<HTMLInputElement | null>(null);
	const allSelected = $derived(messages.length > 0 && selected.size === messages.length);
	const partiallySelected = $derived(selected.size > 0 && selected.size < messages.length);

	$effect(() => {
		const source = data.messages;
		messages = source.map((message: any) => ({ ...message, flags: [...message.flags] }));
		selected = new Set();
	});

	$effect(() => { if (selectAllInput) selectAllInput.indeterminate = partiallySelected; });
	function toggleSelected(id: string) { const next = new Set(selected); if (next.has(id)) next.delete(id); else next.add(id); selected = next; }
	function toggleAll() { selected = allSelected ? new Set() : new Set(messages.map((message) => message.id)); }
	function updateFlags(flags: string[], action: string) { const flag = action === 'read' || action === 'unread' ? '\\Seen' : '\\Flagged'; const on = action === 'read' || action === 'star'; return on ? (flags.includes(flag) ? flags : [...flags, flag]) : flags.filter((item) => item !== flag); }
	async function bulkAction(action: string, folder?: string) {
		if (!selected.size || bulkBusy) return; bulkBusy = true; actionError = '';
		try { const response = await fetch('/api/messages/bulk', { method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({ids:[...selected], action, folder}) }); if (!response.ok) throw new Error((await response.json().catch(()=>({}))).message || 'Bulk action failed.');
			if (action === 'move' || (data.folder === 'Starred' && action === 'unstar')) messages = messages.filter((message) => !selected.has(message.id)); else messages = messages.map((message) => selected.has(message.id) ? {...message, flags:updateFlags(message.flags, action)} : message); selected = new Set(); await invalidateAll();
		} catch(error) { actionError = error instanceof Error ? error.message : 'Bulk action failed.'; } finally { bulkBusy = false; }
	}
	async function emptyTrash() {
		if (emptying || messages.length === 0) return;
		const confirmed = window.confirm(
			`Permanently delete ${messages.length} ${messages.length === 1 ? 'message' : 'messages'} from Trash? This cannot be undone.`
		);
		if (!confirmed) return;

		emptying = true;
		actionError = '';
		try {
			const response = await fetch('/api/trash', { method: 'DELETE' });
			if (!response.ok) throw new Error();
			messages = [];
			await invalidateAll();
		} catch {
			actionError = 'Could not empty Trash. Please try again.';
		} finally {
			emptying = false;
		}
	}

	function addressLabel(message: any) {
		if (message.direction !== 'outbound') return message.fromName || message.fromAddr || 'Unknown sender';
		const recipients = message.to || [];
		if (!recipients.length) return 'No recipients';
		const first = recipients[0];
		const label = first.name || first.addr || 'Unknown recipient';
		return recipients.length > 1 ? `${label} +${recipients.length - 1}` : label;
	}

	function messageHref(message: any) {
		if (data.folderSlug !== 'starred') return `/${data.folderSlug}/${message.id}`;
		const original = message.folder === 'INBOX' ? 'inbox' : String(message.folder).toLowerCase();
		return `/${original}/${message.id}`;
	}
</script>

<svelte:head><title>{data.folder === 'INBOX' ? 'Inbox' : data.folder} · KRSZ Mail</title></svelte:head>

<section class="page">
	<header class="page-head">
		<div>
			<p class="eyebrow">Mailbox</p>
			<h1>{data.folder === 'INBOX' ? 'Inbox' : data.folder}</h1>
		</div>
		<div class="head-actions">
			<span class="count">{messages.length} {messages.length === 1 ? 'message' : 'messages'}</span>
			{#if data.folder === 'Trash' && messages.length > 0}
				<button class="btn empty-trash" type="button" onclick={emptyTrash} disabled={emptying}>
					<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 7h16M9 11v6m6-6v6M6 7l1 14h10l1-14M9 7l1-4h4l1 4" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>
					{emptying ? 'Emptying…' : 'Empty Trash'}
				</button>
			{/if}
		</div>
	</header>

	{#if actionError}<div class="action-error" role="alert">{actionError}</div>{/if}

		{#if messages.length > 0}<div class="bulk-bar card" class:has-selection={selected.size > 0}><label class="select-all"><input bind:this={selectAllInput} type="checkbox" checked={allSelected} onchange={toggleAll}/><span>{selected.size ? `${selected.size} selected` : 'Select all'}</span></label>{#if selected.size}<div class="bulk-actions"><button disabled={bulkBusy} onclick={() => bulkAction('read')}>Read</button><button disabled={bulkBusy} onclick={() => bulkAction('unread')}>Unread</button><button disabled={bulkBusy} onclick={() => bulkAction('star')}>☆ Star</button><button disabled={bulkBusy} onclick={() => bulkAction('unstar')}>★ Unstar</button><button class="danger" disabled={bulkBusy} onclick={() => bulkAction('move', data.folder === 'Trash' ? 'INBOX' : 'Trash')}>{data.folder === 'Trash' ? 'Move to Inbox' : 'Move to Trash'}</button></div>{/if}</div>{/if}

		{#if messages.length === 0}
		<div class="empty">
			<div class="empty-icon" aria-hidden="true">{data.folder === 'Starred' ? '☆' : '✉'}</div>
			<h2>{data.folder === 'Starred' ? 'No starred messages' : 'Nothing here yet'}</h2>
			<p>{data.folder === 'Starred' ? 'Star important messages to find them here.' : `Messages in ${data.folder} will appear here.`}</p>
		</div>
	{:else}
		<ul class="list" aria-label={`${data.folder} messages`}>
			{#each messages as message (message.id)}
				{@const unread = !message.flags.includes('\\Seen')}
				<li class="msg" class:unread class:selected={selected.has(message.id)}><label class="row-select" aria-label={`Select ${message.subject}`}><input type="checkbox" checked={selected.has(message.id)} onchange={() => toggleSelected(message.id)} /></label>
					<a href={messageHref(message)} class="row">
						<div class="avatar" aria-hidden="true">{initials(addressLabel(message))}</div>
						<div class="meta">
							<div class="line">
								<span class="from">{message.direction === 'outbound' ? 'To: ' : ''}{addressLabel(message)}</span>
								<span class="time">{formatDate(message.receivedAt)}</span>
							</div>
							<div class="subject">{message.subject}</div>
							<div class="preview">{message.preview || 'No preview available'}</div>
						</div>
						<div class="indicators">
							{#if message.flags.includes('\\Flagged')}<span class="star" title="Starred">★</span>{/if}
							{#if message.hasAttachments}<span title="Has attachments">⌕</span>{/if}
						</div>
					</a>
				</li>
			{/each}
		</ul>
	{/if}
</section>

<style>
	.card { border: 1px solid var(--border); border-radius: var(--radius-lg); background: var(--bg-card); }
	.bulk-bar { min-height: 47px; display: flex; align-items: center; gap: 14px; margin-bottom: 10px; padding: 7px 12px; }
	.bulk-bar.has-selection { border-color: rgba(255,107,53,.3); }
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
	.bulk-actions .danger:hover { color: #ff9292; }
	.bulk-actions button:disabled { opacity: .45; }
	.page-head { display: flex; justify-content: space-between; align-items: end; margin-bottom: var(--space-5); }
	.eyebrow { margin: 0 0 4px; color: var(--accent); font-size: 11px; font-weight: 700; letter-spacing: .12em; text-transform: uppercase; }
	.page-head h1 { margin: 0; font-size: clamp(25px, 3vw, 34px); font-weight: 600; letter-spacing: -.025em; }
	.head-actions { display: flex; align-items: center; gap: var(--space-3); }
	.empty-trash { border-color: rgba(255, 100, 100, .24); color: #ff9a9a; background: rgba(255, 80, 80, .06); }
	.empty-trash:hover:not(:disabled) { border-color: rgba(255, 100, 100, .42); color: #ffb0b0; background: rgba(255, 80, 80, .12); }
	.empty-trash:disabled { cursor: wait; opacity: .55; }
	.empty-trash svg { width: 16px; height: 16px; }
	.action-error { margin-bottom: var(--space-4); padding: 10px 12px; border: 1px solid rgba(255,80,80,.3); border-radius: var(--radius-md); color: #ff9b9b; background: rgba(255,80,80,.08); font-size: 13px; }
	.count { color: var(--text-muted); font-size: 12px; padding-bottom: 5px; }
	.empty { min-height: 380px; display: grid; place-content: center; justify-items: center; text-align: center; border: 1px dashed var(--border); border-radius: var(--radius-lg); color: var(--text-secondary); padding: var(--space-8); }
	.empty-icon { display: grid; place-items: center; width: 48px; height: 48px; margin-bottom: var(--space-4); border-radius: 50%; background: var(--accent-subtle); color: var(--accent); font-size: 20px; }
	.empty h2 { margin: 0 0 var(--space-2); color: var(--text-primary); font-size: 18px; font-weight: 600; }
	.empty p { margin: 0; font-size: 13px; }
	.list { list-style: none; margin: 0; padding: 0; border: 1px solid var(--border); border-radius: var(--radius-lg); overflow: hidden; background: var(--bg-secondary); }
	.page { width: min(100%, 1040px); margin: 0 auto; padding: var(--space-6); }
	.msg:last-child { border-bottom: 0; }
	.msg:hover, .msg:focus-within { background: var(--bg-card); }
	.msg.unread { background: color-mix(in srgb, var(--accent-subtle) 42%, var(--bg-secondary)); }
	.msg { display: grid; grid-template-columns: 32px minmax(0, 1fr); border-bottom: 1px solid var(--border); transition: background var(--transition-fast); }
	.msg.selected { background: var(--accent-subtle); }
	.row-select { display: grid; place-items: center; padding-left: 8px; cursor: pointer; }
	.row { display: grid; grid-template-columns: 40px minmax(0, 1fr) auto; gap: var(--space-3); padding: 14px 16px 14px 4px; align-items: center; color: inherit; }
	.row:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }
	.avatar { width: 40px; height: 40px; border: 1px solid var(--border); border-radius: 50%; background: var(--bg-elevated); color: var(--accent); display: grid; place-items: center; font-size: 12px; font-weight: 700; }
	.meta { min-width: 0; }
	.line { display: flex; justify-content: space-between; align-items: baseline; gap: var(--space-3); }
	.from { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 14px; color: var(--text-secondary); }
	.unread .from, .unread .subject { color: var(--text-primary); font-weight: 650; }
	.time { flex: none; font-size: 11px; color: var(--text-muted); }
	.subject, .preview { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	.subject { margin-top: 2px; font-size: 14px; color: var(--text-primary); }
	.preview { margin-top: 2px; font-size: 12px; color: var(--text-muted); }
	.indicators { display: flex; align-items: center; gap: 8px; color: var(--text-muted); font-size: 13px; }
	.star { color: var(--accent); }
	@media (max-width: 720px) {
		.page { padding: var(--space-4); }
		.row { grid-template-columns: 34px minmax(0, 1fr) auto; padding: 12px; gap: 10px; }
		.avatar { width: 34px; height: 34px; }
	}
	@media (max-width: 480px) {
		.page { padding: 14px 10px; }
		.bulk-actions { overflow-x: auto; padding-left: 7px; }
		.bulk-actions button { white-space: nowrap; }
		.bulk-bar { padding: 7px 9px; }
		.empty-trash { padding: 8px 10px; }
		.empty-trash svg { display: none; }
		.list { border-right: 0; border-left: 0; border-radius: 0; }
		.avatar { display: none; }
		.row { grid-template-columns: minmax(0, 1fr) auto; padding-left: 10px; }
	}
</style>
