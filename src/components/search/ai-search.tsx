"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button, cx } from "@/components/ui/primitives";

// AI-01 + AI-02: one search box for typed and spoken requests. Both end in the same canonical
// search URL that manual filters produce; the results page runs the ordinary search on it.

type Outcome =
  | { outcome: "success"; query: string; changes: string[]; defaults: string[]; notes: string[] }
  | { outcome: "clarification_required"; question: string; choices: Array<{ label: string; query: string }>; partialQuery: string; notes: string[] }
  | { outcome: "unsupported_input" | "unavailable" | "rate_limited" | "provider_timeout" | "invalid_audio"; message: string };

const MAX_SECONDS = 30;
/** Wall clock for recording times; read only in event handlers and effects. */
const now = () => Date.now();
const UNDO_KEY = "nyumbani.aiSearch.undo";
const LAST_KEY = "nyumbani.aiSearch.last";

/** Remember how a search was interpreted, and where Undo goes (this browser tab only). */
export function rememberInterpretation(from: string, to: string, info: { text: string; changes: string[]; defaults: string[]; notes: string[] }) {
  try {
    const stack = JSON.parse(sessionStorage.getItem(UNDO_KEY) ?? "[]") as Array<{ from: string; to: string }>;
    sessionStorage.setItem(UNDO_KEY, JSON.stringify([...stack.slice(-19), { from, to }]));
    sessionStorage.setItem(LAST_KEY, JSON.stringify({ to, ...info }));
  } catch {
    /* storage unavailable: search still works, without Undo */
  }
}

type Phase = "idle" | "requesting" | "recording" | "transcribing" | "searching";

function pickMime() {
  if (typeof MediaRecorder === "undefined") return null;
  // Browsers differ (Chrome: webm/opus, Safari: mp4); ask rather than assume.
  return ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus", "audio/ogg"].find((t) => MediaRecorder.isTypeSupported(t)) ?? "";
}

export function AiSearch({ variant, currentQuery = "", voice, placeholder }: { variant: "home" | "refine"; currentQuery?: string; voice: boolean; placeholder?: string }) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [seconds, setSeconds] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const [question, setQuestion] = useState<Extract<Outcome, { outcome: "clarification_required" }> | null>(null);
  const [heard, setHeard] = useState<string | null>(null);
  // Every request carries a generation; a stale response never replaces newer input.
  const generation = useRef(0);
  const abort = useRef<AbortController | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const startedAt = useRef(0);
  const discard = useRef(false);

  const releaseMic = useCallback(() => {
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
  }, []);

  // No microphone stays on after leaving the page.
  useEffect(() => () => {
    discard.current = true;
    if (recorder.current?.state === "recording") recorder.current.stop();
    releaseMic();
    abort.current?.abort();
  }, [releaseMic]);

  useEffect(() => {
    if (phase !== "recording") return;
    const t = setInterval(() => {
      const s = Math.floor((now() - startedAt.current) / 1000);
      setSeconds(s);
      if (s >= MAX_SECONDS) recorder.current?.stop();
    }, 250);
    return () => clearInterval(t);
  }, [phase]);

  async function search(words: string, source: "text" | "voice") {
    const gen = ++generation.current;
    abort.current?.abort();
    abort.current = new AbortController();
    setPhase("searching");
    setMessage(null);
    setQuestion(null);
    try {
      const res = await fetch("/api/ai/search-intent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: words, source, current: currentQuery, request_id: crypto.randomUUID() }),
        signal: abort.current.signal,
      });
      const out = (await res.json()) as Outcome;
      if (gen !== generation.current) return;
      if (out.outcome === "success") {
        rememberInterpretation(currentQuery, out.query, { text: words, changes: out.changes, defaults: out.defaults, notes: out.notes });
        setPhase("idle");
        router.push(`/search?${out.query}`);
        if (variant === "refine") setText("");
        return;
      }
      setPhase("idle");
      if (out.outcome === "clarification_required") setQuestion(out);
      else setMessage(out.message);
    } catch (e) {
      if ((e as Error).name === "AbortError" || gen !== generation.current) return;
      setPhase("idle");
      setMessage("We couldn't reach the search service. Check your connection, or use the filters.");
    }
  }

  async function startRecording() {
    setMessage(null);
    setQuestion(null);
    setHeard(null);
    const mime = pickMime();
    if (mime === null || !navigator.mediaDevices?.getUserMedia) {
      setMessage("Voice search doesn't work in this browser. Type your request instead.");
      return;
    }
    setPhase("requesting");
    try {
      // Permission is asked only now, after the tap.
      stream.current = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (e) {
      setPhase("idle");
      setMessage((e as Error).name === "NotAllowedError" ? "The microphone is blocked. Allow it in your browser's site settings, or type instead." : "No microphone was found. Type your request instead.");
      return;
    }
    chunks.current = [];
    discard.current = false;
    const rec = new MediaRecorder(stream.current, mime ? { mimeType: mime } : undefined);
    recorder.current = rec;
    rec.ondataavailable = (ev) => ev.data.size && chunks.current.push(ev.data);
    rec.onstop = () => {
      releaseMic();
      const durationMs = now() - startedAt.current;
      if (discard.current) {
        setPhase("idle");
        return;
      }
      void upload(new Blob(chunks.current, { type: rec.mimeType || mime || "audio/webm" }), durationMs);
    };
    startedAt.current = now();
    setSeconds(0);
    rec.start();
    setPhase("recording");
  }

  function stopAndSearch() {
    discard.current = false;
    recorder.current?.stop();
  }

  function cancel() {
    generation.current++;
    discard.current = true;
    abort.current?.abort();
    if (recorder.current?.state === "recording") recorder.current.stop();
    releaseMic();
    setPhase("idle");
  }

  async function upload(blob: Blob, durationMs: number) {
    const gen = ++generation.current;
    abort.current = new AbortController();
    setPhase("transcribing");
    const form = new FormData();
    form.append("audio", blob, "clip");
    form.append("duration_ms", String(durationMs));
    form.append("request_id", crypto.randomUUID());
    try {
      const res = await fetch("/api/ai/transcribe-search", { method: "POST", body: form, signal: abort.current.signal });
      const out = (await res.json()) as { outcome: string; transcript?: string; message?: string };
      if (gen !== generation.current) return;
      if (out.outcome !== "success" || !out.transcript) {
        setPhase("idle");
        setMessage(out.message ?? "Voice search didn't work. Type your request instead.");
        return;
      }
      // The words stay visible and editable; no separate confirmation step.
      setText(out.transcript);
      setHeard(out.transcript);
      await search(out.transcript, "voice");
    } catch (e) {
      if ((e as Error).name === "AbortError" || gen !== generation.current) return;
      setPhase("idle");
      setMessage("The recording didn't upload. Check your connection and try again, or type instead.");
    }
  }

  const busy = phase === "searching" || phase === "transcribing" || phase === "requesting";
  const recording = phase === "recording";

  return (
    <div className="flex flex-col gap-2">
      <form
        role="search"
        aria-label={variant === "home" ? "Describe your home" : "Refine this search"}
        onSubmit={(e) => {
          e.preventDefault();
          if (text.trim().length >= 2) void search(text.trim(), heard === text ? "voice" : "text");
        }}
        className="flex flex-col gap-2"
      >
        <label htmlFor={`ai-${variant}`} className={variant === "home" ? "text-[13px] font-semibold text-muted" : "sr-only"}>
          {variant === "home" ? "Describe your home" : "Refine this search"}
        </label>
        <div className={cx("flex flex-wrap items-stretch gap-2 rounded-[14px] border bg-surface p-1.5 focus-within:ring-2 focus-within:ring-deep/40 sm:flex-nowrap", recording ? "border-primary" : "border-input")}>
          {recording ? (
            <p className="flex min-h-11 w-full items-center gap-2 px-2 text-[15px] font-semibold sm:w-auto sm:flex-1" role="status" aria-live="polite">
              <span className="inline-block size-2.5 animate-pulse rounded-full bg-primary" aria-hidden="true" />
              Listening · {seconds}s{seconds >= MAX_SECONDS - 5 ? ` · stops at ${MAX_SECONDS}s` : ""}
            </p>
          ) : (
            <input
              id={`ai-${variant}`}
              value={text}
              onChange={(e) => setText(e.target.value)}
              maxLength={500}
              disabled={busy}
              placeholder={placeholder ?? (variant === "home" ? "e.g. Bedsitter in Ruaka under 15k, private bathroom" : "e.g. Make it 18k, or try Ruiru instead")}
              className="min-h-11 w-full min-w-0 bg-transparent px-2 text-[16px] font-semibold sm:w-auto sm:flex-1 text-ink placeholder:font-normal placeholder:text-[#8c959b] focus:outline-none"
            />
          )}
          {voice && !recording ? (
            <button type="button" onClick={() => void startRecording()} disabled={busy} aria-label="Search by voice" className="grid size-11 shrink-0 place-items-center rounded-[10px] border border-line text-ink hover:border-ink disabled:opacity-50">
              <MicIcon />
            </button>
          ) : null}
          {recording ? (
            <>
              <Button type="button" variant="secondary" onClick={cancel} className="flex-1 sm:flex-none">Cancel</Button>
              <Button type="button" onClick={stopAndSearch} className="flex-[1.6] sm:flex-none">Stop and search</Button>
            </>
          ) : (
            <Button type="submit" pending={busy} pendingLabel={phase === "transcribing" ? "Listening" : "Searching"} disabled={busy || text.trim().length < 2} className="flex-1 sm:flex-none" icon="search">
              {variant === "home" ? "Find homes" : "Refine"}
            </Button>
          )}
        </div>
        {busy && phase !== "requesting" ? (
          <button type="button" onClick={cancel} className="self-start text-[13px] font-semibold underline">Cancel</button>
        ) : null}
      </form>
      {voice && variant === "home" && !recording ? (
        <p className="text-[12px] text-muted">Your request is read by our AI providers (OpenAI, or Anthropic as a backup) to set the filters. Voice recordings go to OpenAI to become text; nyumbani doesn&apos;t keep them.</p>
      ) : null}
      {heard ? <p className="text-[13px] text-muted">We heard: &quot;{heard}&quot;. Edit the words above if anything is wrong.</p> : null}
      {message ? <p role="alert" className="text-[14px] font-semibold text-error">{message}</p> : null}
      {question ? (
        <div role="group" aria-label={question.question} className="flex flex-col gap-2 rounded-[14px] border border-line bg-surface p-3">
          <p className="font-semibold">{question.question}</p>
          <div className="flex flex-wrap gap-2">
            {question.choices.map((c) => (
              <Button key={c.label} type="button" size="sm" variant="secondary" onClick={() => {
                rememberInterpretation(currentQuery, c.query, { text, changes: [], defaults: [], notes: question.notes });
                router.push(`/search?${c.query}`);
              }}>
                {c.label}
              </Button>
            ))}
            <Button type="button" size="sm" variant="quiet" onClick={() => {
              rememberInterpretation(currentQuery, question.partialQuery, { text, changes: [], defaults: [], notes: [...question.notes, "Searched without that part. Add it from the filters."] });
              router.push(`/search?${question.partialQuery}`);
            }}>
              Search without it
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function MicIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
    </svg>
  );
}
