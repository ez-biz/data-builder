import { useState } from "react";
import { Plus, Trash2, Zap, Pencil, Database, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";
import { ConnectorForm } from "@/components/connectors/ConnectorForm";
import {
  useConnectors,
  useDeleteConnector,
  useTestConnector,
} from "@/api/connectors";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";

import type { Connector } from "@/types/connector";

export function ConnectorsPage() {
  useDocumentTitle("Connectors");
  const [formOpen, setFormOpen] = useState(false);
  const [editConnector, setEditConnector] = useState<Connector | null>(null);
  const { data: connectors, isLoading } = useConnectors();
  const { toast } = useToast();
  const deleteMutation = useDeleteConnector();
  const testMutation = useTestConnector();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-muted-foreground">
          Manage your database connections. Add connectors to browse catalogs
          and build pipelines.
        </p>
        <Button onClick={() => setFormOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Add Connector
        </Button>
      </div>

      {connectors && connectors.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Database className="mb-4 h-12 w-12 text-muted-foreground" />
            <p className="mb-2 text-lg font-medium">No connectors yet</p>
            <p className="mb-4 text-sm text-muted-foreground">
              Add your first database connector to get started.
            </p>
            <Button onClick={() => setFormOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Add Connector
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {connectors?.map((connector) => (
            <Card key={connector.id}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-base">{connector.name}</CardTitle>
                <Badge variant="secondary">
                  {connector.connector_type}
                </Badge>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <span>Status:</span>
                  <Badge
                    variant={
                      connector.test_status === "success"
                        ? "success"
                        : connector.test_status === "failed"
                          ? "destructive"
                          : "outline"
                    }
                  >
                    {connector.test_status || "untested"}
                  </Badge>
                </div>
                {connector.last_tested_at && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Last tested:{" "}
                    {new Date(connector.last_tested_at).toLocaleString()}
                  </p>
                )}
                <div className="mt-4 flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      testMutation.mutate(connector.id, {
                        onSuccess: (result) =>
                          toast(
                            result.success
                              ? `Connected successfully (${result.latency_ms}ms)`
                              : `Connection failed: ${result.message}`,
                            result.success ? "success" : "error",
                          ),
                        onError: () => toast("Test failed", "error"),
                      })
                    }
                    disabled={testMutation.isPending}
                  >
                    <Zap className="mr-1 h-3 w-3" />
                    Test
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setEditConnector(connector);
                      setFormOpen(true);
                    }}
                  >
                    <Pencil className="mr-1 h-3 w-3" />
                    Edit
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-destructive"
                    onClick={() => {
                      if (!window.confirm(`Delete connector "${connector.name}"? This cannot be undone.`)) return;
                      deleteMutation.mutate(connector.id, {
                        onSuccess: () => toast("Connector deleted", "success"),
                        onError: () => toast("Delete failed", "error"),
                      });
                    }}
                  >
                    <Trash2 className="mr-1 h-3 w-3" />
                    Delete
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <ConnectorForm
        open={formOpen}
        onOpenChange={(v) => {
          setFormOpen(v);
          if (!v) setEditConnector(null);
        }}
        editConnector={editConnector}
      />
    </div>
  );
}
