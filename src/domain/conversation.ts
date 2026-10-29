import { z } from "zod";

/**
 * Conversation model — calls + texts tied to a contact, with Cori's extracted
 * record updates and suggested replies as first-class data.
 */

export const ChannelKind = z.enum(["call", "text"]);
export const ConvoFlag = z.enum(["needs-reply", "new-lead", "quote-viewed", "none"]);
export const ThreadEntryKind = z.enum(["call", "inbound", "outbound", "note"]);

export const ConvoListItem = z.object({
  id: z.string(),
  name: z.string(),
  time: z.string(),
  kind: ChannelKind,
  kindLabel: z.string(),
  preview: z.string(),
  flag: ConvoFlag,
  unread: z.boolean().optional(),
});

export const ThreadEntry = z.object({
  id: z.string(),
  kind: ThreadEntryKind,
  text: z.string(),
  meta: z.string().optional(),
  chips: z.array(z.string()).optional(),
  hasTranscript: z.boolean().optional(),
  dayDivider: z.string().optional(),
});

export const ConversationDetail = z.object({
  id: z.string(),
  name: z.string(),
  phone: z.string(),
  location: z.string(),
  flag: ConvoFlag,
  entries: z.array(ThreadEntry),
  suggestedReply: z.string(),
  recordUpdates: z.array(z.object({ label: z.string(), value: z.string() })),
  recordNote: z.string().optional(),
  customer: z.object({
    home: z.string(),
    service: z.string(),
    property: z.string(),
    estValue: z.string(),
    customerId: z.string().optional(),
  }),
});

export type ConvoListItem = z.infer<typeof ConvoListItem>;
export type ConversationDetail = z.infer<typeof ConversationDetail>;
export type ThreadEntry = z.infer<typeof ThreadEntry>;
