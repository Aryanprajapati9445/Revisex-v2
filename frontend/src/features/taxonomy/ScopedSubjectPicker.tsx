import { Lock } from "lucide-react";
import { useEffect } from "react";
import { useAuth } from "@/features/auth/useAuth";
import { useBranch, useBranches, usePrograms, useSubjects } from "@/features/taxonomy/queries";
import { PICKER_LIMIT } from "@/lib/query-keys";

export interface SubjectSelection {
  programId: string;
  branchId: string;
  semester: string;
  subjectId: string;
}

export const EMPTY_SELECTION: SubjectSelection = {
  programId: "",
  branchId: "",
  semester: "",
  subjectId: "",
};

const selectClass =
  "rounded-control bg-surface px-2.5 py-1.5 text-ui text-text-primary outline-none disabled:opacity-50";

/**
 * Walks program -> branch -> semester -> subject, showing only the tiers the
 * signed-in account can actually choose between.
 *
 * A superuser picks all four. A program_admin's program is fixed and rendered
 * as a locked chip rather than a one-option select, so the boundary is visible
 * instead of merely enforced. A branch_admin's and a student's branch is fixed
 * the same way — they choose a subject and nothing above it.
 *
 * This is presentation. POST /api/notes re-checks the subject against the
 * uploader's scope, so a hand-edited request gains nothing.
 */
export function ScopedSubjectPicker({
  value,
  onChange,
  idPrefix = "picker",
}: {
  value: SubjectSelection;
  onChange: (value: SubjectSelection) => void;
  idPrefix?: string;
}) {
  const { user } = useAuth();
  const role = user?.role ?? "student";

  const programIsFixed = role === "program_admin";
  const branchIsFixed = role === "branch_admin" || role === "student";

  const fixedProgramId = programIsFixed ? (user?.program_id ?? "") : "";
  const fixedBranchId = branchIsFixed ? (user?.branch_id ?? "") : "";

  const effectiveProgramId = programIsFixed ? fixedProgramId : value.programId;
  const effectiveBranchId = branchIsFixed ? fixedBranchId : value.branchId;

  const programs = usePrograms(1, PICKER_LIMIT);
  const branches = useBranches(effectiveProgramId, 1, PICKER_LIMIT);
  const fixedBranch = useBranch(branchIsFixed ? fixedBranchId : "");
  const subjects = useSubjects(
    effectiveBranchId,
    value.semester ? Number(value.semester) : undefined,
    1,
    PICKER_LIMIT
  );

  // Seed the fixed ids into the caller's state once they are known, so the
  // submit handler reads one selection object rather than re-deriving scope.
  useEffect(() => {
    if (programIsFixed && fixedProgramId && value.programId !== fixedProgramId) {
      onChange({ ...value, programId: fixedProgramId });
    }
    if (branchIsFixed && fixedBranchId && value.branchId !== fixedBranchId) {
      onChange({ ...value, branchId: fixedBranchId });
    }
  }, [programIsFixed, branchIsFixed, fixedProgramId, fixedBranchId, value, onChange]);

  const selectedProgram = programs.data?.items.find((program) => program.id === effectiveProgramId);
  const semesterCount = selectedProgram?.duration_semesters ?? 8;

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      {programIsFixed ? (
        <LockedField label="Program" value={selectedProgram?.name ?? "Your program"} />
      ) : branchIsFixed ? null : (
        <label className="flex flex-col gap-1.5">
          <span className="text-caption text-text-muted">Program</span>
          <select
            id={`${idPrefix}-program`}
            className={selectClass}
            value={value.programId}
            onChange={(event) =>
              onChange({ ...EMPTY_SELECTION, programId: event.target.value })
            }
          >
            <option value="">Select a program</option>
            {programs.data?.items.map((program) => (
              <option key={program.id} value={program.id}>
                {program.code} — {program.name}
              </option>
            ))}
          </select>
        </label>
      )}

      {branchIsFixed ? (
        <LockedField label="Branch" value={fixedBranch.data?.name ?? "Your branch"} />
      ) : (
        <label className="flex flex-col gap-1.5">
          <span className="text-caption text-text-muted">Branch</span>
          <select
            id={`${idPrefix}-branch`}
            className={selectClass}
            disabled={effectiveProgramId === ""}
            value={value.branchId}
            onChange={(event) =>
              onChange({ ...value, branchId: event.target.value, semester: "", subjectId: "" })
            }
          >
            <option value="">{effectiveProgramId ? "Select a branch" : "Pick a program first"}</option>
            {branches.data?.items.map((branch) => (
              <option key={branch.id} value={branch.id}>
                {branch.code} — {branch.name}
              </option>
            ))}
          </select>
        </label>
      )}

      <label className="flex flex-col gap-1.5">
        <span className="text-caption text-text-muted">Semester</span>
        <select
          id={`${idPrefix}-semester`}
          className={selectClass}
          disabled={effectiveBranchId === ""}
          value={value.semester}
          onChange={(event) => onChange({ ...value, semester: event.target.value, subjectId: "" })}
        >
          <option value="">All semesters</option>
          {Array.from({ length: semesterCount }, (_, index) => index + 1).map((semester) => (
            <option key={semester} value={String(semester)}>
              Semester {semester}
            </option>
          ))}
        </select>
      </label>

      <div className="flex flex-col gap-1.5">
        <label className="flex flex-col gap-1.5">
          <span className="text-caption text-text-muted">Subject</span>
          <select
            id={`${idPrefix}-subject`}
            className={selectClass}
            disabled={effectiveBranchId === ""}
            value={value.subjectId}
            onChange={(event) => onChange({ ...value, subjectId: event.target.value })}
          >
            <option value="">{effectiveBranchId ? "Select a subject" : "Pick a branch first"}</option>
            {subjects.data?.items.map((subject) => (
              <option key={subject.id} value={subject.id}>
                {subject.code} — {subject.name} (sem {subject.semester})
              </option>
            ))}
          </select>
        </label>
        {/* Outside the label on purpose: a wrapping <label> contributes its
            whole text to the control's accessible name, so this hint would
            otherwise become part of what a screen reader calls the field. */}
        {effectiveBranchId !== "" && subjects.data?.items.length === 0 && (
          <span className="text-caption text-status-pending-fg">
            This branch has no subjects yet{value.semester ? " in that semester" : ""}.
          </span>
        )}
      </div>
    </div>
  );
}

function LockedField({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-caption text-text-muted">{label}</span>
      <span className="flex items-center gap-2 rounded-control bg-surface px-2.5 py-1.5 text-ui text-text-muted">
        <Lock className="size-3.5 shrink-0 text-text-tertiary" strokeWidth={2} aria-hidden="true" />
        <span className="truncate">{value}</span>
      </span>
    </div>
  );
}
