# Schema tests

These run the real migrations against a throwaway Postgres and check the two
things that matter most and are easiest to get wrong:

* **`90_behaviour.sql`** — the fleet and toll seed data land; an approved
  reservation makes an overlapping one impossible; cancelled reservations stop
  blocking; maintenance blackouts and pending requests both show up in
  availability with the right reason; student balances add up.
* **`91_rls.sql`** — a student sees only their own reservations, profile and
  payments; they can still see the cars and check availability without learning
  who booked what; they cannot promote themselves to admin, change a rate, or
  approve their own request; the office sees everything; an anonymous visitor
  sees the fleet and the toll sheet and nothing else.
* **`94_booking_rules.sql`** — the three rules hold at their defaults and a junk
  setting falls back rather than erroring; a short rental, a last-minute one and
  a reasonless one are all refused for a student and all allowed for the office;
  and rule 2 end to end: the car is held while unpaid inside the window, returns
  to inventory once it lapses while the reservation stays pending, is held again
  the moment payment lands, frees again if that payment is removed, follows the
  window when the office changes it, and does not stop somebody else being
  approved once lapsed. A student cannot mark their own reservation paid.
* **`93_holds_and_ordering.sql`** — a hold blocks the car and cannot be booked
  over; releasing it frees the car for somebody else immediately; a held car is
  not money owed; reordering the queue produces the expected order, clamps an
  out-of-range target instead of erroring, and leaves positions unique and
  contiguous; a student can neither reorder the queue nor place a hold.
* **`92_waitlist.sql`** — the waiting count is honest and drops when somebody
  cancels; a student cannot stack the same window twice or promote their own
  entry; students see only their own row while still getting the true total
  through the count function; the email log is office-only.

`00_supabase_stub.sql` stands in for the pieces of Supabase the schema leans on
(`auth.users`, `auth.uid()`, the `anon` and `authenticated` roles) so the
migrations can run on plain Postgres.

## Running them

Needs a local Postgres 15+ with the `btree_gist` extension available.

```bash
createdb carscheck
for f in supabase/tests/00_supabase_stub.sql \
         supabase/migrations/0001_cars_schema.sql \
         supabase/migrations/0002_cars_rls.sql \
         supabase/migrations/0003_cars_seed.sql \
         supabase/migrations/0004_cars_waitlist_and_email.sql \
         supabase/migrations/0005_cars_holds_and_ordering.sql \
         supabase/migrations/0006_cars_booking_rules.sql \
         supabase/tests/90_behaviour.sql \
         supabase/tests/91_rls.sql \
         supabase/tests/92_waitlist.sql \
         supabase/tests/93_holds_and_ordering.sql \
         supabase/tests/94_booking_rules.sql; do
  psql -d carscheck -v ON_ERROR_STOP=1 -q -f "$f"
done
```

Every check either prints `PASS` or an expected row count. A `raise exception`
means a guard stopped doing its job.

Each file brings its own people, so they can be run in any order or on their own.

Do not point these at the real project — `91_rls.sql`, `92_waitlist.sql` and
`93_holds_and_ordering.sql` grant table privileges that a live database should
not receive.
