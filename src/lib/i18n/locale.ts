/**
 * Locale detection and persistence.
 *
 * Order of precedence:
 *   1. `krsz-lang` cookie (explicit user choice)
 *   2. `Accept-Language` header (browser preference)
 *   3. Default: `en`
 *
 * The cookie is set by the language picker (POST /api/locale). The picker
 * also reloads the page so SSR re-renders with the new locale.
 */

export const LOCALES = ['en', 'zh-CN', 'zh-TW', 'ja', 'ko'] as const;
export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = 'en';

export const LOCALE_LABELS: Record<Locale, string> = {
	en: 'English',
	'zh-CN': '简体中文',
	'zh-TW': '繁體中文',
	ja: '日本語',
	ko: '한국어'
};

/** Short native script label used in the picker UI. */
export const LOCALE_SHORT: Record<Locale, string> = {
	en: 'EN',
	'zh-CN': '简',
	'zh-TW': '繁',
	ja: '日',
	ko: '한'
};

/** BCP-47 codes accepted by browsers / Accept-Language. */
export const LOCALE_BCP47: Record<Locale, string[]> = {
	en: ['en', 'en-US', 'en-GB', 'en-AU', 'en-CA'],
	'zh-CN': ['zh-CN', 'zh-Hans', 'zh-Hans-CN', 'zh-SG'],
	'zh-TW': ['zh-TW', 'zh-HK', 'zh-Hant', 'zh-Hant-TW', 'zh-MO'],
	ja: ['ja', 'ja-JP'],
	ko: ['ko', 'ko-KR']
};

export const COOKIE_NAME = 'krsz-lang';
export const COOKIE_MAX_AGE = 60 * 60 * 24 * 365; // 1 year

export function isLocale(value: string | undefined | null): value is Locale {
	if (!value) return false;
	return (LOCALES as readonly string[]).includes(value);
}

/**
 * Parse the Accept-Language header and return the best matching locale.
 *
 * Examples:
 *   "zh-CN,zh;q=0.9,en;q=0.8" → "zh-CN"
 *   "ja"                       → "ja"
 *   "fr,de"                    → "en" (no match, falls back)
 *   "zh-Hant-TW"               → "zh-TW"
 *   "zh"                       → "zh-CN" (ambiguous, prefer Simplified)
 */
export function negotiateLocale(acceptLanguage: string | null | undefined): Locale {
	if (!acceptLanguage) return DEFAULT_LOCALE;

	const candidates = acceptLanguage
		.split(',')
		.map((part) => {
			const segments = part.trim().split(';').map((s) => s.trim());
			const tag = segments[0].toLowerCase();
			const qParam = segments.find((s) => s.startsWith('q='));
			const q = qParam ? parseFloat(qParam.slice(2)) : 1;
			return { tag, q: Number.isFinite(q) ? q : 1 };
		})
		.sort((a, b) => b.q - a.q);

	for (const { tag } of candidates) {
		// Strip region qualifiers and normalize separator.
		const primary = tag.split('-')[0];
		// Exact match (e.g. "zh-cn" or "zh-tw")
		for (const locale of LOCALES) {
			for (const code of LOCALE_BCP47[locale]) {
				if (tag === code.toLowerCase()) return locale;
			}
		}
		// Region-specific match: zh-tw, zh-hk, zh-mo → zh-TW
		if (tag === 'zh-tw' || tag === 'zh-hk' || tag === 'zh-mo') return 'zh-TW';
		if (tag === 'zh-cn' || tag === 'zh-sg') return 'zh-CN';
		// Generic primary: "zh" alone → prefer Simplified (more common globally)
		if (primary === 'zh') return 'zh-CN';
		if (primary === 'ja') return 'ja';
		if (primary === 'ko') return 'ko';
		if (primary === 'en') return 'en';
	}
	return DEFAULT_LOCALE;
}
