import { dateKey, addDays, daysBetween, emptyState, periodError, cycleInfo, readState, validDate } from './model.js';

const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const format = key => new Date(`${key}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
const titleCase = value => value.replaceAll('_', ' ').replace(/^./, char => char.toUpperCase());
const icons = {
  overview: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M7 3v4m10-4v4M3 11h18m-13 4h2m4 0h2"/>',
  heart: '<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z"/>',
  flower: '<path d="M12 8c-7-10-14 3-4 4-10 7 3 14 4 4 7 10 14-3 4-4 10-7-3-14-4-4Z"/><circle cx="12" cy="12" r="2"/>',
  shield: '<path d="M12 3 4 6v6c0 5 8 9 8 9s8-4 8-9V6l-8-3Z"/><path d="m8 12 3 3 5-6"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  settings: '<path d="m9 3-.5 3-2 1-3-.5-2 3L4 12l-2.5 2.5 2 3 3-.5 2 1 .5 3h6l.5-3 2-1 3 .5 2-3L20 12l2.5-2.5-2-3-3 .5-2-1L15 3Z"/><circle cx="12" cy="12" r="3"/>',
};
$$('[data-icon]').forEach(element => { element.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[element.dataset.icon] || ''}</svg>`; });
let state;
let storageBroken = false;
try { state = readState(localStorage); } catch { state = emptyState(); storageBroken = true; }
let month = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
const modal = $('#modal');
let toastTimer;
function toast(message) { $('#toast').textContent = message; $('#toast').classList.remove('hidden'); clearTimeout(toastTimer); toastTimer = setTimeout(() => $('#toast').classList.add('hidden'), 4000); }
function commit(next) {
  if (storageBroken) { toast('Saved data could not be read. Export or reset it in Settings first.'); return false; }
  try { localStorage.setItem('minaflow.v1', JSON.stringify(next)); state = next; render(); return true; }
  catch { toast('Could not save. Browser storage may be full or unavailable.'); return false; }
}
function openModal(title, html) { $('#modal-title').textContent = title; $('#modal-body').innerHTML = html; if (!modal.open) modal.showModal(); }
$('#close-modal').onclick = () => modal.close();
modal.addEventListener('click', event => { if (event.target === modal) { const r = modal.getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) modal.close(); } });
function showView(view) {
  if (!['overview', 'calendar', 'history', 'learn'].includes(view)) view = 'overview';
  $('#log-period').classList.toggle('hidden', view !== 'overview');
  $$('.view').forEach(el => el.classList.toggle('hidden', el.id !== `view-${view}`));
  $$('.nav-item[data-view]').forEach(el => { const active = el.dataset.view === view; el.classList.toggle('active', active); if (active) el.setAttribute('aria-current', 'page'); else el.removeAttribute('aria-current'); });
  if (location.hash !== `#${view}`) history.replaceState(null, '', `#${view}`);
}
$$('[data-view]').forEach(el => el.onclick = () => showView(el.dataset.view));
window.addEventListener('hashchange', () => showView(location.hash.slice(1)));
function calendarHtml(periods, settings, demo = false) {
  const today = dateKey();
  const first = dateKey(month);
  const start = addDays(first, -month.getDay());
  const info = cycleInfo(periods, settings, today);
  const days = Array.from({ length: 42 }, (_, index) => {
    const key = addDays(start, index);
    const recorded = periods.some(p => key >= p.start_date && key <= (p.end_date || today));
    const expected = info.next && key >= info.next && key < addDays(info.next, settings.periodLength) && key >= today;
    const checked = state.checkIns.some(c => c.entry_date === key);
    const classes = ['calendar-day', key.slice(0, 7) !== first.slice(0, 7) ? 'other' : '', recorded ? 'recorded' : '', expected ? 'expected' : '', key === today ? 'today' : '', checked ? 'checked' : ''].join(' ');
    return `<button class="${classes}" data-date="${key}" aria-label="${format(key)}${recorded ? demo ? ', sample period' : ', recorded period' : ''}${expected ? ', estimated period' : ''}${checked ? ', check-in saved' : ''}" ${key > today ? 'disabled' : ''} ${key === today ? 'aria-current="date"' : ''}>${Number(key.slice(-2))}</button>`;
  }).join('');
  return `<div class="month-heading"><strong>${month.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</strong><div class="month-controls"><button class="icon-button" data-month="-1" aria-label="Previous month">‹</button><button class="icon-button" data-month="1" aria-label="Next month">›</button></div></div><div class="calendar-grid">${['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => `<span class="weekday" aria-label="${['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][i]}">${d}</span>`).join('')}${days}</div>`;
}
function renderCycleDial(phases, info, length, showPosition) {
  const ns = 'http://www.w3.org/2000/svg';
  const element = (tag, attributes, parent) => {
    const node = document.createElementNS(ns, tag);
    Object.entries(attributes).forEach(([key, value]) => node.setAttribute(key, value));
    parent?.append(node);
    return node;
  };
  const svg = element('svg', { viewBox: '-16 -16 352 352', width: 352, height: 352, preserveAspectRatio: 'xMidYMid meet', class: 'cycle-dial', 'aria-hidden': 'true' });
  const defs = element('defs', {}, svg);
  const point = (degrees, radius) => {
    const radians = (degrees - 180) * Math.PI / 180;
    return [160 + radius * Math.cos(radians), 160 + radius * Math.sin(radians)];
  };
  const arc = (start, end, radius, reverse = false) => {
    const a = point(reverse ? end : start, radius);
    const b = point(reverse ? start : end, radius);
    return `M ${a.join(',')} A ${radius} ${radius} 0 ${end - start > 180 ? 1 : 0} ${reverse ? 0 : 1} ${b.join(',')}`;
  };
  element('circle', { cx: 160, cy: 160, r: 118, fill: 'none', stroke: '#30202b', 'stroke-width': 28 }, svg);
  element('circle', { cx: 160, cy: 160, r: 94, fill: 'none', stroke: '#4c2b40', 'stroke-width': 1, 'stroke-dasharray': '2 6' }, svg);
  const tickCount = length >= 21 && length <= 45 ? length : 28;
  for (let day = 0; day < tickCount; day++) {
    const a = point(day / tickCount * 360, 142);
    const b = point(day / tickCount * 360, day % 7 === 0 ? 150 : 147);
    element('line', { x1: a[0], y1: a[1], x2: b[0], y2: b[1], stroke: '#644052', 'stroke-width': day % 7 === 0 ? 2 : 1, 'stroke-linecap': 'round' }, svg);
  }
  phases.forEach(phase => {
    element('path', { d: arc(phase.start + 1, phase.end - 1, 118), fill: 'none', stroke: `var(${phase.color})`, 'stroke-width': 28, opacity: phase.active ? 1 : .73 }, svg);
  });
  let previousLabelCenter = -Infinity;
  phases.forEach((phase, index) => {
    const center = (phase.start + phase.end) / 2;
    const labelCenter = Math.max(center, previousLabelCenter + 39);
    previousLabelCenter = labelCenter;
    const tip = point(center, 134);
    const arrowStart = point(labelCenter, 153);
    const arrowControl = point(center, 151);
    const markerId = `phase-arrow-${index}`;
    const marker = element('marker', { id: markerId, viewBox: '0 0 8 8', refX: 7, refY: 4, markerWidth: 6, markerHeight: 6, orient: 'auto' }, defs);
    element('path', { d: 'M 0 0 L 8 4 L 0 8 Z', fill: `var(${phase.color})` }, marker);
    const route = `M ${arrowStart.join(',')} Q ${arrowControl.join(',')} ${tip.join(',')}`;
    element('path', { d: route, fill: 'none', stroke: `var(${phase.color})`, 'stroke-width': 1.4, 'stroke-linejoin': 'round', 'marker-end': `url(#${markerId})` }, svg);
    const pathId = `phase-name-arc-${index}`;
    element('path', { id: pathId, d: arc(labelCenter - 35, labelCenter + 35, 164, labelCenter > 180) }, defs);
    const label = element('text', { class: `phase-arrow-label${phase.active ? ' current-phase' : ''}`, 'dominant-baseline': 'central' }, svg);
    const textPath = element('textPath', { href: `#${pathId}`, startOffset: '50%', 'text-anchor': 'middle' }, label);
    textPath.textContent = phase.name;
  });
  if (showPosition) {
    const p = point((info.day - 1) / length * 360, 139);
    const tulip = element('g', { class: 'current-cycle-tulip' }, svg);
    element('circle', { cx: p[0], cy: p[1], r: 17, fill: '#191019', stroke: '#ff80b7', 'stroke-width': 1.5 }, tulip);
    element('image', { href: '/tulip.svg', x: p[0] - 12, y: p[1] - 15, width: 24, height: 30 }, tulip);
  }
  $('#ring-labels').replaceChildren(svg);
}
function render() {
  const today = dateKey();
  const demo = !state.onboarded;
  const demoPeriods = [{ id: 'sample', start_date: addDays(today, -17), end_date: addDays(today, -13), notes: '' }];
  const displayPeriods = demo ? demoPeriods : state.periods;
  const displaySettings = demo ? { cycleLength: 28, periodLength: 5, irregular: false } : state.settings;
  const info = cycleInfo(displayPeriods, displaySettings, today);
  $('#today-label').textContent = new Date().toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
  $('#sample-banner').classList.toggle('hidden', !demo);
  $('#cycle-badge').textContent = demo ? 'Sample cycle' : 'Your cycle';
  $('#period-key').textContent = demo ? 'Sample period' : 'Recorded period';
  $('#cycle-day').textContent = info.day ?? '—';
  $('#cycle-phase').textContent = info.phase;
  const length = displaySettings.cycleLength;
  const showPosition = Boolean(info.day && length >= 21 && length <= 45 && info.day <= length && !displaySettings.irregular);
  if (length >= 21 && length <= 45 && !displaySettings.irregular) {
    const latest = displayPeriods.toSorted((a, b) => b.start_date.localeCompare(a.start_date))[0];
    const bleedingDays = latest?.end_date ? daysBetween(latest.start_date, latest.end_date) + 1 : displaySettings.periodLength;
    const periodEnd = Math.min(bleedingDays, length - 16) / length * 360;
    const follicularEnd = (length - 15) / length * 360;
    const ovulationEnd = (length - 14) / length * 360;
    const phases = [
      { name: 'Menstruation', start: 0, end: periodEnd, color: '--cycle-period', active: info.phase === 'Menstruation' },
      { name: 'Follicular', start: periodEnd + 3, end: follicularEnd, color: '--cycle-follicular', active: info.phase === 'Follicular phase' },
      { name: 'Ovulation', start: follicularEnd + 3, end: ovulationEnd, color: '--cycle-ovulation', active: info.phase === 'Ovulation estimate' },
      { name: 'Luteal', start: ovulationEnd + 3, end: 357, color: '--cycle-luteal', active: info.phase === 'Luteal phase' },
    ];
    renderCycleDial(phases, info, length, showPosition);
  } else {
    renderCycleDial([], info, length, false);
  }
  $('#dial-position').classList.toggle('hidden', !showPosition);
  $('#dial-cycle-length').textContent = length ? `${length} days` : 'Not set';
  $('#dial-next-period').textContent = info.next ? info.daysUntil < 0 ? 'Update your dates' : info.daysUntil === 0 ? 'Today, estimated' : `In ${info.daysUntil} days` : 'Not estimated';
  $('#dial-note').textContent = !info.day ? 'Add your first period to start your cycle journal.' : !length ? 'Add your usual cycle length in Settings for an estimate.' : displaySettings.irregular ? 'Phase timing is not estimated for irregular cycles.' : info.day > length ? 'Your estimated start date has passed. Update your log when your next period begins.' : 'A personal estimate. Your actual timing may vary.';
  $('#next-title').textContent = info.daysUntil === null ? 'No estimate yet' : info.daysUntil < 0 ? 'Estimate has passed' : info.daysUntil === 0 ? 'Estimated today' : `In ${info.daysUntil} ${info.daysUntil === 1 ? 'day' : 'days'}`;
  $('#next-date').textContent = info.next ? format(info.next) + (demo ? ' - sample' : ' - timing can vary') : state.settings.irregular ? 'Estimates are off because you selected irregular cycles.' : state.periods.length ? 'Your period is saved. Add your usual cycle length to see an estimate.' : 'Add your last period start date and usual cycle length.';
  $('#estimate-settings').classList.toggle('hidden', demo || Boolean(info.next) || !state.periods.length);
  $('#estimate-settings').textContent = state.settings.irregular ? 'Review cycle settings' : 'Add cycle length';
  $('#mini-calendar').innerHTML = calendarHtml(displayPeriods, displaySettings, demo);
  $('#full-calendar').innerHTML = calendarHtml(state.periods, state.settings);
  $$('[data-month]').forEach(el => el.onclick = () => { month = new Date(month.getFullYear(), month.getMonth() + Number(el.dataset.month), 1); render(); });
  $$('[data-date]').forEach(el => el.onclick = () => checkInForm(el.dataset.date));
  $('#period-history').innerHTML = state.periods.length ? state.periods.toSorted((a, b) => b.start_date.localeCompare(a.start_date)).map(p => `<div class="history-entry"><strong>${format(p.start_date)} – ${p.end_date ? format(p.end_date) : 'Ongoing'}</strong><p>${p.end_date ? `${daysBetween(p.start_date, p.end_date) + 1} days` : 'Add an end date when your period finishes.'}</p>${p.notes ? `<p>${escape(p.notes)}</p>` : ''}<div class="entry-actions"><button data-edit-period="${escape(p.id)}">Edit</button><button data-delete-period="${escape(p.id)}">Delete</button></div></div>`).join('') : '<div class="empty-state">Your history starts with your first entry.<br>Add a period whenever you’re ready.</div>';
  $('#checkin-history').innerHTML = state.checkIns.length ? state.checkIns.toSorted((a, b) => b.entry_date.localeCompare(a.entry_date)).map(c => `<div class="history-entry"><strong>${format(c.entry_date)}</strong><p>${[c.mood && titleCase(c.mood), c.flow && `${titleCase(c.flow)} flow`, c.pain_level !== null && c.pain_level !== undefined && `Pain ${c.pain_level}/10`, ...c.symptoms.map(titleCase)].filter(Boolean).map(escape).join(' · ') || 'A moment recorded.'}</p>${c.notes ? `<p>${escape(c.notes)}</p>` : ''}<div class="entry-actions"><button data-edit-checkin="${c.entry_date}">Edit</button><button data-delete-checkin="${c.entry_date}">Delete</button></div></div>`).join('') : '<div class="empty-state">A little check-in goes a long way.<br>Your moods, symptoms, and notes will appear here.</div>';
  $$('[data-edit-period]').forEach(el => el.onclick = () => periodForm(state.periods.find(p => p.id === el.dataset.editPeriod)));
  $$('[data-delete-period]').forEach(el => el.onclick = () => confirmDelete('Delete this period?', () => ({ ...state, periods: state.periods.filter(p => p.id !== el.dataset.deletePeriod) })));
  $$('[data-edit-checkin]').forEach(el => el.onclick = () => checkInForm(el.dataset.editCheckin));
  $$('[data-delete-checkin]').forEach(el => el.onclick = () => confirmDelete('Delete this check-in?', () => ({ ...state, checkIns: state.checkIns.filter(c => c.entry_date !== el.dataset.deleteCheckin) })));
}
function confirmDelete(title, nextState) {
  openModal(title, '<p class="helper">This removes the entry from this browser.</p><div class="settings-actions"><button class="btn-danger" id="confirm-delete">Delete entry</button><button class="btn-soft" id="cancel-delete">Keep entry</button></div>');
  $('#cancel-delete').onclick = () => modal.close();
  $('#confirm-delete').onclick = () => { if (commit(nextState())) { modal.close(); toast('Entry deleted.'); } };
}
function periodForm(existing) {
  const p = existing || { start_date: dateKey(), end_date: '', notes: '' };
  openModal(existing ? 'Edit your period' : 'Log your period', `<p class="helper">Start with the first day of bleeding. Leave the end date blank if your period is ongoing.</p><form id="period-form"><div class="form-row"><label class="form-field">Start date<input name="start_date" type="date" required max="${dateKey()}" value="${p.start_date}"></label><label class="form-field">End date · optional<input name="end_date" type="date" max="${dateKey()}" value="${p.end_date || ''}"></label></div><label class="form-field">Notes · optional<textarea name="notes" maxlength="5000">${escape(p.notes)}</textarea></label>${!state.settings.cycleLength ? '<label class="form-field">Usual cycle length · optional<input name="cycle_length" type="number" min="1" max="365" placeholder="Days between period start dates"><span class="helper">Count from the first day of one period to the first day of the next. Leave blank if unsure.</span></label>' : ''}<p class="form-error" id="form-error" role="alert"></p><button class="btn-primary w-full" type="submit">Save period</button></form>`);
  $('#period-form').onsubmit = event => {
    event.preventDefault();
    const data = new FormData(event.target);
    const record = { id: existing?.id || crypto.randomUUID(), start_date: data.get('start_date'), end_date: data.get('end_date') || null, notes: data.get('notes').trim() };
    const error = periodError(record, state.periods);
    if (error) { $('#form-error').textContent = error; return; }
    const cycleLength = data.get('cycle_length');
    const next = { ...state, onboarded: true, settings: { ...state.settings, ...(cycleLength ? { cycleLength: Number(cycleLength) } : {}) }, periods: [...state.periods.filter(p => p.id !== record.id), record] };
    if (commit(next)) { modal.close(); toast('Period saved in this browser.'); }
  };
}
const symptomOptions = ['cramps', 'headache', 'bloating', 'fatigue', 'back_pain', 'breast_tenderness', 'acne', 'nausea', 'sleep_changes'];
function checkInForm(entryDate = dateKey(), mood) {
  const c = state.checkIns.find(c => c.entry_date === entryDate) || { mood: '', flow: '', symptoms: [], pain_level: null, notes: '' };
  const selectedSymptoms = new Set(c.symptoms);
  const options = (values, selected) => '<option value="">Not recorded</option>' + values.map(v => `<option value="${v}" ${selected === v ? 'selected' : ''}>${titleCase(v)}</option>`).join('');
  openModal('A moment for you', `<p class="helper">${format(entryDate)} · Everything here is optional.</p><form id="checkin-form"><div class="form-row"><label class="form-field">Mood<select name="mood">${options(['great', 'good', 'okay', 'low', 'tired'], mood || c.mood)}</select></label><label class="form-field">Flow<select name="flow">${options(['none', 'spotting', 'light', 'medium', 'heavy'], c.flow)}</select></label></div><p class="form-field">Symptoms</p><div class="chip-row">${symptomOptions.map(s => `<button type="button" class="chip ${selectedSymptoms.has(s) ? 'selected' : ''}" data-symptom="${s}" aria-pressed="${selectedSymptoms.has(s)}">${titleCase(s)}</button>`).join('')}</div><label class="form-field">Pain level · 0 to 10<input name="pain_level" type="number" min="0" max="10" value="${c.pain_level ?? ''}" placeholder="Optional"></label><label class="form-field">Anything on your mind?<textarea name="notes" maxlength="5000" placeholder="A little note for yourself…">${escape(c.notes)}</textarea></label><p class="form-error" id="form-error" role="alert"></p><button class="btn-primary w-full" type="submit">Save check-in</button></form>`);
  $$('[data-symptom]').forEach(el => el.onclick = () => { const s = el.dataset.symptom; selectedSymptoms.has(s) ? selectedSymptoms.delete(s) : selectedSymptoms.add(s); el.classList.toggle('selected', selectedSymptoms.has(s)); el.setAttribute('aria-pressed', String(selectedSymptoms.has(s))); });
  $('#checkin-form').onsubmit = event => {
    event.preventDefault();
    if (!validDate(entryDate) || entryDate > dateKey()) { $('#form-error').textContent = 'Choose a current or past date.'; return; }
    const data = new FormData(event.target);
    const record = { entry_date: entryDate, mood: data.get('mood') || null, flow: data.get('flow') || null, pain_level: data.get('pain_level') === '' ? null : Number(data.get('pain_level')), symptoms: [...selectedSymptoms], notes: data.get('notes').trim() };
    if (commit({ ...state, onboarded: true, checkIns: [...state.checkIns.filter(c => c.entry_date !== entryDate), record] })) { modal.close(); toast('Check-in saved. A little more in tune with you.'); }
  };
}
function download(data, filename) {
  const url = URL.createObjectURL(new Blob([data], { type: 'application/json' }));
  const link = document.createElement('a'); link.href = url; link.download = filename; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function settingsForm() {
  openModal('Settings & your data', `<p class="helper">Your records stay in this browser. Clearing browser data may remove them, so keep an export if you need a copy.</p>${storageBroken ? '<p class="form-error">Saved data could not be read. Export the raw data before resetting.</p>' : ''}<form id="settings-form"><div class="form-row"><label class="form-field">Usual cycle · days<input name="cycleLength" type="number" min="1" max="365" value="${state.settings.cycleLength || ''}" placeholder="Unknown"></label><label class="form-field">Usual period · days<input name="periodLength" type="number" min="1" max="90" required value="${state.settings.periodLength}"></label></div><label class="flex items-center gap-3 text-sm"><input type="checkbox" name="irregular" ${state.settings.irregular ? 'checked' : ''}>My cycles are irregular</label><p class="helper mt-3">Period and ovulation estimates are hidden for irregular cycles. The period duration starts at 5 days until you change it.</p><button class="btn-primary mt-5 w-full" type="submit">Save settings</button></form><div class="settings-actions"><button class="btn-soft" id="export-data">Export my data</button><button class="btn-danger" id="clear-data">Delete all browser data</button></div>`);
  $('#settings-form').onsubmit = event => { event.preventDefault(); const data = new FormData(event.target); if (commit({ ...state, onboarded: true, settings: { cycleLength: data.get('cycleLength') ? Number(data.get('cycleLength')) : null, periodLength: Number(data.get('periodLength')), irregular: data.has('irregular') } })) { modal.close(); toast('Settings saved.'); } };
  $('#export-data').onclick = () => { try { download(storageBroken ? localStorage.getItem('minaflow.v1') || '{}' : JSON.stringify(state, null, 2), `minaflow-${dateKey()}.json`); toast('Data exported. Keep this file private.'); } catch { toast('Browser data could not be exported.'); } };
  $('#clear-data').onclick = () => {
    openModal('Delete all your browser data?', '<p class="helper">Your periods, check-ins, and settings will be removed from this browser. Export a copy first if you want to keep them. This cannot be undone.</p><div class="settings-actions"><button class="btn-danger" id="confirm-clear">Delete everything</button><button class="btn-soft" id="cancel-clear">Keep my data</button></div>');
    $('#cancel-clear').onclick = settingsForm;
    $('#confirm-clear').onclick = () => { try { localStorage.removeItem('minaflow.v1'); state = emptyState(); storageBroken = false; render(); modal.close(); toast('Your browser data has been deleted.'); } catch { toast('Could not delete data. Check your browser storage settings.'); } };
  };
}
['#log-period', '#start-tracking'].forEach(selector => $(selector).onclick = () => periodForm());
['#add-checkin', '#history-checkin'].forEach(selector => $(selector).onclick = () => checkInForm());
$$('[data-mood]').forEach(el => el.onclick = () => checkInForm(dateKey(), el.dataset.mood));
$('#settings-button').onclick = settingsForm;
$('#estimate-settings').onclick = settingsForm;
$('#mobile-settings').onclick = settingsForm;
const infoPages = {
  about: ['About MinaFlow', 'A simple place to track your periods and notice your own patterns. This is an early local prototype, built around clear dates and easy daily check-ins.'],
  privacy: ['Your privacy', 'Period records and check-ins are saved in this browser’s local storage. They are not sent to Supabase in this version. Anyone with access to this browser profile may be able to read them. Export or delete your records in Settings. Clearing browser data may erase your records.'],
  terms: ['Using MinaFlow', 'This prototype provides personal tracking and rough estimates. It does not confirm ovulation, diagnose conditions, provide treatment, or serve as contraception. Formal launch terms still need to be prepared before a public release.'],
  contact: ['Contact', 'A contact address has not been added yet. MinaFlow is currently an early development prototype.'],
};
$$('[data-info]').forEach(el => el.onclick = () => { const [title, copy] = infoPages[el.dataset.info]; openModal(title, `<p class="helper">${copy}</p>${el.dataset.info === 'privacy' ? '<button class="btn-soft mt-5" id="privacy-settings">Open data settings</button>' : ''}`); if ($('#privacy-settings')) $('#privacy-settings').onclick = settingsForm; });
render(); showView(location.hash.slice(1));
if (storageBroken) toast('Saved data could not be read. Open Settings to export or reset it.');
