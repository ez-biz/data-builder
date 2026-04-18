import { useCallback, useRef, useMemo } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  type Node,
  useReactFlow,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import { usePipelineStore } from "@/stores/pipeline-store";
import { SourceNode } from "./nodes/SourceNode";
import { FilterNode } from "./nodes/FilterNode";
import { TransformNode } from "./nodes/TransformNode";
import { JoinNode } from "./nodes/JoinNode";
import { AggregateNode } from "./nodes/AggregateNode";
import { DestinationNode } from "./nodes/DestinationNode";
import type { PipelineNodeData } from "@/types/pipeline";

const nodeTypes = {
  source: SourceNode,
  filter: FilterNode,
  transform: TransformNode,
  join: JoinNode,
  aggregate: AggregateNode,
  destination: DestinationNode,
};

const defaultNodeData: Record<string, PipelineNodeData> = {
  source: {
    label: "New Source",
    connectorId: "",
    schema: "",
    table: "",
    columns: [],
    selectedColumns: [],
  },
  filter: {
    label: "Filter",
    conditions: [],
    logicalOperator: "AND",
  },
  transform: {
    label: "Transform",
    transformations: [],
  },
  join: {
    label: "Join",
    joinType: "inner",
    leftKey: "",
    rightKey: "",
  },
  aggregate: {
    label: "Aggregate",
    groupByColumns: [],
    aggregations: [],
  },
  destination: {
    label: "New Destination",
    connectorId: "",
    schema: "",
    table: "",
    writeMode: "append",
  },
};

export function PipelineCanvas() {
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const { screenToFlowPosition } = useReactFlow();

  const nodes = usePipelineStore((s) => s.nodes);
  const edges = usePipelineStore((s) => s.edges);
  const onNodesChange = usePipelineStore((s) => s.onNodesChange);
  const onEdgesChange = usePipelineStore((s) => s.onEdgesChange);
  const onConnect = usePipelineStore((s) => s.onConnect);
  const addNode = usePipelineStore((s) => s.addNode);
  const selectNode = usePipelineStore((s) => s.selectNode);

  const onNodeClick = useCallback(
    (_event: React.MouseEvent, node: Node) => {
      selectNode(node.id);
    },
    [selectNode],
  );

  const onPaneClick = useCallback(() => {
    selectNode(null);
  }, [selectNode]);

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
  }, []);

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();

      const position = screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });

      // Handle dropping a node type from toolbar
      const nodeType = event.dataTransfer.getData(
        "application/data-builder-node-type",
      );
      if (nodeType && defaultNodeData[nodeType]) {
        addNode(nodeType, position, { ...defaultNodeData[nodeType] });
        return;
      }

      // Handle dropping a table from catalog
      const tableData = event.dataTransfer.getData(
        "application/data-builder-table",
      );
      if (tableData) {
        try {
          const { connectorId, schema, table } = JSON.parse(tableData);
          addNode("source", position, {
            label: `${schema}.${table}`,
            connectorId,
            schema,
            table,
            columns: [],
            selectedColumns: [],
          });
        } catch {
          // ignore parse errors
        }
      }
    },
    [screenToFlowPosition, addNode],
  );

  const memoizedNodeTypes = useMemo(() => nodeTypes, []);

  return (
    <div ref={reactFlowWrapper} className="flex-1">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeClick={onNodeClick}
        onPaneClick={onPaneClick}
        onDragOver={onDragOver}
        onDrop={onDrop}
        nodeTypes={memoizedNodeTypes}
        fitView
        deleteKeyCode={["Backspace", "Delete"]}
        className="bg-muted/30"
      >
        <Background gap={16} size={1} />
        <MiniMap pannable zoomable />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  );
}
