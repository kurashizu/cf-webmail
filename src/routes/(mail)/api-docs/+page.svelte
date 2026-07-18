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

	function scrollToSection(id: string) {
		if (typeof document === 'undefined') return;
		const el = document.getElementById(id);
		if (!el) return;
		const offset = 96;
		const top = el.getBoundingClientRect().top + window.scrollY - offset;
		window.scrollTo({ top, behavior: 'smooth' });
		history.replaceState(null, '', `#${id}`);
	}

	function selectSection(id: string) {
		activeSectionId = id;
		scrollToSection(id);
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
		const observed = new Set<string>();
		const observer = new IntersectionObserver(
			(entries) => {
				for (const entry of entries) {
					if (entry.isIntersecting && entry.target.id) {
						observed.add(entry.target.id);
					}
				}
				for (const section of data.sections) {
					if (observed.has(section.id)) {
						activeSectionId = section.id;
						break;
					}
				}
			},
			{ rootMargin: '-30% 0px -55% 0px', threshold: 0 }
		);
		for (const section of data.sections) {
			const el = document.getElementById(section.id);
			if (el) observer.observe(el);
		}
		return () => observer.disconnect();
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
		<div class="meta-row">
			<a class="badge-link" href={data.jsonPath} target="_blank" rel="noopener">
				<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m8 7 5-5 5 5M13 2v14M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>
				<span>JSON reference</span>
				<code>/api/docs</code>
			</a>
			<button
				type="button"
				class="copy-btn"
				class:copied={copyState === 'copied'}
				class:errored={copyState === 'error'}
				onclick={copyJsonUrl}
			>
				{#if copyState === 'copied'}
					<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m5 12 4 4 10-10" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
					Copied URL
				{:else if copyState === 'error'}
					<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.7"/><path d="M12 8v5m0 3h.01" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>
					Press ⌘/Ctrl+C
				{:else}
					<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="8" y="8" width="12" height="12" rx="2" stroke="currentColor" stroke-width="1.7"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>
					Copy URL
				{/if}
			</button>
		</div>
	</header>

	<div class="layout">
		<aside class="toc card" aria-label="Sections">
			<p class="toc-title">Contents</p>
			<nav>
				{#each data.sections as section (section.id)}
					<a
						class="toc-link"
						class:active={activeSectionId === section.id}
						href={`#${section.id}`}
						onclick={(event) => {
							event.preventDefault();
							selectSection(section.id);
						}}
					>
						<span class="dot" aria-hidden="true"></span>
						<span>{section.title}</span>
					</a>
				{/each}
			</nav>
		</aside>

		<div class="content">
			<div class="callout card">
				<div class="callout-icon" aria-hidden="true">
					<svg viewBox="0 0 24 24" fill="none"><path d="M9 12a3 3 0 1 0 6 0 3 3 0 0 0-6 0Zm9-1a8 8 0 0 1-.2 1.8l2 1.6-2 3.4-2.4-1a8 8 0 0 1-3 1.8l-.4 2.5h-4l-.4-2.6a8 8 0 0 1-3-1.7l-2.4 1-2-3.4 2-1.6a8 8 0 0 1 0-3.6l-2-1.6 2-3.4 2.4 1a8 8 0 0 1 3-1.7L8 4h4l.4 2.5a8 8 0 0 1 3 1.8l2.4-1 2 3.4-2 1.6a8 8 0 0 1 .2 1.7Z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>
				</div>
				<div>
					<h2>Base URL & authentication</h2>
					<p>
						All endpoints are mounted at <code>{data.baseUrl}/api/…</code>. Send authenticated requests with the
						<code>session</code> cookie issued by <code>/login</code>. There is no API-key login — the cookie is
						the only authenticator.
					</p>
					<pre class="code-block"><code>{exampleRequest}</code></pre>
				</div>
			</div>

			{#each data.sections as section (section.id)}
				<section id={section.id} class="section card">
					<header class="section-head">
						<h2>{section.title}</h2>
						<p>{section.tagline}</p>
					</header>
					<div class="endpoints">
						{#each section.endpoints as endpoint (endpoint.id)}
							<article id={`${section.id}-${endpoint.id}`} class="endpoint">
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
				</section>
			{/each}

			<footer class="page-foot card">
				<div>
					<h2>Need something else?</h2>
					<p>
						The <a href={data.jsonPath}>{data.jsonPath}</a> endpoint reflects the same catalog. Regenerate your client SDK
						against it and you'll never drift from the docs.
					</p>
				</div>
			</footer>
		</div>
	</div>
</section>

<style>
	.page {
		width: min(100%, 1240px);
		margin: 0 auto;
		padding: var(--space-6);
	}
	.page-head {
		margin-bottom: var(--space-6);
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
		font-size: clamp(28px, 3.4vw, 38px);
		font-weight: 600;
		letter-spacing: -0.025em;
	}
	.subtitle {
		max-width: 760px;
		margin: 8px 0 0;
		color: var(--text-muted);
		font-size: 14px;
		line-height: 1.6;
	}
	.meta-row {
		margin-top: var(--space-5);
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-3);
	}
	.badge-link,
	.copy-btn {
		display: inline-flex;
		align-items: center;
		gap: 9px;
		padding: 8px 13px;
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
		width: 14px;
		height: 14px;
	}
	.badge-link code {
		padding: 2px 6px;
		border-radius: 999px;
		background: var(--bg-elevated);
		color: var(--accent);
		font-size: 11px;
	}
	.copy-btn.copied {
		border-color: rgba(80, 200, 120, 0.4);
		color: #82d9a6;
	}
	.copy-btn.errored {
		border-color: rgba(255, 80, 80, 0.35);
		color: #ff9b9b;
	}

	.layout {
		display: grid;
		grid-template-columns: 220px minmax(0, 1fr);
		gap: var(--space-6);
		align-items: start;
	}

	.toc {
		position: sticky;
		top: calc(var(--header-height) + var(--space-6));
		padding: var(--space-4);
	}
	.toc-title {
		margin: 0 0 var(--space-3);
		padding: 0 4px;
		color: var(--text-muted);
		font-size: 10px;
		font-weight: 700;
		letter-spacing: 0.12em;
		text-transform: uppercase;
	}
	.toc nav {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	.toc-link {
		display: inline-flex;
		align-items: center;
		gap: 9px;
		padding: 7px 9px;
		border-radius: var(--radius-md);
		color: var(--text-secondary);
		font-size: 13px;
		transition: all var(--transition-fast);
	}
	.toc-link:hover {
		background: var(--accent-subtle);
		color: var(--text-primary);
	}
	.toc-link.active {
		background: var(--accent-subtle);
		color: var(--accent);
	}
	.toc-link .dot {
		width: 6px;
		height: 6px;
		flex: none;
		border-radius: 50%;
		background: var(--border-hover);
		transition: background var(--transition-fast);
	}
	.toc-link.active .dot {
		background: var(--accent);
	}

	.content {
		display: grid;
		gap: var(--space-5);
		min-width: 0;
	}

	.callout {
		display: grid;
		grid-template-columns: 44px minmax(0, 1fr);
		gap: var(--space-4);
		padding: var(--space-5);
	}
	.callout-icon {
		width: 44px;
		height: 44px;
		display: grid;
		place-items: center;
		border-radius: var(--radius-lg);
		background: var(--accent-subtle);
		color: var(--accent);
	}
	.callout-icon svg {
		width: 24px;
		height: 24px;
	}
	.callout h2 {
		margin: 0;
		font-size: 16px;
		font-weight: 600;
	}
	.callout p {
		margin: 6px 0 0;
		color: var(--text-secondary);
		font-size: 13px;
		line-height: 1.65;
	}
	.callout code {
		padding: 1px 6px;
		border-radius: 4px;
		background: var(--bg-elevated);
		color: var(--accent);
		font-size: 12px;
	}

	.code-block {
		margin: var(--space-4) 0 0;
		padding: 14px 16px;
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		background: var(--bg-primary);
		color: var(--text-secondary);
		font-family:
			'SF Mono', Monaco, Menlo, Consolas, 'Liberation Mono', monospace;
		font-size: 12px;
		line-height: 1.65;
		overflow-x: auto;
		white-space: pre;
	}
	.code-block code {
		background: transparent;
		padding: 0;
		color: inherit;
	}

	.section {
		padding: var(--space-5);
	}
	.section-head {
		margin-bottom: var(--space-4);
		padding-bottom: var(--space-4);
		border-bottom: 1px solid var(--border);
	}
	.section-head h2 {
		margin: 0;
		font-size: 17px;
		font-weight: 600;
		letter-spacing: -0.01em;
	}
	.section-head p {
		margin: 4px 0 0;
		color: var(--text-muted);
		font-size: 12px;
	}

	.endpoints {
		display: grid;
		gap: var(--space-4);
	}
	.endpoint {
		padding: var(--space-4);
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		background: var(--bg-secondary);
	}
	.endpoint:hover {
		border-color: var(--border-hover);
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
		background: var(--bg-card);
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

	.page-foot {
		padding: var(--space-5);
	}
	.page-foot h2 {
		margin: 0;
		font-size: 16px;
		font-weight: 600;
	}
	.page-foot p {
		margin: 4px 0 0;
		color: var(--text-secondary);
		font-size: 13px;
	}
	.page-foot a {
		color: var(--accent);
		font-weight: 500;
	}

	@media (max-width: 980px) {
		.layout {
			grid-template-columns: 1fr;
		}
		.toc {
			position: static;
		}
		.toc nav {
			flex-direction: row;
			overflow-x: auto;
			gap: 6px;
			padding-bottom: 4px;
		}
		.toc-link {
			white-space: nowrap;
		}
		.fields-head,
		.field-row {
			grid-template-columns: 1.2fr 1fr 2fr;
		}
	}

	@media (max-width: 680px) {
		.page {
			padding: var(--space-4);
		}
		.callout {
			grid-template-columns: 1fr;
			padding: var(--space-4);
		}
		.section {
			padding: var(--space-4);
		}
		.endpoint {
			padding: var(--space-3);
		}
		.fields-head {
			display: none;
		}
		.field-row {
			grid-template-columns: 1fr;
			gap: 4px;
		}
		.code-block {
			padding: 12px;
			font-size: 11px;
		}
	}
</style>
