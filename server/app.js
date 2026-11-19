import express from 'express';
import { fileURLToPath } from 'node:url';
import cors from 'cors';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import { createClient } from '@supabase/supabase-js';
import { HttpError, databaseResult } from './errors.js';
import { parse, date, idSchema, settingsSchema, periodSchema, periodPatchSchema, checkInSchema, listSchema, todayInTimezone, validatePeriodDates } from './validation.js';

export function createUserClient(config, token) {
  return createClient(config.SUPABASE_URL, config.SUPABASE_PUBLISHABLE_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

export function createApp(config, { clientFactory = createUserClient } = {}) {
  const app = express();
  app.disable('x-powered-by');
  app.use(helmet());
  app.use(cors({ origin: config.FRONTEND_ORIGIN, methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE'], allowedHeaders: ['Content-Type', 'Authorization'] }));
  app.use((req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  app.get('/api/health', (req, res) => res.json({ status: 'ok', service: 'minaflow-api' }));
  app.use('/api', rateLimit({ windowMs: 60_000, limit: 120, standardHeaders: 'draft-8', legacyHeaders: false,
    handler: (req, res) => res.status(429).json({ error: 'Too many requests. Please try again shortly.' }) }));
  app.use(express.json({ limit: '32kb' }));
  // Reject unknown routes before authenticating or contacting Supabase.
  const api = express.Router();
  const authenticate = async (req, res, next) => {
    const match = /^Bearer ([^\s]+)$/i.exec(req.get('authorization') || '');
    if (!match) throw new HttpError(401, 'A signed-in user access token is required.');
    req.supabase = clientFactory(config, match[1]);
    let result;
    try { result = await req.supabase.auth.getUser(match[1]); }
    catch { throw new HttpError(503, 'Sign-in verification is temporarily unavailable.'); }
    if (result.error) {
      if (result.error.status >= 500 || result.error.name === 'AuthRetryableFetchError') throw new HttpError(503, 'Sign-in verification is temporarily unavailable.');
      throw new HttpError(401, 'Your session is invalid or expired. Please sign in again.');
    }
    if (!result.data?.user) throw new HttpError(401, 'Please sign in again.');
    req.user = result.data.user;
    next();
  };
  const owned = (req, table) => req.supabase.from(table).select('*').eq('user_id', req.user.id);
  const settings = async req => databaseResult(await owned(req, 'user_settings').maybeSingle());
  const today = async req => {
    const record = await settings(req);
    return todayInTimezone(record?.timezone || 'UTC');
  };
  const recordById = async (req, table, id) => {
    const record = databaseResult(await owned(req, table).eq('id', id).maybeSingle());
    if (!record) throw new HttpError(404, 'Record not found.');
    return record;
  };

  api.get('/settings', authenticate, async (req, res) => res.json({ data: await settings(req) }));
  api.patch('/settings', authenticate, async (req, res) => {
    const input = parse(settingsSchema, req.body);
    const data = databaseResult(await req.supabase.from('user_settings').upsert({ ...input, user_id: req.user.id }, { onConflict: 'user_id' }).select().single());
    res.json({ data });
  });

  for (const [path, table, dateColumn] of [['/periods', 'periods', 'start_date'], ['/check-ins', 'daily_check_ins', 'entry_date']]) {
    api.get(path, authenticate, async (req, res) => {
      const query = parse(listSchema, req.query);
      let request = owned(req, table).order(dateColumn, { ascending: false }).range(query.offset, query.offset + query.limit - 1);
      if (query.from) request = request.gte(dateColumn, query.from);
      if (query.to) request = request.lte(dateColumn, query.to);
      const data = databaseResult(await request);
      res.json({ data, pagination: { limit: query.limit, offset: query.offset } });
    });
  }

  api.post('/periods', authenticate, async (req, res) => {
    const input = parse(periodSchema, req.body);
    validatePeriodDates(input, await today(req));
    const data = databaseResult(await req.supabase.from('periods').insert({ ...input, user_id: req.user.id }).select().single());
    res.status(201).json({ data });
  });
  api.patch('/periods/:id', authenticate, async (req, res) => {
    const id = parse(idSchema, req.params.id);
    const input = parse(periodPatchSchema, req.body);
    const existing = await recordById(req, 'periods', id);
    validatePeriodDates({ ...existing, ...input }, await today(req));
    const data = databaseResult(await req.supabase.from('periods').update(input).eq('user_id', req.user.id).eq('id', id).select().maybeSingle());
    if (!data) throw new HttpError(404, 'Record not found.');
    res.json({ data });
  });
  api.delete('/periods/:id', authenticate, async (req, res) => {
    const id = parse(idSchema, req.params.id);
    const data = databaseResult(await req.supabase.from('periods').delete().eq('user_id', req.user.id).eq('id', id).select('id').maybeSingle());
    if (!data) throw new HttpError(404, 'Record not found.');
    res.status(204).end();
  });

  api.put('/check-ins/:date', authenticate, async (req, res) => {
    const entryDate = parse(date, req.params.date);
    const input = parse(checkInSchema, req.body);
    if (entryDate > await today(req)) throw new HttpError(400, 'Check-ins cannot be recorded for future dates.');
    const data = databaseResult(await req.supabase.from('daily_check_ins').upsert({ ...input, user_id: req.user.id, entry_date: entryDate }, { onConflict: 'user_id,entry_date' }).select().single());
    res.json({ data });
  });
  api.delete('/check-ins/:date', authenticate, async (req, res) => {
    const entryDate = parse(date, req.params.date);
    const data = databaseResult(await req.supabase.from('daily_check_ins').delete().eq('user_id', req.user.id).eq('entry_date', entryDate).select('id').maybeSingle());
    if (!data) throw new HttpError(404, 'Record not found.');
    res.status(204).end();
  });

  app.use('/api', api);
  app.use(express.static(fileURLToPath(new URL('../public/', import.meta.url))));
  app.use((req, res) => res.status(404).json({ error: 'Route not found.' }));
  app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    if (error.type === 'entity.too.large') return res.status(413).json({ error: 'The request body is too large.' });
    if (error.type === 'entity.parse.failed') return res.status(400).json({ error: 'The request body must contain valid JSON.' });
    if (error instanceof HttpError) return res.status(error.status).json({ error: error.message });
    res.status(500).json({ error: 'The server could not complete the request.' });
  });
  return app;
}
