<script lang="ts">
	import { LOCALES, LOCALE_LABELS, LOCALE_SHORT, setLocale, type Locale } from '$lib/i18n';

	interface Props {
		locale: Locale;
		variant?: 'inline' | 'compact';
	}
	let { locale, variant = 'inline' }: Props = $props();

	let busy = $state(false);

	async function onChange(event: Event) {
		const value = (event.currentTarget as HTMLSelectElement).value;
		if (!value || value === locale) return;
		busy = true;
		try {
			await setLocale(value as Locale);
		} catch {
			busy = false;
		}
	}
</script>

<label class="picker" class:compact={variant === 'compact'} class:busy>
	<span class="short" aria-hidden="true">{LOCALE_SHORT[locale]}</span>
	<span class="full" aria-hidden="true">{LOCALE_LABELS[locale]}</span>
	<select
		value={locale}
		onchange={onChange}
		disabled={busy}
		aria-label="Language"
	>
		{#each LOCALES as code (code)}
			<option value={code}>{LOCALE_LABELS[code]}</option>
		{/each}
	</select>
</label>

<style>
	.picker {
		position: relative;
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
		padding: 6px 26px 6px 10px;
		font-size: 11px;
		font-weight: 600;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--text-secondary);
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		background: var(--bg-card);
		cursor: pointer;
		transition: border-color 120ms ease, color 120ms ease;
	}
	.picker:hover {
		border-color: var(--accent);
		color: var(--accent);
	}
	.picker:focus-within {
		border-color: var(--accent);
		box-shadow: 0 0 0 2px var(--accent-subtle);
		color: var(--text-primary);
	}
	.picker.busy {
		opacity: 0.55;
		pointer-events: none;
	}
	.picker.compact {
		min-height: 36px;
		padding: 8px 24px 8px 10px;
		font-size: 10px;
	}
	.full {
		display: none;
	}
	.short {
		font-family: var(--font-mono);
		font-size: 10px;
		letter-spacing: 0.06em;
	}
	@media (min-width: 720px) {
		.short {
			display: none;
		}
		.full {
			display: inline;
		}
	}
	select {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		opacity: 0;
		cursor: pointer;
		appearance: none;
		border: 0;
	}
	select:disabled {
		cursor: progress;
	}
	/* Tiny caret indicator so users know it's interactive. */
	.picker::after {
		content: '';
		position: absolute;
		right: 9px;
		top: 50%;
		width: 6px;
		height: 6px;
		border-right: 1.5px solid currentColor;
		border-bottom: 1.5px solid currentColor;
		transform: translateY(-70%) rotate(45deg);
		pointer-events: none;
	}
</style>
