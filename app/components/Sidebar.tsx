"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/",          label: "Tasks",     icon: "✓" },
  { href: "/dashboard", label: "Dashboard", icon: "◆" },
  { href: "/calendar",  label: "Calendar",  icon: "▦" },
  { href: "/projects",  label: "Projects",  icon: "▪" },
  { href: "/settings",  label: "Settings",  icon: "⚙" },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside
      className="animate-slide-in-left flex-shrink-0"
      style={{
        width: "240px",
        height: "100vh",
        background: "linear-gradient(180deg, #0e1c35 0%, #111e38 100%)",
        borderRight: "1px solid rgba(148, 163, 184, 0.1)",
        display: "flex",
        flexDirection: "column",
        padding: "2rem 1rem",
        gap: "0",
      }}
    >
      {/* Logo */}
      <div style={{ padding: "0 0.75rem", marginBottom: "2.5rem" }}>
        <div style={{
          fontFamily: "var(--font-playfair, serif)",
          fontSize: "1.375rem",
          fontWeight: 700,
          color: "var(--accent-gold)",
          letterSpacing: "-0.02em",
        }}>
          TaskFlow
        </div>
        <div style={{
          fontSize: "0.7rem",
          fontWeight: 500,
          textTransform: "uppercase",
          letterSpacing: "0.1em",
          color: "var(--text-muted)",
          marginTop: "0.25rem",
        }}>
          Task Management
        </div>
      </div>

      {/* Nav */}
      <nav style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
        {links.map((link) => {
          const active = pathname === link.href;
          return (
            <Link
              key={link.href}
              href={link.href}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.75rem",
                padding: "0.625rem 0.875rem",
                borderRadius: "8px",
                fontSize: "0.875rem",
                fontWeight: active ? 600 : 500,
                color: active ? "var(--accent-gold)" : "var(--text-muted)",
                background: active ? "rgba(212, 168, 83, 0.1)" : "transparent",
                textDecoration: "none",
                transition: "all 150ms ease",
                borderLeft: active ? "2px solid var(--accent-gold)" : "2px solid transparent",
              }}
              onMouseEnter={(e) => {
                if (!active) {
                  (e.currentTarget as HTMLElement).style.color = "var(--text-secondary)";
                  (e.currentTarget as HTMLElement).style.background = "rgba(148, 163, 184, 0.06)";
                }
              }}
              onMouseLeave={(e) => {
                if (!active) {
                  (e.currentTarget as HTMLElement).style.color = "var(--text-muted)";
                  (e.currentTarget as HTMLElement).style.background = "transparent";
                }
              }}
            >
              <span style={{ fontSize: "0.875rem", width: "18px", textAlign: "center", flexShrink: 0 }}>
                {link.icon}
              </span>
              {link.label}
            </Link>
          );
        })}
      </nav>

      {/* Spacer */}
      <div style={{ flex: 1 }} />

      {/* Status footer */}
      <div style={{
        padding: "1rem 0.875rem",
        borderTop: "1px solid rgba(148, 163, 184, 0.1)",
        display: "flex",
        flexDirection: "column",
        gap: "0.5rem",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <div style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--accent-gold)", flexShrink: 0 }} />
          <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>Local storage active</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <div style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--accent-teal)", flexShrink: 0 }} />
          <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>Offline ready</span>
        </div>
      </div>
    </aside>
  );
}
