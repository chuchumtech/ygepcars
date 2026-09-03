import { redirect } from "next/navigation";

/** The list moved under /account; keep old links and bookmarks working. */
export default function ReservationsRedirect() {
  redirect("/account/reservations");
}
