"use client";

import { useEffect, useState } from "react";
import { Task, Category } from "./types";
import { db } from "./db";
import { MainLayout } from "./components/MainLayout";
import { TaskCard } from "./components/TaskCard";

const DEFAULT_CATEGORIES: Category[] = [
  { id: "work",     name: "Work",     color: "bg-blue-100 text-blue-900" },
  { id: "personal", name: "Personal", color: "bg-green-100 text-green-900" },
  { id: "shopping", name: "Shopping", color: "bg-purple-100 text-purple-900" },
  { id: "health",   name: "Health",   color: "bg-red-100 text-red-900" },
];

export default function Home() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [categories, setCategories] = useState<Category[]>(DEFAULT_CATEGORIES);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("work");
  const [priority, setPriority] = useState<"low" | "medium" | "high">("medium");
  const [dueDate, setDueDate] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<"all" | "todo" | "in-progress" | "done">("all");
  const [filterCategory, setFilterCategory] = useState("all");
  const [filterPriority, setFilterPriority] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<"created" | "dueDate" | "priority">("created");
  const [loading, setLoading] = useState(true);
  const [bulkSelectMode, setBulkSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  function toggleBulkSelectMode() {
    setBulkSelectMode((prev) => {
      const next = !prev;
      if (!next) setSelectedIds(new Set());
      return next;
    });
  }

  function toggleSelected(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function clearSelection() {
    setSelectedIds(new Set());
  }

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    try {
      const [loadedTasks, loadedCats] = await Promise.all([db.getTasks(), db.getCategories()]);
      setTasks(loadedTasks);
      if (loadedCats.length === 0) {
        for (const cat of DEFAULT_CATEGORIES) await db.addCategory(cat);
      } else {
        setCategories(loadedCats);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  async function handleSave() {
    if (!title.trim()) return;
    const now = new Date().toISOString();
    const existing = editingId ? tasks.find((t) => t.id === editingId) : null;
    const task: Task = {
      id: editingId || Date.now().toString(),
      title: title.trim(),
      description: description.trim() || undefined,
      category,
      priority,
      status: existing?.status ?? "todo",
      dueDate: dueDate || undefined,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      completedAt: existing?.completedAt,
    };
    try {
      if (editingId) {
        await db.updateTask(task);
        setTasks((prev) => prev.map((t) => (t.id === editingId ? task : t)));
      } else {
        await db.addTask(task);
        setTasks((prev) => [...prev, task]);
      }
      resetForm();
    } catch (e) { console.error(e); }
  }

  async function handleDelete(id: string) {
    try {
      await db.deleteTask(id);
      setTasks((prev) => prev.filter((t) => t.id !== id));
    } catch (e) { console.error(e); }
  }

  async function handleBulkDelete() {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    try {
      await Promise.all(ids.map((id) => db.deleteTask(id)));
      setTasks((prev) => prev.filter((t) => !selectedIds.has(t.id)));
      clearSelection();
    } catch (e) { console.error(e); }
  }

  function handleEdit(task: Task) {
    setTitle(task.title);
    setDescription(task.description || "");
    setCategory(task.category);
    setPriority(task.priority);
    setDueDate(task.dueDate || "");
    setEditingId(task.id);
  }

  function resetForm() {
    setTitle(""); setDescription(""); setCategory("work");
    setPriority("medium"); setDueDate(""); setEditingId(null);
  }

  async function cycleStatus(task: Task) {
    const next: Record<string, Task["status"]> = { todo: "in-progress", "in-progress": "done", done: "todo" };
    const updated: Task = {
      ...task,
      status: next[task.status],
      completedAt: next[task.status] === "done" ? new Date().toISOString() : undefined,
      updatedAt: new Date().toISOString(),
    };
    try {
      await db.updateTask(updated);
      setTasks((prev) => prev.map((t) => (t.id === task.id ? updated : t)));
    } catch (e) { console.error(e); }
  }

  const filtered = tasks
    .filter((t) => {
      if (filterStatus !== "all" && t.status !== filterStatus) return false;
      if (filterCategory !== "all" && t.category !== filterCategory) return false;
      if (filterPriority !== "all" && t.priority !== filterPriority) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        if (!t.title.toLowerCase().includes(q) && !t.description?.toLowerCase().includes(q)) return false;
      }
      return true;
    })
    .sort((a, b) => {
      if (sortBy === "dueDate") {
        if (!a.dueDate) return 1;
        if (!b.dueDate) return -1;
        return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
      }
      if (sortBy === "priority") {
        return ({ high: 0, medium: 1, low: 2 }[a.priority]) - ({ high: 0, medium: 1, low: 2 }[b.priority]);
      }
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

  const stats = {
    total: tasks.length,
    todo: tasks.filter((t) => t.status === "todo").length,
    inProgress: tasks.filter((t) => t.status === "in-progress").length,
    done: tasks.filter((t) => t.status === "done").length,
  };

  const categoryName = (id: string) => categories.find((c) => c.id === id)?.name ?? id;

  if (loading) {
    return (
      <MainLayout>
        <div style={{ color: "var(--text-muted)", padding: "3rem", textAlign: "center" }}>Loading…</div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="animate-fade-in" style={{ display: "flex", flexDirection: "column", gap: "2rem" }}>

        {/* Header */}
        <div>
          <h1>Tasks</h1>
          <p style={{ marginTop: "0.25rem", color: "var(--text-muted)", fontSize: "0.875rem" }}>
            Organize and track your work
          </p>
        </div>

        {/* Stats */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "1rem" }}>
          {[
            { label: "Total",       value: stats.total,     color: "var(--accent-gold)" },
            { label: "To Do",       value: stats.todo,      color: "#93c5fd" },
            { label: "In Progress", value: stats.inProgress, color: "#fcd34d" },
            { label: "Done",        value: stats.done,      color: "#6ee7b7" },
          ].map((s) => (
            <div key={s.label} className="stat-card">
              <div className="stat-value" style={{ color: s.color }}>{s.value}</div>
              <div className="stat-label">{s.label}</div>
            </div>
          ))}
        </div>

        {/* Form */}
        <div className="glass" style={{ padding: "1.5rem" }}>
          <h2 style={{ marginBottom: "1.25rem" }}>
            {editingId ? "Edit Task" : "New Task"}
          </h2>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
            <input
              className="input"
              type="text"
              placeholder="Task title…"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSave()}
            />
            <textarea
              className="input"
              placeholder="Description (optional)"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              style={{ resize: "vertical" }}
            />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr auto", gap: "0.75rem" }}>
              <select className="input" value={category} onChange={(e) => setCategory(e.target.value)}>
                {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <select className="input" value={priority} onChange={(e) => setPriority(e.target.value as "low" | "medium" | "high")}>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
              <input className="input" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
              <button className="btn btn-primary" onClick={handleSave}>
                {editingId ? "Update" : "Add"}
              </button>
            </div>
            {editingId && (
              <button className="btn btn-muted" onClick={resetForm} style={{ width: "100%" }}>
                Cancel
              </button>
            )}
          </div>
        </div>

        {/* Filters */}
        <div className="glass" style={{ padding: "1.25rem" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
            <input
              className="input"
              type="text"
              placeholder="Search tasks…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "0.75rem" }}>
              <select className="input" value={filterStatus} onChange={(e) => setFilterStatus(e.target.value as any)}>
                <option value="all">All Status</option>
                <option value="todo">To Do</option>
                <option value="in-progress">In Progress</option>
                <option value="done">Done</option>
              </select>
              <select className="input" value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)}>
                <option value="all">All Categories</option>
                {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <select className="input" value={filterPriority} onChange={(e) => setFilterPriority(e.target.value)}>
                <option value="all">All Priorities</option>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
              <select className="input" value={sortBy} onChange={(e) => setSortBy(e.target.value as any)}>
                <option value="created">Newest first</option>
                <option value="dueDate">Due date</option>
                <option value="priority">Priority</option>
              </select>
            </div>
          </div>
        </div>

        {/* Task list */}
        <div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.875rem", gap: "0.75rem", flexWrap: "wrap" }}>
            <h2>{filtered.length} {filtered.length === 1 ? "Task" : "Tasks"}</h2>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              {bulkSelectMode && (
                <>
                  <span style={{ color: "var(--text-muted)", fontSize: "0.875rem" }}>
                    {selectedIds.size} selected
                  </span>
                  <button
                    className="btn btn-danger btn-sm"
                    onClick={handleBulkDelete}
                    disabled={selectedIds.size === 0}
                  >
                    Delete selected
                  </button>
                  <button className="btn btn-muted btn-sm" onClick={toggleBulkSelectMode}>
                    Cancel
                  </button>
                </>
              )}
              {!bulkSelectMode && (
                <button className="btn btn-ghost btn-sm" onClick={toggleBulkSelectMode}>
                  Bulk select
                </button>
              )}
            </div>
          </div>

          {filtered.length === 0 ? (
            <div className="card" style={{ textAlign: "center", padding: "3rem", color: "var(--text-muted)" }}>
              {tasks.length === 0 ? "No tasks yet. Create your first one above." : "No tasks match your filters."}
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
              {filtered.map((task, idx) => (
                <TaskCard
                  key={task.id}
                  task={task}
                  index={idx}
                  categoryName={categoryName(task.category)}
                  bulkSelectMode={bulkSelectMode}
                  selected={selectedIds.has(task.id)}
                  onToggleSelected={toggleSelected}
                  onCycleStatus={cycleStatus}
                  onEdit={handleEdit}
                  onDelete={handleDelete}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </MainLayout>
  );
}
