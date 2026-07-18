// Parse the +page load's "to_addrs" / "cc_addrs" JSON into a friendly list.
import type { Address } from './types';

export function decodeAddresses(s) {
	if (!s) return [];
	try {
		const arr = JSON.parse(s);
		return arr;
	} catch {
		return [];
	}
}

export function formatAddresses(arr) {
	if (!Array.isArray(arr) || !arr.length) return '';
	return arr
		.map((a) => (a?.name ? `${a.name} <${a.addr}>` : a?.addr || ''))
		.filter(Boolean)
		.join(', ');
}

export function formatDate(ts) {
	if (!ts) return '';
	const d = new Date(ts);
	const now = new Date();
	const sameDay =
		d.getFullYear() === now.getFullYear() &&
		d.getMonth() === now.getMonth() &&
		d.getDate() === now.getDate();
	if (sameDay) {
		return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
	}
	return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

export function initials(name) {
	if (!name) return '?';
	const parts = name.trim().split(/\s+/);
	if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
	return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
