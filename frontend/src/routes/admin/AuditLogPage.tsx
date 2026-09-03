import { CheckCircle2, XCircle } from "lucide-react";
import { useState } from "react";
import { EmptyState } from "@/components/layout/EmptyState";
import { ErrorState } from "@/components/layout/ErrorState";
import { Pagination } from "@/components/layout/Pagination";
import { RequirePermission } from "@/features/admin/RequirePermission";
import { useAuditLog } from "@/features/admin/queries";

function OutcomePill({ outcome }: { outcome: "success" | "failure" }) {
  const isSuccess = outcome === "success";
  const Icon = isSuccess ? CheckCircle2 : XCircle;
  return (
    <span
      className={
        "flex w-fit items-center gap-1 rounded-full px-2.5 py-1 text-caption font-medium " +
        (isSuccess ? "bg-status-approved-bg text-status-approved-fg" : "bg-status-rejected-bg text-status-rejected-fg")
      }
    >
      <Icon className="size-3.5" strokeWidth={2} aria-hidden="true" />
      {outcome}
    </span>
  );
}

function AuditLogTable() {
  const [page, setPage] = useState(1);
  const [actorUserId, setActorUserId] = useState("");
  const [action, setAction] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const filters = {
    page,
    actor_user_id: actorUserId || undefined,
    action: action || undefined,
    from: from ? new Date(from).toISOString() : undefined,
    to: to ? new Date(to).toISOString() : undefined,
  };
  const log = useAuditLog(filters);

  const inputClass = "rounded-control bg-surface px-2.5 py-1.5 text-ui outline-none";

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-title font-bold">Audit Log</h1>
        <p className="mt-1 text-lead text-text-muted">Every write made through the admin area.</p>
      </div>

      <div className="flex flex-wrap items-end gap-3 rounded-card bg-surface p-4">
        <label className="flex flex-col gap-1.5">
          <span className="text-caption text-text-muted">Actor user id</span>
          <input
            value={actorUserId}
            onChange={(e) => {
              setActorUserId(e.target.value);
              setPage(1);
            }}
            placeholder="uuid"
            className={inputClass}
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-caption text-text-muted">Action</span>
          <input
            value={action}
            onChange={(e) => {
              setAction(e.target.value);
              setPage(1);
            }}
            placeholder="roles.create"
            className={inputClass}
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-caption text-text-muted">From</span>
          <input
            type="date"
            value={from}
            onChange={(e) => {
              setFrom(e.target.value);
              setPage(1);
            }}
            className={inputClass}
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-caption text-text-muted">To</span>
          <input
            type="date"
            value={to}
            onChange={(e) => {
              setTo(e.target.value);
              setPage(1);
            }}
            className={inputClass}
          />
        </label>
      </div>

      {log.error ? (
        <ErrorState error={log.error} />
      ) : log.isPending ? (
        <div className="text-text-muted">Loading…</div>
      ) : log.data.items.length === 0 ? (
        <EmptyState title="No matching entries" />
      ) : (
        <>
          <div className="overflow-x-auto rounded-card bg-background shadow-raised">
            <table className="w-full text-left text-ui">
              <thead>
                <tr className="text-caption text-text-muted">
                  <th className="px-4 py-2.5 font-medium">When</th>
                  <th className="px-4 py-2.5 font-medium">Actor</th>
                  <th className="px-4 py-2.5 font-medium">Action</th>
                  <th className="px-4 py-2.5 font-medium">Resource</th>
                  <th className="px-4 py-2.5 font-medium">Outcome</th>
                </tr>
              </thead>
              <tbody>
                {log.data.items.map((entry) => (
                  <tr key={entry.id} className="border-t border-surface">
                    <td className="px-4 py-2.5 text-caption text-text-tertiary">{new Date(entry.created_at).toLocaleString()}</td>
                    <td className="px-4 py-2.5 font-mono text-caption">{entry.actor_user_id ?? "—"}</td>
                    <td className="px-4 py-2.5">{entry.action}</td>
                    <td className="px-4 py-2.5 text-text-muted">
                      {entry.resource}
                      {entry.resource_id ? ` #${entry.resource_id.slice(0, 8)}` : ""}
                    </td>
                    <td className="px-4 py-2.5">
                      <OutcomePill outcome={entry.outcome} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination meta={log.data.pagination} onPageChange={setPage} />
        </>
      )}
    </div>
  );
}

export function AuditLogPage() {
  return (
    <RequirePermission permission="audit.read">
      <AuditLogTable />
    </RequirePermission>
  );
}
