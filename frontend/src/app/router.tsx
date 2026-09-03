import { Route, Routes } from "react-router-dom";
import { AppShell } from "@/components/layout/AppShell";
import { ProtectedRoute } from "@/features/auth/ProtectedRoute";

function Placeholder({ name }: { name: string }) {
  return <div className="text-text-muted">{name} — not built yet</div>;
}

export function AppRoutes() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<Placeholder name="Programs" />} />
        <Route path="programs/:programId" element={<Placeholder name="Branches" />} />
        <Route path="branches/:branchId" element={<Placeholder name="Subjects" />} />
        <Route path="subjects/:subjectId" element={<Placeholder name="Subject notes" />} />
        <Route path="notes/:noteId" element={<Placeholder name="Note detail" />} />
        <Route path="search" element={<Placeholder name="Search" />} />
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
