"use client";

import { useTheme } from "@/app/components/theme-provider";

export default function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  const isSpace = theme === "space";

  return (
    <button
      type="button"
      onClick={toggleTheme}
      className="fixed left-5 top-25 z-[70] cursor-pointer"
      title={isSpace ? "Switch to Light theme" : "Switch to Space theme"}
      aria-label={isSpace ? "Switch to Light theme" : "Switch to Space theme"}
      style={{
        width: "96px",
        height: "44px",
        borderRadius: "999px",
        padding: "0",
        background: isSpace
          ? "linear-gradient(180deg, #2a2a2a 0%, #1a1a1a 100%)"
          : "linear-gradient(180deg, #e8e8e8 0%, #d0d0d0 100%)",
        boxShadow: isSpace
          ? "inset 0 2px 6px rgba(0,0,0,0.6), 0 2px 8px rgba(0,0,0,0.4)"
          : "inset 0 2px 6px rgba(0,0,0,0.2), 0 2px 8px rgba(0,0,0,0.15)",
        border: "none",
        transition: "background 0.4s ease",
        position: "relative",
      }}
    >
      {/* Inner track — no overflow hidden so thumb isn't clipped */}
      <span
        style={{
          display: "block",
          position: "absolute",
          inset: "4px",
          borderRadius: "999px",
          overflow: "hidden",
          background: isSpace
            ? "linear-gradient(180deg, #1c1c2e 0%, #2d2d44 100%)"
            : "linear-gradient(180deg, #5bb8f5 0%, #3a9de0 40%, #6ec6f5 100%)",
          transition: "background 0.4s ease",
        }}
      >
        {/* DAY: layered sky arcs */}
        {!isSpace && (
          <>
            <span style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, #4aaee8 0%, #70c3f5 100%)", borderRadius: "999px" }} />
            <span style={{ position: "absolute", right: "-4px", top: "-4px", width: "60px", height: "52px", borderRadius: "999px", background: "linear-gradient(180deg, #5abcf0 0%, #7dcef8 100%)", opacity: 0.8 }} />
            <span style={{ position: "absolute", right: "-2px", top: "0px", width: "52px", height: "44px", borderRadius: "999px", background: "linear-gradient(180deg, #6bc5f2 0%, #8ad4f9 100%)", opacity: 0.8 }} />
            <span style={{ position: "absolute", right: "0px", top: "2px", width: "46px", height: "38px", borderRadius: "999px", background: "linear-gradient(180deg, #7dcef5 0%, #9adcfb 100%)", opacity: 0.75 }} />
            {/* Cloud puffs */}
            <span style={{ position: "absolute", right: "4px", bottom: "-4px", width: "44px", height: "24px", borderRadius: "50% 50% 0 0", background: "white", opacity: 0.95 }} />
            <span style={{ position: "absolute", right: "12px", bottom: "4px", width: "28px", height: "20px", borderRadius: "50%", background: "white", opacity: 0.9 }} />
            <span style={{ position: "absolute", right: "2px", bottom: "4px", width: "24px", height: "18px", borderRadius: "50%", background: "white", opacity: 0.85 }} />
            <span style={{ position: "absolute", right: "26px", bottom: "0px", width: "20px", height: "16px", borderRadius: "50%", background: "white", opacity: 0.8 }} />
          </>
        )}

        {/* NIGHT: stars */}
        {isSpace && (
          <>
            {[
              { left: "8px",  top: "7px",  size: 3 },
              { left: "20px", top: "18px", size: 4 },
              { left: "30px", top: "6px",  size: 3 },
              { left: "40px", top: "22px", size: 3 },
              { left: "14px", top: "26px", size: 2 },
              { left: "48px", top: "10px", size: 2 },
            ].map((s, i) => (
              <span key={i} style={{ position: "absolute", left: s.left, top: s.top, width: s.size, height: s.size, background: "white", borderRadius: "50%", boxShadow: `0 0 ${s.size * 2}px white`, opacity: 0.9 }} />
            ))}
            {/* 4-point sparkles */}
            {[
              { left: "10px", top: "19px" },
              { left: "34px", top: "12px" },
              { left: "24px", top: "28px" },
            ].map((s, i) => (
              <span key={`sp-${i}`} style={{ position: "absolute", left: s.left, top: s.top, width: "7px", height: "7px" }}>
                <span style={{ position: "absolute", left: "3px", top: "0", width: "1.5px", height: "7px", background: "rgba(255,255,255,0.85)", borderRadius: "1px" }} />
                <span style={{ position: "absolute", left: "0", top: "3px", width: "7px", height: "1.5px", background: "rgba(255,255,255,0.85)", borderRadius: "1px" }} />
              </span>
            ))}
          </>
        )}
      </span>

      {/* THUMB — outside overflow:hidden so it never clips */}
      <span
        style={{
          position: "absolute",
          top: "50%",
          left: "4px",
          width: "36px",
          height: "36px",
          marginTop: "-18px",
          borderRadius: "50%",
          transform: `translateX(${isSpace ? "52px" : "0px"})`,
          transition: "transform 0.35s cubic-bezier(0.34, 1.56, 0.64, 1)",
          zIndex: 20,
          background: isSpace
            ? "radial-gradient(circle at 38% 35%, #e8e8e8 0%, #c8c8c8 55%, #aaaaaa 100%)"
            : "radial-gradient(circle at 38% 35%, #ffe566 0%, #f5c800 60%, #e6b800 100%)",
          boxShadow: isSpace
            ? "inset -3px -2px 5px rgba(0,0,0,0.2), inset 2px 2px 4px rgba(255,255,255,0.6), 0 2px 8px rgba(0,0,0,0.5)"
            : "inset -3px -2px 5px rgba(180,100,0,0.25), inset 2px 2px 4px rgba(255,255,255,0.6), 0 2px 8px rgba(0,0,0,0.25)",
        }}
      >
        {/* Moon craters — only visible on moon */}
        {isSpace && (
          <>
            <span style={{ position: "absolute", top: "7px",  left: "7px",  width: "9px",  height: "9px",  borderRadius: "50%", background: "rgba(0,0,0,0.13)", boxShadow: "inset 1px 1px 2px rgba(0,0,0,0.2)" }} />
            <span style={{ position: "absolute", top: "19px", left: "16px", width: "12px", height: "12px", borderRadius: "50%", background: "rgba(0,0,0,0.13)", boxShadow: "inset 1px 1px 2px rgba(0,0,0,0.2)" }} />
            <span style={{ position: "absolute", top: "10px", left: "20px", width: "7px",  height: "7px",  borderRadius: "50%", background: "rgba(0,0,0,0.10)", boxShadow: "inset 1px 1px 2px rgba(0,0,0,0.15)" }} />
          </>
        )}
      </span>
    </button>
  );
}