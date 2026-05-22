"use client";

export interface BulkActionToolbarProps {
  bulkSelectMode: boolean;
  selectedCount: number;
  onToggle: () => void;
  onDeleteSelected: () => void;
}

export function BulkActionToolbar({
  bulkSelectMode,
  selectedCount,
  onToggle,
  onDeleteSelected,
}: BulkActionToolbarProps) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "0.5rem",
        flexWrap: "wrap",
      }}
    >
      <button
        type="button"
        className={bulkSelectMode ? "btn btn-primary btn-sm" : "btn btn-ghost btn-sm"}
        onClick={onToggle}
      >
        {bulkSelectMode ? "Cancel" : "Select"}
      </button>
      {bulkSelectMode && (
        <>
          <span style={{ color: "var(--text-muted)", fontSize: "0.8125rem" }}>
            {selectedCount} selected
          </span>
          <button
            type="button"
            className="btn btn-danger btn-sm"
            onClick={onDeleteSelected}
            disabled={selectedCount === 0}
          >
            Delete selected
          </button>
        </>
      )}
    </div>
  );
}
