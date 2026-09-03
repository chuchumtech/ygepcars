import Link from "next/link";
import { getViewer } from "@/lib/auth";
import { SearchForm } from "@/components/SearchForm";
import { Alert } from "@/components/ui";

/**
 * The landing page is the search box and nothing else.
 *
 * The rules, the fleet and the toll sheet all appear again where they are
 * actually needed -- on the booking form, in the results, at the destination
 * picker -- so repeating them here only put three screens of reading in front
 * of the one thing anybody came to do.
 */
export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const [params, viewer] = await Promise.all([
    searchParams,
    getViewer(),
  ]);

  return (
    <div className="mx-auto flex min-h-[calc(100dvh-9rem)] w-full max-w-3xl flex-col justify-center px-4 py-12">
      {params.error === "admin-only" ? (
        <div className="mb-8">
          <Alert tone="warn">That area is for office staff only.</Alert>
        </div>
      ) : null}

      <h1 className="text-3xl font-extrabold tracking-tight text-ink sm:text-4xl">
        Reserve a yeshiva car
      </h1>
      <p className="mt-2 text-base text-ink-soft">
        Pick your times to see what is free.
      </p>

      <div className="mt-7">
        <SearchForm />
      </div>

      {viewer && viewer.profile?.status !== "active" ? (
        <div className="mt-6">
          <Alert tone="warn" title="Your account is not active yet">
            You can look around, but the office has to activate your account before
            you can send a request.
          </Alert>
        </div>
      ) : !viewer ? (
        <p className="mt-5 text-sm text-ink-soft">
          Checking availability is open to everyone.{" "}
          <Link href="/signup" className="link">
            Register
          </Link>{" "}
          when you want to request a car.
        </p>
      ) : null}
    </div>
  );
}
