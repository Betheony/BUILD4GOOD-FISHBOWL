"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import VisualizerWorkbench, { PersistedBoardState } from "@/app/components/visualizer-workbench";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

type WhiteboardRow = {
  id: string;
  user_id: string;
  name: string;
  state_json: PersistedBoardState;
  created_at: string;
  updated_at: string;
};

const LOCAL_DRAFT_KEY = "fishbowl_local_draft_v1";

function emptyBoardState(name = "Untitled Whiteboard"): PersistedBoardState {
  return {
    version: 1,
    boardItems: [],
    annotations: [],
    canvasOffset: { x: 80, y: 80 },
    zoom: 1,
    whiteboardName: name,
    edgeMode: "directed",
  };
}

export default function BoardsPage() {
  const router = useRouter();
  const supabase = getSupabaseBrowserClient();

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string>("");
  const [boards, setBoards] = useState<WhiteboardRow[]>([]);
  const [activeBoardId, setActiveBoardId] = useState<string | null>(null);
  const [draftState, setDraftState] = useState<PersistedBoardState | null>(null);
  const [localDraft, setLocalDraft] = useState<PersistedBoardState | null>(null);
  const [view, setView] = useState<"home" | "editor">("home");
  const [dbAvailable, setDbAvailable] = useState(true);
  const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSavedHashRef = useRef<string>("");

  const persistLocalDraft = useCallback((state: PersistedBoardState | null) => {
    if (typeof window === "undefined") return;
    if (!state) {
      window.localStorage.removeItem(LOCAL_DRAFT_KEY);
      return;
    }
    window.localStorage.setItem(LOCAL_DRAFT_KEY, JSON.stringify(state));
  }, []);

  function createLocalDraft() {
    const state = emptyBoardState("Untitled Whiteboard");
    setLocalDraft(state);
    setActiveBoardId(null);
    persistLocalDraft(state);
    setView("editor");
  }

  async function loadBoards(uid: string, preferredBoardId?: string) {
    const { data, error: fetchError } = await supabase
      .from("whiteboards")
      .select("id,user_id,name,state_json,created_at,updated_at")
      .eq("user_id", uid)
      .order("updated_at", { ascending: false });

    if (fetchError) {
      if (fetchError.message.includes("Could not find the table 'public.whiteboards'")) {
        setDbAvailable(false);
        setBoards([]);
        setActiveBoardId(null);
        setError("Database table missing. Run supabase/schema.sql in Supabase SQL Editor. You can still use a local draft.");
        return;
      }
      setError(fetchError.message);
      return;
    }

    setDbAvailable(true);
    const nextBoards = (data as WhiteboardRow[]) ?? [];
    setBoards(nextBoards);

    const nextActiveId = preferredBoardId && nextBoards.some(b => b.id === preferredBoardId)
      ? preferredBoardId
      : null;

    setActiveBoardId(nextActiveId);
  }

  useEffect(() => {
    let mounted = true;

    if (typeof window !== "undefined") {
      const raw = window.localStorage.getItem(LOCAL_DRAFT_KEY);
      if (raw) {
        try {
          const parsed = JSON.parse(raw) as PersistedBoardState;
          if (parsed?.version === 1) setLocalDraft(parsed);
        } catch {
          window.localStorage.removeItem(LOCAL_DRAFT_KEY);
        }
      }
    }

    void (async () => {
      const { data, error: sessionError } = await supabase.auth.getSession();

      if (!mounted) return;

      if (sessionError) {
        setError(sessionError.message);
        setLoading(false);
        return;
      }

      const session = data.session;
      if (!session?.user) {
        router.replace("/login");
        return;
      }

      setUserId(session.user.id);
      setUserEmail(session.user.email ?? "");
      await loadBoards(session.user.id);
      setLoading(false);
    })();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session?.user) {
        router.replace("/login");
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [router, supabase.auth]);

  const activeBoard = useMemo(
    () => boards.find(b => b.id === activeBoardId) ?? null,
    [boards, activeBoardId],
  );

  const activeBoardInitialState = useMemo(() => {
    if (!activeBoard) return emptyBoardState();
    return activeBoard.state_json ?? emptyBoardState(activeBoard.name);
  }, [activeBoard]);

  const workingState = activeBoard ? activeBoardInitialState : localDraft;

  useEffect(() => {
    if (!activeBoard) {
      setDraftState(null);
      lastSavedHashRef.current = "";
      return;
    }

    const initial = activeBoard.state_json ?? emptyBoardState(activeBoard.name);
    setDraftState(initial);
    lastSavedHashRef.current = JSON.stringify(initial);
  }, [activeBoard]);

  async function createBoard() {
    if (!userId) return;
    if (!dbAvailable) {
      createLocalDraft();
      return;
    }
    setError(null);
    setBusy(true);

    const state = emptyBoardState(`Board ${boards.length + 1}`);
    const { data, error: createError } = await supabase
      .from("whiteboards")
      .insert({
        user_id: userId,
        name: state.whiteboardName,
        state_json: state,
      })
      .select("id,user_id,name,state_json,created_at,updated_at")
      .single();

    setBusy(false);

    if (createError) {
      setError(createError.message);
      return;
    }

    const created = data as WhiteboardRow;
    setBoards(prev => [created, ...prev]);
    setActiveBoardId(created.id);
    setView("editor");
  }

  function openBoard(boardId: string) {
    setActiveBoardId(boardId);
    setView("editor");
  }

  async function deleteBoard(boardId: string) {
    if (!userId || !dbAvailable) return;
    setError(null);
    setBusy(true);

    const { error: deleteError } = await supabase
      .from("whiteboards")
      .delete()
      .eq("id", boardId)
      .eq("user_id", userId);

    setBusy(false);

    if (deleteError) {
      setError(deleteError.message);
      return;
    }

    const remaining = boards.filter(b => b.id !== boardId);
    setBoards(remaining);

    if (activeBoardId === boardId) {
      setActiveBoardId(remaining[0]?.id ?? null);
    }
  }

  async function logout() {
    await supabase.auth.signOut();
    router.replace("/login");
  }

  const handleWorkbenchStateChange = useCallback((state: PersistedBoardState) => {
    if (activeBoard) {
      setDraftState(state);
      return;
    }

    setLocalDraft(state);
    persistLocalDraft(state);
  }, [activeBoard, persistLocalDraft]);

  useEffect(() => {
    if (!activeBoard || !draftState || !userId || !dbAvailable) return;

    const nextHash = JSON.stringify(draftState);
    if (nextHash === lastSavedHashRef.current) return;

    if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);

    autosaveTimerRef.current = setTimeout(async () => {
      const { data, error: saveError } = await supabase
        .from("whiteboards")
        .update({
          name: draftState.whiteboardName || activeBoard.name,
          state_json: draftState,
        })
        .eq("id", activeBoard.id)
        .eq("user_id", userId)
        .select("id,user_id,name,state_json,created_at,updated_at")
        .single();

      if (saveError) {
        setError(saveError.message);
        return;
      }

      const saved = data as WhiteboardRow;
      setBoards(prev => prev.map(b => (b.id === saved.id ? saved : b)));
      lastSavedHashRef.current = nextHash;
    }, 700);

    return () => {
      if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
    };
  }, [activeBoard, draftState, userId, dbAvailable, supabase]);

  if (loading) {
    return <main className="min-h-screen bg-slate-50 text-slate-700 flex items-center justify-center">Loading workspace...</main>;
  }

  if (view === "home") {
    return (
      <main className="min-h-screen bg-slate-100">
        <div className="mx-auto w-full max-w-6xl px-6 py-6">
          <div className="mb-5 flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-semibold text-slate-900">Build4Good Whiteboard</h1>
              <p className="text-sm text-slate-500">{userEmail}</p>
            </div>
            <button
              onClick={() => void logout()}
              className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 cursor-pointer"
            >
              Logout
            </button>
          </div>

          <section className="rounded-xl border border-slate-200 bg-white p-4">
            <p className="text-sm font-medium text-slate-700 mb-3">Start from</p>
            <div className="flex flex-wrap gap-3">
              <div className="w-40">
                <button
                  onClick={() => void createBoard()}
                  disabled={busy}
                  className="h-24 w-40 rounded-lg border border-slate-300 bg-white text-slate-800 hover:bg-slate-50 text-4xl font-light disabled:opacity-50 cursor-pointer"
                  aria-label="Create blank board"
                >
                  +
                </button>
                <p className="mt-2 text-sm font-medium text-slate-700">Blank board</p>
              </div>
            </div>
          </section>

          {error && (
            <div className="mt-4 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
              {error}
            </div>
          )}

          <section className="mt-5 rounded-xl border border-slate-200 bg-white p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-900">Boards</h2>
              <span className="text-xs text-slate-500">{boards.length} total</span>
            </div>

            {boards.length === 0 ? (
              <p className="text-sm text-slate-500">No boards yet. Create a blank board to get started.</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {boards.map(board => (
                  <div key={board.id} className="rounded-lg border border-slate-200 bg-white p-3 transition-colors hover:bg-slate-50 hover:border-slate-300">
                    <button className="w-full text-left cursor-pointer" onClick={() => openBoard(board.id)}>
                      <p className="text-sm font-medium text-slate-900 truncate">{board.name}</p>
                      <p className="mt-1 text-xs text-slate-500">Updated {new Date(board.updated_at).toLocaleString()}</p>
                    </button>
                    <div className="mt-3 flex justify-end">
                      <button
                        onClick={() => void deleteBoard(board.id)}
                        className="text-xs text-rose-500 hover:text-rose-700 cursor-pointer"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </main>
    );
  }

  return (
    <main className="h-screen bg-slate-100">
      <section className="h-full flex flex-col min-w-0">
        {error && (
          <div className="px-3 py-2 text-xs text-rose-700 bg-rose-50 border-b border-rose-200">
            {error}
          </div>
        )}

        {workingState ? (
          <VisualizerWorkbench
            key={activeBoard?.id ?? "local-draft"}
            initialState={workingState}
            onStateChange={handleWorkbenchStateChange}
            onBackToHome={() => setView("home")}
          />
        ) : (
          <div className="flex-1 grid place-items-center text-sm text-slate-500">
            <div className="flex flex-col items-center gap-3">
              <p>Create a board from the left panel to start.</p>
              <button
                onClick={createLocalDraft}
                className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                Create blank board
              </button>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}
