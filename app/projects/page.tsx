"use client";

import { useEffect, useState } from "react";
import { Task, Category } from "../types";
import { db } from "../db";
import { MainLayout } from "../components/MainLayout";

const DEFAULT_CATEGORIES: Category[] = [
  { id: "work",     name: "Work",     color: "" },
  { id: "personal", name: "Personal", color: "" },
  { id: "shopping", name: "Shopping", color: "" },
  { id: "health",   name: "Health",   color: "" },
];

export default function Projects() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [categories, setCategories] = useState<Category[]>(DEFAULT_CATEGORIES);
  const [selected, setSelected] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([db.getTasks(), db.getCategories()])
      .then(([t, c]) => {
        setTasks(t);
        if (c.length > 0) setCategories(c);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <MainLayout><div style={{ color: "var(--text-muted)", padding: "3rem", textAlign: "center" }}>Loading…</div></MainLayout>;
  }

  const stats = (id: string) => {
    const ct = tasks.filter((t) => t.category === id);
    return {
      total: ct.length,
      todo: ct.filter((t) => t.status === "todo").length,
      doing: ct.filter((t) => t.status === "in-progress").length,
      done: ct.filter((t) => t.status === "done").length,
    };
  };

  const detail = selected
    ? { cat: categories.find((c) => c.id === selected), tasks: tasks.filter((t) => t.category === selected) }
    : null;

  return (
    <MainLayout>
      <div className="animate-fade-in" style={{ display: "flex", flexDirection: "column", gap: "2rem" }}>
        <div>
          <h1>Projects</h1>
          <p style={{ marginTop: "0.25rem", color: "var(--text-muted)", fontSize: "0.875rem" }}>
            Browse tasks by category
          </p>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "240px 1fr", gap: "1.25rem", alignItems: "start" }}>
          {/* Sidebar list */}
          <div className="card" style={{ padding: "0.5rem" }}>
            {categories.map((cat) => {
              const s = stats(cat.id);
              const active = selected === cat.id;
              return (
                <button
                  key={cat.id}
                  onClick={() => setSelected(active ? null : cat.id)}
                  style={{
                    display: "block",
                    width: "100%",
                    padding: "0.75rem 1rem",
                    borderRadius: 8,
                    background: active ? "rgba(212, 168, 83, 0.1)" : "transparent",
                    border: "none",
                    borderLeft: `3px solid ${active ? "var(--accent-gold)" : "transparent"}`,
                    cursor: "pointer",
                    textAlign: "left",
                    transition: "all 150ms ease",
                  }}
                >
                  <div style={{ fontWeight: 600, color: active ? "var(--accent-gold)" : "var(--text-primary)", fontSize: "0.875rem", marginBottom: "0.25rem" }}>
                    {cat.name}
                  </div>
                  <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                    {s.total} task{s.total !== 1 ? "s" : ""} · {s.done} done
                  </div>
                </button>
              );
            })}
          </div>

          {/* Detail panel */}
          {detail ? (
            <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              <div className="card">
                <h2 style={{ color: "var(--accent-gold)", marginBottom: "1.25rem" }}>{detail.cat?.name}</h2>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "1rem", marginBottom: "1.5rem" }}>
                  {[
                    { label: "Total",  value: detail.tasks.length,                                      color: "var(--accent-gold)" },
                    { label: "Active", value: detail.tasks.filter((t) => t.status !== "done").length,   color: "#fcd34d" },
                    { label: "Done",   value: detail.tasks.filter((t) => t.status === "done").length,   color: "#6ee7b7" },
                  ].map((s) => (
                    <div key={s.label} className="stat-card">
                      <div className="stat-value" style={{ fontSize: "1.75rem", color: s.color }}>{s.value}</div>
                      <div className="stat-label">{s.label}</div>
                    </div>
                  ))}
                </div>

                {detail.tasks.length === 0 ? (
                  <div style={{ textAlign: "center", padding: "2rem", color: "var(--text-muted)" }}>
                    No tasks in this category yet.
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                    {detail.tasks.map((t) => (
                      <div key={t.id} style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "0.75rem",
                        padding: "0.625rem 0.875rem",
                        borderRadius: 8,
                        background: "rgba(26, 39, 68, 0.4)",
                        border: "1px solid var(--border)",
                      }}>
                        <div style={{
                          width: 8,
                          height: 8,
                          borderRadius: "50%",
                          flexShrink: 0,
                          background: t.status === "done" ? "#6ee7b7" : t.status === "in-progress" ? "#fcd34d" : "var(--border-hover)",
                        }} />
                        <div style={{
                          flex: 1,
                          fontWeight: 500,
                          color: t.status === "done" ? "var(--text-muted)" : "var(--text-primary)",
                          textDecoration: t.status === "done" ? "line-through" : "none",
                          fontSize: "0.875rem",
                        }}>
                          {t.title}
                        </div>
                        <span className={`badge badge-${t.priority}`}>
                          {t.priority.charAt(0).toUpperCase() + t.priority.slice(1)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="card" style={{ textAlign: "center", padding: "4rem", color: "var(--text-muted)" }}>
              Select a category to see its tasks
            </div>
          )}
        </div>
      </div>
    </MainLayout>
  );
}
