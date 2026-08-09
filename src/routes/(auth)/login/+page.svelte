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
	<title>{tt('auth.loginTitle')} · {tt('common.brandName')}</title>
</svelte:head>

<AuthShell
	title={tt('auth.loginTitle')}
	subtitle={tt('auth.loginSubtitle', { brand: tt('common.brandName') })}
>
	{#snippet footer()}
		<div class="footer-row">
			<span class="footer-text">{tt('auth.hostingFooter')}</span>
			<LanguagePicker locale={data.locale as Locale} variant="compact" />
		</div>
	{/snippet}

	<form method="POST" use:enhance class="form">
		<input type="hidden" name="next" value={data.next} />

		<label class="field">
			<span>{tt('auth.emailLabel')}</span>
			<input
				type="email"
				name="email"
				placeholder={tt('auth.emailPlaceholder')}
				value={form?.email ?? ''}
				required
				autocomplete="username"
			/>
		</label>

		<label class="field">
			<span>{tt('auth.passwordLabel')}</span>
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

		<button type="submit" class="btn btn-primary submit">{tt('auth.signInCta')}</button>

		<p class="hint">{tt('auth.signInHint')}</p>
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
