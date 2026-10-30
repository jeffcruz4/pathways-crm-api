import type { Customer } from "../domain/customer.js";
import type { Partner } from "../domain/partner.js";
import type { Pipeline } from "../domain/deal.js";
import type { ConvoListItem, ConversationDetail } from "../domain/conversation.js";
import type { CalendarWeek, Digest } from "../domain/calendar.js";

/**
 * Seed dataset — the same sample content the UI currently renders from its mock
 * modules, now owned by the API. This is the single source of sample truth; the
 * memory repository serves it, and the Postgres seed script will load it.
 */

export const customers: Customer[] = [
  {
    id: "c-tom-becker",
    name: "Tom Becker",
    phone: "(856) 555-0187",
    location: "118 Kings Hwy, Swedesboro",
    plan: "Biweekly (quote)",
    status: "lead",
    stage: "quote",
    lifetimeValue: 0,
    lastService: "—",
    nextService: "Thu 1:00 PM (proposed)",
    tags: ["New lead", "Biweekly", "2 dogs"],
    provenance: "Cori built this profile from a 4m 12s call yesterday at 4:52 PM.",
    summary:
      "Tom wants biweekly cleaning for his 2,400 sq ft home — 4 bedrooms, 3 bathrooms, two friendly dogs. He'd like to start with a deep clean, and Thursday afternoons work best. He works from home, so no key is needed.",
    homeDetails: [
      { icon: "home", value: "2,400", label: "Square feet", meta: "0:12" },
      { icon: "home", value: "4", label: "Bedrooms", meta: "0:47" },
      { icon: "home", value: "3", label: "Bathrooms", meta: "0:47" },
      { icon: "users", value: "2 dogs", label: "Pets", meta: "1:20" },
      { icon: "board", value: "Biweekly", label: "Frequency", meta: "3:55" },
      { icon: "check", value: "Deep clean", label: "First visit", meta: "3:40" },
      { icon: "home", value: "Home during visits", label: "Access", meta: "2:10" },
      { icon: "clock", value: "Thu afternoons", label: "Best time", meta: "3:55" },
    ],
    nextStep: {
      title: "Send quote & book Thursday 1:00 PM",
      lineItems: [
        { label: "First deep clean", value: "$795" },
        { label: "Then biweekly", value: "$245 / visit" },
      ],
      cta: "Approve & send",
    },
    goodToKnow: [
      "Two friendly dogs — keep the gate closed",
      "Works from home, so no key or lockbox",
      "Wants to start with a deep clean",
    ],
    activity: [
      { icon: "call", text: "Incoming call · 4m 12s — Yesterday 4:52 PM · via Twilio · transcript ready", time: "" },
      { icon: "cori", text: "Contact created & 8 home details filled", time: "4:56 PM" },
      { icon: "cori", text: "Opportunity created · Quote ready", time: "4:56 PM" },
      { icon: "cori", text: "Quote drafted: $795 deep clean, then $245 biweekly", time: "4:57 PM" },
    ],
  },
  {
    id: "c-gloria-hynes",
    name: "Gloria Hynes",
    phone: "(856) 555-0143",
    location: "Swedesboro, NJ",
    plan: "Standard · weekly",
    status: "active",
    stage: "recurring",
    lifetimeValue: 3120,
    lastService: "Today",
    nextService: "Oct 31",
    tags: ["Active", "Weekly"],
    provenance: "Profile enriched by Cori across 14 calls and texts.",
    summary:
      "Gloria is a weekly standard-clean customer in Swedesboro, with us since March. Reliable, pays on time, prefers morning visits.",
    homeDetails: [
      { icon: "home", value: "1,600", label: "Square feet" },
      { icon: "home", value: "3", label: "Bedrooms" },
      { icon: "home", value: "2", label: "Bathrooms" },
      { icon: "board", value: "Weekly", label: "Frequency" },
    ],
    goodToKnow: ["Prefers morning visits", "Spare key under the mat (left side)"],
    activity: [
      { icon: "cori", text: "Visit completed · Standard clean", time: "Today 9:00 AM" },
      { icon: "cori", text: "Reminder text sent", time: "Yesterday" },
    ],
  },
  { id: "c-marcus-reed", name: "Marcus Reed", phone: "(856) 555-0170", location: "Mullica Hill, NJ", plan: "Weekly", status: "active", stage: "recurring", lifetimeValue: 4260, lastService: "5 days ago", nextService: "Oct 29", tags: ["Active", "Weekly"], provenance: "Profile enriched by Cori.", summary: "Weekly customer in Mullica Hill, highest lifetime value in the book.", homeDetails: [], goodToKnow: [], activity: [] },
  { id: "c-porters", name: "The Porters", phone: "(856) 555-0199", location: "Mantua, NJ", plan: "Biweekly (quote)", status: "lead", stage: "quote", lifetimeValue: 0, lastService: "—", tags: ["Lead", "Biweekly"], provenance: "Cori built this profile from a web form.", summary: "Quote sent for biweekly cleaning; viewed twice, no reply in 6 days.", homeDetails: [], goodToKnow: [], activity: [] },
  { id: "c-rachel-owens", name: "Rachel Owens", phone: "(856) 555-0142", location: "Glassboro, NJ", plan: "Move-out clean", status: "lead", stage: "quote", lifetimeValue: 0, lastService: "—", nextService: "Oct 30", tags: ["Lead", "Move-out"], provenance: "Cori built this profile from a 6m 03s call.", summary: "Selling her home, needs a move-out clean once she knows her closing date.", homeDetails: [], goodToKnow: [], activity: [] },
  { id: "c-dwayne-foster", name: "Dwayne Foster", phone: "(856) 555-0121", location: "Sewell, NJ", plan: "One-time deep", status: "lapsed", stage: "recurring", lifetimeValue: 820, lastService: "4 months ago", tags: ["Lapsed"], provenance: "Profile from past jobs.", summary: "One-time deep clean customer from the spring; hasn't rebooked.", homeDetails: [], goodToKnow: [], activity: [] },
  { id: "c-gina-alvarez", name: "Gina Alvarez", phone: "(856) 555-0188", location: "Pitman, NJ", plan: "Move-out clean", status: "active", stage: "booked", lifetimeValue: 540, lastService: "1 week ago", tags: ["Active"], provenance: "Referred by Harbor Realty.", summary: "Move-out clean customer; also sending us neighbor referrals.", homeDetails: [], goodToKnow: [], activity: [] },
];

export const customersSummary = { total: 128, active: 94, newThisMonth: 9, avgLtv: "$2,480" };

export const partners: Partner[] = [
  {
    id: "p1", name: "A&J Contractors", contact: "Ana Jimenez", location: "Gloucester County, NJ",
    type: "contractor", stage: "active", leadsGenerated: 0, jobsCovered: 23, value: 7360, since: "Mar 2026",
    summary: "Two-person crew we call for overflow move-out jobs. Reliable on short notice, strong on deep cleans. Prefers 24h lead time.",
    employment: { engagement: "1099 contractor crew", rate: "$34/hr per cleaner", coverage: "Gloucester + Salem County · Mon–Sat", insurance: "GL policy on file (exp. Aug 2027)" },
    activity: [
      { date: "Oct 24", text: "Covered Rachel Owens move-out (3h)" },
      { date: "Oct 18", text: "Accepted overflow for Pitman deep clean" },
      { date: "Oct 11", text: "Invoice #A-204 paid ($612)" },
    ],
  },
  {
    id: "p2", name: "Harbor Realty", contact: "Dennis Walsh", location: "Mullica Hill, NJ",
    type: "lead-gen", stage: "active", leadsGenerated: 31, jobsCovered: 0, value: 9120, since: "Jan 2026",
    summary: "Real-estate brokerage that refers move-out and listing-prep cleans. Highest-volume referral partner; sends 3–5 leads/week.",
    employment: { engagement: "Referral affiliate", rate: "12% of first job", coverage: "Listings across South Jersey", insurance: "n/a (referral only)" },
    activity: [
      { date: "Oct 25", text: "Referred Gina Alvarez (move-out)" },
      { date: "Oct 22", text: "Referred 2 listing-prep cleans" },
      { date: "Oct 15", text: "Referral payout sent ($340)" },
    ],
  },
  {
    id: "p3", name: "SparkClean Crew", contact: "Mo Farah", location: "Deptford, NJ",
    type: "contractor", stage: "onboarding", leadsGenerated: 0, jobsCovered: 2, value: 410, since: "Oct 2026",
    summary: "New contractor crew in onboarding. Background checks clear; completing first supervised jobs before full roster access.",
    employment: { engagement: "1099 contractor (probationary)", rate: "$30/hr per cleaner", coverage: "Deptford / Woodbury · weekends", insurance: "Pending — COI requested" },
    activity: [
      { date: "Oct 23", text: "Completed 2nd supervised job (passed QA)" },
      { date: "Oct 19", text: "Signed contractor agreement" },
      { date: "Oct 14", text: "Background check cleared" },
    ],
  },
  {
    id: "p4", name: "Gina Alvarez", contact: "Gina Alvarez", location: "Pitman, NJ",
    type: "lead-gen", stage: "vetting", leadsGenerated: 4, jobsCovered: 0, value: 0, since: "Oct 2026",
    summary: "Happy customer turning into a referral source — already sent 4 neighbors. Evaluating her for the formal referral program.",
    employment: { engagement: "Customer referral (informal)", rate: "TBD — proposing 10%", coverage: "Pitman neighborhood", insurance: "n/a" },
    activity: [
      { date: "Oct 26", text: "Sent 4th neighbor referral" },
      { date: "Oct 20", text: "Asked about referral rewards" },
    ],
  },
  {
    id: "p5", name: "TidyTeam LLC", contact: "Rosa Nunez", location: "Washington Twp, NJ",
    type: "both", stage: "prospect", leadsGenerated: 0, jobsCovered: 0, value: 0, since: "Oct 2026",
    summary: "Prospect crew that also manages a few HOA contracts (possible lead source). Intro call booked; not yet vetted.",
    employment: { engagement: "Prospect — not engaged", rate: "—", coverage: "Washington Twp · unknown availability", insurance: "Unknown" },
    activity: [{ date: "Oct 25", text: "Intro call scheduled for Fri 3 PM" }],
  },
];

export const partnersSummary = { active: 8, newInPipeline: 3, leadsThisMonth: 22, jobsCoveredThisMonth: 14 };

export const partnerAppointments = [
  { id: "pa1", when: "Fri · 3:00 PM", partner: "TidyTeam LLC", purpose: "Intro call" },
  { id: "pa2", when: "Fri · 3:00 PM", partner: "A&J Contractors", purpose: "Partner sync · overflow jobs" },
  { id: "pa3", when: "Mon · 10:00 AM", partner: "SparkClean Crew", purpose: "Onboarding check-in" },
];

export const pipeline: Pipeline = {
  summary: { openCount: 14, openValue: "$6,420", movedByCori: 9 },
  stages: [
    {
      id: "new", label: "New lead", dot: "#2563eb",
      deals: [
        { id: "d1", stageId: "new", name: "Caller (856) 555-0187", detail: "Unknown — missed call", signal: "cori", chip: "Auto-text sent 8:14 AM" },
        { id: "d2", stageId: "new", name: "Tom Becker", price: 245, priceUnit: "visit", detail: "Biweekly · Swedesboro", signal: "cori", chip: "Created from call · yesterday" },
        { id: "d3", stageId: "new", name: "Ana Silva", price: 495, priceUnit: "flat", detail: "Deep clean · Logan Twp", signal: "cori", chip: "Created from text · 2d ago" },
      ],
    },
    {
      id: "needs-quote", label: "Needs quote", dot: "#7c3aed",
      deals: [
        { id: "d4", stageId: "needs-quote", name: "Rachel Owens", price: 325, priceUnit: "flat", detail: "Move-out clean · Mullica Hill", signal: "cori", chip: "Moved after call · 1h ago" },
        { id: "d5", stageId: "needs-quote", name: "Sam Ortiz", price: 180, priceUnit: "visit", detail: "Weekly · Mullica Hill", signal: "info", chip: "Walkthrough today 1:30 PM" },
        { id: "d6", stageId: "needs-quote", name: "Gloria Hynes", price: 375, priceUnit: "flat", detail: "Standard clean · Swedesboro", signal: "info", chip: "Walkthrough Thu 11:00 AM" },
      ],
    },
    {
      id: "quote-sent", label: "Quote sent", dot: "#d97706",
      deals: [
        { id: "d7", stageId: "quote-sent", name: "Dave & Kim Porter", price: 225, priceUnit: "visit", detail: "Biweekly · Woolwich", signal: "needs-you", chip: "No reply in 6 days — needs you", needsYou: true },
        { id: "d8", stageId: "quote-sent", name: "Mark Delaney", price: 695, priceUnit: "flat", detail: "Deep clean · E. Greenwich", signal: "info", chip: "Viewed yesterday" },
        { id: "d9", stageId: "quote-sent", name: "Linda Ferraro", price: 410, priceUnit: "flat", detail: "Standard + fridge · Harrison Twp", signal: "needs-you", chip: "Asked a question · 3h", needsYou: true },
      ],
    },
    {
      id: "follow-up", label: "Follow-up", dot: "#dc2626",
      deals: [
        { id: "d10", stageId: "follow-up", name: "Chris Dunn", price: 850, priceUnit: "flat", detail: "Post-construction · Mickleton", signal: "cori", chip: "Said \u201Ccall me in October\u201D \u2192 Oct 1" },
        { id: "d11", stageId: "follow-up", name: "Pat Moreno", price: 165, priceUnit: "visit", detail: "Weekly · Swedesboro", signal: "needs-you", chip: "Price objection — needs you", needsYou: true },
      ],
    },
    {
      id: "booked", label: "Booked", dot: "#15803d",
      deals: [
        { id: "d12", stageId: "booked", name: "Beth Carney", price: 210, priceUnit: "visit", detail: "Biweekly · Woolwich", signal: "info", chip: "Today 4:00 PM" },
        { id: "d13", stageId: "booked", name: "Joan Pierce", price: 180, priceUnit: "visit", detail: "Weekly · Mullica Hill", signal: "info", chip: "Starts Oct 5 · card on file" },
        { id: "d14", stageId: "booked", name: "Hal Brenner", price: 450, priceUnit: "flat", detail: "Move-in clean · Logan Twp", signal: "cori", chip: "Moved after text \u201CLet\u2019s do it\u201D" },
      ],
    },
  ],
};

export const conversationList: ConvoListItem[] = [
  { id: "rachel", name: "Rachel Owens", time: "10:05 AM", kind: "call", kindLabel: "Call · 6m 03s", preview: "Closing Oct 2. Wants a move-out clean quote by Thursday.", flag: "needs-reply", unread: true },
  { id: "unknown", name: "(856) 555-0187", time: "8:14 AM", kind: "call", kindLabel: "Missed call", preview: "Auto-text sent: \u201CSorry we missed you — how can we help?\u201D", flag: "needs-reply" },
  { id: "linda", name: "Linda Ferraro", time: "7:32 AM", kind: "text", kindLabel: "Text", preview: "\u201CCan you do the inside of the fridge too?\u201D", flag: "needs-reply" },
  { id: "tom", name: "Tom Becker", time: "Yesterday", kind: "call", kindLabel: "Call · 4m 12s", preview: "2,400 sq ft, 4 bed / 3 bath, two dogs, biweekly…", flag: "new-lead" },
  { id: "dave", name: "Dave Porter", time: "Sun", kind: "text", kindLabel: "Quote viewed", preview: "Opened quote #1042 — no reply yet.", flag: "quote-viewed" },
  { id: "gloria", name: "Gloria Hynes", time: "Sun", kind: "text", kindLabel: "Text", preview: "\u201CSee you at 9 on Tuesday!\u201D", flag: "none" },
];

export const conversations: Record<string, ConversationDetail> = {
  rachel: {
    id: "rachel", name: "Rachel Owens", phone: "(856) 555-0142", location: "42 Orchard Ln, Mullica Hill", flag: "needs-reply",
    entries: [
      { id: "e1", kind: "call", dayDivider: "Thu, Sept 18", text: "Incoming · 3m 40s · 2:10 PM", hasTranscript: true, meta: "She's selling her home and needs a move-out clean. Asked us to call Tuesday morning once she knows her closing date.", chips: ["Follow-up created: Tue AM"] },
      { id: "e2", kind: "outbound", text: "Thanks Rachel — we'll call you Tuesday morning. — Corvia Cleaning", meta: "Sent by Joe · 2:18 PM" },
      { id: "e3", kind: "call", dayDivider: "Today", text: "Outgoing · 6m 03s · 10:05 AM", hasTranscript: true, meta: "Closing is Oct 2, so the clean is needed Oct 1. 3 bed / 2 bath, about 1,800 sq ft, house will be empty. Wants a quote by Thursday.", chips: ["Stage → Needs quote", "Tentative: Wed Oct 1", "Service: Move-out clean"] },
      { id: "e4", kind: "inbound", text: "Can you send the quote by Thursday?", meta: "Text · 10:31 AM" },
    ],
    suggestedReply: "Yes — you'll have it Thursday by noon.",
    recordUpdates: [
      { label: "Stage", value: "New lead → Needs quote" },
      { label: "Service", value: "Move-out clean · 3 bed / 2 bath" },
      { label: "Tentative date", value: "Wed Oct 1 · house empty" },
      { label: "Task", value: "Send quote by Thursday" },
      { label: "Property", value: "~1,800 sq ft · Mullica Hill" },
    ],
    recordNote: "From today's 10:05 AM call. Nothing was typed.",
    customer: { home: "3 bed / 2 bath", service: "Move-out clean", property: "~1,800 sq ft", estValue: "$325", customerId: "c-rachel-owens" },
  },
};

export const calendarWeek: CalendarWeek = {
  weekDays: ["Mon 20", "Tue 21", "Wed 22", "Thu 23", "Fri 24", "Sat 25", "Sun 26"],
  summary: { weekLabel: "Oct 20 – 26", jobsThisWeek: 14, hoursBooked: "31h", openSlots: 5 },
  appointments: [
    { id: "a1", dayIndex: 2, start: "09:00", durationMin: 120, title: "Gloria Hynes", detail: "Standard clean · Swedesboro", kind: "clean" },
    { id: "a2", dayIndex: 2, start: "13:30", durationMin: 45, title: "Sam Ortiz", detail: "Walkthrough · Mullica Hill", kind: "walkthrough" },
    { id: "a3", dayIndex: 2, start: "16:00", durationMin: 150, title: "Beth Carney", detail: "Biweekly · Woolwich", kind: "clean" },
    { id: "a4", dayIndex: 3, start: "10:00", durationMin: 180, title: "Rachel Owens", detail: "Move-out clean · Glassboro", kind: "clean" },
    { id: "a5", dayIndex: 3, start: "14:00", durationMin: 60, title: "Tom Becker", detail: "First deep clean · intake", kind: "quote" },
    { id: "a6", dayIndex: 4, start: "09:30", durationMin: 90, title: "Marcus Reed", detail: "Weekly · Mullica Hill", kind: "clean" },
    { id: "a7", dayIndex: 4, start: "15:00", durationMin: 60, title: "A&J Contractors", detail: "Partner sync · overflow jobs", kind: "partner" },
    { id: "a8", dayIndex: 1, start: "11:00", durationMin: 120, title: "Gina Alvarez", detail: "Move-out clean · Pitman", kind: "clean" },
    { id: "a9", dayIndex: 5, start: "10:00", durationMin: 120, title: "Open slot", detail: "Available for booking", kind: "quote" },
  ],
};

export const digest: Digest = {
  date: "TUESDAY, SEPTEMBER 22",
  allClear: true,
  headline: "All clear for today",
  sub: "Nothing needs you right now. Cori will bring anything new straight here.",
  handled: {
    total: 31,
    items: [
      { icon: "phone", label: "Calls & texts logged", count: 14 },
      { icon: "users", label: "New contacts created", count: 6 },
      { icon: "board", label: "Deals moved forward", count: 4 },
      { icon: "clock", label: "Follow-ups scheduled", count: 7 },
    ],
  },
  tomorrow: {
    label: "Tomorrow at a glance",
    date: "Wed, Sept 23",
    items: [
      { icon: "calendar", iconTone: "info", title: "3 cleans booked", detail: "9:00 Porter · 11:30 Hynes · 2:00 Carney", coriNote: "All confirmed automatically" },
      { icon: "phone", iconTone: "violet", title: "1 promised callback", detail: "Chris Dunn — post-construction clean", coriNote: "Cori will remind you at 9 AM" },
      { icon: "doc", iconTone: "brand", title: "2 quotes Cori is watching", detail: "Mark Delaney · Linda Ferraro", coriNote: "Follow-ups drafted if no reply" },
      { icon: "clock", iconTone: "success", title: "Tom Becker's first deep clean", detail: "Thu 1:00 PM · 4 bed / 3 bath, 2 dogs", coriNote: "Reminder goes out Wed evening" },
    ],
  },
  todaysAgenda: [
    { time: "9:00 AM", name: "Gloria Hynes", detail: "Standard clean · Swedesboro", status: "Done" },
    { time: "1:30 PM", name: "Sam Ortiz", detail: "Walkthrough · Mullica Hill", status: "Next" },
    { time: "4:00 PM", name: "Beth Carney", detail: "Biweekly · Woolwich", status: "" },
  ],
};

import type { Home } from "../domain/home.js";

export const home: Home = {
  greeting: {
    date: "TUESDAY, SEPTEMBER 22",
    title: "Good morning, Joe",
    needCount: 5,
    handledCount: 31,
    doneToday: 1,
    totalToday: 6,
  },
  tasks: [
    {
      id: "missed-call",
      eyebrow: "MISSED CALL",
      eyebrowTone: "danger",
      icon: "phone-missed",
      title: "New caller · (856) 555-0187",
      subtitle: "Cori texted them back at 8:14 AM. No reply yet.",
      primaryAction: "Call back",
      primaryIcon: "phone",
    },
    {
      id: "promised-call",
      eyebrow: "YOU PROMISED A CALL",
      eyebrowTone: "violet",
      icon: "clock",
      title: "Rachel Owens — move-out clean",
      subtitle: "She asked for a call this morning once she knew her closing date.",
      primaryAction: "Call Rachel",
      primaryIcon: "phone",
    },
    {
      id: "quote-waiting",
      eyebrow: "QUOTE WAITING",
      eyebrowTone: "danger",
      icon: "doc",
      title: "The Porters — biweekly cleaning",
      subtitle: "Viewed twice, no reply in 6 days.",
      primaryAction: "Looks good — send",
      primaryIcon: "check",
      expandable: true,
      draft: {
        label: "Cori will text Kim Porter",
        meta: "Written in your style · signed by you",
        body:
          "\u201CHi Kim! Just checking in on the biweekly cleaning quote we sent last week. Happy to answer any questions or adjust the schedule — would a Thursday start work for you? — Joe, Corvia Cleaning\u201D",
      },
    },
    {
      id: "unanswered-text",
      eyebrow: "UNANSWERED TEXT",
      eyebrowTone: "info",
      icon: "chat",
      title: "Linda Ferraro",
      subtitle: "\u201CCan you do the inside of the fridge too?\u201D",
      primaryAction: "Review reply",
    },
    {
      id: "new-lead",
      eyebrow: "NEW LEAD",
      eyebrowTone: "success",
      icon: "users",
      title: "Tom Becker — first deep clean",
      subtitle: "4 bed / 3 bath, 2 dogs, wants biweekly. Thursday 1:00 PM is open.",
      primaryAction: "Book Thursday",
    },
  ],
  handledForYou: {
    total: 31,
    items: [
      { icon: "phone", label: "Calls & texts logged", count: 14 },
      { icon: "users", label: "New contacts created", count: 6 },
      { icon: "board", label: "Deals moved forward", count: 4 },
      { icon: "clock", label: "Follow-ups scheduled", count: 7 },
    ],
  },
  thisWeek: {
    openQuotes: { value: "$2,515", caption: "6 waiting on a yes" },
    newLeads: { value: "9", caption: "4 booked so far" },
  },
  todaysCleans: [
    { time: "9:00 AM", name: "Gloria Hynes", detail: "Standard clean · Swedesboro", status: "Done" },
    { time: "1:30 PM", name: "Sam Ortiz", detail: "Walkthrough · Mullica Hill", status: "Next" },
    { time: "4:00 PM", name: "Beth Carney", detail: "Biweekly · Woolwich", status: "" },
  ],
};
