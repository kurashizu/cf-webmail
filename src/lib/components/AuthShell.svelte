<script lang="ts">
	import type { Snippet } from 'svelte';
	import BackgroundVideo from '$lib/components/BackgroundVideo.svelte';
	import BuildInfo from '$lib/components/BuildInfo.svelte';
	let { children, title, subtitle, footer }: {
		children: Snippet;
		title: string;
		subtitle?: string;
		footer?: Snippet;
	} = $props();
</script>

<div class="auth-page">
	<div class="bg-glow"></div>
	<BackgroundVideo src="/video/space-station-orbiting.av1.mp4" opacity={0.4} />

	<header>
		<a href="/" class="brand">
			<img class="logo-mark" src="/brand-mark.svg" alt="" width="40" height="40" />
			<span class="brand-name font-serif">KRSZ Mail</span>
		</a>
	</header>

	<main>
		<div class="card">
			<h1>{title}</h1>
			{#if subtitle}<p class="subtitle">{subtitle}</p>{/if}
			{@render children?.()}
		</div>

		<footer>
			{#if footer}
				{@render footer()}
			{:else}
				<p>Hosted on Cloudflare · powered by Email Service</p>
			{/if}
			<BuildInfo />
		</footer>
	</main>
</div>

<style>
	.auth-page {
		position: relative;
		min-height: 100vh;
		display: flex;
		flex-direction: column;
		background: var(--bg-primary);
		overflow: hidden;
		isolation: isolate;
	}

	.bg-glow {
		position: fixed;
		inset: 0;
		pointer-events: none;
		background:
			radial-gradient(ellipse at 30% 20%, var(--accent-subtle) 0%, transparent 55%),
			radial-gradient(ellipse at 70% 80%, var(--accent-subtle) 0%, transparent 55%);
		z-index: 0;
	}

	:global(.auth-page .bg-video) {
		position: fixed;
		z-index: -1;
	}

	header {
		position: relative;
		z-index: 1;
		padding: var(--space-6);
	}

	.brand {
		display: inline-flex;
		align-items: center;
		gap: var(--space-3);
	}

	.logo-mark {
		width: 40px;
		height: 40px;
		border-radius: var(--radius-sm);
		object-fit: cover;
		border: 1px solid var(--accent-ring);
	}

	.brand-name {
		font-size: 15px;
		font-weight: 700;
		letter-spacing: 0.14em;
		text-transform: uppercase;
	}

	main {
		flex: 1;
		position: relative;
		z-index: 1;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		padding: var(--space-6);
		gap: var(--space-8);
	}

	.card {
		width: 100%;
		max-width: 420px;
		padding: var(--space-8);
	}
	/* This card is a static form, not a clickable list item — undo the
	 * global .card:hover lift/shadow-grow so hovering the form doesn't read
	 * as an accidental button/link affordance. */
	.card:hover {
		border-color: var(--border);
		box-shadow: var(--shadow-card);
		transform: none;
	}

	.card h1 {
		margin: 0 0 var(--space-2);
		font-size: 22px;
		font-weight: 700;
		letter-spacing: 0.04em;
		color: var(--text-primary);
	}

	.subtitle {
		margin: 0 0 var(--space-6);
		font-size: 14px;
		color: var(--text-secondary);
		line-height: 1.6;
	}

	footer {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--space-2);
		font-size: 12px;
		color: var(--text-secondary);
		text-align: center;
	}
</style>
