<script lang="ts">
	import { enhance } from '$app/forms';
	import AuthShell from '$lib/components/AuthShell.svelte';
	let { data, form } = $props();
</script>

<svelte:head>
	<title>Create account · KRSZ Mail</title>
</svelte:head>

<AuthShell
	title="Create your mailbox"
	subtitle={`Pick a local part to get ${data.domain ? 'your' : 'a'}@${data.domain} address`}
>
	<form method="POST" use:enhance class="form">
		<label class="field">
			<span>Local part</span>
			<div class="addr">
				<input
					type="text"
					name="local_part"
					placeholder="kurashizu"
					value={form?.localPart ?? ''}
					required
					autocomplete="off"
					pattern={"[a-z0-9][a-z0-9._-]{1,30}"}
				/>
				<span class="suffix">@{data.domain}</span>
			</div>
		</label>

		<label class="field">
			<span>Display name (optional)</span>
			<input
				type="text"
				name="display_name"
				placeholder="Kurashizu"
				value={form?.displayName ?? ''}
				autocomplete="name"
			/>
		</label>

		<label class="field">
			<span>Password (min 6 characters)</span>
			<input
				type="password"
				name="password"
				required
				minlength="6"
				autocomplete="new-password"
			/>
		</label>

		<label class="field">
			<span>Invite code</span>
			<input
				type="text"
				name="invite_code"
				value={form?.inviteCode ?? data.inviteCode ?? ''}
				required
				autocomplete="off"
				placeholder="paste the code from the admin"
			/>
			<small>This server is invite-only. Ask the admin for a code.</small>
		</label>

		{#if form?.error}
			<div class="error">{form.error}</div>
		{/if}

		<button type="submit" class="btn btn-primary submit">Create mailbox</button>

		<p class="hint">
			Already have an account? <a href="/login">Sign in</a>
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
	.field small { font-size: 11px; color: var(--text-muted); line-height: 1.5; }
	.addr {
		display: flex;
		align-items: stretch;
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		overflow: hidden;
	}
	.addr input {
		border: 0;
		border-radius: 0;
		flex: 1;
	}
	.addr input:focus { outline: none; }
	.addr .suffix {
		display: grid;
		place-items: center;
		padding: 0 var(--space-3);
		background: var(--bg-elevated);
		color: var(--text-muted);
		font-size: 13px;
	}
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
	.hint a { color: var(--accent); }
</style>
