// In-memory store for the user's login password.
// Held only for the lifetime of the page; cleared on tab close / refresh.
import { writable } from 'svelte/store';

const _password = writable<string | null>(null);

export const sessionPassword = {
	subscribe: _password.subscribe,
	set: (v: string | null) => _password.set(v),
	clear: () => _password.set(null)
};