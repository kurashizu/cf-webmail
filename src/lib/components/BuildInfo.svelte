<script lang="ts">
	// __BUILD_COMMIT__ / __BUILD_TIME__ are injected at build time via
	// vite.config.ts's `define` — see src/build-info.d.ts.
	const buildDate = new Date(__BUILD_TIME__).toISOString().slice(0, 16).replace('T', ' ');
</script>

<a
	class="build-info"
	href="https://github.com/kurashizu/cf-webmail/commit/{__BUILD_COMMIT__}"
	target="_blank"
	rel="noopener noreferrer"
	title="Build {__BUILD_COMMIT__} — {__BUILD_TIME__}"
>{__BUILD_COMMIT__} · {buildDate}</a>

<style>
	.build-info {
		font-family: var(--font-mono);
		font-size: 11px;
		letter-spacing: 0.02em;
		color: var(--text-muted);
		text-decoration: none;
		transition: color var(--transition-fast);
	}
	.build-info:hover,
	.build-info:focus-visible {
		color: var(--accent);
	}
</style>
