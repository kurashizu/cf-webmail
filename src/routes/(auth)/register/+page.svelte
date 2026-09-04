<script lang="ts">
	import { enhance } from '$app/forms';
	import { untrack } from 'svelte';
	import AuthShell from '$lib/components/AuthShell.svelte';
	import { t, type Locale } from '$lib/i18n';
	import LanguagePicker from '$lib/components/LanguagePicker.svelte';

	let { data, form } = $props();
	const tt = (key: string, params?: Record<string, string | number>) =>
		t(data.locale, key, params);

	// data.openRegistration is fixed for the lifetime of this page (it comes
	// from a server-only env flag, not something that changes client-side),
	// so capturing it once into local toggle state is intentional.
	let mode = $state<'invite' | 'open'>(
		untrack(() => (data.inviteCode || !data.openRegistration ? 'invite' : 'open'))
	);
	let submitting = $state(false);

	// Turnstile is rendered explicitly (not via its auto-detect scan) so it
	// survives Svelte destroying/recreating the container when `mode` toggles
	// away from 'open' and back — an implicit-render widget left behind by a
	// removed DOM node would never come back on remount.
	let turnstileContainer: HTMLDivElement | undefined = $state();
	let turnstileWidgetId: string | undefined;
	let turnstileScriptLoading = false;

	function renderTurnstile() {
		const turnstile = (window as any).turnstile;
		if (!turnstileContainer || !data.turnstileSiteKey || !turnstile) return;
		if (turnstileWidgetId !== undefined) return;
		turnstileWidgetId = turnstile.render(turnstileContainer, { sitekey: data.turnstileSiteKey });
	}

	$effect(() => {
		if (mode !== 'open') {
			// The container was unmounted (it's behind an {#if mode === 'open'}
			// branch) — the widget id it referred to is gone with it.
			turnstileWidgetId = undefined;
			return;
		}
		if (!data.turnstileSiteKey || !turnstileContainer) return;
		if ((window as any).turnstile) {
			renderTurnstile();
			return;
		}
		if (turnstileScriptLoading) return;
		turnstileScriptLoading = true;
		const script = document.createElement('script');
		script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js';
		script.async = true;
		script.defer = true;
		script.onload = renderTurnstile;
		document.head.appendChild(script);
	});
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

	{#if form?.pending}
		<div class="pending">
			<h2>{tt('auth.pendingTitle')}</h2>
			<p>{tt('auth.pendingBody', { email: form.email ?? '' })}</p>
			<a href="/login" class="btn btn-primary">{tt('auth.pendingBackToLogin')}</a>
		</div>
	{:else}
		{#if data.openRegistration}
			<div class="mode-toggle" role="tablist">
				<button
					type="button"
					role="tab"
					aria-selected={mode === 'open'}
					class:active={mode === 'open'}
					onclick={() => (mode = 'open')}
				>{tt('auth.modeOpen')}</button>
				<button
					type="button"
					role="tab"
					aria-selected={mode === 'invite'}
					class:active={mode === 'invite'}
					onclick={() => (mode = 'invite')}
				>{tt('auth.modeInvite')}</button>
			</div>
		{/if}

		<form
			method="POST"
			use:enhance={() => {
				submitting = true;
				return async ({ update }) => {
					submitting = false;
					await update();
				};
			}}
			class="form"
		>
			<input type="hidden" name="mode" value={mode} />

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
						pattern={mode === 'open' ? '[a-z0-9][a-z0-9._-]{4,30}' : '[a-z0-9][a-z0-9._-]{1,30}'}
						title={mode === 'open' ? tt('auth.localPartMinOpen') : undefined}
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

			{#if mode === 'invite'}
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
			{:else}
				<label class="field">
					<span>{tt('auth.noteLabel')}</span>
					<textarea
						name="note"
						rows="2"
						maxlength="500"
						placeholder={tt('auth.notePlaceholder')}
					></textarea>
					<small>{tt('auth.noteHelp')}</small>
				</label>

				{#if data.turnstileSiteKey}
					<div class="turnstile-wrap" bind:this={turnstileContainer}></div>
				{:else}
					<div class="error">{tt('auth.turnstileMissing')}</div>
				{/if}
			{/if}

			{#if form?.error}
				<div class="error">{form.error}</div>
			{/if}

			<button type="submit" class="btn btn-primary submit" disabled={submitting}>
				{#if submitting && mode === 'open'}
					<span class="spinner" aria-hidden="true"></span>
					{tt('auth.reviewingCta')}
				{:else}
					{tt('auth.createMailboxCta')}
				{/if}
			</button>

			{#if submitting && mode === 'open'}
				<p class="submitting-hint" role="status">{tt('auth.reviewingHint')}</p>
			{/if}

			<p class="terms-hint">
				{tt('auth.termsHint', { cta: tt('auth.createMailboxCta') })}
				<a href="/terms" target="_blank" rel="noopener noreferrer">{tt('auth.termsLink')}</a>.
			</p>

			<p class="hint">
				{tt('auth.alreadyHaveAccount')} <a href="/login">{tt('common.signIn')}</a>
			</p>
		</form>
	{/if}
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
	.field input,
	.field textarea { width: 100%; padding: var(--space-3) var(--space-4); font-size: 14px; }
	.field textarea { resize: vertical; font-family: inherit; }
	.field small { font-size: 11px; color: var(--text-secondary); line-height: 1.5; }
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
		color: var(--text-secondary);
		font-size: 13px;
	}
	.submit { justify-content: center; align-items: center; gap: var(--space-2); padding: var(--space-3); font-weight: 600; margin-top: var(--space-2); }
	.submit:disabled { opacity: 0.8; cursor: default; }
	.spinner {
		width: 14px;
		height: 14px;
		border: 2px solid color-mix(in srgb, currentColor 30%, transparent);
		border-top-color: currentColor;
		border-radius: 50%;
		animation: spin 0.7s linear infinite;
		flex: none;
	}
	@keyframes spin {
		to { transform: rotate(360deg); }
	}
	@media (prefers-reduced-motion: reduce) {
		.spinner { animation: none; }
	}
	.submitting-hint {
		margin: calc(var(--space-2) * -1) 0 0;
		text-align: center;
		font-size: 12px;
		color: var(--text-secondary);
		line-height: 1.5;
		text-wrap: balance;
	}
	.error {
			padding: var(--space-3);
			border-radius: var(--radius-md);
			background: var(--color-danger-subtle);
			border: 1px solid var(--color-danger-border);
			color: var(--color-danger);
			font-size: 13px;
		}
	.hint { text-align: center; font-size: 13px; color: var(--text-secondary); margin: 0; }
	.hint a { color: var(--accent); }
	.terms-hint { text-align: center; font-size: 11px; line-height: 1.5; color: var(--text-secondary); margin: 0; text-wrap: balance; }
	.terms-hint a { color: var(--accent); }
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
		color: var(--text-secondary);
	}

	.mode-toggle {
		display: flex;
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		overflow: hidden;
		margin-bottom: var(--space-4);
	}
	.mode-toggle button {
		flex: 1;
		padding: var(--space-2) var(--space-3);
		font-size: 12px;
		font-weight: 600;
		letter-spacing: 0.02em;
		color: var(--text-secondary);
		background: transparent;
		border: 0;
		cursor: pointer;
		transition: background var(--transition-fast), color var(--transition-fast);
	}
	.mode-toggle button:first-child { border-right: 1px solid var(--border); }
	.mode-toggle button.active {
		background: var(--accent-subtle);
		color: var(--accent);
	}

	.turnstile-wrap { display: flex; justify-content: center; }

	.pending {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--space-3);
		text-align: center;
	}
	.pending h2 { margin: 0; font-size: 18px; font-weight: 700; color: var(--text-primary); }
	.pending p { margin: 0; font-size: 14px; line-height: 1.6; color: var(--text-secondary); }
	.pending .btn { margin-top: var(--space-2); }
</style>
