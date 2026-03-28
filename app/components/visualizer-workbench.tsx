'use client'

import { startTransition, useMemo, useState } from "react";

type StructureKind = "array" | "linked-list" | "graph" | "hashmap";
type BoardPosition = { x: number; y: number };
type GraphNode = { id: string; label: string; x: number; y: number };
type GraphEdge = { id: string; from: string; to: string };
type HashEntry = { id: string; key: string; values: string[] };

type ArrayBoard = {
  id: string;
  kind: "array";
  position: BoardPosition;
  values: number[];
  valueInput: string;
  indexInput: string;
  swapLeftInput: string;
  swapRightInput: string;
  flash: number[];
};

type LinkedListBoard = {
  id: string;
  kind: "linked-list";
  position: BoardPosition;
  nodes: { id: string; label: string }[];
  selectedNodeId: string;
  valueInput: string;
  flash: string[];
};

type GraphBoard = {
  id: string;
  kind: "graph";
  position: BoardPosition;
  nodes: GraphNode[];
  edges: GraphEdge[];
  selection: string[];
  labelInput: string;
  flash: string[];
};

type HashBoard = {
  id: string;
  kind: "hashmap";
  position: BoardPosition;
  entries: HashEntry[];
  keyInput: string;
  valueInput: string;
  flash: string[];
};

type BoardItem = ArrayBoard | LinkedListBoard | GraphBoard | HashBoard;
type InsertDraft = { kind: StructureKind; count: string; values: string };
type DragState = { id: string; pointerOffsetX: number; pointerOffsetY: number };
type WindowDragState = { pointerOffsetX: number; pointerOffsetY: number };
type StrokePoint = { x: number; y: number };
type Stroke = { id: string; points: StrokePoint[] };

const structureCopy: Record<StructureKind, { title: string; hint: string; helper: string }> = {
  array: {
    title: "Array",
    hint: "Long indexed cells like a classic whiteboard array sketch.",
    helper: "Enter starter values like 4,7,9 or leave blank to generate cells automatically.",
  },
  "linked-list": {
    title: "Linked list",
    hint: "Compact nodes for pointer updates and insert-after reasoning.",
    helper: "Enter labels like head,task,done or just choose how many nodes to create.",
  },
  graph: {
    title: "Graph / Tree",
    hint: "Plain circular nodes with arrowed edges on a white surface.",
    helper: "Enter labels separated by commas or leave blank for numbered nodes.",
  },
  hashmap: {
    title: "Hash map",
    hint: "Two clean columns for keys and values, without arrows.",
    helper: "Enter starter entries like ca:California; ok:Oklahoma or leave blank for defaults.",
  },
};

function createId(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 8)}`;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function addHistoryEntry(setHistory: React.Dispatch<React.SetStateAction<string[]>>, entry: string) {
  setHistory((current) => [entry, ...current].slice(0, 16));
}

function parseCount(input: string, fallback: number) {
  const parsed = Number(input);
  if (Number.isNaN(parsed)) return fallback;
  return clamp(Math.floor(parsed), 1, 14);
}

function createCircularNodes(count: number, labels?: string[]) {
  return Array.from({ length: count }, (_, index) => {
    const angle = (Math.PI * 2 * index) / Math.max(count, 1);
    return {
      id: createId("graph-node"),
      label: labels?.[index]?.trim() || String(index),
      x: 50 + Math.cos(angle) * 30,
      y: 44 + Math.sin(angle) * 30,
    };
  });
}

function createBoardItem(kind: StructureKind, draft: InsertDraft, position: BoardPosition): BoardItem {
  const count = parseCount(draft.count, 4);

  if (kind === "array") {
    const parsedValues = draft.values
      .split(",")
      .map((value) => Number(value.trim()))
      .filter((value) => !Number.isNaN(value));
    const values = parsedValues.length ? parsedValues.slice(0, 15) : Array.from({ length: Math.min(count, 15) }, (_, index) => index + 1);
    return {
      id: createId("board"),
      kind,
      position,
      values,
      valueInput: String(values[values.length - 1] ?? 1),
      indexInput: "1",
      swapLeftInput: "0",
      swapRightInput: String(Math.min(1, values.length - 1)),
      flash: [],
    };
  }

  if (kind === "linked-list") {
    const labels = draft.values.split(",").map((value) => value.trim()).filter(Boolean);
    const nodes = (labels.length ? labels : Array.from({ length: count }, (_, index) => `node-${index + 1}`)).map((label) => ({ id: createId("list-node"), label }));
    return {
      id: createId("board"),
      kind,
      position,
      nodes,
      selectedNodeId: nodes[0]?.id ?? "",
      valueInput: "new-node",
      flash: [],
    };
  }

  if (kind === "graph") {
    const labels = draft.values.split(",").map((value) => value.trim()).filter(Boolean);
    const nodes = createCircularNodes(count, labels);
    return {
      id: createId("board"),
      kind,
      position,
      nodes,
      edges: nodes.length > 1 ? nodes.slice(0, -1).map((node, index) => ({ id: createId("edge"), from: node.id, to: nodes[index + 1].id })) : [],
      selection: [],
      labelInput: String(nodes.length),
      flash: [],
    };
  }

  const starterEntries = draft.values
    .split(";")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const [keyPart, valuePart = ""] = entry.split(":");
      return {
        id: createId("hash-entry"),
        key: keyPart.trim() || `k-${createId("x")}`,
        values: valuePart.split(",").map((value) => value.trim()).filter(Boolean),
      } satisfies HashEntry;
    })
    .filter((entry) => entry.values.length);

  const entries = starterEntries.length ? starterEntries : Array.from({ length: count }, (_, index) => ({
    id: createId("hash-entry"),
    key: ["ca", "ok", "nj", "tx", "wa", "or"][index] ?? `k${index + 1}`,
    values: [["California"], ["Oklahoma"], ["New Jersey"], ["Texas"], ["Washington"], ["Oregon"]][index] ?? [`Value ${index + 1}`],
  }));

  return {
    id: createId("board"),
    kind,
    position,
    entries,
    keyInput: "ca",
    valueInput: "California",
    flash: [],
  };
}

function getSketchWidth(item: BoardItem) {
  if (item.kind === "array") return 920;
  if (item.kind === "graph") return 560;
  if (item.kind === "hashmap") return 470;
  return 280;
}

function getSketchHeight(item: BoardItem) {
  if (item.kind === "array") return 150;
  if (item.kind === "graph") return 390;
  if (item.kind === "hashmap") return 220;
  return 110;
}

function buildGraphPath(from: GraphNode, to: GraphNode) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const midX = (from.x + to.x) / 2;
  const midY = (from.y + to.y) / 2;
  const curveX = midX - dy * 0.18;
  const curveY = midY + dx * 0.18;
  return `M ${from.x} ${from.y} Q ${curveX} ${curveY} ${to.x} ${to.y}`;
}

const BOARD_WIDTH = 1600;
const BOARD_HEIGHT = 1250;

function buildStrokePath(points: StrokePoint[]) {
  if (!points.length) return "";
  if (points.length == 1) return `M ${points[0].x} ${points[0].y}`;
  return points.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`).join(" ");
}

export function VisualizerWorkbench() {
  const [history, setHistory] = useState<string[]>(["Whiteboard ready. Insert a structure to start sketching."]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [insertOpen, setInsertOpen] = useState(false);
  const [operationsOpen, setOperationsOpen] = useState(true);
  const [drawingOpen, setDrawingOpen] = useState(false);
  const [selectedBoardId, setSelectedBoardId] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [operationsPosition, setOperationsPosition] = useState({ x: 20, y: 420 });
  const [boardItems, setBoardItems] = useState<BoardItem[]>([
    createBoardItem("array", { kind: "array", count: "8", values: "3,8,13,21,34,55,89,144" }, { x: 40, y: 70 }),
    createBoardItem("graph", { kind: "graph", count: "8", values: "0,1,2,3,4,5,6,7" }, { x: 110, y: 300 }),
    createBoardItem("hashmap", { kind: "hashmap", count: "4", values: "ca:California; ok:Oklahoma; nj:New Jersey; tx:Texas" }, { x: 860, y: 360 }),
  ]);
  const [insertDraft, setInsertDraft] = useState<InsertDraft>({ kind: "array", count: "4", values: "" });
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [operationsDragState, setOperationsDragState] = useState<WindowDragState | null>(null);
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [activeStroke, setActiveStroke] = useState<Stroke | null>(null);

  function updateBoardItem(id: string, updater: (item: BoardItem) => BoardItem) {
    setBoardItems((current) => current.map((item) => (item.id === id ? updater(item) : item)));
  }

  const selectedBoard = useMemo(
    () => boardItems.find((item) => item.id === selectedBoardId) ?? null,
    [boardItems, selectedBoardId]
  );

  const effectiveBoardWidth = BOARD_WIDTH / zoom;
  const effectiveBoardHeight = BOARD_HEIGHT / zoom;

  function insertStructure() {
    startTransition(() => {
      const offset = boardItems.length * 42;
      const nextPosition = { x: 40 + (offset % 260), y: 80 + offset };
      const newItem = createBoardItem(insertDraft.kind, insertDraft, nextPosition);
      setBoardItems((current) => [...current, newItem]);
      setSelectedBoardId(newItem.id);
      setOperationsOpen(true);
      addHistoryEntry(setHistory, `Inserted a ${structureCopy[insertDraft.kind].title.toLowerCase()} sketch onto the whiteboard.`);
      setInsertDraft((current) => ({ ...current, values: "" }));
    });
  }

  function removeBoardItem(id: string) {
    setBoardItems((current) => current.filter((item) => item.id !== id));
    if (selectedBoardId === id) {
      setSelectedBoardId(null);
    }
    addHistoryEntry(setHistory, "Removed a whiteboard sketch.");
  }

  function selectBoard(id: string) {
    setSelectedBoardId(id);
    setOperationsOpen(true);
  }

  function handleDragStart(event: React.PointerEvent<HTMLButtonElement>, id: string) {
    event.stopPropagation();
    const sketch = event.currentTarget.parentElement;
    if (!sketch) return;

    const rect = sketch.getBoundingClientRect();
    setDragState({
      id,
      pointerOffsetX: event.clientX - rect.left,
      pointerOffsetY: event.clientY - rect.top,
    });
  }

  function handleBoardPointerMove(event: React.PointerEvent<HTMLDivElement>) {
    if (!dragState) return;

    const rect = event.currentTarget.getBoundingClientRect();
    const dragged = boardItems.find((item) => item.id === dragState.id);
    const width = dragged ? getSketchWidth(dragged) : 360;
    const height = dragged ? getSketchHeight(dragged) : 300;
    const x = clamp((event.clientX - rect.left) / zoom - dragState.pointerOffsetX, 18, effectiveBoardWidth - width - 18);
    const y = clamp((event.clientY - rect.top) / zoom - dragState.pointerOffsetY, 18, effectiveBoardHeight - height - 18);

    updateBoardItem(dragState.id, (item) => ({ ...item, position: { x, y } }));
  }

  function handleBoardPointerUp() {
    if (dragState) addHistoryEntry(setHistory, "Moved a whiteboard sketch.");
    setDragState(null);
  }

  function handleOperationsDragStart(event: React.PointerEvent<HTMLButtonElement>) {
    event.stopPropagation();
    const panel = event.currentTarget.parentElement?.parentElement;
    if (!panel) return;
    const rect = panel.getBoundingClientRect();
    setOperationsDragState({
      pointerOffsetX: event.clientX - rect.left,
      pointerOffsetY: event.clientY - rect.top,
    });
  }

  function handleGlobalPointerMove(event: React.PointerEvent<HTMLDivElement>) {
    if (!operationsDragState) return;
    setOperationsPosition({
      x: Math.max(16, event.clientX - operationsDragState.pointerOffsetX),
      y: Math.max(16, event.clientY - operationsDragState.pointerOffsetY),
    });
  }

  function handleGlobalPointerUp() {
    setOperationsDragState(null);
  }

  function getStrokePoint(event: React.PointerEvent<HTMLDivElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * 100,
      y: ((event.clientY - rect.top) / rect.height) * 100,
    };
  }

  function handleDrawPointerDown(event: React.PointerEvent<HTMLDivElement>) {
    const point = getStrokePoint(event);
    const stroke = { id: createId("stroke"), points: [point] };
    setActiveStroke(stroke);
  }

  function handleDrawPointerMove(event: React.PointerEvent<HTMLDivElement>) {
    if (!activeStroke) return;
    const point = getStrokePoint(event);
    setActiveStroke((current) => current ? { ...current, points: [...current.points, point] } : current);
  }

  function handleDrawPointerUp() {
    if (!activeStroke) return;
    setStrokes((current) => [...current, activeStroke]);
    setActiveStroke(null);
    addHistoryEntry(setHistory, "Added a drawing stroke to the sketch pad.");
  }

  function renderArraySketch(item: ArrayBoard) {
    return (
      <div className="overflow-x-auto px-2 py-2">
        <div className="min-w-max">
          <div className="flex">
            {item.values.map((value, index) => (
              <button
                key={`${item.id}-${index}`}
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  selectBoard(item.id);
                  updateBoardItem(item.id, (current) => current.kind === "array" ? { ...current, flash: [index] } : current);
                }}
                className={`flex h-16 w-[58px] items-center justify-center border border-slate-500 text-lg font-medium text-slate-900 first:border-r-0 [&:not(:last-child)]:border-r-0 ${item.flash.includes(index) ? "bg-blue-50" : "bg-white"}`}
              >
                {value}
              </button>
            ))}
          </div>
          <div className="mt-6 flex">
            {item.values.map((_, index) => (
              <div key={`${item.id}-index-${index}`} className="flex w-[58px] justify-center text-sm font-semibold text-blue-500">
                {index}
              </div>
            ))}
            </div>
          </div>
        </div>
    );
  }

  function renderLinkedListSketch(item: LinkedListBoard) {
    return (
      <div className="flex flex-wrap items-center gap-1.5 px-1 py-1">
        {item.nodes.map((node, index) => (
          <div key={node.id} className="flex items-center gap-2">
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                selectBoard(item.id);
                updateBoardItem(item.id, (current) => current.kind === "linked-list" ? { ...current, selectedNodeId: node.id, flash: [node.id] } : current);
              }}
              className={`rounded-xl border px-3 py-2 text-left text-sm ${item.selectedNodeId === node.id ? "border-blue-500 bg-blue-50 text-slate-950" : item.flash.includes(node.id) ? "border-amber-400 bg-amber-100 text-slate-950" : "border-slate-300 bg-white text-slate-900"}`}
            >
              {node.label}
            </button>
            {index < item.nodes.length - 1 ? <span className="text-slate-700">-&gt;</span> : null}
          </div>
        ))}
      </div>
    );
  }

  function renderGraphSketch(item: GraphBoard) {
    return (
      <div className="relative min-h-[310px] overflow-hidden">
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full">
          <defs>
            <marker id={`arrow-${item.id}`} markerWidth="6" markerHeight="6" refX="5.4" refY="3" orient="auto" markerUnits="strokeWidth">
              <path d="M0,0 L0,6 L6,3 z" fill="#111827" />
            </marker>
          </defs>
          {item.edges.map((edge) => {
            const from = item.nodes.find((node) => node.id === edge.from);
            const to = item.nodes.find((node) => node.id === edge.to);
            if (!from || !to) return null;
            return <path key={edge.id} d={buildGraphPath(from, to)} fill="none" stroke="#111827" strokeWidth="0.45" markerEnd={`url(#arrow-${item.id})`} />;
          })}
        </svg>
        {item.nodes.map((node) => (
          <button
            key={node.id}
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              selectBoard(item.id);
              updateBoardItem(item.id, (current) => {
                if (current.kind !== "graph") return current;
                const alreadySelected = current.selection.includes(node.id);
                const selection = alreadySelected ? current.selection.filter((entry) => entry !== node.id) : current.selection.length === 2 ? [current.selection[1], node.id] : [...current.selection, node.id];
                return { ...current, selection };
              });
            }}
            className={`absolute -translate-x-1/2 -translate-y-1/2 rounded-full border text-base font-medium ${item.selection.includes(node.id) ? "border-blue-500 bg-blue-50 text-slate-950" : "border-slate-500 bg-white text-slate-900"}`}
            style={{ left: `${node.x}%`, top: `${node.y}%`, width: 46, height: 46 }}
          >
            {node.label}
          </button>
        ))}
      </div>
    );
  }

  function renderHashmapSketch(item: HashBoard) {
    return (
      <div className="px-3 py-2">
        <div className="grid grid-cols-[1fr_24px_1.45fr] gap-3 font-mono text-2xl text-slate-800">
          <p className="text-center">-keys-</p>
          <div />
          <p className="text-center">-values-</p>
        </div>
        <div className="mt-4 space-y-0">
          {item.entries.map((entry) => (
            <button key={entry.id} type="button" onClick={(event) => {
              event.stopPropagation();
              selectBoard(item.id);
              updateBoardItem(item.id, (current) => current.kind === "hashmap" ? { ...current, flash: [entry.id] } : current);
            }} className="grid w-full grid-cols-[1fr_24px_1.45fr] gap-3 text-left">
              <div className={`flex min-h-12 items-center border-2 border-slate-800 px-3 font-mono text-xl font-semibold text-slate-900 ${item.flash.includes(entry.id) ? "bg-blue-50" : "bg-white"}`}>
                &apos;{entry.key}&apos;
              </div>
              <div className="flex items-center justify-center text-slate-500">
                <div className="h-px w-full bg-slate-500" />
              </div>
              <div className={`flex min-h-12 items-center border-2 border-slate-800 px-3 font-mono text-xl font-semibold text-slate-900 ${item.flash.includes(entry.id) ? "bg-blue-50" : "bg-white"}`}>
                &apos;{entry.values.join(", ")}&apos;
              </div>
            </button>
          ))}
        </div>
      </div>
    );
  }

  function renderOperationsPanel(item: BoardItem | null) {
    if (!item) {
      return (
        <div className="space-y-3 text-sm text-slate-300">
          <p>Select a sketch on the whiteboard to edit it here.</p>
        </div>
      );
    }

    if (item.kind === "array") {
      return (
        <div className="space-y-4 text-sm text-slate-200">
          <div className="grid gap-2 sm:grid-cols-2">
            <input value={item.valueInput} onChange={(event) => updateBoardItem(item.id, (current) => current.kind === "array" ? { ...current, valueInput: event.target.value } : current)} className="rounded-2xl border border-white/10 bg-slate-900/80 px-4 py-3 outline-none focus:border-cyan-300" placeholder="value" />
            <input value={item.indexInput} onChange={(event) => updateBoardItem(item.id, (current) => current.kind === "array" ? { ...current, indexInput: event.target.value } : current)} className="rounded-2xl border border-white/10 bg-slate-900/80 px-4 py-3 outline-none focus:border-cyan-300" placeholder="index" />
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <input value={item.swapLeftInput} onChange={(event) => updateBoardItem(item.id, (current) => current.kind === "array" ? { ...current, swapLeftInput: event.target.value } : current)} className="rounded-2xl border border-white/10 bg-slate-900/80 px-4 py-3 outline-none focus:border-cyan-300" placeholder="swap A" />
            <input value={item.swapRightInput} onChange={(event) => updateBoardItem(item.id, (current) => current.kind === "array" ? { ...current, swapRightInput: event.target.value } : current)} className="rounded-2xl border border-white/10 bg-slate-900/80 px-4 py-3 outline-none focus:border-cyan-300" placeholder="swap B" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => {
              const parsed = Number(item.valueInput);
              if (Number.isNaN(parsed)) {
                addHistoryEntry(setHistory, "Array append skipped because the value was invalid.");
                return;
              }
              updateBoardItem(item.id, (current) => current.kind === "array" ? { ...current, values: [...current.values, parsed].slice(0, 15), flash: [Math.min(current.values.length, 14)] } : current);
              addHistoryEntry(setHistory, "Appended an array value.");
            }} className="rounded-2xl bg-amber-300 px-4 py-3 font-medium text-slate-950">Append</button>
            <button type="button" onClick={() => {
              const parsedValue = Number(item.valueInput);
              const parsedIndex = Number(item.indexInput);
              if (Number.isNaN(parsedValue) || Number.isNaN(parsedIndex)) {
                addHistoryEntry(setHistory, "Array insert skipped because the inputs were invalid.");
                return;
              }
              updateBoardItem(item.id, (current) => {
                if (current.kind !== "array") return current;
                const index = clamp(parsedIndex, 0, current.values.length);
                const next = [...current.values];
                next.splice(index, 0, parsedValue);
                return { ...current, values: next.slice(0, 15), flash: [index] };
              });
              addHistoryEntry(setHistory, "Inserted an array value.");
            }} className="rounded-2xl border border-white/10 bg-white/8 px-4 py-3 font-medium text-white">Insert</button>
            <button type="button" onClick={() => {
              const parsedIndex = Number(item.indexInput);
              if (Number.isNaN(parsedIndex)) {
                addHistoryEntry(setHistory, "Array remove skipped because the index was invalid.");
                return;
              }
              updateBoardItem(item.id, (current) => current.kind === "array" && current.values.length ? { ...current, values: current.values.filter((_, currentIndex) => currentIndex !== clamp(parsedIndex, 0, current.values.length - 1)), flash: [] } : current);
              addHistoryEntry(setHistory, "Removed an array value.");
            }} className="rounded-2xl border border-white/10 bg-white/8 px-4 py-3 font-medium text-white">Remove</button>
            <button type="button" onClick={() => {
              const left = Number(item.swapLeftInput);
              const right = Number(item.swapRightInput);
              if (Number.isNaN(left) || Number.isNaN(right)) {
                addHistoryEntry(setHistory, "Array swap skipped because the swap indices were invalid.");
                return;
              }
              updateBoardItem(item.id, (current) => {
                if (current.kind !== "array" || !current.values.length) return current;
                const leftIndex = clamp(left, 0, current.values.length - 1);
                const rightIndex = clamp(right, 0, current.values.length - 1);
                const next = [...current.values];
                [next[leftIndex], next[rightIndex]] = [next[rightIndex], next[leftIndex]];
                return { ...current, values: next, flash: [leftIndex, rightIndex] };
              });
              addHistoryEntry(setHistory, "Swapped array cells.");
            }} className="rounded-2xl border border-white/10 bg-white/8 px-4 py-3 font-medium text-white">Swap</button>
          </div>
        </div>
      );
    }

    if (item.kind === "linked-list") {
      return (
        <div className="space-y-4 text-sm text-slate-200">
          <input value={item.valueInput} onChange={(event) => updateBoardItem(item.id, (current) => current.kind === "linked-list" ? { ...current, valueInput: event.target.value } : current)} className="w-full rounded-2xl border border-white/10 bg-slate-900/80 px-4 py-3 outline-none focus:border-cyan-300" placeholder="node label" />
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => {
              const label = item.valueInput.trim();
              if (!label) {
                addHistoryEntry(setHistory, "Linked-list insert skipped because the label was empty.");
                return;
              }
              updateBoardItem(item.id, (current) => {
                if (current.kind !== "linked-list") return current;
                const nextNode = { id: createId("list-node"), label };
                const anchorIndex = current.nodes.findIndex((node) => node.id === current.selectedNodeId);
                const index = anchorIndex >= 0 ? anchorIndex + 1 : current.nodes.length;
                const next = [...current.nodes];
                next.splice(index, 0, nextNode);
                return { ...current, nodes: next, selectedNodeId: nextNode.id, flash: [nextNode.id] };
              });
              addHistoryEntry(setHistory, "Inserted a linked-list node.");
            }} className="rounded-2xl bg-amber-300 px-4 py-3 font-medium text-slate-950">Insert</button>
            <button type="button" onClick={() => {
              if (!item.selectedNodeId) {
                addHistoryEntry(setHistory, "Linked-list remove skipped because no node was selected.");
                return;
              }
              updateBoardItem(item.id, (current) => current.kind === "linked-list" ? { ...current, nodes: current.nodes.filter((node) => node.id !== current.selectedNodeId), selectedNodeId: current.nodes.find((node) => node.id !== current.selectedNodeId)?.id ?? "", flash: [] } : current);
              addHistoryEntry(setHistory, "Removed a linked-list node.");
            }} className="rounded-2xl border border-white/10 bg-white/8 px-4 py-3 font-medium text-white">Remove</button>
          </div>
        </div>
      );
    }

    if (item.kind === "graph") {
      return (
        <div className="space-y-4 text-sm text-slate-200">
          <input value={item.labelInput} onChange={(event) => updateBoardItem(item.id, (current) => current.kind === "graph" ? { ...current, labelInput: event.target.value } : current)} className="w-full rounded-2xl border border-white/10 bg-slate-900/80 px-4 py-3 outline-none focus:border-cyan-300" placeholder="new node label" />
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => {
              const label = item.labelInput.trim() || String(item.nodes.length);
              updateBoardItem(item.id, (current) => current.kind === "graph" ? { ...current, nodes: [...current.nodes, { id: createId("graph-node"), label, x: 50, y: 50 }] } : current);
              addHistoryEntry(setHistory, "Added a graph node.");
            }} className="rounded-2xl bg-amber-300 px-4 py-3 font-medium text-slate-950">Add node</button>
            <button type="button" onClick={() => {
              if (item.selection.length !== 2) {
                addHistoryEntry(setHistory, "Graph connect skipped because two nodes were not selected.");
                return;
              }
              updateBoardItem(item.id, (current) => {
                if (current.kind !== "graph") return current;
                const duplicate = current.edges.some((edge) => edge.from === current.selection[0] && edge.to === current.selection[1]);
                if (duplicate) return current;
                return { ...current, edges: [...current.edges, { id: createId("edge"), from: current.selection[0], to: current.selection[1] }], flash: current.selection };
              });
              addHistoryEntry(setHistory, "Connected graph nodes.");
            }} className="rounded-2xl border border-white/10 bg-white/8 px-4 py-3 font-medium text-white">Connect</button>
            <button type="button" onClick={() => {
              if (!item.selection.length) {
                addHistoryEntry(setHistory, "Graph remove skipped because no nodes were selected.");
                return;
              }
              updateBoardItem(item.id, (current) => current.kind === "graph" ? { ...current, nodes: current.nodes.filter((node) => !current.selection.includes(node.id)), edges: current.edges.filter((edge) => !current.selection.includes(edge.from) && !current.selection.includes(edge.to)), selection: [], flash: [] } : current);
              addHistoryEntry(setHistory, "Removed selected graph nodes.");
            }} className="rounded-2xl border border-white/10 bg-white/8 px-4 py-3 font-medium text-white">Remove selected</button>
          </div>
          <p className="text-xs leading-5 text-slate-400">Select graph nodes directly on the board to choose which ones to connect or remove.</p>
        </div>
      );
    }

    return (
      <div className="space-y-4 text-sm text-slate-200">
        <div className="grid gap-2 sm:grid-cols-[120px_1fr]">
          <input value={item.keyInput} onChange={(event) => updateBoardItem(item.id, (current) => current.kind === "hashmap" ? { ...current, keyInput: event.target.value } : current)} className="rounded-2xl border border-white/10 bg-slate-900/80 px-4 py-3 outline-none focus:border-cyan-300" placeholder="key" />
          <input value={item.valueInput} onChange={(event) => updateBoardItem(item.id, (current) => current.kind === "hashmap" ? { ...current, valueInput: event.target.value } : current)} className="rounded-2xl border border-white/10 bg-slate-900/80 px-4 py-3 outline-none focus:border-cyan-300" placeholder="value or a,b,c" />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={() => {
            const key = item.keyInput.trim();
            const values = item.valueInput.split(",").map((value) => value.trim()).filter(Boolean);
            if (!key || !values.length) {
              addHistoryEntry(setHistory, "Hash-map insert skipped because the key or values were empty.");
              return;
            }
            updateBoardItem(item.id, (current) => {
              if (current.kind !== "hashmap") return current;
              const existing = current.entries.find((entry) => entry.key === key);
              if (existing) return { ...current, entries: current.entries.map((entry) => entry.key === key ? { ...entry, values } : entry), flash: [existing.id] };
              const nextId = createId("hash-entry");
              return { ...current, entries: [...current.entries, { id: nextId, key, values }], flash: [nextId] };
            });
            addHistoryEntry(setHistory, "Updated a hash-map entry.");
          }} className="rounded-2xl bg-amber-300 px-4 py-3 font-medium text-slate-950">Insert or update</button>
          <button type="button" onClick={() => {
            const selectedId = item.flash[0];
            if (!selectedId) {
              addHistoryEntry(setHistory, "Hash-map remove skipped because no row was selected.");
              return;
            }
            updateBoardItem(item.id, (current) => current.kind === "hashmap" ? { ...current, entries: current.entries.filter((entry) => entry.id !== selectedId), flash: [] } : current);
            addHistoryEntry(setHistory, "Removed a hash-map entry.");
          }} className="rounded-2xl border border-white/10 bg-white/8 px-4 py-3 font-medium text-white">Remove selected</button>
        </div>
      </div>
    );
  }

  return (
    <section className="min-h-screen bg-[#f7f7f2] text-slate-900">
      <div className="mx-auto flex min-h-screen w-full max-w-[1700px] flex-col gap-4 px-5 py-5 sm:px-8" onPointerMove={handleGlobalPointerMove} onPointerUp={handleGlobalPointerUp}>
        <div className="flex items-center justify-end gap-2">
          <div className="mr-2 flex items-center gap-2 rounded-full border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-700">
            <button type="button" onClick={() => setZoom((current) => Math.max(0.6, Number((current - 0.1).toFixed(2))))} className="rounded-full border border-slate-300 px-2 py-1 hover:bg-slate-100">-</button>
            <span className="min-w-12 text-center">{Math.round(zoom * 100)}%</span>
            <button type="button" onClick={() => setZoom((current) => Math.min(1.8, Number((current + 0.1).toFixed(2))))} className="rounded-full border border-slate-300 px-2 py-1 hover:bg-slate-100">+</button>
          </div>
          <button type="button" onClick={() => setInsertOpen((current) => !current)} className="rounded-full border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium uppercase tracking-[0.22em] text-slate-700 transition hover:bg-slate-100">
            {insertOpen ? "Hide Insert" : "Insert"}
          </button>
          <button type="button" onClick={() => setOperationsOpen((current) => !current)} className="rounded-full border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium uppercase tracking-[0.22em] text-slate-700 transition hover:bg-slate-100">
            {operationsOpen ? "Hide Ops" : "Operations"}
          </button>
          <button type="button" onClick={() => setDrawingOpen((current) => !current)} className="rounded-full border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium uppercase tracking-[0.22em] text-slate-700 transition hover:bg-slate-100">
            {drawingOpen ? "Hide Draw" : "Draw"}
          </button>
          <button type="button" onClick={() => setHistoryOpen((current) => !current)} className="rounded-full border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium uppercase tracking-[0.22em] text-slate-700 transition hover:bg-slate-100">
            {historyOpen ? "Hide History" : "History"}
          </button>
        </div>

        <div className="relative overflow-hidden rounded-[2rem] border border-slate-300 bg-white shadow-[0_20px_70px_rgba(15,23,42,0.08)]">
          <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-5 py-3 text-sm text-slate-500">
            <p>{boardItems.length} sketches on the board</p>
            <p>Click a sketch to edit it in the shared operations window</p>
          </div>
          <div className="relative overflow-auto bg-[radial-gradient(circle_at_1px_1px,rgba(15,23,42,0.08)_1px,transparent_0)] bg-[size:28px_28px]" style={{ minHeight: effectiveBoardHeight, minWidth: "100%" }} onPointerMove={handleBoardPointerMove} onPointerUp={handleBoardPointerUp} onPointerLeave={handleBoardPointerUp}>
            <div className="relative" style={{ width: effectiveBoardWidth, height: effectiveBoardHeight, transform: `scale(${zoom})`, transformOrigin: "top left" }}>
            {boardItems.map((item) => (
              <div key={item.id} role="button" tabIndex={0} onClick={() => selectBoard(item.id)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") selectBoard(item.id); }} className={`absolute ${selectedBoardId === item.id ? "ring-2 ring-blue-400/60" : ""} rounded-xl`} style={{ left: item.position.x, top: item.position.y, width: getSketchWidth(item), minHeight: getSketchHeight(item) }}>
                <div className="mb-2 flex items-center justify-between px-1">
                  <button type="button" onPointerDown={(event) => handleDragStart(event, item.id)} onClick={(event) => event.stopPropagation()} className="h-2 w-18 cursor-grab rounded-full bg-slate-300 active:cursor-grabbing" />
                  <button type="button" onClick={(event) => { event.stopPropagation(); removeBoardItem(item.id); }} className="rounded-full border border-slate-300 bg-white px-2 py-1 text-[10px] uppercase tracking-[0.2em] text-slate-500">Remove</button>
                </div>
                {item.kind === "array" ? renderArraySketch(item) : null}
                {item.kind === "linked-list" ? renderLinkedListSketch(item) : null}
                {item.kind === "graph" ? renderGraphSketch(item) : null}
                {item.kind === "hashmap" ? renderHashmapSketch(item) : null}
              </div>
            ))}
            </div>
          </div>
        </div>

        {insertOpen ? (
          <aside className="fixed left-5 top-5 z-20 w-full max-w-sm rounded-[1.8rem] border border-slate-300 bg-white p-5 shadow-[0_30px_80px_rgba(15,23,42,0.18)]">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm uppercase tracking-[0.3em] text-slate-500">Insert</p>
                <h2 className="mt-1 text-xl font-semibold text-slate-900">Add a structure</h2>
              </div>
              <button type="button" onClick={() => setInsertOpen(false)} className="rounded-full border border-slate-300 px-3 py-1 text-[11px] uppercase tracking-[0.25em] text-slate-500">Close</button>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2">
              {(["array", "linked-list", "graph", "hashmap"] as StructureKind[]).map((kind) => (
                <button key={kind} type="button" onClick={() => setInsertDraft((current) => ({ ...current, kind }))} className={`rounded-2xl border px-4 py-3 text-left text-sm transition ${insertDraft.kind === kind ? "border-blue-500 bg-blue-50 text-slate-950" : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"}`}>
                  <p className="font-medium">{structureCopy[kind].title}</p>
                  <p className="mt-1 text-xs leading-5 opacity-80">{structureCopy[kind].hint}</p>
                </button>
              ))}
            </div>
            <div className="mt-5 space-y-4 text-sm text-slate-700">
              <label className="grid gap-2">
                <span>How many starter elements?</span>
                <input value={insertDraft.count} onChange={(event) => setInsertDraft((current) => ({ ...current, count: event.target.value }))} className="rounded-2xl border border-slate-300 bg-white px-4 py-3 outline-none focus:border-blue-500" placeholder="4" />
              </label>
              <label className="grid gap-2">
                <span>Starter values or labels</span>
                <textarea value={insertDraft.values} onChange={(event) => setInsertDraft((current) => ({ ...current, values: event.target.value }))} className="min-h-32 rounded-2xl border border-slate-300 bg-white px-4 py-3 leading-6 outline-none focus:border-blue-500" placeholder={insertDraft.kind === "hashmap" ? "ca:California; ok:Oklahoma" : "1,2,3 or 0,1,2,3"} />
              </label>
              <p className="rounded-2xl border border-slate-200 bg-slate-50 p-4 leading-6 text-slate-600">{structureCopy[insertDraft.kind].helper}</p>
              <button type="button" onClick={() => { insertStructure(); setInsertOpen(false); }} className="w-full rounded-2xl bg-amber-300 px-4 py-3 font-medium text-slate-950 transition hover:bg-amber-200">Insert onto whiteboard</button>
            </div>
          </aside>
        ) : null}

        {operationsOpen ? (
          <aside className="fixed z-20 w-full max-w-sm rounded-[1.8rem] border border-slate-300 bg-slate-950/96 p-5 shadow-[0_30px_80px_rgba(15,23,42,0.22)] backdrop-blur" style={{ left: operationsPosition.x, top: operationsPosition.y }}>
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm uppercase tracking-[0.3em] text-cyan-200/80">Operations</p>
                <h2 className="mt-1 text-xl font-semibold text-white">{selectedBoard ? structureCopy[selectedBoard.kind].title : "Nothing selected"}</h2>
              </div>
              <div className="flex items-center gap-2">
                <button type="button" onPointerDown={handleOperationsDragStart} className="h-2 w-16 cursor-grab rounded-full bg-white/20 active:cursor-grabbing" />
                <button type="button" onClick={() => setOperationsOpen(false)} className="rounded-full border border-white/10 px-3 py-1 text-[11px] uppercase tracking-[0.25em] text-slate-300">Close</button>
              </div>
            </div>
            <div className="mt-4">{renderOperationsPanel(selectedBoard)}</div>
          </aside>
        ) : null}

        {drawingOpen ? (
          <aside className="fixed right-5 bottom-5 z-20 w-full max-w-xl rounded-[1.8rem] border border-slate-300 bg-white p-5 shadow-[0_30px_80px_rgba(15,23,42,0.18)]">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm uppercase tracking-[0.3em] text-slate-500">Drawing</p>
                <h2 className="mt-1 text-xl font-semibold text-slate-900">Sketch pad</h2>
              </div>
              <button type="button" onClick={() => { setDrawingOpen(false); setActiveStroke(null); }} className="rounded-full border border-slate-300 px-3 py-1 text-[11px] uppercase tracking-[0.25em] text-slate-500">Close</button>
            </div>
            <div className="mt-4 space-y-3 text-sm text-slate-700">
              <div className="rounded-[1.4rem] border border-slate-300 bg-[#fffef8] p-3">
                <div className="h-[380px] rounded-[1rem] border border-slate-200 bg-white cursor-crosshair" onPointerDown={handleDrawPointerDown} onPointerMove={handleDrawPointerMove} onPointerUp={handleDrawPointerUp} onPointerLeave={handleDrawPointerUp}>
                  <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="h-full w-full">
                    {strokes.map((stroke) => (
                      <path key={stroke.id} d={buildStrokePath(stroke.points)} fill="none" stroke="#ef4444" strokeWidth="0.35" strokeLinecap="round" strokeLinejoin="round" />
                    ))}
                    {activeStroke ? (
                      <path d={buildStrokePath(activeStroke.points)} fill="none" stroke="#ef4444" strokeWidth="0.35" strokeLinecap="round" strokeLinejoin="round" />
                    ) : null}
                  </svg>
                </div>
              </div>
              <button type="button" onClick={() => { setStrokes([]); setActiveStroke(null); addHistoryEntry(setHistory, "Cleared sketch pad strokes."); }} className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 font-medium text-slate-700">
                Clear drawing
              </button>
              <p className="rounded-2xl border border-slate-200 bg-slate-50 p-4 leading-6 text-slate-600">
                This drawing window is separate from the main whiteboard, so you can doodle here without affecting dragging or selecting data structures.
              </p>
            </div>
          </aside>
        ) : null}

        {historyOpen ? (
          <aside className="fixed right-5 top-5 z-20 w-full max-w-sm rounded-[1.8rem] border border-slate-300 bg-white p-5 shadow-[0_30px_80px_rgba(15,23,42,0.18)]">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm uppercase tracking-[0.3em] text-slate-500">History</p>
                <h2 className="mt-1 text-xl font-semibold text-slate-900">Recent actions</h2>
              </div>
              <button type="button" onClick={() => setHistoryOpen(false)} className="rounded-full border border-slate-300 px-3 py-1 text-[11px] uppercase tracking-[0.25em] text-slate-500">Close</button>
            </div>
            <div className="mt-4 space-y-3 text-sm text-slate-600">
              {history.map((entry, index) => (
                <div key={`${entry}-${index}`} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 leading-6">{entry}</div>
              ))}
            </div>
          </aside>
        ) : null}
      </div>
    </section>
  );
}
