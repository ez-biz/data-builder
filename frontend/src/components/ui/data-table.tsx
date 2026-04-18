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

  const sortedRows = React.useMemo(() => {
    if (!rows || !sort) return rows;
    const defaultGet = (row: T, key: string) =>
      (row as unknown as Record<string, string | number | null | undefined>)[key] ?? "";
    const getVal = getSortValue ?? defaultGet;
    return [...rows].sort((a, b) => {
      const av = getVal(a, sort.key);
      const bv = getVal(b, sort.key);
      if (av < bv) return sort.dir === "asc" ? -1 : 1;
      if (av > bv) return sort.dir === "asc" ? 1 : -1;
      return 0;
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
                      className="inline-flex items-center gap-1 transition-colors hover:text-foreground focus-visible:outline-none focus-visible:text-foreground"
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
          {sortedRows!.map((row) => (
            <tr
              key={getRowId(row)}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              className={cn(
                "transition-colors",
                onRowClick && "cursor-pointer hover:bg-muted/50",
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
