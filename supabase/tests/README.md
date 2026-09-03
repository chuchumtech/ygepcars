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
         supabase/tests/90_behaviour.sql \
         supabase/tests/91_rls.sql \
         supabase/tests/92_waitlist.sql; do
  psql -d carscheck -v ON_ERROR_STOP=1 -q -f "$f"
done
```

Every check either prints `PASS` or an expected row count. A `raise exception`
means a guard stopped doing its job.

Do not point these at the real project — `91_rls.sql` and `92_waitlist.sql`
grant table privileges that a live database should not receive.
