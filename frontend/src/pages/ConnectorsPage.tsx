import { useState } from "react";
import { MoreHorizontal, Plus } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/components/ui/toast";
import { ConnectorForm } from "@/components/connectors/ConnectorForm";
import {
  useConnectors,
  useTestConnector,
  useDeleteConnector,
} from "@/api/connectors";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import type { Connector } from "@/types/connector";

export function ConnectorsPage() {
  useDocumentTitle("Connectors — Data Builder");
  const { data: connectors, isLoading, error } = useConnectors();
  const testMutation = useTestConnector();
  const deleteMutation = useDeleteConnector();
  const { toast } = useToast();
  const [formOpen, setFormOpen] = useState(false);
  const [editConnector, setEditConnector] = useState<Connector | null>(null);

  const handleTest = (id: string) => {
    testMutation.mutate(id, {
      onSuccess: (result) =>
        toast(
          result.success
            ? `Connected successfully (${result.latency_ms}ms)`
            : `Connection failed: ${result.message}`,
          result.success ? "success" : "error",
        ),
      onError: () => toast("Test failed", "error"),
    });
  };

  const handleDelete = (connector: Connector) => {
    if (!window.confirm(`Delete connector "${connector.name}"? This cannot be undone.`)) return;
    deleteMutation.mutate(connector.id, {
      onSuccess: () => toast("Connector deleted", "success"),
      onError: () => toast("Delete failed", "error"),
    });
  };

  const handleEdit = (connector: Connector) => {
    setEditConnector(connector);
    setFormOpen(true);
  };

  const columns: DataTableColumn<Connector>[] = [
    {
      key: "name",
      header: "Name",
      cell: (r) => <span className="font-medium text-foreground">{r.name}</span>,
      sortable: true,
    },
    {
      key: "connector_type",
      header: "Type",
      cell: (r) => <Badge variant="outline">{r.connector_type}</Badge>,
      width: "w-32",
    },
    {
      key: "test_status",
      header: "Status",
      cell: (r) => (
        <span className="inline-flex items-center gap-2 text-[12px] text-muted-foreground">
          <span
            className="h-2 w-2 rounded-full"
            style={{
              background:
                r.test_status === "success"
                  ? "var(--color-status-success)"
                  : r.test_status === "failed"
                  ? "var(--color-status-error)"
                  : "var(--color-text-muted)",
            }}
          />
          {r.test_status ?? "untested"}
        </span>
      ),
      width: "w-40",
    },
    {
      key: "last_tested_at",
      header: "Last tested",
      cell: (r) =>
        r.last_tested_at ? (
          <span className="font-mono text-[12px] text-muted-foreground tabular-nums">
            {new Date(r.last_tested_at).toLocaleString()}
          </span>
        ) : (
          "—"
        ),
      width: "w-48",
    },
    {
      key: "actions",
      header: "",
      cell: (r) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" aria-label="Actions">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => handleTest(r.id)}>
              Test connection
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => handleEdit(r)}>Edit</DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() => handleDelete(r)}
              className="text-[var(--color-status-error)]"
            >
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
      width: "w-16",
      align: "right",
    },
  ];

  return (
    <>
      <PageHeader
        title="Connectors"
        description="Manage your database connections. Add connectors to browse catalogs and build pipelines."
        actions={
          <Button onClick={() => setFormOpen(true)}>
            <Plus className="h-3.5 w-3.5" /> Add Connector
          </Button>
        }
      />
      <DataTable
        columns={columns}
        rows={connectors}
        getRowId={(r) => r.id}
        loading={isLoading}
        error={error ? String(error) : null}
      />

      <ConnectorForm
        open={formOpen}
        onOpenChange={(v) => {
          setFormOpen(v);
          if (!v) setEditConnector(null);
        }}
        editConnector={editConnector}
      />
    </>
  );
}
