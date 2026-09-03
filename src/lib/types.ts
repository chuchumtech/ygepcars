export type Role = "student" | "admin";
export type ProfileStatus = "pending" | "active" | "locked";
export type ReservationStatus =
  | "pending"
  | "approved"
  | "declined"
  | "cancelled"
  | "completed";
export type PaymentMethod =
  | "cash"
  | "check"
  | "zelle"
  | "venmo"
  | "card"
  | "credit"
  | "other";

export type Profile = {
  id: string;
  full_name: string;
  email: string;
  phone: string;
  role: Role;
  status: ProfileStatus;
  license_number: string;
  license_expires_on: string | null;
  address: string;
  emergency_contact: string;
  notes: string;
  locked_reason: string;
  approved_at: string | null;
  approved_by: string | null;
  created_at: string;
  updated_at: string;
};

export type Vehicle = {
  id: string;
  name: string;
  year: number | null;
  make: string;
  model: string;
  color: string;
  license_plate: string;
  seats: number | null;
  image_url: string;
  hourly_rate_cents: number;
  daily_cap_cents: number | null;
  minimum_hours: number;
  is_active: boolean;
  notes: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export type Destination = {
  id: string;
  name: string;
  toll_cents: number;
  description: string;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export type Reservation = {
  id: string;
  reference: string;
  user_id: string;
  vehicle_id: string;
  starts_at: string;
  ends_at: string;
  status: ReservationStatus;
  destination_id: string | null;
  destination_label: string;
  purpose: string;
  hourly_rate_cents: number;
  daily_cap_cents: number | null;
  billable_hours: number;
  time_charge_cents: number;
  toll_cents: number;
  adjustment_cents: number;
  adjustment_reason: string;
  total_cents: number;
  student_notes: string;
  admin_notes: string;
  decline_reason: string;
  requested_at: string;
  decided_at: string | null;
  decided_by: string | null;
  cancelled_at: string | null;
  created_at: string;
  updated_at: string;
};

/** A reservation joined with the bits the UI always needs alongside it. */
export type ReservationWithRefs = Reservation & {
  vehicle: Pick<Vehicle, "id" | "name" | "color" | "image_url"> | null;
  student: Pick<Profile, "id" | "full_name" | "email" | "phone"> | null;
};

export type Blackout = {
  id: string;
  vehicle_id: string;
  starts_at: string;
  ends_at: string;
  reason: string;
  created_by: string | null;
  created_at: string;
};

export type Payment = {
  id: string;
  user_id: string;
  reservation_id: string | null;
  amount_cents: number;
  method: PaymentMethod;
  reference: string;
  note: string;
  paid_on: string;
  recorded_by: string | null;
  created_at: string;
};

export type StudentBalance = {
  user_id: string;
  charged_cents: number;
  paid_cents: number;
  balance_cents: number;
  reservation_count: number;
};

export type AvailabilityRow = {
  vehicle_id: string;
  is_available: boolean;
  reason: "" | "out_of_service" | "maintenance" | "requested" | "booked";
};

export type BusyWindow = {
  vehicle_id: string;
  starts_at: string;
  ends_at: string;
  kind: "booked" | "requested" | "maintenance";
};

export type WaitlistStatus =
  | "waiting"
  | "offered"
  | "converted"
  | "expired"
  | "cancelled";

export type WaitlistEntry = {
  id: string;
  user_id: string;
  vehicle_id: string | null;
  starts_at: string;
  ends_at: string;
  status: WaitlistStatus;
  destination_id: string | null;
  destination_label: string;
  purpose: string;
  flexible: boolean;
  student_notes: string;
  admin_notes: string;
  offered_at: string | null;
  offered_by: string | null;
  offer_expires_at: string | null;
  converted_reservation_id: string | null;
  created_at: string;
  updated_at: string;
};

export type WaitlistEntryWithRefs = WaitlistEntry & {
  vehicle: Pick<Vehicle, "id" | "name" | "color"> | null;
  student: Pick<Profile, "id" | "full_name" | "email" | "phone"> | null;
};

export type EmailLogEntry = {
  id: string;
  to_email: string;
  subject: string;
  kind: string;
  entity_type: string;
  entity_id: string | null;
  status: "sent" | "failed" | "skipped";
  provider_id: string;
  error: string;
  created_at: string;
};
