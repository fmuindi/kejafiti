import type { ReactNode } from "react";
import { Icon, type IconName } from "@/components/ui/icon";

/** The top of every main page: an icon, the title, one short line, and the main action. */
export function PageHeader({ icon, title, meta, action }: { icon: IconName; title: string; meta?: ReactNode; action?: ReactNode }) {
  return (
    <header className="flex items-center gap-3.5">
      <span aria-hidden="true" className="grid size-12 shrink-0 place-items-center rounded-card bg-pink text-primary md:size-14">
        <Icon name={icon} size={24} />
      </span>
      <div className="min-w-0 flex-1">
        <h1 className="heading-page truncate">{title}</h1>
        {meta ? <p className="mt-0.5 truncate text-label text-muted">{meta}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </header>
  );
}
