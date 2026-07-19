// Keyboard shortcuts for the mail app.
// Attach to the document-level keydown listener once from the mail layout.

export interface ShortcutMap {
	[key: string]: () => void;
}

let registered = false;

export function registerMailShortcuts(map: ShortcutMap): () => void {
	if (registered) return () => {};
	registered = true;

	function handler(event: KeyboardEvent) {
		// Don't fire when typing in inputs/textarea/contenteditable
		const tag = (event.target as HTMLElement)?.tagName;
		if (tag === 'INPUT' || tag === 'TEXTAREA' || (event.target as HTMLElement)?.isContentEditable) {
			// Allow Escape in inputs
			if (event.key !== 'Escape') return;
		}

		const key = event.key.toLowerCase();

		// Ctrl/Cmd shortcuts
		if ((event.ctrlKey || event.metaKey) && key === 'k') {
			event.preventDefault();
			map['search']?.();
			return;
		}

		// Single-key shortcuts — only when not in an input
		if (tag === 'INPUT' || tag === 'TEXTAREA') return;

		if (event.key === '?' || event.key === '/') {
			event.preventDefault();
			map['search']?.();
			return;
		}

		// Single letter keys
		if (key === 'c') { event.preventDefault(); map['compose']?.(); }
		else if (key === 'r' || key === 'R') { event.preventDefault(); map['reply']?.(); }
		else if (key === 'u') { event.preventDefault(); map['markUnread']?.(); }
		else if (key === 's') { event.preventDefault(); map['star']?.(); }
		else if (key === '#') { event.preventDefault(); map['trash']?.(); }
		else if (key === 'e') { event.preventDefault(); map['archive']?.(); }
		else if (key === 'i' || key === 'g') { event.preventDefault(); map['inbox']?.(); }
		else if (key === 'escape') { event.preventDefault(); map['close']?.(); }
	}

	document.addEventListener('keydown', handler);
	return () => {
		document.removeEventListener('keydown', handler);
		registered = false;
	};
}