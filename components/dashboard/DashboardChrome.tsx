"use client";

import { useState } from "react";
import { DashboardNavbar } from "./DashboardNavbar";
import { DashboardSidebar } from "./DashboardSidebar";

export function DashboardChrome({
  userName,
  organization,
  children,
}: {
  userName: string;
  organization: string;
  children: React.ReactNode;
}) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="min-h-screen bg-slate-100">
      <DashboardNavbar
        userName={userName}
        organization={organization}
        onToggleSidebar={() => setSidebarOpen((open) => !open)}
      />

      <div className="flex">
        <DashboardSidebar
          userName={userName}
          mobileOpen={sidebarOpen}
          onCloseMobile={() => setSidebarOpen(false)}
        />

        <main className="flex min-w-0 flex-1 flex-col p-4 sm:p-6 lg:p-8">
          <div className="flex-1">{children}</div>
          <footer className="mt-8 text-center text-xs text-slate-400">
            © {new Date().getFullYear()} VeloxLab
          </footer>
        </main>
      </div>
    </div>
  );
}
