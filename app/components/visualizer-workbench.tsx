'use client'

import { startTransition, useEffect, useRef, useState } from "react";

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
type DragState =
  | { kind: "card"; id: string; pointerOffsetX: number; pointerOffsetY: number }
  | { kind: "pan"; startClientX: number; startClientY: number; startOffsetX: number; startOffsetY: number };

const structureCopy: Record<StructureKind, { title: string; hint: string; helper: string }> = {
  array: {
    title: "Array",
    hint: "Long indexed cells like a classic whiteboard array sketch.",
    helper: "Enter starter values like 4,7,9 or leave blank to generate cells automatically.",
  },
  "linked-list": {
    title: "Linked list",
    hint: "Compact card for pointer updates and insert-after reasoning.",
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

function getCardWidth(item: BoardItem) {
  if (item.kind === "array") return 1180;
  if (item.kind === "graph") return 720;
  if (item.kind === "hashmap") return 620;
  return 360;
}

function getCardHeight(item: BoardItem) {
  if (item.kind === "array") return 290;
  if (item.kind === "graph") return 560;
  if (item.kind === "hashmap") return 430;
  return 300;
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

export function VisualizerWorkbench() {
  const [history, setHistory] = useState<string[]>(["Whiteboard ready. Insert a structure to start sketching."]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [boardItems, setBoardItems] = useState<BoardItem[]>([
    createBoardItem("array", { kind: "array", count: "8", values: "3,8,13,21,34,55,89,144" }, { x: 120, y: 80 }),
    createBoardItem("graph", { kind: "graph", count: "8", values: "0,1,2,3,4,5,6,7" }, { x: 200, y: 420 }),
    createBoardItem("hashmap", { kind: "hashmap", count: "4", values: "ca:California; ok:Oklahoma; nj:New Jersey; tx:Texas" }, { x: 1380, y: 420 }),
  ]);
  const [insertDraft, setInsertDraft] = useState<InsertDraft>({ kind: "array", count: "4", values: "" });
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [canvasOffset, setCanvasOffset] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [undoStack, setUndoStack] = useState<BoardItem[][]>([]);
  const [redoStack, setRedoStack] = useState<BoardItem[][]>([]);
  const [toolbarOpen, setToolbarOpen] = useState(false);

  // Refs so wheel/keyboard effects capture fresh state without re-registering
  const canvasWrapperRef = useRef<HTMLDivElement>(null);
  const liveRef = useRef({ zoom, canvasOffset, boardItems, undoStack, redoStack });
  liveRef.current = { zoom, canvasOffset, boardItems, undoStack, redoStack };

  function pushUndo() {
    setUndoStack((s) => [...s.slice(-49), boardItems]);
    setRedoStack([]);
  }

  function undo() {
    if (undoStack.length === 0) return;
    setRedoStack((r) => [...r.slice(-49), boardItems]);
    setBoardItems(undoStack[undoStack.length - 1]);
    setUndoStack((s) => s.slice(0, -1));
    addHistoryEntry(setHistory, "Undid last action.");
  }

  function redo() {
    if (redoStack.length === 0) return;
    setUndoStack((u) => [...u.slice(-49), boardItems]);
    setBoardItems(redoStack[redoStack.length - 1]);
    setRedoStack((s) => s.slice(0, -1));
    addHistoryEntry(setHistory, "Redid last action.");
  }

  function zoomToward(cx: number, cy: number, delta: number) {
    const { zoom: z, canvasOffset: o } = liveRef.current;
    const newZoom = parseFloat(Math.min(2, Math.max(0.25, z + delta)).toFixed(2));
    if (newZoom === z) return;
    const factor = newZoom / z;
    setZoom(newZoom);
    setCanvasOffset({ x: cx - (cx - o.x) * factor, y: cy - (cy - o.y) * factor });
  }

  function resetView() {
    setZoom(1);
    setCanvasOffset({ x: 0, y: 0 });
  }

  // Wheel-to-zoom (non-passive so preventDefault works)
  useEffect(() => {
    const el = canvasWrapperRef.current;
    if (!el) return;
    function onWheel(e: WheelEvent) {
      e.preventDefault();
      const delta = e.deltaY < 0 ? 0.1 : -0.1;
      zoomToward(e.clientX, e.clientY, delta);
    }
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Keyboard shortcuts
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const mod = e.ctrlKey || e.metaKey;
      if (!mod) return;
      const { zoom: z, undoStack: us, redoStack: rs, boardItems: bi } = liveRef.current;
      if (e.key === "z" && !e.shiftKey) {
        e.preventDefault();
        if (us.length === 0) return;
        setRedoStack((r) => [...r.slice(-49), bi]);
        setBoardItems(us[us.length - 1]);
        setUndoStack((s) => s.slice(0, -1));
        addHistoryEntry(setHistory, "Undid last action.");
      } else if (e.key === "y" || (e.key === "z" && e.shiftKey)) {
        e.preventDefault();
        if (rs.length === 0) return;
        setUndoStack((u) => [...u.slice(-49), bi]);
        setBoardItems(rs[rs.length - 1]);
        setRedoStack((s) => s.slice(0, -1));
        addHistoryEntry(setHistory, "Redid last action.");
      } else if (e.key === "=" || e.key === "+") {
        e.preventDefault();
        zoomToward(window.innerWidth / 2, window.innerHeight / 2, 0.1);
      } else if (e.key === "-") {
        e.preventDefault();
        zoomToward(window.innerWidth / 2, window.innerHeight / 2, -0.1);
      } else if (e.key === "0") {
        e.preventDefault();
        setZoom(1);
        setCanvasOffset({ x: 0, y: 0 });
      }
      void z; // satisfy linter
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function updateBoardItem(id: string, updater: (item: BoardItem) => BoardItem) {
    setBoardItems((current) => current.map((item) => (item.id === id ? updater(item) : item)));
  }

  function insertStructure() {
    startTransition(() => {
      pushUndo();
      const offset = boardItems.length * 40;
      const centerX = Math.round((window.innerWidth / 2 - canvasOffset.x) / zoom);
      const centerY = Math.round((window.innerHeight / 2 - canvasOffset.y) / zoom);
      const nextPosition = { x: centerX - 300 + (offset % 220), y: centerY - 120 + (offset % 220) };
      const newItem = createBoardItem(insertDraft.kind, insertDraft, nextPosition);
      setBoardItems((current) => [...current, newItem]);
      addHistoryEntry(setHistory, `Inserted a ${structureCopy[insertDraft.kind].title.toLowerCase()} sketch onto the whiteboard.`);
      setInsertDraft((current) => ({ ...current, values: "" }));
    });
  }

  function removeBoardItem(id: string) {
    pushUndo();
    setBoardItems((current) => current.filter((item) => item.id !== id));
    addHistoryEntry(setHistory, "Removed a whiteboard sketch.");
  }

  function handleCardDragStart(event: React.PointerEvent<HTMLDivElement>, id: string) {
    event.stopPropagation();
    pushUndo();
    const card = event.currentTarget.parentElement;
    if (!card) return;
    const rect = card.getBoundingClientRect();
    setDragState({
      kind: "card",
      id,
      pointerOffsetX: event.clientX - rect.left,
      pointerOffsetY: event.clientY - rect.top,
    });
  }

  function handleCanvasPointerDown(event: React.PointerEvent<HTMLDivElement>) {
    setDragState({
      kind: "pan",
      startClientX: event.clientX,
      startClientY: event.clientY,
      startOffsetX: canvasOffset.x,
      startOffsetY: canvasOffset.y,
    });
  }

  function handlePointerMove(event: React.PointerEvent<HTMLDivElement>) {
    if (!dragState) return;
    if (dragState.kind === "pan") {
      setCanvasOffset({
        x: dragState.startOffsetX + (event.clientX - dragState.startClientX),
        y: dragState.startOffsetY + (event.clientY - dragState.startClientY),
      });
    } else {
      const x = (event.clientX - dragState.pointerOffsetX - canvasOffset.x) / zoom;
      const y = (event.clientY - dragState.pointerOffsetY - canvasOffset.y) / zoom;
      updateBoardItem(dragState.id, (item) => ({ ...item, position: { x, y } }));
    }
  }

  function handlePointerUp() {
    if (dragState?.kind === "card") addHistoryEntry(setHistory, "Moved a whiteboard sketch.");
    setDragState(null);
  }

  function renderArrayBoard(item: ArrayBoard) {
    return (
      <div className="space-y-4">
        <div className="grid gap-2 sm:grid-cols-[120px_120px_120px_120px_1fr]">
          <input value={item.valueInput} onChange={(event) => updateBoardItem(item.id, (current) => current.kind === "array" ? { ...current, valueInput: event.target.value } : current)} className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-500" placeholder="value" />
          <input value={item.indexInput} onChange={(event) => updateBoardItem(item.id, (current) => current.kind === "array" ? { ...current, indexInput: event.target.value } : current)} className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-500" placeholder="index" />
          <input value={item.swapLeftInput} onChange={(event) => updateBoardItem(item.id, (current) => current.kind === "array" ? { ...current, swapLeftInput: event.target.value } : current)} className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-500" placeholder="swap A" />
          <input value={item.swapRightInput} onChange={(event) => updateBoardItem(item.id, (current) => current.kind === "array" ? { ...current, swapRightInput: event.target.value } : current)} className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-500" placeholder="swap B" />
          <div className="grid grid-cols-4 gap-2 text-sm">
            <button type="button" onClick={() => {
              const parsed = Number(item.valueInput);
              if (Number.isNaN(parsed)) {
                addHistoryEntry(setHistory, "Array append skipped because the value was invalid.");
                return;
              }
              pushUndo();
              updateBoardItem(item.id, (current) => current.kind === "array" ? { ...current, values: [...current.values, parsed].slice(0, 15), flash: [Math.min(current.values.length, 14)] } : current);
              addHistoryEntry(setHistory, "Appended an array value.");
            }} className="rounded-xl border border-slate-300 bg-white px-3 py-2 font-medium text-slate-900">Append</button>
            <button type="button" onClick={() => {
              const parsedValue = Number(item.valueInput);
              const parsedIndex = Number(item.indexInput);
              if (Number.isNaN(parsedValue) || Number.isNaN(parsedIndex)) {
                addHistoryEntry(setHistory, "Array insert skipped because the inputs were invalid.");
                return;
              }
              pushUndo();
              updateBoardItem(item.id, (current) => {
                if (current.kind !== "array") return current;
                const index = clamp(parsedIndex, 0, current.values.length);
                const next = [...current.values];
                next.splice(index, 0, parsedValue);
                return { ...current, values: next.slice(0, 15), flash: [index] };
              });
              addHistoryEntry(setHistory, "Inserted an array value.");
            }} className="rounded-xl border border-slate-300 bg-white px-3 py-2 font-medium text-slate-900">Insert</button>
            <button type="button" onClick={() => {
              const parsedIndex = Number(item.indexInput);
              if (Number.isNaN(parsedIndex)) {
                addHistoryEntry(setHistory, "Array remove skipped because the index was invalid.");
                return;
              }
              pushUndo();
              updateBoardItem(item.id, (current) => {
                if (current.kind !== "array" || !current.values.length) return current;
                const index = clamp(parsedIndex, 0, current.values.length - 1);
                return { ...current, values: current.values.filter((_, currentIndex) => currentIndex !== index), flash: [] };
              });
              addHistoryEntry(setHistory, "Removed an array value.");
            }} className="rounded-xl border border-slate-300 bg-white px-3 py-2 font-medium text-slate-900">Remove</button>
            <button type="button" onClick={() => {
              const left = Number(item.swapLeftInput);
              const right = Number(item.swapRightInput);
              if (Number.isNaN(left) || Number.isNaN(right)) {
                addHistoryEntry(setHistory, "Array swap skipped because the swap indices were invalid.");
                return;
              }
              pushUndo();
              updateBoardItem(item.id, (current) => {
                if (current.kind !== "array" || !current.values.length) return current;
                const leftIndex = clamp(left, 0, current.values.length - 1);
                const rightIndex = clamp(right, 0, current.values.length - 1);
                const next = [...current.values];
                [next[leftIndex], next[rightIndex]] = [next[rightIndex], next[leftIndex]];
                return { ...current, values: next, flash: [leftIndex, rightIndex] };
              });
              addHistoryEntry(setHistory, "Swapped array cells.");
            }} className="rounded-xl border border-slate-300 bg-white px-3 py-2 font-medium text-slate-900">Swap</button>
          </div>
        </div>

        <div className="overflow-x-auto rounded-2xl border border-slate-300 bg-white px-6 py-8">
          <div className="min-w-max">
            <div className="flex">
              {item.values.map((value, index) => (
                <button key={`${item.id}-${index}`} type="button" onClick={() => updateBoardItem(item.id, (current) => current.kind === "array" ? { ...current, flash: [index] } : current)} className={`flex h-20 w-[74px] items-center justify-center border border-slate-400 text-xl font-medium text-slate-900 first:border-r-0 [&:not(:last-child)]:border-r-0 ${item.flash.includes(index) ? "bg-blue-50" : "bg-white"}`}>
                  {value}
                </button>
              ))}
            </div>
            <div className="mt-6 flex">
              {item.values.map((_, index) => (
                <div key={`${item.id}-index-${index}`} className="flex w-[74px] justify-center text-base font-semibold text-blue-500">
                  {index}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  function renderLinkedListBoard(item: LinkedListBoard) {
    return (
      <div className="space-y-4">
        <input value={item.valueInput} onChange={(event) => updateBoardItem(item.id, (current) => current.kind === "linked-list" ? { ...current, valueInput: event.target.value } : current)} className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-500" placeholder="node label" />
        <div className="grid grid-cols-2 gap-2 text-sm">
          <button type="button" onClick={() => {
            const label = item.valueInput.trim();
            if (!label) {
              addHistoryEntry(setHistory, "Linked-list insert skipped because the label was empty.");
              return;
            }
            pushUndo();
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
          }} className="rounded-xl border border-slate-300 bg-white px-3 py-2 font-medium text-slate-900">Insert</button>
          <button type="button" onClick={() => {
            if (!item.selectedNodeId) {
              addHistoryEntry(setHistory, "Linked-list remove skipped because no node was selected.");
              return;
            }
            pushUndo();
            updateBoardItem(item.id, (current) => {
              if (current.kind !== "linked-list") return current;
              const next = current.nodes.filter((node) => node.id !== current.selectedNodeId);
              return { ...current, nodes: next, selectedNodeId: next[0]?.id ?? "", flash: [] };
            });
            addHistoryEntry(setHistory, "Removed a linked-list node.");
          }} className="rounded-xl border border-slate-300 bg-white px-3 py-2 font-medium text-slate-900">Remove</button>
        </div>
        <div className="rounded-2xl border border-slate-300 bg-white p-5">
          <div className="flex flex-wrap items-center gap-2">
            {item.nodes.map((node, index) => (
              <div key={node.id} className="flex items-center gap-2">
                <button type="button" onClick={() => updateBoardItem(item.id, (current) => current.kind === "linked-list" ? { ...current, selectedNodeId: node.id, flash: [node.id] } : current)} className={`rounded-xl border px-4 py-3 text-left ${item.selectedNodeId === node.id ? "border-blue-500 bg-blue-50 text-slate-950" : item.flash.includes(node.id) ? "border-amber-400 bg-amber-100 text-slate-950" : "border-slate-300 bg-white text-slate-900"}`}>
                  {node.label}
                </button>
                {index < item.nodes.length - 1 ? <span className="text-slate-700">-&gt;</span> : null}
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  function renderGraphBoard(item: GraphBoard) {
    return (
      <div className="space-y-4">
        <div className="grid gap-2 sm:grid-cols-[1fr_auto_auto]">
          <input value={item.labelInput} onChange={(event) => updateBoardItem(item.id, (current) => current.kind === "graph" ? { ...current, labelInput: event.target.value } : current)} className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-500" placeholder="new node label" />
          <button type="button" onClick={() => {
            const label = item.labelInput.trim() || String(item.nodes.length);
            pushUndo();
            updateBoardItem(item.id, (current) => current.kind === "graph" ? { ...current, nodes: [...current.nodes, { id: createId("graph-node"), label, x: 50, y: 50 }] } : current);
            addHistoryEntry(setHistory, "Added a graph node.");
          }} className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-900">Add node</button>
          <button type="button" onClick={() => {
            if (item.selection.length !== 2) {
              addHistoryEntry(setHistory, "Graph connect skipped because two nodes were not selected.");
              return;
            }
            pushUndo();
            updateBoardItem(item.id, (current) => {
              if (current.kind !== "graph") return current;
              const duplicate = current.edges.some((edge) => edge.from === current.selection[0] && edge.to === current.selection[1]);
              if (duplicate) return current;
              return { ...current, edges: [...current.edges, { id: createId("edge"), from: current.selection[0], to: current.selection[1] }], flash: current.selection };
            });
            addHistoryEntry(setHistory, "Connected graph nodes.");
          }} className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-900">Connect</button>
        </div>
        <button type="button" onClick={() => {
          if (!item.selection.length) {
            addHistoryEntry(setHistory, "Graph remove skipped because no nodes were selected.");
            return;
          }
          pushUndo();
          updateBoardItem(item.id, (current) => current.kind === "graph" ? { ...current, nodes: current.nodes.filter((node) => !current.selection.includes(node.id)), edges: current.edges.filter((edge) => !current.selection.includes(edge.from) && !current.selection.includes(edge.to)), selection: [], flash: [] } : current);
          addHistoryEntry(setHistory, "Removed selected graph nodes.");
        }} className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-900">Remove selected</button>

        <div className="relative min-h-[420px] overflow-hidden rounded-2xl border border-slate-300 bg-white">
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
            <button key={node.id} type="button" onClick={() => updateBoardItem(item.id, (current) => {
              if (current.kind !== "graph") return current;
              const alreadySelected = current.selection.includes(node.id);
              const selection = alreadySelected ? current.selection.filter((entry) => entry !== node.id) : current.selection.length === 2 ? [current.selection[1], node.id] : [...current.selection, node.id];
              return { ...current, selection };
            })} className={`absolute -translate-x-1/2 -translate-y-1/2 rounded-full border text-base font-medium ${item.selection.includes(node.id) ? "border-blue-500 bg-blue-50 text-slate-950" : "border-slate-500 bg-white text-slate-900"}`} style={{ left: `${node.x}%`, top: `${node.y}%`, width: 56, height: 56 }}>
              {node.label}
            </button>
          ))}
        </div>
      </div>
    );
  }

  function renderHashBoard(item: HashBoard) {
    return (
      <div className="space-y-4">
        <div className="grid gap-2 sm:grid-cols-[140px_1fr_auto]">
          <input value={item.keyInput} onChange={(event) => updateBoardItem(item.id, (current) => current.kind === "hashmap" ? { ...current, keyInput: event.target.value } : current)} className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-500" placeholder="key" />
          <input value={item.valueInput} onChange={(event) => updateBoardItem(item.id, (current) => current.kind === "hashmap" ? { ...current, valueInput: event.target.value } : current)} className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-500" placeholder="value or a,b,c" />
          <button type="button" onClick={() => {
            const key = item.keyInput.trim();
            const values = item.valueInput.split(",").map((value) => value.trim()).filter(Boolean);
            if (!key || !values.length) {
              addHistoryEntry(setHistory, "Hash-map insert skipped because the key or values were empty.");
              return;
            }
            pushUndo();
            updateBoardItem(item.id, (current) => {
              if (current.kind !== "hashmap") return current;
              const existing = current.entries.find((entry) => entry.key === key);
              if (existing) return { ...current, entries: current.entries.map((entry) => entry.key === key ? { ...entry, values } : entry), flash: [existing.id] };
              const nextId = createId("hash-entry");
              return { ...current, entries: [...current.entries, { id: nextId, key, values }], flash: [nextId] };
            });
            addHistoryEntry(setHistory, "Updated a hash-map entry.");
          }} className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-900">Insert</button>
        </div>

        <div className="rounded-2xl border border-slate-300 bg-white p-6">
          <div className="grid grid-cols-[1fr_32px_1.6fr] gap-4 font-mono text-3xl text-slate-800">
            <p className="text-center">-keys-</p>
            <div />
            <p className="text-center">-values-</p>
          </div>
          <div className="mt-5 space-y-0">
            {item.entries.map((entry) => (
              <div key={entry.id} className="grid grid-cols-[1fr_32px_1.6fr] gap-4">
                <div className={`flex min-h-16 items-center border-2 border-slate-800 px-4 font-mono text-2xl font-semibold text-slate-900 ${item.flash.includes(entry.id) ? "bg-blue-50" : "bg-white"}`}>
                  &apos;{entry.key}&apos;
                </div>
                <div className="flex items-center justify-center text-slate-500">
                  <div className="h-px w-full bg-slate-500" />
                </div>
                <div className={`flex min-h-16 items-center justify-between border-2 border-slate-800 px-4 font-mono text-2xl font-semibold text-slate-900 ${item.flash.includes(entry.id) ? "bg-blue-50" : "bg-white"}`}>
                  <span>&apos;{entry.values.join(", ")}&apos;</span>
                  <button type="button" onClick={() => {
                    pushUndo();
                    updateBoardItem(item.id, (current) => current.kind === "hashmap" ? { ...current, entries: current.entries.filter((currentEntry) => currentEntry.id !== entry.id), flash: [] } : current);
                    addHistoryEntry(setHistory, "Removed a hash-map entry.");
                  }} className="ml-4 rounded-full border border-slate-300 px-3 py-1 text-xs font-sans uppercase tracking-[0.25em] text-slate-600">Remove</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  const isPanning = dragState?.kind === "pan";
  const isDraggingCard = dragState?.kind === "card";

  return (
    <div
      ref={canvasWrapperRef}
      className="fixed inset-0 overflow-hidden bg-[#08111f] select-none"
      style={{ cursor: isPanning || isDraggingCard ? "grabbing" : "default" }}
      onPointerDown={handleCanvasPointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerUp}
    >
      {/* Fixed dot-grid background — stays in place as canvas pans */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle,rgba(255,255,255,0.13)_1px,transparent_1px)] bg-[size:32px_32px]" />

      {/* Infinite canvas */}
      <div
        className="absolute"
        style={{
          transform: `translate(${canvasOffset.x}px, ${canvasOffset.y}px) scale(${zoom})`,
          transformOrigin: "0 0",
          width: 4000,
          height: 3000,
        }}
      >
        {boardItems.map((item) => (
          <article
            key={item.id}
            className="absolute rounded-[1.6rem] border border-white/15 bg-[linear-gradient(180deg,rgba(248,250,252,0.98),rgba(241,245,249,0.98))] p-4 shadow-[0_24px_60px_rgba(2,6,23,0.4)] backdrop-blur"
            style={{ left: item.position.x, top: item.position.y, width: getCardWidth(item) }}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <div
              onPointerDown={(event) => handleCardDragStart(event, item.id)}
              className="mb-4 flex cursor-grab items-center justify-between gap-3 rounded-2xl border border-slate-300 bg-white px-4 py-3 active:cursor-grabbing"
            >
              <div className="flex items-center gap-3">
                <div className="flex flex-col gap-1">
                  <div className="h-0.5 w-5 rounded-full bg-slate-300" />
                  <div className="h-0.5 w-5 rounded-full bg-slate-300" />
                  <div className="h-0.5 w-5 rounded-full bg-slate-300" />
                </div>
                <span className="text-xs font-medium uppercase tracking-widest text-slate-400">
                  {structureCopy[item.kind].title}
                </span>
              </div>
              <button
                type="button"
                onClick={() => removeBoardItem(item.id)}
                className="rounded-full border border-slate-300 px-3 py-1 text-[11px] uppercase tracking-[0.25em] text-slate-500 hover:border-red-300 hover:text-red-500 transition-colors"
              >
                Remove
              </button>
            </div>

            {item.kind === "array" ? renderArrayBoard(item) : null}
            {item.kind === "linked-list" ? renderLinkedListBoard(item) : null}
            {item.kind === "graph" ? renderGraphBoard(item) : null}
            {item.kind === "hashmap" ? renderHashBoard(item) : null}
          </article>
        ))}
      </div>

      {/* Floating toolbar — bottom left */}
      <div
        className="fixed bottom-6 left-6 z-30"
        onPointerDown={(e) => e.stopPropagation()}
      >
        {toolbarOpen ? (
          <div className="w-80 rounded-[1.8rem] border border-white/12 bg-slate-950/96 p-5 shadow-[0_32px_80px_rgba(2,6,23,0.65)] backdrop-blur">
            <div className="mb-4 flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-cyan-300/80">Insert Structure</p>
              <button
                type="button"
                onClick={() => setToolbarOpen(false)}
                className="rounded-full border border-white/10 px-3 py-1 text-[11px] uppercase tracking-[0.2em] text-slate-400 hover:text-white transition-colors"
              >
                Close
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2">
              {(["array", "linked-list", "graph", "hashmap"] as StructureKind[]).map((kind) => (
                <button
                  key={kind}
                  type="button"
                  onClick={() => setInsertDraft((current) => ({ ...current, kind }))}
                  className={`rounded-2xl border px-3 py-2.5 text-left text-sm transition-colors ${
                    insertDraft.kind === kind
                      ? "border-cyan-300 bg-cyan-300 text-slate-950"
                      : "border-white/10 bg-white/5 text-white hover:border-cyan-300/40 hover:bg-white/8"
                  }`}
                >
                  <p className="font-medium text-sm">{structureCopy[kind].title}</p>
                  <p className="mt-0.5 text-[11px] leading-4 opacity-70">{structureCopy[kind].hint}</p>
                </button>
              ))}
            </div>

            <div className="mt-4 space-y-3">
              <label className="grid gap-1.5">
                <span className="text-[11px] uppercase tracking-wider text-slate-400">Starter elements</span>
                <input
                  value={insertDraft.count}
                  onChange={(e) => setInsertDraft((c) => ({ ...c, count: e.target.value }))}
                  className="rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-sm text-white outline-none focus:border-cyan-400 placeholder:text-slate-600"
                  placeholder="4"
                />
              </label>
              <label className="grid gap-1.5">
                <span className="text-[11px] uppercase tracking-wider text-slate-400">Starter values</span>
                <textarea
                  value={insertDraft.values}
                  onChange={(e) => setInsertDraft((c) => ({ ...c, values: e.target.value }))}
                  className="min-h-16 resize-none rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-sm text-white leading-6 outline-none focus:border-cyan-400 placeholder:text-slate-600"
                  placeholder={insertDraft.kind === "hashmap" ? "ca:California; ok:Oklahoma" : "1,2,3"}
                />
              </label>
              <p className="rounded-xl border border-white/8 bg-white/4 px-3 py-2 text-[11px] leading-5 text-slate-500">
                {structureCopy[insertDraft.kind].helper}
              </p>
              <button
                type="button"
                onClick={insertStructure}
                className="w-full rounded-2xl bg-amber-300 px-4 py-2.5 text-sm font-semibold text-slate-950 transition-colors hover:bg-amber-200"
              >
                Insert onto whiteboard
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setToolbarOpen(true)}
            className="flex items-center gap-2.5 rounded-2xl border border-white/15 bg-slate-950/90 px-5 py-3 text-sm font-medium text-white shadow-[0_8px_32px_rgba(2,6,23,0.5)] backdrop-blur hover:bg-slate-900/95 transition-colors"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="shrink-0">
              <path d="M7 1v12M1 7h12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
            Insert structure
          </button>
        )}
      </div>

      {/* History panel — top right */}
      <div
        className="fixed top-5 right-5 z-30"
        onPointerDown={(e) => e.stopPropagation()}
      >
        {historyOpen ? (
          <div className="w-72 rounded-[1.8rem] border border-white/12 bg-slate-950/96 p-5 shadow-[0_32px_80px_rgba(2,6,23,0.65)] backdrop-blur">
            <div className="mb-3 flex items-center justify-between gap-3">
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-cyan-300/80">History</p>
              <button
                type="button"
                onClick={() => setHistoryOpen(false)}
                className="rounded-full border border-white/10 px-3 py-1 text-[11px] uppercase tracking-[0.2em] text-slate-400 hover:text-white transition-colors"
              >
                Close
              </button>
            </div>
            <div className="max-h-80 space-y-1.5 overflow-y-auto">
              {history.map((entry, index) => (
                <div
                  key={`${entry}-${index}`}
                  className="rounded-xl border border-white/8 bg-white/4 px-3 py-2 text-xs leading-5 text-slate-400"
                >
                  {entry}
                </div>
              ))}
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setHistoryOpen(true)}
            className="rounded-2xl border border-white/15 bg-slate-950/90 px-4 py-2.5 text-xs text-slate-400 shadow backdrop-blur hover:text-slate-200 transition-colors"
          >
            {boardItems.length} sketch{boardItems.length !== 1 ? "es" : ""} &middot; history
          </button>
        )}
      </div>

      {/* Zoom + Undo controls — bottom right */}
      <div
        className="fixed bottom-6 right-6 z-30 flex items-center gap-2"
        onPointerDown={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={undo}
          disabled={undoStack.length === 0}
          title="Undo (Ctrl+Z)"
          className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/15 bg-slate-950/90 text-slate-300 shadow backdrop-blur transition-colors hover:text-white disabled:opacity-30 disabled:cursor-not-allowed"
        >
          <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
            <path d="M3 7.5A4.5 4.5 0 1 1 7.5 12H5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M3 4.5v3h3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
        <button
          type="button"
          onClick={redo}
          disabled={redoStack.length === 0}
          title="Redo (Ctrl+Y)"
          className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/15 bg-slate-950/90 text-slate-300 shadow backdrop-blur transition-colors hover:text-white disabled:opacity-30 disabled:cursor-not-allowed"
        >
          <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
            <path d="M12 7.5A4.5 4.5 0 1 0 7.5 12H10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M12 4.5v3H9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
        <div className="flex items-center gap-0.5 rounded-xl border border-white/15 bg-slate-950/90 px-1 py-1 shadow backdrop-blur">
          <button
            type="button"
            onClick={() => zoomToward(window.innerWidth / 2, window.innerHeight / 2, -0.1)}
            disabled={zoom <= 0.25}
            title="Zoom out (Ctrl+-)"
            className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-300 transition-colors hover:bg-white/8 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed text-lg leading-none"
          >−</button>
          <button
            type="button"
            onClick={resetView}
            title="Reset zoom (Ctrl+0)"
            className="min-w-[3.2rem] px-1 text-center text-xs font-medium tabular-nums text-slate-300 hover:text-white transition-colors"
          >{Math.round(zoom * 100)}%</button>
          <button
            type="button"
            onClick={() => zoomToward(window.innerWidth / 2, window.innerHeight / 2, 0.1)}
            disabled={zoom >= 2}
            title="Zoom in (Ctrl+=)"
            className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-300 transition-colors hover:bg-white/8 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed text-lg leading-none"
          >+</button>
        </div>
      </div>

      {/* Pan hint */}
      <div className="pointer-events-none fixed bottom-6 left-1/2 -translate-x-1/2 z-20">
        <p className="rounded-full border border-white/10 bg-slate-950/70 px-4 py-2 text-[11px] text-slate-500 backdrop-blur">
          Drag canvas to pan &nbsp;·&nbsp; scroll to zoom &nbsp;·&nbsp; Ctrl+Z to undo
        </p>
      </div>
    </div>
  );
}
