<script lang="ts">
	import { t, type Locale } from '$lib/i18n';

	let { data } = $props();
	const tt = (key: string, params?: Record<string, string | number>) =>
		t(data.locale as Locale, key, params);
</script>

<svelte:head>
	<title>Terms of Service · {tt('common.brandName')}</title>
	<meta name="description" content="Terms of Service for {tt('common.brandName')}." />
</svelte:head>

<main class="page">
	<header>
		<a href="/" class="brand">
			<img class="brand-mark" src="/brand-mark.svg" alt="" width="32" height="32" />
			<span class="brand-name">{tt('common.brandName')}</span>
		</a>
		<a href="/register" class="back">{tt('common.back')}</a>
	</header>

	<article>
		<h1>Terms of Service</h1>
		<p class="updated">Last updated: September 2026</p>

		<p>
			These terms cover your use of {tt('common.brandName')} (“the Service”), a small,
			independently run email service at krsz.in. By creating an account you agree to them.
			If you don’t agree, please don’t register.
		</p>

		<h2>1. The Service</h2>
		<p>
			{tt('common.brandName')} is a personal mail service built and operated by one person, not a
			company. It runs on Cloudflare Workers, D1, and object storage, and sends outbound mail
			through a third-party transactional email provider. It is offered as-is, in the operator’s
			spare time, without any service-level guarantees.
		</p>

		<h2>2. Registration and eligibility</h2>
		<p>
			You must be at least 16 years old to register. You must provide a working password and may
			optionally provide a display name; you’re responsible for keeping your credentials
			confidential and for all activity on your account. One person may hold more than one
			account, but accounts created solely to evade a suspension, quota, or the registration
			review below are not allowed.
		</p>
		<p>
			New signups go through either an invitation from an existing administrator, or open
			registration protected by a human-verification challenge and an automated review step (see
			§3). The operator may pause or close open registration at any time without notice.
		</p>

		<h2>3. Automated registration review</h2>
		<p>
			Open registrations are screened by an automated reviewer before the account is fully
			activated. The reviewer sees only: the mailbox address you request, the optional note you
			write about what you’ll use the mailbox for, your browser’s User-Agent string, and a count
			of how many accounts were recently registered from your IP address — never any other user’s
			messages or account data. Based on that, a signup is allowed immediately, held for a human
			administrator to review, or declined. If your registration is held for review, the account
			exists but can’t sign in until an administrator approves it; declined registrations create
			no account at all. This process exists solely to keep the service usable for real people and
			free of bulk or scripted signups.
		</p>

		<h2>4. Acceptable use</h2>
		<p>You agree not to use the Service to:</p>
		<ul>
			<li>send unsolicited bulk email, phishing, or malware;</li>
			<li>harass, threaten, or impersonate another person;</li>
			<li>violate any applicable law, or the rights of any third party;</li>
			<li>attempt to bypass, probe, or disrupt the registration review, quotas, or any other part of the Service’s security or abuse controls;</li>
			<li>resell, sublicense, or provide mailbox access to third parties as a service;</li>
			<li>store or transmit content you don’t have the right to send.</li>
		</ul>
		<p>
			Violating this section may result in your account being disabled or deleted without notice,
			at the operator’s discretion.
		</p>

		<h2>5. Storage and message limits</h2>
		<p>
			Each account has a storage quota and a message-count quota, shown in Settings. The operator
			may adjust default quotas, or an individual account’s quota, at any time. Mail that would
			exceed your quota may be rejected. Deleted mail in Trash is periodically and permanently
			purged; there is no extended retention or backup guarantee beyond what’s visible in your
			account.
		</p>

		<h2>6. Availability, changes, and no warranty</h2>
		<p>
			The Service is provided “as is” and “as available,” without warranties of any kind, express
			or implied, including fitness for a particular purpose or uninterrupted availability. It may
			be modified, restricted, or discontinued at any time, in whole or in part, with or without
			notice. To the extent permitted by law, the operator is not liable for any loss of data,
			mail, or access arising from your use of the Service.
		</p>

		<h2>7. Termination</h2>
		<p>
			You may stop using the Service at any time. The operator may suspend or delete any account
			that violates these terms, that was created through abuse of the registration process, or
			that has been inactive for an extended period, and may do so without prior notice. On
			deletion, account data and mailbox contents are permanently removed and cannot be recovered.
		</p>

		<h2>8. Data handling</h2>
		<p>
			The Service stores what it needs to operate your mailbox: your account details, message
			content and metadata, and — for abuse-prevention purposes only — the IP address and note you
			supplied at registration, along with a log of security-relevant account actions retained for
			90 days. This data is not sold, shared with advertisers, or used for tracking. It may be
			disclosed if required by law.
		</p>

		<h2>9. Changes to these terms</h2>
		<p>
			These terms may be updated from time to time; the “Last updated” date above will reflect the
			most recent revision. Continuing to use the Service after a change means you accept the
			updated terms.
		</p>

		<h2>10. Contact</h2>
		<p>
			Questions about these terms can be sent to an administrator through the address you used to
			receive your invitation, or to the postmaster address at your @{data.domain} domain.
		</p>
	</article>
</main>

<style>
	:global(body) { background: var(--bg-primary); }
	.page { min-height: 100vh; display: flex; flex-direction: column; }
	header {
		width: min(760px, 100%);
		margin: 0 auto;
		padding: var(--space-6) var(--space-6) var(--space-4);
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-4);
	}
	.brand { display: inline-flex; align-items: center; gap: var(--space-3); color: var(--text-primary); }
	.brand:hover { color: var(--text-primary); }
	.brand-mark { width: 32px; height: 32px; border-radius: var(--radius-sm); object-fit: cover; border: 1px solid var(--accent-ring); }
	.brand-name { font-size: 14px; font-weight: 700; letter-spacing: -0.01em; }
	.back { font-size: 12px; font-weight: 600; color: var(--text-secondary); }
	.back:hover { color: var(--accent); }

	article {
		width: min(760px, 100%);
		margin: 0 auto;
		padding: var(--space-4) var(--space-6) var(--space-12);
		color: var(--text-secondary);
		font-size: 14px;
		line-height: 1.7;
	}
	h1 { margin: 0 0 var(--space-2); font-size: 26px; font-weight: 700; color: var(--text-primary); letter-spacing: -0.01em; }
	.updated { margin: 0 0 var(--space-8); font-size: 12px; color: var(--text-secondary); }
	h2 { margin: var(--space-8) 0 var(--space-3); font-size: 16px; font-weight: 700; color: var(--text-primary); }
	p { margin: 0 0 var(--space-4); }
	ul { margin: 0 0 var(--space-4); padding-left: 1.3em; }
	li { margin: 0 0 var(--space-2); }

	@media (max-width: 600px) {
		header, article { padding-left: var(--space-4); padding-right: var(--space-4); }
	}
</style>
