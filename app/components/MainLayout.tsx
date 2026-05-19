"use client";

import { Sidebar } from "./Sidebar";

export function MainLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen w-screen overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-y-auto p-8" style={{
        color: "var(--text-primary)",
        background: "linear-gradient(135deg, #0f172a 0%, #0a1628 100%)",
      }}>
        {children}
      </main>
    </div>
  );
}
