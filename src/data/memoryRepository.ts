import type { Repository } from "./repository.js";
import * as seed from "./seed.js";
import type { CustomerListItem } from "../domain/customer.js";
import type { PartnerListItem } from "../domain/partner.js";

/**
 * In-memory repository serving the seeded sample data. Used while RDS is not
 * wired (DATA_BACKEND=memory, the default). Read-only.
 */
export class MemoryRepository implements Repository {
  async listCustomers(): Promise<CustomerListItem[]> {
    return seed.customers.map((c) => ({
      id: c.id,
      name: c.name,
      location: c.location,
      plan: c.plan,
      status: c.status,
      stage: c.stage,
      lifetimeValue: c.lifetimeValue,
      lastService: c.lastService,
      nextService: c.nextService,
      tags: c.tags,
    }));
  }

  async getCustomer(id: string) {
    return seed.customers.find((c) => c.id === id);
  }

  async listPartners(): Promise<PartnerListItem[]> {
    return seed.partners.map((p) => ({
      id: p.id,
      name: p.name,
      contact: p.contact,
      location: p.location,
      type: p.type,
      stage: p.stage,
      leadsGenerated: p.leadsGenerated,
      jobsCovered: p.jobsCovered,
      value: p.value,
    }));
  }

  async getPartner(id: string) {
    return seed.partners.find((p) => p.id === id);
  }

  async getPipeline() {
    return seed.pipeline;
  }

  async listConversations() {
    return seed.conversationList;
  }

  async getConversation(id: string) {
    return seed.conversations[id];
  }

  async getCalendarWeek() {
    return seed.calendarWeek;
  }

  async getDigest() {
    return seed.digest;
  }
}
