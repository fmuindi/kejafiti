"use client";

import { useRef, useState } from "react";
import { addPhoto, removePhoto, updatePhotos } from "@/app/w/[orgId]/listings/actions";
import { Icon } from "@/components/ui/icon";
import { Button, Notice, cx } from "@/components/ui/primitives";
import { MAX_UPLOAD_BYTES, resizeImage } from "@/lib/image";
import { getBrowserClient } from "@/lib/supabase/browser";

export type WizardPhoto = { id: string; url: string; position: number; is_cover: boolean; media_label: "actual_unit" | "building" | "sample"; alt_text: string | null };
type Pending = { key: string; name: string; state: "uploading" | "failed"; error?: string; file: File; preview: string };

// Photos: take or choose files (no dragging needed), per-file status with retry/remove,
// move earlier/later buttons, an explicit "Make cover" and honest labels for sample media.
export function PhotoStep({ orgId, listingId, unitLabel, initial, onBack, onNext, onReview }: { orgId: string; listingId: string; unitLabel: string; initial: WizardPhoto[]; onBack: () => void; onNext: () => void; onReview?: () => void }) {
  const [photos, setPhotos] = useState<WizardPhoto[]>(initial);
  const [pending, setPending] = useState<Pending[]>([]);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ tone: "error" | "success"; text: string } | null>(null);
  const [announce, setAnnounce] = useState("");
  const cameraRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function upload(file: File, key = crypto.randomUUID()) {
    const preview = URL.createObjectURL(file);
    setPending((p) => [...p.filter((x) => x.key !== key), { key, name: file.name, state: "uploading", file, preview }]);
    try {
      if (!file.type.startsWith("image/")) throw new Error("Choose a photo (JPG, PNG, WEBP or HEIC).");
      if (file.size > MAX_UPLOAD_BYTES) throw new Error("This photo is larger than 15 MB.");
      const full = await resizeImage(file, 1600, 0.82);
      const thumb = await resizeImage(file, 640, 0.78);
      if (!full || !thumb) throw new Error("This photo format can't be processed on this device. Try JPG or PNG.");
      const id = crypto.randomUUID();
      const path = `${orgId}/${listingId}/${id}.jpg`;
      const thumbPath = `${orgId}/${listingId}/${id}_thumb.jpg`;
      const storage = getBrowserClient().storage.from("listing-media");
      const a = await storage.upload(path, full.blob, { contentType: "image/jpeg" });
      if (a.error) throw new Error("The upload didn't finish. Check your connection and retry.");
      const b = await storage.upload(thumbPath, thumb.blob, { contentType: "image/jpeg" });
      if (b.error) throw new Error("The upload didn't finish. Check your connection and retry.");
      const r = await addPhoto(orgId, listingId, { path, thumbPath, width: full.width, height: full.height, size: full.blob.size, label: "actual_unit" });
      if (!r.ok) throw new Error(r.message);
      setPhotos((ps) => [...ps, { id: r.data.id, url: preview, position: ps.length, is_cover: ps.length === 0, media_label: "actual_unit", alt_text: null }]);
      setPending((p) => p.filter((x) => x.key !== key));
    } catch (e) {
      setPending((p) => p.map((x) => (x.key === key ? { ...x, state: "failed", error: (e as Error).message } : x)));
    }
  }

  const add = (list: FileList | null) => {
    if (!list) return;
    for (const f of Array.from(list).slice(0, 24)) void upload(f);
  };

  const move = (i: number, d: number) => {
    const j = i + d;
    if (j < 0 || j >= photos.length) return;
    const next = [...photos];
    [next[i], next[j]] = [next[j], next[i]];
    setPhotos(next.map((p, k) => ({ ...p, position: k })));
    setAnnounce(`Photo moved to position ${j + 1} of ${photos.length}`);
  };

  const makeCover = (id: string) => {
    setPhotos(photos.map((p) => ({ ...p, is_cover: p.id === id })));
    setAnnounce("Cover photo changed");
  };

  async function saveOrder() {
    setSaving(true);
    const r = await updatePhotos(orgId, listingId, photos.map((p, i) => ({ id: p.id, position: i, is_cover: p.is_cover, media_label: p.media_label, alt_text: p.alt_text })));
    setSaving(false);
    if (!r.ok) setMessage({ tone: "error", text: r.message });
    return r.ok;
  }

  const uploading = pending.filter((p) => p.state === "uploading").length;
  const failed = pending.filter((p) => p.state === "failed").length;

  return (
    <section aria-labelledby="s4" className="flex flex-col gap-4">
      <h1 id="s4" className="font-display text-[26px] leading-[1.1] font-bold tracking-[-0.5px]">Photos of Unit {unitLabel}</h1>
      <p className="-mt-2 text-[14.5px] text-muted">Use photos of this actual unit. Remove people, documents and personal items before uploading.</p>
      <div id="photos" tabIndex={-1} className="grid grid-cols-2 gap-2 rounded-[12px] focus:ring-2 focus:ring-deep/40 focus:outline-none">
        <Button type="button" variant="secondary" size="lg" icon="camera" onClick={() => cameraRef.current?.click()}>Take photo</Button>
        <Button type="button" variant="secondary" size="lg" icon="image" onClick={() => fileRef.current?.click()}>Choose photos</Button>
      </div>
      <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="sr-only" tabIndex={-1} aria-hidden="true" onChange={(e) => { add(e.target.files); e.target.value = ""; }} />
      <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,image/heic" multiple className="sr-only" tabIndex={-1} aria-hidden="true" onChange={(e) => { add(e.target.files); e.target.value = ""; }} />
      <p className="text-[12.5px] text-muted">JPG, PNG, WEBP or HEIC · up to 15 MB each · at least 4 photos. We resize photos on your phone before uploading to save data.</p>
      <p className="sr-only" aria-live="polite">{announce}</p>

      <ul className="flex flex-col gap-3">
        {photos.map((p, i) => (
          <li key={p.id} className="flex gap-3 rounded-[16px] border border-line bg-surface p-3">
            <div className="relative h-[84px] w-[112px] shrink-0 overflow-hidden rounded-[10px] bg-cool">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {p.url ? <img src={p.url} alt="" className="size-full object-cover" /> : null}
              {p.is_cover ? <span className="absolute top-1 left-1 rounded-[6px] bg-ink px-1.5 py-0.5 text-[11px] font-semibold text-white">Cover</span> : null}
            </div>
            <div className="flex min-w-0 flex-1 flex-col gap-2">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[14px] font-semibold">{i + 1} · Uploaded</p>
                <div className="flex gap-1">
                  <button type="button" aria-label={`Move photo ${i + 1} earlier`} disabled={i === 0} onClick={() => move(i, -1)} className="grid size-10 place-items-center rounded-full border border-line disabled:opacity-40"><Icon name="arrowUp" size={16} /></button>
                  <button type="button" aria-label={`Move photo ${i + 1} later`} disabled={i === photos.length - 1} onClick={() => move(i, 1)} className="grid size-10 place-items-center rounded-full border border-line disabled:opacity-40"><Icon name="arrowDown" size={16} /></button>
                </div>
              </div>
              <label className="flex items-center gap-2 text-[13px]">
                <span className="sr-only">Photo type</span>
                <select value={p.media_label} onChange={(e) => setPhotos(photos.map((x) => (x.id === p.id ? { ...x, media_label: e.target.value as WizardPhoto["media_label"] } : x)))} className="min-h-10 rounded-[10px] border border-line bg-surface px-2">
                  <option value="actual_unit">This unit</option>
                  <option value="building">Building / compound</option>
                  <option value="sample">Sample (similar unit)</option>
                </select>
              </label>
              <div className="flex flex-wrap gap-3 text-[13.5px] font-semibold">
                {!p.is_cover ? <button type="button" onClick={() => makeCover(p.id)} className="underline">Make cover</button> : null}
                <button type="button" className="underline" onClick={async () => { const r = await removePhoto(orgId, listingId, p.id); if (r.ok) setPhotos(photos.filter((x) => x.id !== p.id).map((x, k) => ({ ...x, position: k }))); else setMessage({ tone: "error", text: r.message }); }}>Remove</button>
              </div>
            </div>
          </li>
        ))}
        {pending.map((p) => (
          <li key={p.key} className={cx("flex gap-3 rounded-[16px] border bg-surface p-3", p.state === "failed" ? "border-error" : "border-line")}>
            <div className="h-[84px] w-[112px] shrink-0 overflow-hidden rounded-[10px] bg-cool">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.preview} alt="" className="size-full object-cover opacity-60" />
            </div>
            <div className="flex min-w-0 flex-1 flex-col gap-1" aria-live="polite">
              <p className="truncate text-[14px] font-semibold">{p.name}</p>
              <p className={cx("text-[13px]", p.state === "failed" ? "font-semibold text-error" : "text-muted")}>{p.state === "failed" ? `Upload failed. ${p.error ?? ""}` : "Uploading…"}</p>
              {p.state === "failed" ? (
                <div className="flex gap-3 text-[13.5px] font-semibold">
                  <button type="button" className="underline" onClick={() => void upload(p.file, p.key)}>Retry</button>
                  <button type="button" className="underline" onClick={() => setPending(pending.filter((x) => x.key !== p.key))}>Remove</button>
                </div>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
      {photos.length === 0 && pending.length === 0 ? (
        <p className="rounded-[16px] border border-dashed border-line bg-surface p-6 text-center text-[14px] text-muted">No photos yet. Start with the main room, then the bathroom, kitchen and entrance.</p>
      ) : null}
      <p className="text-[13px] text-muted" aria-live="polite">
        {photos.length} uploaded{uploading ? ` · ${uploading} uploading` : ""}{failed ? ` · ${failed} failed` : ""}. Uploaded photos are kept if you leave.
      </p>
      {photos.some((p) => p.media_label === "sample") ? <Notice tone="waiting">Sample photos are labelled &quot;Sample photo, not this unit&quot; for tenants.</Notice> : null}
      {message ? <Notice tone={message.tone} role="alert">{message.text}</Notice> : null}
      <div className="flex gap-3">
        <Button type="button" variant="secondary" size="lg" onClick={async () => { if (await saveOrder()) onBack(); }} className="flex-1">Back</Button>
        <Button type="button" size="lg" pending={saving} disabled={uploading > 0} onClick={async () => { if (await saveOrder()) onNext(); }} className="flex-[1.6]">
          Continue to availability
        </Button>
      </div>
      {onReview ? (
        // Waits for uploads to finish so returning to review can't drop a photo in flight.
        <Button type="button" variant="dark" size="lg" pending={saving} disabled={uploading > 0} onClick={async () => { if (await saveOrder()) onReview(); }}>
          {uploading ? "Waiting for uploads to finish" : "Save and back to review"}
        </Button>
      ) : null}
    </section>
  );
}
