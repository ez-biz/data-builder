import { useState, useEffect, useId } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  useCreateConnector,
  useUpdateConnector,
  useTestConnector,
} from "@/api/connectors";
import type { Connector, ConnectorType } from "@/types/connector";
import { CheckCircle2, XCircle, Loader2 } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editConnector?: Connector | null;
}

const defaultPostgres = {
  host: "",
  port: "5432",
  database: "",
  username: "",
  password: "",
  ssl_mode: "prefer",
};

const defaultDatabricks = {
  server_hostname: "",
  http_path: "",
  access_token: "",
  catalog: "main",
};

export function ConnectorForm({ open, onOpenChange, editConnector }: Props) {
  const formId = useId();
  const [name, setName] = useState("");
  const [type, setType] = useState<ConnectorType>("postgresql");
  const [pgConfig, setPgConfig] = useState(defaultPostgres);
  const [dbConfig, setDbConfig] = useState(defaultDatabricks);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    message: string;
  } | null>(null);
  const [saved, setSaved] = useState(false);

  const isEdit = !!editConnector;
  const createMutation = useCreateConnector();
  const updateMutation = useUpdateConnector();
  const testMutation = useTestConnector();

  // Populate form when editing
  useEffect(() => {
    if (editConnector) {
      setName(editConnector.name);
      setType(editConnector.connector_type);
      setSaved(false);
      setTestResult(null);
    }
  }, [editConnector]);

  const resetForm = () => {
    setName("");
    setType("postgresql");
    setPgConfig(defaultPostgres);
    setDbConfig(defaultDatabricks);
    setTestResult(null);
    setSaved(false);
  };

  const handleClose = () => {
    onOpenChange(false);
    resetForm();
  };

  const getConfig = () => {
    if (type === "postgresql") {
      return { ...pgConfig, port: parseInt(pgConfig.port, 10) };
    }
    return dbConfig;
  };

  const handleSubmit = async () => {
    if (isEdit) {
      await updateMutation.mutateAsync({
        id: editConnector.id,
        payload: { name, connection_config: getConfig() },
      });
      try {
        const result = await testMutation.mutateAsync(editConnector.id);
        setTestResult(result);
      } catch {
        // Test is optional
      }
    } else {
      const connector = await createMutation.mutateAsync({
        name,
        connector_type: type,
        connection_config: getConfig(),
      });
      try {
        const result = await testMutation.mutateAsync(connector.id);
        setTestResult(result);
      } catch {
        // Test is optional
      }
    }
    setSaved(true);
  };

  const isPending = createMutation.isPending || updateMutation.isPending || testMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Connector" : "Add Connector"}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Update your connector settings and re-test the connection."
              : "Connect to a database to browse its catalog and build pipelines."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <label htmlFor={`${formId}-name`} className="text-sm font-medium">Name</label>
            <Input
              id={`${formId}-name`}
              placeholder="My Database"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={saved}
            />
          </div>

          <div>
            <label htmlFor={`${formId}-type`} className="text-sm font-medium">Type</label>
            <Select
              value={type}
              onValueChange={(v) => setType(v as ConnectorType)}
              disabled={isEdit || saved}
            >
              <SelectTrigger id={`${formId}-type`}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="postgresql">PostgreSQL</SelectItem>
                <SelectItem value="databricks">Databricks</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {type === "postgresql" ? (
            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-2">
                <div className="col-span-2">
                  <label htmlFor={`${formId}-host`} className="text-xs text-muted-foreground">Host</label>
                  <Input
                    id={`${formId}-host`}
                    placeholder="localhost"
                    value={pgConfig.host}
                    onChange={(e) =>
                      setPgConfig({ ...pgConfig, host: e.target.value })
                    }
                    disabled={saved}
                  />
                </div>
                <div>
                  <label htmlFor={`${formId}-port`} className="text-xs text-muted-foreground">Port</label>
                  <Input
                    id={`${formId}-port`}
                    placeholder="5432"
                    value={pgConfig.port}
                    onChange={(e) =>
                      setPgConfig({ ...pgConfig, port: e.target.value })
                    }
                    disabled={saved}
                  />
                </div>
              </div>
              <div>
                <label htmlFor={`${formId}-database`} className="text-xs text-muted-foreground">Database</label>
                <Input
                  id={`${formId}-database`}
                  placeholder="mydb"
                  value={pgConfig.database}
                  onChange={(e) =>
                    setPgConfig({ ...pgConfig, database: e.target.value })
                  }
                  disabled={saved}
                />
              </div>
              <div>
                <label htmlFor={`${formId}-username`} className="text-xs text-muted-foreground">Username</label>
                <Input
                  id={`${formId}-username`}
                  placeholder="postgres"
                  value={pgConfig.username}
                  onChange={(e) =>
                    setPgConfig({ ...pgConfig, username: e.target.value })
                  }
                  disabled={saved}
                />
              </div>
              <div>
                <label htmlFor={`${formId}-password`} className="text-xs text-muted-foreground">Password</label>
                <Input
                  id={`${formId}-password`}
                  type="password"
                  value={pgConfig.password}
                  onChange={(e) =>
                    setPgConfig({ ...pgConfig, password: e.target.value })
                  }
                  disabled={saved}
                />
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div>
                <label htmlFor={`${formId}-hostname`} className="text-xs text-muted-foreground">
                  Server Hostname
                </label>
                <Input
                  id={`${formId}-hostname`}
                  placeholder="adb-xxx.azuredatabricks.net"
                  value={dbConfig.server_hostname}
                  onChange={(e) =>
                    setDbConfig({
                      ...dbConfig,
                      server_hostname: e.target.value,
                    })
                  }
                  disabled={saved}
                />
              </div>
              <div>
                <label htmlFor={`${formId}-http-path`} className="text-xs text-muted-foreground">HTTP Path</label>
                <Input
                  id={`${formId}-http-path`}
                  placeholder="/sql/1.0/warehouses/xxx"
                  value={dbConfig.http_path}
                  onChange={(e) =>
                    setDbConfig({ ...dbConfig, http_path: e.target.value })
                  }
                  disabled={saved}
                />
              </div>
              <div>
                <label htmlFor={`${formId}-token`} className="text-xs text-muted-foreground">
                  Access Token
                </label>
                <Input
                  id={`${formId}-token`}
                  type="password"
                  value={dbConfig.access_token}
                  onChange={(e) =>
                    setDbConfig({ ...dbConfig, access_token: e.target.value })
                  }
                  disabled={saved}
                />
              </div>
              <div>
                <label htmlFor={`${formId}-catalog`} className="text-xs text-muted-foreground">Catalog</label>
                <Input
                  id={`${formId}-catalog`}
                  placeholder="main"
                  value={dbConfig.catalog}
                  onChange={(e) =>
                    setDbConfig({ ...dbConfig, catalog: e.target.value })
                  }
                  disabled={saved}
                />
              </div>
            </div>
          )}

          {testResult && (
            <div
              role="alert"
              className={`flex items-center gap-2 rounded-md p-3 text-sm ${
                testResult.success
                  ? "bg-green-50 text-green-800"
                  : "bg-red-50 text-red-800"
              }`}
            >
              {testResult.success ? (
                <CheckCircle2 className="h-4 w-4" />
              ) : (
                <XCircle className="h-4 w-4" />
              )}
              {testResult.message}
            </div>
          )}

          <div className="flex justify-end gap-2">
            {saved ? (
              <Button onClick={handleClose}>Done</Button>
            ) : (
              <>
                <Button variant="outline" onClick={handleClose}>
                  Cancel
                </Button>
                <Button
                  onClick={handleSubmit}
                  disabled={!name || isPending}
                >
                  {isPending && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  {isEdit ? "Save & Test" : "Create & Test"}
                </Button>
              </>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
