import * as React from "react";
import { ChevronDown, ChevronUp, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";

export interface DataTableColumn<T> {
  /** Unique key; also used as the sort key */
  key: string;
  /** Display label */
  header: React.ReactNode;
  /** Cell renderer */
  cell: (row: T) => React.ReactNode;
  /** Enable sorting by this column's `key` */
  sortable?: boolean;
  /** Optional Tailwind width class, e.g. "w-32" */
  width?: string;
  /** Right-align numeric columns */
  align?: "left" | "right";
}

type SortState = { key: string; dir: "asc" | "desc" } | null;

export interface DataTableProps<T> {
  columns: DataTableColumn<T>[];
  rows: T[] | undefined;
  /** Stable key per row (e.g. row.id) */
  getRowId: (row: T) => string;
  loading?: boolean;
  error?: string | null;
  /** Empty state when rows is [] and !loading */
  empty?: React.ReactNode;
  /** Invoked on row click (optional) */
  onRowClick?: (row: T) => void;
  /** Custom sort comparator — defaults to string compare on row[key] */
  getSortValue?: (row: T, key: string) => string | number;
  className?: string;
}

/**
 * Generic sortable table with loading/empty/error states.
 *
 * When `onRowClick` is provided, rows are keyboard-activatable (Enter/Space).
 * Interactive cell content (e.g. DropdownMenu triggers) must call
 * `e.stopPropagation()` in its handlers to prevent row-click firing.
 */
export function DataTable<T>({
  columns,
  rows,
  getRowId,
  loading,
  error,
  empty,
  onRowClick,
  getSortValue,
  className,
}: DataTableProps<T>) {
  const [sort, setSort] = React.useState<SortState>(null);

  React.useEffect(() => {
    if (sort && !columns.some((c) => c.key === sort.key)) setSort(null);
  }, [columns, sort]);

  const sortedRows = React.useMemo(() => {
    if (!rows || !sort) return rows;
    const defaultGet = (row: T, key: string) =>
      (row as unknown as Record<string, string | number | null | undefined>)[key] ?? null;
    const getVal = getSortValue ?? defaultGet;

    const cmp = (a: unknown, b: unknown): number => {
      const aNull = a === "" || a == null;
      const bNull = b === "" || b == null;
      if (aNull && bNull) return 0;
      if (aNull) return 1;
      if (bNull) return -1;
      if (typeof a === "number" && typeof b === "number") return a - b;
      return String(a).localeCompare(String(b));
    };

    return [...rows].sort((a, b) => {
      const result = cmp(getVal(a, sort.key), getVal(b, sort.key));
      return sort.dir === "asc" ? result : -result;
    });
  }, [rows, sort, getSortValue]);

  const handleSort = (key: string) => {
    setSort((prev) => {
      if (!prev || prev.key !== key) return { key, dir: "asc" };
      if (prev.dir === "asc") return { key, dir: "desc" };
      return null;
    });
  };

  if (loading) {
    return (
      <div className={cn("rounded-md border border-border bg-card", className)}>
        <div className="border-b border-border bg-muted px-3 py-2">
          <Skeleton className="h-4 w-32" />
        </div>
        <div className="divide-y divide-border">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="px-3 py-3">
              <Skeleton className="h-4 w-full" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div
        className={cn(
          "rounded-md border border-[var(--color-status-error)]/30 bg-[var(--color-status-error-faint)] p-4 text-sm text-[var(--color-status-error)]",
          className,
        )}
        role="alert"
      >
        {error}
      </div>
    );
  }

  if (!rows || rows.length === 0) {
    if (empty) return <>{empty}</>;
    return (
      <EmptyState
        title="No data"
        body="Nothing to show yet."
        className={className}
      />
    );
  }

  return (
    <div className={cn("overflow-hidden rounded-md border border-border bg-card", className)}>
      <table className="w-full border-collapse text-sm">
        <thead className="border-b border-border bg-muted text-left">
          <tr>
            {columns.map((col) => {
              const active = sort?.key === col.key;
              const SortIcon = active
                ? sort?.dir === "asc"
                  ? ChevronUp
                  : ChevronDown
                : ChevronsUpDown;
              return (
                <th
                  key={col.key}
                  aria-sort={
                    col.sortable
                      ? active
                        ? sort?.dir === "asc"
                          ? "ascending"
                          : "descending"
                        : "none"
                      : undefined
                  }
                  className={cn(
                    "px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground",
                    col.width,
                    col.align === "right" && "text-right",
                  )}
                >
                  {col.sortable ? (
                    <button
                      type="button"
                      onClick={() => handleSort(col.key)}
                      aria-label={`Sort by ${typeof col.header === "string" ? col.header : col.key}, ${active && sort?.dir === "asc" ? "descending" : "ascending"}`}
                      className="inline-flex items-center gap-1 rounded-sm transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:text-foreground"
                    >
                      {col.header}
                      <SortIcon className="h-3 w-3" />
                    </button>
                  ) : (
                    col.header
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {(sortedRows ?? rows).map((row) => (
            <tr
              key={getRowId(row)}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              onKeyDown={
                onRowClick
                  ? (e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        onRowClick(row);
                      }
                    }
                  : undefined
              }
              role={onRowClick ? "button" : undefined}
              tabIndex={onRowClick ? 0 : undefined}
              className={cn(
                "transition-colors",
                onRowClick &&
                  "cursor-pointer hover:bg-muted/50 focus-visible:outline-none focus-visible:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
              )}
            >
              {columns.map((col) => (
                <td
                  key={col.key}
                  className={cn(
                    "px-3 py-2.5 align-middle text-foreground",
                    col.align === "right" && "text-right",
                  )}
                >
                  {col.cell(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
