"use client";

import { useActionState, useState } from "react";
import { inviteStudentAction } from "@/app/actions/admin-people";
import type { ActionResult } from "@/app/actions/shared";
import { Modal } from "@/components/Modal";
import { SubmitButton } from "@/components/SubmitButton";
import { Alert, Field } from "@/components/ui";

export function InviteStudentButton() {
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState<ActionResult, FormData>(inviteStudentAction, {});

  return (
    <>
      <button type="button" className="btn-primary" onClick={() => setOpen(true)}>
        Add a student
      </button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Add a student"
        subtitle="Creates an active account straight away, so you can book for them right now."
        width="md"
        footer={
          <>
            <button type="button" className="btn-secondary" onClick={() => setOpen(false)}>
              Close
            </button>
            <SubmitButton form="invite-student" pendingLabel="Creating...">
              Create account
            </SubmitButton>
          </>
        }
      >
        <form id="invite-student" action={action} className="space-y-4">
          {state.error ? <Alert tone="error">{state.error}</Alert> : null}
          {state.success ? <Alert tone="success">{state.success}</Alert> : null}

          <Field label="Full name">
            <input className="input" name="full_name" required />
          </Field>

          <Field label="Email">
            <input className="input" type="email" name="email" required />
          </Field>

          <Field label="Cell phone">
            <input className="input" type="tel" name="phone" />
          </Field>

          <Field
            label="Starting password"
            hint="Give this to the student and tell them to change it. At least 8 characters."
          >
            <input className="input" name="password" minLength={8} required />
          </Field>

          <Field label="Office notes">
            <textarea className="input min-h-20 resize-y" name="notes" rows={2} />
          </Field>
        </form>
      </Modal>
    </>
  );
}
