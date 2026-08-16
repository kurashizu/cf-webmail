<script lang="ts">
	import { onMount } from 'svelte';
	import { t, type Locale } from '$lib/i18n';
	let { data } = $props();
	const tt = (key: string, params?: Record<string, string | number>) =>
		t(data.locale as Locale, key, params);
	let users = $state<any[]>([]);
	let invites = $state<any[]>([]);
	let tab = $state<'users' | 'invites'>('users');
	let query = $state('');
	let status = $state('all');
	let loading = $state(true);
	let busy = $state<string | null>(null);
	let busyLabel = $state('');
	let message = $state<{ kind: 'error' | 'success'; text: string } | null>(null);
	let selected = $state<any | null>(null);
	let modal = $state<'invite' | 'password' | 'delete' | null>(null);
	let inviteLocalPart = $state('');
	let inviteExpiry = $state('168');
	let inviteNotes = $state('');
	let generated = $state<any | null>(null);
	let newPassword = $state('');
	let deleteConfirmation = $state('');
	let copied = $state('');

	const filteredUsers = $derived(
		users.filter((user) => {
			const text = `${user.email} ${user.display_name || ''}`.toLowerCase();
			const matchesQuery = !query.trim() || text.includes(query.trim().toLowerCase());
			const matchesStatus =
				status === 'all' ||
				status === user.role ||
				(status === 'disabled' ? user.disabled : status === 'active' ? !user.disabled : true);
			return matchesQuery && matchesStatus;
		})
	);

	const filteredInvites = $derived(
		invites.filter((invite) => {
			const text = `${invite.local_part || ''} ${invite.notes || ''} ${invite.consumed_by_email || ''}`.toLowerCase();
			const inviteStatus = invite.consumed_at
				? 'used'
				: invite.expires_at && invite.expires_at < Date.now()
					? 'expired'
					: 'active';
			return (
				(!query.trim() || text.includes(query.trim().toLowerCase())) &&
				(status === 'all' || status === inviteStatus)
			);
		})
	);

	const stats = $derived({
		users: users.length,
		active: users.filter((u) => !u.disabled).length,
		unread: users.reduce((sum, u) => sum + Number(u.unread_count || 0), 0),
		invites: invites.filter(
			(i) => !i.consumed_at && (!i.expires_at || i.expires_at >= Date.now())
		).length
	});

	async function requestJson(url: string, options: RequestInit = {}): Promise<any> {
		const controller = new AbortController();
		const timeout = setTimeout(() => controller.abort(), 15_000);
		try {
			const response = await fetch(url, {
				...options,
				signal: options.signal || controller.signal
			});
			const result: any = await response.json().catch(() => ({}));
			if (!response.ok)
				throw new Error(result.message || result.error?.message || 'Action failed.');
			return result;
		} catch (error) {
			if (error instanceof DOMException && error.name === 'AbortError')
				throw new Error('The request timed out. Please try again.');
			throw error;
		} finally {
			clearTimeout(timeout);
		}
	}

	async function loadData() {
		loading = true;
		message = null;
		try {
			const [userResult, inviteResult] = await Promise.all([
				requestJson('/api/admin/users'),
				requestJson('/api/invites')
			]);
			users = userResult.users || [];
			invites = inviteResult.invites || [];
		} catch (error) {
			showError(error);
		} finally {
			loading = false;
		}
	}

	function showError(error: unknown) {
		message = {
			kind: 'error',
			text: error instanceof Error ? error.message : 'Action failed.'
		};
	}
	function showSuccess(text: string) {
		message = { kind: 'success', text };
	}
	function openUser(user: any) {
		selected = { ...user };
		modal = null;
		message = null;
	}
	function closePanel() {
		selected = null;
		modal = null;
		newPassword = '';
		deleteConfirmation = '';
	}

	async function userAction(action: string, extra: Record<string, unknown> = {}) {
		if (!selected) return;
		busy = selected.id;
		busyLabel =
			action === 'update'
				? 'Saving changes…'
				: action === 'reset_password'
					? 'Resetting password…'
					: action === 'revoke_sessions'
						? 'Signing out user…'
						: action === 'disable'
							? 'Disabling mailbox…'
							: 'Enabling mailbox…';
		message = null;
		try {
			const result = await requestJson('/api/admin/users', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ id: selected.id, action, ...extra })
			});
			if (result.user) Object.assign(selected, result.user);
			const index = users.findIndex((u) => u.id === selected.id);
			if (index >= 0) users[index] = { ...users[index], ...result.user };
			users = [...users];
			showSuccess(
				action === 'reset_password'
					? 'Password reset. Existing sessions were signed out.'
					: action === 'revoke_sessions'
						? 'All sessions revoked.'
						: 'Account updated.'
			);
			if (action === 'reset_password') {
				modal = null;
				newPassword = '';
			}
		} catch (error) {
			showError(error);
		} finally {
			busy = null;
			busyLabel = '';
		}
	}

	async function deleteUser() {
		if (!selected) return;
		busy = selected.id;
		busyLabel = 'Deleting account…';
		message = null;
		try {
			await requestJson('/api/admin/users', {
				method: 'DELETE',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ id: selected.id, confirmation: deleteConfirmation })
			});
			users = users.filter((u) => u.id !== selected.id);
			closePanel();
			showSuccess('Account and mailbox data permanently deleted.');
		} catch (error) {
			showError(error);
		} finally {
			busy = null;
			busyLabel = '';
		}
	}

	async function createInvite() {
		busy = 'invite';
		busyLabel = 'Creating invitation…';
		message = null;
		try {
			const result = await requestJson('/api/invites', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					local_part: inviteLocalPart,
					expires_in_hours: inviteExpiry ? Number(inviteExpiry) : null,
					notes: inviteNotes
				})
			});
			generated = result;
			modal = null;
			inviteLocalPart = '';
			inviteNotes = '';
			await refreshInvites();
			showSuccess('Invitation created. Save the code now—it cannot be shown again.');
		} catch (error) {
			showError(error);
		} finally {
			busy = null;
			busyLabel = '';
		}
	}

	async function refreshInvites() {
		invites = (await requestJson('/api/invites')).invites || [];
	}

	async function deleteInvite(invite: any) {
		if (!confirm('Revoke and delete this invitation?')) return;
		busy = invite.code_hash;
		busyLabel = 'Revoking invitation…';
		try {
			await requestJson('/api/invites', {
				method: 'DELETE',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ code_hash: invite.code_hash })
			});
			invites = invites.filter((i) => i.code_hash !== invite.code_hash);
			showSuccess('Invitation revoked.');
		} catch (error) {
			showError(error);
		} finally {
			busy = null;
			busyLabel = '';
		}
	}

	async function copy(value: string, key: string) {
		try {
			await navigator.clipboard.writeText(value);
			copied = key;
			setTimeout(() => (copied = ''), 1600);
		} catch {
			message = { kind: 'error', text: tt('admin.users.copyError') };
		}
	}

	function formatBytes(bytes: number) {
		if (!bytes) return '0 B';
		const units = ['B', 'KB', 'MB', 'GB'];
		const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), 3);
		return `${(bytes / 1024 ** i).toFixed(i ? 1 : 0)} ${units[i]}`;
	}

	function switchTab(next: 'users' | 'invites') {
		tab = next;
		status = 'all';
		query = '';
		message = null;
	}

	onMount(loadData);
</script>

<svelte:head>
	<title>{tt('admin.users.title')} · {tt('common.brandName')}</title>
</svelte:head>

<section class="page">
	<header class="page-head">
		<div>
			<p class="eyebrow">{tt('common.brandName')}</p>
			<h1>{tt('admin.users.title')}</h1>
			<p class="subtitle">{tt('admin.users.subtitle')}</p>
		</div>
		<a class="btn btn-ghost" href="/settings">{tt('common.back')}</a>
	</header>

	<div class="stats">
		<div class="stat card">
			<span>{tt('admin.users.stats.users')}</span>
			<strong>{stats.users}</strong>
		</div>
		<div class="stat card">
			<span>{tt('admin.users.stats.active')}</span>
			<strong>{stats.active}</strong>
		</div>
		<div class="stat card">
			<span>{tt('admin.users.stats.unread')}</span>
			<strong>{stats.unread}</strong>
		</div>
		<div class="stat card">
			<span>{tt('admin.users.stats.invites')}</span>
			<strong>{stats.invites}</strong>
		</div>
	</div>

	{#if message}
		<div class="notice {message.kind}" role="status">
			{message.text}
			<button aria-label={tt('common.dismiss')} onclick={() => (message = null)}>×</button>
		</div>
	{/if}

	<div class="control card">
		<div class="tabs">
			<button class:active={tab === 'users'} onclick={() => switchTab('users')}>
				{tt('admin.users.tabUsers')}<span>{users.length}</span>
			</button>
			<button class:active={tab === 'invites'} onclick={() => switchTab('invites')}>
				{tt('admin.users.tabInvites')}<span>{stats.invites}</span>
			</button>
		</div>
		<div class="tools">
			<label class="search">
				<svg viewBox="0 0 24 24" fill="none"
					><circle cx="11" cy="11" r="7" stroke="currentColor" stroke-width="1.7" />
					<path d="m16.5 16.5 4 4" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"
					/></svg
				>
				<input
					bind:value={query}
					placeholder={tab === 'users'
						? tt('admin.users.searchUsers')
						: tt('admin.users.searchInvites')}
				/>
			</label>
			<select bind:value={status}>
				{#if tab === 'users'}
					<option value="all">{tt('admin.users.filterAll')}</option>
					<option value="active">{tt('admin.users.filterActive')}</option>
					<option value="disabled">{tt('admin.users.filterDisabled')}</option>
					<option value="admin">{tt('admin.users.filterAdmin')}</option>
					<option value="user">{tt('admin.users.filterMember')}</option>
				{:else}
					<option value="all">{tt('admin.users.filterAll')}</option>
					<option value="active">{tt('admin.users.filterActive')}</option>
					<option value="used">{tt('admin.users.filterUsed')}</option>
					<option value="expired">{tt('admin.users.filterExpired')}</option>
				{/if}
			</select>
			{#if tab === 'invites'}
				<button class="btn btn-primary" onclick={() => (modal = 'invite')}>
					<svg viewBox="0 0 24 24" fill="none"
						><path
							d="M12 5v14M5 12h14"
							stroke="currentColor"
							stroke-width="2"
							stroke-linecap="round"
						/></svg
					>
					{tt('admin.users.actionInviting')}
				</button>
			{/if}
		</div>
	</div>

	{#if generated}
		<div class="generated card">
			<div>
				<span>{tt('admin.users.invite.codeHeading')}</span>
				<code>{generated.code}</code>
				<small
					>{generated.local_part
						? tt('admin.users.reservedFor', { local: generated.local_part, domain: 'krsz.in' })
						: tt('admin.users.recipientChooses')}</small
				>
			</div>
			<div>
				<button class="btn btn-primary" onclick={() => copy(generated.code, 'code')}>
					{copied === 'code' ? tt('common.copied') : tt('admin.users.invite.copyCode')}
				</button>
				<button
					class="btn btn-ghost"
					onclick={() => copy(`${location.origin}/register?invite=${generated.code}`, 'link')}
				>
					{copied === 'link' ? tt('common.copied') : tt('admin.users.invite.copyLink')}
				</button>
				<button class="icon-btn" aria-label={tt('common.dismiss')} onclick={() => (generated = null)}
					>×</button
				>
			</div>
		</div>
	{/if}

	{#if loading}
		<div class="loading">{tt('common.loading')}</div>
	{:else if tab === 'users'}
		<div class="table-card card">
			<div class="table-wrap">
				<table>
					<thead>
						<tr>
							<th>{tt('admin.users.colUser')}</th>
							<th>{tt('admin.users.colRole')}</th>
							<th>{tt('admin.users.colMailbox')}</th>
							<th>{tt('admin.users.colStorage')}</th>
							<th>{tt('admin.users.colLastMail')}</th>
							<th>{tt('admin.users.colStatus')}</th>
							<th></th>
						</tr>
					</thead>
					<tbody>
						{#each filteredUsers as user (user.id)}
							<tr class:disabled={user.disabled}>
								<td>
									<strong>{user.display_name || user.local_part}</strong>
									<span>{user.email}</span>
								</td>
								<td>
									<span class="badge role"
										>{user.role === 'admin'
											? tt('admin.users.roleAdmin')
											: tt('admin.users.roleUser')}</span
									>
								</td>
								<td>
									{tt('admin.users.messagesBadge', { count: user.message_count || 0 })}
									<br />
									<small>{tt('admin.users.unreadBadge', { count: user.unread_count || 0 })}</small>
								</td>
								<td>{formatBytes(Number(user.storage_bytes || 0))}</td>
								<td
									>{user.last_message_at
										? new Date(user.last_message_at).toLocaleDateString()
										: tt('admin.users.lastMailNever')}</td
								>
								<td>
									<span class="badge" class:off={user.disabled}
										>{user.disabled
											? tt('admin.users.statusDisabled')
											: tt('admin.users.statusActive')}</span
									>
								</td>
								<td>
									<button class="btn btn-ghost" onclick={() => openUser(user)}
										>{user.id === data.user.accountId
											? tt('admin.users.openUserSelf')
											: tt('admin.users.openUser')}</button
									>
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
			{#if !filteredUsers.length}
				<div class="empty">{tt('admin.users.emptyUsers')}</div>
			{/if}
		</div>
	{:else}
		<div class="table-card card">
			<div class="table-wrap">
				<table>
					<thead>
						<tr>
							<th>{tt('admin.users.colInvitation')}</th>
							<th>{tt('admin.users.colCreated')}</th>
							<th>{tt('admin.users.colExpires')}</th>
							<th>{tt('admin.users.colUsedBy')}</th>
							<th>{tt('admin.users.colStatus')}</th>
							<th></th>
						</tr>
					</thead>
					<tbody>
						{#each filteredInvites as invite (invite.code_hash)}
							{@const inviteStatus = invite.consumed_at
								? 'used'
								: invite.expires_at && invite.expires_at < Date.now()
									? 'expired'
									: 'active'}
							<tr>
								<td>
									<strong
										>{invite.local_part
											? `${invite.local_part}@krsz.in`
											: tt('admin.users.anyAddress')}</strong
									>
									<span>{invite.notes || tt('admin.users.notesNone')}</span>
								</td>
								<td>
									{new Date(invite.created_at).toLocaleString()}<br />
									<small
										>{tt('admin.users.createdBy', {
											email: invite.created_by_email || tt('admin.users.createdByAdmin')
										})}</small
									>
								</td>
								<td
									>{invite.expires_at
										? new Date(invite.expires_at).toLocaleString()
										: tt('admin.users.lastMailNever')}</td
								>
								<td>{invite.consumed_by_email || '—'}</td>
								<td>
									<span class="badge {inviteStatus}"
										>{inviteStatus === 'used'
											? tt('admin.users.statusUsed')
											: inviteStatus === 'expired'
												? tt('admin.users.statusExpired')
												: tt('admin.users.statusActive')}</span
									>
								</td>
								<td>
									{#if !invite.consumed_at}
										<button
											class="btn danger"
											disabled={busy === invite.code_hash}
											onclick={() => deleteInvite(invite)}
											>{inviteStatus === 'active'
												? tt('admin.users.revokeButton')
												: tt('admin.users.deleteInviteButton')}</button
										>
									{:else}
										<span class="muted">{tt('admin.users.statusRetained')}</span>
									{/if}
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
			{#if !filteredInvites.length}
				<div class="empty">{tt('admin.users.emptyInvites')}</div>
			{/if}
		</div>
	{/if}
</section>

{#if selected}
	<div
		class="backdrop"
		role="presentation"
		onclick={(e) => e.target === e.currentTarget && closePanel()}
	>
		<aside class="panel" aria-label="User details">
			<header>
				<div>
					<span>Mailbox account</span>
					<h2>{selected.email}</h2>
				</div>
				<button class="icon-btn" onclick={closePanel} aria-label="Close">×</button>
			</header>
			<div class="panel-body">
				<div class="identity">
					<div class="avatar">
						{(selected.display_name || selected.local_part).slice(0, 2).toUpperCase()}
					</div>
					<div>
						<strong>{selected.display_name || selected.local_part}</strong>
						<span>Created {new Date(selected.created_at).toLocaleString()}</span>
					</div>
					<span class="badge" class:off={selected.disabled}
						>{selected.disabled ? 'Disabled' : 'Active'}</span
					>
				</div>

				<div class="metrics">
					<div>
						<span>Messages</span>
						<strong>{selected.message_count || 0}</strong>
					</div>
					<div>
						<span>Unread</span>
						<strong>{selected.unread_count || 0}</strong>
					</div>
					<div>
						<span>Storage</span>
						<strong>{formatBytes(Number(selected.storage_bytes || 0))}</strong>
					</div>
					<div>
						<span>Session</span>
						<strong>{selected.has_session ? 'Signed in' : 'None'}</strong>
					</div>
				</div>

				<section>
					<h3>Account details</h3>
					<label
						>Display name<input
							bind:value={selected.display_name}
							maxlength="80"
						/></label
					>
					<label
						>Role<select
							bind:value={selected.role}
							disabled={selected.id === data.user.accountId}
							><option value="user">Member</option>
							<option value="admin">Administrator</option></select
						></label
					>
					<p class="help">Changing a role signs the user out so their permissions refresh.</p>
					<button
						class="btn btn-primary"
						disabled={busy === selected.id}
						onclick={() =>
							userAction('update', { display_name: selected.display_name, role: selected.role })}
						>Save changes</button
					>
				</section>

				{#if selected.id !== data.user.accountId}
					<section>
						<h3>Access and security</h3>
						<div class="action-row">
							<div>
								<strong>{selected.disabled ? 'Enable mailbox' : 'Disable mailbox'}</strong>
								<span
									>{selected.disabled
										? 'Allow this user to sign in again.'
										: 'Immediately signs out and blocks login.'}</span
								>
							</div>
							<button
								class="btn btn-ghost"
								onclick={() => userAction(selected.disabled ? 'enable' : 'disable')}
								>{selected.disabled ? 'Enable' : 'Disable'}</button
							>
						</div>
						<div class="action-row">
							<div>
								<strong>Reset password</strong>
								<span>Set a temporary password and sign out existing sessions.</span>
							</div>
							<button class="btn btn-ghost" onclick={() => (modal = 'password')}>Reset</button>
						</div>
						<div class="action-row">
							<div>
								<strong>Force sign out</strong>
								<span>Revoke the currently active session.</span>
							</div>
							<button
								class="btn btn-ghost"
								disabled={!selected.has_session}
								onclick={() => userAction('revoke_sessions')}>Sign out</button
							>
						</div>
					</section>

					<section class="danger-zone">
						<h3>Danger zone</h3>
						<p>
							Permanently delete the account, all messages, attachments, and mailbox data.
						</p>
						<button class="btn danger" onclick={() => (modal = 'delete')}>Delete account</button>
					</section>
				{:else}
					<div class="self-note">
						This is your account. Manage your password and session from Settings.
					</div>
				{/if}
			</div>
		</aside>
	</div>
{/if}

{#if modal}
	<div class="modal-backdrop" role="presentation">
		<div class="modal card">
			<header>
				<h2>
					{modal === 'invite'
						? 'Create invitation'
						: modal === 'password'
							? 'Reset password'
							: 'Delete account'}
				</h2>
				<button class="icon-btn" onclick={() => (modal = null)}>×</button>
			</header>

			{#if modal === 'invite'}
				<p>Create a single-use invitation. You can optionally reserve a mailbox address.</p>
				<label
					>Reserved address (optional)
					<div class="address">
						<input bind:value={inviteLocalPart} placeholder="username" />
						<span>@krsz.in</span>
					</div></label
				>
				<label
					>Expires<select bind:value={inviteExpiry}
						><option value="24">24 hours</option>
						<option value="168">7 days</option>
						<option value="720">30 days</option>
						<option value="">Never</option></select
					></label
				>
				<label
					>Internal notes (optional)<textarea
						bind:value={inviteNotes}
						maxlength="240"
						placeholder="Who this invitation is for"
					></textarea></label
				>
				<footer>
					<button class="btn btn-ghost" onclick={() => (modal = null)}>Cancel</button>
					<button
						class="btn btn-primary"
						disabled={busy === 'invite'}
						onclick={createInvite}>{busy === 'invite' ? 'Creating…' : 'Create invitation'}</button
					>
				</footer>
			{:else if modal === 'password'}
				<p>
					Set a temporary password for <strong>{selected?.email}</strong>. Their current session
					will be revoked.
				</p>
				<label
					>Temporary password<input
						type="password"
						bind:value={newPassword}
						minlength="6"
						maxlength="256"
						autocomplete="new-password"
					/></label
				>
				<small
					>Minimum 6 characters. Share it securely and ask the user to change it.</small
				>
				<footer>
					<button class="btn btn-ghost" onclick={() => (modal = null)}>Cancel</button>
					<button
						class="btn btn-primary"
						disabled={newPassword.length < 6 || busy === selected?.id}
						onclick={() => userAction('reset_password', { password: newPassword })}
						>Reset password</button
					>
				</footer>
			{:else}
				<p>
					This permanently deletes <strong>{selected?.email}</strong> and all mailbox content.
					This cannot be undone.
				</p>
				<label
					>Type the full email address to confirm<input
						bind:value={deleteConfirmation}
						placeholder={selected?.email}
					/></label
				>
				<footer>
					<button class="btn btn-ghost" onclick={() => (modal = null)}>Cancel</button>
					<button
						class="btn danger solid"
						disabled={deleteConfirmation !== selected?.email || busy === selected?.id}
						onclick={deleteUser}>Delete permanently</button
					>
				</footer>
			{/if}
		</div>
	</div>
{/if}

<style>
	/* Admin-only page chrome: stats grid, tabs, tables, drawer + modal overlays. */

	.page-head {
		align-items: end;
		gap: 16px;
		margin-bottom: 20px;
	}

	.stats {
		display: grid;
		grid-template-columns: repeat(4, 1fr);
		gap: var(--space-3);
		margin-bottom: var(--space-4);
	}
	.stat {
		padding: 15px 17px;
	}
	.stat span,
	.metrics span {
		display: block;
		color: var(--text-muted);
		font-size: 10px;
		letter-spacing: 0.06em;
		text-transform: uppercase;
	}
	.stat strong {
		display: block;
		margin-top: 7px;
		font-size: 24px;
		font-weight: 600;
	}

	.notice {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 14px;
		padding: 10px 13px;
		border: 1px solid;
		border-radius: var(--radius-md);
		font-size: 12px;
	}
	.notice.error {
		color: var(--color-danger);
		border-color: var(--color-danger-border);
		background: var(--color-danger-bg);
	}
	.notice.success {
		color: var(--color-success);
		border-color: var(--color-success-border);
		background: var(--color-success-bg);
	}
	.notice button {
		border: 0;
		background: none;
		color: inherit;
		font-size: 18px;
	}

	.control {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: var(--space-3);
		padding: var(--space-2);
		margin-bottom: 14px;
	}
	.tabs {
		display: flex;
		align-self: stretch;
	}
	.tabs button {
		padding: 0 15px;
		border: 0;
		border-radius: var(--radius-md);
		background: transparent;
		color: var(--text-muted);
		font-size: 12px;
	}
	.tabs button.active {
		background: var(--bg-elevated);
		color: var(--text-primary);
	}
	.tabs span {
		margin-left: 4px;
		color: var(--accent);
	}

	.tools {
		display: flex;
		gap: var(--space-2);
	}
	.search {
		width: 260px;
		display: flex;
		align-items: center;
		gap: 7px;
		padding: 0 10px;
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
	}
	.search svg,
	.btn svg {
		width: 16px;
	}
	.search input {
		width: 100%;
		border: 0;
		background: transparent;
	}
	.tools select {
		width: 145px;
	}

	.generated {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-4);
		margin-bottom: 14px;
		padding: 15px;
		border-color: var(--accent-soft);
		background: var(--accent-subtle);
	}
	.generated > div:first-child {
		display: grid;
		gap: 4px;
	}
	.generated span {
		color: var(--accent);
		font-size: 10px;
		text-transform: uppercase;
		letter-spacing: 0.08em;
	}
	.generated code {
		font-size: 17px;
	}
	.generated small {
		color: var(--text-muted);
	}
	.generated > div:last-child {
		display: flex;
		gap: 7px;
	}

	.loading,
	.empty {
		padding: 60px;
		text-align: center;
		color: var(--text-muted);
	}

	/* Tables — terminal grid: uppercase muted headers, hairline row dividers. */
	.table-card {
		overflow: hidden;
	}
	.table-wrap {
		overflow-x: auto;
	}
	table {
		width: 100%;
		border-collapse: collapse;
		font-size: 12px;
	}
	th,
	td {
		padding: 13px 14px;
		border-bottom: 1px solid var(--border);
		text-align: left;
		white-space: nowrap;
	}
	th {
		color: var(--text-muted);
		font-size: 9px;
		letter-spacing: 0.07em;
		text-transform: uppercase;
	}
	td:first-child {
		min-width: 210px;
	}
	td strong,
	td span {
		display: block;
	}
	td small {
		color: var(--text-muted);
	}
	tr.disabled {
		opacity: 0.62;
	}

	.badge {
		display: inline-block !important;
		width: max-content;
		padding: 3px 8px;
		border-radius: 99px;
		background: var(--color-success-bg);
		color: var(--color-success);
		font-size: 9px;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}
	.badge.role {
		background: var(--accent-subtle);
		color: var(--accent);
	}
	.badge.off,
	.badge.expired {
		background: var(--color-danger-bg);
		color: var(--color-danger-bright);
	}
	.badge.used {
		background: var(--bg-elevated);
		color: var(--text-muted);
	}

	.muted {
		color: var(--text-muted);
	}
	.icon-btn {
		width: 32px;
		height: 32px;
		border: 0;
		border-radius: var(--radius-md);
		background: var(--bg-elevated);
		color: var(--text-muted);
		font-size: 20px;
	}

	/* Drawer + modal overlays — z-index tuned to sit below the topbar but
	 * above the mail list. */
	.backdrop {
		position: fixed;
		z-index: 45;
		top: var(--header-height);
		right: 0;
		bottom: 0;
		left: 0;
		background: rgba(0, 0, 0, 0.58);
		backdrop-filter: blur(3px);
	}
	.panel {
		position: absolute;
		right: 0;
		top: 0;
		width: min(470px, 100%);
		height: 100%;
		max-height: calc(100dvh - var(--header-height));
		overflow: auto;
		border-left: 1px solid var(--border);
		background: var(--bg-primary);
		box-shadow: -20px 0 60px rgba(0, 0, 0, 0.3);
		overscroll-behavior: contain;
	}
	.panel > header,
	.modal header {
		position: sticky;
		top: 0;
		z-index: 1;
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 18px 20px;
		border-bottom: 1px solid var(--border);
		background: var(--bg-primary);
	}
	.panel header span {
		color: var(--accent);
		font-size: 10px;
		text-transform: uppercase;
	}
	.panel h2,
	.modal h2 {
		margin: 3px 0 0;
		font-size: 17px;
	}
	.panel-body {
		display: grid;
		gap: 15px;
		padding: 18px;
	}

	.identity {
		display: grid;
		grid-template-columns: auto 1fr auto;
		align-items: center;
		gap: var(--space-3);
	}
	.avatar {
		width: 46px;
		height: 46px;
		display: grid;
		place-items: center;
		border-radius: 13px;
		background: var(--accent-subtle);
		color: var(--accent);
		font-weight: 700;
	}
	.identity strong,
	.identity span {
		display: block;
	}
	.identity > div span {
		margin-top: 3px;
		color: var(--text-muted);
		font-size: 10px;
	}

	.metrics {
		display: grid;
		grid-template-columns: repeat(4, 1fr);
		gap: 1px;
		overflow: hidden;
		border: 1px solid var(--border);
		border-radius: 10px;
		background: var(--border);
	}
	.metrics div {
		padding: 11px;
		background: var(--bg-card);
	}
	.metrics strong {
		display: block;
		margin-top: 5px;
		font-size: 12px;
	}

	.panel section {
		display: grid;
		gap: var(--space-3);
		padding: var(--space-4);
		border: 1px solid var(--border);
		border-radius: 12px;
		background: var(--bg-card);
	}
	.panel h3 {
		margin: 0;
		font-size: 13px;
	}
	.panel label,
	.modal label {
		display: grid;
		gap: 6px;
		color: var(--text-secondary);
		font-size: 11px;
	}
	.panel input,
	.panel select,
	.modal input,
	.modal select,
	.modal textarea {
		width: 100%;
	}
	.help,
	.danger-zone p,
	.modal p,
	.modal small {
		margin: 0;
		color: var(--text-muted);
		font-size: 11px;
		line-height: 1.55;
	}
	.action-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 14px;
		padding-top: var(--space-3);
		border-top: 1px solid var(--border);
	}
	.action-row:first-of-type {
		padding-top: 0;
		border: 0;
	}
	.action-row strong,
	.action-row span {
		display: block;
	}
	.action-row strong {
		font-size: 12px;
	}
	.action-row span {
		margin-top: 3px;
		color: var(--text-muted);
		font-size: 10px;
	}
	.danger-zone {
		border-color: var(--color-danger-border) !important;
	}
	.self-note {
		padding: 13px;
		border-radius: 10px;
		background: var(--accent-subtle);
		color: var(--text-muted);
		font-size: 11px;
	}

	.modal-backdrop {
		position: fixed;
		z-index: 60;
		inset: 0;
		display: grid;
		place-items: center;
		padding: 16px;
		background: rgba(0, 0, 0, 0.7);
		backdrop-filter: blur(4px);
	}
	.modal {
		width: min(460px, 100%);
		overflow: hidden;
		padding: 0;
	}
	.modal > p,
	.modal > label,
	.modal > small {
		margin: 16px 20px 0;
	}
	.modal textarea {
		min-height: 80px;
		resize: vertical;
	}
	.modal footer {
		display: flex;
		justify-content: flex-end;
		gap: var(--space-2);
		margin-top: 20px;
		padding: 14px 20px;
		border-top: 1px solid var(--border);
	}
	.address {
		display: flex;
	}
	.address input {
		border-radius: var(--radius-sm) 0 0 var(--radius-sm);
	}
	.address span {
		display: grid;
		place-items: center;
		padding: 0 10px;
		border: 1px solid var(--border);
		border-left: 0;
		border-radius: 0 var(--radius-sm) var(--radius-sm) 0;
		background: var(--bg-elevated);
		color: var(--text-muted);
	}

	@media (max-width: 850px) {
		.stats {
			grid-template-columns: 1fr 1fr;
		}
		.control {
			align-items: stretch;
			flex-direction: column;
		}
		.tabs {
			height: 40px;
		}
		.tools {
			flex-wrap: wrap;
		}
		.search {
			width: 100%;
			height: 40px;
		}
		.tools select {
			flex: 1;
		}
		.generated {
			align-items: flex-start;
			flex-direction: column;
		}
		.generated > div:last-child {
			flex-wrap: wrap;
		}
	}

	@media (max-width: 760px) {
		.page {
			padding: 14px 10px calc(72px + 14px + env(safe-area-inset-bottom, 0px));
		}
		.page-head {
			align-items: flex-start;
			flex-direction: column;
		}
		.stats {
			gap: 7px;
		}
		.stat {
			padding: 12px;
		}
		.stat strong {
			font-size: 19px;
		}
		.tools {
			flex-direction: column;
		}
		.tools select,
		.tools .btn {
			width: 100%;
		}
		.generated > div:last-child {
			width: 100%;
			flex-direction: column;
		}
		.metrics {
			grid-template-columns: 1fr 1fr;
		}
		.panel-body {
			padding: 13px;
		}
		.action-row {
			align-items: flex-start;
			flex-direction: column;
		}
		.action-row .btn {
			width: 100%;
		}
	}

	@media (max-width: 560px) {
		.panel {
			width: 100%;
			border-left: 0;
		}
	}
</style>
