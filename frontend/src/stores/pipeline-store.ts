import { create } from "zustand";
import {
  type Node,
  type Edge,
  type OnNodesChange,
  type OnEdgesChange,
  type OnConnect,
  applyNodeChanges,
  applyEdgeChanges,
  addEdge,
} from "@xyflow/react";
import type { PipelineDefinition, PipelineNodeData } from "../types/pipeline";

interface PipelineState {
  pipelineId: string | null;
  pipelineName: string;
  isDirty: boolean;

  nodes: Node[];
  edges: Edge[];
  viewport: { x: number; y: number; zoom: number };

  selectedNodeId: string | null;

  onNodesChange: OnNodesChange;
  onEdgesChange: OnEdgesChange;
  onConnect: OnConnect;
  addNode: (
    type: string,
    position: { x: number; y: number },
    data: PipelineNodeData,
  ) => void;
  updateNodeData: (nodeId: string, data: Partial<PipelineNodeData>) => void;
  removeNode: (nodeId: string) => void;
  selectNode: (nodeId: string | null) => void;

  loadPipeline: (
    id: string,
    name: string,
    definition: PipelineDefinition,
  ) => void;
  serialize: () => PipelineDefinition;
  markClean: () => void;
  reset: () => void;
}

export const usePipelineStore = create<PipelineState>((set, get) => ({
  pipelineId: null,
  pipelineName: "Untitled Pipeline",
  isDirty: false,
  nodes: [],
  edges: [],
  viewport: { x: 0, y: 0, zoom: 1 },
  selectedNodeId: null,

  onNodesChange: (changes) => {
    set({ nodes: applyNodeChanges(changes, get().nodes), isDirty: true });
  },

  onEdgesChange: (changes) => {
    set({ edges: applyEdgeChanges(changes, get().edges), isDirty: true });
  },

  onConnect: (connection) => {
    set({ edges: addEdge(connection, get().edges), isDirty: true });
  },

  addNode: (type, position, data) => {
    const newNode: Node = {
      id: `node-${crypto.randomUUID()}`,
      type,
      position,
      data,
    };
    set({ nodes: [...get().nodes, newNode], isDirty: true });
  },

  updateNodeData: (nodeId, data) => {
    set({
      nodes: get().nodes.map((n) =>
        n.id === nodeId ? { ...n, data: { ...n.data, ...data } } : n,
      ),
      isDirty: true,
    });
  },

  removeNode: (nodeId) => {
    set({
      nodes: get().nodes.filter((n) => n.id !== nodeId),
      edges: get().edges.filter(
        (e) => e.source !== nodeId && e.target !== nodeId,
      ),
      selectedNodeId:
        get().selectedNodeId === nodeId ? null : get().selectedNodeId,
      isDirty: true,
    });
  },

  selectNode: (nodeId) => {
    set({ selectedNodeId: nodeId });
  },

  loadPipeline: (id, name, definition) => {
    set({
      pipelineId: id,
      pipelineName: name,
      nodes: definition.nodes || [],
      edges: definition.edges || [],
      viewport: definition.viewport || { x: 0, y: 0, zoom: 1 },
      isDirty: false,
      selectedNodeId: null,
    });
  },

  serialize: () => ({
    nodes: get().nodes,
    edges: get().edges,
    viewport: get().viewport,
  }),

  markClean: () => set({ isDirty: false }),

  reset: () =>
    set({
      pipelineId: null,
      pipelineName: "Untitled Pipeline",
      isDirty: false,
      nodes: [],
      edges: [],
      viewport: { x: 0, y: 0, zoom: 1 },
      selectedNodeId: null,
    }),
}));
