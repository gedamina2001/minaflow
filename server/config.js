import { z } from 'zod';

export function loadConfig(env = process.env) {
  const schema = z.object({
    PORT: z.coerce.number().int().min(1).max(65535).default(3000),
    HOST: z.string().min(1).default('127.0.0.1'),
    FRONTEND_ORIGIN: z.url().default('http://localhost:5173'),
    SUPABASE_URL: z.url(),
    SUPABASE_PUBLISHABLE_KEY: z.string().min(1),
  });
  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    // Name missing/invalid settings without logging any values.
    throw new Error(`Check environment settings: ${parsed.error.issues.map(i => i.path.join('.')).join(', ')}`);
  }
  const config = parsed.data;
  if (config.SUPABASE_PUBLISHABLE_KEY.startsWith('sb_secret_')) {
    throw new Error('SUPABASE_PUBLISHABLE_KEY must be a publishable key, not a secret key.');
  }
  if (!config.SUPABASE_PUBLISHABLE_KEY.startsWith('sb_publishable_')) {
    throw new Error('Use the Supabase sb_publishable_ key for this server.');
  }
  return config;
}
