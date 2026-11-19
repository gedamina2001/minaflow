# MinaFlow database setup

Stack: Express.js server, Tailwind CSS for styling, Supabase Auth and PostgreSQL.

## Run the SQL

1. Open your Supabase project and select **SQL Editor > New query**.
2. Copy the contents of `migrations/202611190001_initial_schema.sql` into the editor.
3. Run the query once. It creates tables, constraints, timestamp triggers, and row-level security (RLS) policies in one transaction. Then run `migrations/202611190002_prevent_overlapping_periods.sql` to add the database constraint required by the Express period-write routes. If the first migration was already applied, run only the second one.
4. Confirm the three tables appear in the Table Editor. Configure your chosen sign-in method under Authentication before testing with user accounts.

This migration is intended for a new schema. If these table or function names already exist, inspect them before adapting it; the script does not drop existing data. No SQL has been executed against your hosted project as part of preparing these files.

## Tables

| Table | Purpose |
| --- | --- |
| `auth.users` | Accounts managed by Supabase Auth; do not add password columns elsewhere. |
| `public.user_settings` | Optional name, usual cycle/period lengths, irregular-cycle preference, and timezone. |
| `public.periods` | Actual period start/end dates and notes; a null end date means ongoing. |
| `public.daily_check_ins` | One entry per user per date, with optional mood, flow, symptoms, pain, and notes. |

Settings are created by the application after sign-in using an upsert on `user_id`. There is no signup trigger or mandatory settings row: users can record periods before completing onboarding. Unknown cycle lengths should stay null, rather than silently becoming 28 days.

Flow is recorded per day because it can change during a period. A check-in does not need a period record, so users can log symptoms or spotting at any time. The period history supplies cycle lengths; do not store calculated predictions or phase labels as recorded medical facts.

## Express integration

- Keep the Supabase URL and publishable key in environment variables.
- Require a signed-in user's access token for personal-data endpoints. Verify it with Supabase Auth; do not simply decode an unverified JWT.
- Create a Supabase client per request, using the publishable key and the user's `Authorization: Bearer <access-token>` header. Do not share mutable authentication state between requests.
- Use the verified user's identity; never trust a `user_id` submitted in a request body. The SQL defaults `user_id` to `auth.uid()` and RLS enforces ownership on reads and writes.
- Ordinary tracking requests should use the user's token, not a secret/service-role key that bypasses RLS. Reserve privileged credentials for narrowly scoped server administration.
- Return database errors as useful validation messages without exposing tokens or health notes in logs.

Suggested endpoints: `GET/PATCH /api/settings`, `GET/POST /api/periods`, `PATCH/DELETE /api/periods/:id`, `GET /api/check-ins`, `PUT /api/check-ins/:date`, and `DELETE /api/check-ins/:date`. Check-in upserts use the conflict target `user_id,entry_date`.

## Validate in the server

- Accept valid calendar dates in `YYYY-MM-DD` format. Reject future dates for actual period and check-in records, based on the user's timezone.
- Validate timezone names against supported IANA timezones before saving settings.
- The second migration rejects overlapping period intervals in the database, including concurrent edits. Its inclusive date ranges mean two periods cannot share a day. Close an ongoing period before logging a later one.
- Treat positive cycle/period lengths as user input, not medical assessments. The database does not impose a medically "normal" range.
- Validate symptom lists against the SQL allowlist and remove duplicates before saving. Use notes for other symptoms.
- Set request size limits, validate strings, and paginate history endpoints.

## Privacy and deletion

RLS restricts signed-in users to their own records. Supabase administrators and privileged server keys can still access data; this is not end-to-end encryption.

Deleting an Auth user cascades to all three tables. Deleting a settings row alone does not delete the account or history. Implement complete account deletion through a protected server endpoint after verifying the user; export should include settings, periods, and check-ins. If files are added later, their Storage objects need a separate deletion process.

Supabase Storage buckets hold files. These SQL tables live in PostgreSQL and do not require a bucket.

## Before using real user data

The migration passed 40 checks in a disposable PGlite PostgreSQL environment using mock Supabase Auth roles. Checks cover ownership, denied cross-user writes, anonymous access, constraints, timestamps, and cascading account deletion. This does not replace testing Supabase's actual Auth and Data API configuration.

To repeat the local checks in PowerShell without adding dependencies to the app:

```powershell
$checkPath = Join-Path $env:TEMP 'minaflow-db-check'
npm install --prefix $checkPath --no-audit --no-fund @electric-sql/pglite
node supabase/tests/schema.test.mjs (Join-Path $checkPath 'node_modules/@electric-sql/pglite/dist/index.js')
```

Verify with two separate signed-in accounts that each can read, insert, update, and delete its own records; cannot see or modify the other's records; cannot assign its records to another user; and that signed-out requests are denied. Also check duplicate daily entries, invalid date order, and deleting an account. A successful SQL Editor query alone does not test RLS because the editor uses a privileged role.

References: [Supabase row-level security](https://supabase.com/docs/guides/database/postgres/row-level-security) and [managing user data](https://supabase.com/docs/guides/auth/managing-user-data).
