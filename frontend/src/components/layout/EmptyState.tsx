import type { ReactNode } from "react";

export function EmptyState({ title, hint, action }: { title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="rounded-panel bg-surface px-6 py-12 text-center">
      <p className="text-base font-medium">{title}</p>
      {hint && <p className="mt-1 text-ui text-text-muted">{hint}</p>}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}
