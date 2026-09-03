import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui";
import { SettingsForm } from "./SettingsForm";
import { formatDateTime } from "@/lib/dates";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const supabase = await createClient();

  const [settings, activity] = await Promise.all([
    supabase.from("cars_settings").select("*"),
    supabase
      .from("cars_activity")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(30),
  ]);

  const values: Record<string, unknown> = {};
  for (const row of (settings.data ?? []) as { key: string; value: unknown }[]) {
    values[row.key] = row.value;
  }

  const log = (activity.data ?? []) as {
    id: number;
    actor_name: string;
    entity_type: string;
    action: string;
    created_at: string;
  }[];

  return (
    <div className="space-y-8">
      <PageHeader title="Settings" description="Office details and booking limits." />

      <SettingsForm values={values} />

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-ink-soft">
          Recent activity
        </h2>
        {log.length === 0 ? (
          <p className="card-pad text-sm text-ink-soft">Nothing logged yet.</p>
        ) : (
          <div className="card divide-y divide-line/70">
            {log.map((entry) => (
              <div key={entry.id} className="flex justify-between gap-4 px-4 py-2.5 text-sm">
                <span>
                  <span className="font-medium text-ink">
                    {entry.actor_name || "Someone"}
                  </span>{" "}
                  <span className="text-ink-soft">
                    {entry.action} a {entry.entity_type}
                  </span>
                </span>
                <span className="shrink-0 text-xs text-ink-soft">
                  {formatDateTime(entry.created_at)}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
