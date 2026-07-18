<script lang="ts">
	import { enhance } from '$app/forms';
	let { data, form } = $props();
	let fileInput: HTMLInputElement;
	let files = $state<File[]>([]);
	let sending = $state(false);
	let dragActive = $state(false);

	const totalSize = $derived(files.reduce((total, file) => total + file.size, 0));

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
</script>

<svelte:head><title>Compose · KRSZ Mail</title></svelte:head>

<section class="page">
	<header class="head">
		<a class="back" href="/inbox" aria-label="Cancel and return to Inbox">
			<svg viewBox="0 0 24 24" fill="none"><path d="m15 18-6-6 6-6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
		</a>
		<div><p>Compose</p><h1>New message</h1></div>
	</header>

	<form method="POST" action="?/send" enctype="multipart/form-data" class="composer" use:enhance={() => {
		sending = true;
		return async ({ update }) => {
			await update();
			sending = false;
		};
	}}>
		<div class="address-fields">
			<label class="field inline"><span>From</span><input type="text" value={data.user.email} disabled /></label>
			<label class="field inline"><span>To</span><input type="text" name="to" value={data.prefill.to} placeholder="friend@example.com" required autocomplete="off" /></label>
			<label class="field inline subject"><span>Subject</span><input type="text" name="subject" value={data.prefill.subject} placeholder="What is this about?" required /></label>
		</div>

		<label class="message-field">
			<span class="sr-only">Message</span>
			<textarea name="body" rows="15" placeholder="Write your message…" required></textarea>
		</label>

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
			ondrop={(event) => { event.preventDefault(); dragActive = false; chooseFiles(event.dataTransfer.files); }}
		>
			<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m9 12 5-5a3 3 0 0 1 4 4l-7 7a5 5 0 0 1-7-7l7-7" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>
			<span>Attach files or drag them here</span><small>Up to 25 MB total</small>
		</div>

		{#if files.length}
			<ul class="attachments" aria-label="Selected attachments">
				{#each files as file, index (`${file.name}-${file.size}`)}
					<li>
						<div class="file-icon"><svg viewBox="0 0 24 24" fill="none"><path d="M6 3h8l4 4v14H6V3Zm8 0v5h4" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg></div>
						<div><strong>{file.name}</strong><span>{formatSize(file.size)}</span></div>
						<button type="button" onclick={() => removeFile(index)} aria-label={`Remove ${file.name}`} title="Remove attachment">×</button>
					</li>
				{/each}
			</ul>
		{/if}

		{#if form?.error}<div class="notice error" role="alert">{form.error}</div>{/if}

		<footer class="composer-footer">
			<span class:over-limit={totalSize > 26_214_400}>{files.length ? `${files.length} ${files.length === 1 ? 'file' : 'files'} · ${formatSize(totalSize)}` : 'No attachments'}</span>
			<button class="btn btn-primary send" type="submit" disabled={sending || totalSize > 26_214_400}>
				<svg viewBox="0 0 24 24" fill="none"><path d="m21 3-7.5 18-3.1-7.4L3 10.5 21 3Zm-10.6 10.6L21 3" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
				{sending ? 'Sending…' : 'Send message'}
			</button>
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
	.attachments button:hover { background: rgba(255,80,80,.1); color: #ff9696; }
	.notice { margin: 0 var(--space-5) var(--space-4); padding: 10px 12px; border-radius: var(--radius-md); font-size: 12px; }
	.notice.error { border: 1px solid rgba(255,80,80,.3); background: rgba(255,80,80,.08); color: #ff9b9b; }
	.composer-footer { display: flex; align-items: center; justify-content: space-between; gap: var(--space-4); padding: var(--space-3) var(--space-5); border-top: 1px solid var(--border); background: var(--bg-card); }
	.composer-footer > span { color: var(--text-muted); font-size: 10px; }
	.over-limit { color: #ff8888 !important; }
	.send { padding: 10px 17px; }
	.send svg { width: 17px; height: 17px; }
	.send:disabled { opacity: .55; cursor: wait; }
	@media (max-width: 600px) {
		.page { padding: 14px 10px; }
		.address-fields, .message-field { padding-right: var(--space-4); padding-left: var(--space-4); }
		.drop-zone, .attachments, .notice { margin-right: var(--space-4); margin-left: var(--space-4); }
		.drop-zone small { display: none; }
		.composer-footer { padding: 10px var(--space-4); }
		.send { flex: 1; justify-content: center; }
	}
</style>
