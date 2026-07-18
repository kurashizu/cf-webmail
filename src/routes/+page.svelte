<script lang="ts">
	import type { PageData } from './$types';
	let { data }: { data: PageData } = $props();
</script>

<svelte:head>
	<title>KRSZ Mail — Your private address</title>
	<meta name="description" content="A private, invite-only email service at krsz.in." />
</svelte:head>

<main class="landing">
	<div class="ambient" aria-hidden="true"></div>

	<header>
		<nav aria-label="Primary navigation">
			<a href="/" class="brand" aria-label="KRSZ Mail home">
				<img class="brand-mark" src="/favicon.ico" alt="" width="31" height="31" />
				<span class="brand-name">KRSZ Mail</span>
			</a>
			<a href="/login" class="sign-in">Sign in</a>
		</nav>
	</header>

	<section class="hero">
		<div class="eyebrow">Private email by invitation</div>
		<h1>Your place for<br /><em>thoughtful mail.</em></h1>
		<p class="lead">
			A simple, private mailbox with your own
			<span class="address">@{data.domain}</span> address.
		</p>
		<div class="actions">
			<a href="/login" class="primary-action">Open your mailbox</a>
			<a href="/register" class="secondary-action">I have an invitation</a>
		</div>
	</section>

	<section class="principles" aria-label="What KRSZ Mail offers">
		<div>
			<span class="principle-number">01</span>
			<h2>Personal</h2>
			<p>An address that feels like yours, not another account on a crowded platform.</p>
		</div>
		<div>
			<span class="principle-number">02</span>
			<h2>Focused</h2>
			<p>Read, write, and organize mail without feeds, ads, or unnecessary noise.</p>
		</div>
		<div>
			<span class="principle-number">03</span>
			<h2>Private</h2>
			<p>Invite-only access keeps KRSZ Mail small, intentional, and independent.</p>
		</div>
	</section>

	<footer>
		<span>© 2026 KRSZ Mail</span>
		<span>krsz.in</span>
	</footer>
</main>

<style>
	:global(body) { background: var(--bg-primary); }
	.landing { position: relative; min-height: 100vh; overflow: hidden; display: flex; flex-direction: column; isolation: isolate; }
	.ambient { position: absolute; inset: 0; z-index: -1; pointer-events: none; background: radial-gradient(circle at 50% 35%, rgba(255, 107, 53, 0.12), transparent 26rem), linear-gradient(rgba(255,255,255,.018) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.018) 1px, transparent 1px); background-size: auto, 64px 64px, 64px 64px; mask-image: linear-gradient(to bottom, black 0%, transparent 78%); }
	header { padding: 0 var(--space-6); }
	nav { width: min(1120px, 100%); height: 88px; margin: 0 auto; display: flex; align-items: center; justify-content: space-between; }
	.brand { display: inline-flex; align-items: center; gap: 11px; color: var(--text-primary); }
	.brand:hover { color: var(--text-primary); }
	.brand-mark { width: 31px; height: 31px; border-radius: 50%; object-fit: cover; border: 1px solid rgba(255, 107, 53, .45); }
	.brand-name { font-size: 15px; font-weight: 650; letter-spacing: -.01em; }
	.sign-in { padding: 9px 15px; border: 1px solid var(--border); border-radius: var(--radius-full); color: var(--text-secondary); font-size: 13px; font-weight: 500; }
	.sign-in:hover { border-color: var(--border-hover); background: rgba(255,255,255,.025); color: var(--text-primary); }
	.hero { width: min(760px, calc(100% - 48px)); margin: auto; padding: 96px 0 112px; text-align: center; }
	.eyebrow { margin-bottom: 25px; color: var(--accent); font-size: 11px; font-weight: 650; letter-spacing: .16em; text-transform: uppercase; }
	h1 { margin: 0; font-size: clamp(52px, 8vw, 88px); line-height: .98; letter-spacing: -.055em; font-weight: 650; }
	h1 em { font-family: 'Playfair Display', Georgia, serif; font-weight: 500; color: var(--accent); }
	.lead { max-width: 520px; margin: 30px auto 0; color: var(--text-secondary); font-size: 17px; line-height: 1.65; }
	.address { color: var(--text-primary); font-weight: 550; }
	.actions { margin-top: 37px; display: flex; align-items: center; justify-content: center; gap: 12px; }
	.primary-action, .secondary-action { min-height: 46px; padding: 0 20px; border-radius: 12px; display: inline-flex; align-items: center; justify-content: center; font-size: 14px; font-weight: 600; }
	.primary-action { background: var(--accent); color: white; box-shadow: 0 10px 30px rgba(255,107,53,.2); }
	.primary-action:hover { background: var(--accent-hover); color: white; transform: translateY(-1px); }
	.secondary-action { border: 1px solid var(--border); color: var(--text-secondary); }
	.secondary-action:hover { border-color: var(--border-hover); background: rgba(255,255,255,.025); color: var(--text-primary); }
	.principles { width: min(960px, calc(100% - 48px)); margin: 0 auto; padding: 43px 0 50px; border-top: 1px solid var(--border); display: grid; grid-template-columns: repeat(3, 1fr); gap: 56px; }
	.principle-number { color: var(--accent); font-family: 'SF Mono', Monaco, Menlo, monospace; font-size: 10px; }
	.principles h2 { margin: 12px 0 7px; font-size: 15px; font-weight: 600; letter-spacing: -.01em; }
	.principles p { margin: 0; color: var(--text-muted); font-size: 13px; line-height: 1.6; }
	footer { width: min(1120px, calc(100% - 48px)); margin: 0 auto; padding: 23px 0 28px; border-top: 1px solid rgba(42,42,58,.6); display: flex; justify-content: space-between; color: var(--text-muted); font-size: 11px; }
	@media (max-width: 680px) {
		nav { height: 72px; }
		.hero { width: min(100% - 32px, 560px); padding: 78px 0 90px; }
		h1 { font-size: clamp(46px, 15vw, 64px); }
		.lead { font-size: 15px; }
		.actions { flex-direction: column; }
		.primary-action, .secondary-action { width: min(100%, 300px); }
		.principles { width: min(100% - 40px, 480px); grid-template-columns: 1fr; gap: 30px; }
		footer { width: calc(100% - 40px); }
	}
</style>
