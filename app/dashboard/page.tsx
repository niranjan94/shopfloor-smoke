"use client";

import { useEffect, useState } from "react";
import { Task } from "../types";
import { db } from "../db";
import { MainLayout } from "../components/MainLayout";

export default function Dashboard() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    db.getTasks()
      .then(setTasks)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <MainLayout><div style={{ color: "var(--text-muted)", padding: "3rem", textAlign: "center" }}>Loading…</div></MainLayout>;
  }

  const total = tasks.length;
  const done = tasks.filter((t) => t.status === "done").length;
  const inProgress = tasks.filter((t) => t.status === "in-progress").length;
  const todo = tasks.filter((t) => t.status === "todo").length;
  const rate = total > 0 ? Math.round((done / total) * 100) : 0;
  const dayAgo = Date.now() - 24 * 60 * 60 * 1000;
  const doneToday = tasks.filter(
    (t) => t.status === "done" && t.completedAt && new Date(t.completedAt).getTime() >= dayAgo
  ).length;

  const overdue = tasks.filter(
    (t) => t.status !== "done" && t.dueDate && new Date(t.dueDate) < new Date()
      && new Date(t.dueDate).toDateString() !== new Date().toDateString()
  );
  const highPri = tasks.filter((t) => t.priority === "high" && t.status !== "done");
  const today = tasks.filter((t) => t.dueDate && new Date(t.dueDate + "T00:00:00").toDateString() === new Date().toDateString());

  const statItems = [
    { label: "Total",      value: total,    color: "var(--accent-gold)" },
    { label: "Completed",  value: done,     color: "#6ee7b7" },
    { label: "Done Today", value: doneToday, color: "#a7f3d0" },
    { label: "Rate",       value: `${rate}%`, color: "#93c5fd" },
    { label: "Overdue",    value: overdue.length, color: "#fca5a5" },
  ];

  const statusBars = [
    { label: "To Do",       count: todo,       pct: total > 0 ? (todo / total) * 100 : 0,       color: "#93c5fd" },
    { label: "In Progress", count: inProgress, pct: total > 0 ? (inProgress / total) * 100 : 0, color: "#fcd34d" },
    { label: "Done",        count: done,       pct: total > 0 ? (done / total) * 100 : 0,        color: "#6ee7b7" },
  ];

  return (
    <MainLayout>
      <div className="animate-fade-in" style={{ display: "flex", flexDirection: "column", gap: "2rem" }}>
        <div>
          <h1>Dashboard</h1>
          <p style={{ marginTop: "0.25rem", color: "var(--text-muted)", fontSize: "0.875rem" }}>
            Your productivity at a glance
          </p>
        </div>

        {/* Stat cards */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: "1rem" }}>
          {statItems.map((s) => (
            <div key={s.label} className="stat-card">
              <div className="stat-value" style={{ color: s.color }}>{s.value}</div>
              <div className="stat-label">{s.label}</div>
            </div>
          ))}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
          {/* Status breakdown */}
          <div className="card">
            <h2 style={{ marginBottom: "1.25rem" }}>Status Breakdown</h2>
            <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              {statusBars.map((b) => (
                <div key={b.label}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.375rem" }}>
                    <span style={{ fontSize: "0.875rem", color: "var(--text-secondary)" }}>{b.label}</span>
                    <span style={{ fontSize: "0.875rem", fontWeight: 600, color: b.color }}>{b.count}</span>
                  </div>
                  <div style={{ height: 6, background: "rgba(148,163,184,0.1)", borderRadius: 3, overflow: "hidden" }}>
                    <div style={{
                      height: "100%",
                      width: `${b.pct}%`,
                      background: b.color,
                      borderRadius: 3,
                      transition: "width 600ms ease",
                    }} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Priority breakdown */}
          <div className="card">
            <h2 style={{ marginBottom: "1.25rem" }}>Priority Breakdown</h2>
            {[
              { label: "High",   count: tasks.filter((t) => t.priority === "high").length,   color: "#fca5a5" },
              { label: "Medium", count: tasks.filter((t) => t.priority === "medium").length, color: "#fcd34d" },
              { label: "Low",    count: tasks.filter((t) => t.priority === "low").length,    color: "#94a3b8" },
            ].map((b) => (
              <div key={b.label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0.625rem 0", borderBottom: "1px solid var(--border)" }}>
                <span style={{ fontSize: "0.875rem", color: "var(--text-secondary)" }}>{b.label}</span>
                <span style={{ fontSize: "1.25rem", fontWeight: 700, fontFamily: "var(--font-playfair, serif)", color: b.color }}>{b.count}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Alerts */}
        {overdue.length > 0 && (
          <div className="card" style={{ borderLeftWidth: 3, borderLeftColor: "#ef4444", borderLeftStyle: "solid" }}>
            <h2 style={{ color: "#fca5a5", marginBottom: "0.875rem" }}>Overdue ({overdue.length})</h2>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
              {overdue.slice(0, 5).map((t) => (
                <div key={t.id} style={{
                  padding: "0.625rem 0.875rem",
                  background: "rgba(239, 68, 68, 0.08)",
                  borderRadius: 8,
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}>
                  <span style={{ fontWeight: 500, color: "var(--text-primary)" }}>{t.title}</span>
                  <span style={{ fontSize: "0.75rem", color: "#fca5a5" }}>
                    {new Date(t.dueDate!).toLocaleDateString()}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {today.length > 0 && (
          <div className="card" style={{ borderLeftWidth: 3, borderLeftColor: "var(--accent-gold)", borderLeftStyle: "solid" }}>
            <h2 style={{ color: "var(--accent-gold)", marginBottom: "0.875rem" }}>Due Today ({today.length})</h2>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
              {today.map((t) => (
                <div key={t.id} style={{
                  padding: "0.625rem 0.875rem",
                  background: "rgba(212, 168, 83, 0.08)",
                  borderRadius: 8,
                }}>
                  <span style={{ fontWeight: 500, color: "var(--text-primary)" }}>{t.title}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {highPri.length > 0 && (
          <div className="card">
            <h2 style={{ marginBottom: "0.875rem" }}>Needs Attention</h2>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
              {highPri.slice(0, 5).map((t) => (
                <div key={t.id} style={{
                  padding: "0.625rem 0.875rem",
                  background: "rgba(239, 68, 68, 0.06)",
                  borderRadius: 8,
                  display: "flex",
                  alignItems: "center",
                  gap: "0.625rem",
                }}>
                  <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#fca5a5", flexShrink: 0 }} />
                  <span style={{ fontWeight: 500, color: "var(--text-primary)" }}>{t.title}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </MainLayout>
  );
}
