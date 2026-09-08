import { z } from 'zod';

import {
  participationNotesSchema,
  participationStatusSchema,
  taskPrioritySchema,
  taskStatusSchema,
  taskTitleSchema,
  watchlistNameSchema,
} from './enums.js';

// Projections are what leaves the database. Everything is strict, and each
// projection carries only its own domain's fields — a task row never carries
// project detail, which belongs to the Catalog read models.

export const userTaskRowSchema = z
  .strictObject({
    taskId: z.uuid(),
    userId: z.uuid(),
    projectId: z.uuid().nullable(),
    title: taskTitleSchema,
    status: taskStatusSchema,
    priority: taskPrioritySchema,
    dueAt: z.iso.datetime({ offset: true }).nullable(),
    completedAt: z.iso.datetime({ offset: true }).nullable(),
    version: z.number().int().min(1),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .refine((row) => (row.status === 'completed') === (row.completedAt !== null), {
    message: 'A completed task must carry completedAt, and no other status may.',
  });

export const watchlistRowSchema = z.strictObject({
  watchlistId: z.uuid(),
  name: watchlistNameSchema,
  isDefault: z.boolean(),
  projectCount: z.number().int().min(0),
  version: z.number().int().min(1),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const watchlistProjectRowSchema = z.strictObject({
  watchlistId: z.uuid(),
  projectId: z.uuid(),
  addedAt: z.string(),
});

export const userProjectParticipationRowSchema = z.strictObject({
  projectId: z.uuid(),
  participationStatus: participationStatusSchema,
  notes: participationNotesSchema,
  startedAt: z.iso.datetime({ offset: true }).nullable(),
  updatedAt: z.string(),
});

export type UserTaskRow = z.infer<typeof userTaskRowSchema>;
export type WatchlistRow = z.infer<typeof watchlistRowSchema>;
export type WatchlistProjectRow = z.infer<typeof watchlistProjectRowSchema>;
export type UserProjectParticipationRow = z.infer<typeof userProjectParticipationRowSchema>;
