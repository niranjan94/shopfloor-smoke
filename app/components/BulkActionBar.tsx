"use client";

export function BulkActionBar({
  count,
  onDeleteSelected,
  onCancel,
}: {
  count: number;
  onDeleteSelected: () => void;
  onCancel: () => void;
}) {
  return (
    <div
      className="glass"
      style={{
        padding: "0.75rem 1rem",
        marginBottom: "0.875rem",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: "0.75rem",
      }}
    >
      <div style={{ color: "var(--text-primary)", fontSize: "0.875rem" }}>
        Selected: {count}
      </div>
      <div style={{ display: "flex", gap: "0.375rem" }}>
        <button
          className="btn btn-danger btn-sm"
          onClick={onDeleteSelected}
          disabled={count === 0}
        >
          Delete selected
        </button>
        <button className="btn btn-ghost btn-sm" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}
