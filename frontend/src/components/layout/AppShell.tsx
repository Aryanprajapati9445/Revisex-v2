import { Outlet } from "react-router-dom";
import { TopNav } from "./TopNav";
import { PageTransition } from "@/components/motion/PageTransition";

export function AppShell() {
  return (
    <div className="min-h-screen bg-background">
      <TopNav />
      <main className="mx-auto max-w-[90rem] px-6 py-8 sm:px-8">
        <PageTransition>
          <Outlet />
        </PageTransition>
      </main>
    </div>
  );
}
