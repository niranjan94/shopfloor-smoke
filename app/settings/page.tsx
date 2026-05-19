"use client";

import { useEffect, useState } from "react";
import { Category } from "../types";
import { db } from "../db";
import { MainLayout } from "../components/MainLayout";

const DEFAULT_CATEGORIES: Category[] = [
  { id: "work",     name: "Work",     color: "" },
  { id: "personal", name: "Personal", color: "" },
  { id: "shopping", name: "Shopping", color: "" },
  { id: "health",   name: "Health",   color: "" },
];

export default function Settings() {
  const [categories, setCategories] = useState<Category[]>(DEFAULT_CATEGORIES);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    db.getCategories()
      .then((cats) => { if (cats.length > 0) setCategories(cats); })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  async function addCategory() {
    const name = newName.trim();
    if (!name || saving) return;
    setSaving(true);
    const cat: Category = { id: Date.now().toString(), name, color: "" };
    try {
      await db.addCategory(cat);
      setCategories((prev) => [...prev, cat]);
      setNewName("");
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(false);
    }
  }

  const builtIn = new Set(["work", "personal", "shopping", "health"]);

  if (loading) {
    return <MainLayout><div style={{ color: "var(--text-muted)", padding: "3rem", textAlign: "center" }}>Loading…</div></MainLayout>;
  }

  return (
    <MainLayout>
      <div className="animate-fade-in" style={{ display: "flex", flexDirection: "column", gap: "2rem", maxWidth: 560 }}>
        <div>
          <h1>Settings</h1>
          <p style={{ marginTop: "0.25rem", color: "var(--text-muted)", fontSize: "0.875rem" }}>
            Customize your workspace
          </p>
        </div>

        {/* Categories */}
        <div className="card">
          <h2 style={{ marginBottom: "1.25rem" }}>Categories</h2>

          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", marginBottom: "1.5rem" }}>
            {categories.map((cat) => (
              <div key={cat.id} style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "0.625rem 0.875rem",
                borderRadius: 8,
                background: "rgba(26, 39, 68, 0.4)",
                border: "1px solid var(--border)",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: "0.625rem" }}>
                  <div style={{
                    width: 8,
                    height: 8,
                    borderRadius: "50%",
                    background: "var(--accent-gold)",
                    flexShrink: 0,
                  }} />
                  <span style={{ fontWeight: 500, color: "var(--text-primary)", fontSize: "0.9rem" }}>{cat.name}</span>
                  {builtIn.has(cat.id) && (
                    <span style={{
                      fontSize: "0.6875rem",
                      color: "var(--text-muted)",
                      background: "rgba(148, 163, 184, 0.08)",
                      padding: "1px 6px",
                      borderRadius: 4,
                    }}>
                      built-in
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div style={{ borderTop: "1px solid var(--border)", paddingTop: "1.25rem" }}>
            <h3 style={{ marginBottom: "0.75rem", color: "var(--text-secondary)" }}>Add Category</h3>
            <div style={{ display: "flex", gap: "0.625rem" }}>
              <input
                className="input"
                type="text"
                placeholder="Category name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addCategory()}
                style={{ flex: 1 }}
              />
              <button className="btn btn-primary" onClick={addCategory} disabled={saving || !newName.trim()}>
                {saving ? "…" : "Add"}
              </button>
            </div>
          </div>
        </div>

        {/* About */}
        <div className="card">
          <h2 style={{ marginBottom: "1rem" }}>About TaskFlow</h2>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", color: "var(--text-secondary)", fontSize: "0.875rem" }}>
            <p>A locally-powered task manager built with Next.js and React. All data lives in your browser via IndexedDB — no account, no sync, no server.</p>
            <ul style={{ paddingLeft: "1.25rem", display: "flex", flexDirection: "column", gap: "0.375rem" }}>
              <li>Tasks with priorities, categories, and due dates</li>
              <li>Status workflow: To Do → In Progress → Done</li>
              <li>Analytics dashboard and calendar view</li>
              <li>Search, filter, and sort</li>
              <li>100% offline capable</li>
            </ul>
            <p style={{ color: "var(--text-muted)", fontSize: "0.8125rem", paddingTop: "0.5rem", borderTop: "1px solid var(--border)" }}>
              Version 1.0 · IndexedDB storage
            </p>
          </div>
        </div>
      </div>
    </MainLayout>
  );
}
