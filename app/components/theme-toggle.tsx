"use client";

import { useTheme } from "@/app/components/theme-provider";

export default function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  const isSpace = theme === "space";

  return (
    <button
      type="button"
      onClick={toggleTheme}
      className="fixed right-3 top-14 z-[70] h-10 w-24 cursor-pointer rounded-full border border-slate-300/70 p-0.5 shadow-[0_6px_16px_rgba(15,23,42,0.25)] backdrop-blur transition-colors"
      title={isSpace ? "Switch to Light theme" : "Switch to Space theme"}
      aria-label={isSpace ? "Switch to Light theme" : "Switch to Space theme"}
    >
      <span
        className={`relative flex h-full w-full items-center rounded-full transition-all duration-300 ${isSpace
          ? "bg-[linear-gradient(135deg,#0b1227,#1f2937)]"
          : "bg-[linear-gradient(135deg,#38bdf8,#60a5fa)]"}`}
      >
        {isSpace ? (
          <>
            <span className="absolute left-3 top-2 h-1 w-1 rounded-full bg-white/90" />
            <span className="absolute left-6 top-4 h-1.5 w-1.5 rounded-full bg-white/80" />
            <span className="absolute left-9 top-2.5 h-1 w-1 rounded-full bg-white/85" />
            <span className="absolute left-8 top-6 h-1 w-1 rounded-full bg-white/70" />
          </>
        ) : (
          <>
            <span className="absolute inset-x-0 bottom-0 h-4 rounded-b-full bg-white/55" />
            <span className="absolute bottom-1 left-4 h-3 w-8 rounded-full bg-white/45" />
          </>
        )}

        <span
          className={`absolute top-0.5 inline-flex h-8 w-8 items-center justify-center rounded-full border shadow-[0_3px_10px_rgba(2,6,23,0.35)] transition-all duration-300 ${isSpace
            ? "left-[54px] border-slate-300 bg-slate-200 text-slate-700"
            : "left-0.5 border-amber-300 bg-amber-300 text-amber-700"}`}
        >
          {isSpace ? (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <circle cx="12" cy="12" r="7.5" fill="currentColor" opacity="0.2" />
              <circle cx="9" cy="9" r="1.6" fill="currentColor" />
              <circle cx="14.8" cy="13.8" r="2.1" fill="currentColor" opacity="0.75" />
              <circle cx="8" cy="15.2" r="1.2" fill="currentColor" opacity="0.8" />
            </svg>
          ) : (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <circle cx="12" cy="12" r="4.2" fill="currentColor" />
              <path d="M12 3v2.2M12 18.8V21M3 12h2.2M18.8 12H21M5.9 5.9l1.5 1.5M16.6 16.6l1.5 1.5M5.9 18.1l1.5-1.5M16.6 7.4l1.5-1.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
            </svg>
          )}
        </span>
      </span>
    </button>
  );
}
