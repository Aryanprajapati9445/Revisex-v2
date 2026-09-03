import { Route, Routes } from "react-router-dom";
import { AppShell } from "@/components/layout/AppShell";
import { ProtectedRoute } from "@/features/auth/ProtectedRoute";
import { BranchesPage } from "@/routes/BranchesPage";
import { NoteDetailPage } from "@/routes/NoteDetailPage";
import { ProgramsPage } from "@/routes/ProgramsPage";
import { SearchPage } from "@/routes/SearchPage";
import { SubjectNotesPage } from "@/routes/SubjectNotesPage";
import { SubjectsPage } from "@/routes/SubjectsPage";

function Placeholder({ name }: { name: string }) {
  return <div className="text-text-muted">{name} — not built yet</div>;
}

export function AppRoutes() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<ProgramsPage />} />
        <Route path="programs/:programId" element={<BranchesPage />} />
        <Route path="branches/:branchId" element={<SubjectsPage />} />
        <Route path="subjects/:subjectId" element={<SubjectNotesPage />} />
        <Route path="notes/:noteId" element={<NoteDetailPage />} />
        <Route path="search" element={<SearchPage />} />
        <Route path="login" element={<Placeholder name="Login" />} />
        <Route path="register" element={<Placeholder name="Register" />} />

        <Route element={<ProtectedRoute />}>
          <Route path="upload" element={<Placeholder name="Upload" />} />
          <Route path="my-uploads" element={<Placeholder name="My uploads" />} />
          <Route path="settings" element={<Placeholder name="Settings" />} />
          <Route path="moderate" element={<Placeholder name="Moderation" />} />
          <Route path="admin/users" element={<Placeholder name="Users" />} />
        </Route>

        <Route path="*" element={<Placeholder name="Not found" />} />
      </Route>
    </Routes>
  );
}
