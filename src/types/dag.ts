export type NodeKind = 'trigger' | 'retriever' | 'router' | 'llm' | 'tool' | 'output'
export type NodeStatus = 'idle' | 'running' | 'success'

export interface DagNode {
  id: string
  kind: NodeKind
  label: string
  config: string
  x: number
  y: number
  latencyMs: number
  tokens: number
  status: NodeStatus
  outputPreview: string
}

export interface DagEdge {
  id: string
  from: string
  to: string
  active?: boolean
}

export interface ExecutionStepLog {
  id: string
  level: number
  nodeId: string
  nodeLabel: string
  kind: NodeKind
  latencyMs: number
  tokens: number
  output: string
}

export interface PipelinePreset {
  id: string
  name: string
  nodes: Omit<DagNode, 'status'>[]
  edges: DagEdge[]
}
