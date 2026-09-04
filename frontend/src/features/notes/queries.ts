import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import type { FilePreview, NoteCard, NoteFile, Paginated } from "@/lib/api-types";
import { queryKeys, type NoteFilters } from "@/lib/query-keys";

export function useNotes(filters: NoteFilters) {
  return useQuery({
    queryKey: queryKeys.notes(filters),
    queryFn: () => api.get<Paginated<NoteCard>>("/api/notes", { ...filters }),
    // Search narrows on every debounced keystroke and every filter change.
    // Without this the results drop to the pending branch each time and the
    // grid flashes a skeleton over an answer the user was still reading.
    placeholderData: keepPreviousData,
  });
}

export function useNote(id: string) {
  return useQuery({
    queryKey: queryKeys.note(id),
    queryFn: () => api.get<NoteCard>(`/api/notes/${id}`),
    enabled: id !== "",
  });
}

/**
 * A link for showing a file in the page rather than saving it.
 *
 * A query, not a mutation: previewing is a read, it is safe to repeat, and the
 * viewer needs the URL before it can render anything. It hits a different
 * endpoint from download precisely because it must not count as one — see
 * previewFile in the backend controller.
 *
 * staleTime sits under the URL's own 5-minute signature expiry, so a cached
 * entry can never outlive the link it holds.
 */
export function useFilePreview(noteId: string, fileId: string | null) {
  return useQuery({
    queryKey: queryKeys.filePreview(noteId, fileId ?? ""),
    queryFn: () => api.get<FilePreview>(`/api/notes/${noteId}/files/${fileId}/preview`),
    enabled: noteId !== "" && fileId !== null,
    staleTime: 4 * 60 * 1000,
  });
}

export function useNoteFiles(id: string) {
  return useQuery({
    queryKey: queryKeys.noteFiles(id),
    queryFn: () => api.get<NoteFile[]>(`/api/notes/${id}/files`),
    enabled: id !== "",
  });
}

/**
 * Fetches a short-lived presigned GET URL. The backend increments
 * notes.download_count as a side effect, so the note query is invalidated to
 * keep the displayed count honest.
 */
export function useDownloadFile(noteId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (fileId: string) => api.get<{ url: string }>(`/api/notes/${noteId}/files/${fileId}/download`),
    onSuccess: ({ url }) => {
      window.open(url, "_blank", "noopener,noreferrer");
      void queryClient.invalidateQueries({ queryKey: queryKeys.note(noteId) });
    },
  });
}
