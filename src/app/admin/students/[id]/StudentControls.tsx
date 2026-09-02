"use client";

import { useActionState, useState } from "react";
import {
  setStudentRoleAction,
  setStudentStatusAction,
  updateStudentAction,
} from "@/app/actions/admin-people";
import type { ActionResult } from "@/app/actions/shared";
import { SubmitButton } from "@/components/SubmitButton";
import { Alert, Field } from "@/components/ui";
import type { Profile } from "@/lib/types";

export function StudentControls({ profile }: { profile: Profile }) {
  const [editing, setEditing] = useState(false);
  const [lockingOut, setLockingOut] = useState(false);

  const [statusState, statusAction] = useActionState<ActionResult, FormData>(
    setStudentStatusAction,
    {},
  );
  const [roleState, roleAction] = useActionState<ActionResult, FormData>(
    setStudentRoleAction,
    {},
  );
  const [detailState, detailAction] = useActionState<ActionResult, FormData>(
    updateStudentAction,
    {},
  );

  return (
    <section className="card-pad space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted">
          Account
        </h2>

        <div className="ml-auto flex flex-wrap gap-2">
          {profile.status !== "active" ? (
            <form action={statusAction}>
              <input type="hidden" name="student_id" value={profile.id} />
              <input type="hidden" name="status" value="active" />
              <SubmitButton className="btn-primary btn-sm" pendingLabel="...">
                {profile.status === "pending" ? "Approve account" : "Unlock account"}
              </SubmitButton>
            </form>
          ) : (
            <button
              type="button"
              className="btn-danger btn-sm"
              onClick={() => setLockingOut((value) => !value)}
            >
              Lock out
            </button>
          )}

          <form action={roleAction}>
            <input type="hidden" name="student_id" value={profile.id} />
            <input
              type="hidden"
              name="role"
              value={profile.role === "admin" ? "student" : "admin"}
            />
            <SubmitButton className="btn-secondary btn-sm" pendingLabel="...">
              {profile.role === "admin" ? "Remove office access" : "Make office admin"}
            </SubmitButton>
          </form>

          <button
            type="button"
            className="btn-secondary btn-sm"
            onClick={() => setEditing((value) => !value)}
          >
            {editing ? "Close" : "Edit details"}
          </button>
        </div>
      </div>

      {statusState.error ? <Alert tone="error">{statusState.error}</Alert> : null}
      {statusState.success ? <Alert tone="success">{statusState.success}</Alert> : null}
      {roleState.error ? <Alert tone="error">{roleState.error}</Alert> : null}
      {roleState.success ? <Alert tone="success">{roleState.success}</Alert> : null}

      {profile.status === "locked" && profile.locked_reason ? (
        <Alert tone="error" title="Locked out">
          {profile.locked_reason}
        </Alert>
      ) : null}

      {lockingOut ? (
        <form action={statusAction} className="rounded-lg bg-red-50 p-4">
          <input type="hidden" name="student_id" value={profile.id} />
          <input type="hidden" name="status" value="locked" />
          <Field
            label="Why are they being locked out?"
            hint="The student sees this when they sign in."
          >
            <input
              className="input"
              name="locked_reason"
              placeholder="Outstanding balance, returned the car damaged, ..."
              required
              autoFocus
            />
          </Field>
          <div className="mt-3 flex gap-2">
            <SubmitButton className="btn-danger btn-sm" pendingLabel="Locking...">
              Lock this account
            </SubmitButton>
            <button
              type="button"
              className="btn-secondary btn-sm"
              onClick={() => setLockingOut(false)}
            >
              Never mind
            </button>
          </div>
        </form>
      ) : null}

      {editing ? (
        <form action={detailAction} className="space-y-4 border-t border-[var(--color-line)] pt-4">
          <input type="hidden" name="student_id" value={profile.id} />

          {detailState.error ? <Alert tone="error">{detailState.error}</Alert> : null}
          {detailState.success ? <Alert tone="success">{detailState.success}</Alert> : null}

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Full name">
              <input className="input" name="full_name" defaultValue={profile.full_name} required />
            </Field>
            <Field label="Phone">
              <input className="input" name="phone" defaultValue={profile.phone} />
            </Field>
            <Field label="Email" hint="This does not change their sign-in email.">
              <input className="input" name="email" defaultValue={profile.email} />
            </Field>
            <Field label="Emergency contact">
              <input
                className="input"
                name="emergency_contact"
                defaultValue={profile.emergency_contact}
              />
            </Field>
            <Field label="Driver's license number">
              <input
                className="input"
                name="license_number"
                defaultValue={profile.license_number}
              />
            </Field>
            <Field label="License expires">
              <input
                className="input"
                type="date"
                name="license_expires_on"
                defaultValue={profile.license_expires_on ?? ""}
              />
            </Field>
          </div>

          <Field label="Address">
            <input className="input" name="address" defaultValue={profile.address} />
          </Field>

          <Field label="Office notes" hint="Only staff see this.">
            <textarea
              className="input min-h-24 resize-y"
              name="notes"
              rows={3}
              defaultValue={profile.notes}
            />
          </Field>

          <SubmitButton pendingLabel="Saving...">Save details</SubmitButton>
        </form>
      ) : (
        <dl className="grid gap-x-8 gap-y-2 text-sm sm:grid-cols-2">
          <Row label="Phone">{profile.phone || "--"}</Row>
          <Row label="Emergency contact">{profile.emergency_contact || "--"}</Row>
          <Row label="Address">{profile.address || "--"}</Row>
          <Row label="License">
            {profile.license_number || "--"}
            {profile.license_expires_on ? ` (exp ${profile.license_expires_on})` : ""}
          </Row>
          {profile.notes ? (
            <div className="sm:col-span-2">
              <dt className="text-muted">Office notes</dt>
              <dd className="mt-1 whitespace-pre-wrap rounded-lg bg-gold-50 px-3 py-2 text-navy-800">
                {profile.notes}
              </dd>
            </div>
          ) : null}
        </dl>
      )}
    </section>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 border-b border-[var(--color-line)] py-1.5">
      <dt className="text-muted">{label}</dt>
      <dd className="text-right font-medium text-navy-800">{children}</dd>
    </div>
  );
}
