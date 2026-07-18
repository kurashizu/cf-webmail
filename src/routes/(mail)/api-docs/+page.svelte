<script lang="ts">
	import { onMount } from 'svelte';

	let { data } = $props();

	let activeSectionId = $state('');
	let copyState = $state<'idle' | 'copied' | 'error'>('idle');
	let copyTimer: ReturnType<typeof setTimeout> | null = null;

	$effect.pre(() => {
		if (!activeSectionId && data.sections.length) {
			activeSectionId = data.sections[0].id;
		}
	});

	const activeSection = $derived(
		data.sections.find((section) => section.id === activeSectionId) ?? data.sections[0]
	);
	const activeIndex = $derived(
		Math.max(
			0,
			data.sections.findIndex((section) => section.id === activeSectionId)
		)
	);

	const exampleRequest = $derived(
		[
			`# 1. Log in through the form action to obtain a Session cookie.`,
			`curl -c /tmp/cj -X POST ${data.baseUrl}/login \\`,
			`  -H "Origin: ${data.baseUrl}" \\`,
			`  -H "Referer: ${data.baseUrl}/login" \\`,
			`  --data-urlencode "email=you@${data.domain}" \\`,
			`  --data-urlencode "password=yourpassword"`,
			``,
			`# 2. Use the cookie jar on any endpoint below.`,
			`curl -b /tmp/cj ${data.baseUrl}${data.jsonPath}`
		].join('\n')
	);

	function selectSection(id: string) {
		activeSectionId = id;
		if (typeof window !== 'undefined') {
			history.replaceState(null, '', `#${id}`);
		}
	}

	async function copyJsonUrl() {
		if (copyTimer) {
			clearTimeout(copyTimer);
			copyTimer = null;
		}
		const url = `${data.baseUrl}${data.jsonPath}`;
		try {
			await navigator.clipboard.writeText(url);
			copyState = 'copied';
		} catch {
			copyState = 'error';
		}
		copyTimer = setTimeout(() => (copyState = 'idle'), 1800);
	}

	function methodClass(method: string) {
		const verb = method.split('/')[0].trim();
		if (verb === 'GET') return 'verb get';
		if (verb === 'POST') return 'verb post';
		if (verb === 'DELETE') return 'verb delete';
		if (verb === 'PUT' || verb === 'PATCH') return 'verb put';
		return 'verb other';
	}

	function authLabel(level: 'session' | 'admin' | 'public') {
		if (level === 'public') return 'Public';
		if (level === 'admin') return 'Admin only';
		return 'Signed in';
	}

	onMount(() => {
		if (typeof window === 'undefined') return;
		const initial = window.location.hash.replace(/^#/, '');
		if (initial && data.sections.some((section) => section.id === initial)) {
			activeSectionId = initial;
		}
	});
</script>

<svelte:head>
	<title>{data.meta.title} · API reference</title>
	<meta name="description" content={data.meta.tagline} />
</svelte:head>

<section class="page">
	<header class="page-head">
		<p class="eyebrow">Developer reference</p>
		<h1>{data.meta.title}</h1>
		<p class="subtitle">{data.meta.tagline}</p>
	</header>

	<div class="intro card">
		<div class="intro-icon" aria-hidden="true">
			<svg viewBox="0 0 24 24" fill="none"><path d="M9 12a3 3 0 1 0 6 0 3 3 0 0 0-6 0Zm9-1a8 8 0 0 1-.2 1.8l2 1.6-2 3.4-2.4-1a8 8 0 0 1-3 1.8l-.4 2.5h-4l-.4-2.6a8 8 0 0 1-3-1.7l-2.4 1-2-3.4 2-1.6a8 8 0 0 1 0-3.6l-2-1.6 2-3.4 2.4 1a8 8 0 0 1 3-1.7L8 4h4l.4 2.5a8 8 0 0 1 3 1.8l2.4-1 2 3.4-2 1.6a8 8 0 0 1 .2 1.7Z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>
		</div>
		<div class="intro-body">
			<div class="intro-top">
				<div>
					<h2>Base URL & authentication</h2>
					<p>
						All endpoints live at <code>{data.baseUrl}/api/…</code>. Authenticate with the
						<code>session</code> cookie minted by <code>/login</code> — there is no API-key login.
					</p>
				</div>
				<div class="intro-actions">
					<a class="badge-link" href={data.jsonPath} target="_blank" rel="noopener">
						<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m8 7 5-5 5 5M13 2v14M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>
						<span>JSON</span>
					</a>
					<button
						type="button"
						class="copy-btn"
						class:copied={copyState === 'copied'}
						class:errored={copyState === 'error'}
						onclick={copyJsonUrl}
						aria-label="Copy JSON reference URL"
					>
						{#if copyState === 'copied'}
							<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m5 12 4 4 10-10" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
							Copied
						{:else if copyState === 'error'}
							<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.7"/><path d="M12 8v5m0 3h.01" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>
							Press ⌘/Ctrl+C
						{:else}
							<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="8" y="8" width="12" height="12" rx="2" stroke="currentColor" stroke-width="1.7"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>
							Copy URL
						{/if}
					</button>
				</div>
			</div>
			<details class="snippet">
				<summary>
					<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m6 9 6 6 6-6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
					Show a working curl example
				</summary>
				<pre class="code-block"><code>{exampleRequest}</code></pre>
			</details>
		</div>
	</div>

	<div class="tabs" role="tablist" aria-label="API sections">
		{#each data.sections as section, index (section.id)}
			<button
				type="button"
				role="tab"
				id={`tab-${section.id}`}
				aria-selected={activeSectionId === section.id}
				aria-controls={`panel-${section.id}`}
				tabindex={activeSectionId === section.id ? 0 : -1}
				class="tab"
				class:active={activeSectionId === section.id}
				onclick={() => selectSection(section.id)}
			>
				<span class="tab-title">{section.title}</span>
				<span class="tab-count">{section.endpoints.length}</span>
			</button>
		{/each}
	</div>

	{#if activeSection}
			<div
				id={`panel-${activeSection.id}`}
				role="tabpanel"
				aria-labelledby={`tab-${activeSection.id}`}
				class="panel"
			>
			<header class="panel-head">
				<p class="panel-tag">Section {activeIndex + 1} of {data.sections.length}</p>
				<h2>{activeSection.title}</h2>
				<p class="panel-tagline">{activeSection.tagline}</p>
			</header>
			<div class="endpoints">
				{#each activeSection.endpoints as endpoint (endpoint.id)}
					<article class="endpoint">
						<header class="endpoint-head">
							<h3>
								<span class={methodClass(endpoint.method)}>{endpoint.method}</span>
								<code class="path">{endpoint.path}</code>
							</h3>
							<span class="auth-tag" data-level={endpoint.auth}>{authLabel(endpoint.auth)}</span>
						</header>
						<p class="summary">{endpoint.summary}</p>
						<p class="description">{endpoint.description}</p>

						{#if endpoint.requestFields?.length}
							<h4>Request</h4>
							<div class="fields">
								<div class="fields-head">
									<span>Field</span>
									<span>Type</span>
									<span>Notes</span>
								</div>
								{#each endpoint.requestFields as field (field.name)}
									<div class="field-row">
										<div class="field-name">
											<code>{field.name}</code>
											{#if field.required}<span class="req">required</span>{/if}
										</div>
										<div class="field-type">
											{#if field.values && field.values.length}
												<span class="enum">{field.type}</span>
												<ul class="enum-values">
													{#each field.values as v (v)}<li>{v}</li>{/each}
												</ul>
											{:else}
												{field.type}
											{/if}
										</div>
										<div class="field-desc">{field.description}</div>
									</div>
								{/each}
							</div>
						{/if}

						{#if endpoint.responseExample}
							<h4>Response</h4>
							<pre class="code-block"><code>{endpoint.responseExample}</code></pre>
						{/if}

						{#if endpoint.notes}
							<p class="notes">{endpoint.notes}</p>
						{/if}
					</article>
				{/each}
			</div>
			<nav class="panel-nav" aria-label="Section navigation">
				<button
					type="button"
					class="pager"
					disabled={activeIndex === 0}
					onclick={() => selectSection(data.sections[activeIndex - 1].id)}
				>
					<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m15 18-6-6 6-6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
					<span>
						<small>Previous</small>
						<strong>{activeIndex > 0 ? data.sections[activeIndex - 1].title : '—'}</strong>
					</span>
				</button>
				<button
					type="button"
					class="pager next"
					disabled={activeIndex === data.sections.length - 1}
					onclick={() => selectSection(data.sections[activeIndex + 1].id)}
				>
					<span>
						<small>Next</small>
						<strong>{activeIndex < data.sections.length - 1 ? data.sections[activeIndex + 1].title : '—'}</strong>
					</span>
					<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m9 18 6-6-6-6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
				</button>
			</nav>
					</div>
				{/if}
</section>

<style>
	.page {
		width: min(100%, 980px);
		margin: 0 auto;
		padding: var(--space-6);
	}
	.page-head {
		margin-bottom: var(--space-5);
	}
	.eyebrow {
		margin: 0 0 6px;
		color: var(--accent);
		font-size: 11px;
		font-weight: 700;
		letter-spacing: 0.14em;
		text-transform: uppercase;
	}
	.page-head h1 {
		margin: 0;
		font-size: clamp(26px, 3.2vw, 34px);
		font-weight: 600;
		letter-spacing: -0.025em;
	}
	.subtitle {
		max-width: 640px;
		margin: 6px 0 0;
		color: var(--text-muted);
		font-size: 13px;
		line-height: 1.6;
	}

	.intro {
		display: grid;
		grid-template-columns: 44px minmax(0, 1fr);
		gap: var(--space-4);
		padding: var(--space-5);
		margin-bottom: var(--space-5);
	}
	.intro-icon {
		width: 44px;
		height: 44px;
		display: grid;
		place-items: center;
		border-radius: var(--radius-lg);
		background: var(--accent-subtle);
		color: var(--accent);
	}
	.intro-icon svg {
		width: 22px;
		height: 22px;
	}
	.intro-top {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: var(--space-4);
	}
	.intro h2 {
		margin: 0;
		font-size: 15px;
		font-weight: 600;
	}
	.intro p {
		margin: 5px 0 0;
		color: var(--text-secondary);
		font-size: 13px;
		line-height: 1.6;
	}
	.intro code {
		padding: 1px 6px;
		border-radius: 4px;
		background: var(--bg-elevated);
		color: var(--accent);
		font-size: 12px;
	}
	.intro-actions {
		display: inline-flex;
		flex: none;
		gap: 7px;
	}
	.badge-link,
	.copy-btn {
		display: inline-flex;
		align-items: center;
		gap: 7px;
		padding: 7px 11px;
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		background: var(--bg-card);
		color: var(--text-secondary);
		font-size: 12px;
		font-weight: 500;
		cursor: pointer;
		transition:
			border-color var(--transition-fast),
			background var(--transition-fast),
			color var(--transition-fast);
	}
	.badge-link:hover,
	.copy-btn:hover {
		border-color: var(--border-hover);
		color: var(--text-primary);
	}
	.badge-link svg,
	.copy-btn svg {
		width: 13px;
		height: 13px;
	}
	.copy-btn.copied {
		border-color: rgba(80, 200, 120, 0.4);
		color: #82d9a6;
	}
	.copy-btn.errored {
		border-color: rgba(255, 80, 80, 0.35);
		color: #ff9b9b;
	}

	.snippet {
		margin-top: var(--space-4);
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		background: var(--bg-secondary);
		overflow: hidden;
	}
	.snippet summary {
		display: inline-flex;
		align-items: center;
		gap: 8px;
		padding: 9px 13px;
		cursor: pointer;
		list-style: none;
		color: var(--text-secondary);
		font-size: 12px;
		font-weight: 500;
	}
	.snippet summary::-webkit-details-marker {
		display: none;
	}
	.snippet summary svg {
		width: 13px;
		height: 13px;
		transition: transform var(--transition-fast);
	}
	.snippet[open] summary svg {
		transform: rotate(180deg);
	}
	.snippet summary:hover {
		color: var(--accent);
	}
	.code-block {
		margin: 0;
		padding: 13px 15px;
		border-top: 1px solid var(--border);
		background: var(--bg-primary);
		color: var(--text-secondary);
		font-family:
			'SF Mono', Monaco, Menlo, Consolas, 'Liberation Mono', monospace;
		font-size: 11px;
		line-height: 1.65;
		overflow-x: auto;
		white-space: pre;
	}
	.code-block code {
		background: transparent;
		padding: 0;
		color: inherit;
	}

	.tabs {
		display: flex;
		flex-wrap: nowrap;
		gap: 4px;
		padding: 4px;
		margin-bottom: var(--space-5);
		border: 1px solid var(--border);
		border-radius: var(--radius-lg);
		background: var(--bg-card);
		overflow-x: auto;
		scrollbar-width: none;
	}
	.tabs::-webkit-scrollbar {
		display: none;
	}
	.tab {
		flex: 1;
		min-width: max-content;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 8px;
		padding: 9px 13px;
		border-radius: var(--radius-md);
		color: var(--text-secondary);
		font-size: 12px;
		font-weight: 500;
		white-space: nowrap;
		transition: all var(--transition-fast);
	}
	.tab:hover {
		background: var(--bg-elevated);
		color: var(--text-primary);
	}
	.tab.active {
		background: var(--accent);
		color: white;
		box-shadow: var(--shadow-glow);
	}
	.tab-count {
		min-width: 18px;
		padding: 1px 6px;
		border-radius: 999px;
		background: rgba(255, 255, 255, 0.08);
		color: inherit;
		font-size: 10px;
		font-weight: 700;
		text-align: center;
	}
	.tab.active .tab-count {
		background: rgba(0, 0, 0, 0.2);
	}

	.panel {
		display: grid;
		gap: var(--space-4);
	}
	.panel-head {
		padding-bottom: var(--space-4);
		border-bottom: 1px solid var(--border);
	}
	.panel-tag {
		margin: 0;
		color: var(--accent);
		font-size: 10px;
		font-weight: 700;
		letter-spacing: 0.12em;
		text-transform: uppercase;
	}
	.panel-head h2 {
		margin: 4px 0 0;
		font-size: 20px;
		font-weight: 600;
		letter-spacing: -0.015em;
	}
	.panel-tagline {
		margin: 4px 0 0;
		color: var(--text-muted);
		font-size: 13px;
	}

	.endpoints {
		display: grid;
		gap: var(--space-4);
	}
	.endpoint {
		padding: var(--space-4);
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		background: var(--bg-card);
	}
	.endpoint-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		flex-wrap: wrap;
		gap: var(--space-3);
		margin-bottom: 8px;
	}
	.endpoint-head h3 {
		display: inline-flex;
		align-items: center;
		gap: 9px;
		margin: 0;
		font-size: 14px;
		font-weight: 600;
	}
	.verb {
		display: inline-block;
		padding: 3px 8px;
		border-radius: 6px;
		font-family:
			'SF Mono', Monaco, Menlo, Consolas, monospace;
		font-size: 10px;
		font-weight: 700;
		letter-spacing: 0.06em;
		text-transform: uppercase;
	}
	.verb.get {
		background: rgba(80, 200, 120, 0.14);
		color: #82d9a6;
	}
	.verb.post {
		background: rgba(255, 107, 53, 0.14);
		color: var(--accent);
	}
	.verb.delete {
		background: rgba(255, 80, 80, 0.14);
		color: #ff9b9b;
	}
	.verb.put {
		background: rgba(140, 130, 250, 0.14);
		color: #b9b3f7;
	}
	.verb.other {
		background: var(--bg-elevated);
		color: var(--text-secondary);
	}
	.endpoint .path {
		padding: 3px 9px;
		border: 1px solid var(--border);
		border-radius: 6px;
		background: var(--bg-primary);
		color: var(--text-primary);
		font-size: 12px;
		font-weight: 600;
		word-break: break-all;
	}
	.auth-tag {
		padding: 3px 9px;
		border: 1px solid var(--border);
		border-radius: 999px;
		color: var(--text-muted);
		font-size: 10px;
		font-weight: 600;
		letter-spacing: 0.06em;
		text-transform: uppercase;
	}
	.auth-tag[data-level='session'] {
		color: var(--accent);
		border-color: rgba(255, 107, 53, 0.3);
	}
	.auth-tag[data-level='admin'] {
		color: #f5a524;
		border-color: rgba(245, 165, 36, 0.35);
	}
	.auth-tag[data-level='public'] {
		color: #82d9a6;
		border-color: rgba(80, 200, 120, 0.3);
	}
	.summary {
		margin: 0;
		font-size: 14px;
		font-weight: 500;
		color: var(--text-primary);
	}
	.description {
		margin: 5px 0 0;
		color: var(--text-secondary);
		font-size: 12px;
		line-height: 1.65;
	}
	.notes {
		margin: var(--space-3) 0 0;
		padding: 10px 12px;
		border: 1px dashed var(--border);
		border-radius: var(--radius-md);
		color: var(--text-secondary);
		font-size: 12px;
		font-style: italic;
	}

	.endpoint h4 {
		margin: var(--space-4) 0 9px;
		padding-bottom: 6px;
		color: var(--text-muted);
		font-size: 10px;
		font-weight: 700;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		border-bottom: 1px solid var(--border);
	}

	.fields {
		display: grid;
		gap: 6px;
	}
	.fields-head,
	.field-row {
		display: grid;
		grid-template-columns: 1.1fr 1.3fr 2fr;
		gap: var(--space-3);
		padding: 7px 9px;
		font-size: 12px;
	}
	.fields-head {
		color: var(--text-muted);
		font-size: 10px;
		font-weight: 700;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		border-bottom: 1px solid var(--border);
	}
	.field-row {
		border-radius: var(--radius-md);
	}
	.field-row:hover {
		background: var(--bg-secondary);
	}
	.field-name code {
		padding: 1px 6px;
		border-radius: 4px;
		background: var(--bg-elevated);
		color: var(--text-primary);
		font-size: 12px;
	}
	.field-name .req {
		margin-left: 6px;
		padding: 1px 6px;
		border-radius: 999px;
		background: rgba(255, 107, 53, 0.16);
		color: var(--accent);
		font-size: 9px;
		font-weight: 700;
		letter-spacing: 0.06em;
		text-transform: uppercase;
	}
	.field-type {
		color: var(--text-secondary);
	}
	.enum {
		display: inline-block;
		padding: 1px 6px;
		border-radius: 4px;
		background: var(--bg-elevated);
		color: var(--accent);
		font-size: 11px;
		font-weight: 600;
	}
	.enum-values {
		display: flex;
		flex-wrap: wrap;
		gap: 4px;
		margin: 6px 0 0;
		padding: 0;
		list-style: none;
	}
	.enum-values li {
		padding: 1px 6px;
		border: 1px solid var(--border);
		border-radius: 999px;
		color: var(--text-secondary);
		font-family:
			'SF Mono', Monaco, Menlo, Consolas, monospace;
		font-size: 10px;
	}
	.field-desc {
		color: var(--text-secondary);
		font-size: 12px;
		line-height: 1.55;
	}

	.panel-nav {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: var(--space-3);
		margin-top: var(--space-3);
	}
	.pager {
		display: inline-flex;
		align-items: center;
		gap: 9px;
		padding: 12px 14px;
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		background: var(--bg-card);
		color: var(--text-secondary);
		font-size: 12px;
		text-align: left;
		cursor: pointer;
		transition: all var(--transition-fast);
	}
	.pager svg {
		width: 16px;
		height: 16px;
		flex: none;
	}
	.pager span {
		display: grid;
		gap: 2px;
		min-width: 0;
	}
	.pager small {
		color: var(--text-muted);
		font-size: 10px;
		letter-spacing: 0.06em;
		text-transform: uppercase;
	}
	.pager strong {
		color: var(--text-primary);
		font-size: 13px;
		font-weight: 500;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.pager.next {
		justify-content: flex-end;
		text-align: right;
	}
	.pager:hover:not(:disabled) {
		border-color: var(--border-hover);
		color: var(--accent);
	}
	.pager:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}

	@media (max-width: 720px) {
		.page {
			padding: var(--space-4);
		}
		.intro {
			grid-template-columns: 1fr;
			padding: var(--space-4);
		}
		.intro-top {
			flex-direction: column;
		}
		.intro-actions {
			width: 100%;
		}
		.badge-link,
		.copy-btn {
			flex: 1;
			justify-content: center;
		}
		.tab {
			padding: 8px 10px;
		}
		.fields-head {
			display: none;
		}
		.field-row {
			grid-template-columns: 1fr;
			gap: 4px;
		}
		.panel-nav {
			grid-template-columns: 1fr;
		}
		.endpoint {
			padding: var(--space-3);
		}
	}
</style>