import { z } from "zod";

export const JulesSessionSchema = z.object({
  id: z.string(),
  name: z.string().optional().default(""),
  title: z.string().optional().default(""),
  repository: z.string().default("unknown/repo"),
  branch: z.string().default("main"),
  prompt: z.string().default(""),
  state: z.string().default("QUEUED"),
  createTime: z.string().optional(),
  updateTime: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional().default({}),
});
export type JulesSession = z.infer<typeof JulesSessionSchema>;

export const ListSessionsResponseSchema = z.object({
  sessions: z.array(JulesSessionSchema).default([]),
  nextPageToken: z.string().optional(),
});
export type ListSessionsResponse = z.infer<typeof ListSessionsResponseSchema>;

export const JulesPlanStepSchema = z.object({
  id: z.union([z.number(), z.string()]),
  description: z.string(),
  status: z.string().optional().default("PENDING"),
});

export const JulesPlanSchema = z.object({
  steps: z.array(JulesPlanStepSchema).default([]),
  summary: z.string().optional(),
});

export const JulesPatchSchema = z.object({
  diff: z.string().optional(),
  filesChanged: z.array(z.string()).optional().default([]),
});

export const JulesActivitySchema = z.object({
  id: z.string(),
  sessionId: z.string(),
  type: z.string(),
  content: z.string().optional().default(""),
  plan: JulesPlanSchema.optional(),
  patch: JulesPatchSchema.optional(),
  toolCall: z.record(z.string(), z.unknown()).optional(),
  toolResult: z.record(z.string(), z.unknown()).optional(),
  createTime: z.string().optional(),
});
export type JulesActivity = z.infer<typeof JulesActivitySchema>;

export const ListActivitiesResponseSchema = z.object({
  activities: z.array(JulesActivitySchema).default([]),
  nextPageToken: z.string().optional(),
});
export type ListActivitiesResponse = z.infer<typeof ListActivitiesResponseSchema>;

export const SendMessageRequestSchema = z.object({
  message: z.string().min(1),
  clientToken: z.string().optional(),
});
export type SendMessageRequest = z.infer<typeof SendMessageRequestSchema>;

export const ApprovePlanRequestSchema = z.object({
  approved: z.boolean(),
  feedback: z.string().optional(),
  clientToken: z.string().optional(),
});
export type ApprovePlanRequest = z.infer<typeof ApprovePlanRequestSchema>;
