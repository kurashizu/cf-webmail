<script lang="ts">
	import { onMount } from 'svelte';
	import { formatDate } from '$lib/format';

	let entries = $state<any[]>([]);
	let total = $state(0);
	let eventTypes = $state<string[]>([]);
	let loading = $state(true);
	let error = $state<string | null>(null);
	let eventFilter = $state('');
	let page = $state(0);
	const PAGE_SIZE = 50;

	const totalPages = $derived(Math.max(1, Math.ceil(total / PAGE_SIZE)));

	async function load() {
		loading = true;
		error = null;
		try {
			const params = new URLSearchParams({
				limit: String(PAGE_SIZE),
				offset: String(page * PAGE_SIZE)
			});
			if (eventFilter) params.set('event', eventFilter);
			const response = await fetch(`/api/admin/audit?${params}`);
			const result: any = await response.json().catch(() => ({}));
			if (!response.ok) throw new Error(result.message || 'Failed to load audit log.');
			entries = result.entries || [];
			total = result.total || 0;
			eventTypes = result.eventTypes || [];
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to load audit log.';
		} finally {
			loading = false;
		}
	}

	function eventLabel(event: string) {
		return event.startsWith('admin.') ? event.slice(6).replace(/_/g, ' ') : event.replace(/_/g, ' ');
	}

	function eventClass(event: string) {
		if (event.startsWith('admin.')) return 'tag admin';
		if (event === 'login_failed') return 'tag danger';
		if (event === 'send_outbound') return 'tag send';
		return 'tag';
	}

	function changeFilter(next: string) {
		eventFilter = next;
		page = 0;
		load();
	}

	function goToPage(next: number) {
		page = Math.min(Math.max(next, 0), totalPages - 1);
		load();
	}

	onMount(load);
</script>

<svelte:head>
	<title>Audit log · KRSZ Mail</title>
</svelte:head>

<section class="page">
	<header class="page-head">
		<div>
			<p class="eyebrow">Admin</p>
			<h1>Audit log</h1>
			<p class="subtitle">
				Admin actions and user account/send events. Retained 90 days, then purged automatically
				by the nightly maintenance job.
			</p>
		</div>
		<a class="btn btn-ghost" href="/admin/users">← Users</a>
	</header>

	<div class="toolbar">
		<div class="filter-group">
			<button
				type="button"
				class="filter-chip"
				class:active={eventFilter === ''}
				onclick={() => changeFilter('')}
			>All events</button>
			{#each eventTypes as type (type)}
				<button
					type="button"
					class="filter-chip"
					class:active={eventFilter === type}
					onclick={() => changeFilter(type)}
				>{eventLabel(type)}</button>
			{/each}
		</div>
		<span class="total">{total} {total === 1 ? 'entry' : 'entries'}</span>
	</div>

	{#if error}
		<div class="notice error" role="alert">{error}</div>
	{:else if loading}
		<div class="loading">Loading…</div>
	{:else if !entries.length}
		<div class="empty">No audit entries yet.</div>
	{:else}
		<div class="table-wrap">
			<table>
				<thead>
					<tr>
						<th>When</th>
						<th>Event</th>
						<th>Actor</th>
						<th>Target</th>
						<th>Detail</th>
						<th>IP</th>
					</tr>
				</thead>
				<tbody>
					{#each entries as entry (entry.id)}
						<tr>
							<td class="when" title={new Date(entry.created_at).toISOString()}>
								{formatDate(entry.created_at)}
							</td>
							<td><span class={eventClass(entry.event)}>{eventLabel(entry.event)}</span></td>
							<td class="actor">{entry.actor_email || '—'}</td>
							<td class="target">{entry.target_email || '—'}</td>
							<td class="detail">
								{#if entry.detail}
									<code>{JSON.stringify(entry.detail)}</code>
								{:else}
									—
								{/if}
							</td>
							<td class="ip">{entry.ip || '—'}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>

		{#if totalPages > 1}
			<div class="pager">
				<button type="button" disabled={page <= 0} onclick={() => goToPage(page - 1)}>‹ Prev</button>
				<span>Page {page + 1} of {totalPages}</span>
				<button type="button" disabled={page >= totalPages - 1} onclick={() => goToPage(page + 1)}>Next ›</button>
			</div>
		{/if}
	{/if}
</section>

<style>
	.page {
		width: min(100%, 1180px);
		margin: 0 auto;
		padding: var(--space-6);
	}
	.page-head {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: var(--space-4);
		margin-bottom: var(--space-5);
		flex-wrap: wrap;
	}
	.eyebrow {
		margin: 0 0 4px;
		color: var(--accent);
		font-size: 11px;
		font-weight: 700;
		letter-spacing: 0.14em;
		text-transform: uppercase;
	}
	.page-head h1 {
		margin: 0;
		font-size: clamp(24px, 3vw, 30px);
		font-weight: 600;
		letter-spacing: -0.02em;
	}
	.subtitle {
		max-width: 620px;
		margin: 6px 0 0;
		color: var(--text-muted);
		font-size: 13px;
		line-height: 1.6;
	}

	.toolbar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-4);
		margin-bottom: var(--space-4);
		flex-wrap: wrap;
	}
	.filter-group {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
	}
	.filter-chip {
		padding: 6px 12px;
		border: 1px solid var(--border);
		border-radius: var(--radius-full);
		background: var(--bg-card);
		color: var(--text-secondary);
		font-size: 12px;
		white-space: nowrap;
		transition: all var(--transition-fast);
	}
	.filter-chip:hover {
		border-color: var(--border-hover);
		color: var(--text-primary);
	}
	.filter-chip.active {
		border-color: var(--accent);
		background: var(--accent-subtle);
		color: var(--accent);
	}
	.total {
		color: var(--text-muted);
		font-size: 12px;
		white-space: nowrap;
	}

	.notice.error {
		padding: var(--space-4);
		border: 1px solid var(--color-danger-border);
		border-radius: var(--radius-md);
		background: var(--color-danger-bg);
		color: var(--color-danger);
		font-size: 13px;
	}
	.loading,
	.empty {
		padding: var(--space-8) 0;
		text-align: center;
		color: var(--text-muted);
		font-size: 13px;
	}

	.table-wrap {
		border: 1px solid var(--border);
		border-radius: var(--radius-lg);
		overflow-x: auto;
		background: var(--bg-card);
	}
	table {
		width: 100%;
		min-width: 720px;
		border-collapse: collapse;
		font-size: 12px;
	}
	th {
		padding: 10px 14px;
		text-align: left;
		color: var(--text-muted);
		font-size: 10px;
		font-weight: 700;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		border-bottom: 1px solid var(--border);
		white-space: nowrap;
	}
	td {
		padding: 10px 14px;
		border-bottom: 1px solid var(--border);
		color: var(--text-secondary);
		vertical-align: top;
	}
	tr:last-child td {
		border-bottom: none;
	}
	tr:hover td {
		background: var(--bg-secondary);
	}
	.when {
		white-space: nowrap;
		color: var(--text-muted);
		font-family: var(--font-mono);
		font-size: 11px;
	}
	.actor,
	.target {
		white-space: nowrap;
		color: var(--text-primary);
	}
	.detail code {
		display: inline-block;
		max-width: 420px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		font-family: var(--font-mono);
		font-size: 11px;
		color: var(--text-muted);
	}
	.ip {
		white-space: nowrap;
		font-family: var(--font-mono);
		font-size: 11px;
		color: var(--text-muted);
	}

	.tag {
		display: inline-block;
		padding: 2px 8px;
		border-radius: var(--radius-full);
		border: 1px solid var(--border);
		color: var(--text-secondary);
		font-size: 11px;
		white-space: nowrap;
		text-transform: capitalize;
	}
	.tag.admin {
		border-color: var(--color-warning-border);
		color: var(--color-warning-fg);
	}
	.tag.danger {
		border-color: var(--color-danger-border);
		color: var(--color-danger);
	}
	.tag.send {
		border-color: var(--accent-soft);
		color: var(--accent);
	}

	.pager {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: var(--space-4);
		padding: var(--space-5) 0;
		color: var(--text-muted);
		font-size: 12px;
	}
	.pager button {
		padding: 6px 14px;
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		background: var(--bg-card);
		color: var(--text-secondary);
		font-size: 12px;
	}
	.pager button:hover:not(:disabled) {
		border-color: var(--accent);
		color: var(--accent);
	}
	.pager button:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}

	@media (max-width: 720px) {
		.page {
			padding: var(--space-4);
		}
		.detail code {
			max-width: 220px;
		}
	}
</style>
