import { Navigate, Route, Routes } from "react-router-dom";
import { AppShell } from "@/components/layout/AppShell";
import { ConsoleShell } from "@/components/layout/ConsoleShell";
import { ProtectedRoute } from "@/features/auth/ProtectedRoute";
import { AdminUsersPage } from "@/routes/admin/AdminUsersPage";
import { AuditLogPage } from "@/routes/admin/AuditLogPage";
import { BulkUploadPage } from "@/routes/admin/BulkUploadPage";
import { OverviewPage } from "@/routes/admin/OverviewPage";
import { RolesPage } from "@/routes/admin/RolesPage";
import { TaxonomyPage } from "@/routes/admin/TaxonomyPage";
import { BranchesPage } from "@/routes/BranchesPage";
import { HomePage } from "@/routes/HomePage";
import { LandingPage } from "@/routes/LandingPage";
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

export function AppRoutes() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<LandingPage />} />
        <Route path="browse" element={<ProgramsPage />} />
        <Route path="programs/:programId" element={<BranchesPage />} />
        <Route path="branches/:branchId" element={<SubjectsPage />} />
        <Route path="subjects/:subjectId" element={<SubjectNotesPage />} />
        <Route path="notes/:noteId" element={<NoteDetailPage />} />
        <Route path="search" element={<SearchPage />} />
        <Route path="login" element={<LoginPage />} />
        <Route path="register" element={<RegisterPage />} />

        <Route element={<ProtectedRoute />}>
          <Route path="home" element={<HomePage />} />
          <Route path="upload" element={<UploadPage />} />
          <Route path="my-uploads" element={<MyUploadsPage />} />
          <Route path="settings" element={<SettingsPage />} />

          {/*
            The console absorbed both of these. They stay as redirects because
            they were real URLs people may have bookmarked, and because the
            review queue is linked from elsewhere in the app.
          */}
          <Route path="moderate" element={<Navigate to="/admin/moderation" replace />} />
          <Route path="admin/users" element={<Navigate to="/admin/accounts" replace />} />
        </Route>

        <Route path="*" element={<NotFoundPage />} />
      </Route>

      {/*
        Deliberately outside AppShell: the console runs on its own sidebar
        layout, not the site's top nav, so it cannot be a child of the shell
        that renders one. ConsoleShell itself decides what an account may open
        (see features/admin/capabilities) and every endpoint re-checks.
      */}
      <Route element={<ProtectedRoute />}>
        <Route path="admin" element={<ConsoleShell />}>
          <Route index element={<OverviewPage />} />
          <Route path="taxonomy" element={<TaxonomyPage />} />
          <Route path="moderation" element={<ModerationPage />} />
          <Route path="upload" element={<BulkUploadPage />} />
          <Route path="accounts" element={<AdminUsersPage />} />
          <Route path="roles" element={<RolesPage />} />
          <Route path="audit-log" element={<AuditLogPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Route>
    </Routes>
  );
}
