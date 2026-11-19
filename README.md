# MinaFlow

An Express.js server with a responsive Tailwind CSS frontend for periods, cycle estimates, and daily check-ins. The protected API uses Supabase Auth and PostgreSQL. While login is postponed, the frontend runs in browser-only mode: its records stay in local storage and are not synchronized with Supabase.

## Start locally

Requires Node.js 22 or newer (Node.js 24 recommended).

```powershell
npm install
Copy-Item .env.example .env
```

Set `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` in `.env` using your Supabase project settings. Do not use the secret/service-role key. If `.env` has already been prepared, keep its existing values.

Run the SQL migrations in `supabase/migrations/` in filename order using Supabase's SQL Editor. If the initial migration has already been applied, run only the second migration. The second migration prevents overlapping period dates, including concurrent writes; resolve any existing overlaps before applying it. An ongoing period has no end date and must be closed before a later period is logged.

```powershell
npm run dev
```

Open `http://127.0.0.1:3000` to use MinaFlow. The same Express server serves the frontend and API. The homepage shows a labeled sample cycle until you save your own dates or settings; the sample is never saved as your history. Periods can be added, edited, and deleted; check-ins can be saved for past and current dates; Settings includes export and delete controls.

`npm run dev` compiles Tailwind first, then watches CSS and server changes. Refresh the browser after HTML/JavaScript edits. Use `npm start` to build CSS and start without watching, `npm run build` to compile CSS only, and `npm test` for API and frontend model tests. Visit `/api/health` to check server availability; it does not check the database.

Frontend files live in `public/`, with Tailwind source in `frontend/styles.css`. Compiled `public/styles.css` is generated and ignored by Git. No CDN or external fonts are needed.

VS Code workspace settings recognize the source file as Tailwind CSS and register its custom directives. The `propertyIgnoredDueToDisplay` style warning is ignored because Tailwind's generated Preflight reset deliberately pairs `display: block` with `vertical-align: middle`. Other CSS validation stays enabled. Edit `frontend/styles.css`, then rebuild; do not edit the generated `public/styles.css` directly.

## Authentication

Sign users in with Supabase Auth in the future frontend. Send their session access token with every personal-data request:

```http
Authorization: Bearer <user-access-token>
Content-Type: application/json
```

The server verifies the token using Supabase Auth and creates a separate client per request. Database queries retain the user's identity and are subject to RLS. Never submit a user ID from the frontend; write routes derive it from the verified session.

## API

| Method | Route | Purpose |
| --- | --- | --- |
| GET | `/api/health` | Public server health |
| GET | `/api/settings` | Current settings, or null before setup |
| PATCH | `/api/settings` | Create/update supplied settings |
| GET | `/api/periods` | Period history |
| POST | `/api/periods` | Record a period |
| PATCH | `/api/periods/:id` | Edit a period |
| DELETE | `/api/periods/:id` | Delete a period |
| GET | `/api/check-ins` | Daily check-in history |
| PUT | `/api/check-ins/:date` | Create/update supplied check-in fields |
| DELETE | `/api/check-ins/:date` | Delete a check-in |

List endpoints accept `from`, `to`, `limit` (1–100, default 30), and `offset` (default 0). Dates use `YYYY-MM-DD`; period date filters match start dates. Responses use `{ "data": ... }`, with pagination on lists; deletions return HTTP 204. Errors use `{ "error": "..." }`.

Period body example:

```json
{ "start_date": "2026-11-01", "end_date": "2026-11-05", "notes": "Optional note" }
```

Check-in body example:

```json
{ "mood": "okay", "flow": "light", "symptoms": ["cramps"], "pain_level": 3 }
```

Send null to clear optional values; omitted fields are preserved on updates. Future dates are rejected using the user's saved timezone (UTC before setup). Set `timezone`, for example `Asia/Kolkata`, during onboarding. See `server/validation.js` for accepted fields and allowed values.

## Configuration and deployment

`FRONTEND_ORIGIN` allows your frontend origin through CORS (default `http://localhost:5173`). `HOST` defaults to loopback; set `HOST=0.0.0.0` when your hosting environment requires it. Use HTTPS in production. The API applies security headers, a 32 KB JSON limit, and a per-process IP rate limit. If hosting behind a proxy, configure Express's `trust proxy` for that specific deployment rather than trusting arbitrary forwarded addresses. Multiple server instances need a shared rate-limit store.

The app does not log health payloads or tokens. Credential files and `.env` are ignored by Git. Browser-only estimates use the latest period start and an optional user-entered cycle length; they are withheld for irregular cycles. Phase estimates are only shown for cycle lengths between 21 and 45 days, and cannot confirm ovulation. The initial expected period duration is 5 days and can be changed in Settings. Past estimates do not roll forward automatically.

Authentication screens, Supabase synchronization, and server-side account deletion/export remain future work. The current export/delete controls apply only to browser data. Anyone using the same browser profile may access those records, and clearing site data may erase them. No database migrations or production deployment are performed by starting the server.

The automated API tests mock Supabase responses; verify actual Auth/RLS behavior with two accounts after applying migrations. See [database setup](supabase/README.md) for details.
