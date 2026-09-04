import { AlertCircle } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError } from "@/lib/api-client";

export type Tier = "program" | "branch" | "subject";

export interface TaxonomyDraft {
  code: string;
  name: string;
  /** Programs only. */
  duration_semesters: number;
  /** Subjects only. */
  semester: number;
}

const TIER_COPY: Record<Tier, { create: string; edit: string; namePlaceholder: string; codePlaceholder: string }> = {
  program: {
    create: "Add a program",
    edit: "Edit program",
    namePlaceholder: "Bachelor of Technology",
    codePlaceholder: "BTECH",
  },
  branch: {
    create: "Add a branch",
    edit: "Edit branch",
    namePlaceholder: "Computer Science & Engineering",
    codePlaceholder: "CSE",
  },
  subject: {
    create: "Add a subject",
    edit: "Edit subject",
    namePlaceholder: "Data Structures",
    codePlaceholder: "CS201",
  },
};

/**
 * One dialog for all three tiers. They differ by a single field — a program
 * carries its length in semesters, a subject the semester it is taught in, a
 * branch neither — and splitting that into three near-identical components
 * would mean fixing every validation rule three times.
 */
export function TaxonomyDialog({
  tier,
  mode,
  initial,
  /** The program's length, which caps a subject's semester. */
  semesterCeiling,
  pending,
  error,
  onSubmit,
  onClose,
}: {
  tier: Tier;
  mode: "create" | "edit";
  initial?: Partial<TaxonomyDraft>;
  semesterCeiling?: number;
  pending: boolean;
  error: unknown;
  onSubmit: (draft: TaxonomyDraft) => void;
  onClose: () => void;
}) {
  const [code, setCode] = useState(initial?.code ?? "");
  const [name, setName] = useState(initial?.name ?? "");
  const [durationSemesters, setDurationSemesters] = useState(String(initial?.duration_semesters ?? 8));
  const [semester, setSemester] = useState(String(initial?.semester ?? 1));

  const copy = TIER_COPY[tier];
  const ceiling = semesterCeiling ?? 20;
  const semesterValue = Number(semester);
  const semesterOutOfRange = tier === "subject" && (semesterValue < 1 || semesterValue > ceiling);

  const message =
    error instanceof ApiError
      ? error.message
      : error
        ? "Something went wrong. Please try again."
        : null;

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    onSubmit({
      // Uppercased here as well as server-side so the field shows the admin
      // what will actually be stored rather than silently changing on save.
      code: code.trim().toUpperCase(),
      name: name.trim(),
      duration_semesters: Number(durationSemesters),
      semester: semesterValue,
    });
  }

  const canSubmit = code.trim() !== "" && name.trim() !== "" && !semesterOutOfRange && !pending;

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{mode === "create" ? copy.create : copy.edit}</DialogTitle>
        </DialogHeader>

        <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="taxonomy-code">Code</Label>
            <Input
              id="taxonomy-code"
              required
              maxLength={20}
              value={code}
              autoComplete="off"
              spellCheck={false}
              placeholder={copy.codePlaceholder}
              onChange={(event) => setCode(event.target.value.toUpperCase())}
              className="font-mono"
            />
            <span className="text-caption text-text-tertiary">
              Short, unique{tier === "program" ? "" : " within its parent"}. Letters, digits, dot, dash or underscore.
            </span>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="taxonomy-name">Name</Label>
            <Input
              id="taxonomy-name"
              required
              maxLength={tier === "subject" ? 150 : 120}
              value={name}
              placeholder={copy.namePlaceholder}
              onChange={(event) => setName(event.target.value)}
            />
          </div>

          {tier === "program" && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="taxonomy-duration">Length in semesters</Label>
              <Input
                id="taxonomy-duration"
                type="number"
                min={1}
                max={20}
                required
                value={durationSemesters}
                onChange={(event) => setDurationSemesters(event.target.value)}
              />
              <span className="text-caption text-text-tertiary">
                Caps which semester a subject in this program can be taught in.
              </span>
            </div>
          )}

          {tier === "subject" && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="taxonomy-semester">Semester</Label>
              <Input
                id="taxonomy-semester"
                type="number"
                min={1}
                max={ceiling}
                required
                value={semester}
                aria-invalid={semesterOutOfRange}
                onChange={(event) => setSemester(event.target.value)}
              />
              <span className="text-caption text-text-tertiary">
                {semesterOutOfRange
                  ? `This program runs ${ceiling} semesters, so pick 1–${ceiling}.`
                  : `1–${ceiling} for this program.`}
              </span>
            </div>
          )}

          {message && (
            <Alert variant="destructive" role="alert">
              <AlertCircle />
              <AlertDescription>{message}</AlertDescription>
            </Alert>
          )}

          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={!canSubmit}>
              {pending ? "Saving…" : mode === "create" ? "Create" : "Save changes"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
