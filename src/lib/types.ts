export type Address = { addr: string; name: string | null };

export type Folder = {
	name: string;
	unread_count: number;
	total_count: number;
	last_message_at: number | null;
	computed_total?: number;
};

export type Message = {
	id: string;
	folder: string;
	direction: 'inbound' | 'outbound';
	from_addr: string;
	from_name: string | null;
	to_addrs: string;
	cc_addrs: string;
	subject: string;
	preview: string;
	flags: string;
	has_attachments: number;
	size: number;
	received_at: number;
	message_id: string | null;
	in_reply_to: string | null;
	thread_id: string | null;
};
