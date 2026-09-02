import Image from "next/image";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getViewer } from "@/lib/auth";
import { SearchForm } from "@/components/SearchForm";
import { Alert } from "@/components/ui";
import { formatMoney } from "@/lib/pricing";
import type { Destination, Vehicle } from "@/lib/types";

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const [params, viewer, supabase] = await Promise.all([
    searchParams,
    getViewer(),
    createClient(),
  ]);

  const [{ data: vehicles }, { data: destinations }] = await Promise.all([
    supabase
      .from("cars_vehicles")
      .select("*")
      .eq("is_active", true)
      .order("sort_order"),
    supabase
      .from("cars_destinations")
      .select("*")
      .eq("is_active", true)
      .gt("toll_cents", 0)
      .order("toll_cents")
      .limit(6),
  ]);

  const cars = (vehicles ?? []) as Vehicle[];
  const tollExamples = (destinations ?? []) as Destination[];

  return (
    <div className="space-y-10">
      {params.error === "admin-only" ? (
        <Alert tone="warn">That area is for office staff only.</Alert>
      ) : null}

      <section>
        <div className="max-w-2xl">
          <h1 className="text-3xl font-bold tracking-tight text-navy-800 sm:text-4xl">
            Reserve a yeshiva car
          </h1>
          <p className="mt-3 text-[15px] leading-relaxed text-muted">
            Pick your dates and times to see which car is free. You will get an
            estimated total before you send the request, and the office confirms
            it from there.
          </p>
        </div>

        <div className="mt-6">
          <SearchForm />
        </div>

        {!viewer ? (
          <p className="mt-3 text-sm text-muted">
            You can check availability without an account.{" "}
            <Link href="/signup" className="link">
              Register
            </Link>{" "}
            when you are ready to request one.
          </p>
        ) : viewer.profile?.status !== "active" ? (
          <div className="mt-4">
            <Alert tone="warn" title="Your account is not active yet">
              You can look around, but the office has to activate your account
              before you can send a reservation request.
            </Alert>
          </div>
        ) : null}
      </section>

      <section>
        <h2 className="text-lg font-bold text-navy-800">The cars</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          {cars.map((car) => (
            <article key={car.id} className="card overflow-hidden">
              {car.image_url ? (
                <div className="relative aspect-[16/9] bg-navy-100">
                  <Image
                    src={car.image_url}
                    alt={car.name}
                    fill
                    sizes="(max-width: 640px) 100vw, 50vw"
                    className="object-cover"
                  />
                </div>
              ) : null}
              <div className="p-5">
                <h3 className="text-base font-bold text-navy-800">{car.name}</h3>
                <p className="mt-0.5 text-sm text-muted">
                  {[car.color, car.seats ? `${car.seats} seats` : null]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
                <p className="mt-3 text-sm">
                  <span className="text-xl font-bold text-navy-800">
                    {formatMoney(car.hourly_rate_cents)}
                  </span>
                  <span className="text-muted"> per hour</span>
                </p>
                {car.daily_cap_cents ? (
                  <p className="mt-1 text-xs text-muted">
                    Never more than {formatMoney(car.daily_cap_cents)} for a full day.
                  </p>
                ) : null}
              </div>
            </article>
          ))}
          {cars.length === 0 ? (
            <p className="text-sm text-muted">
              No cars are set up yet. The office needs to add them in the portal.
            </p>
          ) : null}
        </div>
      </section>

      {tollExamples.length > 0 ? (
        <section>
          <h2 className="text-lg font-bold text-navy-800">Tolls</h2>
          <p className="mt-1 max-w-2xl text-sm text-muted">
            Tolls are charged as one flat fee based on where you are heading, so
            you know the number up front. You pick your destination when you make
            the request.
          </p>
          <ul className="mt-4 flex flex-wrap gap-2">
            {tollExamples.map((d) => (
              <li
                key={d.id}
                className="chip border border-[var(--color-line)] bg-white text-navy-700"
              >
                {d.name}
                <span className="font-bold text-gold-500">
                  {formatMoney(d.toll_cents)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
