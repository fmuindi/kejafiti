// Discovery vocabulary shared by search, filters, cards and the listing wizard. Labels use
// plain Kenyan rental terms; underlying values match the database check constraints.

export const CATEGORIES = [
  { value: "rooms", label: "Rooms" },
  { value: "bedsitters", label: "Bedsitters & Studios" },
  { value: "apartments", label: "Apartments" },
  { value: "houses", label: "Houses" },
  { value: "sq", label: "SQ / DSQ" },
  { value: "shared", label: "Shared homes" },
  { value: "student", label: "Student" },
] as const;

export const HOME_TYPES = [
  { value: "single_room", label: "Single room" },
  { value: "double_room", label: "Double room" },
  { value: "bedsitter_studio", label: "Bedsitter / studio" },
  { value: "1_bedroom", label: "1 bedroom" },
  { value: "2_bedrooms", label: "2 bedrooms" },
  { value: "3_plus_bedrooms", label: "3+ bedrooms" },
] as const;

// Yes / No / Unknown facts. "Unknown" is a real value and never satisfies a must-have
// unless the tenant explicitly includes unconfirmed answers.
export const FACTS = [
  { key: "private_bathroom", label: "Private bathroom", mustHave: true },
  { key: "own_meter", label: "Own electricity meter", mustHave: true },
  { key: "parking", label: "Parking", mustHave: true },
  { key: "water_included", label: "Water included in rent", mustHave: true, derived: true },
  { key: "ground_or_lift", label: "Ground floor or lift", mustHave: true, derived: true },
  { key: "balcony", label: "Balcony", mustHave: false },
  { key: "lift", label: "Lift", mustHave: false },
  { key: "private_kitchen", label: "Private kitchen", mustHave: false },
  { key: "own_compound", label: "Own compound", mustHave: false },
  { key: "borehole", label: "Borehole water", mustHave: false },
  { key: "backup_power", label: "Backup power for the unit", mustHave: false },
  { key: "cctv", label: "CCTV", mustHave: false },
  { key: "pets_allowed", label: "Pets allowed", mustHave: false },
] as const;

export type FactKey = (typeof FACTS)[number]["key"];
export type FactValue = "yes" | "no" | "unknown";

export const MUST_HAVES = FACTS.filter((f) => f.mustHave);
export const EDITABLE_FACTS = FACTS.filter((f) => !("derived" in f && f.derived));

export const LAYOUT_LABEL: Record<string, string> = {
  single_room: "Single room",
  double_room: "Double room",
  multiroom: "Multi-room unit",
  bedsitter_studio: "Bedsitter",
  bedroom_home: "Bedroom home",
};

export const SCOPE_LABEL: Record<string, string> = {
  entire_home: "Entire home",
  private_room: "Private room",
  shared_room: "Shared room",
  bedspace: "Bedspace",
};

export const STYLE_LABEL: Record<string, string> = {
  apartment: "Apartment",
  bungalow: "Bungalow",
  maisonette: "Maisonette",
  townhouse: "Townhouse",
  terraced_house: "Terraced house",
  villa: "Villa",
  mansion: "Mansion",
  cottage: "Cottage",
  farmhouse: "Farmhouse",
  other: "Other",
};

export const ADVERTISER_ROLE_LABEL: Record<string, string> = {
  owner: "Direct landlord",
  agent: "Agent",
  property_manager: "Property manager",
  caretaker: "Caretaker",
};

export const PRICE_BASIS_LABEL: Record<string, string> = {
  entire_unit: "",
  per_person: "per person",
  per_bed: "per bed",
  per_room: "per room",
};

export const PERIOD_LABEL: Record<string, string> = {
  month: "month",
  week: "week",
  night: "night",
  semester: "semester",
};

/** "Bedsitter", "2-bedroom", "Private room · 3-bedroom apartment" */
export function layoutLabel(u: { layout: string; bedrooms?: number | null; rental_scope?: string | null }) {
  const base =
    u.layout === "bedroom_home" && u.bedrooms ? `${u.bedrooms}-bedroom` : LAYOUT_LABEL[u.layout] ?? "Home";
  if (u.rental_scope && u.rental_scope !== "entire_home") return `${SCOPE_LABEL[u.rental_scope]} · ${base}`;
  return base;
}
