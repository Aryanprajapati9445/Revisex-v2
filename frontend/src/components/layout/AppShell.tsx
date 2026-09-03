import { Outlet } from "react-router-dom";
import { TopNav } from "./TopNav";

export function AppShell() {
  return (
    <div className="min-h-screen bg-background">
      <TopNav />
      <main className="mx-auto max-w-6xl px-6 py-8">
        <Outlet />
      </main>
    </div>
  );
}
