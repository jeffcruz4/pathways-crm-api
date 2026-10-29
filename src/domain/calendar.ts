import { z } from "zod";

/** Appointment (calendar) + Daily Digest aggregation models. */

export const ApptKind = z.enum(["clean", "walkthrough", "quote", "partner"]);

export const Appointment = z.object({
  id: z.string(),
  dayIndex: z.number(), // 0 = Mon ... 6 = Sun
  start: z.string(), // "09:00"
  durationMin: z.number(),
  title: z.string(),
  detail: z.string(),
  kind: ApptKind,
});

export const CalendarWeek = z.object({
  weekDays: z.array(z.string()),
  summary: z.object({
    weekLabel: z.string(),
    jobsThisWeek: z.number(),
    hoursBooked: z.string(),
    openSlots: z.number(),
  }),
  appointments: z.array(Appointment),
});

export const TomorrowItem = z.object({
  icon: z.string(),
  iconTone: z.enum(["brand", "info", "violet", "success"]),
  title: z.string(),
  detail: z.string(),
  coriNote: z.string(),
});

export const Digest = z.object({
  date: z.string(),
  allClear: z.boolean(),
  headline: z.string(),
  sub: z.string(),
  handled: z.object({
    total: z.number(),
    items: z.array(z.object({ icon: z.string(), label: z.string(), count: z.number() })),
  }),
  tomorrow: z.object({
    label: z.string(),
    date: z.string(),
    items: z.array(TomorrowItem),
  }),
  todaysAgenda: z.array(
    z.object({ time: z.string(), name: z.string(), detail: z.string(), status: z.string() }),
  ),
});

export type Appointment = z.infer<typeof Appointment>;
export type CalendarWeek = z.infer<typeof CalendarWeek>;
export type Digest = z.infer<typeof Digest>;
