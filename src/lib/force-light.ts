import { useEffect } from "react";

/** Принудительно включает светлую тему на странице, восстанавливает при размонтировании. */
export function useForceLightTheme() {
  useEffect(() => {
    if (typeof document === "undefined") return;
    const root = document.documentElement;
    const wasDark = root.classList.contains("dark");
    if (wasDark) root.classList.remove("dark");
    return () => {
      if (wasDark) root.classList.add("dark");
    };
  }, []);
}
