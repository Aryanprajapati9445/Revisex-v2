import { Navigate, Route, Routes } from "react-router-dom";
import { AdminShell } from "@/components/layout/AdminShell";
import { AppShell } from "@/components/layout/AppShell";
import { ProtectedRoute } from "@/features/auth/ProtectedRoute";
import { AdminUsersPage } from "@/routes/admin/AdminUsersPage";
import { AuditLogPage } from "@/routes/admin/AuditLogPage";
import { RolesPage } from "@/routes/admin/RolesPage";
import { BranchesPage } from "@/routes/BranchesPage";
import { HomePage } from "@/routes/HomePage";
import { LoginPage } from "@/routes/LoginPage";
import { ModerationPage } from "@/routes/ModerationPage";
import { MyUploadsPage } from "@/routes/MyUploadsPage";
import { NotFoundPage } from "@/routes/NotFoundPage";
import { NoteDetailPage } from "@/routes/NoteDetailPage";
import { RegisterPage } from "@/routes/RegisterPage";
import { SettingsPage } from "@/routes/SettingsPage";
import { ProgramsPage } from "@/routes/ProgramsPage";
import { SearchPage } from "@/routes/SearchPage";
import { SubjectNotesPage } from "@/routes/SubjectNotesPage";
import { SubjectsPage } from "@/routes/SubjectsPage";
import { UploadPage } from "@/routes/UploadPage";
import { UsersPage } from "@/routes/UsersPage";

export function AppRoutes() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<HomePage />} />
        <Route path="browse" element={<ProgramsPage />} />
        <Route path="programs/:programId" element={<BranchesPage />} />
        <Route path="branches/:branchId" element={<SubjectsPage />} />
        <Route path="subjects/:subjectId" element={<SubjectNotesPage />} />
        <Route path="notes/:noteId" element={<NoteDetailPage />} />
        <Route path="search" element={<SearchPage />} />
        <Route path="login" element={<LoginPage />} />
        <Route path="register" element={<RegisterPage />} />

        <Route element={<ProtectedRoute />}>
          <Route path="upload" element={<UploadPage />} />
          <Route path="my-uploads" element={<MyUploadsPage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="moderate" element={<ModerationPage />} />
          <Route path="admin/users" element={<UsersPage />} />

          {/*
            A separate, permission-gated dashboard (see docs/superpowers) —
            "admin/users" above is the older domain-scope user management
            (requireRole), left untouched. This tree uses requirePermission
            on every request, so /admin/accounts is a different path from
            the legacy /admin/users rather than a collision.
          */}
          <Route path="admin" element={<AdminShell />}>
            <Route index element={<Navigate to="accounts" replace />} />
            <Route path="accounts" element={<AdminUsersPage />} />
            <Route path="roles" element={<RolesPage />} />
            <Route path="audit-log" element={<AuditLogPage />} />
          </Route>
        </Route>

        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
