export type Role = "student" | "admin";
export type ProfileStatus = "pending" | "active" | "locked";
export type ReservationStatus =
  | "pending"
  | "hold"
  | "approved"
  | "declined"
  | "cancelled"
  | "completed"
  | "released";
export type PaymentMethod =
  | "cash"
  | "check"
  | "zelle"
  | "venmo"
  | "card"
  | "credit"
  | "other";

export type PaymentPreference = "zelle" | "cash";

export const PAYMENT_PREFERENCES: { value: PaymentPreference; label: string }[] = [
  { value: "zelle", label: "Zelle" },
  { value: "cash", label: "Cash" },
];

export type Profile = {
  id: string;
  first_name: string;
  last_name: string;
  /** Derived from first_name + last_name by a database trigger. */
  full_name: string;
  payment_method: PaymentPreference;
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
  fuel_level: number;
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
  hold_expires_at: string | null;
  payment_received_at: string | null;
  picked_up_at: string | null;
  returned_at: string | null;
  fuel_out: number | null;
  fuel_in: number | null;
  late_minutes: number;
  late_fee_cents: number;
  fuel_fee_cents: number;
  return_notes: string;
  released_at: string | null;
  release_reason: string;
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

/** How the office says it received the money. */
export const PAYMENT_METHODS: { value: PaymentMethod; label: string }[] = [
  { value: "zelle", label: "Zelle" },
  { value: "cash", label: "Cash" },
  { value: "check", label: "Check" },
  { value: "venmo", label: "Venmo" },
  { value: "card", label: "Card" },
  { value: "credit", label: "Account credit" },
  { value: "other", label: "Other" },
];

export function paymentMethodLabel(method: string): string {
  return PAYMENT_METHODS.find((m) => m.value === method)?.label ?? method;
}

/** An extra charge or a discount on one rental, with the office's own wording. */
export type ReservationItem = {
  id: string;
  reservation_id: string;
  kind: "charge" | "discount";
  description: string;
  /** Always positive. `kind` decides which way it pulls. */
  amount_cents: number;
  /** What it contributes to the total: negative for a discount. */
  signed_cents: number;
  created_by: string | null;
  created_at: string;
};

/** Money owed that belongs to the account, not to a rental. Negative = credit. */
export type AccountCharge = {
  id: string;
  user_id: string;
  charged_on: string;
  description: string;
  amount_cents: number;
  note: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type IncidentKind =
  | "damage"
  | "accident"
  | "ticket"
  | "cleaning"
  | "mechanical"
  | "fuel"
  | "other";

export const INCIDENT_KINDS: { value: IncidentKind; label: string }[] = [
  { value: "damage", label: "Damage" },
  { value: "accident", label: "Accident" },
  { value: "ticket", label: "Ticket or violation" },
  { value: "cleaning", label: "Left dirty" },
  { value: "mechanical", label: "Mechanical" },
  { value: "fuel", label: "Fuel" },
  { value: "other", label: "Other" },
];

export type Incident = {
  id: string;
  vehicle_id: string;
  reservation_id: string | null;
  user_id: string | null;
  occurred_on: string;
  kind: IncidentKind;
  description: string;
  charge_cents: number;
  status: "open" | "resolved";
  resolution: string;
  reported_by: string | null;
  created_at: string;
  updated_at: string;
};

export type IncidentWithRefs = Incident & {
  vehicle: Pick<Vehicle, "id" | "name"> | null;
  student: Pick<Profile, "id" | "full_name"> | null;
};

export type StudentBalance = {
  user_id: string;
  rental_cents: number;
  incident_cents: number;
  /** Charges the office added to the account rather than to a rental. */
  account_charge_cents: number;
  charged_cents: number;
  paid_cents: number;
  /** Positive means owed. Negative means paid ahead. */
  balance_cents: number;
  /** What they are ahead by, or zero. The positive half of balance_cents. */
  credit_cents: number;
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
  position: number;
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
