import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import type { Note, NoteFile, Paginated } from "@/lib/api-types";
import { queryKeys, type NoteFilters } from "@/lib/query-keys";

export function useNotes(filters: NoteFilters) {
  return useQuery({
    queryKey: queryKeys.notes(filters),
    queryFn: () => api.get<Paginated<Note>>("/api/notes", { ...filters }),
  });
}

export function useNote(id: string) {
  return useQuery({
    queryKey: queryKeys.note(id),
    queryFn: () => api.get<Note>(`/api/notes/${id}`),
    enabled: id !== "",
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
