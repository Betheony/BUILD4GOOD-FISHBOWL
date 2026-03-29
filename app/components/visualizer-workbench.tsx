'use client'

import { useEffect, useEffectEvent, useRef, useState } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

type BoardPosition = { x: number; y: number };
type StructureKind = "array" | "linkedlist" | "hashmap" | "node";
type CellAnim = "add" | "remove" | "swap";

type ArrayCell = { id: string; value: string; anim?: CellAnim };
type ArrayBoard = {
  id: string; kind: "array"; position: BoardPosition; label: string;
  cells: ArrayCell[]; selectedCells: string[];
};

type LLNode = { id: string; value: string; anim?: CellAnim };
type LinkedListBoard = {
  id: string; kind: "linkedlist"; position: BoardPosition; label: string;
  nodes: LLNode[]; selectedNodes: string[];
};

type HashEntry = { id: string; key: string; value: string };
type HashmapBoard = {
  id: string
  kind: "hashmap"
  position: BoardPosition
  label: string
  entries: HashEntry[]
  keyDraft: string
  valueDraft: string
  sortMode: "none" | "key" | "value"
  size: {
    width: number
  }
};
type GraphNode = {
  id: string; kind: "node"; position: BoardPosition; label: string;
  highlight?: "current" | "visited" | "queued";
};

type BoardItem = ArrayBoard | LinkedListBoard | HashmapBoard | GraphNode;

type ArrowAnnotation = {
  id: string; kind: "arrow";
  x1: number; y1: number; x2: number; y2: number;
  label: string; selected: boolean;
  fromNodeId?: string; toNodeId?: string;
  directed?: boolean;
};
type TextAnnotation = {
  id: string; kind: "text";
  x: number; y: number; text: string; width: number; selected: boolean;
};
type AnnotationItem = ArrowAnnotation | TextAnnotation;

type Tool = "select" | "arrow" | "text";
type EdgeMode = "directed" | "undirected";
type DragState =
  | { kind: "card"; id: string; isAnnotation: boolean; pointerOffsetX: number; pointerOffsetY: number }
  | { kind: "pan"; startClientX: number; startClientY: number; startOffsetX: number; startOffsetY: number }
  | { kind: "arrow-draw"; startX: number; startY: number; currentX: number; currentY: number; sourceNodeId?: string };

type UndoSnapshot = { items: BoardItem[]; annotations: AnnotationItem[] };
type HistoryEntry = { id: string; msg: string };

// ─── Helpers ──────────────────────────────────────────────────────────────────

let _uid = 0;
const uid = () => `id-${++_uid}`;

function cloneItems(items: BoardItem[]): BoardItem[] {
  return items.map(item => {
    if (item.kind === "array") return { ...item, cells: item.cells.map(c => ({ ...c })), selectedCells: [...item.selectedCells] };
    if (item.kind === "linkedlist") return { ...item, nodes: item.nodes.map(n => ({ ...n })), selectedNodes: [...item.selectedNodes] };
    if (item.kind === "hashmap")
      return {
        ...item,
        entries: item.entries.map(e => ({ ...e })),
        size: { ...item.size },
      }
    return { ...item };
  });
}
const cloneAnnotations = (anns: AnnotationItem[]): AnnotationItem[] => anns.map(a => ({ ...a }));

const NODE_RADIUS = 32;
const SNAP_RADIUS = 44;
const EDGE_NODE_OVERLAP = 4;

function findNearbyNode(x: number, y: number, items: BoardItem[]): GraphNode | null {
  for (const item of items) {
    if (item.kind !== "node") continue;
    const cx = item.position.x + NODE_RADIUS, cy = item.position.y + NODE_RADIUS;
    if (Math.hypot(x - cx, y - cy) <= SNAP_RADIUS) return item;
  }
  return null;
}

function getNodeCenter(node: GraphNode) {
  return { x: node.position.x + NODE_RADIUS, y: node.position.y + NODE_RADIUS };
}

function getSegmentPoints(
  start: BoardPosition,
  end: BoardPosition,
  startInset = 0,
  endInset = 0,
) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const distance = Math.hypot(dx, dy);

  if (distance < 0.001) {
    return { x1: start.x, y1: start.y, x2: end.x, y2: end.y };
  }

  const ux = dx / distance;
  const uy = dy / distance;

  return {
    x1: start.x + ux * startInset,
    y1: start.y + uy * startInset,
    x2: end.x - ux * endInset,
    y2: end.y - uy * endInset,
  };
}

function buildAdjacency(items: BoardItem[], annotations: AnnotationItem[]): Record<string, string[]> {
  const adj: Record<string, string[]> = {};
  const nodeIds = new Set(items.filter(b => b.kind === "node").map(b => b.id));
  for (const ann of annotations) {
    if (ann.kind !== "arrow") continue;
    const ar = ann as ArrowAnnotation;
    if (ar.fromNodeId && ar.toNodeId && nodeIds.has(ar.fromNodeId) && nodeIds.has(ar.toNodeId)) {
      (adj[ar.fromNodeId] ??= []).push(ar.toNodeId);
      if (ar.directed === false) (adj[ar.toNodeId] ??= []).push(ar.fromNodeId);
    }
  }
  return adj;
}

function getConnectedNodeIds(annotations: AnnotationItem[]): Set<string> {
  const ids = new Set<string>();
  for (const ann of annotations) {
    if (ann.kind !== "arrow") continue;
    const ar = ann as ArrowAnnotation;
    if (ar.fromNodeId) ids.add(ar.fromNodeId);
    if (ar.toNodeId) ids.add(ar.toNodeId);
  }
  return ids;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function VisualizerWorkbench() {
  const [boardItems, setBoardItems] = useState<BoardItem[]>([]);
  const [annotations, setAnnotations] = useState<AnnotationItem[]>([]);
  const [canvasOffset, setCanvasOffset] = useState({ x: 80, y: 80 });
  const [zoom, setZoom] = useState(1);
  const [activeTool, setActiveTool] = useState<Tool>("select");
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [undoStack, setUndoStack] = useState<UndoSnapshot[]>([]);
  const [redoStack, setRedoStack] = useState<UndoSnapshot[]>([]);
  const [selectedBoardId, setSelectedBoardId] = useState<string | null>(null);
  const [whiteboardName, setWhiteboardName] = useState("Untitled Whiteboard");
  const [edgeMode, setEdgeMode] = useState<EdgeMode>("directed");
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [hmDupAlert, setHmDupAlert] = useState<{ bid: string; key: string } | null>(null)
  const canvasRef = useRef<HTMLDivElement>(null);
  const addBoardCountRef = useRef(0);
  const live = useRef({ zoom, canvasOffset, boardItems, annotations, activeTool, dragState });
  useEffect(() => { live.current = { zoom, canvasOffset, boardItems, annotations, activeTool, dragState }; });

  // ── History ────────────────────────────────────────────────────────────────

  const log = (msg: string) => setHistory(h => [{ id: uid(), msg }, ...h].slice(0, 100));

  // ── Undo / Redo ────────────────────────────────────────────────────────────

  function snapshot() {
    const s: UndoSnapshot = { items: cloneItems(live.current.boardItems), annotations: cloneAnnotations(live.current.annotations) };
    setUndoStack(u => [...u.slice(-49), s]);
    setRedoStack([]);
  }

  function undo() {
    setUndoStack(u => {
      if (!u.length) return u;
      const prev = u[u.length - 1];
      const cur: UndoSnapshot = { items: cloneItems(live.current.boardItems), annotations: cloneAnnotations(live.current.annotations) };
      setRedoStack(r => [...r, cur]);
      setBoardItems(prev.items); setAnnotations(prev.annotations); log("↩ Undo");
      return u.slice(0, -1);
    });
  }

  function redo() {
    setRedoStack(r => {
      if (!r.length) return r;
      const next = r[r.length - 1];
      const cur: UndoSnapshot = { items: cloneItems(live.current.boardItems), annotations: cloneAnnotations(live.current.annotations) };
      setUndoStack(u => [...u, cur]);
      setBoardItems(next.items); setAnnotations(next.annotations); log("↪ Redo");
      return r.slice(0, -1);
    });
  }

  // ── Add board ──────────────────────────────────────────────────────────────

  function addBoard(kind: StructureKind) {
    snapshot();
    const { canvasOffset: o, zoom: z } = live.current;
    const slot = addBoardCountRef.current++;
    const pos = {
      x: (200 - o.x) / z + (slot % 5) * 18,
      y: (120 - o.y) / z + (Math.floor(slot / 5) % 4) * 18,
    };
    let board: BoardItem;
    if (kind === "array") board = { id: uid(), kind, position: pos, label: "Array", cells: [], selectedCells: [] };
    else if (kind === "linkedlist") board = { id: uid(), kind, position: pos, label: "List", nodes: [], selectedNodes: [] };
    else if (kind === "hashmap") board = {
    id: uid(),
    kind: "hashmap",
    position: pos,
    label: "HashMap",
    entries: [],
    keyDraft: "",
    valueDraft: "",
    sortMode: "none",
    size: { width: 420 },
  };
    else board = { id: uid(), kind: "node", position: pos, label: "" };
    setBoardItems(p => [...p, board]);
    log(`➕ Added ${kind}`);
  }

  function removeBoard(id: string) {
    snapshot();
    const b = live.current.boardItems.find(b => b.id === id);
    setBoardItems(p => p.filter(b => b.id !== id));
    setAnnotations(p => p.filter(a => {
      if (a.kind !== "arrow") return true;
      const ar = a as ArrowAnnotation;
      return ar.fromNodeId !== id && ar.toNodeId !== id;
    }));
    if (selectedBoardId === id) setSelectedBoardId(null);
    log(`🗑 Removed ${b?.kind ?? "item"}`);
  }

  // ── Array ops ──────────────────────────────────────────────────────────────

  function arrayAddCell(bid: string) {
    snapshot();
    const cell: ArrayCell = { id: uid(), value: "", anim: "add" };
    setBoardItems(p => p.map(b => b.id !== bid ? b : { ...b, cells: [...(b as ArrayBoard).cells, cell] } as ArrayBoard));
    log("+ Cell added");
    setTimeout(() => setBoardItems(p => p.map(b => b.id !== bid ? b : { ...b, cells: (b as ArrayBoard).cells.map(c => c.id === cell.id ? { ...c, anim: undefined } : c) } as ArrayBoard)), 350);
  }

  function arrayRemoveCell(bid: string, cid: string, val: string) {
    snapshot();
    setBoardItems(p => p.map(b => b.id !== bid ? b : { ...b, cells: (b as ArrayBoard).cells.map(c => c.id === cid ? { ...c, anim: "remove" } : c), selectedCells: (b as ArrayBoard).selectedCells.filter(x => x !== cid) } as ArrayBoard));
    log(`✖ Removed cell "${val || "∅"}"`);
    setTimeout(() => setBoardItems(p => p.map(b => b.id !== bid ? b : { ...b, cells: (b as ArrayBoard).cells.filter(c => c.id !== cid) } as ArrayBoard)), 290);
  }

  function arrayToggleSelect(bid: string, cid: string) {
    setBoardItems(p => p.map(b => {
      if (b.id !== bid) return b;
      const ab = b as ArrayBoard;
      const sel = ab.selectedCells.includes(cid) ? ab.selectedCells.filter(x => x !== cid) : ab.selectedCells.length < 2 ? [...ab.selectedCells, cid] : ab.selectedCells;
      return { ...ab, selectedCells: sel };
    }));
  }

  function arraySwap(bid: string) {
    const ab = live.current.boardItems.find(b => b.id === bid) as ArrayBoard;
    if (!ab || ab.selectedCells.length !== 2) return;
    snapshot();
    const [a, b2] = ab.selectedCells;
    const va = ab.cells.find(c => c.id === a)?.value ?? "", vb = ab.cells.find(c => c.id === b2)?.value ?? "";
    setBoardItems(p => p.map(b => b.id !== bid ? b : { ...b, selectedCells: [], cells: (b as ArrayBoard).cells.map(c => c.id === a ? { ...c, value: vb, anim: "swap" } : c.id === b2 ? { ...c, value: va, anim: "swap" } : c) } as ArrayBoard));
    log(`⇄ Swapped "${va}" ↔ "${vb}"`);
    setTimeout(() => setBoardItems(p => p.map(b => b.id !== bid ? b : { ...b, cells: (b as ArrayBoard).cells.map(c => c.id === a || c.id === b2 ? { ...c, anim: undefined } : c) } as ArrayBoard)), 460);
  }

  function arrayUpdateCell(bid: string, cid: string, value: string) {
    setBoardItems(p => p.map(b => b.id !== bid ? b : { ...b, cells: (b as ArrayBoard).cells.map(c => c.id === cid ? { ...c, value } : c) } as ArrayBoard));
  }

  // ── Linked List ops ────────────────────────────────────────────────────────

  function llAdd(bid: string, head = false) {
    snapshot();
    const node: LLNode = { id: uid(), value: "", anim: "add" };
    setBoardItems(p => p.map(b => b.id !== bid ? b : { ...b, nodes: head ? [node, ...(b as LinkedListBoard).nodes] : [...(b as LinkedListBoard).nodes, node] } as LinkedListBoard));
    log(`+ LL node at ${head ? "head" : "tail"}`);
    setTimeout(() => setBoardItems(p => p.map(b => b.id !== bid ? b : { ...b, nodes: (b as LinkedListBoard).nodes.map(n => n.id === node.id ? { ...n, anim: undefined } : n) } as LinkedListBoard)), 350);
  }

  function llRemoveNode(bid: string, nid: string, val: string) {
    snapshot();
    setBoardItems(p => p.map(b => b.id !== bid ? b : { ...b, nodes: (b as LinkedListBoard).nodes.map(n => n.id === nid ? { ...n, anim: "remove" } : n), selectedNodes: (b as LinkedListBoard).selectedNodes.filter(x => x !== nid) } as LinkedListBoard));
    log(`✖ LL node "${val || "∅"}" removed`);
    setTimeout(() => setBoardItems(p => p.map(b => b.id !== bid ? b : { ...b, nodes: (b as LinkedListBoard).nodes.filter(n => n.id !== nid) } as LinkedListBoard)), 290);
  }

  function llToggleSelect(bid: string, nid: string) {
    setBoardItems(p => p.map(b => {
      if (b.id !== bid) return b;
      const ll = b as LinkedListBoard;
      const sel = ll.selectedNodes.includes(nid) ? ll.selectedNodes.filter(x => x !== nid) : ll.selectedNodes.length < 2 ? [...ll.selectedNodes, nid] : ll.selectedNodes;
      return { ...ll, selectedNodes: sel };
    }));
  }

  function llSwap(bid: string) {
    const ll = live.current.boardItems.find(b => b.id === bid) as LinkedListBoard;
    if (!ll || ll.selectedNodes.length !== 2) return;
    snapshot();
    const [a, b2] = ll.selectedNodes;
    const va = ll.nodes.find(n => n.id === a)?.value ?? "", vb = ll.nodes.find(n => n.id === b2)?.value ?? "";
    setBoardItems(p => p.map(b => b.id !== bid ? b : { ...b, selectedNodes: [], nodes: (b as LinkedListBoard).nodes.map(n => n.id === a ? { ...n, value: vb, anim: "swap" } : n.id === b2 ? { ...n, value: va, anim: "swap" } : n) } as LinkedListBoard));
    log(`⇄ LL swapped "${va}" ↔ "${vb}"`);
    setTimeout(() => setBoardItems(p => p.map(b => b.id !== bid ? b : { ...b, nodes: (b as LinkedListBoard).nodes.map(n => n.id === a || n.id === b2 ? { ...n, anim: undefined } : n) } as LinkedListBoard)), 460);
  }

  function llReverse(bid: string) {
    snapshot();
    setBoardItems(p => p.map(b => b.id !== bid ? b : { ...b, nodes: [...(b as LinkedListBoard).nodes].reverse() } as LinkedListBoard));
    log("↺ List reversed");
  }

  function llUpdateNode(bid: string, nid: string, value: string) {
    setBoardItems(p => p.map(b => b.id !== bid ? b : { ...b, nodes: (b as LinkedListBoard).nodes.map(n => n.id === nid ? { ...n, value } : n) } as LinkedListBoard));
  }

  // ── Hashmap ops ────────────────────────────────────────────────────────────

  
  function hmAdd(bid: string, blank = false) {
    const hm = live.current.boardItems.find(b => b.id === bid) as HashmapBoard | undefined
    if (!hm) return
    if (!blank && !hm.keyDraft.trim()) return

    const newKey = blank ? "" : hm.keyDraft.trim()
    // Only check duplicates for non-blank entries with a key
    if (!blank && newKey && hm.entries.some(e => e.key === newKey)) {
      setHmDupAlert({ bid, key: newKey })
      return
    }

    snapshot()
    const entry: HashEntry = {
      id: uid(),
      key: newKey,
      value: blank ? "" : hm.valueDraft,
    }
    setBoardItems(p =>
      p.map(b =>
        b.id !== bid ? b : {
          ...(b as HashmapBoard),
          entries: [...(b as HashmapBoard).entries, entry],
          keyDraft: blank ? (b as HashmapBoard).keyDraft : "",
          valueDraft: blank ? (b as HashmapBoard).valueDraft : "",
        }
      )
    )
    log(blank ? "HM blank entry added" : `HM set ${entry.key}:${entry.value}`)
  }

  function hmRemove(bid: string, eid: string, key: string) {
    snapshot()
    setBoardItems(p =>
      p.map(b =>
        b.id !== bid
          ? b
          : {
              ...(b as HashmapBoard),
              entries: (b as HashmapBoard).entries.filter(e => e.id !== eid),
            }
      )
    )
    log(`HM removed key ${key}`)
  }

  function hmUpdateDraft(bid: string, field: "keyDraft" | "valueDraft", val: string) {
    setBoardItems(p =>
      p.map(b =>
        b.id !== bid
          ? b
          : {
              ...(b as HashmapBoard),
              [field]: val,
            }
      )
    )
  }

  function hmUpdateEntry(bid: string, eid: string, field: "key" | "value", val: string) {
    setBoardItems(p =>
      p.map(b =>
        b.id !== bid
          ? b
          : {
              ...(b as HashmapBoard),
              entries: (b as HashmapBoard).entries.map(e =>
                e.id === eid ? { ...e, [field]: val } : e
              ),
            }
      )
    )
  }

  function hmSetSort(bid: string, sortMode: "none" | "key" | "value") {
    snapshot()
    setBoardItems(p =>
      p.map(b => {
        if (b.id !== bid) return b
        const hm = b as HashmapBoard
        const entries =
          sortMode === "none"
            ? hm.entries
            : [...hm.entries].sort((a, c) =>
                (sortMode === "key" ? a.key : a.value).localeCompare(
                  sortMode === "key" ? c.key : c.value
                )
              )

        return {
          ...hm,
          sortMode,
          entries,
        }
      })
    )
    log(sortMode === "none" ? "HM sort cleared" : `HM sorted by ${sortMode}`)
  }

  function hmResize(bid: string, width: number) {
    setBoardItems(p =>
      p.map(b =>
        b.id !== bid ? b : {
          ...(b as HashmapBoard),
          size: { width: Math.max(240, width) },
        }
      )
    )
  }

  // ── Graph ops ──────────────────────────────────────────────────────────────

  function nodeUpdateLabel(nid: string, label: string) {
    setBoardItems(p => p.map(b => b.id !== nid ? b : { ...b, label } as GraphNode));
  }

  function getNodeById(id: string) {
    const item = live.current.boardItems.find(b => b.id === id);
    return item?.kind === "node" ? item as GraphNode : null;
  }

  function runTraversal(startId: string, mode: "bfs" | "dfs") {
    const adj = buildAdjacency(live.current.boardItems, live.current.annotations);
    const visited = new Set<string>();
    const order: string[] = [];

    if (mode === "bfs") {
      const queue = [startId]; visited.add(startId);
      while (queue.length) {
        const curr = queue.shift()!; order.push(curr);
        for (const nb of adj[curr] ?? []) if (!visited.has(nb)) { visited.add(nb); queue.push(nb); }
      }
    } else {
      const stack = [startId];
      while (stack.length) {
        const curr = stack.pop()!;
        if (visited.has(curr)) continue;
        visited.add(curr); order.push(curr);
        for (const nb of (adj[curr] ?? []).slice().reverse()) if (!visited.has(nb)) stack.push(nb);
      }
    }

    const getLabel = (id: string) => (live.current.boardItems.find(b => b.id === id) as GraphNode)?.label || "?";
    log(`${mode === "bfs" ? "🔍 BFS" : "🔎 DFS"}: ${order.map(getLabel).join(" → ")}`);

    // Animate traversal
    order.forEach((id, i) => {
      setTimeout(() => setBoardItems(p => p.map(b => b.id === id ? { ...b, highlight: i === 0 ? "current" : "visited" } as GraphNode : b)), i * 500);
    });
    setTimeout(() => setBoardItems(p => p.map(b => b.kind === "node" ? { ...b, highlight: undefined } as GraphNode : b)), order.length * 500 + 600);
  }

  // ── Annotation ops ─────────────────────────────────────────────────────────

  function removeAnnotation(id: string) {
    snapshot();
    setAnnotations(p => p.filter(a => a.id !== id));
    log("✖ Removed annotation");
  }

  function setGraphEdgeMode(nextMode: EdgeMode) {
    setEdgeMode(nextMode);

    const selectedGraphEdges = live.current.annotations.filter(
      (ann): ann is ArrowAnnotation =>
        ann.kind === "arrow" &&
        ann.selected &&
        !!ann.fromNodeId &&
        !!ann.toNodeId,
    );

    if (!selectedGraphEdges.length) return;

    snapshot();
    setAnnotations(p =>
      p.map(ann => {
        if (
          ann.kind !== "arrow" ||
          !ann.selected ||
          !ann.fromNodeId ||
          !ann.toNodeId
        ) {
          return ann;
        }

        return { ...ann, directed: nextMode === "directed" };
      }),
    );
    log(nextMode === "directed" ? "→ Selected graph edges set to directed" : "↔ Selected graph edges set to undirected");
  }

  // ── Canvas interaction ─────────────────────────────────────────────────────

  const clientToCanvas = (cx: number, cy: number) => ({
    x: (cx - live.current.canvasOffset.x) / live.current.zoom,
    y: (cy - live.current.canvasOffset.y) / live.current.zoom,
  });

  function handleCanvasDown(e: React.PointerEvent<HTMLDivElement>) {
    const target = e.target as HTMLElement;
    if (target.closest("[data-card]") || target.closest("[data-annotation]")) return;
    const { activeTool: tool } = live.current;

    if (tool === "arrow") {
      const { x, y } = clientToCanvas(e.clientX, e.clientY);
      setHoveredNodeId(null);
      setDragState({ kind: "arrow-draw", startX: x, startY: y, currentX: x, currentY: y });
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      return;
    }
    if (tool === "text") {
      const { x, y } = clientToCanvas(e.clientX, e.clientY);
      snapshot();
      setAnnotations(p => [...p, { id: uid(), kind: "text", x, y, text: "", width: 200, selected: false }]);
      log("💬 Added text box");
      setActiveTool("select");
      return;
    }
    setSelectedBoardId(null);
    setDragState({ kind: "pan", startClientX: e.clientX, startClientY: e.clientY, startOffsetX: live.current.canvasOffset.x, startOffsetY: live.current.canvasOffset.y });
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }

  function handleNodeConnectionStart(e: React.PointerEvent<HTMLDivElement>, nodeId: string) {
    if (live.current.activeTool !== "arrow") return;
    const node = getNodeById(nodeId);
    if (!node) return;
    const { x, y } = getNodeCenter(node);
    setSelectedBoardId(nodeId);
    setHoveredNodeId(null);
    setDragState({ kind: "arrow-draw", startX: x, startY: y, currentX: x, currentY: y, sourceNodeId: nodeId });
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function handleCanvasMove(e: React.PointerEvent<HTMLDivElement>) {
    const ds = live.current.dragState;
    if (!ds) return;
    if (ds.kind === "pan") {
      setCanvasOffset({ x: ds.startOffsetX + e.clientX - ds.startClientX, y: ds.startOffsetY + e.clientY - ds.startClientY });
    } else if (ds.kind === "arrow-draw") {
      const { x, y } = clientToCanvas(e.clientX, e.clientY);
      const nearby = findNearbyNode(x, y, live.current.boardItems);
      setHoveredNodeId(nearby && nearby.id !== ds.sourceNodeId ? nearby.id : null);
      setDragState({ ...ds, currentX: x, currentY: y });
    } else if (ds.kind === "card") {
      const { zoom: z, canvasOffset: o } = live.current;
      const cx = (e.clientX - ds.pointerOffsetX - o.x) / z;
      const cy = (e.clientY - ds.pointerOffsetY - o.y) / z;
      if (ds.isAnnotation) {
        setAnnotations(p => p.map(a => a.id === ds.id ? { ...a, x: cx, y: cy } : a));
      } else {
        setBoardItems(p => p.map(b => b.id === ds.id ? { ...b, position: { x: cx, y: cy } } : b));
      }
    }
  }

  function handleCanvasUp() {
    const ds = live.current.dragState;
    if (!ds) return;
    if (ds.kind === "arrow-draw") {
      const dx = ds.currentX - ds.startX, dy = ds.currentY - ds.startY;
      const dragDistance = Math.hypot(dx, dy);
      if (ds.sourceNodeId) {
        const fromNode = getNodeById(ds.sourceNodeId);
        const toNode = hoveredNodeId ? getNodeById(hoveredNodeId) : findNearbyNode(ds.currentX, ds.currentY, live.current.boardItems);
        if (fromNode && toNode && fromNode.id !== toNode.id) {
          const start = getNodeCenter(fromNode);
          const end = getNodeCenter(toNode);
          snapshot();
          const ann: ArrowAnnotation = {
            id: uid(),
            kind: "arrow",
            x1: start.x,
            y1: start.y,
            x2: end.x,
            y2: end.y,
            label: "",
            selected: false,
            fromNodeId: fromNode.id,
            toNodeId: toNode.id,
            directed: edgeMode === "directed",
          };
          setAnnotations(p => [...p, ann]);
          log(`${edgeMode === "directed" ? "→" : "↔"} Connected ${fromNode.label || "?"} ${edgeMode === "directed" ? "→" : "↔"} ${toNode.label || "?"}`);
        }
      } else if (dragDistance > 15) {
        const items = live.current.boardItems;
        const fromNode = findNearbyNode(ds.startX, ds.startY, items);
        const toNode = findNearbyNode(ds.currentX, ds.currentY, items);
        snapshot();
        const ann: ArrowAnnotation = {
          id: uid(), kind: "arrow",
          x1: fromNode ? fromNode.position.x + NODE_RADIUS : ds.startX,
          y1: fromNode ? fromNode.position.y + NODE_RADIUS : ds.startY,
          x2: toNode ? toNode.position.x + NODE_RADIUS : ds.currentX,
          y2: toNode ? toNode.position.y + NODE_RADIUS : ds.currentY,
          label: "", selected: false,
          fromNodeId: fromNode?.id, toNodeId: toNode?.id,
          directed: edgeMode === "directed",
        };
        setAnnotations(p => [...p, ann]);
        if (fromNode && toNode) {
          log(`${edgeMode === "directed" ? "→" : "↔"} Connected ${fromNode.label || "?"} ${edgeMode === "directed" ? "→" : "↔"} ${toNode.label || "?"}`);
        } else {
          log(edgeMode === "directed" ? "→ Drew arrow" : "↔ Drew edge");
        }
      }
      setHoveredNodeId(null);
      setActiveTool("select");
    }
    setDragState(null);
  }

  function handleCardDragStart(e: React.PointerEvent<HTMLElement>, id: string, isAnnotation: boolean, posX: number, posY: number) {
    if (live.current.activeTool !== "select") return;
    snapshot();
    const { zoom: z, canvasOffset: o } = live.current;
    setDragState({ kind: "card", id, isAnnotation, pointerOffsetX: e.clientX - (posX * z + o.x), pointerOffsetY: e.clientY - (posY * z + o.y) });
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }

  // ── Zoom ──────────────────────────────────────────────────────────────────

  useEffect(() => {
    const el = canvasRef.current; if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const { zoom: oz, canvasOffset: oo } = live.current;
      const nz = Math.min(3, Math.max(0.2, oz * (e.deltaY < 0 ? 1.1 : 0.909)));
      setZoom(nz);
      setCanvasOffset({ x: e.clientX - (e.clientX - oo.x) * (nz / oz), y: e.clientY - (e.clientY - oo.y) * (nz / oz) });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  // ── Keyboard ──────────────────────────────────────────────────────────────

  const handleWindowKeyDown = useEffectEvent((e: KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "z") { e.preventDefault(); undo(); }
    if ((e.ctrlKey || e.metaKey) && (e.key === "y" || (e.shiftKey && e.key === "z"))) { e.preventDefault(); redo(); }
    if ((e.ctrlKey || e.metaKey) && e.key === "=") { e.preventDefault(); setZoom(z => Math.min(3, z * 1.1)); }
    if ((e.ctrlKey || e.metaKey) && e.key === "-") { e.preventDefault(); setZoom(z => Math.max(0.2, z * 0.909)); }
    if (e.key === "Escape") setActiveTool("select");
  });

  useEffect(() => {
    const fn = (e: KeyboardEvent) => handleWindowKeyDown(e);
    window.addEventListener("keydown", fn);
    return () => window.removeEventListener("keydown", fn);
  }, []);

  // ── PDF export ────────────────────────────────────────────────────────────

  function exportPDF() {
    const xs: number[] = [], ys: number[] = [];
    boardItems.forEach(b => { xs.push(b.position.x, b.position.x + 300); ys.push(b.position.y, b.position.y + 120); });
    annotations.forEach(a => {
      if (a.kind === "arrow") { xs.push(a.x1, a.x2); ys.push(a.y1, a.y2); }
      if (a.kind === "text") { xs.push(a.x, a.x + a.width); ys.push(a.y, a.y + 80); }
    });
    if (!xs.length) { window.print(); return; }
    const pad = 60, minX = Math.min(...xs) - pad, minY = Math.min(...ys) - pad;
    const maxX = Math.max(...xs) + pad, maxY = Math.max(...ys) + pad;
    const nz = Math.min(window.innerWidth / (maxX - minX), window.innerHeight / (maxY - minY), 1.5);
    const sz = zoom, so = canvasOffset;
    setZoom(nz); setCanvasOffset({ x: -minX * nz, y: -minY * nz });
    requestAnimationFrame(() => window.print());
    setTimeout(() => { setZoom(sz); setCanvasOffset(so); }, 800);
  }

  // ── Render helpers ─────────────────────────────────────────────────────────

  const previewArrow = dragState?.kind === "arrow-draw" ? dragState : null;
  const connectedNodeIds = getConnectedNodeIds(annotations);
  const selectedNode =
    selectedBoardId && boardItems.find(b => b.id === selectedBoardId)?.kind === "node"
      ? boardItems.find(b => b.id === selectedBoardId) as GraphNode
      : null;

  // Highlight colors for graph traversal
  const nodeHighlightBg = (h?: string) => h === "current" ? "#fbbf24" : h === "visited" ? "#86efac" : "white";
  const nodeHighlightBorder = (h?: string) => h === "current" ? "#d97706" : h === "visited" ? "#16a34a" : "#8b5cf6";

  // ─── Toolbar buttons style ────────────────────────────────────────────────
  const tbBtn = (active = false) =>
    `px-2.5 py-1 rounded text-xs font-medium transition-colors cursor-pointer border ${active ? "bg-blue-600 text-white border-blue-600" : "bg-white text-slate-600 border-slate-200 hover:border-slate-400 hover:text-slate-800"}`;

  return (
    <div className="flex flex-col" style={{ height: "100dvh", overflow: "hidden", background: "#f8fafc", fontFamily: "var(--font-geist-sans), sans-serif" }}>

      {/* ── Toolbar ── */}
      <div className="no-print flex items-center gap-1.5 px-3 py-2 border-b border-slate-200 select-none bg-white shadow-sm flex-wrap" style={{ zIndex: 50 }}>
        <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-2.5 py-1 shadow-sm" aria-label="Project branding">
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[linear-gradient(135deg,#0ea5e9,#2563eb)] text-[11px] font-black text-white">f</span>
          <span className="text-sm font-extrabold tracking-tight text-slate-900">fishbowl</span>
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">board</span>
        </div>
        <input
          value={whiteboardName}
          onChange={e => setWhiteboardName(e.target.value)}
          className="px-2.5 py-1 rounded text-xs font-medium bg-white text-slate-700 border border-slate-200 w-[170px] outline-none focus:border-slate-400"
          aria-label="Whiteboard name"
        />

        <div className="w-px h-5 bg-slate-200 mx-1" />

        {/* Tools */}
        {(["select", "arrow", "text"] as Tool[]).map(t => (
          <button key={t} onClick={() => setActiveTool(t)} className={tbBtn(activeTool === t)}>
            {t === "select" ? "↖ Select" : t === "arrow" ? "→ Arrow" : "T Text"}
          </button>
        ))}

        <div className="w-px h-5 bg-slate-200 mx-1" />

        <span className="text-xs text-slate-400">Edges:</span>
        <button onClick={() => setGraphEdgeMode("directed")} className={tbBtn(edgeMode === "directed")}>A → B</button>
        <button onClick={() => setGraphEdgeMode("undirected")} className={tbBtn(edgeMode === "undirected")}>A ↔ B</button>

        {activeTool === "arrow" && !selectedNode && (
          <span className="text-xs text-slate-500 ml-1">
            Select a node, then drag to another node
          </span>
        )}

        {activeTool === "arrow" && selectedNode && (
          <span className="text-xs text-violet-600 font-medium ml-1">
            Drag from {selectedNode.label || "selected node"} to connect
          </span>
        )}

        <div className="w-px h-5 bg-slate-200 mx-1" />

        {/* Undo/Redo */}
        <button onClick={undo} disabled={!undoStack.length} className={`${tbBtn()} disabled:opacity-30`} title="Ctrl+Z">↩</button>
        <button onClick={redo} disabled={!redoStack.length} className={`${tbBtn()} disabled:opacity-30`} title="Ctrl+Y">↪</button>

        <div className="w-px h-5 bg-slate-200 mx-1" />

        {/* Zoom */}
        <button onClick={() => setZoom(z => Math.max(0.2, z * 0.909))} className={tbBtn()}>−</button>
        <span className="text-xs text-slate-500 w-10 text-center">{Math.round(zoom * 100)}%</span>
        <button onClick={() => setZoom(z => Math.min(3, z * 1.1))} className={tbBtn()}>+</button>
        <button onClick={() => { setZoom(1); setCanvasOffset({ x: 80, y: 80 }); }} className={tbBtn()}>⌂</button>

        <div className="flex-1" />

        {/* Activity toggle + PDF */}
        <button
          onClick={() => setShowHistory(v => !v)}
          className={tbBtn(showHistory)}
          title="Activity"
          aria-label="Activity"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
            <path d="M2 3.25h10M2 7h10M2 10.75h6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
          </svg>
        </button>
        <button onClick={exportPDF} className="px-2.5 py-1 rounded text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 transition-colors">⬇ PDF</button>
      </div>

      {/* ── Body ── */}
      <div className="flex flex-1 overflow-hidden">

        {/* ── Canvas ── */}
        <div
          ref={canvasRef}
          className="flex-1 relative overflow-hidden"
          style={{
            background: "radial-gradient(circle, #e2e8f0 1px, transparent 1px)",
            backgroundSize: "24px 24px",
            cursor: activeTool === "arrow" ? "crosshair" : activeTool === "text" ? "text" : dragState?.kind === "pan" ? "grabbing" : "default",
          }}
          onPointerDown={handleCanvasDown}
          onPointerMove={handleCanvasMove}
          onPointerUp={handleCanvasUp}
        >
          {/* Insert objects (vertical bar) */}
          <div
            className="no-print absolute left-2 top-1/2 -translate-y-1/2 z-20 flex flex-col gap-1.5 rounded-lg border border-slate-200 bg-white p-2 shadow-sm"
            onPointerDown={e => e.stopPropagation()}
          >
            <button title="Array" onClick={() => addBoard("array")} className="px-2 py-1 rounded text-xs font-semibold bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 transition-colors cursor-pointer">[ ]</button>
            <button title="List" onClick={() => addBoard("linkedlist")} className="px-2 py-1 rounded text-xs font-semibold bg-green-50 hover:bg-green-100 text-green-700 border border-green-200 transition-colors cursor-pointer">◯→</button>
            <button title="HashMap" onClick={() => addBoard("hashmap")} className="px-2 py-1 rounded text-xs font-semibold bg-orange-50 hover:bg-orange-100 text-orange-700 border border-orange-200 transition-colors cursor-pointer">⊟</button>
            <button title="Node" onClick={() => addBoard("node")} className="px-2 py-1 rounded text-xs font-semibold bg-violet-50 hover:bg-violet-100 text-violet-700 border border-violet-200 transition-colors cursor-pointer">◯</button>
            <div className="my-0.5 h-px bg-slate-200" />
            <button onClick={undo} disabled={!undoStack.length} className="px-2 py-1 rounded text-xs font-medium transition-colors cursor-pointer border bg-white text-slate-600 border-slate-200 hover:border-slate-400 hover:text-slate-800 disabled:opacity-30" title="Ctrl+Z">↩</button>
            <button onClick={redo} disabled={!redoStack.length} className="px-2 py-1 rounded text-xs font-medium transition-colors cursor-pointer border bg-white text-slate-600 border-slate-200 hover:border-slate-400 hover:text-slate-800 disabled:opacity-30" title="Ctrl+Y">↪</button>
          </div>

          <div style={{ position: "absolute", width: 5000, height: 4000, transform: `translate(${canvasOffset.x}px,${canvasOffset.y}px) scale(${zoom})`, transformOrigin: "0 0" }}>

            {/* SVG arrow layer */}
            <svg style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none", overflow: "visible" }}>
              <defs>
                <marker id="ah" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto"><polygon points="0 0,8 3,0 6" fill="#64748b" /></marker>
                <marker id="ah-sel" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto"><polygon points="0 0,8 3,0 6" fill="#f97316" /></marker>
                <marker id="ah-graph" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto"><polygon points="0 0,8 3,0 6" fill="#8b5cf6" /></marker>
              </defs>

              {annotations.filter(a => a.kind === "arrow").map(a => {
                const ar = a as ArrowAnnotation;
                const isGraph = !!(ar.fromNodeId || ar.toNodeId);
                const fn = ar.fromNodeId ? boardItems.find(b => b.id === ar.fromNodeId) as GraphNode | undefined : undefined;
                const tn = ar.toNodeId ? boardItems.find(b => b.id === ar.toNodeId) as GraphNode | undefined : undefined;
                const start = fn ? getNodeCenter(fn) : { x: ar.x1, y: ar.y1 };
                const end = tn ? getNodeCenter(tn) : { x: ar.x2, y: ar.y2 };
                const segment = getSegmentPoints(
                  start,
                  end,
                  fn ? NODE_RADIUS - EDGE_NODE_OVERLAP : 0,
                  tn ? NODE_RADIUS - EDGE_NODE_OVERLAP : 0,
                );
                const color = ar.selected ? "#f97316" : isGraph ? "#8b5cf6" : "#64748b";
                const marker = ar.selected ? "url(#ah-sel)" : isGraph ? "url(#ah-graph)" : "url(#ah)";
                return (
                  <g key={ar.id} style={{ pointerEvents: "stroke" }} data-annotation
                    onClick={() => {
                      setAnnotations(p => p.map(x => x.id === ar.id ? { ...x, selected: !ar.selected } : x));
                      setEdgeMode(ar.directed === false ? "undirected" : "directed");
                    }}
                    onDoubleClick={() => removeAnnotation(ar.id)}>
                    {/* Wider invisible hit area */}
                    <line x1={segment.x1} y1={segment.y1} x2={segment.x2} y2={segment.y2} stroke="transparent" strokeWidth={12} style={{ pointerEvents: "stroke" }} />
                    <line
                      x1={segment.x1}
                      y1={segment.y1}
                      x2={segment.x2}
                      y2={segment.y2}
                      stroke={color}
                      strokeWidth={ar.selected ? 2.5 : 1.8}
                      markerEnd={ar.directed === false ? undefined : marker}
                    />
                    {ar.label && <text x={(segment.x1 + segment.x2) / 2} y={(segment.y1 + segment.y2) / 2 - 6} fill={color} fontSize={11} textAnchor="middle">{ar.label}</text>}
                  </g>
                );
              })}

              {previewArrow && (() => {
                const previewSegment = getSegmentPoints(
                  { x: previewArrow.startX, y: previewArrow.startY },
                  { x: previewArrow.currentX, y: previewArrow.currentY },
                  previewArrow.sourceNodeId ? NODE_RADIUS - EDGE_NODE_OVERLAP : 0,
                  hoveredNodeId ? NODE_RADIUS - EDGE_NODE_OVERLAP : 0,
                );

                return (
                  <line x1={previewSegment.x1} y1={previewSegment.y1} x2={previewSegment.x2} y2={previewSegment.y2}
                    stroke="#64748b" strokeWidth={1.5} strokeDasharray="6 3" opacity={0.7} markerEnd={edgeMode === "directed" ? "url(#ah)" : undefined} />
                );
              })()}
            </svg>

            {/* ── Array boards ── */}
            {boardItems.filter(b => b.kind === "array").map(item => {
              const ab = item as ArrayBoard;
              return (
                <div key={ab.id} data-card
                  style={{ position: "absolute", left: ab.position.x, top: ab.position.y, userSelect: "none", animation: "fadeSlideIn 0.2s ease" }}
                  onPointerDown={e => { if ((e.target as HTMLElement).tagName !== "INPUT") { setSelectedBoardId(ab.id); handleCardDragStart(e, ab.id, false, ab.position.x, ab.position.y); } }}
                  onClick={() => setSelectedBoardId(ab.id)}
                >
                  {/* Label row */}
                  <div className="flex items-center gap-1 mb-1">
                    <input value={ab.label} onChange={e => setBoardItems(p => p.map(b => b.id === ab.id ? { ...b, label: e.target.value } as ArrayBoard : b))}
                      onPointerDown={e => e.stopPropagation()}
                      className="text-xs font-bold text-blue-600 bg-transparent outline-none w-24" />
                    {ab.selectedCells.length === 2 && (
                      <button onPointerDown={e => e.stopPropagation()} onClick={() => arraySwap(ab.id)}
                        className="text-xs px-1.5 py-0.5 rounded bg-amber-100 hover:bg-amber-200 text-amber-700 border border-amber-300 font-bold">⇄ Swap</button>
                    )}
                    <button onPointerDown={e => e.stopPropagation()} onClick={() => removeBoard(ab.id)}
                      className="text-slate-300 hover:text-red-500 text-xs ml-auto transition-colors" title="Double-click or click × to remove">×</button>
                  </div>
                  {/* Cells */}
                  <div className="flex items-end" onDoubleClick={() => removeBoard(ab.id)} title="Double-click background to remove array">
                    {ab.cells.map((cell, idx) => {
                      const sel = ab.selectedCells.includes(cell.id);
                      let anim: React.CSSProperties = {};
                      if (cell.anim === "add") anim = { animation: "cellAdd 0.35s cubic-bezier(.34,1.56,.64,1) forwards" };
                      if (cell.anim === "remove") anim = { animation: "cellRemove 0.28s ease forwards", pointerEvents: "none" };
                      if (cell.anim === "swap") anim = { animation: "cellSwap 0.46s ease" };
                      return (
                        <div key={cell.id} style={{ position: "relative", ...anim }}>
                          <span style={{ position: "absolute", top: -14, left: 0, right: 0, textAlign: "center", fontSize: 9, color: "#94a3b8" }}>{idx}</span>
                          <div style={{
                            width: 42, height: 42, border: sel ? "2px solid #f59e0b" : "1px solid #93c5fd", borderRight: "none",
                            background: sel ? "#fef3c7" : "white", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer",
                          }}
                            onClick={e => { e.stopPropagation(); arrayToggleSelect(ab.id, cell.id); }}
                            onDoubleClick={e => { e.stopPropagation(); arrayRemoveCell(ab.id, cell.id, cell.value); }}
                            title="Click to select • Double-click to remove">
                            <input value={cell.value} onChange={e => arrayUpdateCell(ab.id, cell.id, e.target.value)}
                              onClick={e => e.stopPropagation()} onPointerDown={e => e.stopPropagation()}
                              style={{ width: "100%", textAlign: "center", fontSize: 13, fontWeight: 600, background: "transparent", border: "none", outline: "none", color: sel ? "#d97706" : "#1e40af" }} />
                          </div>
                        </div>
                      );
                    })}
                    {ab.cells.length > 0 && <div style={{ width: 1, height: 42, background: "#93c5fd" }} />}
                    <button onPointerDown={e => e.stopPropagation()} onClick={() => arrayAddCell(ab.id)}
                      style={{ width: 28, height: 42, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, color: "#93c5fd", background: "none", border: "none", cursor: "pointer" }}
                      onMouseEnter={e => (e.currentTarget.style.color = "#3b82f6")} onMouseLeave={e => (e.currentTarget.style.color = "#93c5fd")}>+</button>
                  </div>
                </div>
              );
            })}

            {/* ── Linked List boards ── */}
            {boardItems.filter(b => b.kind === "linkedlist").map(item => {
              const ll = item as LinkedListBoard;
              return (
                <div key={ll.id} data-card
                  style={{ position: "absolute", left: ll.position.x, top: ll.position.y, userSelect: "none", animation: "fadeSlideIn 0.2s ease" }}
                  onPointerDown={e => { if ((e.target as HTMLElement).tagName !== "INPUT") { setSelectedBoardId(ll.id); handleCardDragStart(e, ll.id, false, ll.position.x, ll.position.y); } }}
                  onClick={() => setSelectedBoardId(ll.id)}
                >
                  {/* Header */}
                  <div className="flex items-center gap-1 mb-1">
                    <input value={ll.label} onChange={e => setBoardItems(p => p.map(b => b.id === ll.id ? { ...b, label: e.target.value } as LinkedListBoard : b))}
                      onPointerDown={e => e.stopPropagation()}
                      className="text-xs font-bold text-green-700 bg-transparent outline-none w-24" />
                    <button onPointerDown={e => e.stopPropagation()} onClick={() => llAdd(ll.id, true)}
                      className="text-xs px-1.5 py-0.5 rounded bg-green-50 hover:bg-green-100 text-green-700 border border-green-200">⊕ Head</button>
                    {ll.selectedNodes.length === 2 && (
                      <button onPointerDown={e => e.stopPropagation()} onClick={() => llSwap(ll.id)}
                        className="text-xs px-1.5 py-0.5 rounded bg-amber-100 hover:bg-amber-200 text-amber-700 border border-amber-300 font-bold">⇄</button>
                    )}
                    <button onPointerDown={e => e.stopPropagation()} onClick={() => llReverse(ll.id)}
                      className="text-xs px-1.5 py-0.5 rounded bg-green-50 hover:bg-green-100 text-green-700 border border-green-200">↺ Rev</button>
                    <button onPointerDown={e => e.stopPropagation()} onClick={() => removeBoard(ll.id)}
                      className="text-slate-300 hover:text-red-500 text-xs ml-1">×</button>
                  </div>
                  {/* Nodes row */}
                  <div className="flex items-center gap-0" onDoubleClick={() => removeBoard(ll.id)}>
                    {ll.nodes.map((node, idx) => {
                      const sel = ll.selectedNodes.includes(node.id);
                      let anim: React.CSSProperties = {};
                      if (node.anim === "add") anim = { animation: "cellAdd 0.35s cubic-bezier(.34,1.56,.64,1) forwards" };
                      if (node.anim === "remove") anim = { animation: "cellRemove 0.28s ease forwards", pointerEvents: "none" };
                      if (node.anim === "swap") anim = { animation: "cellSwap 0.46s ease" };
                      return (
                        <div key={node.id} className="flex items-center" style={anim}>
                          <div style={{
                            width: 40, height: 40, borderRadius: 6,
                            border: sel ? "2px solid #f59e0b" : "1.5px solid #86efac",
                            background: sel ? "#fef3c7" : "white",
                            display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer",
                            boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
                          }}
                            onClick={e => { e.stopPropagation(); llToggleSelect(ll.id, node.id); }}
                            onDoubleClick={e => { e.stopPropagation(); llRemoveNode(ll.id, node.id, node.value); }}
                            title={`[${idx}] Click to select • Double-click to remove`}>
                            <input value={node.value} onChange={e => llUpdateNode(ll.id, node.id, e.target.value)}
                              onClick={e => e.stopPropagation()} onPointerDown={e => e.stopPropagation()}
                              style={{ width: "100%", textAlign: "center", fontSize: 12, fontWeight: 600, background: "transparent", border: "none", outline: "none", color: sel ? "#d97706" : "#15803d" }} />
                          </div>
                          {idx < ll.nodes.length - 1 && <span style={{ fontSize: 14, color: "#86efac", margin: "0 2px", userSelect: "none" }}>→</span>}
                        </div>
                      );
                    })}
                    {ll.nodes.length > 0 && <span style={{ fontSize: 13, color: "#86efac", margin: "0 4px" }}>→ ∅</span>}
                    <button onPointerDown={e => e.stopPropagation()} onClick={() => llAdd(ll.id, false)}
                      style={{ width: 28, height: 28, borderRadius: "50%", border: "1.5px dashed #86efac", background: "none", color: "#86efac", cursor: "pointer", fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center", marginLeft: 4 }}
                      onMouseEnter={e => (e.currentTarget.style.color = "#16a34a")} onMouseLeave={e => (e.currentTarget.style.color = "#86efac")}>+</button>
                  </div>
                </div>
              );
            })}

            {/* ── Hashmap boards ── */}
            {boardItems.filter(b => b.kind === "hashmap").map(item => {
              const hm = item as HashmapBoard
              return (
                <div
                  key={hm.id}
                  data-card
                  style={{
                    position: "absolute",
                    left: hm.position.x,
                    top: hm.position.y,
                    width: hm.size.width,
                    minWidth: 240,
                    userSelect: "none",
                    animation: "fadeSlideIn 0.2s ease",
                  }}
                  onPointerDown={e => {
                    if (!["INPUT", "BUTTON", "SELECT"].includes((e.target as HTMLElement).tagName)) {
                      setSelectedBoardId(hm.id)
                      handleCardDragStart(e, hm.id, false, hm.position.x, hm.position.y)
                    }
                  }}
                  onClick={() => setSelectedBoardId(hm.id)}
                >
                  <div
                    style={{
                      background: "white",
                      borderRadius: 8,
                      border: "1.5px solid #fed7aa",
                      boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
                      overflow: "hidden",
                      width: "100%",
                      display: "flex",
                      flexDirection: "column",
                      resize: "horizontal",
                      minWidth: 240,
                    }}
                    onMouseUp={e => {
                      const el = e.currentTarget
                      hmResize(hm.id, el.offsetWidth)
                    }}
                  >
                    <div
                      className="flex items-center gap-1 px-2 py-1.5"
                      style={{ background: "#fff7ed", borderBottom: "1px solid #fed7aa" }}
                    >
                      <input
                        value={hm.label}
                        onChange={e =>
                          setBoardItems(p =>
                            p.map(b => (b.id === hm.id ? { ...b, label: e.target.value } as HashmapBoard : b))
                          )
                        }
                        onPointerDown={e => e.stopPropagation()}
                        className="text-xs font-bold text-orange-700 bg-transparent outline-none flex-1"
                      />
                      <span className="text-xs text-orange-400">{hm.entries.length} entries</span>
                      <button
                        onPointerDown={e => e.stopPropagation()}
                        onClick={() => hmSetSort(hm.id, hm.sortMode === "key" ? "none" : "key")}
                        className="text-xs px-1.5 py-0.5 rounded bg-orange-50 hover:bg-orange-100 text-orange-700 border border-orange-200"
                      >
                        Key
                      </button>
                      <button
                        onPointerDown={e => e.stopPropagation()}
                        onClick={() => hmSetSort(hm.id, hm.sortMode === "value" ? "none" : "value")}
                        className="text-xs px-1.5 py-0.5 rounded bg-orange-50 hover:bg-orange-100 text-orange-700 border border-orange-200"
                      >
                        Val
                      </button>
                      <button
                        onPointerDown={e => e.stopPropagation()}
                        onClick={() => removeBoard(hm.id)}
                        className="text-slate-300 hover:text-red-500 text-xs"
                      >
                        ×
                      </button>
                    </div>

                    <div>
                      {hm.entries.length > 0 && (
                        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                          <thead>
                            <tr style={{ background: "#fff7ed" }}>
                              <th
                                style={{
                                  padding: "3px 8px",
                                  textAlign: "left",
                                  color: "#9a3412",
                                  fontWeight: 600,
                                  borderBottom: "1px solid #fed7aa",
                                  width: "45%",
                                }}
                              >
                                key
                              </th>
                              <th
                                style={{
                                  padding: "3px 8px",
                                  textAlign: "left",
                                  color: "#9a3412",
                                  fontWeight: 600,
                                  borderBottom: "1px solid #fed7aa",
                                }}
                              >
                                value
                              </th>
                              <th style={{ width: 20 }} />
                            </tr>
                          </thead>
                          <tbody>
                            {hm.entries.map(entry => (
                              <tr
                                key={entry.id}
                                style={{ borderBottom: "1px solid #ffedd5" }}
                                onDoubleClick={() => hmRemove(hm.id, entry.id, entry.key)}
                                title="Double-click to remove"
                              >
                                <td style={{ padding: "3px 8px" }}>
                                  <input
                                    value={entry.key}
                                    onChange={e => hmUpdateEntry(hm.id, entry.id, "key", e.target.value)}
                                    onPointerDown={e => e.stopPropagation()}
                                    style={{
                                      width: "100%",
                                      background: "none",
                                      border: "none",
                                      outline: "none",
                                      fontSize: 12,
                                      color: "#c2410c",
                                      fontWeight: 600,
                                    }}
                                  />
                                </td>
                                <td style={{ padding: "3px 8px" }}>
                                  <input
                                    value={entry.value}
                                    onChange={e => hmUpdateEntry(hm.id, entry.id, "value", e.target.value)}
                                    onPointerDown={e => e.stopPropagation()}
                                    style={{
                                      width: "100%",
                                      background: "none",
                                      border: "none",
                                      outline: "none",
                                      fontSize: 12,
                                      color: "#1e293b",
                                    }}
                                  />
                                </td>
                                <td>
                                  <button
                                    onPointerDown={e => e.stopPropagation()}
                                    onClick={() => hmRemove(hm.id, entry.id, entry.key)}
                                    style={{
                                      background: "none",
                                      border: "none",
                                      cursor: "pointer",
                                      color: "#fca5a5",
                                      fontSize: 11,
                                    }}
                                    onMouseEnter={e => (e.currentTarget.style.color = "#ef4444")}
                                    onMouseLeave={e => (e.currentTarget.style.color = "#fca5a5")}
                                  >
                                    ×
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </div>

                    <div
                      className="flex gap-1 p-2"
                      style={{ borderTop: hm.entries.length ? "1px solid #fed7aa" : undefined }}
                    >
                      <input
                        value={hm.keyDraft}
                        onChange={e => hmUpdateDraft(hm.id, "keyDraft", e.target.value)}
                        onPointerDown={e => e.stopPropagation()}
                        onKeyDown={e => e.key === "Enter" && hmAdd(hm.id)}
                        placeholder="key"
                        style={{
                          flex: 1,
                          fontSize: 11,
                          padding: "3px 6px",
                          border: "1px solid #fed7aa",
                          borderRadius: 4,
                          outline: "none",
                          color: "#c2410c",
                          fontWeight: 600,
                        }}
                      />
                      <input
                        value={hm.valueDraft}
                        onChange={e => hmUpdateDraft(hm.id, "valueDraft", e.target.value)}
                        onPointerDown={e => e.stopPropagation()}
                        onKeyDown={e => e.key === "Enter" && hmAdd(hm.id)}
                        placeholder="value"
                        style={{
                          flex: 1,
                          fontSize: 11,
                          padding: "3px 6px",
                          border: "1px solid #fed7aa",
                          borderRadius: 4,
                          outline: "none",
                          color: "#1e293b",
                        }}
                      />

                      {hmDupAlert?.bid === hm.id && (
                        <div
                          onPointerDown={e => e.stopPropagation()}
                          style={{
                            position: "absolute",
                            left: "calc(100% + 8px)",
                            top: 0,
                            background: "white",
                            border: "1.5px solid #fca5a5",
                            borderRadius: 8,
                            boxShadow: "0 2px 10px rgba(0,0,0,0.12)",
                            padding: "8px 10px",
                            width: 200,
                            fontSize: 12,
                            color: "#9a3412",
                            display: "flex",
                            alignItems: "flex-start",
                            gap: 6,
                            zIndex: 10,
                          }}
                        >
                          <span style={{ flex: 1 }}>
                            <strong>Duplicate key:</strong> "{hmDupAlert.key}" already exists in this HashMap.
                          </span>
                          <button
                            onClick={() => setHmDupAlert(null)}
                            style={{ background: "none", border: "none", cursor: "pointer", color: "#fca5a5", fontSize: 14, lineHeight: 1, padding: 0, flexShrink: 0 }}
                            onMouseEnter={e => (e.currentTarget.style.color = "#ef4444")}
                            onMouseLeave={e => (e.currentTarget.style.color = "#fca5a5")}
                          >×</button>
                        </div>
                      )}

                      <button
                        onPointerDown={e => e.stopPropagation()}
                        onClick={() => hmAdd(hm.id, true)}
                        style={{
                          width: 28,
                          height: 28,
                          borderRadius: "50%",
                          border: "1.5px dashed #fdba74",
                          background: "none",
                          color: "#f97316",
                          cursor: "pointer",
                          fontSize: 16,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                        onMouseEnter={e => (e.currentTarget.style.color = "#ea580c")}
                        onMouseLeave={e => (e.currentTarget.style.color = "#f97316")}
                        title="Add blank entry"
                      >
                        +
                      </button>
                    </div>
                  </div>
                </div>
              )
            })}

            {/* ── Graph nodes ── */}
            {boardItems.filter(b => b.kind === "node").map(item => {
              const nb = item as GraphNode;
              const isConnected = connectedNodeIds.has(nb.id);
              const isConnectionTarget = hoveredNodeId === nb.id;
              const isConnectionSource = previewArrow?.sourceNodeId === nb.id;
              const bg = nodeHighlightBg(nb.highlight);
              const border = nodeHighlightBorder(nb.highlight);
              return (
                <div key={nb.id} data-card
                  style={{ position: "absolute", left: nb.position.x, top: nb.position.y, userSelect: "none", animation: "fadeSlideIn 0.2s ease" }}
                  onPointerDown={e => {
                    if ((e.target as HTMLElement).tagName === "INPUT") return;
                    if (live.current.activeTool === "arrow") {
                      handleNodeConnectionStart(e, nb.id);
                      return;
                    }
                    setSelectedBoardId(nb.id);
                    handleCardDragStart(e, nb.id, false, nb.position.x, nb.position.y);
                  }}
                  onDoubleClick={() => removeBoard(nb.id)}
                  onClick={() => setSelectedBoardId(nb.id)}
                  title="Double-click to remove"
                >
                  <div style={{
                    width: NODE_RADIUS * 2, height: NODE_RADIUS * 2, borderRadius: "50%",
                    background: bg, border: `2px solid ${border}`,
                    boxShadow: isConnectionTarget
                      ? "0 0 0 6px rgba(34, 197, 94, 0.22), 0 0 24px rgba(34, 197, 94, 0.35)"
                      : isConnectionSource
                        ? "0 0 0 6px rgba(139, 92, 246, 0.18), 0 0 20px rgba(139, 92, 246, 0.28)"
                        : isConnected
                          ? `0 0 0 3px ${border}33`
                          : "0 2px 8px rgba(0,0,0,0.1)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    transition: "background 0.2s, border-color 0.2s, box-shadow 0.2s",
                  }}>
                    <input value={nb.label} onChange={e => nodeUpdateLabel(nb.id, e.target.value)}
                      onClick={e => e.stopPropagation()} onPointerDown={e => e.stopPropagation()}
                      placeholder="val"
                      style={{ width: 44, textAlign: "center", fontSize: 13, fontWeight: 700, background: "transparent", border: "none", outline: "none", color: "#6d28d9" }} />
                  </div>
                  {/* Graph ops — shown when node is selected and connected */}
                  {selectedBoardId === nb.id && isConnected && (
                    <div className="flex gap-1 mt-1 justify-center" onPointerDown={e => e.stopPropagation()}>
                      <button onClick={() => runTraversal(nb.id, "bfs")}
                        style={{ fontSize: 10, padding: "2px 6px", borderRadius: 4, background: "#ede9fe", border: "1px solid #c4b5fd", color: "#6d28d9", cursor: "pointer", fontWeight: 600 }}>BFS</button>
                      <button onClick={() => runTraversal(nb.id, "dfs")}
                        style={{ fontSize: 10, padding: "2px 6px", borderRadius: 4, background: "#ede9fe", border: "1px solid #c4b5fd", color: "#6d28d9", cursor: "pointer", fontWeight: 600 }}>DFS</button>
                    </div>
                  )}
                </div>
              );
            })}

            {/* ── Text annotations ── */}
            {annotations.filter(a => a.kind === "text").map(a => {
              const ta = a as TextAnnotation;
              return (
                <div key={ta.id} data-annotation
                  style={{ position: "absolute", left: ta.x, top: ta.y, width: ta.width, animation: "fadeSlideIn 0.2s ease" }}
                  onPointerDown={e => { if ((e.target as HTMLElement).tagName !== "TEXTAREA") handleCardDragStart(e, ta.id, true, ta.x, ta.y); }}
                  onDoubleClick={e => { if ((e.target as HTMLElement).tagName !== "TEXTAREA") removeAnnotation(ta.id); }}
                  title="Double-click border to remove"
                >
                  <div style={{ background: "#fffbeb", border: "1.5px solid #fcd34d", borderRadius: 8, boxShadow: "0 2px 8px rgba(0,0,0,0.06)", position: "relative" }}>
                    <textarea value={ta.text} onChange={e => setAnnotations(p => p.map(x => x.id === ta.id ? { ...x, text: e.target.value } : x))}
                      placeholder="Note…"
                      style={{ width: "100%", minHeight: 64, background: "transparent", border: "none", outline: "none", resize: "both", color: "#92400e", fontSize: 12, padding: "8px 28px 8px 10px", fontFamily: "inherit" }} />
                    <button onPointerDown={e => e.stopPropagation()} onClick={() => removeAnnotation(ta.id)}
                      style={{ position: "absolute", top: 4, right: 6, background: "none", border: "none", cursor: "pointer", color: "#fcd34d", fontSize: 12 }}
                      onMouseEnter={e => (e.currentTarget.style.color = "#ef4444")} onMouseLeave={e => (e.currentTarget.style.color = "#fcd34d")}>×</button>
                  </div>
                </div>
              );
            })}

          </div>
        </div>

        {/* ── Activity sidebar ── */}
        {showHistory && (
          <div className="no-print flex flex-col border-l border-slate-200 bg-white" style={{ width: 200, overflow: "hidden" }}>
            <div className="px-3 py-2 text-xs font-semibold text-slate-500 border-b border-slate-100 flex items-center justify-between">
              <span>Activity</span>
              <button onClick={() => setHistory([])} className="text-slate-300 hover:text-red-400 text-xs">clear</button>
            </div>
            <div className="flex-1 overflow-y-auto px-2 py-1" style={{ scrollbarWidth: "thin" }}>
              {history.length === 0 && <p className="text-xs text-slate-400 mt-3 text-center">No activity yet</p>}
              {history.map(e => (
                <div key={e.id} className="text-xs py-0.5 px-1 text-slate-600 leading-5" style={{ animation: "fadeSlideIn 0.15s ease" }}>{e.msg}</div>
              ))}
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
