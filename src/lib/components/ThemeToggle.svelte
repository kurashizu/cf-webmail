<script lang="ts">
	import { themeStore, applyTheme, type Theme } from '$lib/stores/theme';

	const metaColor: Record<Theme, string> = { dark: '#0d1116', light: '#e6e9ed' };

	let theme = $state<Theme>('dark');

	$effect(() => {
		theme = $themeStore;
	});

	$effect(() => {
		const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
		if (meta) meta.setAttribute('content', metaColor[theme]);
	});
</script>

<div class="theme-toggle-wrap">
	<button
		class="theme-toggle"
		type="button"
		onclick={() => applyTheme(theme === 'dark' ? 'light' : 'dark')}
		aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
		title={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
	>
		{#if theme === 'dark'}
			<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="4.2" stroke="currentColor" stroke-width="1.8"/><path d="M12 3v2.2M12 18.8V21M3 12h2.2M18.8 12H21M5.6 5.6l1.6 1.6M16.8 16.8l1.6 1.6M18.4 5.6l-1.6 1.6M7.2 16.8l-1.6 1.6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>
		{:else}
			<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"/></svg>
		{/if}
	</button>
</div>

<style>
	.theme-toggle-wrap {
		position: fixed;
		right: 18px;
		bottom: 18px;
		z-index: 80;
	}
	.theme-toggle {
		display: grid;
		place-items: center;
		width: 42px;
		height: 42px;
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		background: var(--bg-card);
		color: var(--text-secondary);
		box-shadow: var(--shadow-md);
		cursor: pointer;
		transition: all var(--transition-fast);
	}
	.theme-toggle:hover {
		color: var(--accent);
		border-color: var(--accent);
		background: var(--accent-subtle);
	}
	.theme-toggle svg {
		width: 21px;
		height: 21px;
	}

	@media (max-width: 760px) {
		/* Clear the mobile bottom nav. */
		.theme-toggle-wrap {
			right: 14px;
			bottom: calc(84px + env(safe-area-inset-bottom, 0px));
		}
		.theme-toggle {
			width: 40px;
			height: 40px;
		}
	}
</style>