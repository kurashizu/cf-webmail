<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { formatDate, initials } from '$lib/format';
	let { data } = $props();
	let messages = $state<any[]>([]);
	let emptying = $state(false);
	let actionError = $state('');

	$effect(() => {
		messages = data.messages.map((message: any) => ({ ...message }));
	});

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
				<li class="msg" class:unread>
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
	.page { width: min(100%, 1040px); margin: 0 auto; padding: var(--space-6); }
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
	.msg { border-bottom: 1px solid var(--border); transition: background var(--transition-fast); }
	.msg:last-child { border-bottom: 0; }
	.msg:hover, .msg:focus-within { background: var(--bg-card); }
	.msg.unread { background: color-mix(in srgb, var(--accent-subtle) 42%, var(--bg-secondary)); }
	.row { display: grid; grid-template-columns: 40px minmax(0, 1fr) auto; gap: var(--space-3); padding: 14px 16px; align-items: center; color: inherit; }
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
		.head-actions .count { display: none; }
		.empty-trash { padding: 8px 10px; }
		.empty-trash svg { display: none; }
		.list { border-right: 0; border-left: 0; border-radius: 0; }
		.avatar { display: none; }
		.row { grid-template-columns: minmax(0, 1fr) auto; padding-left: 10px; }
	}
</style>
