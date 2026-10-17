"use client";

import { useEffect, useId, useRef, type ComponentProps, type ReactNode } from "react";
import { cx } from "./primitives";
import { Icon } from "./icon";

// Labels above fields, plain-language errors next to the field, and an error summary that
// takes focus on a failed submit.

export type FieldErrors = Record<string, string | undefined>;

export function Field({
  label,
  hint,
  error,
  optional,
  children,
  className,
  htmlFor,
}: {
  label: ReactNode;
  hint?: ReactNode;
  error?: string;
  optional?: boolean;
  children: ReactNode;
  className?: string;
  htmlFor: string;
}) {
  return (
    <div className={cx("flex flex-col gap-1.5", className)}>
      <label htmlFor={htmlFor} className="text-[14px] font-semibold">
        {label}
        {optional ? <span className="font-normal text-muted"> (optional)</span> : null}
      </label>
      {children}
      {error ? (
        <p id={`${htmlFor}-error`} className="flex items-start gap-1.5 text-[13.5px] font-semibold text-error">
          <Icon name="alert" size={15} strokeWidth={2.2} className="mt-0.5 shrink-0" />
          {error}
        </p>
      ) : null}
      {hint ? (
        <p id={`${htmlFor}-hint`} className="text-[13px] text-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export function describedBy(id: string, opts: { error?: string; hint?: ReactNode }) {
  const ids = [opts.error ? `${id}-error` : null, opts.hint ? `${id}-hint` : null].filter(Boolean);
  return ids.length ? ids.join(" ") : undefined;
}

const inputBase =
  "w-full min-h-[50px] rounded-[12px] border bg-surface px-3.5 text-[16px] text-ink placeholder:text-[#8c959b] focus:outline-none focus:ring-2 focus:ring-deep/40";

export function TextInput({
  error,
  className,
  ...props
}: ComponentProps<"input"> & { error?: string }) {
  return (
    <input
      {...props}
      aria-invalid={error ? true : undefined}
      className={cx(inputBase, error ? "border-error border-[1.5px]" : "border-input", className)}
    />
  );
}

export function TextArea({ error, className, ...props }: ComponentProps<"textarea"> & { error?: string }) {
  return (
    <textarea
      {...props}
      aria-invalid={error ? true : undefined}
      className={cx(inputBase, "min-h-[96px] py-3", error ? "border-error border-[1.5px]" : "border-input", className)}
    />
  );
}

export function Select({ error, className, children, ...props }: ComponentProps<"select"> & { error?: string }) {
  return (
    <div className="relative">
      <select
        {...props}
        aria-invalid={error ? true : undefined}
        className={cx(inputBase, "appearance-none pr-10", error ? "border-error border-[1.5px]" : "border-input", className)}
      >
        {children}
      </select>
      <Icon name="chevronDown" size={18} className="pointer-events-none absolute top-1/2 right-3.5 -translate-y-1/2 text-muted" />
    </div>
  );
}

/** Currency label and period sit outside the typed value. */
export function MoneyInput({
  currency = "KSh",
  suffix,
  error,
  className,
  ...props
}: ComponentProps<"input"> & { currency?: "KES" | "KSh"; suffix?: string; error?: string }) {
  return (
    <div
      className={cx(
        "flex min-h-[54px] items-center rounded-[12px] border bg-surface focus-within:ring-2 focus-within:ring-deep/40",
        error ? "border-error border-[1.5px]" : "border-input",
        className,
      )}
    >
      <span aria-hidden="true" className="border-r border-divider px-3.5 text-[14px] text-muted">
        {currency}
      </span>
      <input
        {...props}
        inputMode="decimal"
        autoComplete="off"
        aria-invalid={error ? true : undefined}
        className="min-w-0 flex-1 bg-transparent px-3 font-display text-[19px] font-semibold text-ink focus:outline-none"
      />
      {suffix ? <span className="pr-3.5 text-[14px] text-muted">{suffix}</span> : null}
    </div>
  );
}

/** A radio group drawn as chips. Uses real radio inputs for keyboard and screen readers. */
export function ChoiceChips({
  name,
  legend,
  options,
  value,
  defaultValue,
  onChange,
  hint,
  error,
  optional,
}: {
  name: string;
  legend: ReactNode;
  options: Array<{ value: string; label: string }>;
  value?: string;
  defaultValue?: string;
  onChange?: (v: string) => void;
  hint?: ReactNode;
  error?: string;
  optional?: boolean;
}) {
  const id = useId();
  return (
    <fieldset className="flex flex-col gap-2" aria-describedby={error ? `${id}-err` : undefined}>
      <legend className="mb-1.5 text-[14px] font-semibold">
        {legend}
        {optional ? <span className="font-normal text-muted"> (optional)</span> : null}
      </legend>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => (
          <label key={o.value} className="cursor-pointer">
            <input
              type="radio"
              name={name}
              value={o.value}
              className="peer sr-only"
              checked={value === undefined ? undefined : value === o.value}
              defaultChecked={defaultValue === undefined ? undefined : defaultValue === o.value}
              onChange={() => onChange?.(o.value)}
            />
            <span className="inline-flex min-h-11 items-center rounded-full border-[1.5px] border-line bg-surface px-4 text-[14.5px] font-semibold text-ink peer-checked:border-ink peer-checked:bg-ink peer-checked:text-white peer-focus-visible:outline-3 peer-focus-visible:outline-deep peer-focus-visible:outline-offset-2">
              {o.label}
            </span>
          </label>
        ))}
      </div>
      {error ? (
        <p id={`${id}-err`} className="text-[13.5px] font-semibold text-error">
          {error}
        </p>
      ) : null}
      {hint ? <p className="text-[13px] text-muted">{hint}</p> : null}
    </fieldset>
  );
}

export function Checkbox({
  label,
  description,
  className,
  ...props
}: ComponentProps<"input"> & { label: ReactNode; description?: ReactNode }) {
  const id = useId();
  return (
    <label htmlFor={props.id ?? id} className={cx("flex cursor-pointer items-start gap-3", className)}>
      <input
        id={props.id ?? id}
        type="checkbox"
        {...props}
        className="mt-0.5 size-[22px] shrink-0 cursor-pointer rounded-[6px] accent-primary"
      />
      <span className="text-[14.5px] leading-snug">
        <span className="font-semibold">{label}</span>
        {description ? <span className="mt-0.5 block text-[13px] font-normal text-muted">{description}</span> : null}
      </span>
    </label>
  );
}

export function ErrorSummary({ errors, message }: { errors: FieldErrors; message?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const entries = Object.entries(errors).filter(([, v]) => v) as Array<[string, string]>;
  const show = entries.length > 0 || !!message;
  useEffect(() => {
    if (show) ref.current?.focus();
  }, [show, message, entries.length]);
  if (!show) return null;
  return (
    <div
      ref={ref}
      tabIndex={-1}
      role="alert"
      className="rounded-[14px] border-[1.5px] border-error bg-error-tint p-4 text-[14px] focus:outline-none"
    >
      <p className="font-semibold text-error">{message ?? "Check the highlighted fields."}</p>
      {entries.length > 0 ? (
        <ul className="mt-2 list-disc pl-5">
          {entries.map(([field, msg]) => (
            <li key={field}>
              <a href={`#${field}`} className="text-ink underline">
                {msg}
              </a>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
