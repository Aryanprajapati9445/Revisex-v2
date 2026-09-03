import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import type { Note } from "@/lib/api-types";

export interface ReviewInput {
  noteId: string;
  decision: "approved" | "rejected";
  rejection_reason?: string;
}

/**
 * The queue's whole job is to empty, so the reviewed row is removed
 * immediately and restored if the request fails. This is the only optimistic
 * mutation in the app.
 */
export function useReviewNote(queueKey: readonly unknown[]) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ noteId, decision, rejection_reason }: ReviewInput) =>
      api.post<Note>(`/api/notes/${noteId}/review`, {
        decision,
        ...(decision === "rejected" ? { rejection_reason } : {}),
      }),

    onMutate: async ({ noteId }) => {
      await queryClient.cancelQueries({ queryKey: queueKey });
      const previous = queryClient.getQueryData(queueKey);
      queryClient.setQueryData(queueKey, (old: { items: Note[] } | undefined) =>
        old ? { ...old, items: old.items.filter((note) => note.id !== noteId) } : old
      );
      return { previous };
    },

    onError: (_error, _input, context) => {
      if (context?.previous) queryClient.setQueryData(queueKey, context.previous);
    },

    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: queueKey });
    },
  });
}
