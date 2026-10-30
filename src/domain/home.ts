import { z } from "zod";

/**
 * Home ("Today") model — the owner's daily landing view: greeting + the
 * "Needs you" task cards (each a Cori-surfaced action), plus the right-rail
 * summaries (handled-for-you, this week, today's cleans).
 */

export const TaskTone = z.enum(["danger", "info", "success", "violet", "warning"]);

export const TaskCard = z.object({
  id: z.string(),
  eyebrow: z.string(),
  eyebrowTone: TaskTone,
  icon: z.string(),
  title: z.string(),
  subtitle: z.string(),
  primaryAction: z.string(),
  primaryIcon: z.string().optional(),
  expandable: z.boolean().optional(),
  draft: z
    .object({
      label: z.string(),
      meta: z.string(),
      body: z.string(),
    })
    .optional(),
});

export const Home = z.object({
  greeting: z.object({
    date: z.string(),
    title: z.string(),
    needCount: z.number(),
    handledCount: z.number(),
    doneToday: z.number(),
    totalToday: z.number(),
  }),
  tasks: z.array(TaskCard),
  handledForYou: z.object({
    total: z.number(),
    items: z.array(z.object({ icon: z.string(), label: z.string(), count: z.number() })),
  }),
  thisWeek: z.object({
    openQuotes: z.object({ value: z.string(), caption: z.string() }),
    newLeads: z.object({ value: z.string(), caption: z.string() }),
  }),
  todaysCleans: z.array(
    z.object({ time: z.string(), name: z.string(), detail: z.string(), status: z.string() }),
  ),
});

export type Home = z.infer<typeof Home>;
export type TaskCard = z.infer<typeof TaskCard>;
