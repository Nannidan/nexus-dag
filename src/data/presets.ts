import type { DagEdge, DagNode, NodeKind, PipelinePreset } from '../types/dag'

export const KIND_META: Record<
  NodeKind,
  { badge: string; accent: string; bg: string; border: string }
> = {
  trigger: {
    badge: 'INGEST',
    accent: '#38bdf8',
    bg: 'rgba(14, 165, 233, 0.12)',
    border: 'rgba(56, 189, 248, 0.45)',
  },
  retriever: {
    badge: 'VECTOR DB',
    accent: '#34d399',
    bg: 'rgba(16, 185, 129, 0.12)',
    border: 'rgba(52, 211, 153, 0.45)',
  },
  router: {
    badge: 'ROUTER',
    accent: '#fbbf24',
    bg: 'rgba(245, 158, 11, 0.12)',
    border: 'rgba(251, 191, 36, 0.45)',
  },
  llm: {
    badge: 'LLM AGENT',
    accent: '#a855f7',
    bg: 'rgba(168, 85, 247, 0.14)',
    border: 'rgba(192, 132, 252, 0.5)',
  },
  tool: {
    badge: 'TOOL CALL',
    accent: '#f472b6',
    bg: 'rgba(236, 72, 153, 0.12)',
    border: 'rgba(244, 114, 182, 0.45)',
  },
  output: {
    badge: 'SINK',
    accent: '#2dd4bf',
    bg: 'rgba(20, 184, 166, 0.12)',
    border: 'rgba(45, 212, 191, 0.45)',
  },
}

export const PIPELINE_PRESETS: PipelinePreset[] = [
  {
    id: 'rag-citation',
    name: 'Hybrid RAG & Citation Engine',
    nodes: [
      {
        id: 'n1',
        kind: 'trigger',
        label: 'Query Webhook',
        config: 'POST /v1/ask • JSON',
        x: 40,
        y: 165,
        latencyMs: 18,
        tokens: 64,
        outputPreview: '{"query": "Compare Web Audio BiquadFilter Q response"}',
      },
      {
        id: 'n2',
        kind: 'retriever',
        label: 'Dense Vector Search',
        config: 'pgvector • top_k=8 • cosine',
        x: 310,
        y: 65,
        latencyMs: 42,
        tokens: 620,
        outputPreview: 'Retrieved 8 chunks (similarity 0.89..0.96)',
      },
      {
        id: 'n3',
        kind: 'tool',
        label: 'BM25 Lexical Index',
        config: 'tantivy • exact keyword boost',
        x: 310,
        y: 265,
        latencyMs: 28,
        tokens: 410,
        outputPreview: 'Matched 5 spec passages on BiquadFilterNode',
      },
      {
        id: 'n4',
        kind: 'router',
        label: 'Reciprocal Rank Fusion',
        config: 'RRF k=60 • dedupe chunks',
        x: 590,
        y: 165,
        latencyMs: 15,
        tokens: 540,
        outputPreview: 'Reranked top 4 grounded context passages',
      },
      {
        id: 'n5',
        kind: 'llm',
        label: 'Grounded Synthesizer',
        config: 'temp=0.1 • strict inline citations',
        x: 860,
        y: 165,
        latencyMs: 310,
        tokens: 890,
        outputPreview: 'Generated technical answer with [1][2] citations',
      },
      {
        id: 'n6',
        kind: 'output',
        label: 'SSE Stream Sink',
        config: 'text/event-stream • 200 OK',
        x: 1130,
        y: 165,
        latencyMs: 12,
        tokens: 0,
        outputPreview: 'Delivered 890 tokens • 0 hallucinations flagged',
      },
    ],
    edges: [
      { id: 'e1', from: 'n1', to: 'n2' },
      { id: 'e2', from: 'n1', to: 'n3' },
      { id: 'e3', from: 'n2', to: 'n4' },
      { id: 'e4', from: 'n3', to: 'n4' },
      { id: 'e5', from: 'n4', to: 'n5' },
      { id: 'e6', from: 'n5', to: 'n6' },
    ],
  },
  {
    id: 'code-audit',
    name: 'Autonomous PR Security & AST Auditor',
    nodes: [
      {
        id: 'c1',
        kind: 'trigger',
        label: 'GitHub PR Diff Hook',
        config: 'pull_request.synchronize',
        x: 50,
        y: 170,
        latencyMs: 22,
        tokens: 340,
        outputPreview: 'Parsed 14 changed files (+412 / -89 lines)',
      },
      {
        id: 'c2',
        kind: 'router',
        label: 'Language & Risk Router',
        config: 'TS/React + Auth boundary rules',
        x: 330,
        y: 170,
        latencyMs: 19,
        tokens: 180,
        outputPreview: 'Routed to AST Security + A11y reviewers',
      },
      {
        id: 'c3',
        kind: 'tool',
        label: 'Oxlint & AST Taint Scan',
        config: 'zero-alloc AST pass',
        x: 620,
        y: 70,
        latencyMs: 64,
        tokens: 290,
        outputPreview: '0 XSS sinks • 1 unescaped URL param flagged',
      },
      {
        id: 'c4',
        kind: 'llm',
        label: 'Patch & Test Synthesizer',
        config: 'diff-mode • strict TS types',
        x: 620,
        y: 270,
        latencyMs: 420,
        tokens: 1120,
        outputPreview: 'Synthesized minimal patch + unit test assertion',
      },
      {
        id: 'c5',
        kind: 'output',
        label: 'PR Review Comment',
        config: 'GitHub Checks API',
        x: 920,
        y: 170,
        latencyMs: 35,
        tokens: 0,
        outputPreview: 'Posted inline diff suggestion on PR #142',
      },
    ],
    edges: [
      { id: 'ce1', from: 'c1', to: 'c2' },
      { id: 'ce2', from: 'c2', to: 'c3' },
      { id: 'ce3', from: 'c2', to: 'c4' },
      { id: 'ce4', from: 'c3', to: 'c5' },
      { id: 'ce5', from: 'c4', to: 'c5' },
    ],
  },
]

// Kahn's algorithm for level-by-level topological DAG execution
export function computeTopologicalLevels(nodes: DagNode[], edges: DagEdge[]): DagNode[][] {
  const inDegree = new Map<string, number>()
  const adj = new Map<string, string[]>()
  const nodeMap = new Map<string, DagNode>()

  for (const n of nodes) {
    inDegree.set(n.id, 0)
    adj.set(n.id, [])
    nodeMap.set(n.id, n)
  }

  for (const e of edges) {
    if (nodeMap.has(e.from) && nodeMap.has(e.to)) {
      adj.get(e.from)!.push(e.to)
      inDegree.set(e.to, (inDegree.get(e.to) ?? 0) + 1)
    }
  }

  let currentQueue = nodes.filter((n) => (inDegree.get(n.id) ?? 0) === 0).map((n) => n.id)
  const visited = new Set<string>()
  const levels: DagNode[][] = []

  while (currentQueue.length > 0) {
    const levelNodes: DagNode[] = []
    const nextQueue: string[] = []

    for (const id of currentQueue) {
      if (visited.has(id)) continue
      visited.add(id)
      const node = nodeMap.get(id)
      if (node) levelNodes.push(node)

      for (const neighbor of adj.get(id) ?? []) {
        const nextDeg = (inDegree.get(neighbor) ?? 1) - 1
        inDegree.set(neighbor, nextDeg)
        if (nextDeg === 0) nextQueue.push(neighbor)
      }
    }

    if (levelNodes.length > 0) levels.push(levelNodes)
    currentQueue = nextQueue
  }

  // Include any remaining unvisited nodes if graph had an isolated cycle
  const remaining = nodes.filter((n) => !visited.has(n.id))
  if (remaining.length > 0) levels.push(remaining)

  return levels
}

export function wouldCreateCycle(
  nodes: DagNode[],
  edges: DagEdge[],
  fromId: string,
  toId: string,
): boolean {
  if (fromId === toId) return true
  const adj = new Map<string, string[]>()
  for (const n of nodes) adj.set(n.id, [])
  for (const e of edges) {
    adj.get(e.from)?.push(e.to)
  }
  adj.get(fromId)?.push(toId)

  // DFS from toId to see if fromId is reachable
  const stack = [toId]
  const seen = new Set<string>()
  while (stack.length > 0) {
    const curr = stack.pop()!
    if (curr === fromId) return true
    if (seen.has(curr)) continue
    seen.add(curr)
    for (const next of adj.get(curr) ?? []) {
      stack.push(next)
    }
  }
  return false
}
