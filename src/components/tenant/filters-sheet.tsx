"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui/icon";
import { HOME_TYPES, MUST_HAVES } from "@/lib/listing/catalog";
import { toQuery, type SearchParams } from "@/lib/listing/search";

// Full-height filter sheet. Changes stay local until "Show N homes"; the count updates as
// filters change. Uses a native <dialog> for focus containment, Esc and focus return.

type Draft = SearchParams;

export function FiltersSheet({ params, count }: { params: SearchParams; count: number }) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [draft, setDraft] = useState<Draft>(params);
  const [live, setLive] = useState<number | null>(null);
  const [counting, setCounting] = useState(false);
  const [isOpen, setIsOpen] = useState(false);

  const open = () => {
    setDraft(params);
    setIsOpen(true);
    dialogRef.current?.showModal();
  };
  const close = () => {
    dialogRef.current?.close();
    setIsOpen(false);
    triggerRef.current?.focus();
  };

  useEffect(() => {
    if (!isOpen) return;
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      setCounting(true);
      try {
        const res = await fetch(`/api/search/count?${toQuery({ ...draft, page: 1 })}`, { signal: ctrl.signal });
        const json = (await res.json()) as { count: number };
        setLive(json.count);
      } catch {
        // Keep the last count; the button still applies the filters.
      } finally {
        setCounting(false);
      }
    }, 250);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [draft, isOpen]);

  const toggle = (key: "types" | "must", value: string) =>
    setDraft((d) => ({ ...d, [key]: d[key].includes(value) ? d[key].filter((v) => v !== value) : [...d[key], value] }));

  const apply = () => {
    router.push(`/search?${toQuery({ ...draft, page: 1 })}`);
    close();
  };

  const chip = (active: boolean) =>
    `inline-flex min-h-11 items-center rounded-full border-[1.5px] px-4 text-[14.5px] font-semibold ${
      active ? "border-ink bg-ink text-white" : "border-line bg-surface text-ink"
    }`;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={open}
        className="inline-flex min-h-11 items-center gap-2 rounded-[12px] bg-ink px-4 text-[14.5px] font-semibold text-white"
      >
        <Icon name="filter" size={18} />
        Filters{count ? ` · ${count}` : ""}
      </button>
      <dialog
        ref={dialogRef}
        aria-labelledby="filters-title"
        onClose={() => {
          setIsOpen(false);
          triggerRef.current?.focus();
        }}
        className="m-0 h-dvh max-h-dvh w-full max-w-full bg-cream p-0 backdrop:bg-ink/40 md:m-auto md:h-[min(860px,92dvh)] md:max-w-[560px] md:rounded-[22px]"
      >
        <div className="flex h-full flex-col">
          <div className="flex items-center justify-between border-b border-line bg-surface px-4 py-3">
            <button type="button" onClick={close} aria-label="Close filters" className="grid size-11 place-items-center rounded-full hover:bg-cool">
              <Icon name="x" />
            </button>
            <h2 id="filters-title" className="font-display text-[20px] font-bold">
              Filters
            </h2>
            <button
              type="button"
              onClick={() => setDraft({ ...params, min: undefined, max: undefined, basis: "rent", types: [], must: [], unconfirmed: false, furnishing: undefined, by: undefined, movein: undefined })}
              className="min-h-11 px-2 text-[14px] font-semibold text-primary"
            >
              Clear all
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-4 py-5">
            <div className="mx-auto flex max-w-[520px] flex-col gap-7">
              <fieldset>
                <legend className="font-display text-[18px] font-bold">Monthly budget</legend>
                <div className="mt-3 grid grid-cols-2 gap-3">
                  {(["min", "max"] as const).map((k) => (
                    <label key={k} className="flex flex-col gap-1.5">
                      <span className="text-[14px] font-semibold">{k === "min" ? "Minimum" : "Maximum"}</span>
                      <span className="flex min-h-[50px] items-center rounded-[12px] border border-input bg-surface focus-within:ring-2 focus-within:ring-deep/40">
                        <span className="border-r border-divider px-3 text-[14px] text-muted">KES</span>
                        <input
                          inputMode="numeric"
                          value={draft[k] ?? ""}
                          onChange={(e) => {
                            const n = Number(e.target.value.replace(/[^\d]/g, ""));
                            setDraft((d) => ({ ...d, [k]: n > 0 ? n : undefined }));
                          }}
                          placeholder={k === "min" ? "No min" : "No max"}
                          className="w-full min-w-0 bg-transparent px-3 text-[16px] font-semibold focus:outline-none"
                        />
                      </span>
                    </label>
                  ))}
                </div>
                <div role="radiogroup" aria-label="Budget applies to" className="mt-3 grid grid-cols-2 rounded-[12px] bg-cool p-1">
                  {(["rent", "fixed"] as const).map((b) => (
                    <button
                      key={b}
                      type="button"
                      role="radio"
                      aria-checked={draft.basis === b}
                      onClick={() => setDraft((d) => ({ ...d, basis: b }))}
                      className={`min-h-10 rounded-[10px] text-[14px] font-semibold ${draft.basis === b ? "bg-surface shadow-[0_0_0_1px_#ccc]" : "text-muted"}`}
                    >
                      {b === "rent" ? "Rent only" : "Rent + fixed charges"}
                    </button>
                  ))}
                </div>
              </fieldset>

              <fieldset>
                <legend className="font-display text-[18px] font-bold">Home type</legend>
                <div className="mt-3 flex flex-wrap gap-2">
                  {HOME_TYPES.map((t) => (
                    <button key={t.value} type="button" aria-pressed={draft.types.includes(t.value)} onClick={() => toggle("types", t.value)} className={chip(draft.types.includes(t.value))}>
                      {t.label}
                    </button>
                  ))}
                </div>
              </fieldset>

              <fieldset>
                <legend className="font-display text-[18px] font-bold">Must-haves</legend>
                <p className="text-[13.5px] text-muted">Only homes where the advertiser said yes</p>
                <div className="mt-3 flex flex-col divide-y divide-divider rounded-[16px] border border-line bg-surface">
                  {MUST_HAVES.map((f) => (
                    <label key={f.key} className="flex min-h-[52px] cursor-pointer items-center justify-between gap-3 px-4">
                      <span className="text-[15px]">{f.label}</span>
                      <input type="checkbox" checked={draft.must.includes(f.key)} onChange={() => toggle("must", f.key)} className="size-[22px] accent-primary" />
                    </label>
                  ))}
                </div>
                <label className="mt-3 flex cursor-pointer items-start justify-between gap-3 rounded-[16px] border border-line bg-surface p-4">
                  <span>
                    <span className="block text-[15px] font-semibold">Include unconfirmed</span>
                    <span className="text-[13px] text-muted">Shows homes where a must-have isn&apos;t answered yet, labelled clearly</span>
                  </span>
                  <input
                    type="checkbox"
                    role="switch"
                    checked={draft.unconfirmed}
                    onChange={(e) => setDraft((d) => ({ ...d, unconfirmed: e.target.checked }))}
                    className="mt-1 size-[22px] accent-primary"
                  />
                </label>
              </fieldset>

              <fieldset>
                <legend className="font-display text-[18px] font-bold">Furnishing</legend>
                <div className="mt-3 flex flex-wrap gap-2">
                  {([undefined, "furnished", "unfurnished"] as const).map((v) => (
                    <button key={v ?? "any"} type="button" aria-pressed={draft.furnishing === v} onClick={() => setDraft((d) => ({ ...d, furnishing: v }))} className={chip(draft.furnishing === v)}>
                      {v === "furnished" ? "Furnished" : v === "unfurnished" ? "Unfurnished" : "Any"}
                    </button>
                  ))}
                </div>
              </fieldset>

              <fieldset>
                <legend className="font-display text-[18px] font-bold">Listed by</legend>
                <div className="mt-3 flex flex-wrap gap-2">
                  {([undefined, "landlord", "agent"] as const).map((v) => (
                    <button key={v ?? "any"} type="button" aria-pressed={draft.by === v} onClick={() => setDraft((d) => ({ ...d, by: v }))} className={chip(draft.by === v)}>
                      {v === "landlord" ? "Landlord" : v === "agent" ? "Agent or manager" : "Anyone"}
                    </button>
                  ))}
                </div>
              </fieldset>

              <label className="flex flex-col gap-1.5">
                <span className="font-display text-[18px] font-bold">Move in by</span>
                <input
                  type="date"
                  value={draft.movein ?? ""}
                  onChange={(e) => setDraft((d) => ({ ...d, movein: e.target.value || undefined }))}
                  className="min-h-[50px] rounded-[12px] border border-input bg-surface px-3 text-[16px]"
                />
              </label>
            </div>
          </div>

          <div className="safe-bottom border-t border-line bg-surface px-4 pt-3">
            <button
              type="button"
              onClick={apply}
              className="mx-auto flex min-h-[54px] w-full max-w-[520px] items-center justify-center rounded-[14px] bg-primary text-[16px] font-semibold text-white hover:bg-primary-hover"
            >
              <span aria-live="polite">
                {counting && live === null ? "Show homes" : live === null ? "Show homes" : `Show ${live} home${live === 1 ? "" : "s"}`}
              </span>
            </button>
          </div>
        </div>
      </dialog>
    </>
  );
}
