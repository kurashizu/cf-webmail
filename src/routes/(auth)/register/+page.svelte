<script lang="ts">
	import { enhance } from '$app/forms';
	import AuthShell from '$lib/components/AuthShell.svelte';
	import { t, type Locale } from '$lib/i18n';
	import LanguagePicker from '$lib/components/LanguagePicker.svelte';

	let { data, form } = $props();
	const tt = (key: string, params?: Record<string, string | number>) =>
		t(data.locale, key, params);
</script>

<svelte:head>
	<title>{tt('auth.registerTitle')} · {tt('common.brandName')}</title>
</svelte:head>

<AuthShell
	title={tt('auth.registerTitle')}
	subtitle={tt('auth.registerSubtitle', { domain: data.domain })}
>
	{#snippet footer()}
		<div class="footer-row">
			<span class="footer-text">{tt('auth.hostingFooter')}</span>
			<LanguagePicker locale={data.locale as Locale} variant="compact" />
		</div>
	{/snippet}

	<form method="POST" use:enhance class="form">
		<label class="field">
			<span>{tt('auth.localPartLabel')}</span>
			<div class="addr">
				<input
					type="text"
					name="local_part"
					placeholder={tt('auth.localPartPlaceholder')}
					value={form?.localPart ?? ''}
					required
					autocomplete="off"
					pattern={"[a-z0-9][a-z0-9._-]{1,30}"}
				/>
				<span class="suffix">@{data.domain}</span>
			</div>
		</label>

		<label class="field">
			<span>{tt('auth.displayNameLabel')}</span>
			<input
				type="text"
				name="display_name"
				placeholder={tt('auth.displayNamePlaceholder')}
				value={form?.displayName ?? ''}
				autocomplete="name"
			/>
		</label>

		<label class="field">
			<span>{tt('auth.passwordHint')}</span>
			<input
				type="password"
				name="password"
				required
				minlength="6"
				autocomplete="new-password"
			/>
		</label>

		<label class="field">
			<span>{tt('auth.inviteCodeLabel')}</span>
			<input
				type="text"
				name="invite_code"
				value={form?.inviteCode ?? data.inviteCode ?? ''}
				required
				autocomplete="off"
				placeholder={tt('auth.inviteCodePlaceholder')}
			/>
			<small>{tt('auth.inviteHelp')}</small>
		</label>

		{#if form?.error}
			<div class="error">{form.error}</div>
		{/if}

		<button type="submit" class="btn btn-primary submit">{tt('auth.createMailboxCta')}</button>

		<p class="hint">
			{tt('auth.alreadyHaveAccount')} <a href="/login">{tt('common.signIn')}</a>
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
	.footer-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-4);
		flex-wrap: wrap;
		width: 100%;
	}
	.footer-text {
		font-size: 11px;
		color: var(--text-muted);
	}
</style>
