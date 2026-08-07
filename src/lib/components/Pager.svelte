<script lang="ts">
	interface Props {
		page: number;
		totalPages: number;
		baseHref: string;
	}
	let { page, totalPages, baseHref }: Props = $props();

	const pages = $derived.by(() => {
		if (totalPages <= 7) {
			return Array.from({ length: totalPages }, (_, i) => i + 1);
		}
		// Windowing around the current page: first, last, current ±1, with ellipses.
		const items = new Set<number>([1, totalPages, page - 1, page, page + 1]);
		const sorted = [...items].filter((n) => n >= 1 && n <= totalPages).sort((a, b) => a - b);
		const out: (number | '…')[] = [];
		let prev = 0;
		for (const n of sorted) {
			if (n - prev > 1) out.push('…');
			out.push(n);
			prev = n;
		}
		return out;
	});

	function hrefFor(n: number): string {
		return n <= 1 ? baseHref : `${baseHref}?page=${n}`;
	}
</script>

{#if totalPages > 1}
	<nav class="pager" aria-label="Pagination">
		<a
			class="pager-btn"
			class:disabled={page <= 1}
			aria-disabled={page <= 1}
			href={page > 1 ? `${baseHref}?page=${page - 1}` : baseHref}
			aria-label="Previous page"
		>‹ Prev</a>
		<div class="pages">
			{#each pages as n (n === '…' ? `gap-${pages.indexOf(n)}` : n)}
				{#if n === '…'}
					<span class="gap">…</span>
				{:else}
					<a
						class="pager-link"
						class:active={n === page}
						aria-current={n === page ? 'page' : undefined}
						href={hrefFor(n)}
					>{n}</a>
				{/if}
			{/each}
		</div>
		<a
			class="pager-btn"
			class:disabled={page >= totalPages}
			aria-disabled={page >= totalPages}
			href={page < totalPages ? `${baseHref}?page=${page + 1}` : baseHref}
			aria-label="Next page"
		>Next ›</a>
	</nav>
{/if}

<style>
	.pager {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: var(--space-3);
		padding: var(--space-5) 0;
	}
	.pager-btn,
	.pager-link {
		display: inline-grid;
		place-items: center;
		min-width: 34px;
		height: 34px;
		padding: 0 10px;
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		color: var(--text-secondary);
		font-size: 12px;
		transition: all var(--transition-fast);
	}
	.pager-btn { padding: 0 12px; }
	.pager-link:hover:not(.active),
	.pager-btn:hover:not(.disabled) {
		border-color: var(--accent);
		color: var(--accent);
		background: var(--accent-subtle);
	}
	.pager-link.active {
		border-color: var(--accent);
		background: var(--accent);
		color: white;
	}
	.pager-btn.disabled {
		opacity: .4;
		pointer-events: none;
	}
	.gap { color: var(--text-muted); font-size: 12px; padding: 0 4px; }
	.pages { display: flex; align-items: center; gap: 4px; }

	@media (max-width: 480px) {
		.pager { gap: var(--space-2); }
		.pager .gap { display: none; }
	}
</style>