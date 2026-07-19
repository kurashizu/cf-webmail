// Shared toast store — imported by pages to show toasts, consumed by Toast.svelte
import { writable } from 'svelte/store';

export interface ToastAction {
	label: string;
	onclick: () => void;
}

export interface ToastEntry {
	id: string;
	message: string;
	kind: 'success' | 'error' | 'info' | 'warning';
	action?: ToastAction;
	leaving: boolean;
}

function createToastStore() {
	const { subscribe, update } = writable<ToastEntry[]>([]);
	let counter = 0;

	function add(message: string, kind: ToastEntry['kind'] = 'info', action?: ToastAction) {
		const id = `toast-${++counter}`;
		const entry: ToastEntry = { id, message, kind, action, leaving: false };
		update((list) => [...list, entry]);
		const duration = action ? 8000 : 4000;
		setTimeout(() => dismiss(id), duration);
		return id;
	}

	function dismiss(id: string) {
		update((list) => list.map((t) => (t.id === id ? { ...t, leaving: true } : t)));
		setTimeout(() => {
			update((list) => list.filter((t) => t.id !== id));
		}, 300);
	}

	return {
		subscribe,
		success: (msg: string) => add(msg, 'success'),
		error: (msg: string) => add(msg, 'error'),
		warning: (msg: string) => add(msg, 'warning'),
		info: (msg: string) => add(msg, 'info'),
		add,
		dismiss
	};
}

export const toastStore = createToastStore();
