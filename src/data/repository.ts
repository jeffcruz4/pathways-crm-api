import type { Customer, CustomerListItem } from "../domain/customer.js";
import type { Partner, PartnerListItem } from "../domain/partner.js";
import type { Pipeline } from "../domain/deal.js";
import type { ConvoListItem, ConversationDetail } from "../domain/conversation.js";
import type { CalendarWeek, Digest } from "../domain/calendar.js";

/**
 * The data access seam. A memory implementation serves seeded sample data now;
 * a Postgres (Drizzle) implementation will satisfy the same interface later.
 * Read-only for the first milestone.
 */
export interface Repository {
  // Customers
  listCustomers(): Promise<CustomerListItem[]>;
  getCustomer(id: string): Promise<Customer | undefined>;

  // Partners
  listPartners(): Promise<PartnerListItem[]>;
  getPartner(id: string): Promise<Partner | undefined>;

  // Pipeline
  getPipeline(): Promise<Pipeline>;

  // Conversations
  listConversations(): Promise<ConvoListItem[]>;
  getConversation(id: string): Promise<ConversationDetail | undefined>;

  // Calendar + digest
  getCalendarWeek(): Promise<CalendarWeek>;
  getDigest(): Promise<Digest>;
}
