import { AlertTriangle } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export interface ImpactLine {
  label: string;
  count: number;
}

/**
 * The confirm for an operation that takes other things down with it.
 *
 * Two gates, not one: the dialog itself, and typing the row's own code. A
 * single "Are you sure?" is dismissed reflexively, and deactivating a program
 * hides every branch and subject beneath it — the damage is invisible from the
 * button that caused it, so the count of what goes with it is shown here and
 * the code has to be read off the screen to proceed.
 *
 * Type-to-confirm is only warranted when something is actually taken down:
 * pass `requireTypedConfirmation={false}` for a leaf with nothing under it and
 * the dialog degrades to a plain confirm.
 */
export function ConfirmDestructive({
  open,
  onOpenChange,
  title,
  description,
  confirmationCode,
  requireTypedConfirmation = true,
  impact,
  confirmLabel = "Deactivate",
  pending = false,
  error,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: ReactNode;
  /** The row's own code, which the admin must retype. */
  confirmationCode: string;
  requireTypedConfirmation?: boolean;
  impact?: ImpactLine[];
  confirmLabel?: string;
  pending?: boolean;
  error?: string | null;
  onConfirm: () => void;
}) {
  const [typed, setTyped] = useState("");
  const matches = typed.trim().toUpperCase() === confirmationCode.toUpperCase();
  const canConfirm = !pending && (!requireTypedConfirmation || matches);

  function handleOpenChange(next: boolean) {
    // Reset on every close so reopening never arrives pre-confirmed.
    if (!next) setTyped("");
    onOpenChange(next);
  }

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <span className="flex size-7 items-center justify-center rounded-control bg-status-rejected-bg text-status-rejected-fg">
              <AlertTriangle className="size-4" strokeWidth={2} aria-hidden="true" />
            </span>
            {title}
          </AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>

        {impact && impact.length > 0 && (
          <dl className="flex flex-col gap-1 rounded-card bg-surface p-3">
            <span className="pb-1 text-caption text-text-muted">This also affects</span>
            {impact.map((line) => (
              <div key={line.label} className="flex items-baseline justify-between gap-4">
                <dt className="text-ui text-text-muted">{line.label}</dt>
                <dd className="font-mono text-ui tabular-nums text-text-primary">{line.count}</dd>
              </div>
            ))}
          </dl>
        )}

        {requireTypedConfirmation && (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="confirm-code">
              Type <span className="font-mono text-text-primary">{confirmationCode}</span> to confirm
            </Label>
            <Input
              id="confirm-code"
              value={typed}
              autoComplete="off"
              spellCheck={false}
              onChange={(event) => setTyped(event.target.value)}
              className="font-mono"
            />
          </div>
        )}

        {error && (
          <Alert variant="destructive" role="alert">
            <AlertTriangle />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={!canConfirm}
            // Without this the dialog closes on click regardless of the
            // request's outcome, so a failed deactivation would look like it
            // worked. The caller closes it once the mutation settles.
            onClick={(event) => {
              event.preventDefault();
              if (canConfirm) onConfirm();
            }}
          >
            {pending ? "Working…" : confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
