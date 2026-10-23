import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { Icon, type IconName } from "./icon";
import type { Tone } from "@/lib/rent/status";

export function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

// ---------------------------------------------------------------------------
// Buttons: one primary style, one secondary, one quiet. Red is for the one action that
// matters on a screen.
// ---------------------------------------------------------------------------

type ButtonVariant = "primary" | "secondary" | "quiet" | "dark" | "danger";
type ButtonSize = "md" | "lg" | "sm";

const buttonBase =
  "inline-flex items-center justify-center gap-2 font-semibold transition-colors disabled:cursor-not-allowed select-none text-center";
const buttonVariants: Record<ButtonVariant, string> = {
  primary: "bg-primary text-white hover:bg-primary-hover disabled:bg-[#e8a3b1]",
  secondary: "bg-surface text-ink border-[1.5px] border-ink hover:bg-cool disabled:border-line disabled:text-muted",
  quiet: "bg-transparent text-ink hover:bg-cool disabled:text-muted",
  dark: "bg-ink text-white hover:bg-black disabled:bg-muted",
  danger: "bg-surface text-error border-[1.5px] border-error hover:bg-error-tint disabled:opacity-60",
};
const buttonSizes: Record<ButtonSize, string> = {
  sm: "min-h-10 px-3.5 text-[0.875rem] rounded-[10px]",
  md: "min-h-11 px-4 text-[0.9375rem] rounded-[12px]",
  lg: "min-h-[54px] px-5 text-[1rem] rounded-[14px]",
};

export function buttonClass(variant: ButtonVariant = "primary", size: ButtonSize = "md", extra?: string) {
  return cx(buttonBase, buttonVariants[variant], buttonSizes[size], extra);
}

export function Button({
  variant = "primary",
  size = "md",
  icon,
  pending,
  pendingLabel,
  className,
  children,
  ...props
}: ComponentProps<"button"> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: IconName;
  pending?: boolean;
  pendingLabel?: string;
}) {
  return (
    <button
      {...props}
      disabled={props.disabled || pending}
      aria-busy={pending || undefined}
      className={buttonClass(variant, size, className)}
    >
      {pending ? <Spinner /> : icon ? <Icon name={icon} size={18} /> : null}
      <span>{pending && pendingLabel ? pendingLabel : children}</span>
    </button>
  );
}

export function ButtonLink({
  variant = "primary",
  size = "md",
  icon,
  className,
  children,
  ...props
}: ComponentProps<typeof Link> & { variant?: ButtonVariant; size?: ButtonSize; icon?: IconName }) {
  return (
    <Link {...props} className={buttonClass(variant, size, className)}>
      {icon ? <Icon name={icon} size={18} /> : null}
      <span>{children}</span>
    </Link>
  );
}

export function Spinner({ className }: { className?: string }) {
  return (
    <svg className={cx("animate-spin", className)} width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Status: always a word, usually an icon, never colour alone.
// ---------------------------------------------------------------------------

const toneClasses: Record<Tone, string> = {
  success: "bg-success-tint text-success",
  waiting: "bg-waiting-tint text-waiting-strong",
  error: "bg-error-tint text-error",
  neutral: "bg-surface text-ink border border-line",
  info: "bg-cool text-deep",
};
const toneIcon: Record<Tone, IconName | null> = {
  success: "check",
  waiting: "clock",
  error: "alert",
  neutral: null,
  info: "info",
};

export function StatusBadge({ tone, children, className, icon }: { tone: Tone; children: ReactNode; className?: string; icon?: IconName | null }) {
  const i = icon === undefined ? toneIcon[tone] : icon;
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[0.78125rem] font-semibold leading-none whitespace-nowrap",
        toneClasses[tone],
        className,
      )}
    >
      {i ? <Icon name={i} size={13} strokeWidth={2.4} /> : null}
      {children}
    </span>
  );
}

export function Dot({ tone }: { tone: "success" | "waiting" | "error" }) {
  const c = tone === "success" ? "bg-success" : tone === "waiting" ? "bg-waiting-dot" : "bg-error";
  return <span aria-hidden="true" className={cx("inline-block size-2 rounded-full", c)} />;
}

// ---------------------------------------------------------------------------
// Layout helpers
// ---------------------------------------------------------------------------

export function Card({ className, children, ...props }: ComponentProps<"div">) {
  return (
    <div {...props} className={cx("rounded-[16px] border border-line bg-surface", className)}>
      {children}
    </div>
  );
}

export function Eyebrow({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p className={cx("font-mono text-[0.75rem] uppercase tracking-[0.6px] text-muted", className)}>{children}</p>
  );
}

export function PageTitle({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <h1 className={cx("font-display text-[1.75rem] leading-[1.05] font-bold tracking-[-0.6px] md:text-[2.5rem] md:tracking-[-1.2px]", className)}>
      {children}
    </h1>
  );
}

export function SectionTitle({ children, className, id }: { children: ReactNode; className?: string; id?: string }) {
  return (
    <h2 id={id} className={cx("font-display text-[1.125rem] font-bold md:text-[1.25rem]", className)}>
      {children}
    </h2>
  );
}

export function Notice({
  tone = "info",
  title,
  children,
  action,
  className,
  role,
}: {
  tone?: Tone;
  title?: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
  className?: string;
  role?: "status" | "alert";
}) {
  const bg: Record<Tone, string> = {
    info: "bg-cool border-[#d5e3e8]",
    success: "bg-success-tint border-[#b9e2db]",
    waiting: "bg-waiting-tint border-[#f0d9ad]",
    error: "bg-error-tint border-[#f3c1b8]",
    neutral: "bg-surface border-line",
  };
  const iconColor: Record<Tone, string> = {
    info: "text-deep",
    success: "text-success",
    waiting: "text-waiting",
    error: "text-error",
    neutral: "text-muted",
  };
  const i = toneIcon[tone] ?? "info";
  return (
    <div role={role} className={cx("flex gap-3 rounded-[14px] border p-3.5", bg[tone], className)}>
      <span className={cx("mt-0.5 shrink-0", iconColor[tone])}>
        <Icon name={i} size={18} strokeWidth={2.2} />
      </span>
      <div className="min-w-0 flex-1 text-[0.875rem] leading-snug">
        {title ? <p className="font-semibold">{title}</p> : null}
        {children ? <div className={title ? "mt-0.5" : undefined}>{children}</div> : null}
        {action ? <div className="mt-2">{action}</div> : null}
      </div>
    </div>
  );
}

export function EmptyState({
  title,
  children,
  action,
  icon = "inbox",
}: {
  title: string;
  children?: ReactNode;
  action?: ReactNode;
  icon?: IconName;
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-[18px] border border-dashed border-line bg-surface px-6 py-10 text-center">
      <span className="grid size-12 place-items-center rounded-full bg-cool text-deep">
        <Icon name={icon} size={22} />
      </span>
      <p className="font-display text-[1.125rem] font-bold">{title}</p>
      {children ? <div className="max-w-md text-[0.875rem] text-muted">{children}</div> : null}
      {action ? <div className="mt-1">{action}</div> : null}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden="true" className={cx("skeleton", className)} />;
}

export function LoadingBlock({ label = "Loading…", rows = 3 }: { label?: string; rows?: number }) {
  return (
    <div role="status" aria-live="polite" className="flex flex-col gap-3">
      <span className="sr-only">{label}</span>
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-[76px] w-full" />
      ))}
    </div>
  );
}

export function KeyValue({ label, value, className }: { label: ReactNode; value: ReactNode; className?: string }) {
  return (
    <div className={cx("flex items-baseline justify-between gap-4 py-2", className)}>
      <dt className="text-[0.875rem] text-muted">{label}</dt>
      <dd className="text-right text-[0.875rem] font-semibold">{value}</dd>
    </div>
  );
}

/** Soft tints from the palette; each name always gets the same one. */
const AVATAR_TONES = ["bg-cool text-deep", "bg-pink text-primary-hover", "bg-success-tint text-success", "bg-waiting-tint text-waiting-strong"];

/** Initials in a circle (there are no profile photos). `size` in px. */
export function Avatar({ name, size = 40, className }: { name: string; size?: number; className?: string }) {
  const initials = name
    .split(/[\s@._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
  let hash = 0;
  for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return (
    <span
      aria-hidden="true"
      style={{ width: size, height: size, fontSize: Math.round(size * 0.36) }}
      className={cx("grid shrink-0 place-items-center rounded-full font-semibold tracking-[0.3px]", AVATAR_TONES[hash % AVATAR_TONES.length], className)}
    >
      {initials || "?"}
    </span>
  );
}
