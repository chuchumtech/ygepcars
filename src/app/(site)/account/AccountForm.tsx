"use client";

import { useActionState } from "react";
import { updateMyProfileAction } from "@/app/actions/account";
import type { ActionState } from "@/app/actions/reservations";
import { SubmitButton } from "@/components/SubmitButton";
import { Alert, Field } from "@/components/ui";
import type { Profile } from "@/lib/types";

export function AccountForm({ profile }: { profile: Profile }) {
  const [state, action] = useActionState<ActionState, FormData>(
    updateMyProfileAction,
    {},
  );

  return (
    <form action={action} className="card-pad space-y-4">
      {state.error ? <Alert tone="error">{state.error}</Alert> : null}
      {state.success ? <Alert tone="success">{state.success}</Alert> : null}

      <Field label="Full name">
        <input className="input" name="full_name" defaultValue={profile.full_name} required />
      </Field>

      <Field label="Email" hint="Contact the office if this needs to change.">
        <input className="input" value={profile.email} disabled />
      </Field>

      <Field label="Cell phone">
        <input className="input" type="tel" name="phone" defaultValue={profile.phone} required />
      </Field>

      <Field label="Home address (optional)">
        <input className="input" name="address" defaultValue={profile.address} />
      </Field>

      <Field label="Emergency contact (optional)" hint="Name and number.">
        <input
          className="input"
          name="emergency_contact"
          defaultValue={profile.emergency_contact}
        />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Driver's license number (optional)">
          <input className="input" name="license_number" defaultValue={profile.license_number} />
        </Field>
        <Field label="License expires (optional)">
          <input
            className="input"
            type="date"
            name="license_expires_on"
            defaultValue={profile.license_expires_on ?? ""}
          />
        </Field>
      </div>

      <SubmitButton pendingLabel="Saving...">Save changes</SubmitButton>
    </form>
  );
}
