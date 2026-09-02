"use client";

import { useActionState } from "react";
import { setStudentStatusAction } from "@/app/actions/admin-people";
import type { ActionResult } from "@/app/actions/shared";
import { SubmitButton } from "@/components/SubmitButton";

export function ApproveAccountForm({ studentId }: { studentId: string }) {
  const [state, action] = useActionState<ActionResult, FormData>(
    setStudentStatusAction,
    {},
  );

  return (
    <div className="flex shrink-0 flex-col items-end gap-1">
      <div className="flex gap-2">
        <form action={action}>
          <input type="hidden" name="student_id" value={studentId} />
          <input type="hidden" name="status" value="active" />
          <SubmitButton className="btn-primary btn-sm" pendingLabel="Approving...">
            Approve
          </SubmitButton>
        </form>
        <form action={action}>
          <input type="hidden" name="student_id" value={studentId} />
          <input type="hidden" name="status" value="locked" />
          <input type="hidden" name="locked_reason" value="Not approved by the office." />
          <SubmitButton className="btn-danger btn-sm" pendingLabel="...">
            Turn down
          </SubmitButton>
        </form>
      </div>
      {state.error ? (
        <p className="text-xs font-medium text-red-700">{state.error}</p>
      ) : null}
    </div>
  );
}
