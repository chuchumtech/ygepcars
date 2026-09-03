"use client";

import { useState } from "react";
import {
  NewReservationDialog,
  defaultSeed,
} from "@/components/reservations/NewReservationDialog";
import type { Destination, Profile, Vehicle } from "@/lib/types";

/**
 * The header button. The calendar opens the same dialog directly, seeded with
 * whichever day -- and in the day view, whichever car -- was clicked.
 */
export function NewReservationButton({
  vehicles,
  destinations,
  students,
}: {
  vehicles: Vehicle[];
  destinations: Destination[];
  students: Pick<Profile, "id" | "full_name" | "email" | "status">[];
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button type="button" className="btn-primary" onClick={() => setOpen(true)}>
        Add reservation
      </button>

      {open ? (
        <NewReservationDialog
          open={open}
          onClose={() => setOpen(false)}
          seed={defaultSeed()}
          vehicles={vehicles}
          destinations={destinations}
          students={students}
        />
      ) : null}
    </>
  );
}
