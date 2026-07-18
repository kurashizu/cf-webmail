<script lang="ts">
	import { page } from '$app/state';

	let { data, children } = $props();

	let searchQuery = $derived(page.url.pathname === '/search' ? page.url.searchParams.get('q') || '' : '');
	let mobileMenuOpen = $state(false);

	const PRIMARY_FOLDERS = new Set(['INBOX', 'Starred', 'Sent']);
	const PRIMARY_ICONS: Record<string, string> = {
		INBOX: 'inbox',
		Starred: 'star',
		Sent: 'send',
		Drafts: 'file',
		Junk: 'alert',
		Trash: 'trash'
	};

	function folderHref(name: string) {
		const slug = name.toLowerCase();
		return slug === 'inbox' ? '/inbox' : `/${slug}`;
	}

	function folderIcon(name: string) {
		return PRIMARY_ICONS[name] ?? 'folder';
	}

	function isActive(name: string) {
		const slug = name.toLowerCase();
		const target = slug === 'inbox' ? '/inbox' : `/${slug}`;
		if (data.currentPath === target) return true;
		if (data.currentPath.startsWith(target + '/')) return true;
		return false;
	}

	const primaryFolders = $derived(data.folders.filter((f: { name: string }) => PRIMARY_FOLDERS.has(f.name)));
	const overflowFolders = $derived(data.folders.filter((f: { name: string }) => !PRIMARY_FOLDERS.has(f.name)));

	function closeMobileMenu() {
		mobileMenuOpen = false;
	}

	$effect(() => {
		// Close the more sheet on navigation
		void data.currentPath;
		mobileMenuOpen = false;
	});
</script>

<div class="app" class:menu-open={mobileMenuOpen}>
	<header class="topbar">
		<a href="/inbox" class="brand" aria-label="KRSZ Mail home">
			<img class="logo-mark" src="/favicon.ico" alt="" width="32" height="32" />
			<span class="brand-name font-serif">KRSZ Mail</span>
		</a>
		<form class="top-search" action="/search" method="GET" role="search">
			<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="11" cy="11" r="7" stroke="currentColor" stroke-width="1.8"/><path d="m16.5 16.5 4 4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>
			<input name="q" value={searchQuery} maxlength="100" placeholder="Search mail" aria-label="Search mail" />
			{#if searchQuery}<a class="clear-search" href="/search" aria-label="Clear search" title="Clear search">×</a>{/if}
		</form>
		<div class="actions">
			<a class="mobile-search" href="/search" aria-label="Search mail" title="Search mail">
				<svg class="nav-icon" viewBox="0 0 24 24" fill="none"><circle cx="11" cy="11" r="7" stroke="currentColor" stroke-width="1.8"/><path d="m16.5 16.5 4 4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>
			</a>
			<a href="/compose" class="btn btn-primary compose-btn">
				<svg class="nav-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4L16.5 3.5Z" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
				<span>Compose</span>
			</a>
			<div class="me">
				<span class="email">{data.user.email}</span>
			</div>
			<button
				type="button"
				class="mobile-menu-btn"
				aria-label="Open menu"
				aria-expanded={mobileMenuOpen}
				aria-controls="mobile-sheet"
				onclick={() => (mobileMenuOpen = !mobileMenuOpen)}
			>
				{#if mobileMenuOpen}
					<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>
				{:else}
					<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="5" cy="12" r="1.4" fill="currentColor"/><circle cx="12" cy="12" r="1.4" fill="currentColor"/><circle cx="19" cy="12" r="1.4" fill="currentColor"/></svg>
				{/if}
			</button>
		</div>
	</header>

	<div class="layout">
		<aside class="sidebar">
			<nav>
				{#each data.folders as f (f.name)}
					<a class="folder" class:active={isActive(f.name)} href={folderHref(f.name)}>
						<span class="folder-main">
							{#if folderIcon(f.name) === 'inbox'}<svg class="nav-icon" viewBox="0 0 24 24" fill="none"><path d="M4 5h16v14H4V5Zm0 9h4l2 3h4l2-3h4" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/></svg>
							{:else if folderIcon(f.name) === 'star'}<svg class="nav-icon" viewBox="0 0 24 24" fill="none"><path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-2.9-5.6 2.9 1.1-6.2L3 9.6l6.2-.9L12 3Z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/></svg>
							{:else if folderIcon(f.name) === 'send'}<svg class="nav-icon" viewBox="0 0 24 24" fill="none"><path d="m21 3-7.5 18-3.1-7.4L3 10.5 21 3Zm-10.6 10.6L21 3" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>
							{:else if folderIcon(f.name) === 'file'}<svg class="nav-icon" viewBox="0 0 24 24" fill="none"><path d="M6 3h8l4 4v14H6V3Zm8 0v5h4M9 13h6M9 17h5" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round" stroke-linecap="round"/></svg>
							{:else if folderIcon(f.name) === 'alert'}<svg class="nav-icon" viewBox="0 0 24 24" fill="none"><path d="M12 9v4m0 4h.01M10.3 4.5 3.4 17a2 2 0 0 0 1.8 3h13.6a2 2 0 0 0 1.8-3L13.7 4.5a2 2 0 0 0-3.4 0Z" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>
							{:else}<svg class="nav-icon" viewBox="0 0 24 24" fill="none"><path d="M4 7h16M9 11v6m6-6v6M6 7l1 14h10l1-14M9 7l1-4h4l1-4" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>{/if}
							<span class="folder-name">{f.name === 'INBOX' ? 'Inbox' : f.name}</span>
						</span>
						{#if f.unread_count > 0}
							<span class="badge">{f.unread_count}</span>
						{/if}
					</a>
				{/each}
			</nav>
			<div class="sidebar-footer">
				<a href="/settings" class="footer-link">
					<svg class="nav-icon" viewBox="0 0 24 24" fill="none"><path d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z" stroke="currentColor" stroke-width="1.7"/><path d="m19.4 15 .1.1 1.1 1.7-2.8 2.8-1.7-1.1-.1-.1a8 8 0 0 1-2 .8V21h-4v-2.4a8 8 0 0 1-2-.8l-.1.1-1.7 1.1-2.8-2.8 1.1-1.7.1-.1a8 8 0 0 1-.8-2H3V8.5h2.4a8 8 0 0 1 .8-2l-.1-.1L5 4.7l2.8-2.8L9.5 3l.1.1a8 8 0 0 1 2-.8V0h4v2.4a8 8 0 0 1 2 .8l.1-.1L19.4 2l2.8 2.8-1.1 1.7-.1.1a8 8 0 0 1 .8 2H24v4h-2.4a8 8 0 0 1-.8 2Z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round" transform="scale(.82) translate(2.6 2.6)"/></svg>
					<span>Settings</span>
				</a>
				<a href="/api-docs" class="footer-link">
					<svg class="nav-icon" viewBox="0 0 24 24" fill="none"><path d="m8 7 5-5 5 5M13 2v14M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>
					<span>API reference</span>
				</a>
				<form method="POST" action="/logout" class="footer-link footer-signout">
					<button type="submit">
						<svg class="nav-icon" viewBox="0 0 24 24" fill="none"><path d="M14 4h-7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h7M16 8l4 4-4 4M20 12H10" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>
						<span>Sign out</span>
					</button>
				</form>
			</div>
		</aside>

		<main class="main">
			{@render children?.()}
		</main>
	</div>

	<nav class="bottom-nav" aria-label="Quick navigation">
		{#each primaryFolders as f (f.name)}
			<a class="bottom-item" class:active={isActive(f.name)} href={folderHref(f.name)}>
				{#if folderIcon(f.name) === 'inbox'}<svg viewBox="0 0 24 24" fill="none"><path d="M4 5h16v14H4V5Zm0 9h4l2 3h4l2-3h4" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/></svg>
				{:else if folderIcon(f.name) === 'star'}<svg viewBox="0 0 24 24" fill="none"><path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-2.9-5.6 2.9 1.1-6.2L3 9.6l6.2-.9L12 3Z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/></svg>
				{:else if folderIcon(f.name) === 'send'}<svg viewBox="0 0 24 24" fill="none"><path d="m21 3-7.5 18-3.1-7.4L3 10.5 21 3Zm-10.6 10.6L21 3" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>
				{:else}<svg viewBox="0 0 24 24" fill="none"><path d="M4 7h16M9 11v6m6-6v6M6 7l1 14h10l1-14M9 7l1-4h4l1-4" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>{/if}
				<span>{f.name === 'INBOX' ? 'Inbox' : f.name}</span>
				{#if f.unread_count > 0}<span class="bottom-badge">{f.unread_count}</span>{/if}
			</a>
		{/each}
	</nav>

	{#if mobileMenuOpen}
		<button type="button" class="sheet-scrim" aria-label="Close menu" onclick={closeMobileMenu}></button>
		<div id="mobile-sheet" class="sheet" role="dialog" aria-modal="true" aria-label="Folders menu">
			<div class="sheet-grip" aria-hidden="true"></div>
			<div class="sheet-account">
				<span class="sheet-avatar" aria-hidden="true">{(data.user.email[0] || '?').toUpperCase()}</span>
				<div>
					<strong>{data.user.email.split('@')[0]}</strong>
					<span>{data.user.email}</span>
				</div>
			</div>
			<nav class="sheet-folders">
				{#each data.folders as f (f.name)}
					<a class="folder" class:active={isActive(f.name)} href={folderHref(f.name)} onclick={closeMobileMenu}>
						<span class="folder-main">
							{#if folderIcon(f.name) === 'inbox'}<svg class="nav-icon" viewBox="0 0 24 24" fill="none"><path d="M4 5h16v14H4V5Zm0 9h4l2 3h4l2-3h4" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/></svg>
							{:else if folderIcon(f.name) === 'star'}<svg class="nav-icon" viewBox="0 0 24 24" fill="none"><path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-2.9-5.6 2.9 1.1-6.2L3 9.6l6.2-.9L12 3Z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/></svg>
							{:else if folderIcon(f.name) === 'send'}<svg class="nav-icon" viewBox="0 0 24 24" fill="none"><path d="m21 3-7.5 18-3.1-7.4L3 10.5 21 3Zm-10.6 10.6L21 3" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>
							{:else if folderIcon(f.name) === 'file'}<svg class="nav-icon" viewBox="0 0 24 24" fill="none"><path d="M6 3h8l4 4v14H6V3Zm8 0v5h4M9 13h6M9 17h5" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round" stroke-linecap="round"/></svg>
							{:else if folderIcon(f.name) === 'alert'}<svg class="nav-icon" viewBox="0 0 24 24" fill="none"><path d="M12 9v4m0 4h.01M10.3 4.5 3.4 17a2 2 0 0 0 1.8 3h13.6a2 2 0 0 0 1.8-3L13.7 4.5a2 2 0 0 0-3.4 0Z" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>
							{:else}<svg class="nav-icon" viewBox="0 0 24 24" fill="none"><path d="M4 7h16M9 11v6m6-6v6M6 7l1 14h10l1-14M9 7l1-4h4l1-4" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>{/if}
							<span class="folder-name">{f.name === 'INBOX' ? 'Inbox' : f.name}</span>
						</span>
						{#if f.unread_count > 0}<span class="badge">{f.unread_count}</span>{/if}
					</a>
				{/each}
			</nav>
			<div class="sheet-divider"></div>
			<nav class="sheet-secondary">
				<a class="folder" href="/settings" onclick={closeMobileMenu}>
					<span class="folder-main">
						<svg class="nav-icon" viewBox="0 0 24 24" fill="none"><path d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z" stroke="currentColor" stroke-width="1.7"/><path d="m19.4 15 .1.1 1.1 1.7-2.8 2.8-1.7-1.1-.1-.1a8 8 0 0 1-2 .8V21h-4v-2.4a8 8 0 0 1-2-.8l-.1.1-1.7 1.1-2.8-2.8 1.1-1.7.1-.1a8 8 0 0 1-.8-2H3V8.5h2.4a8 8 0 0 1 .8-2l-.1-.1L5 4.7l2.8-2.8L9.5 3l.1.1a8 8 0 0 1 2-.8V0h4v2.4a8 8 0 0 1 2 .8l.1-.1L19.4 2l2.8 2.8-1.1 1.7-.1.1a8 8 0 0 1 .8 2H24v4h-2.4a8 8 0 0 1-.8 2Z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round" transform="scale(.82) translate(2.6 2.6)"/></svg>
						<span class="folder-name">Settings</span>
					</span>
				</a>
				<a class="folder" href="/api-docs" onclick={closeMobileMenu}>
					<span class="folder-main">
						<svg class="nav-icon" viewBox="0 0 24 24" fill="none"><path d="m8 7 5-5 5 5M13 2v14M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>
						<span class="folder-name">API reference</span>
					</span>
				</a>
				<form method="POST" action="/logout" class="sheet-logout">
					<button type="submit" class="folder">
						<span class="folder-main">
							<svg class="nav-icon" viewBox="0 0 24 24" fill="none"><path d="M14 4h-7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h7M16 8l4 4-4 4M20 12H10" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>
							<span class="folder-name">Sign out</span>
						</span>
					</button>
				</form>
			</nav>
		</div>
	{/if}
</div>

<style>
	.app {
		min-height: 100vh;
		display: flex;
		flex-direction: column;
	}

	.topbar {
		position: sticky;
		top: 0;
		z-index: 50;
		backdrop-filter: blur(12px);
		-webkit-backdrop-filter: blur(12px);
		background: rgba(10, 10, 15, 0.7);
		border-bottom: 1px solid var(--border);
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0 var(--space-6);
		height: var(--header-height);
	}

	.brand {
		display: inline-flex;
		min-width: 0;
		align-items: center;
		gap: var(--space-3);
	}

	.logo-mark {
		width: 32px;
		height: 32px;
		border-radius: 50%;
		object-fit: cover;
		border: 1px solid rgba(255, 107, 53, 0.45);
	}

	.brand-name {
		font-size: 18px;
		font-weight: 700;
		font-style: italic;
		letter-spacing: 0.02em;
	}

	.top-search {
		width: min(34vw, 440px);
		min-width: 180px;
		display: flex;
		align-items: center;
		gap: 9px;
		margin: 0 var(--space-5);
		padding: 0 11px;
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		background: rgba(26, 26, 36, 0.72);
		transition: border-color var(--transition-fast), background var(--transition-fast);
	}

	.top-search:focus-within {
		border-color: var(--accent);
		background: var(--bg-card);
	}

	.top-search svg {
		width: 17px;
		height: 17px;
		flex: none;
		color: var(--text-muted);
	}
	.top-search input {
		width: 100%;
		min-width: 0;
		height: 38px;
		padding: 0;
		border: 0;
		background: transparent;
		font-size: 13px;
	}
	.top-search input:focus {
		border: 0;
	}
	.clear-search {
		display: grid;
		place-items: center;
		width: 22px;
		height: 22px;
		flex: none;
		border-radius: 50%;
		color: var(--text-muted);
		font-size: 18px;
	}
	.clear-search:hover {
		background: var(--bg-elevated);
		color: var(--text-primary);
	}
	.mobile-search {
		display: none;
		place-items: center;
		width: 40px;
		height: 40px;
		border-radius: var(--radius-md);
		color: var(--text-secondary);
	}
	.mobile-search:hover {
		background: var(--accent-subtle);
		color: var(--accent);
	}
	.mobile-menu-btn {
		display: none;
		place-items: center;
		width: 40px;
		height: 40px;
		border-radius: var(--radius-md);
		background: transparent;
		color: var(--text-secondary);
		cursor: pointer;
		transition: background var(--transition-fast);
	}
	.mobile-menu-btn:hover {
		background: var(--accent-subtle);
		color: var(--accent);
	}
	.mobile-menu-btn svg {
		width: 19px;
		height: 19px;
	}

	.actions {
		display: flex;
		min-width: 0;
		align-items: center;
		gap: var(--space-4);
	}

	.me {
		display: inline-flex;
		min-width: 0;
		align-items: center;
		gap: var(--space-3);
	}

	.email {
		max-width: 180px;
		overflow: hidden;
		font-size: 12px;
		text-overflow: ellipsis;
		white-space: nowrap;
		color: var(--text-muted);
	}

	.compose-btn svg { width: 16px; height: 16px; }

	.layout {
		flex: 1;
		display: grid;
		grid-template-columns: var(--sidebar-width) 1fr;
		min-height: 0;
		height: calc(100dvh - var(--header-height));
		overflow: hidden;
	}

	.sidebar {
		border-right: 1px solid var(--border);
		background: var(--bg-secondary);
		padding: var(--space-4);
		display: flex;
		flex-direction: column;
		justify-content: space-between;
		min-height: 0;
		overflow-y: auto;
		overscroll-behavior: contain;
	}

	nav {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.folder-main,
	.footer-link {
		display: inline-flex;
		align-items: center;
		gap: 10px;
	}

	.nav-icon {
		width: 17px;
		height: 17px;
		flex: none;
	}

	.folder {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: var(--space-2) var(--space-3);
		border-radius: var(--radius-md);
		color: var(--text-secondary);
		font-size: 14px;
		transition: all var(--transition-fast);
	}

	.folder:hover {
		background: var(--accent-subtle);
		color: var(--text-primary);
	}

	.folder.active {
		background: var(--accent-subtle);
		color: var(--accent);
	}

	.badge {
		background: var(--accent);
		color: white;
		font-size: 11px;
		padding: 0 var(--space-2);
		border-radius: var(--radius-full);
		min-width: 20px;
		text-align: center;
	}

	.sidebar-footer {
		border-top: 1px solid var(--border);
		padding-top: var(--space-3);
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.footer-link {
		font-size: 12px;
		color: var(--text-muted);
		padding: var(--space-2) var(--space-3);
		border-radius: var(--radius-md);
	}

	.footer-link:hover {
		background: var(--accent-subtle);
	}

	.footer-link button {
		display: inline-flex;
		align-items: center;
		gap: 10px;
		font: inherit;
		color: inherit;
		background: transparent;
		border: 0;
		padding: 0;
		cursor: pointer;
		width: 100%;
		text-align: left;
	}

	.main {
		min-width: 0;
		min-height: 0;
		overflow: auto;
	}

	/* Bottom navigation — hidden on desktop, slides in on mobile */
	.bottom-nav {
		display: none;
	}

	.sheet-scrim {
		display: none;
	}

	.sheet {
		display: none;
	}

	@media (max-width: 760px) {
		.topbar {
			padding: 0 var(--space-3);
			gap: var(--space-2);
		}

		.top-search {
			display: none;
		}

		.brand-name {
			display: none;
		}

		.email {
			display: none;
		}

		.compose-btn span {
			display: none;
		}

		.compose-btn {
			padding: 0;
			width: 40px;
			height: 40px;
			justify-content: center;
		}

		.mobile-search,
		.mobile-menu-btn {
			display: grid;
		}

		.actions {
			gap: 6px;
		}

		.layout {
			display: flex;
			flex-direction: column;
			height: auto;
			overflow: visible;
			padding-bottom: calc(72px + env(safe-area-inset-bottom, 0px));
		}

		.sidebar {
			display: none;
		}

		.main {
			flex: 1;
			min-width: 0;
			overflow: visible;
		}

		.bottom-nav {
			display: grid;
			grid-template-columns: repeat(3, minmax(0, 1fr));
			gap: 2px;
			position: fixed;
			bottom: 0;
			left: 0;
			right: 0;
			z-index: 45;
			padding: 6px 6px calc(env(safe-area-inset-bottom, 0px) + 6px);
			background: rgba(10, 10, 15, 0.92);
			backdrop-filter: blur(16px);
			-webkit-backdrop-filter: blur(16px);
			border-top: 1px solid var(--border);
			box-shadow: 0 -10px 30px rgba(0, 0, 0, 0.4);
		}
		.bottom-item {
			position: relative;
			display: flex;
			flex-direction: column;
			align-items: center;
			gap: 3px;
			padding: 8px 4px;
			border-radius: var(--radius-md);
			color: var(--text-muted);
			font-size: 10px;
			font-weight: 500;
			letter-spacing: 0.04em;
			text-align: center;
			cursor: pointer;
			transition: color var(--transition-fast);
		}
		.bottom-item:hover,
		.bottom-item.active {
			color: var(--accent);
		}
		.bottom-item svg {
			width: 21px;
			height: 21px;
			flex: none;
		}
		.bottom-item span {
			line-height: 1.1;
		}
		.bottom-badge {
			position: absolute;
			top: 2px;
			right: 14px;
			min-width: 16px;
			height: 16px;
			padding: 0 5px;
			border-radius: 999px;
			background: var(--accent);
			color: white;
			font-size: 9px;
			font-weight: 700;
			line-height: 16px;
			text-align: center;
		}

		/* Sheet */
		.sheet-scrim {
			display: block;
			position: fixed;
			inset: 0;
			z-index: 60;
			border: 0;
			background: rgba(0, 0, 0, 0.5);
			animation: scrim-fade var(--transition-base) ease-out;
		}
		.sheet {
			display: flex;
			flex-direction: column;
			position: fixed;
			bottom: 0;
			left: 0;
			right: 0;
			z-index: 70;
			max-height: 80dvh;
			padding: 8px 14px calc(env(safe-area-inset-bottom, 0px) + 14px);
			background: var(--bg-secondary);
			border-top-left-radius: 22px;
			border-top-right-radius: 22px;
			border-top: 1px solid var(--border);
			box-shadow: 0 -10px 50px rgba(0, 0, 0, 0.5);
			animation: sheet-up var(--transition-spring);
			overscroll-behavior: contain;
		}
		.sheet-grip {
			width: 40px;
			height: 4px;
			margin: 0 auto 12px;
			border-radius: 999px;
			background: var(--border-hover);
			opacity: 0.7;
		}
		.sheet-account {
			display: flex;
			align-items: center;
			gap: 12px;
			padding: 6px 4px 14px;
			border-bottom: 1px solid var(--border);
		}
		.sheet-avatar {
			display: grid;
			place-items: center;
			width: 40px;
			height: 40px;
			border-radius: 50%;
			background: var(--accent-subtle);
			color: var(--accent);
			font-weight: 700;
		}
		.sheet-account div { display: grid; gap: 2px; min-width: 0; }
		.sheet-account strong {
			font-size: 14px;
			font-weight: 600;
			overflow: hidden;
			text-overflow: ellipsis;
			white-space: nowrap;
		}
		.sheet-account span {
			font-size: 11px;
			color: var(--text-muted);
			overflow: hidden;
			text-overflow: ellipsis;
			white-space: nowrap;
		}
		.sheet-folders,
		.sheet-secondary {
			display: flex;
			flex-direction: column;
			gap: 2px;
			padding: 8px 0;
			overflow-y: auto;
			overscroll-behavior: contain;
		}
		.sheet-folders {
			max-height: 40vh;
		}
		.sheet-divider {
			height: 1px;
			margin: 4px 0;
			background: var(--border);
		}
		.sheet .folder {
			min-height: 44px;
			padding: 10px 12px;
			font-size: 15px;
		}
		.sheet .folder .nav-icon { width: 19px; height: 19px; }
		.sheet-logout { margin: 0; }
		.sheet-logout button.folder {
			width: 100%;
			padding: 10px 12px;
			background: transparent;
			border: 0;
			color: inherit;
			font: inherit;
			text-align: left;
			cursor: pointer;
		}
	}

	@keyframes sheet-up {
		from { transform: translateY(100%); }
		to { transform: translateY(0); }
	}
	@keyframes scrim-fade {
		from { opacity: 0; }
		to { opacity: 1; }
	}

	@media (prefers-reduced-motion: reduce) {
		.sheet,
		.sheet-scrim { animation: none; }
	}

	@media (max-width: 980px) and (min-width: 761px) {
		.topbar {
			padding: 0 var(--space-4);
		}
		.brand-name {
			display: none;
		}
		.email {
			max-width: 120px;
		}
		.top-search {
			min-width: 160px;
			margin: 0 var(--space-3);
		}
		.actions {
			gap: var(--space-2);
		}
	}

	@media (max-width: 420px) {
		.logo-mark {
			width: 28px;
			height: 28px;
		}
	}
</style>
