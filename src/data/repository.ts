import type { Customer, CustomerListItem, CustomerCreate } from "../domain/customer.js";
import type { Partner, PartnerListItem, PartnerCreate } from "../domain/partner.js";
import type { TeamMember, TeamMemberListItem, TeamMemberCreate } from "../domain/team-member.js";
import type { CustomerStats } from "../domain/customer-stats.js";
import type { Pipeline } from "../domain/deal.js";
import type { ConvoListItem, ConversationDetail } from "../domain/conversation.js";
import type { CalendarWeek, Digest } from "../domain/calendar.js";
import type { Home } from "../domain/home.js";
import type {
  Contact,
  ContactCreate,
  Property,
  PropertyCreate,
  Plan,
  PlanCreate,
  Quote,
  QuoteCreate,
  Job,
  JobCreate,
  Review,
  ReviewCreate,
  ServiceOffering,
  ServiceOfferingCreate,
  ServiceOfferingUpdate,
  Appointment,
  AppointmentCreate,
} from "../domain/crm.js";

/**
 * The data access seam. Both a memory implementation and a Postgres (Drizzle)
 * implementation satisfy this interface. Reads assemble the 360° customer
 * record from related entities; writes create those records.
 */
export interface Repository {
  // Home (today)
  getHome(): Promise<Home>;

  // Customers
  listCustomers(): Promise<CustomerListItem[]>;
  getCustomerStats(): Promise<CustomerStats>;
  getCustomer(id: string): Promise<Customer | undefined>;
  createCustomer(input: CustomerCreate): Promise<Customer>;

  // Customer sub-resources (the 360° record)
  addContact(customerId: string, input: ContactCreate): Promise<Contact | undefined>;
  addProperty(customerId: string, input: PropertyCreate): Promise<Property | undefined>;
  createPlan(customerId: string, input: PlanCreate): Promise<Plan | undefined>;
  createQuote(customerId: string, input: QuoteCreate): Promise<Quote | undefined>;
  createJob(customerId: string, input: JobCreate): Promise<Job | undefined>;
  addJobReview(customerId: string, jobId: string, input: ReviewCreate): Promise<Review | undefined>;
  listAppointments(customerId: string): Promise<Appointment[] | undefined>;
  createAppointment(customerId: string, input: AppointmentCreate): Promise<Appointment | undefined>;

  // Service offerings (reusable catalog / plan templates)
  listServiceOfferings(): Promise<ServiceOffering[]>;
  createServiceOffering(input: ServiceOfferingCreate): Promise<ServiceOffering>;
  updateServiceOffering(
    id: string,
    input: ServiceOfferingUpdate,
  ): Promise<ServiceOffering | undefined>;

  // Partners
  listPartners(): Promise<PartnerListItem[]>;
  getPartner(id: string): Promise<Partner | undefined>;
  createPartner(input: PartnerCreate): Promise<Partner>;

  // Team members (full-time staff)
  listTeamMembers(): Promise<TeamMemberListItem[]>;
  createTeamMember(input: TeamMemberCreate): Promise<TeamMember>;

  // Pipeline
  getPipeline(): Promise<Pipeline>;

  // Conversations
  listConversations(): Promise<ConvoListItem[]>;
  getConversation(id: string): Promise<ConversationDetail | undefined>;

  // Calendar + digest
  getCalendarWeek(): Promise<CalendarWeek>;
  getDigest(): Promise<Digest>;
}
