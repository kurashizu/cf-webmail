/**
 * Client-side locale store + sync helpers.
 *
 * The server sets the canonical locale per request (in hooks.server.ts).
 * On the client, we mirror it into a Svelte store so `$locale` and `t(...)`
 * stay reactive without going through a full page reload.
 */

import { writable, get } from 'svelte/store';
import {
	DEFAULT_LOCALE,
	COOKIE_NAME,
	COOKIE_MAX_AGE,
	type Locale,
	isLocale
} from './locale';

function detectFromCookie(): Locale | null {
	if (typeof document === 'undefined') return null;
	const match = document.cookie.split('; ').find((row) => row.startsWith(`${COOKIE_NAME}=`));
	if (!match) return null;
	const value = decodeURIComponent(match.slice(COOKIE_NAME.length + 1));
	return isLocale(value) ? value : null;
}

export const locale = writable<Locale>(DEFAULT_LOCALE);

/** Hydrate the client store from SSR-injected data. Called once at root layout. */
export function initLocale(value: string | undefined): void {
	if (isLocale(value)) {
		locale.set(value);
		// Cookie may have been out of sync (e.g. cleared between visits) — re-sync.
		if (typeof document !== 'undefined') {
			const cookieValue = detectFromCookie();
			if (cookieValue !== value) {
				document.cookie = `${COOKIE_NAME}=${value}; path=/; max-age=${COOKIE_MAX_AGE}; samesite=lax`;
			}
			document.documentElement.lang = value;
		}
	}
}

/** Switch locale, persist the cookie, and reload to re-render SSR. */
export async function setLocale(value: Locale): Promise<void> {
	locale.set(value);
	if (typeof document !== 'undefined') {
		document.cookie = `${COOKIE_NAME}=${value}; path=/; max-age=${COOKIE_MAX_AGE}; samesite=lax`;
		document.documentElement.lang = value;
		// Hard reload so every load function re-runs against the new cookie.
		window.location.reload();
	}
}

/** Read the current locale without subscribing. */
export function currentLocale(): Locale {
	return get(locale);
}

export {
	LOCALES,
	LOCALE_LABELS,
	LOCALE_SHORT,
	LOCALE_BCP47,
	COOKIE_NAME,
	COOKIE_MAX_AGE,
	DEFAULT_LOCALE,
	isLocale,
	negotiateLocale,
	type Locale
} from './locale';

import { MESSAGES, type MessageKey } from './messages';

export type { MessageKey };

/**
 * Translate a key with optional parameter interpolation.
 *
 *   t(locale, 'inbox.unreadCount', { count: 5 })  // "5 messages" or "5 条消息"
 *
 * English plurals: keys suffixed with `_one` override the default for count=1.
 * CJK languages use a single form regardless of count.
 *
 * Missing keys fall back to English, then to the raw key string.
 */
export function t(
	locale: Locale,
	key: MessageKey | string,
	params: Record<string, string | number> = {}
): string {
	const dict = (MESSAGES[locale] ?? MESSAGES[DEFAULT_LOCALE]) as Record<
		MessageKey,
		string
	>;

	// English plural: try `${key}_one` first when count === 1.
	let template: string | undefined;
	if (locale === 'en' && params.count === 1) {
		template = dict[`${key}_one` as MessageKey];
	}
	if (template === undefined) {
		template = dict[key as MessageKey];
	}
	// Fallback chain: requested locale → English → raw key
	if (template === undefined && locale !== DEFAULT_LOCALE) {
		template = (MESSAGES[DEFAULT_LOCALE] as Record<MessageKey, string>)[
			key as MessageKey
		];
	}
	if (template === undefined) return String(key);

	return interpolate(template, params);
}

function interpolate(template: string, params: Record<string, string | number>): string {
	return template.replace(/\{(\w+)\}/g, (match, name) => {
		const value = params[name];
		return value === undefined || value === null ? match : String(value);
	});
}
