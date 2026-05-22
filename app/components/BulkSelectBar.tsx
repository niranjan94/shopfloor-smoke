"use client";

interface BulkSelectBarProps {
  bulkMode: boolean;
  selectedCount: number;
  onToggleMode: () => void;
  onDeleteSelected: () => void;
}

export function BulkSelectBar({
  bulkMode,
  selectedCount,
  onToggleMode,
  onDeleteSelected,
}: BulkSelectBarProps) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
      {bulkMode && (
        <>
          <span style={{ color: "var(--text-muted)", fontSize: "0.8125rem" }}>
            {selectedCount} selected
          </span>
          <button
            className="btn btn-danger btn-sm"
            onClick={onDeleteSelected}
            disabled={selectedCount === 0}
          >
            Delete selected
          </button>
        </>
      )}
      <button
        className={bulkMode ? "btn btn-muted btn-sm" : "btn btn-ghost btn-sm"}
        onClick={onToggleMode}
      >
        {bulkMode ? "Cancel" : "Select"}
      </button>
    </div>
  );
}
