// Shared theme state so any component (e.g. the mail detail page, whose email
// iframe can't see parent CSS vars) can react to light/dark switches.
import { writable } from 'svelte/store';

export type Theme = 'dark' | 'light';

function readTheme(): Theme {
	if (typeof document === 'undefined') return 'dark';
	return document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
}

export const themeStore = writable<Theme>(readTheme());

export function applyTheme(next: Theme) {
	document.documentElement.setAttribute('data-theme', next);
	themeStore.set(next);
	try {
		localStorage.setItem('krsz-theme', next);
	} catch {
		/* ignore */
	}
}
