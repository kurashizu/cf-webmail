-- Migration 0003: drop the Junk folder.
-- Nothing ever classifies mail into Junk, so it's only a stale empty row.
-- Remove any leftovers and the folder entry for existing accounts.
-- New accounts never create it (removed from DEFAULT_FOLDERS).

DELETE FROM attachments
 WHERE message_id IN (SELECT id FROM messages WHERE folder = 'Junk');

DELETE FROM messages WHERE folder = 'Junk';

DELETE FROM folders WHERE name = 'Junk';