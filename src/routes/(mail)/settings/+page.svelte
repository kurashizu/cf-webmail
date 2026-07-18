<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import { onMount } from 'svelte';

	let { data, form } = $props();
	let generating = $state(false);
	let generated = $state<string | null>(null);
	let copied = $state(false);
	let invites = $state<any[]>([]);
	let inviteError = $state<string | null>(null);
	let showPasswords = $state(false);
	let profileSaving = $state(false);
	let passwordSaving = $state(false);

	async function loadInvites() {
		try {
			const response = await fetch('/api/invites');
			if (!response.ok) throw new Error();
			const result = await response.json();
			invites = result.invites || [];
		} catch {
			inviteError = 'Could not load invite codes.';
		}
	}

	async function createInvite() {
		generating = true;
		inviteError = null;
		generated = null;
		copied = false;
		try {
			const response = await fetch('/api/invites', { method: 'POST' });
			const result = await response.json();
			if (!response.ok) throw new Error(result.message || 'Failed to create invite');
			generated = result.code;
			await loadInvites();
		} catch (error) {
			inviteError = error instanceof Error ? error.message : 'Failed to create invite.';
		} finally {
			generating = false;
		}
	}

	async function copyInvite() {
		if (!generated) return;
		try {
			await navigator.clipboard.writeText(generated);
			copied = true;
			setTimeout(() => (copied = false), 1800);
		} catch {
			inviteError = 'Could not copy the code. Select and copy it manually.';
		}
	}

	onMount(() => {
		if (data.user.role === 'admin') loadInvites();
	});
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
					<div><strong>User management</strong><span>Manage accounts, access, and mailbox data.</span></div>
					<svg class="arrow" viewBox="0 0 24 24" fill="none"><path d="m9 18 6-6-6-6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
				</a>
			{/if}

			{#if data.user.role === 'admin'}
				<section class="card setting-card">
					<div class="section-heading invite-heading">
						<div class="section-icon" aria-hidden="true">
							<svg viewBox="0 0 24 24" fill="none"><path d="M15 19a6 6 0 0 0-12 0M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM17 8v6M14 11h6" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>
						</div>
						<div><h2>Invitations</h2><p>Generate single-use codes for new KRSZ Mail accounts.</p></div>
						<button class="btn btn-primary" type="button" onclick={createInvite} disabled={generating}>
							<svg class="button-icon" viewBox="0 0 24 24" fill="none"><path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
							{generating ? 'Generating…' : 'New invite'}
						</button>
					</div>

					{#if generated}
						<div class="generated">
							<div><span>New invite code</span><code>{generated}</code></div>
							<button class="btn btn-ghost copy" type="button" onclick={copyInvite}>
								<svg class="button-icon" viewBox="0 0 24 24" fill="none"><rect x="8" y="8" width="11" height="11" rx="2" stroke="currentColor" stroke-width="1.7"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" stroke="currentColor" stroke-width="1.7"/></svg>
								{copied ? 'Copied' : 'Copy'}
							</button>
						</div>
					{/if}
					{#if inviteError}<div class="notice error" role="alert">{inviteError}</div>{/if}

					{#if invites.length}
						<div class="table-wrap"><table>
							<thead><tr><th>Created</th><th>Assigned address</th><th>Status</th></tr></thead>
							<tbody>{#each invites as invite (invite.code_hash)}
								<tr>
									<td>{new Date(invite.created_at).toLocaleString()}</td>
									<td>{invite.local_part ? `${invite.local_part}@krsz.in` : 'Any available address'}</td>
									<td>{#if invite.consumed_at}<span class="status used">Used</span>{:else if invite.expires_at && invite.expires_at < Date.now()}<span class="status expired">Expired</span>{:else}<span class="status active">Active</span>{/if}</td>
								</tr>
							{/each}</tbody>
						</table></div>
					{/if}
				</section>
			{/if}
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
	.invite-heading .btn { margin-left: auto; white-space: nowrap; }
	.field { display: grid; gap: 7px; }
	.field span { color: var(--text-secondary); font-size: 12px; font-weight: 500; }
	.field input { width: 100%; min-height: 42px; }
	.password-grid { display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-4); }
	.password-grid .full { grid-column: 1 / -1; }
	.toggle { display: inline-flex; align-items: center; gap: 8px; margin-top: var(--space-3); color: var(--text-muted); font-size: 12px; cursor: pointer; }
	.toggle input { width: 15px; height: 15px; margin: 0; accent-color: var(--accent); }
	.form-actions { display: flex; justify-content: flex-end; margin-top: var(--space-4); padding-top: var(--space-4); border-top: 1px solid var(--border); }
	.btn:disabled { opacity: .55; cursor: wait; box-shadow: none; }
	.button-icon { width: 16px; height: 16px; }
	.notice { margin-top: var(--space-3); padding: 10px 12px; border: 1px solid; border-radius: var(--radius-md); font-size: 12px; }
	.notice.error { border-color: rgba(255,80,80,.3); background: rgba(255,80,80,.08); color: #ff9b9b; }
	.notice.success { border-color: rgba(80,200,120,.3); background: rgba(80,200,120,.08); color: #82d9a6; }
	.generated { display: flex; align-items: center; justify-content: space-between; gap: var(--space-4); margin-bottom: var(--space-4); padding: var(--space-3) var(--space-4); border: 1px solid rgba(255,107,53,.28); border-radius: var(--radius-md); background: var(--accent-subtle); }
	.generated div { min-width: 0; display: grid; gap: 4px; }
	.generated span { color: var(--text-muted); font-size: 10px; letter-spacing: .07em; text-transform: uppercase; }
	.generated code { overflow: hidden; color: var(--text-primary); font-size: 14px; text-overflow: ellipsis; }
	.copy { flex: none; }
	.table-wrap { overflow-x: auto; }
	table { width: 100%; border-collapse: collapse; font-size: 12px; }
	th, td { padding: 10px 8px; text-align: left; border-bottom: 1px solid var(--border); white-space: nowrap; }
	th { color: var(--text-muted); font-size: 10px; font-weight: 600; letter-spacing: .06em; text-transform: uppercase; }
	td { color: var(--text-secondary); }
	.status { padding: 3px 8px; border-radius: var(--radius-full); font-size: 9px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; }
	.status.active { background: rgba(80,200,120,.14); color: #82d9a6; }
	.status.used { background: var(--bg-elevated); color: var(--text-muted); }
	.status.expired { background: rgba(255,80,80,.1); color: #ff9292; }
	@media (max-width: 800px) {
		.page { padding: var(--space-4); }
		.settings-grid { grid-template-columns: 1fr; }
		.overview { position: static; display: grid; grid-template-columns: auto 1fr; align-items: center; column-gap: var(--space-3); }
		.account-mark { margin: 0; }
		.account-details { grid-column: 1 / -1; grid-template-columns: repeat(3, 1fr); }
	}
	@media (max-width: 560px) {
		.page { padding: 14px 10px; }
		.setting-card, .overview { padding: var(--space-4); }
		.password-grid { grid-template-columns: 1fr; }
		.password-grid .full { grid-column: auto; }
		.invite-heading { flex-wrap: wrap; }
		.invite-heading .btn { width: 100%; justify-content: center; margin-left: 0; }
		.generated { align-items: stretch; flex-direction: column; }
		.copy { justify-content: center; }
		.account-details { grid-template-columns: 1fr; }
	}
</style>
