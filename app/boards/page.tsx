"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTheme } from "@/app/components/theme-provider";
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
const TEMP_AUTH_BYPASS = false;

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

function normalizeBoardName(name: string): string {
  return name.trim().toLowerCase();
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
  const uiButtonLabel = "text-sm font-medium leading-none";
  const { theme } = useTheme();
  const isSpace = theme === "space";

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

    if (TEMP_AUTH_BYPASS) {
      setDbAvailable(false);
      setUserId("local-dev-user");
      setUserEmail("Local development mode");
      setLoading(false);
      return () => {
        mounted = false;
      };
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

  const duplicateNameWarning = useMemo(() => {
    if (!activeBoard || !draftState) return null;

    const candidateName = draftState.whiteboardName?.trim();
    if (!candidateName) return null;

    const duplicateExists = boards.some(
      b => b.id !== activeBoard.id && normalizeBoardName(b.name) === normalizeBoardName(candidateName),
    );

    return duplicateExists ? `Board name \"${candidateName}\" already exists. Choose a different name.` : null;
  }, [activeBoard, draftState, boards]);

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

    const existingNames = new Set(boards.map(b => normalizeBoardName(b.name)));
    let nextIndex = boards.length + 1;
    while (existingNames.has(normalizeBoardName(`Board ${nextIndex}`))) {
      nextIndex += 1;
    }

    const state = emptyBoardState(`Board ${nextIndex}`);
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
    if (TEMP_AUTH_BYPASS) {
      setView("home");
      return;
    }

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
    if (duplicateNameWarning) {
      if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
      return;
    }

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
  }, [activeBoard, draftState, userId, dbAvailable, duplicateNameWarning, supabase]);

  if (loading) {
    return <main className="min-h-screen bg-slate-50 text-slate-700 flex items-center justify-center">Loading workspace...</main>;
  }

  if (view === "home") {
    return (
      <main className={`relative min-h-screen overflow-hidden ${isSpace ? "bg-[#060d1b] text-slate-100" : "bg-slate-100"}`}>
        {isSpace && (
          <>
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(1200px_600px_at_20%_-10%,rgba(56,189,248,0.28),transparent_55%),radial-gradient(900px_500px_at_85%_110%,rgba(59,130,246,0.22),transparent_60%),linear-gradient(180deg,#060d1b_0%,#0a1530_100%)]" />
            <div className="pointer-events-none absolute inset-0 opacity-40 [background-image:radial-gradient(circle_at_20%_20%,rgba(255,255,255,.9)_0_1px,transparent_1px),radial-gradient(circle_at_75%_35%,rgba(255,255,255,.7)_0_1px,transparent_1px),radial-gradient(circle_at_40%_80%,rgba(255,255,255,.65)_0_1px,transparent_1px)] [background-size:180px_180px,220px_220px,260px_260px]" />
          </>
        )}
        <div className="relative z-10 mx-auto w-full max-w-6xl px-6 py-6">
          <div className="mb-5 flex items-center justify-between">
            <div>
              <h1 className={`text-2xl font-semibold ${isSpace ? "text-slate-50" : "text-slate-900"}`}>Rippleboard</h1>
              <p className={`text-sm ${isSpace ? "text-slate-300" : "text-slate-500"}`}>{userEmail}</p>
            </div>
            <button
              onClick={() => void logout()}
              className={`rounded-md border px-3 py-1.5 text-sm font-medium cursor-pointer ${isSpace ? "border-slate-400/40 bg-slate-900/60 text-slate-100 hover:bg-slate-800/70" : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"}`}
            >
              <span className={uiButtonLabel}>Logout</span>
            </button>
          </div>

          <section className={`rounded-xl border p-4 ${isSpace ? "border-slate-500/30 bg-slate-950/40" : "border-slate-200 bg-white"}`}>
            <p className={`mb-3 text-sm font-medium ${isSpace ? "text-slate-100" : "text-slate-700"}`}>Template</p>
            <div className="flex flex-wrap gap-3">
              <div className="w-40">
                <button
                  onClick={() => void createBoard()}
                  disabled={busy}
                  className={`h-24 w-40 rounded-lg border text-4xl font-light disabled:opacity-50 cursor-pointer ${isSpace ? "border-slate-400/40 bg-slate-900/60 text-slate-100 hover:bg-slate-800/70" : "border-slate-300 bg-white text-slate-800 hover:bg-slate-50"}`}
                  aria-label="Create blank board"
                >
                  +
                </button>
                <p className={`mt-2 text-sm font-medium ${isSpace ? "text-slate-200" : "text-slate-700"}`}>Blank board</p>
              </div>
            </div>
          </section>

          {error && (
            <div className="mt-4 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
              {error}
            </div>
          )}

          {TEMP_AUTH_BYPASS && (
            <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              Auth is temporarily disabled. Boards are running in local-only mode until Supabase env keys are available.
            </div>
          )}

          <section className={`mt-5 rounded-xl border p-4 ${isSpace ? "border-slate-500/30 bg-slate-950/40" : "border-slate-200 bg-white"}`}>
            <div className="mb-3 flex items-center justify-between">
              <h2 className={`text-lg font-semibold ${isSpace ? "text-slate-50" : "text-slate-900"}`}>Boards</h2>
              <span className={`text-xs ${isSpace ? "text-slate-300" : "text-slate-500"}`}>{boards.length} total</span>
            </div>

            {boards.length === 0 ? (
              <p className={`text-sm ${isSpace ? "text-slate-300" : "text-slate-500"}`}>No boards yet. Create a blank board to get started.</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {boards.map(board => (
                  <div key={board.id} className={`rounded-lg border p-3 transition-colors ${isSpace ? "border-slate-500/30 bg-slate-900/55 hover:bg-slate-800/65 hover:border-slate-400/40" : "border-slate-200 bg-white hover:bg-slate-50 hover:border-slate-300"}`}>
                    <button className="w-full text-left cursor-pointer" onClick={() => openBoard(board.id)}>
                      <p className={`truncate text-sm font-medium ${isSpace ? "text-slate-100" : "text-slate-900"}`}>{board.name}</p>
                      <p className={`mt-1 text-xs ${isSpace ? "text-slate-300" : "text-slate-500"}`}>Updated {new Date(board.updated_at).toLocaleString()}</p>
                    </button>
                    <div className="mt-3 flex justify-end">
                      <button
                        onClick={() => void deleteBoard(board.id)}
                        className="text-xs text-rose-500 hover:text-rose-700 cursor-pointer"
                      >
                        <span className={uiButtonLabel}>Delete</span>
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
    <main className={`h-screen ${isSpace ? "bg-[#060d1b]" : "bg-slate-100"}`}>
      <section className="h-full flex flex-col min-w-0">
        {error && (
          <div className="px-3 py-2 text-xs text-rose-700 bg-rose-50 border-b border-rose-200">
            {error}
          </div>
        )}
        {duplicateNameWarning && (
          <div className="px-3 py-2 text-xs text-amber-800 bg-amber-50 border-b border-amber-200">
            {duplicateNameWarning}
          </div>
        )}

        {workingState ? (
          <VisualizerWorkbench
            key={activeBoard?.id ?? "local-draft"}
            initialState={workingState}
            onStateChange={handleWorkbenchStateChange}
            onBackToHome={() => setView("home")}
            theme={theme}
          />
        ) : (
          <div className="flex-1 grid place-items-center text-sm text-slate-500">
            <div className="flex flex-col items-center gap-3">
              <p>Create a board from the left panel to start.</p>
              <button
                onClick={createLocalDraft}
                className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                <span className={uiButtonLabel}>Create blank board</span>
              </button>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}
