import type { ListingCharge } from "./costs";

export type PublicListing = {
  id: string;
  ref: string;
  status: string;
  title: string | null;
  description: string | null;
  price_period: string;
  price_basis: string;
  rent_amount: number;
  deposit_amount: number | null;
  deposit_months: number | null;
  fixed_monthly_total: number | null;
  move_in_total: number | null;
  totals_complete: boolean;
  furnishing: string | null;
  student: boolean;
  available_from: string | null;
  availability_confirmed_at: string | null;
  house_rules: string | null;
  let_on: string | null;
  charges: ListingCharge[];
  unit: {
    layout: string;
    rental_scope: string;
    bedrooms: number | null;
    bathrooms: number | null;
    floor_level: number | null;
    size_sqm: number | null;
    building_style: string | null;
    origin: string | null;
    facts: Record<string, string>;
  };
  location: {
    area: string;
    town: string | null;
    county: string | null;
    road: string | null;
    landmark: string | null;
    approx_lat: number | null;
    approx_lng: number | null;
  };
  photos: Array<{ path: string; thumb: string | null; label: string; alt: string | null; width: number | null; height: number | null }>;
  advertiser: {
    name: string;
    role: string;
    usually_replies: string | null;
    identity_checked_at: string | null;
    authority_checked_at: string | null;
    property_visited_at: string | null;
    call: boolean;
    whatsapp: boolean;
    phone: string | null;
  };
  viewing_instructions: string | null;
  viewing_address: string | null;
  is_staff: boolean;
};

/** Minimal shape returned for listings that are no longer available. */
export type ClosedListing = {
  ref: string;
  status: "let" | "withdrawn" | "paused";
  title: string | null;
  area: string;
  let_on: string | null;
  layout: string;
  bedrooms: number | null;
  rent_amount: number | null;
};

export function isOpenListing(l: PublicListing | ClosedListing): l is PublicListing {
  return "unit" in l;
}
