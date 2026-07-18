<script lang="ts">
	import { formatDate, initials } from '$lib/format';
	let { data } = $props();
	let filtersOpen = $state(false);
	let initialised = false;
	$effect(() => {
		if (!initialised) {
			filtersOpen = data.hasFilters;
			initialised = true;
		}
	});
	const activeFilterCount = $derived([
		data.filters.folder !== 'all',
		data.filters.status !== 'any',
		data.filters.starred,
		data.filters.hasAttachments,
		!!data.filters.from,
		!!data.filters.to
	].filter(Boolean).length);

	function addressLabel(message: any) {
		if (message.direction !== 'outbound') return message.fromName || message.fromAddr || 'Unknown sender';
		const recipients = message.to || [];
		if (!recipients.length) return 'No recipients';
		const first = recipients[0];
		const label = first.name || first.addr || 'Unknown recipient';
		return recipients.length > 1 ? `${label} +${recipients.length - 1}` : label;
	}

	function folderSlug(folder: string) {
		return folder === 'INBOX' ? 'inbox' : folder.toLowerCase();
	}
</script>

<svelte:head><title>{data.query ? `Search: ${data.query}` : 'Search'} · KRSZ Mail</title></svelte:head>

<section class="page">
	<header class="page-head">
		<div>
			<p class="eyebrow">Mailbox</p>
			<h1>Search</h1>
			{#if data.query || data.hasFilters}<p class="summary">{data.messages.length} {data.messages.length === 1 ? 'result' : 'results'}{data.query ? ` for “${data.query}”` : ' matching your filters'}</p>{/if}
		</div>
	</header>

	<form class="page-search" action="/search" method="GET">
		<div class="search-row">
			<div class="query-field">
				<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="11" cy="11" r="7" stroke="currentColor" stroke-width="1.8"/><path d="m16.5 16.5 4 4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>
				<input name="q" value={data.query} maxlength="100" placeholder="Search by sender, recipient, subject, or message…" aria-label="Search mail" />
			</div>
			<button class="filter-toggle" class:active={activeFilterCount > 0} type="button" onclick={() => (filtersOpen = !filtersOpen)} aria-expanded={filtersOpen}>
				<svg viewBox="0 0 24 24" fill="none"><path d="M4 6h16M7 12h10m-7 6h4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>
				Filters {#if activeFilterCount}<span>{activeFilterCount}</span>{/if}
			</button>
			<button class="btn btn-primary" type="submit">Search</button>
		</div>
		{#if filtersOpen}
			<div class="filters">
				<label><span>Folder</span><select name="folder" value={data.filters.folder}><option value="all">All mail</option><option value="inbox">Inbox</option><option value="sent">Sent</option><option value="drafts">Drafts</option><option value="junk">Junk</option><option value="trash">Trash</option></select></label>
				<label><span>Status</span><select name="status" value={data.filters.status}><option value="any">Read or unread</option><option value="unread">Unread</option><option value="read">Read</option></select></label>
				<label><span>From date</span><input type="date" name="from" value={data.filters.from} /></label>
				<label><span>To date</span><input type="date" name="to" value={data.filters.to} /></label>
				<div class="checks">
					<label><input type="checkbox" name="starred" value="1" checked={data.filters.starred} /><span>Starred only</span></label>
					<label><input type="checkbox" name="attachments" value="1" checked={data.filters.hasAttachments} /><span>Has attachments</span></label>
				</div>
				{#if activeFilterCount}<a class="reset" href={data.query ? `/search?q=${encodeURIComponent(data.query)}` : '/search'}>Reset filters</a>{/if}
			</div>
		{/if}
	</form>

	{#if !data.query && !data.hasFilters}
		<div class="empty">
			<div class="empty-icon"><svg viewBox="0 0 24 24" fill="none"><circle cx="11" cy="11" r="7" stroke="currentColor" stroke-width="1.7"/><path d="m16.5 16.5 4 4" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg></div>
			<h2>Find a message</h2>
			<p>Search subjects, senders, recipients, and message previews.</p>
		</div>
	{:else if data.messages.length === 0}
		<div class="empty">
			<div class="empty-icon"><svg viewBox="0 0 24 24" fill="none"><path d="M5 5h14v14H5V5Zm3 3 8 8m0-8-8 8" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg></div>
			<h2>No messages found</h2>
			<p>Try a sender address, fewer words, or a different subject.</p>
		</div>
	{:else}
		<ul class="list" aria-label="Search results">
			{#each data.messages as message (message.id)}
				<li class="msg" class:unread={!message.flags.includes('\\Seen')}>
					<a class="row" href={`/${folderSlug(message.folder)}/${message.id}`}>
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
							<span class="folder-tag">{message.folder === 'INBOX' ? 'Inbox' : message.folder}</span>
							{#if message.flags.includes('\\Flagged')}<span class="star" title="Starred">★</span>{/if}
							{#if message.hasAttachments}<svg viewBox="0 0 24 24" fill="none" aria-label="Has attachment"><path d="m9 12 5-5a3 3 0 0 1 4 4l-7 7a5 5 0 0 1-7-7l7-7" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>{/if}
						</div>
					</a>
				</li>
			{/each}
		</ul>
	{/if}
</section>

<style>
	.page { width: min(100%, 1040px); margin: 0 auto; padding: var(--space-6); }
	.page-head { margin-bottom: var(--space-4); }
	.eyebrow { margin: 0 0 4px; color: var(--accent); font-size: 11px; font-weight: 700; letter-spacing: .12em; text-transform: uppercase; }
	.page-head h1 { margin: 0; font-size: clamp(25px, 3vw, 34px); font-weight: 600; letter-spacing: -.025em; }
	.summary { margin: 5px 0 0; color: var(--text-muted); font-size: 12px; }
	.page-search { margin-bottom: var(--space-5); padding: 5px; border: 1px solid var(--border); border-radius: var(--radius-lg); background: var(--bg-card); }
	.search-row { display: grid; grid-template-columns: minmax(0, 1fr) auto auto; align-items: center; gap: 7px; }
	.query-field { display: flex; align-items: center; gap: 10px; min-width: 0; padding-left: 9px; }
	.query-field svg { width: 18px; flex: none; color: var(--text-muted); }
	.query-field input { width: 100%; min-width: 0; padding: 8px 0; border: 0; background: transparent; }
	.query-field input:focus { border: 0; }
	.filter-toggle { height: 36px; display: inline-flex; align-items: center; gap: 7px; padding: 0 10px; border-radius: var(--radius-md); color: var(--text-secondary); font-size: 12px; }
	.filter-toggle:hover, .filter-toggle.active { background: var(--accent-subtle); color: var(--accent); }
	.filter-toggle svg { width: 16px; }
	.filter-toggle span { min-width: 17px; padding: 1px 5px; border-radius: var(--radius-full); background: var(--accent); color: white; font-size: 9px; text-align: center; }
	.filters { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 11px; margin-top: 5px; padding: 14px 9px 9px; border-top: 1px solid var(--border); }
	.filters > label { display: grid; gap: 5px; }
	.filters > label > span { color: var(--text-muted); font-size: 10px; text-transform: uppercase; letter-spacing: .06em; }
	.filters select, .filters input[type="date"] { width: 100%; min-width: 0; height: 36px; padding: 6px 9px; font-size: 12px; }
	.checks { grid-column: 1 / -2; display: flex; align-items: center; gap: var(--space-5); }
	.checks label { display: inline-flex; align-items: center; gap: 7px; color: var(--text-secondary); font-size: 12px; }
	.checks input { width: 15px; height: 15px; margin: 0; accent-color: var(--accent); }
	.reset { align-self: center; justify-self: end; color: var(--text-muted); font-size: 11px; }
	.reset:hover { color: var(--accent); }
	.empty { min-height: 340px; display: grid; place-content: center; justify-items: center; padding: var(--space-8); text-align: center; border: 1px dashed var(--border); border-radius: var(--radius-lg); color: var(--text-secondary); }
	.empty-icon { width: 48px; height: 48px; display: grid; place-items: center; margin-bottom: var(--space-4); border-radius: 50%; background: var(--accent-subtle); color: var(--accent); }
	.empty-icon svg { width: 22px; height: 22px; }
	.empty h2 { margin: 0 0 6px; color: var(--text-primary); font-size: 18px; }
	.empty p { margin: 0; color: var(--text-muted); font-size: 13px; }
	.list { list-style: none; margin: 0; padding: 0; overflow: hidden; border: 1px solid var(--border); border-radius: var(--radius-lg); background: var(--bg-secondary); }
	.msg { border-bottom: 1px solid var(--border); }
	.msg:last-child { border-bottom: 0; }
	.msg:hover, .msg:focus-within { background: var(--bg-card); }
	.msg.unread { background: color-mix(in srgb, var(--accent-subtle) 42%, var(--bg-secondary)); }
	.row { display: grid; grid-template-columns: 40px minmax(0, 1fr) auto; align-items: center; gap: var(--space-3); padding: 14px 16px; color: inherit; }
	.row:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }
	.avatar { width: 40px; height: 40px; display: grid; place-items: center; border: 1px solid var(--border); border-radius: 50%; background: var(--bg-elevated); color: var(--accent); font-size: 12px; font-weight: 700; }
	.meta { min-width: 0; }
	.line { display: flex; align-items: baseline; justify-content: space-between; gap: var(--space-3); }
	.from, .subject, .preview { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	.from { color: var(--text-secondary); font-size: 14px; }
	.unread .from, .unread .subject { color: var(--text-primary); font-weight: 650; }
	.time { flex: none; color: var(--text-muted); font-size: 11px; }
	.subject { margin-top: 2px; color: var(--text-primary); font-size: 14px; }
	.preview { margin-top: 2px; color: var(--text-muted); font-size: 12px; }
	.indicators { display: flex; align-items: center; gap: 8px; color: var(--text-muted); }
	.indicators svg { width: 15px; height: 15px; }
	.folder-tag { padding: 3px 7px; border: 1px solid var(--border); border-radius: var(--radius-full); font-size: 9px; letter-spacing: .05em; text-transform: uppercase; }
	.star { color: var(--accent); }
	@media (max-width: 760px) {
		.page { padding: var(--space-3) 10px calc(72px + var(--space-3) + env(safe-area-inset-bottom, 0px)); }
		.filters { grid-template-columns: 1fr 1fr; }
		.checks { grid-column: 1 / -1; }
		.reset { grid-column: 1 / -1; justify-self: start; }
		.row { grid-template-columns: 34px minmax(0, 1fr); padding: 12px; }
		.avatar { width: 34px; height: 34px; }
		.indicators { display: none; }
	}
	@media (max-width: 480px) {
		.page { padding: var(--space-3) 10px calc(72px + var(--space-3) + env(safe-area-inset-bottom, 0px)); }
		.search-row { grid-template-columns: minmax(0, 1fr) auto; }
		.search-row .btn { grid-column: 1 / -1; justify-content: center; }
		.filters { grid-template-columns: 1fr; }
		.checks { flex-direction: column; align-items: flex-start; }
		.list { border-right: 0; border-left: 0; border-radius: 0; }
		.row { grid-template-columns: minmax(0, 1fr); min-height: 60px; }
		.from, .subject { font-size: 13px; }
		.preview { font-size: 11px; }
	}
</style>
