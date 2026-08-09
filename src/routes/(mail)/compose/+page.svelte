<script lang="ts">
import { enhance } from '$app/forms';
import { beforeNavigate } from '$app/navigation';
import { onMount, untrack } from 'svelte';
import { toastStore } from '$lib/toast';
import { t, type Locale } from '$lib/i18n';
let { data, form } = $props();
const tt = (key: string, params?: Record<string, string | number>) =>
	t(data.locale as Locale, key, params);
let fileInput: HTMLInputElement;
let files = $state<File[]>([]);
let sending = $state(false);
let dragActive = $state(false);
let dirty = $state(false);

let storage = $state<{ used_bytes: number; quota_bytes: number; message_count: number; quota_messages: number } | null>(null);

const totalSize = $derived(files.reduce((total, file) => total + file.size, 0));

const projectedUsage = $derived.by(() => {
		if (!storage) return null;
		const projectedBytes = Number(storage.used_bytes || 0) + totalSize;
		const projectedMessages = Number(storage.message_count || 0) + 1;
		const qBytes = Number(storage.quota_bytes || 0);
		const qMessages = Number(storage.quota_messages || 0);
		const overBytes = qBytes > 0 && projectedBytes > qBytes;
		const overMessages = qMessages > 0 && projectedMessages > qMessages;
		return { projectedBytes, projectedMessages, overBytes, overMessages };
	});

onMount(async () => {
		try {
			const response = await fetch('/api/storage', { headers: { accept: 'application/json' } });
			if (response.ok) storage = await response.json();
		} catch {
			/* silent — compose must remain functional even if storage is briefly unavailable */
		}
	});

	/* ---- Manual draft save ---- */
	// Capture the SSR prefill once (intentionally not reactive).
	const initPrefill = untrack(() => data.prefill);
	const initDraftId = untrack(() => data.draftId || '');
	const initTo = initPrefill.to;
	const initCc = initPrefill.cc || '';
	const initSubject = initPrefill.subject;
	const initText = initPrefill.text || '';
	const initSnapshot = JSON.stringify({ to: initTo.trim(), cc: initCc.trim(), subject: initSubject.trim(), text: initText });
	let to = $state(initTo);
	let cc = $state(initCc);
	let subject = $state(initSubject);
	let text = $state(initText);
	let draftId = $state(initDraftId);
	let draftStatus = $state<'idle' | 'saving' | 'saved' | 'error'>('idle');
	let sent = $state(false);

	const draftSnapshot = $derived(
		JSON.stringify({ to: to.trim(), cc: cc.trim(), subject: subject.trim(), text })
	);
	const hasContent = $derived(to.trim() !== '' || subject.trim() !== '' || text.trim() !== '');
	let savedSnapshot = $state('');

	// Mark the composer dirty once the user edits anything (used by the exit
	// confirmation); a successful save or send clears it. Also clear the
	// transient "saved" indicator as soon as the user types again.
	$effect(() => {
		if (draftSnapshot !== initSnapshot) dirty = true;
		if (draftStatus === 'saved' && draftSnapshot !== savedSnapshot) draftStatus = 'idle';
	});

	async function saveDraft() {
		if (sent || !hasContent || draftStatus === 'saving') return;
		draftStatus = 'saving';
		try {
			const resp = await fetch('/api/messages/draft', {
				method: 'PUT',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ id: draftId || undefined, to, cc, subject, text })
			});
			if (resp.ok) {
				const result = (await resp.json()) as { id: string };
				draftId = result.id;
				savedSnapshot = draftSnapshot;
				draftStatus = 'saved';
				dirty = false;
			} else {
				draftStatus = 'error';
			}
		} catch {
			draftStatus = 'error';
		}
	}

function chooseFiles(selected: FileList | null) {
		if (!selected) return;
		const next = [...files];
		for (const file of Array.from(selected)) {
			if (next.length >= 20) break;
			if (!next.some((item) => item.name === file.name && item.size === file.size)) next.push(file);
		}
		files = next;
		syncInput();
	}

function removeFile(index: number) {
		files = files.filter((_, itemIndex) => itemIndex !== index);
		syncInput();
	}

function syncInput() {
		if (!fileInput) return;
		const transfer = new DataTransfer();
		for (const file of files) transfer.items.add(file);
		fileInput.files = transfer.files;
	}

function formatSize(bytes: number) {
		if (bytes < 1024) return `${bytes} B`;
		if (bytes < 1024 * 1024) return `${Math.ceil(bytes / 1024)} KB`;
		return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
	}
function formatMB(bytes: number) {
		return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
	}
</script>

<svelte:head><title>{tt('compose.title')} · {tt('common.brandName')}</title></svelte:head>

<section class="page">
	<header class="head">
		<a class="back" href="/inbox" aria-label={tt('message.backToInbox')}>
			<svg viewBox="0 0 24 24" fill="none"><path d="m15 18-6-6 6-6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
		</a>
		<div><p>{tt('compose.title')}</p><h1>{draftId ? tt('compose.updateDraft') : tt('compose.title')}</h1></div>
	</header>

	{#if projectedUsage && (projectedUsage.overBytes || projectedUsage.overMessages)}
		<div class="notice quota-warn" role="alert">
			<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 9v4m0 4h.01M10.3 3.86c.77-1.36 2.63-1.36 3.4 0l8.45 14.86A2 2 0 0 1 20.4 22H3.6a2 2 0 0 1-1.75-3.28L10.3 3.86Z" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>
			<div>
				<strong>{tt('compose.storageWarning.bytes')}</strong>
				<span>
					{#if projectedUsage.overBytes}Storage: {formatMB(projectedUsage.projectedBytes)} of {storage?.quota_bytes ? formatMB(storage.quota_bytes) : '∞'}. {/if}
					{#if projectedUsage.overMessages}Messages: {projectedUsage.projectedMessages.toLocaleString()} of {storage?.quota_messages ? storage.quota_messages.toLocaleString() : '∞'}.{/if}
					Send will fail unless you free space first.
				</span>
			</div>
		</div>
	{/if}

	<form method="POST" action="?/send" enctype="multipart/form-data" class="composer" use:enhance={() => {
				sending = true;
				return async ({ update, result }) => {
					await update();
					sending = false;
					if (result.type === 'success' || result.type === 'redirect') {
						// Message is on its way — stop autosaving and let the server-side
						// action delete the draft.
						sent = true;
						toastStore.success(tt('toast.send.success'));
						dirty = false;
					} else if (result.type === 'failure') {
						const data = result.data as { error?: string } | null;
						if (data?.error) toastStore.error(data.error);
					}
				};
	}}>
		<div class="address-fields">
			<label class="field inline"><span>{tt('compose.from')}</span><input type="text" value={data.user.email} disabled /></label>
			<label class="field inline"><span>{tt('compose.to')}</span><input type="text" name="to" bind:value={to} placeholder={tt('compose.toPlaceholder')} required autocomplete="off" /></label>
			<label class="field inline subject"><span>{tt('compose.subject')}</span><input type="text" name="subject" bind:value={subject} placeholder={tt('compose.subjectPlaceholder')} required /></label>
		</div>

		<label class="message-field">
			<span class="sr-only">{tt('compose.body')}</span>
			<textarea name="body" bind:value={text} rows="15" placeholder={tt('compose.bodyPlaceholder')} required></textarea>
		</label>

		<input type="hidden" name="draft_id" value={draftId} />

		<input bind:this={fileInput} class="file-input" type="file" name="attachments" multiple onchange={(event) => chooseFiles(event.currentTarget.files)} />
		<div
			class="drop-zone"
			class:active={dragActive}
			role="button"
			tabindex="0"
			onclick={() => fileInput.click()}
			onkeydown={(event) => { if (event.key === 'Enter' || event.key === ' ') fileInput.click(); }}
			ondragover={(event) => { event.preventDefault(); dragActive = true; }}
			ondragleave={() => (dragActive = false)}
			ondrop={(event) => { event.preventDefault(); dragActive = false; if (event.dataTransfer) chooseFiles(event.dataTransfer.files); }}
		>
			<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m9 12 5-5a3 3 0 0 1 4 4l-7 7a5 5 0 0 1-7-7l7-7" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>
			<span>{tt('compose.attachmentsAdd')}</span><small>{tt('compose.maxAttachments')}</small>
		</div>

		{#if files.length}
			<ul class="attachments" aria-label={tt('compose.attachmentsAria')}>
				{#each files as file, index (`${file.name}-${file.size}`)}
					<li>
						<div class="file-icon"><svg viewBox="0 0 24 24" fill="none"><path d="M6 3h8l4 4v14H6V3Zm8 0v5h4" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg></div>
						<div><strong>{file.name}</strong><span>{formatSize(file.size)}</span></div>
						<button type="button" onclick={() => removeFile(index)} aria-label={`${tt('compose.attachmentsRemove')}: ${file.name}`} title={tt('compose.attachmentsRemove')}>×</button>
					</li>
				{/each}
			</ul>
		{/if}

		{#if form?.error}<div class="notice error" role="alert">{form.error}</div>{/if}

		<footer class="composer-footer">
			<div class="footer-left">
				<span class="draft-status" aria-live="polite">
					{#if draftStatus === 'saving'}<span class="saving">{tt('compose.draftStatus.saving')}</span>
					{:else if draftStatus === 'saved'}<span class="saved">✓ {tt('compose.draftStatus.saved')}</span>
					{:else if draftStatus === 'error'}<span class="status-error">{tt('compose.draftStatus.error')}</span>{/if}
				</span>
				<span class="file-info" class:over-limit={totalSize > 26_214_400}>{files.length ? `${tt('common.messageCount', { count: files.length })} · ${formatSize(totalSize)}` : tt('compose.noAttachments')}</span>
			</div>
			<div class="footer-actions">
				<button type="button" class="btn save-draft" onclick={saveDraft} disabled={sent || !hasContent || draftStatus === 'saving'} title={tt('compose.saveDraft')}>
					<svg viewBox="0 0 24 24" fill="none"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2Zm-9 0V14h4v7" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><path d="M7 3v4h7" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>
					{draftId ? tt('compose.updateDraft') : tt('compose.saveDraft')}
				</button>
				<button class="btn btn-primary send" type="submit" disabled={sending || totalSize > 26_214_400}>
					<svg viewBox="0 0 24 24" fill="none"><path d="m21 3-7.5 18-3.1-7.4L3 10.5 21 3Zm-10.6 10.6L21 3" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
					{sending ? tt('compose.sending') : tt('compose.send')}
				</button>
			</div>
		</footer>
	</form>
</section>

<style>
	.page { width: min(100%, 900px); margin: 0 auto; padding: var(--space-6); }
	.head { display: flex; align-items: center; gap: var(--space-3); margin-bottom: var(--space-5); }
	.head p { margin: 0 0 2px; color: var(--accent); font-size: 10px; font-weight: 700; letter-spacing: .12em; text-transform: uppercase; }
	.head h1 { margin: 0; font-size: 25px; font-weight: 600; letter-spacing: -.02em; }
	.back { width: 38px; height: 38px; display: grid; place-items: center; border: 1px solid var(--border); border-radius: 50%; color: var(--text-secondary); }
	.back:hover { background: var(--accent-subtle); border-color: var(--border-hover); }
	.back svg { width: 19px; }
	.composer { overflow: hidden; border: 1px solid var(--border); border-radius: var(--radius-lg); background: var(--bg-secondary); box-shadow: var(--shadow-sm); }
	.address-fields { padding: 5px var(--space-5) 0; }
	.field.inline { display: grid; grid-template-columns: 68px minmax(0, 1fr); align-items: center; border-bottom: 1px solid var(--border); }
	.field.inline span { color: var(--text-muted); font-size: 12px; }
	.field.inline input { min-width: 0; padding: 13px 0; border: 0; background: transparent; border-radius: 0; }
	.field.inline input:focus { border: 0; }
	.field.inline input:disabled { color: var(--text-muted); }
	.subject input { font-weight: 550; }
	.message-field { display: block; padding: var(--space-4) var(--space-5); }
	.message-field textarea { width: 100%; min-height: 300px; padding: 0; border: 0; resize: vertical; background: transparent; line-height: 1.7; }
	.message-field textarea:focus { border: 0; }
	.sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0,0,0,0); }
	.file-input { display: none; }
	.drop-zone { display: flex; align-items: center; gap: 9px; margin: 0 var(--space-5) var(--space-4); padding: 11px 13px; border: 1px dashed var(--border-hover); border-radius: var(--radius-md); color: var(--text-secondary); cursor: pointer; transition: all var(--transition-fast); }
	.drop-zone:hover, .drop-zone.active { border-color: var(--accent); background: var(--accent-subtle); color: var(--accent); }
	.drop-zone svg { width: 18px; height: 18px; flex: none; }
	.drop-zone span { font-size: 12px; }
	.drop-zone small { margin-left: auto; color: var(--text-muted); font-size: 10px; }
	.attachments { display: grid; gap: 6px; margin: 0 var(--space-5) var(--space-4); padding: 0; list-style: none; }
	.attachments li { display: grid; grid-template-columns: 34px minmax(0, 1fr) auto; align-items: center; gap: 10px; padding: 8px 10px; border: 1px solid var(--border); border-radius: var(--radius-md); background: var(--bg-card); }
	.file-icon { width: 30px; height: 30px; display: grid; place-items: center; border-radius: var(--radius-sm); background: var(--accent-subtle); color: var(--accent); }
	.file-icon svg { width: 16px; }
	.attachments li > div:nth-child(2) { min-width: 0; display: grid; }
	.attachments strong { overflow: hidden; font-size: 12px; font-weight: 550; text-overflow: ellipsis; white-space: nowrap; }
	.attachments span { color: var(--text-muted); font-size: 10px; }
	.attachments button { width: 28px; height: 28px; border-radius: 50%; color: var(--text-muted); font-size: 18px; }
	.attachments button:hover { background: var(--color-danger-subtle); color: var(--color-danger); }
	.notice { margin: 0 var(--space-5) var(--space-4); padding: 10px 12px; border-radius: var(--radius-md); font-size: 12px; }
		.notice.error { border: 1px solid var(--color-danger-border); background: var(--color-danger-bg); color: var(--color-danger); }
			.quota-warn { display: flex; align-items: flex-start; gap: 10px; margin: 0 0 var(--space-4); border: 1px solid var(--color-warning-border); background: var(--color-warning-bg); color: var(--color-warning); }
		.quota-warn svg { width: 18px; height: 18px; flex: none; }
		.quota-warn strong { display: block; font-size: 12px; }
		.quota-warn span { display: block; margin-top: 3px; font-size: 11px; line-height: 1.5; }
	.composer-footer { display: flex; align-items: center; justify-content: space-between; gap: var(--space-4); padding: var(--space-3) var(--space-5); border-top: 1px solid var(--border); background: var(--bg-card); }
	.footer-left { display: flex; flex-direction: column; align-items: flex-start; gap: 2px; min-width: 0; }
	.draft-status { min-height: 13px; font-size: 10px; color: var(--text-muted); }
	.draft-status .saved { color: var(--color-success); }
	.draft-status .status-error { color: var(--color-danger); }
	.file-info { color: var(--text-muted); font-size: 10px; }
	.footer-actions { display: flex; align-items: center; gap: var(--space-2); }
	.save-draft { display: inline-flex; align-items: center; gap: 7px; padding: 10px 14px; color: var(--text-secondary); border-color: var(--border-hover); }
	.save-draft:hover { background: var(--accent-subtle); border-color: var(--border-hover); color: var(--text); }
	.save-draft svg { width: 15px; height: 15px; }
	.save-draft:disabled { opacity: .5; cursor: not-allowed; }
	.over-limit { color: var(--color-danger) !important; }
	.send { padding: 10px 17px; }
	.send svg { width: 17px; height: 17px; }
	.send:disabled { opacity: .55; cursor: wait; }
	@media (max-width: 760px) {
		.page { padding: var(--space-3) 10px; }
		.head { gap: var(--space-3); margin-bottom: var(--space-3); }
		.head h1 { font-size: 21px; }
		.head p { display: none; }
		.composer { border-radius: var(--radius-md); }
		.address-fields { padding: 5px var(--space-4) 0; }
		.field.inline { grid-template-columns: 1fr; gap: 2px; padding: 10px 0; }
		.field.inline span { font-size: 10px; letter-spacing: .06em; text-transform: uppercase; }
		.field.inline input { padding: 0; min-height: 28px; }
		.message-field { padding: var(--space-3) var(--space-4); }
		.message-field textarea { min-height: 240px; font-size: 16px; line-height: 1.55; }
		.drop-zone, .attachments, .notice { margin-right: var(--space-4); margin-left: var(--space-4); }
		.drop-zone small { display: none; }
		.composer-footer { padding: 10px var(--space-4) calc(10px + env(safe-area-inset-bottom, 0px)); gap: var(--space-3); border-radius: 0 0 var(--radius-md) var(--radius-md); }
		.composer-footer .file-info { font-size: 11px; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
		.footer-actions { gap: 6px; }
		.footer-actions .save-draft, .footer-actions .send { min-height: 44px; white-space: nowrap; }
		.save-draft { padding: 0 10px; }
		.send { flex: 1; justify-content: center; min-height: 44px; min-width: 0; white-space: nowrap; padding: 0 14px; }
		.back { width: 38px; height: 38px; }
	}
</style>
