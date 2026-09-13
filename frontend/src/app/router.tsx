import { lazy } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { AdminShell } from "@/components/layout/AdminShell";
import { AppShell } from "@/components/layout/AppShell";
import { ProtectedRoute } from "@/features/auth/ProtectedRoute";

// Route-level code splitting: AppShell/AdminShell/ProtectedRoute are layout
// chrome needed on every navigation, so they stay in the main bundle. Every
// page below is its own chunk, fetched on first visit — an anonymous visitor
// never downloads the admin console, and a signed-in user never downloads
// the landing page's marketing/animation-heavy component tree.
const LandingPage = lazy(() => import("@/routes/LandingPage").then((m) => ({ default: m.LandingPage })));
const LoginPage = lazy(() => import("@/routes/LoginPage").then((m) => ({ default: m.LoginPage })));
const RegisterPage = lazy(() =>
  import("@/routes/RegisterPage").then((m) => ({ default: m.RegisterPage }))
);
const VerifyEmailPage = lazy(() =>
  import("@/routes/VerifyEmailPage").then((m) => ({ default: m.VerifyEmailPage }))
);
const ForgotPasswordPage = lazy(() =>
  import("@/routes/ForgotPasswordPage").then((m) => ({ default: m.ForgotPasswordPage }))
);
const ResetPasswordPage = lazy(() =>
  import("@/routes/ResetPasswordPage").then((m) => ({ default: m.ResetPasswordPage }))
);
const OAuthCallbackPage = lazy(() =>
  import("@/routes/OAuthCallbackPage").then((m) => ({ default: m.OAuthCallbackPage }))
);
const OAuthCompletePage = lazy(() =>
  import("@/routes/OAuthCompletePage").then((m) => ({ default: m.OAuthCompletePage }))
);
const HomePage = lazy(() => import("@/routes/HomePage").then((m) => ({ default: m.HomePage })));
const ProgramsPage = lazy(() =>
  import("@/routes/ProgramsPage").then((m) => ({ default: m.ProgramsPage }))
);
const BranchesPage = lazy(() =>
  import("@/routes/BranchesPage").then((m) => ({ default: m.BranchesPage }))
);
const SubjectsPage = lazy(() =>
  import("@/routes/SubjectsPage").then((m) => ({ default: m.SubjectsPage }))
);
const SubjectNotesPage = lazy(() =>
  import("@/routes/SubjectNotesPage").then((m) => ({ default: m.SubjectNotesPage }))
);
const NoteDetailPage = lazy(() =>
  import("@/routes/NoteDetailPage").then((m) => ({ default: m.NoteDetailPage }))
);
const SearchPage = lazy(() => import("@/routes/SearchPage").then((m) => ({ default: m.SearchPage })));
const UploadPage = lazy(() => import("@/routes/UploadPage").then((m) => ({ default: m.UploadPage })));
const MyUploadsPage = lazy(() =>
  import("@/routes/MyUploadsPage").then((m) => ({ default: m.MyUploadsPage }))
);
const SettingsPage = lazy(() =>
  import("@/routes/SettingsPage").then((m) => ({ default: m.SettingsPage }))
);
const ModerationPage = lazy(() =>
  import("@/routes/ModerationPage").then((m) => ({ default: m.ModerationPage }))
);
const UsersPage = lazy(() => import("@/routes/UsersPage").then((m) => ({ default: m.UsersPage })));
const AdminUsersPage = lazy(() =>
  import("@/routes/admin/AdminUsersPage").then((m) => ({ default: m.AdminUsersPage }))
);
const RolesPage = lazy(() =>
  import("@/routes/admin/RolesPage").then((m) => ({ default: m.RolesPage }))
);
const AuditLogPage = lazy(() =>
  import("@/routes/admin/AuditLogPage").then((m) => ({ default: m.AuditLogPage }))
);
const NotFoundPage = lazy(() =>
  import("@/routes/NotFoundPage").then((m) => ({ default: m.NotFoundPage }))
);

export function AppRoutes() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<LandingPage />} />
        <Route path="login" element={<LoginPage />} />
        <Route path="register" element={<RegisterPage />} />
        <Route path="verify-email" element={<VerifyEmailPage />} />
        <Route path="forgot-password" element={<ForgotPasswordPage />} />
        <Route path="reset-password" element={<ResetPasswordPage />} />
        <Route path="oauth/callback" element={<OAuthCallbackPage />} />
        <Route path="oauth/complete" element={<OAuthCompletePage />} />

        <Route element={<ProtectedRoute />}>
          <Route path="home" element={<HomePage />} />
          <Route path="browse" element={<ProgramsPage />} />
          <Route path="programs/:programId" element={<BranchesPage />} />
          <Route path="branches/:branchId" element={<SubjectsPage />} />
          <Route path="subjects/:subjectId" element={<SubjectNotesPage />} />
          <Route path="notes/:noteId" element={<NoteDetailPage />} />
          <Route path="search" element={<SearchPage />} />
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
