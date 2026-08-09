/**
 * Central message catalog.
 *
 * Adding a new locale:
 *   1. Create `src/lib/i18n/messages/<bcp47>.ts` with type
 *      `Partial<MessageDictionary>` (imported from this module).
 *   2. Add the locale code to `LOCALES` in `../locale.ts`.
 *   3. Add an entry to the `MESSAGES` table below.
 *
 * Adding a new message key:
 *   1. Add the key to `en.ts` — this is the source of truth.
 *   2. (Optional) Add the translation in other locale files. Untranslated
 *      keys automatically fall back to the English string at runtime.
 *
 * English plurals:
 *   - Append `_one` to the key for the singular override (count === 1).
 *   - The base key is used for all other counts.
 *   - CJK languages do not need plural variants.
 *
 * Variables:
 *   - Use `{name}` placeholders; pass `{ name: value }` as the second arg.
 *
 * Do NOT translate:
 *   - Brand names: `KRSZ Mail`, `krsz.in`
 *   - Technical terms: `API`, `JSON`, `MB`, `HTML`, `URL`
 *   - Code samples and code blocks
 *   - Email addresses, URLs, attribute names
 */

import type { Locale } from '../locale';
import en from './en';
import zhCN from './zh-CN';
import zhTW from './zh-TW';
import ja from './ja';
import ko from './ko';

export type MessageKey = keyof typeof en;

/**
 * Type used by each translation file. Values are plain strings (no
 * literal-type coupling to English), but keys are checked against the
 * English source so a typo in a key becomes a compile error.
 */
export type MessageDictionary = Record<MessageKey, string>;

export const MESSAGES = {
	en,
	'zh-CN': zhCN,
	'zh-TW': zhTW,
	ja,
	ko
} as const satisfies Record<Locale, Partial<MessageDictionary>>;

/**
 * Dev-mode diagnostic: print missing keys per locale so maintainers see
 * translation gaps immediately while browsing the app.
 */
if (typeof console !== 'undefined') {
	const enKeys = Object.keys(en) as MessageKey[];
	for (const locale of Object.keys(MESSAGES) as Locale[]) {
		if (locale === 'en') continue;
		const dict = MESSAGES[locale];
		const missing = enKeys.filter((k) => !(k in dict));
		if (missing.length > 0 && typeof window !== 'undefined') {
			// eslint-disable-next-line no-console
			console.info(
				`[i18n] ${locale} is missing ${missing.length}/${enKeys.length} translations (${Math.round(((enKeys.length - missing.length) / enKeys.length) * 100)}% coverage)`
			);
		}
	}
}
