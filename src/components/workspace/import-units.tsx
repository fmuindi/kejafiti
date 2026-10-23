"use client";

import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import { importUnits, type ImportResult } from "@/app/w/[orgId]/properties/actions";
import { Field, TextArea } from "@/components/ui/form";
import { Icon } from "@/components/ui/icon";
import { Button, Notice } from "@/components/ui/primitives";
import { TEMPLATE_CSV, parseImport, type ImportRow, type RowProblem } from "@/lib/import-units";

type Checked = { rows: ImportRow[]; problems: RowProblem[]; result: ImportResult | null };

// Units and tenancies from a spreadsheet: choose a CSV file or paste cells from Excel/Sheets.
// Every row is checked against the real rules before anything is saved, and the import is all
// or nothing, so a half-imported property never happens.
export function ImportUnits({ orgId, propertyId }: { orgId: string; propertyId: string }) {
  const router = useRouter();
  const pasteId = useId();
  const [text, setText] = useState("");
  const [checked, setChecked] = useState<Checked | null>(null);
  const [message, setMessage] = useState<{ tone: "error" | "success"; text: string } | null>(null);
  const [pending, start] = useTransition();

  function check(source: string) {
    setMessage(null);
    const p = parseImport(source);
    if (p.missingLabel) {
      setChecked(null);
      setMessage({ tone: "error", text: 'The first row must be the column names, including one for the unit (for example "Unit" or "House no").' });
      return;
    }
    if (p.rows.length === 0 && p.problems.length === 0) {
      setChecked(null);
      setMessage({ tone: "error", text: "There are no rows under the column names." });
      return;
    }
    setChecked({ rows: p.rows, problems: p.problems, result: null });
    if (p.rows.length === 0) return;
    start(async () => {
      const r = await importUnits(orgId, propertyId, p.rows, false);
      if (!r.ok) return setMessage({ tone: "error", text: r.message });
      setChecked({ rows: p.rows, problems: p.problems, result: r.data });
    });
  }

  const allProblems = checked ? [...checked.problems, ...(checked.result?.errors ?? [])].sort((a, b) => a.row - b.row) : [];
  const ready = checked && checked.result && allProblems.length === 0;

  return (
    <details className="rounded-[18px] border border-line bg-surface p-4">
      <summary className="cursor-pointer font-semibold">
        <Icon name="file" size={16} className="mr-1 inline" /> Import units and tenants from a spreadsheet
      </summary>
      <div className="mt-4 flex flex-col gap-4">
        <p className="text-[0.875rem] text-muted">
          One row per unit. Add the tenant&apos;s name, start date and rent to set up their tenancy too; leave them empty for a vacant unit.
          Units already here are matched by their reference.{" "}
          <a
            className="font-semibold text-primary underline"
            download="nyumbani-units-template.csv"
            href={`data:text/csv;charset=utf-8,${encodeURIComponent(TEMPLATE_CSV)}`}
          >
            Download the template
          </a>
        </p>
        <label className="flex flex-col gap-1.5 text-[0.875rem] font-semibold">
          Choose a CSV file
          <input
            type="file"
            accept=".csv,.tsv,.txt,text/csv,text/tab-separated-values"
            className="text-[0.875rem] font-normal file:mr-3 file:min-h-10 file:rounded-[10px] file:border file:border-line file:bg-cool file:px-3 file:font-semibold"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              const t = await f.text();
              setText(t);
              check(t);
            }}
          />
        </label>
        <Field label="Or paste the cells here" htmlFor={pasteId} hint="Copy the rows in Excel or Google Sheets, including the column names, and paste.">
          <TextArea id={pasteId} rows={5} value={text} onChange={(e) => { setText(e.target.value); setChecked(null); }} className="font-mono text-[0.8125rem]" aria-describedby={`${pasteId}-hint`} />
        </Field>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" pending={pending && !ready} disabled={!text.trim()} onClick={() => check(text)}>Check rows</Button>
          {ready ? (
            <Button
              pending={pending}
              onClick={() =>
                start(async () => {
                  const r = await importUnits(orgId, propertyId, checked.rows, true);
                  if (!r.ok) return setMessage({ tone: "error", text: r.message });
                  if (!r.data.committed) {
                    setChecked({ ...checked, result: r.data });
                    return;
                  }
                  setMessage({ tone: "success", text: `Imported: ${r.data.units_created} new unit${r.data.units_created === 1 ? "" : "s"} and ${r.data.tenancies_created} tenanc${r.data.tenancies_created === 1 ? "y" : "ies"}.` });
                  setChecked(null);
                  setText("");
                  router.refresh();
                })
              }
            >
              Import {checked.rows.length} row{checked.rows.length === 1 ? "" : "s"}
            </Button>
          ) : null}
        </div>
        {message ? <Notice tone={message.tone} role={message.tone === "error" ? "alert" : "status"}>{message.text}</Notice> : null}
        {checked?.result && allProblems.length === 0 ? (
          <Notice tone="success" role="status" title="Ready to import">
            {checked.result.units_created} new unit{checked.result.units_created === 1 ? "" : "s"} and {checked.result.tenancies_created} tenanc
            {checked.result.tenancies_created === 1 ? "y" : "ies"}. Nothing is saved until you choose Import.
          </Notice>
        ) : null}
        {allProblems.length ? (
          <Notice tone="error" role="alert" title={`${allProblems.length} row${allProblems.length === 1 ? " needs" : "s need"} fixing before anything is imported`}>
            <ul className="mt-1 flex flex-col gap-1">
              {allProblems.slice(0, 30).map((p, i) => (
                <li key={i}><strong>Row {p.row}:</strong> {p.message}</li>
              ))}
              {allProblems.length > 30 ? <li>…and {allProblems.length - 30} more.</li> : null}
            </ul>
          </Notice>
        ) : null}
      </div>
    </details>
  );
}
