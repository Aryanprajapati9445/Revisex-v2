import { useMutation, useQueryClient } from "@tanstack/react-query";
import { nativeSelectClass } from "@/components/ui/native-select";
import { api } from "@/lib/api-client";
import type { User } from "@/lib/api-types";
import { queryKeys } from "@/lib/query-keys";

/**
 * Which semester the student is in, saved to their account.
 *
 * Not derived from enrollment_year: registration never collects one, so it is
 * null for every real signup, and turning a year into a semester would need an
 * academic calendar nothing here records. Asking is honest and takes one click.
 *
 * Stored server-side rather than in localStorage so it follows the person to
 * their phone, which is where most of them will actually read these notes.
 */
export function SemesterPicker({
  value,
  durationSemesters,
}: {
  value: number | null;
  durationSemesters: number;
}) {
  const queryClient = useQueryClient();
  const save = useMutation({
    mutationFn: (semester: number | null) =>
      api.patch<User>("/api/users/me", { current_semester: semester }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.me }),
  });

  return (
    <label className="flex items-center gap-2 text-caption text-text-muted">
      <span>Semester</span>
      <select
        value={value ?? ""}
        disabled={save.isPending}
        onChange={(e) => save.mutate(e.target.value === "" ? null : Number(e.target.value))}
        className={`${nativeSelectClass} w-auto py-1`}
        aria-label="Your current semester"
      >
        <option value="">Not set</option>
        {Array.from({ length: durationSemesters }, (_, i) => i + 1).map((semester) => (
          <option key={semester} value={semester}>
            {semester}
          </option>
        ))}
      </select>
    </label>
  );
}
