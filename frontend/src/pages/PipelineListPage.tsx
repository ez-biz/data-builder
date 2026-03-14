import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Plus, Trash2, GitBranch, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { usePipelines, useCreatePipeline, useDeletePipeline } from "@/api/pipelines";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";

const statusColors: Record<string, "default" | "success" | "destructive" | "warning" | "secondary" | "outline"> = {
  draft: "secondary",
  valid: "success",
  invalid: "destructive",
  running: "warning",
  completed: "success",
  failed: "destructive",
};

export function PipelineListPage() {
  useDocumentTitle("Pipelines");
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const navigate = useNavigate();
  const { data: pipelines, isLoading } = usePipelines();
  const createMutation = useCreatePipeline();
  const deleteMutation = useDeletePipeline();

  const handleCreate = async () => {
    const pipeline = await createMutation.mutateAsync({ name: newName });
    setCreateOpen(false);
    setNewName("");
    navigate(`/pipelines/${pipeline.id}`);
  };

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
          Create and manage your ETL pipelines.
        </p>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          New Pipeline
        </Button>
      </div>

      {pipelines && pipelines.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <GitBranch className="mb-4 h-12 w-12 text-muted-foreground" />
            <p className="mb-2 text-lg font-medium">No pipelines yet</p>
            <p className="mb-4 text-sm text-muted-foreground">
              Create your first ETL pipeline with drag & drop.
            </p>
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              New Pipeline
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {pipelines?.map((pipeline) => (
            <Link key={pipeline.id} to={`/pipelines/${pipeline.id}`}>
              <Card className="hover:shadow-md transition-shadow cursor-pointer">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold">{pipeline.name}</h3>
                    <Badge variant={statusColors[pipeline.status]}>
                      {pipeline.status}
                    </Badge>
                  </div>
                  {pipeline.description && (
                    <p className="mt-1 text-sm text-muted-foreground line-clamp-2">
                      {pipeline.description}
                    </p>
                  )}
                  <div className="mt-3 flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">
                      Updated {new Date(pipeline.updated_at).toLocaleDateString()}
                    </span>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-destructive h-7"
                      aria-label={`Delete ${pipeline.name}`}
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        deleteMutation.mutate(pipeline.id);
                      }}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>New Pipeline</DialogTitle>
            <DialogDescription>Give your pipeline a name to get started.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <Input
              placeholder="Pipeline name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && newName && handleCreate()}
            />
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setCreateOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleCreate}
                disabled={!newName || createMutation.isPending}
              >
                Create
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
