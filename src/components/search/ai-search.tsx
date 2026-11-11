"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Button, cx, InlineError } from "@/components/ui/primitives";

// AI-01 + AI-02: search by voice. A floating mic; one tap opens it and starts listening, it stops
// by itself when the person stops talking, and the results open with the filters set. English,
// Kiswahili or a mix are recognised without choosing a language. The words become the same
// canonical search URL that the manual filters produce.

type Outcome =
  | { outcome: "success"; query: string; changes: string[]; defaults: string[]; notes: string[] }
  | { outcome: "clarification_required"; question: string; choices: Array<{ label: string; query: string }>; partialQuery: string; notes: string[] }
  | { outcome: "unsupported_input" | "unavailable" | "rate_limited" | "provider_timeout" | "invalid_audio"; message: string };

const MAX_SECONDS = 20;
/** Stop this long after the person stops talking. */
const TRAILING_SILENCE_MS = 1300;
/** Give up if nothing is said for this long. */
const NO_SPEECH_MS = 8000;
const UNAVAILABLE = "Voice search isn't available at the moment. Please use the filters.";
/** Wall clock; read only in event handlers and effects. */
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

function pickMime() {
  if (typeof MediaRecorder === "undefined") return null;
  // Browsers differ (Chrome: webm/opus, Safari: mp4); ask rather than assume.
  return ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus", "audio/ogg"].find((t) => MediaRecorder.isTypeSupported(t)) ?? "";
}
const noop = () => () => {};
const canRecord = () => pickMime() !== null && typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia;

type Phase = "closed" | "starting" | "listening" | "transcribing" | "searching" | "error" | "question";

export function VoiceSearch({ currentQuery = "", serverVoice }: { currentQuery?: string; serverVoice: boolean }) {
  const router = useRouter();
  // Decided in the browser only; the server renders nothing for it.
  const supported = useSyncExternalStore(noop, canRecord, () => false);
  const [phase, setPhase] = useState<Phase>("closed");
  const [level, setLevel] = useState(0);
  const [words, setWords] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [question, setQuestion] = useState<Extract<Outcome, { outcome: "clarification_required" }> | null>(null);
  const generation = useRef(0);
  const abort = useRef<AbortController | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const audio = useRef<AudioContext | null>(null);
  const meter = useRef<ReturnType<typeof setInterval> | null>(null);
  const chunks = useRef<Blob[]>([]);
  const startedAt = useRef(0);
  const discard = useRef(false);
  const panel = useRef<HTMLDivElement>(null);
  const fab = useRef<HTMLButtonElement>(null);

  const releaseMic = useCallback(() => {
    if (meter.current) clearInterval(meter.current);
    meter.current = null;
    void audio.current?.close().catch(() => {});
    audio.current = null;
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

  const close = useCallback(() => {
    generation.current++;
    discard.current = true;
    abort.current?.abort();
    if (recorder.current?.state === "recording") recorder.current.stop();
    releaseMic();
    setPhase("closed");
    setWords("");
    setMessage(null);
    setQuestion(null);
    fab.current?.focus();
  }, [releaseMic]);

  // Escape closes, like any pop-up.
  useEffect(() => {
    if (phase === "closed") return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase, close]);

  // Move focus into the panel when its content changes, so keyboard and screen-reader users follow it.
  useEffect(() => {
    if (phase !== "closed") panel.current?.querySelector<HTMLElement>("[data-autofocus]")?.focus();
  }, [phase]);

  function fail(text: string) {
    releaseMic();
    setPhase("error");
    setMessage(text);
  }

  async function search(text: string) {
    const gen = ++generation.current;
    abort.current = new AbortController();
    setPhase("searching");
    try {
      const res = await fetch("/api/ai/search-intent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, source: "voice", current: currentQuery, request_id: crypto.randomUUID() }),
        signal: abort.current.signal,
      });
      const out = (await res.json()) as Outcome;
      if (gen !== generation.current) return;
      if (out.outcome === "success") {
        rememberInterpretation(currentQuery, out.query, { text, changes: out.changes, defaults: out.defaults, notes: out.notes });
        router.push(`/search?${out.query}`);
        setPhase("closed");
        setWords("");
        return;
      }
      if (out.outcome === "clarification_required") {
        setQuestion(out);
        setPhase("question");
      } else fail(out.message || UNAVAILABLE);
    } catch (e) {
      if ((e as Error).name === "AbortError" || gen !== generation.current) return;
      fail("We couldn't connect. Check your internet connection and try again.");
    }
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
      if (out.outcome !== "success" || !out.transcript) return fail(out.message ?? UNAVAILABLE);
      setWords(out.transcript);
      await search(out.transcript);
    } catch (e) {
      if ((e as Error).name === "AbortError" || gen !== generation.current) return;
      fail("We couldn't connect. Check your internet connection and try again.");
    }
  }

  /** Watch the sound level: stop shortly after speech ends, or give up if nothing is said. */
  function listenForSilence(s: MediaStream, rec: MediaRecorder) {
    try {
      const ctx = new AudioContext();
      audio.current = ctx;
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      ctx.createMediaStreamSource(s).connect(analyser);
      const buf = new Float32Array(analyser.fftSize);
      let floor = 0.005;
      let spoke = false;
      let lastVoice = now();
      meter.current = setInterval(() => {
        analyser.getFloatTimeDomainData(buf);
        let sum = 0;
        for (const v of buf) sum += v * v;
        const rms = Math.sqrt(sum / buf.length);
        const t = now();
        const elapsed = t - startedAt.current;
        // Learn the room's background level in the first moments, then look for speech above it.
        if (elapsed < 400) floor = Math.max(floor, rms);
        if (rms > Math.max(0.02, floor * 2.5)) {
          spoke = true;
          lastVoice = t;
        }
        setLevel(Math.min(1, rms * 8));
        if (rec.state !== "recording") return;
        if ((spoke && t - lastVoice > TRAILING_SILENCE_MS) || elapsed > MAX_SECONDS * 1000) rec.stop();
        else if (!spoke && elapsed > NO_SPEECH_MS) {
          discard.current = true;
          rec.stop();
          fail("We didn't hear anything. Tap Try again and speak clearly.");
        }
      }, 100);
    } catch {
      // No level meter: the person taps Done, or it stops at the time limit.
      meter.current = setInterval(() => {
        if (rec.state === "recording" && now() - startedAt.current > MAX_SECONDS * 1000) rec.stop();
      }, 250);
    }
  }

  async function start() {
    setMessage(null);
    setQuestion(null);
    setWords("");
    setLevel(0);
    setPhase("starting");
    const mime = pickMime();
    if (mime === null) return fail(UNAVAILABLE);
    try {
      // Permission is asked only now, after the tap.
      stream.current = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    } catch (e) {
      return fail((e as Error).name === "NotAllowedError" ? "The microphone is blocked. Allow it in your browser's site settings, or use the filters." : "No microphone was found. Please use the filters.");
    }
    chunks.current = [];
    discard.current = false;
    const rec = new MediaRecorder(stream.current, mime ? { mimeType: mime } : undefined);
    recorder.current = rec;
    rec.ondataavailable = (ev) => ev.data.size && chunks.current.push(ev.data);
    rec.onstop = () => {
      releaseMic();
      if (discard.current) return;
      void upload(new Blob(chunks.current, { type: rec.mimeType || mime || "audio/webm" }), now() - startedAt.current);
    };
    startedAt.current = now();
    rec.start();
    setPhase("listening");
    listenForSilence(stream.current, rec);
  }

  /** "Done": stop listening now and search with what was said. */
  function finish() {
    if (recorder.current?.state === "recording") {
      discard.current = false;
      recorder.current.stop();
    }
  }

  if (!serverVoice || !supported) return null;

  const open = phase !== "closed";
  const listening = phase === "listening";
  const working = phase === "starting" || phase === "transcribing" || phase === "searching";
  const refine = !!currentQuery;
  const title = listening
    ? "Listening…"
    : phase === "starting"
      ? "Starting the microphone…"
      : phase === "transcribing"
        ? "Got it…"
        : phase === "searching"
          ? "Finding homes…"
          : phase === "question"
            ? (question?.question ?? "")
            : "Voice search";
  const closeIcon = (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" aria-hidden="true">
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );

  return (
    <>
      {open ? (
        <div
          ref={panel}
          role="dialog"
          aria-label="Voice search"
          className="fixed inset-x-3 bottom-[calc(142px+env(safe-area-inset-bottom))] z-40 mx-auto flex max-w-narrow flex-col items-center gap-3 rounded-panel border border-line bg-surface p-5 pt-6 text-center shadow-overlay md:inset-x-auto md:right-8 md:bottom-28 md:w-[380px]"
        >
          <button type="button" onClick={close} aria-label="Close voice search" className="absolute top-2.5 right-2.5 grid size-9 place-items-center rounded-full text-muted hover:bg-cool hover:text-ink">
            {closeIcon}
          </button>
          <div className="relative grid size-[84px] place-items-center" aria-hidden="true">
            {listening ? <span className="absolute inset-0 rounded-full bg-primary/20 transition-transform duration-100" style={{ transform: `scale(${1 + level * 0.6})` }} /> : null}
            <span className={cx("relative grid size-[68px] place-items-center rounded-full text-white", phase === "error" ? "bg-ink" : "bg-primary")}>
              {working ? <Spinner /> : <MicIcon size={30} />}
            </span>
          </div>
          <p role="status" aria-live="polite" className="font-display text-lead font-bold">{title}</p>
          {listening ? (
            <p className="-mt-2 text-label text-muted">{refine ? "Say what to change, like “make it 25k”." : "Say what you're looking for, like “bedsitter in Ruaka under 15k”."}</p>
          ) : null}
          {words && (phase === "searching" || phase === "question") ? <p className="-mt-2 text-label text-muted">&ldquo;{words}&rdquo;</p> : null}
          {phase === "error" && message ? <InlineError className="-mt-1">{message}</InlineError> : null}
          {listening ? (
            <Button type="button" data-autofocus onClick={finish} className="w-full">Done</Button>
          ) : null}
          {phase === "error" ? (
            <Button type="button" data-autofocus onClick={() => void start()} className="w-full">Try again</Button>
          ) : null}
          {phase === "question" && question ? (
            <div className="flex w-full flex-wrap justify-center gap-2">
              {question.choices.map((c, i) => (
                <Button key={c.label} type="button" size="sm" variant="secondary" data-autofocus={i === 0 ? true : undefined} onClick={() => {
                  rememberInterpretation(currentQuery, c.query, { text: words, changes: [], defaults: [], notes: question.notes });
                  setPhase("closed");
                  router.push(`/search?${c.query}`);
                }}>
                  {c.label}
                </Button>
              ))}
              <Button type="button" size="sm" variant="quiet" onClick={() => {
                rememberInterpretation(currentQuery, question.partialQuery, { text: words, changes: [], defaults: [], notes: [...question.notes, "Searched without that part. Add it from the filters."] });
                setPhase("closed");
                router.push(`/search?${question.partialQuery}`);
              }}>
                Search without it
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}
      <button
        ref={fab}
        type="button"
        onClick={open ? (listening ? finish : close) : () => void start()}
        aria-label={open ? (listening ? "Stop listening and search" : "Close voice search") : refine ? "Change your search by voice" : "Search by voice"}
        aria-expanded={open}
        title={open ? undefined : "Search by voice"}
        className={cx(
          "no-print fixed right-4 bottom-[calc(74px+env(safe-area-inset-bottom))] z-40 grid size-[58px] place-items-center rounded-full text-white shadow-float transition hover:scale-105 focus-visible:ring-4 focus-visible:ring-deep/40 focus-visible:outline-none md:right-8 md:bottom-8 md:size-16",
          listening ? "bg-ink" : "bg-primary",
        )}
      >
        {listening ? <span className="block size-5 rounded-chip bg-white" aria-hidden="true" /> : open ? closeIcon : <MicIcon size={26} />}
      </button>
    </>
  );
}

function MicIcon({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
    </svg>
  );
}
function Spinner() {
  return <span className="block size-7 animate-spin rounded-full border-[3px] border-white/40 border-t-white" aria-hidden="true" />;
}
