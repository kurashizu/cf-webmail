<script lang="ts">
	import type { Snippet } from 'svelte';
	let { children, title, subtitle, footer }: {
		children: Snippet;
		title: string;
		subtitle?: string;
		footer?: Snippet;
	} = $props();
</script>

<div class="auth-page">
	<div class="bg-glow"></div>

	<header>
		<a href="/" class="brand">
			<img class="logo-mark" src="/favicon.ico" alt="" width="32" height="32" />
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
		</footer>
	</main>
</div>

<style>
	.auth-page {
		position: relative;
		min-height: 100vh;
		display: flex;
		flex-direction: column;
	}

	.bg-glow {
		position: fixed;
		inset: 0;
		pointer-events: none;
		background:
			radial-gradient(ellipse at 30% 20%, var(--accent-subtle) 0%, transparent 50%),
			radial-gradient(ellipse at 70% 80%, rgba(255, 107, 53, 0.04) 0%, transparent 50%);
		z-index: 0;
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
		width: 32px;
		height: 32px;
		border-radius: 50%;
		object-fit: cover;
		border: 1px solid rgba(255, 107, 53, 0.45);
	}

	.brand-name {
		font-size: 18px;
		font-weight: 700;
		font-style: italic;
		letter-spacing: 0.02em;
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

	.card h1 {
		margin: 0 0 var(--space-2);
		font-size: 24px;
		font-weight: 600;
		color: var(--text-primary);
	}

	.subtitle {
		margin: 0 0 var(--space-6);
		font-size: 14px;
		color: var(--text-secondary);
		line-height: 1.6;
	}

	footer {
		font-size: 12px;
		color: var(--text-muted);
		text-align: center;
	}
</style>
