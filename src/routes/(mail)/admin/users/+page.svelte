<script lang="ts">
	import { onMount } from 'svelte';
	let { data } = $props();
	let users = $state<any[]>([]);
	let query = $state('');
	let status = $state('all');
	let loading = $state(true);
	let busy = $state<string | null>(null);
	let errorMessage = $state('');

	const filteredUsers = $derived(users.filter((user) => {
		const text = `${user.email} ${user.display_name || ''}`.toLowerCase();
		const matchesQuery = !query.trim() || text.includes(query.trim().toLowerCase());
		const matchesStatus = status === 'all' || (status === 'disabled' ? user.disabled : !user.disabled);
		return matchesQuery && matchesStatus;
	}));

	async function loadUsers() {
		loading = true;
		try {
			const response = await fetch('/api/admin/users');
			if (!response.ok) throw new Error('Could not load users.');
			users = (await response.json()).users || [];
		} catch (error) {
			errorMessage = error instanceof Error ? error.message : 'Could not load users.';
		} finally {
			loading = false;
		}
	}

	async function changeStatus(user: any) {
		busy = user.id;
		errorMessage = '';
		try {
			const action = user.disabled ? 'enable' : 'disable';
			const response = await fetch('/api/admin/users', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ id: user.id, action })
			});
			if (!response.ok) throw new Error((await response.json().catch(() => ({}))).message || 'Action failed.');
			user.disabled = action === 'disable';
		} catch (error) {
			errorMessage = error instanceof Error ? error.message : 'Action failed.';
		} finally {
			busy = null;
		}
	}

	async function deleteUser(user: any) {
		if (!window.confirm(`Delete ${user.email} permanently? Their messages and attachments will also be deleted.`)) return;
		busy = user.id;
		errorMessage = '';
		try {
			const response = await fetch('/api/admin/users', {
				method: 'DELETE',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ id: user.id })
			});
			if (!response.ok) throw new Error((await response.json().catch(() => ({}))).message || 'Delete failed.');
			users = users.filter((item) => item.id !== user.id);
		} catch (error) {
			errorMessage = error instanceof Error ? error.message : 'Delete failed.';
		} finally {
			busy = null;
		}
	}

	onMount(loadUsers);
</script>

<svelte:head><title>User management · KRSZ Mail</title></svelte:head>

<section class="page">
	<header class="page-head">
		<div><p class="eyebrow">Administration</p><h1>User management</h1><p class="subtitle">Manage mailbox access and account data.</p></div>
		<a class="btn btn-ghost" href="/settings">Back to settings</a>
	</header>

	{#if errorMessage}<div class="notice" role="alert">{errorMessage}</div>{/if}

	<div class="toolbar card">
		<div class="search"><svg viewBox="0 0 24 24" fill="none"><circle cx="11" cy="11" r="7" stroke="currentColor" stroke-width="1.7"/><path d="m16.5 16.5 4 4" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg><input bind:value={query} placeholder="Search users" aria-label="Search users" /></div>
		<select bind:value={status} aria-label="Filter users by status"><option value="all">All users</option><option value="active">Active</option><option value="disabled">Disabled</option></select>
	</div>

	{#if loading}<div class="loading">Loading accounts…</div>
	{:else if filteredUsers.length === 0}<div class="empty card"><div class="empty-icon"><svg viewBox="0 0 24 24" fill="none"><path d="M5 5h14v14H5V5Zm3 3 8 8m0-8-8 8" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg></div><h2>No users found</h2><p>Try a different search or status filter.</p></div>
	{:else}<div class="table-card card"><div class="table-wrap"><table><thead><tr><th>User</th><th>Role</th><th>Messages</th><th>Unread</th><th>Status</th><th></th></tr></thead><tbody>{#each filteredUsers as user (user.id)}
		<tr class:disabled={user.disabled}>
			<td><strong>{user.display_name || user.local_part}</strong><span>{user.email}</span></td>
			<td><span class="role">{user.role === 'admin' ? 'Admin' : 'User'}</span></td>
			<td>{user.message_count || 0}</td><td>{user.unread_count || 0}</td>
			<td><span class:off={user.disabled} class="status">{user.disabled ? 'Disabled' : 'Active'}</span></td>
			<td class="actions">{#if user.id === data.user.accountId}<span class="you">You</span>{:else}<button class="btn btn-ghost" disabled={busy === user.id} onclick={() => changeStatus(user)}>{user.disabled ? 'Enable' : 'Disable'}</button><button class="btn danger" disabled={busy === user.id} onclick={() => deleteUser(user)}>Delete</button>{/if}</td>
		</tr>
	{/each}</tbody></table></div></div>{/if}
</section>

<style>
	.page { width: min(100%, 1120px); margin: 0 auto; padding: var(--space-6); }
	.page-head { display:flex; justify-content:space-between; align-items:end; gap:var(--space-4); margin-bottom:var(--space-5); }.eyebrow { margin:0 0 4px; color:var(--accent); font-size:11px; font-weight:700; letter-spacing:.12em; text-transform:uppercase; }.page-head h1 { margin:0; font-size:clamp(26px,3vw,34px); font-weight:600; letter-spacing:-.025em; }.subtitle { margin:6px 0 0; color:var(--text-muted); font-size:13px; }
	.card { border:1px solid var(--border); border-radius:var(--radius-lg); background:var(--bg-card); }.toolbar { display:flex; gap:10px; padding:8px; margin-bottom:var(--space-4); }.search { flex:1; display:flex; align-items:center; gap:8px; padding:0 10px; }.search svg { width:17px; color:var(--text-muted); }.search input { width:100%; border:0; background:transparent; }.search input:focus { border:0; }.toolbar select { width:150px; }.notice { margin-bottom:var(--space-4); padding:10px 12px; border:1px solid rgba(255,80,80,.3); border-radius:var(--radius-md); background:rgba(255,80,80,.08); color:#ff9b9b; font-size:12px; }.loading { padding:var(--space-10); color:var(--text-muted); text-align:center; }.table-card { overflow:hidden; }.table-wrap { overflow-x:auto; }table { width:100%; border-collapse:collapse; font-size:12px; }th,td { padding:13px 15px; border-bottom:1px solid var(--border); text-align:left; white-space:nowrap; }th { color:var(--text-muted); font-size:10px; letter-spacing:.06em; text-transform:uppercase; }td:first-child { min-width:220px; }td:first-child strong, td:first-child span { display:block; }td:first-child strong { color:var(--text-primary); font-size:13px; }td:first-child span { margin-top:2px; color:var(--text-muted); font-size:11px; }.disabled { opacity:.6; }.role, .status { padding:3px 8px; border-radius:var(--radius-full); background:var(--accent-subtle); color:var(--accent); font-size:10px; }.status { background:rgba(80,200,120,.13); color:#82d9a6; }.status.off { background:rgba(255,80,80,.1); color:#ff9292; }.actions { text-align:right; }.actions .btn { padding:6px 9px; font-size:11px; }.danger { color:#ff9292; }.you { color:var(--text-muted); font-size:11px; }.empty { min-height:300px; display:grid; place-content:center; justify-items:center; text-align:center; }.empty-icon { width:45px; height:45px; display:grid; place-items:center; margin-bottom:12px; border-radius:50%; background:var(--accent-subtle); color:var(--accent); }.empty-icon svg { width:21px; }.empty h2 { margin:0 0 5px; font-size:17px; }.empty p { margin:0; color:var(--text-muted); font-size:12px; }
	@media(max-width:600px){.page{padding:14px 10px}.page-head{align-items:flex-start;flex-direction:column}.page-head>.btn{align-self:flex-start}.toolbar{flex-direction:column}.toolbar select{width:100%}td,th{padding:11px 10px}}
</style>
