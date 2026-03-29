"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { useTheme } from "@/app/components/theme-provider";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  const supabase = getSupabaseBrowserClient();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const { theme } = useTheme();
  const isSpace = theme === "space";

  useEffect(() => {
    let mounted = true;

    void supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      if (data.session) router.replace("/boards");
    });

    return () => {
      mounted = false;
    };
  }, [router, supabase.auth]);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    setLoading(false);

    if (signInError) {
      setError(signInError.message);
      return;
    }

    router.replace("/boards");
  }

  return (
    <main className={`relative flex min-h-screen items-center justify-center overflow-hidden px-4 ${isSpace ? "bg-[#060d1b] text-slate-100" : "bg-slate-50 text-slate-900"}`}>
      {isSpace && (
        <>
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(1200px_600px_at_20%_-10%,rgba(56,189,248,0.28),transparent_55%),radial-gradient(900px_500px_at_85%_110%,rgba(59,130,246,0.22),transparent_60%),linear-gradient(180deg,#060d1b_0%,#0a1530_100%)]" />
          <div className="pointer-events-none absolute inset-0 opacity-40 [background-image:radial-gradient(circle_at_20%_20%,rgba(255,255,255,.9)_0_1px,transparent_1px),radial-gradient(circle_at_75%_35%,rgba(255,255,255,.7)_0_1px,transparent_1px),radial-gradient(circle_at_40%_80%,rgba(255,255,255,.65)_0_1px,transparent_1px)] [background-size:180px_180px,220px_220px,260px_260px]" />
        </>
      )}

      <form
        onSubmit={handleSubmit}
        className={`relative z-10 w-full max-w-sm space-y-4 p-6 ${isSpace ? "rounded-2xl border border-sky-200/25 bg-slate-950/55 shadow-[0_20px_60px_rgba(2,6,23,0.55)] backdrop-blur-md" : "rounded-xl border border-slate-200 bg-white shadow-sm"}`}
      >
        {isSpace && <p className="text-xs font-medium uppercase tracking-[0.18em] text-sky-200/80">Mission Access</p>}
        <h1 className={`text-xl font-semibold ${isSpace ? "text-slate-50" : "text-slate-900"}`}>Login</h1>

        <label className={`block text-sm ${isSpace ? "text-slate-200" : "text-slate-700"}`}>
          Email
          <input
            type="email"
            required
            value={email}
            onChange={e => setEmail(e.target.value)}
            className={`mt-1 w-full rounded-md px-3 py-2 text-sm outline-none ${isSpace ? "border border-slate-300/25 bg-slate-900/50 text-slate-100 placeholder:text-slate-500 focus:border-sky-400" : "border border-slate-300 text-slate-900 focus:border-slate-500"}`}
          />
        </label>

        <label className={`block text-sm ${isSpace ? "text-slate-200" : "text-slate-700"}`}>
          Password
          <input
            type="password"
            required
            minLength={8}
            value={password}
            onChange={e => setPassword(e.target.value)}
            className={`mt-1 w-full rounded-md px-3 py-2 text-sm outline-none ${isSpace ? "border border-slate-300/25 bg-slate-900/50 text-slate-100 placeholder:text-slate-500 focus:border-sky-400" : "border border-slate-300 text-slate-900 focus:border-slate-500"}`}
          />
        </label>

        {error && <p className={`text-sm ${isSpace ? "text-rose-300" : "text-rose-600"}`}>{error}</p>}

        <button
          type="submit"
          disabled={loading}
          className={`w-full rounded-md py-2.5 text-sm font-medium text-white transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-50 ${isSpace ? "bg-gradient-to-r from-sky-500 to-blue-600 shadow-[0_8px_20px_rgba(14,116,246,0.35)] hover:from-sky-400 hover:to-blue-500" : "bg-slate-900 hover:bg-slate-700"}`}
        >
          {loading ? "Signing in..." : "Login"}
        </button>

        <p className={`text-sm ${isSpace ? "text-slate-300" : "text-slate-600"}`}>
          No account yet?{" "}
          <Link href="/signup" className={`font-medium hover:underline ${isSpace ? "text-sky-300 hover:text-sky-200" : "text-slate-900"}`}>
            Create one
          </Link>
        </p>
      </form>
    </main>
  );
}
