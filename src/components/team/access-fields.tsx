"use client";

import { Checkbox } from "@/components/ui/form";
import type { AccessInput } from "@/app/w/[orgId]/team/actions";

export type AccessState = Omit<AccessInput, "role"> & { role: AccessInput["role"] };

export const DEFAULT_ACCESS: Record<AccessInput["role"], Omit<AccessState, "property_ids" | "all_properties">> = {
  manager: { role: "manager", can_manage_tenancies: true, can_enter_payments: true, can_confirm: true, can_correct: false, can_export: true, can_view_attachments: true, can_manage_listings: true },
  caretaker: { role: "caretaker", can_manage_tenancies: false, can_enter_payments: true, can_confirm: false, can_correct: false, can_export: false, can_view_attachments: false, can_manage_listings: false },
  viewer: { role: "viewer", can_manage_tenancies: false, can_enter_payments: false, can_confirm: false, can_correct: false, can_export: true, can_view_attachments: true, can_manage_listings: false },
  agency_admin: { role: "agency_admin", can_manage_tenancies: true, can_enter_payments: true, can_confirm: true, can_correct: true, can_export: true, can_view_attachments: true, can_manage_listings: true },
};

// Properties and permission switches, shared by "Add manager" and "Edit access".
export function AccessFields({
  value,
  onChange,
  properties,
  isOwner,
  propertyError,
}: {
  value: AccessState;
  onChange: (v: AccessState) => void;
  properties: Array<{ id: string; name: string }>;
  isOwner: boolean;
  propertyError?: string;
}) {
  const viewer = value.role === "viewer";
  const set = (patch: Partial<AccessState>) => onChange({ ...value, ...patch });
  return (
    <>
      <fieldset id="property_ids" className="flex flex-col gap-2">
        <legend className="mb-1 text-[14px] font-semibold">Properties</legend>
        {value.role === "agency_admin" ? (
          <p className="text-[13.5px] text-muted">Agency admins work across all properties.</p>
        ) : (
          <>
            <Checkbox checked={value.all_properties} onChange={(e) => set({ all_properties: e.target.checked })} label="All properties, including ones added later" />
            {!value.all_properties
              ? properties.map((p) => (
                  <Checkbox
                    key={p.id}
                    checked={value.property_ids.includes(p.id)}
                    onChange={(e) => set({ property_ids: e.target.checked ? [...value.property_ids, p.id] : value.property_ids.filter((x) => x !== p.id) })}
                    label={p.name}
                  />
                ))
              : null}
            {properties.length === 0 ? <p className="text-[13.5px] text-muted">Add a property first.</p> : null}
          </>
        )}
        {propertyError ? <p className="text-[13.5px] font-semibold text-error">{propertyError}</p> : null}
      </fieldset>
      <fieldset className="flex flex-col gap-3">
        <legend className="mb-1 text-[14px] font-semibold">What they can do</legend>
        <Checkbox disabled={viewer} checked={value.can_enter_payments} onChange={(e) => set({ can_enter_payments: e.target.checked })} label="Enter payments and attach receipts" />
        <div className="rounded-[12px] border border-[#f0d9ad] bg-waiting-tint/50 p-3">
          <Checkbox
            disabled={viewer}
            checked={value.can_confirm}
            onChange={(e) => set({ can_confirm: e.target.checked })}
            label="Can confirm rent records"
            description="Final say after checking payments outside the platform. You won't be asked to approve again."
          />
        </div>
        <Checkbox disabled={viewer} checked={value.can_correct} onChange={(e) => set({ can_correct: e.target.checked })} label="Correct confirmed records" description="Reverse and re-post with a reason. The original is always kept." />
        <Checkbox disabled={viewer} checked={value.can_manage_tenancies} onChange={(e) => set({ can_manage_tenancies: e.target.checked })} label="Manage tenancies and rent charges" />
        <Checkbox disabled={viewer} checked={value.can_manage_listings} onChange={(e) => set({ can_manage_listings: e.target.checked })} label="Manage listings, enquiries and viewings" />
        <Checkbox checked={value.can_view_attachments} onChange={(e) => set({ can_view_attachments: e.target.checked })} label="View receipts and evidence" />
        <Checkbox checked={value.can_export} onChange={(e) => set({ can_export: e.target.checked })} label="Export and finalize reports" />
        <Checkbox disabled checked={false} onChange={() => undefined} label="Invite or manage staff · owners only" description={isOwner ? "Give someone the Agency admin role to share staff management." : undefined} />
      </fieldset>
    </>
  );
}
