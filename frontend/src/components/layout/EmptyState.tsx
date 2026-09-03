import { Inbox } from "lucide-react";
import type { ReactNode } from "react";

export function EmptyState({ title, hint, action }: { title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center rounded-panel bg-surface px-6 py-12 text-center">
      <span className="mb-3 flex size-10 items-center justify-center rounded-full bg-background text-text-tertiary shadow-raised">
        <Inbox className="size-5" strokeWidth={1.75} aria-hidden="true" />
      </span>
      <p className="text-base font-medium">{title}</p>
      {hint && <p className="mt-1 text-ui text-text-muted">{hint}</p>}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}
