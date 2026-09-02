# YGEP Car Rental

Booking system for the two yeshiva cars at Yeshiva Gedolah of Elkins Park.

Two halves:

- **Student site** — search by date and time, see which car is free, pick a
  destination, get an itemised estimate, and send a request to the office.
- **Office portal** (`/admin`) — a calendar of everything, a queue of pending
  requests, a CRM for students with balances and payment history, and full
  control over cars, destinations, tolls and lockouts.

No money moves through the site. Students see an estimate; the office records
what was actually paid.

## Stack

Next.js 16 (App Router, Server Components, Server Actions) · TypeScript ·
Tailwind CSS v4 · Supabase (Postgres + Auth).

The previous Flask app is kept for reference in [`old/`](old/) and is no longer
wired up to anything.

## Getting set up

### 1. The database

Every table is prefixed `cars_` so this can live in a Supabase project that
already hosts something else. The migrations only ever create `cars_*` objects —
nothing outside that prefix is read or changed.

Run them in order, either through the Supabase SQL editor or the CLI:

```
supabase/migrations/0001_cars_schema.sql   tables, constraints, guard triggers
supabase/migrations/0002_cars_rls.sql      row level security, availability functions
supabase/migrations/0003_cars_seed.sql     the two cars, a starter toll sheet, settings
```

The seed only inserts when a table is still empty, so re-running is safe.

### 2. Environment

Copy `.env.example` to `.env.local` and fill in the four values from
**Supabase → Project Settings → API**:

| Variable | Where it comes from |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Publishable / anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key — **server only, never commit** |
| `NEXT_PUBLIC_SITE_URL` | Public URL of this app |

### 3. Run it

```bash
npm install
npm run dev
```

### 4. Make yourself an admin

Register through the site, then in the Supabase SQL editor:

```sql
update cars_profiles
   set role = 'admin', status = 'active'
 where email = 'you@example.com';
```

From then on the office portal at `/admin` handles everyone else.

## How a booking works

1. A student searches a date and time window. `cars_availability()` answers
   which cars are free, and why one is not, without exposing anyone else's
   reservation.
2. They pick a destination. Each destination carries one flat toll charge, which
   is added to the quote.
3. The quote is time + tolls. Time is the hourly rate, billed in half-hour
   blocks rounded up, capped per 24 hours if the car has a daily cap.
4. They submit. **The server recomputes the whole quote from current rates** —
   the browser's number is display-only — and the rates used are snapshotted
   onto the reservation, so a later rate change never rewrites an old quote.
5. The office approves, declines, or edits it from the calendar.

### Double-booking

Prevented by the database, not by application code:

```sql
exclude using gist (vehicle_id with =, tstzrange(starts_at, ends_at, '[)') with &&)
  where (status in ('approved', 'completed'))
```

Two people hitting submit at the same instant cannot both get the car; the
second one gets a "someone got there first" message.

### Who can see what

Enforced by row level security, so it holds even if a page forgets to filter:

- A student sees their own profile, reservations and payments — nobody else's.
- Cars, destinations and availability are public, so people can browse before
  registering.
- Students cannot promote themselves to admin, change a rate, or approve their
  own request. Database triggers pin those columns regardless of what gets
  posted.
- Admins see everything.

## Times

Everything runs on `America/New_York` (`ORG_TIMEZONE` in `src/lib/dates.ts`).
Timestamps are stored as `timestamptz`; `src/lib/dates.ts` is the only place
wall-clock time and instants convert, and it handles the daylight-saving
changeovers.

## Checks

```bash
npm run typecheck   # tsc
npm run lint        # eslint
npm run check       # pricing, timezone and calendar maths
npm run build       # production build
```

Schema tests live in [`supabase/tests/`](supabase/tests/) — they run the real
migrations against a throwaway Postgres and verify the double-booking
constraint, the availability logic, balances, and every row level security rule
above. See that folder's README for how to run them.

## Layout

```
src/app/(site)/      student site: search, booking, my reservations, account
src/app/(auth)/      sign in, register, awaiting-approval
src/app/admin/       office portal
src/app/actions/     server actions, one file per area
src/components/      shared UI
src/components/calendar/  the calendar: month, week, day, agenda, detail dialog
src/lib/             pricing, dates, calendar maths, Supabase clients, auth
supabase/migrations/ schema
supabase/tests/      schema tests
```
