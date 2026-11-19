export function dateKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
export function validDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}
export function addDays(key, days) {
  const value = new Date(`${key}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}
export function daysBetween(a, b) { return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000); }
export const emptyState = () => ({ version: 1, onboarded: false, settings: { cycleLength: null, periodLength: 5, irregular: false }, periods: [], checkIns: [] });
export function periodError(input, periods, today = dateKey()) {
  if (!validDate(input.start_date) || (input.end_date && !validDate(input.end_date))) return 'Please enter valid dates.';
  if (input.start_date > today || (input.end_date && input.end_date > today)) return 'Recorded period dates cannot be in the future.';
  if (input.end_date && input.end_date < input.start_date) return 'The end date must be on or after the start date.';
  if (periods.some(p => p.id !== input.id && input.start_date <= (p.end_date || '9999-12-31') && p.start_date <= (input.end_date || '9999-12-31'))) return 'These dates overlap another period. Close any ongoing period first.';
  return null;
}
export function cycleInfo(periods, settings, today = dateKey()) {
  const latest = periods.filter(p => p.start_date <= today).toSorted((a, b) => b.start_date.localeCompare(a.start_date))[0];
  if (!latest) return { day: null, phase: 'Add your period dates', next: null, daysUntil: null };
  const day = daysBetween(latest.start_date, today) + 1;
  const length = settings.cycleLength;
  const next = length && !settings.irregular ? addDays(latest.start_date, length) : null;
  let phase = 'Timing varies';
  if (!latest.end_date || today <= latest.end_date) phase = 'Menstruation';
  else if (length && !settings.irregular && day <= length && length >= 21 && length <= 45) {
    const estimatedOvulation = length - 14;
    phase = day < estimatedOvulation ? 'Follicular phase' : day === estimatedOvulation ? 'Ovulation estimate' : 'Luteal phase';
  }
  return { day, phase, next, daysUntil: next ? daysBetween(today, next) : null };
}
export function readState(storage) {
  const raw = storage.getItem('minaflow.v1');
  if (!raw) return emptyState();
  const state = JSON.parse(raw);
  if (state.version !== 1 || typeof state.onboarded !== 'boolean' || !state.settings || !Array.isArray(state.periods) || !Array.isArray(state.checkIns)) throw new Error('Unsupported saved data.');
  if (state.settings.cycleLength !== null && (!Number.isInteger(state.settings.cycleLength) || state.settings.cycleLength < 1 || state.settings.cycleLength > 365)) throw new Error('Invalid saved settings.');
  if (!Number.isInteger(state.settings.periodLength) || state.settings.periodLength < 1 || state.settings.periodLength > 90 || typeof state.settings.irregular !== 'boolean') throw new Error('Invalid saved settings.');
  if (state.periods.some(p => typeof p.id !== 'string' || !validDate(p.start_date) || (p.end_date !== null && !validDate(p.end_date)) || typeof p.notes !== 'string')) throw new Error('Invalid saved periods.');
  if (state.checkIns.some(c => !validDate(c.entry_date) || typeof c.notes !== 'string' || !Array.isArray(c.symptoms) || c.symptoms.some(s => typeof s !== 'string'))) throw new Error('Invalid saved check-ins.');
  return state;
}
