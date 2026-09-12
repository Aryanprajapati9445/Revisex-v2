import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import type { NoteCard, NoteComment, Paginated, RatingSummary, Tag } from "@/lib/api-types";
import { queryKeys } from "@/lib/query-keys";

/**
 * Saving, rating and commenting all change numbers that are baked into every
 * note card the cache is holding — a note's own detail, the listings it
 * appears in, and the saved list. Rather than surgically patching each, these
 * drop the note-shaped caches and let them refetch; the alternative is a card
 * showing a rating that disagrees with the page it links to.
 */
function useEngagementInvalidation(noteId: string) {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.note(noteId) });
    void queryClient.invalidateQueries({ queryKey: ["notes"] });
    void queryClient.invalidateQueries({ queryKey: ["bookmarks"] });
  };
}

export function useBookmarks(page = 1) {
  return useQuery({
    queryKey: queryKeys.bookmarks(page),
    queryFn: () => api.get<Paginated<NoteCard>>("/api/bookmarks", { page }),
    placeholderData: keepPreviousData,
  });
}

/**
 * One mutation for both directions, because the button is a toggle and the two
 * halves must invalidate identically. Takes the desired next state rather than
 * reading the current one, so a double click cannot race itself into the wrong
 * result.
 */
export function useToggleBookmark(noteId: string) {
  const invalidate = useEngagementInvalidation(noteId);
  return useMutation({
    mutationFn: (next: boolean) =>
      next
        ? api.put<{ bookmarked: boolean }>(`/api/bookmarks/${noteId}`, {})
        : api.delete<{ bookmarked: boolean }>(`/api/bookmarks/${noteId}`),
    onSuccess: invalidate,
  });
}

export function useRateNote(noteId: string) {
  const invalidate = useEngagementInvalidation(noteId);
  return useMutation({
    // null withdraws the rating; the API keeps that on a separate verb.
    mutationFn: (rating: number | null) =>
      rating === null
        ? api.delete<RatingSummary>(`/api/ratings/${noteId}`)
        : api.put<RatingSummary>(`/api/ratings/${noteId}`, { rating }),
    onSuccess: invalidate,
  });
}

export function useComments(noteId: string, page = 1) {
  return useQuery({
    queryKey: queryKeys.comments(noteId, page),
    queryFn: () => api.get<Paginated<NoteComment>>("/api/comments", { note_id: noteId, page }),
    enabled: noteId !== "",
    placeholderData: keepPreviousData,
  });
}

export function useCommentMutations(noteId: string) {
  const queryClient = useQueryClient();
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["comments", noteId] });
    // comment_count lives on the note card.
    void queryClient.invalidateQueries({ queryKey: queryKeys.note(noteId) });
  };

  const create = useMutation({
    mutationFn: (body: string) => api.post<NoteComment>("/api/comments", { note_id: noteId, body }),
    onSuccess: refresh,
  });
  const update = useMutation({
    mutationFn: ({ id, body }: { id: string; body: string }) =>
      api.patch<NoteComment>(`/api/comments/${id}`, { body }),
    onSuccess: refresh,
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.delete<null>(`/api/comments/${id}`),
    onSuccess: refresh,
  });

  return { create, update, remove };
}

/**
 * Tags worth offering as filters. The API returns only tags that lead to an
 * approved note, so this never suggests a filter that returns nothing.
 */
export function useTags(q?: string) {
  return useQuery({
    queryKey: queryKeys.tags(q),
    queryFn: () => api.get<Tag[]>("/api/tags", q ? { q } : {}),
    staleTime: 5 * 60 * 1000,
  });
}
