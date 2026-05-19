"use client";

import { useEffect, useState } from "react";
import { Task } from "../types";
import { db } from "../db";
import { MainLayout } from "../components/MainLayout";

export default function Calendar() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [current, setCurrent] = useState(new Date());
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

  const year = current.getFullYear();
  const month = current.getMonth();
  const firstDOW = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const days: (number | null)[] = [
    ...Array(firstDOW).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (days.length % 7 !== 0) days.push(null);

  const tasksOnDay = (day: number): Task[] =>
    tasks.filter((t) => {
      if (!t.dueDate) return false;
      const d = new Date(t.dueDate + "T00:00:00");
      return d.getFullYear() === year && d.getMonth() === month && d.getDate() === day;
    });

  const todayStr = new Date().toDateString();
  const isToday = (day: number) => new Date(year, month, day).toDateString() === todayStr;

  const monthLabel = new Date(year, month).toLocaleDateString("en-US", { month: "long", year: "numeric" });

  const upcoming = tasks
    .filter((t) => t.dueDate && t.status !== "done" && new Date(t.dueDate + "T00:00:00") >= new Date())
    .sort((a, b) => new Date(a.dueDate!).getTime() - new Date(b.dueDate!).getTime())
    .slice(0, 8);

  return (
    <MainLayout>
      <div className="animate-fade-in" style={{ display: "flex", flexDirection: "column", gap: "2rem" }}>
        <div>
          <h1>Calendar</h1>
          <p style={{ marginTop: "0.25rem", color: "var(--text-muted)", fontSize: "0.875rem" }}>
            Visual planning by due date
          </p>
        </div>

        <div className="card">
          {/* Nav */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1.5rem" }}>
            <button className="btn btn-ghost btn-sm" onClick={() => setCurrent(new Date(year, month - 1))}>
              ← Prev
            </button>
            <h2 style={{ margin: 0 }}>{monthLabel}</h2>
            <button className="btn btn-ghost btn-sm" onClick={() => setCurrent(new Date(year, month + 1))}>
              Next →
            </button>
          </div>

          {/* Day headers */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4, marginBottom: 4 }}>
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
              <div key={d} style={{
                textAlign: "center",
                fontSize: "0.75rem",
                fontWeight: 600,
                textTransform: "uppercase",
                letterSpacing: "0.06em",
                color: "var(--text-muted)",
                padding: "0.375rem 0",
              }}>
                {d}
              </div>
            ))}
          </div>

          {/* Grid */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4 }}>
            {days.map((day, i) => {
              if (!day) return <div key={i} style={{ minHeight: 80 }} />;
              const dt = tasksOnDay(day);
              const today = isToday(day);
              return (
                <div key={i} style={{
                  minHeight: 80,
                  padding: "0.375rem",
                  borderRadius: 8,
                  border: `1px solid ${today ? "var(--accent-gold)" : "var(--border)"}`,
                  background: today ? "rgba(212, 168, 83, 0.06)" : "rgba(26, 39, 68, 0.3)",
                }}>
                  <div style={{
                    fontSize: "0.8125rem",
                    fontWeight: today ? 700 : 500,
                    color: today ? "var(--accent-gold)" : "var(--text-secondary)",
                    marginBottom: "0.25rem",
                  }}>
                    {day}
                  </div>
                  {dt.slice(0, 3).map((t) => (
                    <div key={t.id} title={t.title} style={{
                      fontSize: "0.6875rem",
                      fontWeight: 500,
                      padding: "1px 4px",
                      borderRadius: 4,
                      marginBottom: 2,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                      background: t.priority === "high" ? "rgba(239,68,68,0.25)" : t.priority === "medium" ? "rgba(245,158,11,0.25)" : "rgba(100,116,139,0.25)",
                      color: t.priority === "high" ? "#fca5a5" : t.priority === "medium" ? "#fcd34d" : "#94a3b8",
                    }}>
                      {t.title}
                    </div>
                  ))}
                  {dt.length > 3 && (
                    <div style={{ fontSize: "0.6875rem", color: "var(--text-muted)" }}>
                      +{dt.length - 3}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Upcoming */}
        {upcoming.length > 0 && (
          <div className="card">
            <h2 style={{ marginBottom: "1rem" }}>Upcoming</h2>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
              {upcoming.map((t) => (
                <div key={t.id} style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.875rem",
                  padding: "0.625rem 0.875rem",
                  borderRadius: 8,
                  background: "rgba(26, 39, 68, 0.4)",
                  borderLeft: `3px solid ${t.priority === "high" ? "#ef4444" : t.priority === "medium" ? "#f59e0b" : "#475569"}`,
                }}>
                  <div style={{ flex: 1, fontWeight: 500, color: "var(--text-primary)" }}>{t.title}</div>
                  <span style={{ fontSize: "0.75rem", color: "var(--accent-gold)" }}>
                    {new Date(t.dueDate! + "T00:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                  </span>
                  <span className={`badge badge-${t.priority}`}>
                    {t.priority.charAt(0).toUpperCase() + t.priority.slice(1)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </MainLayout>
  );
}
