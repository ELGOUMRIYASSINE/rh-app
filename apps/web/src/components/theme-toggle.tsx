"use client";
import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { cn, Tooltip } from "@yghr/ui";

const COOKIE = "yghr-theme";

function systemDark() {
  return typeof matchMedia !== "undefined" && matchMedia("(prefers-color-scheme: dark)").matches;
}

/** Light/dark theme shared by every space (RH, chef, salarié, console, login). Persisted in a cookie read by the root layout. */
export function useTheme() {
  const [dark, setDark] = useState(false);
  useEffect(() => {
    const c = document.documentElement.classList;
    const read = () => setDark(c.contains("dark") || (!c.contains("light") && systemDark()));
    read();
    // Follow the OS while the user has not picked a theme explicitly.
    const mq = matchMedia("(prefers-color-scheme: dark)");
    mq.addEventListener("change", read);
    return () => mq.removeEventListener("change", read);
  }, []);
  const toggle = () => {
    const next = !dark;
    setDark(next);
    const c = document.documentElement.classList;
    c.toggle("dark", next);
    c.toggle("light", !next);
    document.cookie = `${COOKIE}=${next ? "dark" : "light"}; path=/; max-age=31536000; samesite=lax`;
  };
  return { dark, toggle };
}

export function ThemeToggle({ className, theme }: { className?: string; theme?: ReturnType<typeof useTheme> }) {
  const own = useTheme();
  const t = theme ?? own;
  const label = t.dark ? "Mode clair" : "Mode sombre";
  return (
    <Tooltip content={label}>
      <button type="button" onClick={t.toggle} className={cn("grid size-9 cursor-pointer place-items-center rounded-lg text-muted hover:bg-surface-2 hover:text-text", className)} aria-label={label}>
        {t.dark ? <Sun className="size-[18px]" /> : <Moon className="size-[18px]" />}
      </button>
    </Tooltip>
  );
}
