<script lang="ts">
	import '$lib/styles/global.css';
	import { navigating } from '$app/state';

	let { children } = $props();
	let showProgress = $state(false);
	let progressTimer: ReturnType<typeof setTimeout> | null = null;

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
</style>
