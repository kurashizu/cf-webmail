<script lang="ts">
	import { enhance } from '$app/forms';
	import AuthShell from '$lib/components/AuthShell.svelte';
	let { data, form } = $props();
</script>

<svelte:head>
	<title>Sign in · KRSZ Mail</title>
</svelte:head>

<AuthShell title="Sign in" subtitle="Use your KRSZ Mail address and password">
	<form method="POST" use:enhance class="form">
		<input type="hidden" name="next" value={data.next} />

		<label class="field">
			<span>Email</span>
			<input
				type="email"
				name="email"
				placeholder="you@krsz.in"
				value={form?.email ?? ''}
				required
				autocomplete="username"
			/>
		</label>

		<label class="field">
			<span>Password</span>
			<input
				type="password"
				name="password"
				required
				autocomplete="current-password"
			/>
		</label>

		{#if form?.error}
			<div class="error">{form.error}</div>
		{/if}

		<button type="submit" class="btn btn-primary submit">Sign in</button>

		<p class="hint">
			Need an account? Ask the admin for an invite code.
		</p>
	</form>
</AuthShell>

<style>
	.form { display: flex; flex-direction: column; gap: var(--space-4); }
	.field { display: flex; flex-direction: column; gap: var(--space-2); }
	.field span {
		font-size: 12px;
		font-weight: 500;
		color: var(--text-secondary);
		letter-spacing: 0.05em;
		text-transform: uppercase;
	}
	.field input { width: 100%; padding: var(--space-3) var(--space-4); font-size: 14px; }
	.submit { justify-content: center; padding: var(--space-3); font-weight: 600; margin-top: var(--space-2); }
	.error {
			padding: var(--space-3);
			border-radius: var(--radius-md);
			background: var(--color-danger-subtle);
			border: 1px solid var(--color-danger-border);
			color: var(--color-danger);
			font-size: 13px;
		}
	.hint { text-align: center; font-size: 13px; color: var(--text-muted); margin: 0; }
</style>
