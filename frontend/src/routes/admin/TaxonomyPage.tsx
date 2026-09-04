import {
  ChevronRight,
  ExternalLink,
  MoreHorizontal,
  Pencil,
  Plus,
  RotateCcw,
  Trash2,
} from "lucide-react";
import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ConfirmDestructive, type ImpactLine } from "@/components/admin/ConfirmDestructive";
import { EmptyState } from "@/components/layout/EmptyState";
import { ErrorState } from "@/components/layout/ErrorState";
import { PageHeader } from "@/components/layout/PageHeader";
import { Pagination } from "@/components/layout/Pagination";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SearchInput } from "@/components/ui/search-input";
import { useCapabilities } from "@/features/admin/capabilities";
import { TaxonomyDialog, type TaxonomyDraft, type Tier } from "@/features/taxonomy/TaxonomyDialog";
import {
  useAdminBranches,
  useAdminPrograms,
  useAdminSubjects,
  useCreateBranch,
  useCreateProgram,
  useCreateSubject,
  useDeactivateBranch,
  useDeactivateProgram,
  useDeactivateSubject,
  useUpdateBranch,
  useUpdateProgram,
  useUpdateSubject,
} from "@/features/taxonomy/admin-queries";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { ApiError } from "@/lib/api-client";
import type { BranchWithCounts, ProgramWithCounts, SubjectWithCounts } from "@/lib/api-types";
import { PICKER_LIMIT } from "@/lib/query-keys";
import { cn } from "@/lib/utils";

/** What a row needs to render, regardless of which tier it came from. */
interface RowModel {
  id: string;
  code: string;
  name: string;
  is_active: boolean;
  /** Rendered as "12 subjects · 40 notes"; empty for a leaf with no children. */
  metrics: { label: string; value: number; warn?: boolean }[];
  /** Everything the delete confirm needs to say what goes down with it. */
  impact: ImpactLine[];
  /** False for a leaf — degrades the confirm to a single click. */
  hasDependents: boolean;
}

function programRow(program: ProgramWithCounts): RowModel {
  return {
    id: program.id,
    code: program.code,
    name: program.name,
    is_active: program.is_active,
    metrics: [
      { label: "branches", value: program.branch_count },
      { label: "subjects", value: program.subject_count },
      { label: "notes", value: program.note_count },
      { label: "pending", value: program.pending_note_count, warn: program.pending_note_count > 0 },
    ],
    impact: [
      { label: "Branches hidden from browse", count: program.branch_count },
      { label: "Subjects hidden from browse", count: program.subject_count },
      { label: "Notes that become unreachable", count: program.note_count },
      { label: "Accounts attached to it", count: program.user_count },
    ],
    hasDependents: program.branch_count > 0 || program.note_count > 0,
  };
}

function branchRow(branch: BranchWithCounts): RowModel {
  return {
    id: branch.id,
    code: branch.code,
    name: branch.name,
    is_active: branch.is_active,
    metrics: [
      { label: "subjects", value: branch.subject_count },
      { label: "notes", value: branch.note_count },
      { label: "pending", value: branch.pending_note_count, warn: branch.pending_note_count > 0 },
      { label: "students", value: branch.student_count },
    ],
    impact: [
      { label: "Subjects hidden from browse", count: branch.subject_count },
      { label: "Notes that become unreachable", count: branch.note_count },
      { label: "Students in this branch", count: branch.student_count },
    ],
    hasDependents: branch.subject_count > 0 || branch.note_count > 0,
  };
}

function subjectRow(subject: SubjectWithCounts): RowModel {
  return {
    id: subject.id,
    code: subject.code,
    name: subject.name,
    is_active: subject.is_active,
    metrics: [
      { label: "notes", value: subject.note_count },
      { label: "pending", value: subject.pending_note_count, warn: subject.pending_note_count > 0 },
      { label: "files", value: subject.file_count },
    ],
    impact: [{ label: "Notes that become unreachable", count: subject.note_count }],
    hasDependents: subject.note_count > 0,
  };
}

/**
 * memo because the three columns re-render on every keystroke in the shared
 * search box, and a page can hold a hundred of these. The props are primitives
 * and stable callbacks, so the comparison is cheap and almost always skips.
 */
const TaxonomyRow = memo(function TaxonomyRow({
  row,
  selected,
  selectable,
  canEdit,
  canDeactivate,
  browseTo,
  onSelect,
  onEdit,
  onDeactivate,
  onRestore,
}: {
  row: RowModel;
  selected: boolean;
  selectable: boolean;
  canEdit: boolean;
  canDeactivate: boolean;
  browseTo?: string;
  onSelect: (id: string) => void;
  onEdit: (id: string) => void;
  onDeactivate: (id: string) => void;
  onRestore: (id: string) => void;
}) {
  return (
    <li
      className={cn(
        "group flex items-center gap-2 rounded-control px-2 py-1.5 transition-colors duration-150",
        selected ? "bg-surface-elevated" : "hover:bg-surface-elevated/60",
        !row.is_active && "opacity-60"
      )}
    >
      <button
        type="button"
        onClick={() => selectable && onSelect(row.id)}
        aria-current={selected ? "true" : undefined}
        disabled={!selectable}
        className="flex min-w-0 flex-1 flex-col gap-0.5 text-left disabled:cursor-default"
      >
        <span className="flex min-w-0 items-center gap-2">
          <span className="shrink-0 rounded-control bg-background px-1.5 py-0.5 font-mono text-caption text-text-muted">
            {row.code}
          </span>
          <span className="min-w-0 truncate text-ui text-text-primary">{row.name}</span>
          {!row.is_active && (
            <span className="shrink-0 rounded-control bg-status-rejected-bg px-1.5 py-0.5 text-caption font-medium text-status-rejected-fg">
              off
            </span>
          )}
        </span>
        <span className="flex flex-wrap items-center gap-x-3 font-mono text-caption tabular-nums text-text-tertiary">
          {row.metrics.map((metric) => (
            <span key={metric.label} className={cn(metric.warn && "text-status-pending-fg")}>
              {metric.value} {metric.label}
            </span>
          ))}
        </span>
      </button>

      {(canEdit || canDeactivate) && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${row.name}`}>
              <MoreHorizontal className="size-4" strokeWidth={2} aria-hidden="true" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {canEdit && (
              <DropdownMenuItem onSelect={() => onEdit(row.id)}>
                <Pencil className="size-3.5" strokeWidth={2} aria-hidden="true" />
                Edit
              </DropdownMenuItem>
            )}
            {browseTo && row.is_active && (
              <DropdownMenuItem asChild>
                <Link to={browseTo}>
                  <ExternalLink className="size-3.5" strokeWidth={2} aria-hidden="true" />
                  View in browse
                </Link>
              </DropdownMenuItem>
            )}
            {canDeactivate && <DropdownMenuSeparator />}
            {canDeactivate &&
              (row.is_active ? (
                <DropdownMenuItem variant="destructive" onSelect={() => onDeactivate(row.id)}>
                  <Trash2 className="size-3.5" strokeWidth={2} aria-hidden="true" />
                  Deactivate
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem onSelect={() => onRestore(row.id)}>
                  <RotateCcw className="size-3.5" strokeWidth={2} aria-hidden="true" />
                  Restore
                </DropdownMenuItem>
              ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </li>
  );
});

function Column({
  title,
  count,
  hint,
  onAdd,
  addLabel,
  children,
}: {
  title: string;
  count?: number;
  hint?: string;
  onAdd?: () => void;
  addLabel?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex min-h-[24rem] min-w-0 flex-col rounded-panel bg-surface">
      <div className="flex items-center gap-2 px-3 py-2.5">
        <h2 className="text-ui font-medium text-text-primary">{title}</h2>
        {count !== undefined && (
          <span className="rounded-control bg-background px-1.5 py-0.5 font-mono text-caption tabular-nums text-text-tertiary">
            {count}
          </span>
        )}
        {onAdd && (
          <Button variant="ghost" size="icon-sm" className="ml-auto" onClick={onAdd} aria-label={addLabel ?? "Add"}>
            <Plus className="size-4" strokeWidth={2} aria-hidden="true" />
          </Button>
        )}
      </div>
      {hint && <p className="px-3 pb-2 text-caption text-text-tertiary">{hint}</p>}
      <div className="min-h-0 flex-1 overflow-y-auto px-1.5 pb-2">{children}</div>
    </section>
  );
}

function ColumnSkeleton() {
  return (
    <div className="flex flex-col gap-1.5 p-1.5">
      {Array.from({ length: 5 }, (_, index) => (
        <div key={index} data-skeleton-block className="h-11 animate-pulse rounded-control bg-background" />
      ))}
    </div>
  );
}

type PendingDelete = { tier: Tier; row: RowModel } | null;
type PendingEdit = { tier: Tier; row: RowModel } | null;

export function TaxonomyPage() {
  const capabilities = useCapabilities();
  const [searchParams, setSearchParams] = useSearchParams();

  const programId = searchParams.get("program") ?? "";
  const branchId = searchParams.get("branch") ?? "";
  const semesterParam = searchParams.get("semester") ?? "";
  const showInactive = searchParams.get("inactive") === "1";
  const urlQuery = searchParams.get("q") ?? "";

  // The field is driven locally and the URL follows once typing settles, so a
  // burst of keystrokes is one request and one history entry — the same shape
  // SearchPage already uses.
  const [term, setTerm] = useState(urlQuery);
  const debouncedTerm = useDebouncedValue(term);

  const [programPage, setProgramPage] = useState(1);
  const [branchPage, setBranchPage] = useState(1);
  const [subjectPage, setSubjectPage] = useState(1);

  const setParam = useCallback(
    (updates: Record<string, string | null>) => {
      setSearchParams(
        (current) => {
          const next = new URLSearchParams(current);
          for (const [key, value] of Object.entries(updates)) {
            if (value === null || value === "") next.delete(key);
            else next.set(key, value);
          }
          return next;
        },
        { replace: true }
      );
      // Paging resets here, in the event that changed the filter, rather than in
      // an effect watching the URL: a narrowed result usually has fewer pages
      // than the current one, and staying on page 3 of a one-page result shows
      // an empty column.
      setProgramPage(1);
      setBranchPage(1);
      setSubjectPage(1);
    },
    [setSearchParams]
  );

  useEffect(() => {
    if (debouncedTerm !== urlQuery) setParam({ q: debouncedTerm || null });
  }, [debouncedTerm, urlQuery, setParam]);

  const q = urlQuery || undefined;
  const programs = useAdminPrograms({ q, include_inactive: showInactive, page: programPage });
  const branches = useAdminBranches(
    { program_id: programId, q, include_inactive: showInactive, page: branchPage },
    // A branch_admin has exactly one branch and the API pins them to it, so the
    // column is useful even before a program is picked. Everyone else needs the
    // parent selected first, or the list is the whole platform.
    programId !== "" || capabilities.role === "branch_admin" || q !== undefined
  );
  const subjects = useAdminSubjects(
    {
      branch_id: branchId,
      semester: semesterParam ? Number(semesterParam) : undefined,
      q,
      include_inactive: showInactive,
      page: subjectPage,
      limit: PICKER_LIMIT,
    },
    branchId !== "" || q !== undefined
  );

  const selectedProgram = useMemo(
    () => programs.data?.items.find((program) => program.id === programId),
    [programs.data, programId]
  );

  const [creating, setCreating] = useState<Tier | null>(null);
  const [editing, setEditing] = useState<PendingEdit>(null);
  const [deleting, setDeleting] = useState<PendingDelete>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionNotice, setActionNotice] = useState<string | null>(null);

  const createProgram = useCreateProgram();
  const createBranch = useCreateBranch();
  const createSubject = useCreateSubject();
  const updateProgram = useUpdateProgram();
  const updateBranch = useUpdateBranch();
  const updateSubject = useUpdateSubject();
  const deactivateProgram = useDeactivateProgram();
  const deactivateBranch = useDeactivateBranch();
  const deactivateSubject = useDeactivateSubject();

  const mutationFor = {
    program: { create: createProgram, update: updateProgram, deactivate: deactivateProgram },
    branch: { create: createBranch, update: updateBranch, deactivate: deactivateBranch },
    subject: { create: createSubject, update: updateSubject, deactivate: deactivateSubject },
  } as const;

  function handleCreate(tier: Tier, draft: TaxonomyDraft) {
    const done = { onSuccess: () => setCreating(null) };
    if (tier === "program") {
      createProgram.mutate(
        { code: draft.code, name: draft.name, duration_semesters: draft.duration_semesters },
        done
      );
    } else if (tier === "branch") {
      createBranch.mutate({ program_id: programId, code: draft.code, name: draft.name }, done);
    } else {
      createSubject.mutate(
        { branch_id: branchId, code: draft.code, name: draft.name, semester: draft.semester },
        done
      );
    }
  }

  function handleEdit(tier: Tier, id: string, draft: TaxonomyDraft) {
    const done = { onSuccess: () => setEditing(null) };
    if (tier === "program") {
      updateProgram.mutate(
        { id, input: { code: draft.code, name: draft.name, duration_semesters: draft.duration_semesters } },
        done
      );
    } else if (tier === "branch") {
      updateBranch.mutate({ id, input: { code: draft.code, name: draft.name } }, done);
    } else {
      updateSubject.mutate({ id, input: { code: draft.code, name: draft.name, semester: draft.semester } }, done);
    }
  }

  const handleRestore = useCallback(
    (tier: Tier, id: string) => {
      setActionError(null);
      setActionNotice(null);
      const onError = (error: unknown) =>
        setActionError(error instanceof ApiError ? error.message : "Could not restore that row.");
      // Deactivating cascades but restoring does not, deliberately: the tree
      // has no memory of which children the cascade turned off versus which
      // were already off, and quietly republishing a branch someone retired
      // months ago is worse than asking. Say so, or a restored program looks
      // empty and broken.
      const onSuccess = () =>
        setActionNotice(
          tier === "subject"
            ? null
            : `Restored. Its ${tier === "program" ? "branches and subjects" : "subjects"} stay deactivated — turn back on the ones you want from this list.`
        );
      if (tier === "program") updateProgram.mutate({ id, input: { is_active: true } }, { onError, onSuccess });
      else if (tier === "branch") updateBranch.mutate({ id, input: { is_active: true } }, { onError, onSuccess });
      else updateSubject.mutate({ id, input: { is_active: true } }, { onError, onSuccess });
    },
    [updateProgram, updateBranch, updateSubject]
  );

  function handleDeactivate() {
    if (!deleting) return;
    const { tier, row } = deleting;
    setActionError(null);
    mutationFor[tier].deactivate.mutate(row.id, {
      onSuccess: () => {
        setDeleting(null);
        // The selection would otherwise point at a row the child columns can no
        // longer resolve, leaving them stuck on a stale list.
        if (tier === "program" && row.id === programId) setParam({ program: null, branch: null, semester: null });
        if (tier === "branch" && row.id === branchId) setParam({ branch: null, semester: null });
      },
      onError: (error: unknown) =>
        setActionError(error instanceof ApiError ? error.message : "Could not deactivate that row."),
    });
  }

  const selectProgram = useCallback(
    (id: string) => setParam({ program: id === programId ? null : id, branch: null, semester: null }),
    [programId, setParam]
  );
  const selectBranch = useCallback(
    (id: string) => setParam({ branch: id === branchId ? null : id, semester: null }),
    [branchId, setParam]
  );
  const noopSelect = useCallback(() => {}, []);

  const editProgram = useCallback(
    (id: string) => {
      const found = programs.data?.items.find((item) => item.id === id);
      if (found) setEditing({ tier: "program", row: programRow(found) });
    },
    [programs.data]
  );
  const editBranch = useCallback(
    (id: string) => {
      const found = branches.data?.items.find((item) => item.id === id);
      if (found) setEditing({ tier: "branch", row: branchRow(found) });
    },
    [branches.data]
  );
  const editSubject = useCallback(
    (id: string) => {
      const found = subjects.data?.items.find((item) => item.id === id);
      if (found) setEditing({ tier: "subject", row: subjectRow(found) });
    },
    [subjects.data]
  );

  const deleteProgram = useCallback(
    (id: string) => {
      const found = programs.data?.items.find((item) => item.id === id);
      if (found) setDeleting({ tier: "program", row: programRow(found) });
    },
    [programs.data]
  );
  const deleteBranch = useCallback(
    (id: string) => {
      const found = branches.data?.items.find((item) => item.id === id);
      if (found) setDeleting({ tier: "branch", row: branchRow(found) });
    },
    [branches.data]
  );
  const deleteSubject = useCallback(
    (id: string) => {
      const found = subjects.data?.items.find((item) => item.id === id);
      if (found) setDeleting({ tier: "subject", row: subjectRow(found) });
    },
    [subjects.data]
  );

  const restoreProgram = useCallback((id: string) => handleRestore("program", id), [handleRestore]);
  const restoreBranch = useCallback((id: string) => handleRestore("branch", id), [handleRestore]);
  const restoreSubject = useCallback((id: string) => handleRestore("subject", id), [handleRestore]);

  // Subjects arrive ordered by semester, so grouping is a single pass and the
  // column can show "Semester 3" headers without a second request per semester.
  const subjectsBySemester = useMemo(() => {
    const groups = new Map<number, SubjectWithCounts[]>();
    for (const subject of subjects.data?.items ?? []) {
      const list = groups.get(subject.semester);
      if (list) list.push(subject);
      else groups.set(subject.semester, [subject]);
    }
    return [...groups.entries()].sort(([a], [b]) => a - b);
  }, [subjects.data]);

  const semesterCeiling = selectedProgram?.duration_semesters ?? 20;
  const activeMutation = editing ? mutationFor[editing.tier].update : creating ? mutationFor[creating].create : null;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Programs & subjects"
        description="The browse hierarchy: a program holds branches, a branch holds subjects, and a subject holds one semester's notes."
      />

      <div className="flex flex-wrap items-center gap-3">
        <SearchInput
          value={term}
          onChange={setTerm}
          placeholder="Search programs, branches and subjects…"
          className="basis-full sm:max-w-md sm:basis-auto"
        />
        <label className="flex items-center gap-2 text-ui text-text-muted">
          <Checkbox
            checked={showInactive}
            onCheckedChange={(checked) => setParam({ inactive: checked ? "1" : null })}
          />
          Show deactivated
        </label>
      </div>

      {actionError && (
        <div role="alert" className="rounded-card bg-status-rejected-bg px-3 py-2 text-ui text-status-rejected-fg">
          {actionError}
        </div>
      )}

      {actionNotice && (
        <div role="status" className="rounded-card bg-accent px-3 py-2 text-ui text-accent-foreground">
          {actionNotice}
        </div>
      )}

      {programs.error ? (
        <ErrorState error={programs.error} />
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <Column
            title="Programs"
            count={programs.data?.pagination.total}
            onAdd={capabilities.canManagePrograms ? () => setCreating("program") : undefined}
            addLabel="Add a program"
          >
            {programs.isPending ? (
              <ColumnSkeleton />
            ) : programs.data.items.length === 0 ? (
              <EmptyState title="No programs" hint={q ? "Nothing matched that search." : undefined} />
            ) : (
              <>
                <ul className="flex flex-col gap-0.5">
                  {programs.data.items.map((program) => (
                    <TaxonomyRow
                      key={program.id}
                      row={programRow(program)}
                      selected={program.id === programId}
                      selectable
                      canEdit={capabilities.canManagePrograms}
                      canDeactivate={capabilities.canManagePrograms}
                      browseTo={`/programs/${program.id}`}
                      onSelect={selectProgram}
                      onEdit={editProgram}
                      onDeactivate={deleteProgram}
                      onRestore={restoreProgram}
                    />
                  ))}
                </ul>
                <Pagination meta={programs.data.pagination} onPageChange={setProgramPage} />
              </>
            )}
          </Column>

          <Column
            title="Branches"
            count={branches.data?.pagination.total}
            hint={selectedProgram ? `in ${selectedProgram.name}` : undefined}
            onAdd={
              capabilities.canManageBranches && programId !== "" ? () => setCreating("branch") : undefined
            }
            addLabel="Add a branch"
          >
            {!programId && !q ? (
              <EmptyState title="Pick a program" hint="Its branches appear here." />
            ) : branches.isPending ? (
              <ColumnSkeleton />
            ) : branches.error ? (
              <ErrorState error={branches.error} />
            ) : branches.data.items.length === 0 ? (
              <EmptyState
                title="No branches"
                hint={
                  capabilities.canManageBranches && programId
                    ? "Add the first one with the + above."
                    : undefined
                }
              />
            ) : (
              <>
                <ul className="flex flex-col gap-0.5">
                  {branches.data.items.map((branch) => (
                    <TaxonomyRow
                      key={branch.id}
                      row={branchRow(branch)}
                      selected={branch.id === branchId}
                      selectable
                      canEdit={capabilities.canManageBranches || capabilities.role === "branch_admin"}
                      canDeactivate={capabilities.canDeactivateBranches}
                      browseTo={`/branches/${branch.id}`}
                      onSelect={selectBranch}
                      onEdit={editBranch}
                      onDeactivate={deleteBranch}
                      onRestore={restoreBranch}
                    />
                  ))}
                </ul>
                <Pagination meta={branches.data.pagination} onPageChange={setBranchPage} />
              </>
            )}
          </Column>

          <Column
            title="Subjects"
            count={subjects.data?.pagination.total}
            hint={branchId ? "grouped by semester" : undefined}
            onAdd={capabilities.canManageSubjects && branchId !== "" ? () => setCreating("subject") : undefined}
            addLabel="Add a subject"
          >
            {!branchId && !q ? (
              <EmptyState title="Pick a branch" hint="Its subjects appear here, by semester." />
            ) : subjects.isPending ? (
              <ColumnSkeleton />
            ) : subjects.error ? (
              <ErrorState error={subjects.error} />
            ) : subjectsBySemester.length === 0 ? (
              <EmptyState
                title="No subjects"
                hint={capabilities.canManageSubjects && branchId ? "Add the first one with the + above." : undefined}
              />
            ) : (
              subjectsBySemester.map(([semester, group]) => (
                <div key={semester} className="flex flex-col gap-0.5 pt-1">
                  <button
                    type="button"
                    onClick={() =>
                      setParam({ semester: semesterParam === String(semester) ? null : String(semester) })
                    }
                    className={cn(
                      "flex items-center gap-1 self-start rounded-control px-2 py-1 text-caption font-medium tracking-wide uppercase transition-colors duration-150",
                      semesterParam === String(semester)
                        ? "bg-accent text-accent-foreground"
                        : "text-text-tertiary hover:bg-surface-elevated"
                    )}
                  >
                    <ChevronRight className="size-3" strokeWidth={2} aria-hidden="true" />
                    Semester {semester}
                    <span className="font-mono normal-case">({group.length})</span>
                  </button>
                  <ul className="flex flex-col gap-0.5">
                    {group.map((subject) => (
                      <TaxonomyRow
                        key={subject.id}
                        row={subjectRow(subject)}
                        selected={false}
                        selectable={false}
                        canEdit={capabilities.canManageSubjects}
                        canDeactivate={capabilities.canManageSubjects}
                        browseTo={`/subjects/${subject.id}`}
                        onSelect={noopSelect}
                        onEdit={editSubject}
                        onDeactivate={deleteSubject}
                        onRestore={restoreSubject}
                      />
                    ))}
                  </ul>
                </div>
              ))
            )}
          </Column>
        </div>
      )}

      {creating && (
        <TaxonomyDialog
          tier={creating}
          mode="create"
          semesterCeiling={semesterCeiling}
          pending={mutationFor[creating].create.isPending}
          error={mutationFor[creating].create.error}
          onSubmit={(draft) => handleCreate(creating, draft)}
          onClose={() => setCreating(null)}
        />
      )}

      {editing && (
        <TaxonomyDialog
          key={editing.row.id}
          tier={editing.tier}
          mode="edit"
          semesterCeiling={semesterCeiling}
          initial={{
            code: editing.row.code,
            name: editing.row.name,
            duration_semesters: selectedProgram?.duration_semesters,
            semester: subjects.data?.items.find((item) => item.id === editing.row.id)?.semester,
          }}
          pending={activeMutation?.isPending ?? false}
          error={activeMutation?.error}
          onSubmit={(draft) => handleEdit(editing.tier, editing.row.id, draft)}
          onClose={() => setEditing(null)}
        />
      )}

      <ConfirmDestructive
        open={deleting !== null}
        onOpenChange={(open) => {
          if (!open) setDeleting(null);
        }}
        title={`Deactivate ${deleting?.row.code ?? ""}?`}
        description={
          <>
            It leaves browse immediately and everything under it goes with it. Nothing is deleted — the notes stay
            on the platform, and “Show deactivated” brings this row back. Restoring is one row at a time, though:
            what goes down together does not come back together.
          </>
        }
        confirmationCode={deleting?.row.code ?? ""}
        requireTypedConfirmation={deleting?.row.hasDependents ?? false}
        impact={deleting?.row.impact}
        pending={deleting ? mutationFor[deleting.tier].deactivate.isPending : false}
        error={actionError}
        onConfirm={handleDeactivate}
      />
    </div>
  );
}
