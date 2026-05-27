"use client";

import { Task } from "../types";

export interface TaskCardProps {
  task: Task;
  index: number;
  categoryName: string;
  bulkSelectMode: boolean;
  selected: boolean;
  onToggleSelected: (id: string) => void;
  onCycleStatus: (task: Task) => void;
  onEdit: (task: Task) => void;
  onDelete: (id: string) => void;
}

function priorityClass(p: string) {
  if (p === "high") return "task-card task-card-high";
  if (p === "medium") return "task-card task-card-medium";
  return "task-card task-card-low";
}

function statusBadgeClass(s: string) {
  if (s === "todo") return "badge badge-todo";
  if (s === "in-progress") return "badge badge-doing";
  return "badge badge-done";
}

function statusLabel(s: string) {
  if (s === "todo") return "To Do";
  if (s === "in-progress") return "In Progress";
  return "Done";
}

export function TaskCard({
  task,
  index,
  categoryName,
  bulkSelectMode,
  selected,
  onToggleSelected,
  onCycleStatus,
  onEdit,
  onDelete,
}: TaskCardProps) {
  return (
    <div
      className={priorityClass(task.priority)}
      style={{ animation: `slideInUp 350ms ease-out ${index * 30}ms both` }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", gap: "0.875rem" }}>
        {bulkSelectMode && (
          <input
            type="checkbox"
            checked={selected}
            onChange={() => onToggleSelected(task.id)}
            aria-label={`Select task ${task.title}`}
            style={{ flexShrink: 0, marginTop: "4px", width: 18, height: 18, cursor: "pointer" }}
          />
        )}
        <button
          onClick={() => onCycleStatus(task)}
          title={`Status: ${statusLabel(task.status)} — click to advance`}
          style={{
            flexShrink: 0,
            marginTop: "2px",
            width: 22,
            height: 22,
            borderRadius: "50%",
            border: `2px solid ${task.status === "done" ? "var(--accent-gold)" : task.status === "in-progress" ? "#fcd34d" : "var(--border-hover)"}`,
            background: task.status === "done" ? "var(--accent-gold)" : task.status === "in-progress" ? "rgba(252, 211, 77, 0.15)" : "transparent",
            color: task.status === "done" ? "#0c1524" : "transparent",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: "0.7rem",
            fontWeight: 700,
            transition: "all 150ms ease",
          }}
        >
          {task.status === "done" ? "✓" : task.status === "in-progress" ? "●" : ""}
        </button>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontWeight: 600,
            color: task.status === "done" ? "var(--text-muted)" : "var(--text-primary)",
            textDecoration: task.status === "done" ? "line-through" : "none",
            marginBottom: task.description ? "0.25rem" : "0.5rem",
          }}>
            {task.title}
          </div>
          {task.description && (
            <div style={{
              fontSize: "0.8125rem",
              color: "var(--text-muted)",
              marginBottom: "0.5rem",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}>
              {task.description}
            </div>
          )}
          <div style={{ display: "flex", gap: "0.375rem", flexWrap: "wrap" }}>
            <span className="badge badge-category">{categoryName}</span>
            <span className={statusBadgeClass(task.status)}>{statusLabel(task.status)}</span>
            <span className={`badge badge-${task.priority}`}>
              {task.priority.charAt(0).toUpperCase() + task.priority.slice(1)}
            </span>
            {task.dueDate && (
              <span className="badge" style={{ background: "rgba(77, 184, 168, 0.12)", color: "var(--accent-teal)" }}>
                {new Date(task.dueDate + "T00:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric" })}
              </span>
            )}
          </div>
        </div>

        <div style={{ display: "flex", gap: "0.375rem", flexShrink: 0 }}>
          <button className="btn btn-ghost btn-sm" onClick={() => onEdit(task)}>
            Edit
          </button>
          <button className="btn btn-danger btn-sm" onClick={() => onDelete(task.id)}>
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}
