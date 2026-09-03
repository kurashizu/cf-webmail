<script lang="ts">
	import '$lib/styles/global.css';
	import { navigating } from '$app/state';
	import { initLocale } from '$lib/i18n';

	let { data, children } = $props();
	let showProgress = $state(false);
	let progressTimer: ReturnType<typeof setTimeout> | null = null;

	// Hydrate the client locale store from SSR-injected data on first load
	// and after every navigation that changes the value.
	$effect(() => {
		if (data?.locale) initLocale(data.locale);
	});

	$effect(() => {
		if (navigating.to) {
			if (progressTimer) clearTimeout(progressTimer);
			progressTimer = setTimeout(() => (showProgress = true), 120);
		} else {
			if (progressTimer) clearTimeout(progressTimer);
			progressTimer = null;
			showProgress = false;
		}
	});
</script>

{#if showProgress}
	<div class="navigation-progress" role="status" aria-label="Loading page"><span></span></div>
{/if}
{@render children?.()}

<a
	class="build-info"
	href="https://github.com/kurashizu/cf-webmail/commit/{__BUILD_COMMIT__}"
	target="_blank"
	rel="noopener noreferrer"
	title="Build {__BUILD_COMMIT__} — {__BUILD_TIME__}"
>{__BUILD_COMMIT__} · {new Date(__BUILD_TIME__).toISOString().slice(0, 16).replace('T', ' ')}</a>

<style>
	.navigation-progress {
		position: fixed;
		top: 0;
		right: 0;
		left: 0;
		z-index: 1000;
		height: 2px;
		overflow: hidden;
		background: color-mix(in srgb, var(--accent) 15%, transparent);
		pointer-events: none;
	}
	.navigation-progress span {
		display: block;
		width: 42%;
		height: 100%;
		background: var(--accent);
		box-shadow: 0 0 10px color-mix(in srgb, var(--accent) 60%, transparent);
		animation: navigation-progress 1.05s ease-in-out infinite;
	}
	@keyframes navigation-progress {
		from { transform: translateX(-110%); }
		to { transform: translateX(340%); }
	}
	@media (prefers-reduced-motion: reduce) {
		.navigation-progress span { width: 100%; animation: none; }
	}

	.build-info {
		position: fixed;
		right: 8px;
		bottom: 6px;
		z-index: 10;
		padding: 2px 6px;
		border-radius: var(--radius-sm);
		font-family: var(--font-mono);
		font-size: 9px;
		letter-spacing: 0.02em;
		color: var(--text-muted);
		opacity: 0.35;
		text-decoration: none;
		pointer-events: auto;
		transition: opacity var(--transition-fast);
	}
	.build-info:hover,
	.build-info:focus-visible {
		opacity: 1;
		color: var(--text-secondary);
	}
	@media (max-width: 680px) {
		.build-info { display: none; }
	}
</style>
