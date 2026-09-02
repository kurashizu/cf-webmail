<script lang="ts">
	import type { PageData } from './$types';
	import { t } from '$lib/i18n';
	import LanguagePicker from '$lib/components/LanguagePicker.svelte';
	import BackgroundVideo from '$lib/components/BackgroundVideo.svelte';

	let { data }: { data: PageData } = $props();
	const tt = (key: string, params?: Record<string, string | number>) =>
		t(data.locale, key, params);

	/** Brand slogan — kept in English in every locale because the four letters
	 * K / R / S / Z are the brand mnemonic (matches `KRSZ Mail`). Each letter is
	 * rendered with .accent-letter so the brand colour repeats throughout. */
	const slogan = [
		{ letter: 'K', accent: true },
		{ text: 'eep ' },
		{ letter: 'R', accent: true },
		{ text: 'eachable, ' },
		{ letter: 'S', accent: true },
		{ text: 'tay ' },
		{ letter: 'Z', accent: true },
		{ text: 'ealous.' }
	];
</script>

<svelte:head>
	<title>{tt('landing.metaTitle', { brand: tt('common.brandName') })}</title>
	<meta name="description" content={tt('landing.metaDescription')} />
</svelte:head>

<main class="landing">
	<BackgroundVideo src="/video/space-station-orbiting.av1.mp4" opacity={0.4} />
	<div class="ambient" aria-hidden="true"></div>

	<header>
		<nav aria-label={tt('nav.primary')}>
			<a href="/" class="brand" aria-label={tt('landing.signInAria', { brand: tt('common.brandName') })}>
				<img class="brand-mark" src="/brand-mark.svg" alt="" width="31" height="31" />
				<span class="brand-name">{tt('common.brandName')}</span>
			</a>
			<div class="nav-actions">
				<LanguagePicker locale={data.locale} variant="compact" />
				<a href="/login" class="sign-in">{tt('landing.signInButton')}</a>
			</div>
		</nav>
	</header>

	<section class="hero">
		<div class="eyebrow">{tt('landing.eyebrow')}</div>
		<h1 class="slogan" aria-label="Keep Reachable, Stay Zealous">
			{#each slogan as token}
				{#if token.accent}<span class="accent-letter">{token.letter}</span>{:else}{token.text}{/if}
			{/each}
		</h1>
		<p class="lead">
			{tt('landing.lead')}<span class="address">@{data.domain}</span>{tt('landing.leadSuffix')}
		</p>
		<div class="actions">
			<a href="/register" class="primary-action">{tt('landing.ctaInvitation')}</a>
		</div>
	</section>

	<section class="principles" aria-label={tt('landing.principlesHeading', { brand: tt('common.brandName') })}>
		<div>
			<span class="principle-number">01</span>
			<h2>{tt('landing.principle1Title')}</h2>
			<p>{tt('landing.principle1Body')}</p>
		</div>
		<div>
			<span class="principle-number">02</span>
			<h2>{tt('landing.principle2Title')}</h2>
			<p>{tt('landing.principle2Body')}</p>
		</div>
		<div>
			<span class="principle-number">03</span>
			<h2>{tt('landing.principle3Title')}</h2>
			<p>{tt('landing.principle3Body', { brand: tt('common.brandName') })}</p>
		</div>
	</section>

	<footer>
		<span>{tt('landing.footerCopyright', { brand: tt('common.brandName') })}</span>
		<span><a href="/api-docs">API</a> · krsz.in</span>
	</footer>
</main>

<style>
	:global(body) { background: var(--bg-primary); }
	.landing { position: relative; min-height: 100vh; overflow: hidden; display: flex; flex-direction: column; isolation: isolate; }
	:global(.landing .bg-video) { z-index: -2; }
	.ambient { position: absolute; inset: 0; z-index: -1; pointer-events: none; background: radial-gradient(circle at 50% 35%, var(--accent-subtle), transparent 26rem), linear-gradient(rgba(216,226,235,.022) 1px, transparent 1px), linear-gradient(90deg, rgba(216,226,235,.022) 1px, transparent 1px); background-size: auto, 64px 64px, 64px 64px; mask-image: linear-gradient(to bottom, black 0%, transparent 78%); }
	header { padding: 0 var(--space-6); }
	nav { width: min(1120px, 100%); height: 88px; margin: 0 auto; display: flex; align-items: center; justify-content: space-between; }
	.brand { display: inline-flex; align-items: center; gap: 11px; color: var(--text-primary); }
	.brand:hover { color: var(--text-primary); }
	.brand-mark { width: 31px; height: 31px; border-radius: var(--radius-sm); object-fit: cover; border: 1px solid var(--accent-ring); }
	.brand-name { font-size: 15px; font-weight: 650; letter-spacing: -.01em; }
	.nav-actions { display: flex; align-items: center; gap: var(--space-3); }
	.sign-in { padding: 9px 15px; border: 1px solid var(--border); border-radius: var(--radius-sm); color: var(--text-secondary); font-size: 11px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; }
	.sign-in:hover { border-color: var(--accent); background: var(--accent-subtle); color: var(--accent); }
	.hero { width: min(820px, calc(100% - 48px)); margin: auto; padding: 96px 0 112px; text-align: center; }
	.eyebrow { margin-bottom: 25px; color: var(--accent); font-family: var(--font-mono); font-size: 11px; font-weight: 650; letter-spacing: .16em; text-transform: uppercase; }
	.slogan {
		margin: 0;
		font-size: clamp(48px, 7.4vw, 84px);
		line-height: 1.02;
		letter-spacing: -.045em;
		font-weight: 650;
	}
	.accent-letter {
		color: var(--accent);
		font-family: var(--font-mono);
		font-weight: 700;
		letter-spacing: -.02em;
	}
	.lead { max-width: 560px; margin: 30px auto 0; color: var(--text-secondary); font-size: 17px; line-height: 1.65; }
	.address { color: var(--text-primary); font-weight: 550; }
	.actions { margin-top: 37px; display: flex; align-items: center; justify-content: center; gap: 12px; }
	.primary-action { min-height: 46px; padding: 0 20px; border-radius: var(--radius-sm); display: inline-flex; align-items: center; justify-content: center; font-size: 13px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; }
	
	.principles { width: min(960px, calc(100% - 48px)); margin: 0 auto; padding: 43px 0 50px; border-top: 1px solid var(--border); display: grid; grid-template-columns: repeat(3, 1fr); gap: 56px; }
	.principles > div {
		padding: 4px 0;
		transition: transform var(--transition-base);
	}
	.principles > div:hover { transform: translateY(-2px); }
	.principle-number { color: var(--accent); font-family: var(--font-mono); font-size: 10px; }
	.principles h2 { margin: 12px 0 7px; font-size: 15px; font-weight: 600; letter-spacing: -.01em; }
	.principles p { margin: 0; color: var(--text-muted); font-size: 13px; line-height: 1.6; }
	footer { width: min(1120px, calc(100% - 48px)); margin: 0 auto; padding: 23px 0 28px; border-top: 1px solid var(--border); display: flex; justify-content: space-between; align-items: center; gap: var(--space-4); color: var(--text-muted); font-size: 11px; flex-wrap: wrap; }
	@media (max-width: 680px) {
		nav { height: 72px; }
		.hero { width: min(100% - 32px, 560px); padding: 78px 0 90px; }
		.slogan { font-size: clamp(42px, 13vw, 60px); }
		.lead { font-size: 15px; }
		.actions { flex-direction: column; }
		.primary-action { width: min(100%, 300px); }
		.principles { width: min(100% - 40px, 480px); grid-template-columns: 1fr; gap: 30px; }
		footer { width: calc(100% - 40px); }
	}
</style>