import { z } from 'zod';
import { HttpError } from './errors.js';

export const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
}, 'Use a valid calendar date in YYYY-MM-DD format.');
const note = z.string().max(5000).nullable();
const partialNonempty = schema => schema.partial().refine(value => Object.keys(value).length > 0, 'Supply at least one field.');
export const timezone = z.string().max(100).refine(value => {
  try { new Intl.DateTimeFormat('en', { timeZone: value }); return true; } catch { return false; }
}, 'Use a supported timezone, such as Asia/Kolkata.');

export const settingsSchema = partialNonempty(z.object({
  display_name: z.string().trim().max(100).nullable(),
  usual_cycle_length_days: z.number().int().min(1).max(32767).nullable(),
  usual_period_length_days: z.number().int().min(1).max(32767).nullable(),
  irregular_cycles: z.boolean().nullable(),
  timezone,
}).strict());
export const periodSchema = z.object({ start_date: date, end_date: date.nullable().optional(), notes: note.optional() }).strict();
export const periodPatchSchema = partialNonempty(periodSchema);
export const checkInSchema = z.object({
  mood: z.enum(['great', 'good', 'okay', 'low', 'tired']).nullable().optional(),
  flow: z.enum(['none', 'spotting', 'light', 'medium', 'heavy']).nullable().optional(),
  symptoms: z.array(z.enum(['cramps', 'headache', 'bloating', 'fatigue', 'back_pain', 'breast_tenderness', 'acne', 'nausea', 'sleep_changes']))
    .max(9).transform(values => [...new Set(values)]).nullable().optional(),
  pain_level: z.number().int().min(0).max(10).nullable().optional(),
  notes: note.optional(),
}).strict();
export const listSchema = z.object({
  from: date.optional(), to: date.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
  offset: z.coerce.number().int().min(0).max(100000).default(0),
}).strict().refine(value => !value.from || !value.to || value.from <= value.to, 'from must be on or before to.');
export const idSchema = z.uuid();

export function parse(schema, input) {
  const result = schema.safeParse(input);
  if (!result.success) throw new HttpError(400, result.error.issues.map(i => `${i.path.join('.') || 'request'}: ${i.message}`).join('; '));
  return result.data;
}

export function todayInTimezone(zone, now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const part = name => parts.find(p => p.type === name).value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}

export function validatePeriodDates(period, today) {
  if (period.start_date > today || (period.end_date && period.end_date > today)) throw new HttpError(400, 'Recorded period dates cannot be in the future.');
  if (period.end_date && period.end_date < period.start_date) throw new HttpError(400, 'The end date must be on or after the start date.');
}
