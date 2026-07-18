<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import { onMount } from 'svelte';

	let { data, form } = $props();

	let showPasswords = $state(false);
	let profileSaving = $state(false);
	let passwordSaving = $state(false);

	let storage = $state<{ used_bytes: number; quota_bytes: number; message_count: number; quota_messages: number } | null>(null);
	let storageLoading = $state(true);
	let storageError = $state<string | null>(null);

	function formatBytes(bytes: number): string {
		if (!bytes || bytes <= 0) return '0 B';
		const units = ['B', 'KB', 'MB', 'GB'];
		const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
		return `${(bytes / 1024 ** i).toFixed(i ? 1 : 0)} ${units[i]}`;
	}

	function formatCount(n: number): string {
		return new Intl.NumberFormat('en-US').format(n);
	}

	async function loadStorage() {
		storageLoading = true;
		storageError = null;
		try {
			const response = await fetch('/api/storage', { headers: { accept: 'application/json' } });
			if (!response.ok) throw new Error('Failed to load storage info.');
			storage = await response.json();
		} catch (err) {
			storageError = err instanceof Error ? err.message : 'Storage unavailable.';
		} finally {
			storageLoading = false;
		}
	}

	onMount(loadStorage);

	let usedRatio = $derived.by(() => {
		if (!storage || !storage.quota_bytes) return 0;
		return Math.min(1, storage.used_bytes / storage.quota_bytes);
	});
	let messageRatio = $derived.by(() => {
		if (!storage || !storage.quota_messages) return 0;
		return Math.min(1, storage.message_count / storage.quota_messages);
	});
	let overallRatio = $derived(Math.max(usedRatio, messageRatio));
	let usageLevel = $derived<'ok' | 'warn' | 'high'>(overallRatio >= 0.85 ? 'high' : overallRatio >= 0.6 ? 'warn' : 'ok');
</script>

<svelte:head><title>Settings · KRSZ Mail</title></svelte:head>

<section class="page">
	<header class="page-head">
		<div>
			<p class="eyebrow">Preferences</p>
			<h1>Settings</h1>
			<p class="subtitle">Manage your identity, password, and account access.</p>
		</div>
	</header>

	<div class="settings-grid">
		<aside class="overview card">
			<div class="account-mark" aria-hidden="true">
				<svg viewBox="0 0 24 24" fill="none"><path d="M20 21a8 8 0 0 0-16 0M12 13a5 5 0 1 0 0-10 5 5 0 0 0 0 10Z" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>
			</div>
			<div>
				<h2>{data.displayName || data.user.email.split('@')[0]}</h2>
				<p>{data.user.email}</p>
			</div>
			<div class="account-details">
				<div><span>Role</span><strong>{data.user.role === 'admin' ? 'Administrator' : 'Member'}</strong></div>
				<div><span>Member since</span><strong>{new Date(data.createdAt).toLocaleDateString()}</strong></div>
				<div><span>Mailbox</span><strong>Active</strong></div>
			</div>
		</aside>

		<div class="sections">
			<section class="card setting-card">
				<div class="section-heading">
					<div class="section-icon" aria-hidden="true">
						<svg viewBox="0 0 24 24" fill="none"><path d="M4 20c.8-3.5 3.7-6 8-6s7.2 2.5 8 6M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>
					</div>
					<div><h2>Profile</h2><p>This name is shown on messages you send.</p></div>
				</div>

				<form method="POST" action="?/profile" use:enhance={() => {
					profileSaving = true;
					return async ({ update, result }) => {
						await update();
						profileSaving = false;
						if (result.type === 'success') await invalidateAll();
					};
				}}>
					<label class="field">
						<span>Display name</span>
						<input name="display_name" type="text" maxlength="80" value={form?.action === 'profile' && form?.displayName !== undefined ? form.displayName : data.displayName} placeholder="Your name" autocomplete="name" />
					</label>
					{#if form?.action === 'profile' && form?.error}<div class="notice error" role="alert">{form.error}</div>{/if}
					{#if form?.action === 'profile' && form?.success}<div class="notice success" role="status">{form.success}</div>{/if}
					<div class="form-actions"><button class="btn btn-primary" type="submit" disabled={profileSaving}>{profileSaving ? 'Saving…' : 'Save profile'}</button></div>
				</form>
			</section>

			<section class="card setting-card">
				<div class="section-heading">
					<div class="section-icon" aria-hidden="true">
						<svg viewBox="0 0 24 24" fill="none"><rect x="4" y="10" width="16" height="11" rx="2" stroke="currentColor" stroke-width="1.7"/><path d="M8 10V7a4 4 0 1 1 8 0v3M12 15v2" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>
					</div>
					<div><h2>Password</h2><p>Use at least 6 characters and avoid reused passwords.</p></div>
				</div>

				<form method="POST" action="?/password" use:enhance={() => {
					passwordSaving = true;
					return async ({ update, result }) => {
						await update({ reset: result.type === 'success' });
						passwordSaving = false;
					};
				}}>
					<div class="password-grid">
						<label class="field full">
							<span>Current password</span>
							<input name="current_password" type={showPasswords ? 'text' : 'password'} required autocomplete="current-password" />
						</label>
						<label class="field">
							<span>New password</span>
							<input name="new_password" type={showPasswords ? 'text' : 'password'} minlength="6" maxlength="256" required autocomplete="new-password" />
						</label>
						<label class="field">
							<span>Confirm new password</span>
							<input name="confirm_password" type={showPasswords ? 'text' : 'password'} minlength="6" maxlength="256" required autocomplete="new-password" />
						</label>
					</div>
					<label class="toggle"><input type="checkbox" bind:checked={showPasswords} /><span>Show passwords</span></label>
					{#if form?.action === 'password' && form?.error}<div class="notice error" role="alert">{form.error}</div>{/if}
					{#if form?.action === 'password' && form?.success}<div class="notice success" role="status">{form.success}</div>{/if}
					<div class="form-actions"><button class="btn btn-primary" type="submit" disabled={passwordSaving}>{passwordSaving ? 'Changing…' : 'Change password'}</button></div>
				</form>
			</section>

			{#if data.user.role === 'admin'}
							<a class="admin-link card" href="/admin/users">
								<div class="section-icon"><svg viewBox="0 0 24 24" fill="none"><path d="M15 19a6 6 0 0 0-12 0M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm7-5h5m-2.5-2.5v5" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg></div>
								<div><strong>Administration</strong><span>Manage users, roles, passwords, sessions, and invitations.</span></div>
								<svg class="arrow" viewBox="0 0 24 24" fill="none"><path d="m9 18 6-6-6-6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
							</a>
						{/if}

						<section class="card setting-card storage-card">
							<div class="section-heading">
								<div class="section-icon" aria-hidden="true">
									<svg viewBox="0 0 24 24" fill="none"><path d="M4 13a8 8 0 0 1 16 0M4 13v3a2 2 0 0 0 2 2h1v-7H6a2 2 0 0 0-2 2Zm16 0v3a2 2 0 0 1-2 2h-1v-7h1a2 2 0 0 1 2 2ZM10 9h4M12 6v3" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>
								</div>
								<div><h2>Storage</h2><p>Quota covers messages and attachments stored for your mailbox.</p></div>
							</div>

							{#if storageLoading}
								<div class="storage-loading">Loading storage usage…</div>
							{:else if storageError}
								<div class="notice error" role="alert">{storageError} <button class="link-btn" type="button" onclick={loadStorage}>Retry</button></div>
							{:else if storage}
								<div class="storage-metric">
									<div class="metric-head">
										<strong>{formatBytes(storage.used_bytes)} <span class="of">of</span> {storage.quota_bytes ? formatBytes(storage.quota_bytes) : 'unlimited'}</strong>
										<span class="pct">{Math.round(overallRatio * 100)}%</span>
									</div>
									<div class="bar" data-level={usageLevel}>
										<div class="bar-fill" style="width: {Math.round(usedRatio * 100)}%"></div>
									</div>
									<div class="metric-sub">
										<span>{formatCount(storage.message_count)} of {storage.quota_messages ? formatCount(storage.quota_messages) : '∞'} messages</span>
										<span class="dot" aria-hidden="true">·</span>
										<span>{formatBytes(Math.max(storage.quota_bytes - storage.used_bytes, 0))} available</span>
									</div>
								</div>

								{#if usageLevel === 'high'}
									<div class="notice error" role="alert">
										Your mailbox is nearly full. Free up space by emptying Trash or deleting large messages — new mail will be rejected once the quota is reached.
									</div>
								{:else if usageLevel === 'warn'}
									<div class="notice warn" role="status">
										You're approaching your storage limit. Consider clearing Trash soon.
									</div>
								{/if}
							{/if}
						</section>

					</div>
				</div>
			</section>

<style>
	.page { width: min(100%, 1120px); margin: 0 auto; padding: var(--space-6); }
	.page-head { margin-bottom: var(--space-6); }
	.eyebrow { margin: 0 0 4px; color: var(--accent); font-size: 11px; font-weight: 700; letter-spacing: .12em; text-transform: uppercase; }
	.page-head h1 { margin: 0; font-size: clamp(26px, 3vw, 34px); font-weight: 600; letter-spacing: -.025em; }
	.subtitle { margin: 6px 0 0; color: var(--text-muted); font-size: 13px; }
	.settings-grid { display: grid; grid-template-columns: 245px minmax(0, 1fr); align-items: start; gap: var(--space-5); }
	.overview { position: sticky; top: calc(var(--header-height) + var(--space-6)); padding: var(--space-5); }
	.account-mark { width: 48px; height: 48px; display: grid; place-items: center; margin-bottom: var(--space-4); border-radius: var(--radius-lg); background: var(--accent-subtle); color: var(--accent); }
	.account-mark svg { width: 25px; height: 25px; }
	.overview h2 { margin: 0; font-size: 17px; font-weight: 600; word-break: break-word; }
	.overview p { margin: 4px 0 0; color: var(--text-muted); font-size: 12px; word-break: break-all; }
	.account-details { display: grid; gap: 12px; margin-top: var(--space-5); padding-top: var(--space-4); border-top: 1px solid var(--border); }
	.account-details div { display: grid; gap: 2px; }
	.account-details span { color: var(--text-muted); font-size: 10px; letter-spacing: .07em; text-transform: uppercase; }
	.account-details strong { color: var(--text-secondary); font-size: 12px; font-weight: 500; }
	.sections { display: grid; gap: var(--space-5); }
	.admin-link { display:grid; grid-template-columns:36px minmax(0,1fr) auto; align-items:center; gap:var(--space-3); padding:var(--space-4) var(--space-5); }
	.admin-link:hover { border-color:var(--border-hover); background:var(--bg-elevated); }
	.admin-link strong,.admin-link span { display:block; }.admin-link strong { font-size:14px; }.admin-link span { margin-top:3px; color:var(--text-muted); font-size:11px; }.admin-link .arrow { width:18px; color:var(--text-muted); }
	.setting-card { padding: var(--space-5); }
	.section-heading { display: flex; align-items: flex-start; gap: var(--space-3); margin-bottom: var(--space-5); }
	.section-icon { width: 36px; height: 36px; flex: none; display: grid; place-items: center; border: 1px solid var(--border); border-radius: var(--radius-md); color: var(--accent); background: var(--bg-elevated); }
	.section-icon svg { width: 19px; height: 19px; }
	.section-heading h2 { margin: 0; font-size: 16px; font-weight: 600; }
	.section-heading p { margin: 3px 0 0; color: var(--text-muted); font-size: 12px; }

	.field { display: grid; gap: 7px; }
	.field span { color: var(--text-secondary); font-size: 12px; font-weight: 500; }
	.field input { width: 100%; min-height: 42px; }
	.password-grid { display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-4); }
	.password-grid .full { grid-column: 1 / -1; }
	.toggle { display: inline-flex; align-items: center; gap: 8px; margin-top: var(--space-3); color: var(--text-muted); font-size: 12px; cursor: pointer; }
	.toggle input { width: 15px; height: 15px; margin: 0; accent-color: var(--accent); }
	.form-actions { display: flex; justify-content: flex-end; margin-top: var(--space-4); padding-top: var(--space-4); border-top: 1px solid var(--border); }
	.btn:disabled { opacity: .55; cursor: wait; box-shadow: none; }

	.notice { margin-top: var(--space-3); padding: 10px 12px; border: 1px solid; border-radius: var(--radius-md); font-size: 12px; }
	.notice.error { border-color: rgba(255,80,80,.3); background: rgba(255,80,80,.08); color: #ff9b9b; }
	.notice.success { border-color: rgba(80,200,120,.3); background: rgba(80,200,120,.08); color: #82d9a6; }

	.storage-card .section-heading { margin-bottom: var(--space-4); }
		.storage-loading { color: var(--text-muted); font-size: 12px; }
		.storage-metric { display: grid; gap: 10px; }
		.metric-head { display: flex; justify-content: space-between; align-items: baseline; gap: var(--space-3); }
		.metric-head strong { font-size: 14px; font-weight: 600; letter-spacing: -.01em; }
		.metric-head .of { color: var(--text-muted); font-weight: 400; }
		.metric-head .pct { font-size: 12px; color: var(--text-muted); font-variant-numeric: tabular-nums; }
		.bar { height: 8px; border-radius: 999px; background: var(--bg-elevated); overflow: hidden; border: 1px solid var(--border); }
		.bar-fill { height: 100%; background: var(--accent); transition: width .25s ease; }
		.bar[data-level='warn'] .bar-fill { background: #f5a524; }
		.bar[data-level='high'] .bar-fill { background: #f25555; }
		.metric-sub { display: flex; flex-wrap: wrap; gap: 6px; color: var(--text-muted); font-size: 11px; }
		.metric-sub .dot { opacity: .6; }
		.notice.warn { border-color: rgba(245,165,36,.3); background: rgba(245,165,36,.08); color: #f5c97b; }
		.link-btn { background: none; border: 0; padding: 0; color: inherit; text-decoration: underline; cursor: pointer; font: inherit; }

		@media (max-width: 800px) {
			.page { padding: var(--space-4) var(--space-4) calc(72px + var(--space-4) + env(safe-area-inset-bottom, 0px)); }
			.settings-grid { grid-template-columns: 1fr; }
			.overview { position: static; display: grid; grid-template-columns: auto 1fr; align-items: center; column-gap: var(--space-3); }
			.account-mark { margin: 0; }
			.account-details { grid-column: 1 / -1; grid-template-columns: repeat(3, 1fr); }
		}
		@media (max-width: 560px) {
			.page { padding: var(--space-3) 10px calc(72px + var(--space-3) + env(safe-area-inset-bottom, 0px)); }
			.setting-card, .overview { padding: var(--space-4); }
			.password-grid { grid-template-columns: 1fr; }
			.password-grid .full { grid-column: auto; }

			.account-details { grid-template-columns: 1fr; }
		}
</style>
