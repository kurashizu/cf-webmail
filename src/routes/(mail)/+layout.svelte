<script lang="ts">
	import { page } from '$app/state';
	let { data, children } = $props();

	let searchQuery = $derived(page.url.pathname === '/search' ? page.url.searchParams.get('q') || '' : '');

	function folderHref(name: string) {
		const slug = name.toLowerCase();
		return slug === 'inbox' ? '/inbox' : `/${slug}`;
	}

	function folderIcon(name: string) {
		switch (name) {
			case 'INBOX': return 'inbox';
			case 'Starred': return 'star';
			case 'Sent': return 'send';
			case 'Drafts': return 'file';
			case 'Junk': return 'alert';
			case 'Trash': return 'trash';
			default: return 'folder';
		}
	}

	function isActive(name: string) {
		const slug = name.toLowerCase();
		const target = slug === 'inbox' ? '/inbox' : `/${slug}`;
		if (data.currentPath === target) return true;
		// Detail page under the folder
		if (data.currentPath.startsWith(target + '/')) return true;
		return false;
	}
</script>

<div class="app">
	<header class="topbar">
		<a href="/inbox" class="brand">
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
			<a href="/compose" class="btn btn-primary">
				<svg class="nav-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4L16.5 3.5Z" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
				Compose
			</a>
			<div class="me">
				<span class="email">{data.user.email}</span>
				<form method="POST" action="/logout">
					<button type="submit" class="btn btn-ghost">Sign out</button>
				</form>
			</div>
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
							{:else}<svg class="nav-icon" viewBox="0 0 24 24" fill="none"><path d="M4 7h16M9 11v6m6-6v6M6 7l1 14h10l1-14M9 7l1-4h4l1 4" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>{/if}
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
					Settings
				</a>
			</div>
		</aside>

		<main class="main">
			{@render children?.()}
		</main>
	</div>
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
		display: flex;
		align-items: center;
		gap: 9px;
		margin: 0 var(--space-5);
		padding: 0 11px;
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		background: rgba(26, 26, 36, .72);
		transition: border-color var(--transition-fast), background var(--transition-fast);
	}

	.top-search:focus-within {
		border-color: var(--accent);
		background: var(--bg-card);
	}

	.top-search svg { width: 17px; height: 17px; flex: none; color: var(--text-muted); }
	.top-search input { width: 100%; min-width: 0; height: 38px; padding: 0; border: 0; background: transparent; font-size: 13px; }
	.top-search input:focus { border: 0; }
	.clear-search { display: grid; place-items: center; width: 22px; height: 22px; flex: none; border-radius: 50%; color: var(--text-muted); font-size: 18px; }
	.clear-search:hover { background: var(--bg-elevated); color: var(--text-primary); }
	.mobile-search { display: none; place-items: center; width: 36px; height: 36px; border-radius: var(--radius-md); color: var(--text-secondary); }
	.mobile-search:hover { background: var(--accent-subtle); color: var(--accent); }

	.actions {
		display: flex;
		align-items: center;
		gap: var(--space-4);
	}

	.me {
		display: inline-flex;
		align-items: center;
		gap: var(--space-3);
	}

	.email {
		font-size: 12px;
		color: var(--text-muted);
	}

	.layout {
		flex: 1;
		display: grid;
		grid-template-columns: var(--sidebar-width) 1fr;
		min-height: 0;
	}

	.sidebar {
		border-right: 1px solid var(--border);
		background: var(--bg-secondary);
		padding: var(--space-4);
		display: flex;
		flex-direction: column;
		justify-content: space-between;
	}

	nav {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.folder-main, .footer-link {
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

	.main {
		min-width: 0;
		min-height: 0;
		overflow: auto;
	}
		@media (max-width: 760px) {
			.topbar {
				padding: 0 var(--space-4);
			}

			.top-search {
				display: none;
			}

			.mobile-search {
				display: grid;
			}

			.brand-name, .email {
				display: none;
			}

			.actions, .me {
				gap: var(--space-2);
			}

			.layout {
				display: flex;
				flex-direction: column;
			}

			.sidebar {
				position: sticky;
				top: var(--header-height);
				z-index: 40;
				order: 0;
				padding: 8px var(--space-3);
				border-right: 0;
				border-bottom: 1px solid var(--border);
				overflow-x: auto;
				scrollbar-width: none;
			}

			.sidebar::-webkit-scrollbar { display: none; }

			nav {
				flex-direction: row;
				width: max-content;
			}

			.folder {
				gap: 8px;
				white-space: nowrap;
			}

			.sidebar-footer { display: none; }
			.main { flex: 1; overflow: visible; }
		}

		@media (max-width: 420px) {
			.topbar { padding: 0 10px; }
			.logo-mark { width: 28px; height: 28px; }
			.actions .btn { padding-right: 10px; padding-left: 10px; }
		}
	</style>
