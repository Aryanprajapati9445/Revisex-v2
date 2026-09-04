import { CheckCircle2, XCircle } from "lucide-react";
import { useState } from "react";
import { EmptyState } from "@/components/layout/EmptyState";
import { ErrorState } from "@/components/layout/ErrorState";
import { Pagination } from "@/components/layout/Pagination";
import { Reveal } from "@/components/motion/Reveal";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { RequirePermission } from "@/features/admin/RequirePermission";
import { useAuditLog } from "@/features/admin/queries";

function OutcomePill({ outcome }: { outcome: "success" | "failure" }) {
  const isSuccess = outcome === "success";
  const Icon = isSuccess ? CheckCircle2 : XCircle;
  return (
    <Badge variant={isSuccess ? "approved" : "destructive"}>
      <Icon className="size-3.5" strokeWidth={2} aria-hidden="true" />
      {outcome}
    </Badge>
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

  return (
    <Reveal className="flex flex-col gap-6">
      <div>
        <h1 className="text-title font-bold">Audit Log</h1>
        <p className="mt-1 text-lead text-text-muted">Every write made through the admin area.</p>
      </div>

      <div className="flex flex-wrap items-end gap-3 rounded-card bg-surface p-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="audit-actor">Actor user id</Label>
          <Input
            id="audit-actor"
            value={actorUserId}
            onChange={(e) => {
              setActorUserId(e.target.value);
              setPage(1);
            }}
            placeholder="uuid"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="audit-action">Action</Label>
          <Input
            id="audit-action"
            value={action}
            onChange={(e) => {
              setAction(e.target.value);
              setPage(1);
            }}
            placeholder="roles.create"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="audit-from">From</Label>
          <Input
            id="audit-from"
            type="date"
            value={from}
            onChange={(e) => {
              setFrom(e.target.value);
              setPage(1);
            }}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="audit-to">To</Label>
          <Input
            id="audit-to"
            type="date"
            value={to}
            onChange={(e) => {
              setTo(e.target.value);
              setPage(1);
            }}
          />
        </div>
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
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>When</TableHead>
                  <TableHead>Actor</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Resource</TableHead>
                  <TableHead>Outcome</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {log.data.items.map((entry) => (
                  <TableRow key={entry.id}>
                    <TableCell className="text-caption text-text-tertiary">{new Date(entry.created_at).toLocaleString()}</TableCell>
                    <TableCell className="font-mono text-caption">{entry.actor_user_id ?? "—"}</TableCell>
                    <TableCell>{entry.action}</TableCell>
                    <TableCell className="text-text-muted">
                      {entry.resource}
                      {entry.resource_id ? ` #${entry.resource_id.slice(0, 8)}` : ""}
                    </TableCell>
                    <TableCell>
                      <OutcomePill outcome={entry.outcome} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <Pagination meta={log.data.pagination} onPageChange={setPage} />
        </>
      )}
    </Reveal>
  );
}

export function AuditLogPage() {
  return (
    <RequirePermission permission="audit.read">
      <AuditLogTable />
    </RequirePermission>
  );
}
