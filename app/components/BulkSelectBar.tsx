"use client";

export interface BulkSelectBarProps {
  selectedCount: number;
  allVisibleSelected: boolean;
  onSelectAll: () => void;
  onClearSelection: () => void;
  onDeleteSelected: () => void;
}

export function BulkSelectBar({
  selectedCount,
  allVisibleSelected,
  onSelectAll,
  onClearSelection,
  onDeleteSelected,
}: BulkSelectBarProps) {
  return (
    <div
      className="glass"
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "0.75rem 1rem",
        marginBottom: "0.875rem",
        gap: "0.75rem",
      }}
    >
      <div style={{ fontSize: "0.875rem", color: "var(--text-muted)" }}>
        {selectedCount} selected
      </div>
      <div style={{ display: "flex", gap: "0.375rem" }}>
        <button
          className="btn btn-ghost btn-sm"
          onClick={allVisibleSelected ? onClearSelection : onSelectAll}
        >
          {allVisibleSelected ? "Clear selection" : "Select all"}
        </button>
        <button
          className="btn btn-danger btn-sm"
          onClick={onDeleteSelected}
          disabled={selectedCount === 0}
        >
          Delete selected
        </button>
      </div>
    </div>
  );
}
