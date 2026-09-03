# YGEP Car Rental

Booking system for the two yeshiva cars at Yeshiva Gedolah of Elkins Park.

Two halves:

- **Student site** — search by date and time, see which car is free, pick a
  destination, get an itemised estimate, and send a request to the office.
- **Office portal** (`/admin`) — a calendar of everything, a queue of pending
  requests, a waitlist, a CRM for students with balances and payment history,
  printable run sheets, and full control over cars, destinations, tolls and
  lockouts.

No money moves through the site. Students see an estimate; the office records
what was actually paid.

## Stack

Next.js 16 (App Router, Server Components, Server Actions) · TypeScript ·
Tailwind CSS v4 · Supabase (Postgres + Auth).

## Design

Shares its design system with the yeshiva's other apps (canteen, dinner): the
crest's slate blue `#517188` and antique gold `#8a783d` on warm parchment
`#f6f3ec`, Plus Jakarta Sans, generous corner radii and soft layered shadows.
Token names match those apps exactly (`ink`, `ink-soft`, `line`, `parchment`,
`surface`, `brand`, `gold`) so the products read as one family.

The landing page is the search box and nothing else. The house rules, the
fleet and the toll sheet all appear where they are actually needed -- on the
booking form, in the results, at the destination picker -- so repeating them up
front only put three screens of reading in front of the one thing anybody came
to do.

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
supabase/migrations/0004_cars_waitlist_and_email.sql   waitlist and email log
supabase/migrations/0005_cars_holds_and_ordering.sql   holds, releases, queue order
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

For email notifications, also set `RESEND_API_KEY`, `EMAIL_FROM` (on a domain
verified in Resend) and `OFFICE_NOTIFICATION_EMAILS`. All three are optional —
without them the app runs normally and simply does not send.

### 3. Run it

```bash
npm install
npm run dev
```

## Student records

Sign-up collects first name, last name, email, cell phone, how they intend to
pay (Zelle or cash) and a password. `full_name` still exists and is still what
every screen and join reads, but it is now derived: a database trigger rebuilds
it from the two parts, so nothing had to be rewritten and the two can never
drift apart.

The office can change all of it from a student's record, including the sign-in
email -- which updates both the profile and the auth account together, so they
cannot get out of step -- and can set a new password directly. There is no email
round trip: the office reads the new password off the screen and tells the
student, which is how they already hand out accounts.

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

## Email notifications

Notifications go **to the office only**; students are never emailed, they check
the site. Sent through [Resend](https://resend.com) when the office receives:

- a new reservation request,
- a cancellation or withdrawal,
- a new account registration,
- a new waitlist entry.

Each kind can be switched off in the portal under Settings, which is also where
extra recipients are added on top of `OFFICE_NOTIFICATION_EMAILS`.

Sending never blocks a booking. If Resend is down or misconfigured the student's
request still goes through and the failure is recorded in `cars_email_log`,
visible in the portal.

## Booking rules

Three rules the office sets in **Settings**, shipped with the values the yeshiva
asked for and changeable without a deploy:

| Rule | Default | Setting |
| --- | --- | --- |
| Minimum rental length | 4 hours | `min_rental_hours` |
| Notice required before pickup | 2 hours | `min_advance_hours` |
| How long an unpaid reservation holds the car | 12 hours | `payment_hold_hours` |

They are stated on the home page and beside the booking form in the same words
the server validates with, checked in the request handler so a student gets a
sentence they can act on, and enforced again by a database trigger as a
backstop. The office is deliberately exempt — they take bookings by phone and
need to override.

**A reason for the trip is required.** It is what the office decides on, so it
is validated on the server as well as the form, and shown at the top of the
reservation dialog rather than buried in the details.

### The unpaid hold, in detail

This one is worth being precise about, because two things expire at different
times:

1. A student requests a car. The reservation is **pending** and the car is
   **held for them** — nobody else can book it.
2. If payment has not been recorded within the hold window, **the car goes back
   into the pool** and anyone can book it.
3. **The reservation stays pending.** It is not cancelled and does not vanish.
4. If the student pays at hour 16 and nobody else has taken the car, the car is
   held for them again and the reservation carries on as normal.
5. If somebody else did take it in the meantime, approving the original request
   is refused by the no-double-booking constraint, and the office sees why.

Recording a payment against a reservation marks it paid automatically; removing
that payment marks it unpaid again. The office can also toggle paid by hand from
the reservation dialog.

**There is no cron job, and there does not need to be.** Nothing sweeps the
table looking for lapsed holds. The rule is evaluated every time availability is
read: a pending reservation counts as holding its car only while
`requested_at > cars_unpaid_hold_cutoff()`, or once payment has landed. That
means there is no window where a car is wrongly held between sweeps, nothing to
fail overnight, and changing the hold window in Settings takes effect on the
next page load rather than the next sweep.

The trade is that reading has to stay cheap, which took an index and one piece
of care: the cutoff is a zero-argument stable function, so Postgres evaluates it
once per query instead of once per reservation, and a partial GiST index covers
every status that can block a car. Measured over 2,600 reservations, that took a
single availability check from ~2,600 ms on a sequential scan to ~2 ms on an
index scan. `supabase/tests/95_availability_performance.sql` guards both.

## Returns: fuel, lateness and incidents

When a car comes back the office records the time and the fuel gauge. Two fees
follow, both computed rather than typed, both overridable, and both rolled into
the reservation total so they reach the student's balance:

- **Late**, per hour rounded up, after a grace period.
- **Fuel**, per eighth of a tank short of the level it went out at.

**The car keeps its fuel level between renters.** Whatever it comes back at
becomes what the next student has to match — bring it back at 5/8 and the next
person is asked for 5/8, not full. Nobody buys fuel for somebody else's trip.

**Incidents** — damage, a ticket, a car left dirty — are logged against the car
and, where somebody is responsible, against them. A charge lands on that
student's balance alongside their rentals and appears on their statement.

## Statements

Rentals, incidents and payments merge into one dated ledger with a running
balance, so a student sees not just what they owe but what it is for. The office
opens the same statement from a student's record and prints it.

## Emails

Office notifications are on. **Student email is off until the office turns it
on** — one master switch in Settings, with per-kind switches under it, and
nothing reaches a student while the master is off. When on, students are told
when a request is approved or declined. Deliberately minimal.

## Holds and releases

Beyond approving and declining, the office can **put a car on hold**: it blocks
the car exactly like a confirmed booking, so nobody else can take the window,
but nothing is confirmed and nothing is charged — a hold stays out of the
student's balance. An optional "revisit by" date is a reminder only; a lapsed
hold keeps blocking the car until somebody acts on it, so a forgotten hold never
quietly hands the car to someone else. The calendar dashboard counts holds and
flags any that are past their date.

**Release** frees the car in one click from a hold or a confirmed booking, with
an optional reason, and links straight to the waitlist for that window. The
record stays on the student's history as released rather than vanishing.

A new reservation the office creates can start as approved, on hold, or pending.

## Waitlist

When a student's window is already taken they can put their name down instead of
hitting a dead end. They see **how many people are waiting** on that window and
nothing else — no names, no positions.

The office sees the full queue and controls it: arrows move an entry up, down or
straight to the top, and "Book them in" works on **any** entry regardless of
position — the order is a note to the office, never a rule it is bound by.
Booking someone in turns their entry into an approved reservation priced from
current rates, with the double-booking constraint still having the final say.
Reordering renumbers the queue in a single statement, so it is never half
applied, and a student cannot reorder anything.

## Printing

`/admin/print` produces a run sheet for a day or a date range: pickup and return
times, student and phone, car, destination, total, and a blank column to initial
when keys go out. Confirmed rentals only by default, or everything including
pending. Print styles drop all navigation, so it comes out as a document rather
than a screenshot of an app.

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
src/lib/email/       Resend client, templates, notification dispatch
supabase/migrations/ schema
supabase/tests/      schema tests
```
