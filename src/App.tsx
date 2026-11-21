import { useMemo, useRef, useState } from 'react'
import {
  ArrowLeft,
  CheckCircle2,
  Download,
  GitFork,
  Link2,
  Play,
  Plus,
  RotateCcw,
  Trash2,
  ZoomIn,
  ZoomOut,
} from 'lucide-react'
import {
  KIND_META,
  PIPELINE_PRESETS,
  computeTopologicalLevels,
  wouldCreateCycle,
} from './data/presets'
import type { DagEdge, DagNode, ExecutionStepLog, NodeKind } from './types/dag'

const NODE_W = 220
const NODE_H = 104

function hydratePreset(presetIdx: number): { nodes: DagNode[]; edges: DagEdge[] } {
  const preset = PIPELINE_PRESETS[presetIdx] ?? PIPELINE_PRESETS[0]
  return {
    nodes: preset.nodes.map((n) => ({ ...n, status: 'idle' })),
    edges: preset.edges.map((e) => ({ ...e, active: false })),
  }
}

export default function App() {
  const [presetIdx, setPresetIdx] = useState(0)
  const [nodes, setNodes] = useState<DagNode[]>(() => hydratePreset(0).nodes)
  const [edges, setEdges] = useState<DagEdge[]>(() => hydratePreset(0).edges)
  const [selectedId, setSelectedId] = useState<string>('n5')
  const [connectingFromId, setConnectingFromId] = useState<string | null>(null)
  const [zoom, setZoom] = useState(1)
  const [isRunning, setIsRunning] = useState(false)
  const [logs, setLogs] = useState<ExecutionStepLog[]>([])
  const [notice, setNotice] = useState<string | null>(null)

  const dragRef = useRef<{
    id: string
    startX: number
    startY: number
    origX: number
    origY: number
  } | null>(null)

  const selectedNode = useMemo(
    () => nodes.find((n) => n.id === selectedId) ?? nodes[0] ?? null,
    [nodes, selectedId],
  )

  const levels = useMemo(() => computeTopologicalLevels(nodes, edges), [nodes, edges])

  const totalMetrics = useMemo(() => {
    const totalTokens = nodes.reduce((acc, n) => acc + n.tokens, 0)
    // Critical path latency = sum of max latency per topological level
    const criticalPathMs = levels.reduce((acc, lvl) => {
      const maxInLevel = lvl.reduce((m, n) => Math.max(m, n.latencyMs), 0)
      return acc + maxInLevel
    }, 0)
    return { totalTokens, criticalPathMs }
  }, [nodes, levels])

  const showToast = (msg: string) => {
    setNotice(msg)
    window.setTimeout(() => setNotice(null), 2600)
  }

  const loadPreset = (idx: number) => {
    const next = hydratePreset(idx)
    setPresetIdx(idx)
    setNodes(next.nodes)
    setEdges(next.edges)
    setSelectedId(next.nodes[0]?.id ?? '')
    setConnectingFromId(null)
    setLogs([])
    setIsRunning(false)
  }

  const handleNodePointerDown = (e: React.PointerEvent<HTMLDivElement>, node: DagNode) => {
    if ((e.target as HTMLElement).closest('button')) return
    e.stopPropagation()
    setSelectedId(node.id)

    if (connectingFromId) {
      if (connectingFromId === node.id) {
        setConnectingFromId(null)
        return
      }
      const exists = edges.some((ed) => ed.from === connectingFromId && ed.to === node.id)
      if (exists) {
        showToast('Edge already exists between those nodes.')
        setConnectingFromId(null)
        return
      }
      if (wouldCreateCycle(nodes, edges, connectingFromId, node.id)) {
        showToast('Cycle prevented: DAG edges must remain acyclic.')
        setConnectingFromId(null)
        return
      }
      setEdges((prev) => [
        ...prev,
        { id: `e-${Date.now()}`, from: connectingFromId, to: node.id },
      ])
      showToast('Connected new directed DAG edge.')
      setConnectingFromId(null)
      return
    }

    e.currentTarget.setPointerCapture(e.pointerId)
    dragRef.current = {
      id: node.id,
      startX: e.clientX,
      startY: e.clientY,
      origX: node.x,
      origY: node.y,
    }
  }

  const handleNodePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    if (!drag) return
    const dx = (e.clientX - drag.startX) / zoom
    const dy = (e.clientY - drag.startY) / zoom
    const nextX = Math.max(16, Math.round(drag.origX + dx))
    const nextY = Math.max(16, Math.round(drag.origY + dy))
    setNodes((prev) =>
      prev.map((n) => (n.id === drag.id ? { ...n, x: nextX, y: nextY } : n)),
    )
  }

  const handleNodePointerUp = () => {
    dragRef.current = null
  }

  const addNode = (kind: NodeKind) => {
    const id = `node-${Date.now().toString().slice(-4)}`
    const newNode: DagNode = {
      id,
      kind,
      label: `New ${KIND_META[kind].badge}`,
      config: kind === 'llm' ? 'temp=0.2 • streaming' : 'custom stage',
      x: 180 + ((nodes.length * 95) % 520),
      y: 120 + ((nodes.length * 65) % 240),
      latencyMs: kind === 'llm' ? 260 : 35,
      tokens: kind === 'llm' ? 512 : 120,
      status: 'idle',
      outputPreview: `Executed ${KIND_META[kind].badge} stage (${id})`,
    }
    setNodes((prev) => [...prev, newNode])
    setSelectedId(id)
    showToast(`Added ${newNode.label} to canvas.`)
  }

  const deleteSelectedNode = () => {
    if (!selectedNode || nodes.length <= 2) return
    const targetId = selectedNode.id
    const remaining = nodes.filter((n) => n.id !== targetId)
    setNodes(remaining)
    setEdges((prev) => prev.filter((e) => e.from !== targetId && e.to !== targetId))
    setSelectedId(remaining[0]?.id ?? '')
  }

  const runDagPipeline = async () => {
    if (isRunning) return
    setIsRunning(true)
    setLogs([])
    setNodes((prev) => prev.map((n) => ({ ...n, status: 'idle' })))
    setEdges((prev) => prev.map((e) => ({ ...e, active: false })))

    const topoLevels = computeTopologicalLevels(nodes, edges)

    for (let lvlIdx = 0; lvlIdx < topoLevels.length; lvlIdx++) {
      const levelNodes = topoLevels[lvlIdx]
      const levelIds = new Set(levelNodes.map((n) => n.id))

      setNodes((prev) =>
        prev.map((n) => (levelIds.has(n.id) ? { ...n, status: 'running' } : n)),
      )
      setEdges((prev) =>
        prev.map((e) => ({ ...e, active: levelIds.has(e.from) || levelIds.has(e.to) })),
      )

      await new Promise((r) => window.setTimeout(r, 460))

      setNodes((prev) =>
        prev.map((n) => (levelIds.has(n.id) ? { ...n, status: 'success' } : n)),
      )
      setLogs((prev) => [
        ...prev,
        ...levelNodes.map((n) => ({
          id: `${n.id}-${lvlIdx}`,
          level: lvlIdx + 1,
          nodeId: n.id,
          nodeLabel: n.label,
          kind: n.kind,
          latencyMs: n.latencyMs,
          tokens: n.tokens,
          output: n.outputPreview,
        })),
      ])
    }

    setEdges((prev) => prev.map((e) => ({ ...e, active: false })))
    setIsRunning(false)
    showToast(`DAG execution complete across ${topoLevels.length} topological stages.`)
  }

  const exportDagJson = () => {
    const payload = JSON.stringify({ nodes, edges, topologicalStages: levels.length }, null, 2)
    const blob = new Blob([payload], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'nexus-dag-pipeline.json'
    a.click()
    URL.revokeObjectURL(url)
    showToast('Exported nexus-dag-pipeline.json')
  }

  return (
    <div className="flex min-h-dvh flex-col bg-[#070b12] text-slate-100">
      {/* Top Header with Back to Portfolio button beside project symbol */}
      <header className="sticky top-0 z-30 border-b border-slate-800/90 bg-[#0b111d]/95 backdrop-blur-md">
        <div className="mx-auto flex max-w-[1440px] flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <a
              href="https://portfolio-hub-44jc.vercel.app/"
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-800 bg-slate-900/90 px-2.5 py-1.5 font-mono text-xs font-medium text-slate-300 transition-colors hover:border-sky-500/50 hover:text-white"
            >
              <ArrowLeft className="h-3.5 w-3.5 text-sky-400" />
              <span>Portfolio</span>
            </a>
            <div className="h-5 w-px bg-slate-800" />
            <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-sky-500/40 bg-sky-500/10 text-sky-400">
              <GitFork className="h-5 w-5" />
            </div>
            <div>
              <h1 className="font-mono text-base font-bold tracking-tight text-white">
                NEXUS // DAG
              </h1>
              <p className="font-mono text-[11px] text-slate-400">
                2D SPATIAL NODE-GRAPH &amp; TOPOLOGICAL PIPELINE ENGINE
              </p>
            </div>
          </div>

          {/* Preset & Execution Toolbar */}
          <div className="flex flex-wrap items-center gap-2">
            {PIPELINE_PRESETS.map((p, idx) => (
              <button
                key={p.id}
                type="button"
                onClick={() => loadPreset(idx)}
                className={`cursor-pointer rounded-lg border px-3 py-1.5 font-mono text-xs font-semibold transition-colors ${
                  presetIdx === idx
                    ? 'border-sky-500/60 bg-sky-500/15 text-sky-300'
                    : 'border-slate-800 bg-slate-900 text-slate-400 hover:text-slate-200'
                }`}
              >
                {p.name}
              </button>
            ))}

            <button
              type="button"
              onClick={() => void runDagPipeline()}
              disabled={isRunning}
              className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-sky-500 px-3.5 py-1.5 font-mono text-xs font-bold text-slate-950 shadow-lg shadow-sky-500/20 transition hover:bg-sky-400 disabled:opacity-50"
            >
              <Play className="h-3.5 w-3.5 fill-current" />
              <span>{isRunning ? 'Executing DAG...' : 'Execute DAG'}</span>
            </button>

            <button
              type="button"
              onClick={exportDagJson}
              className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-slate-800 bg-slate-900 px-3 py-1.5 font-mono text-xs font-semibold text-slate-200 hover:border-sky-500/50"
            >
              <Download className="h-3.5 w-3.5 text-sky-400" />
              <span>Export JSON</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Workspace: 2D Spatial Canvas + Right Inspector */}
      <div className="mx-auto grid w-full max-w-[1440px] flex-1 gap-4 p-4 lg:grid-cols-12 sm:px-6">
        {/* Left: Interactive 2D Spatial Node Canvas */}
        <div className="flex flex-col overflow-hidden rounded-2xl border border-slate-800 bg-[#070b12] lg:col-span-8">
          {/* Canvas Sub-Toolbar */}
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800/90 bg-slate-900/70 px-4 py-2.5">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="mr-1 font-mono text-[11px] text-slate-400">+ NODE:</span>
              {(['trigger', 'retriever', 'router', 'llm', 'tool', 'output'] as NodeKind[]).map(
                (k) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => addNode(k)}
                    className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-slate-800 bg-slate-950 px-2 py-1 font-mono text-[10px] font-semibold text-slate-300 hover:border-sky-500/50 hover:text-white"
                  >
                    <Plus className="h-2.5 w-2.5 text-sky-400" />
                    {KIND_META[k].badge}
                  </button>
                ),
              )}
            </div>

            <div className="flex items-center gap-2 font-mono text-xs">
              {connectingFromId && (
                <span className="rounded-md bg-amber-500/20 px-2 py-0.5 text-[11px] font-semibold text-amber-300">
                  Click target node to link wire...
                </span>
              )}
              <button
                type="button"
                onClick={() => setZoom((z) => Math.max(0.75, Number((z - 0.1).toFixed(2))))}
                className="cursor-pointer rounded border border-slate-800 bg-slate-950 p-1 text-slate-400 hover:text-white"
                title="Zoom Out"
              >
                <ZoomOut className="h-3.5 w-3.5" />
              </button>
              <span className="text-[11px] text-slate-400">{Math.round(zoom * 100)}%</span>
              <button
                type="button"
                onClick={() => setZoom((z) => Math.min(1.25, Number((z + 0.1).toFixed(2))))}
                className="cursor-pointer rounded border border-slate-800 bg-slate-950 p-1 text-slate-400 hover:text-white"
                title="Zoom In"
              >
                <ZoomIn className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => loadPreset(presetIdx)}
                className="inline-flex cursor-pointer items-center gap-1 rounded border border-slate-800 bg-slate-950 px-2 py-1 text-[11px] text-slate-400 hover:text-white"
              >
                <RotateCcw className="h-3 w-3" />
                Reset
              </button>
            </div>
          </div>

          {/* 2D Spatial Viewport */}
          <div className="dag-grid-bg relative h-[480px] w-full overflow-auto select-none">
            <div
              className="relative h-[520px] min-w-[1380px] origin-top-left transition-transform duration-75"
              style={{ transform: `scale(${zoom})` }}
            >
              {/* Cubic Bézier Wire SVG Layer */}
              <svg className="pointer-events-none absolute inset-0 h-full w-full">
                {edges.map((edge) => {
                  const fromNode = nodes.find((n) => n.id === edge.from)
                  const toNode = nodes.find((n) => n.id === edge.to)
                  if (!fromNode || !toNode) return null

                  const x1 = fromNode.x + NODE_W
                  const y1 = fromNode.y + NODE_H / 2
                  const x2 = toNode.x
                  const y2 = toNode.y + NODE_H / 2
                  const dx = Math.max(60, Math.abs(x2 - x1) * 0.5)
                  const path = `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`
                  const midX = (x1 + x2) / 2
                  const midY = (y1 + y2) / 2

                  return (
                    <g key={edge.id}>
                      <path
                        d={path}
                        fill="none"
                        stroke={edge.active ? '#38bdf8' : 'rgba(148, 163, 184, 0.35)'}
                        strokeWidth={edge.active ? 3 : 2}
                        className={edge.active ? 'wire-animated' : undefined}
                      />
                      {/* Clickable Wire Delete Midpoint */}
                      <g
                        className="pointer-events-auto cursor-pointer opacity-75 hover:opacity-100"
                        onClick={() =>
                          setEdges((prev) => prev.filter((e) => e.id !== edge.id))
                        }
                      >
                        <circle
                          cx={midX}
                          cy={midY}
                          r={8}
                          fill="#0f172a"
                          stroke="#334155"
                          strokeWidth={1.5}
                        />
                        <text
                          x={midX}
                          y={midY + 3.5}
                          textAnchor="middle"
                          fill="#94a3b8"
                          fontSize="10"
                          fontFamily="monospace"
                        >
                          ×
                        </text>
                      </g>
                    </g>
                  )
                })}
              </svg>

              {/* Draggable DAG Nodes */}
              {nodes.map((node) => {
                const meta = KIND_META[node.kind]
                const isSelected = node.id === selectedId
                const isSource = connectingFromId === node.id

                return (
                  <div
                    key={node.id}
                    onPointerDown={(e) => handleNodePointerDown(e, node)}
                    onPointerMove={handleNodePointerMove}
                    onPointerUp={handleNodePointerUp}
                    style={{
                      width: NODE_W,
                      height: NODE_H,
                      transform: `translate3d(${node.x}px, ${node.y}px, 0)`,
                      borderColor:
                        node.status === 'running'
                          ? '#38bdf8'
                          : isSelected
                            ? meta.accent
                            : meta.border,
                      boxShadow:
                        node.status === 'running'
                          ? '0 0 28px rgba(56, 189, 248, 0.45)'
                          : isSelected
                            ? `0 12px 30px -10px ${meta.border}`
                            : '0 8px 20px rgba(0,0,0,0.45)',
                    }}
                    className="absolute top-0 left-0 flex cursor-grab flex-col justify-between rounded-xl border bg-[#0f1623]/95 p-3 backdrop-blur active:cursor-grabbing"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span
                        className="rounded px-1.5 py-0.5 font-mono text-[10px] font-bold"
                        style={{ backgroundColor: meta.bg, color: meta.accent }}
                      >
                        {meta.badge}
                      </span>

                      <div className="flex items-center gap-1.5">
                        {node.status === 'success' && (
                          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                        )}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            setConnectingFromId((prev) => (prev === node.id ? null : node.id))
                          }}
                          title="Connect directed wire from this node"
                          className={`cursor-pointer rounded border px-1.5 py-0.5 font-mono text-[9px] font-semibold ${
                            isSource
                              ? 'border-amber-400 bg-amber-400/20 text-amber-300'
                              : 'border-slate-700 bg-slate-900 text-slate-400 hover:text-white'
                          }`}
                        >
                          <Link2 className="inline h-2.5 w-2.5" /> Wire
                        </button>
                      </div>
                    </div>

                    <div>
                      <div className="truncate text-sm font-bold text-white">{node.label}</div>
                      <div className="truncate font-mono text-[11px] text-slate-400">
                        {node.config}
                      </div>
                    </div>

                    <div className="flex items-center justify-between border-t border-slate-800/80 pt-1.5 font-mono text-[10px] text-slate-400">
                      <span>{node.latencyMs} ms</span>
                      <span>{node.tokens} tok</span>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Bottom Metrics Strip */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-800 bg-slate-900/60 px-4 py-2.5 font-mono text-xs text-slate-400">
            <div className="flex flex-wrap items-center gap-4">
              <span>
                NODES: <strong className="text-white">{nodes.length}</strong>
              </span>
              <span>
                EDGES: <strong className="text-white">{edges.length}</strong>
              </span>
              <span>
                TOPOLOGICAL DEPTH: <strong className="text-sky-400">{levels.length} stages</strong>
              </span>
              <span>
                CRITICAL PATH: <strong className="text-emerald-400">{totalMetrics.criticalPathMs} ms</strong>
              </span>
              <span>
                TOKEN BUDGET: <strong className="text-purple-400">{totalMetrics.totalTokens.toLocaleString()}</strong>
              </span>
            </div>
            {notice && <span className="text-sky-300">{notice}</span>}
          </div>
        </div>

        {/* Right: Node Inspector & Topological Execution Trace */}
        <div className="flex flex-col gap-4 lg:col-span-4">
          {selectedNode && (
            <section className="rounded-2xl border border-slate-800 bg-[#0f1623] p-4">
              <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
                <span className="font-mono text-xs font-bold text-sky-400">
                  NODE INSPECTOR // {selectedNode.id.toUpperCase()}
                </span>
                <button
                  type="button"
                  onClick={deleteSelectedNode}
                  disabled={nodes.length <= 2}
                  className="inline-flex cursor-pointer items-center gap-1 rounded border border-rose-500/30 bg-rose-500/10 px-2 py-1 font-mono text-[10px] font-semibold text-rose-300 hover:bg-rose-500/20 disabled:opacity-40"
                >
                  <Trash2 className="h-3 w-3" />
                  Delete
                </button>
              </div>

              <div className="mt-3 space-y-3 text-xs">
                <div>
                  <label className="block font-mono text-[10px] text-slate-400">STAGE LABEL</label>
                  <input
                    type="text"
                    value={selectedNode.label}
                    onChange={(e) =>
                      setNodes((prev) =>
                        prev.map((n) =>
                          n.id === selectedNode.id ? { ...n, label: e.target.value } : n,
                        ),
                      )
                    }
                    className="mt-1 w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-1.5 text-xs text-white focus:border-sky-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block font-mono text-[10px] text-slate-400">
                    MODEL / RUNTIME CONFIG
                  </label>
                  <input
                    type="text"
                    value={selectedNode.config}
                    onChange={(e) =>
                      setNodes((prev) =>
                        prev.map((n) =>
                          n.id === selectedNode.id ? { ...n, config: e.target.value } : n,
                        ),
                      )
                    }
                    className="mt-1 w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-1.5 font-mono text-xs text-white focus:border-sky-500 focus:outline-none"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <label className="block font-mono text-[10px] text-slate-400">
                      LATENCY ({selectedNode.latencyMs} ms)
                    </label>
                    <input
                      type="range"
                      min={5}
                      max={800}
                      step={5}
                      value={selectedNode.latencyMs}
                      onChange={(e) =>
                        setNodes((prev) =>
                          prev.map((n) =>
                            n.id === selectedNode.id
                              ? { ...n, latencyMs: Number(e.target.value) }
                              : n,
                          ),
                        )
                      }
                      className="mt-1.5 w-full accent-sky-400"
                    />
                  </div>

                  <div>
                    <label className="block font-mono text-[10px] text-slate-400">
                      TOKENS ({selectedNode.tokens})
                    </label>
                    <input
                      type="range"
                      min={0}
                      max={2048}
                      step={32}
                      value={selectedNode.tokens}
                      onChange={(e) =>
                        setNodes((prev) =>
                          prev.map((n) =>
                            n.id === selectedNode.id
                              ? { ...n, tokens: Number(e.target.value) }
                              : n,
                          ),
                        )
                      }
                      className="mt-1.5 w-full accent-sky-400"
                    />
                  </div>
                </div>
              </div>
            </section>
          )}

          {/* Live Topological Execution Trace */}
          <section className="flex flex-1 flex-col rounded-2xl border border-slate-800 bg-[#0f1623] p-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
              <span className="font-mono text-xs font-bold text-emerald-400">
                TOPOLOGICAL EXECUTION TRACE
              </span>
              <span className="font-mono text-[10px] text-slate-400">
                Kahn&apos;s Level-Order Solver
              </span>
            </div>

            {logs.length === 0 ? (
              <div className="flex flex-1 flex-col items-center justify-center py-8 text-center font-mono text-xs text-slate-500">
                <p>Click &quot;Execute DAG&quot; to run topological level-order traversal.</p>
                <p className="mt-1 text-[11px]">
                  Drag nodes to reroute Bézier wires or click &quot;Wire&quot; to connect stages.
                </p>
              </div>
            ) : (
              <ul className="mt-3 max-h-64 space-y-2 overflow-y-auto pr-1">
                {logs.map((item) => (
                  <li
                    key={item.id}
                    className="rounded-xl border border-slate-800/90 bg-slate-950/80 p-2.5 font-mono text-xs"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-white">
                        [L{item.level}] {item.nodeLabel}
                      </span>
                      <span className="text-[10px] text-emerald-400">
                        {item.latencyMs}ms • {item.tokens}t
                      </span>
                    </div>
                    <p className="mt-1 truncate text-[11px] text-slate-400">{item.output}</p>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>
  )
}
