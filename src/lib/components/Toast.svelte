<script lang="ts">
	import { toastStore, type ToastEntry } from '$lib/toast';

	let toasts: ToastEntry[] = $state([]);
	toastStore.subscribe((value) => { toasts = value; });

	const ICONS: Record<string, string> = {
		success: `<svg viewBox="0 0 24 24" fill="none" width="18" height="18"><path d="M5 13l4 4L19 7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
		error: `<svg viewBox="0 0 24 24" fill="none" width="18" height="18"><path d="M18 6 6 18M6 6l12 12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`,
		warning: `<svg viewBox="0 0 24 24" fill="none" width="18" height="18"><path d="M12 9v4m0 4h.01M10.3 3.86c.77-1.36 2.63-1.36 3.4 0l8.45 14.86A2 2 0 0 1 20.4 22H3.6a2 2 0 0 1-1.75-3.28L10.3 3.86Z" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>`,
		info: `<svg viewBox="0 0 24 24" fill="none" width="18" height="18"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.7"/><path d="M12 16v-4m0-4h.01" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>`
	};
</script>

<div class="toast-container" role="status" aria-live="polite" aria-relevant="additions removals">
	{#each toasts as item (item.id)}
		<div class="toast toast-{item.kind}" class:leaving={item.leaving} role="alert">
			<span class="toast-icon">{@html ICONS[item.kind]}</span>
			<span class="toast-msg">{item.message}</span>
			{#if item.action}
				<button class="toast-action" type="button" onclick={() => { item.action!.onclick(); toastStore.dismiss(item.id); }}>{item.action.label}</button>
			{/if}
			<button class="toast-close" type="button" onclick={() => toastStore.dismiss(item.id)} aria-label="Dismiss">×</button>
		</div>
	{/each}
</div>

<style>
	.toast-container {
		position: fixed;
		top: calc(var(--header-height) + var(--space-4));
		right: var(--space-4);
		z-index: var(--toast-z);
		display: flex;
		flex-direction: column;
		align-items: flex-end;
		gap: 8px;
		pointer-events: none;
		max-width: 420px;
		width: calc(100% - var(--space-8));
	}
	.toast {
		display: flex;
		align-items: center;
		gap: 10px;
		width: 100%;
		padding: 12px 14px;
		border: 1px solid;
		border-radius: var(--radius-lg);
		background: var(--bg-card);
		box-shadow: var(--shadow-toast);
		pointer-events: auto;
		animation: toast-in 250ms var(--ease-out);
		transition: opacity 200ms ease, transform 200ms ease;
		backdrop-filter: blur(12px);
		-webkit-backdrop-filter: blur(12px);
	}
	.toast.leaving {
		opacity: 0;
		transform: translateX(30px) scale(0.96);
	}
	.toast-success { border-color: var(--color-success-border); background: color-mix(in srgb, var(--color-success-bg) 70%, var(--bg-card)); }
	.toast-error { border-color: var(--color-danger-border); background: color-mix(in srgb, var(--color-danger-bg) 70%, var(--bg-card)); }
	.toast-warning { border-color: var(--color-warning-border); background: color-mix(in srgb, var(--color-warning-bg) 70%, var(--bg-card)); }
	.toast-info { border-color: var(--border); }
	.toast-icon { display: grid; place-items: center; flex: none; }
	.toast-success .toast-icon { color: var(--color-success); }
	.toast-error .toast-icon { color: var(--color-danger); }
	.toast-warning .toast-icon { color: var(--color-warning); }
	.toast-info .toast-icon { color: var(--accent); }
	.toast-msg { flex: 1; font-size: 13px; line-height: 1.4; color: var(--text-primary); }
	.toast-action { flex: none; padding: 5px 10px; border-radius: var(--radius-md); background: var(--accent-subtle); color: var(--accent); font-size: 12px; font-weight: 600; white-space: nowrap; cursor: pointer; }
	.toast-action:hover { background: var(--accent-glow); }
	.toast-close { flex: none; width: 26px; height: 26px; display: grid; place-items: center; border-radius: 50%; color: var(--text-muted); font-size: 18px; cursor: pointer; background: transparent; border: 0; }
	.toast-close:hover { background: var(--bg-elevated); color: var(--text-primary); }

	@keyframes toast-in {
		from { opacity: 0; transform: translateX(30px) scale(0.96); }
		to { opacity: 1; transform: translateX(0) scale(1); }
	}

	@media (max-width: 760px) {
		.toast-container {
			top: calc(var(--header-height) + var(--space-2));
			right: var(--space-2);
			width: calc(100% - var(--space-4));
			max-width: 100%;
		}
		.toast { padding: 10px 12px; }
	}
</style>