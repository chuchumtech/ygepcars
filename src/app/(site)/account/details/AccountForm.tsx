"use client";

import { useActionState } from "react";
import { updateMyProfileAction } from "@/app/actions/account";
import type { ActionState } from "@/app/actions/reservations";
import { SubmitButton } from "@/components/SubmitButton";
import { Alert, Field } from "@/components/ui";
import { PAYMENT_PREFERENCES, type Profile } from "@/lib/types";

export function AccountForm({ profile }: { profile: Profile }) {
  const [state, action] = useActionState<ActionState, FormData>(
    updateMyProfileAction,
    {},
  );

  return (
    <form action={action} className="card-pad space-y-4">
      {state.error ? <Alert tone="error">{state.error}</Alert> : null}
      {state.success ? <Alert tone="success">{state.success}</Alert> : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="First name">
          <input className="input" name="first_name" defaultValue={profile.first_name} required />
        </Field>
        <Field label="Last name">
          <input className="input" name="last_name" defaultValue={profile.last_name} required />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Email" hint="Contact the office if this needs to change.">
          <input className="input" value={profile.email} disabled />
        </Field>
        <Field label="Cell phone">
          <input className="input" type="tel" name="phone" defaultValue={profile.phone} required />
        </Field>
      </div>

      <Field label="How you pay">
        <select className="input" name="payment_method" defaultValue={profile.payment_method}>
          {PAYMENT_PREFERENCES.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
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
      </div>

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
