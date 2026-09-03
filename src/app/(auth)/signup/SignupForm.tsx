"use client";

import { useActionState } from "react";
import { signUpAction, type AuthFormState } from "@/app/actions/auth";
import { SubmitButton } from "@/components/SubmitButton";
import { Alert, Field } from "@/components/ui";
import { PAYMENT_PREFERENCES } from "@/lib/types";

export function SignupForm() {
  const [state, action] = useActionState<AuthFormState, FormData>(signUpAction, {});

  return (
    <form action={action} className="mt-6 space-y-5">
      {state.error ? <Alert tone="error">{state.error}</Alert> : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="First name">
          <input className="input" name="first_name" autoComplete="given-name" required autoFocus />
        </Field>
        <Field label="Last name">
          <input className="input" name="last_name" autoComplete="family-name" required />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Email">
          <input className="input" type="email" name="email" autoComplete="email" required />
        </Field>
        <Field label="Cell phone" hint="So the office can reach you about a reservation.">
          <input className="input" type="tel" name="phone" autoComplete="tel" required />
        </Field>
      </div>

      <fieldset>
        <legend className="label">How will you be paying?</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          {PAYMENT_PREFERENCES.map((option, index) => (
            <label
              key={option.value}
              className="tap flex cursor-pointer items-center gap-3 rounded-xl border border-line bg-surface px-4 py-3
                         has-checked:border-brand has-checked:bg-brand-light/50 has-checked:ring-1 has-checked:ring-brand"
            >
              <input
                type="radio"
                name="payment_method"
                value={option.value}
                defaultChecked={index === 0}
                className="h-4 w-4 shrink-0 accent-brand"
                required
              />
              <span className="text-sm font-semibold text-ink">{option.label}</span>
            </label>
          ))}
        </div>
        <p className="mt-1.5 text-xs text-ink-soft">
          Nothing is charged online. This just tells the office what to expect —
          you can change it later.
        </p>
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Password" hint="At least 8 characters.">
          <input
            className="input"
            type="password"
            name="password"
            autoComplete="new-password"
            minLength={8}
            required
          />
        </Field>
        <Field label="Confirm password">
          <input
            className="input"
            type="password"
            name="confirm_password"
            autoComplete="new-password"
            minLength={8}
            required
          />
        </Field>
      </div>

      <SubmitButton className="btn-primary h-12 w-full" pendingLabel="Creating account...">
        Create account
      </SubmitButton>
    </form>
  );
}
