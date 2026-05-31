// src/components/ThemeToggle.tsx
import { useTheme } from "@/contexts/ThemeContext";
import { Sun, Moon } from "lucide-react";

export default function ThemeToggle() {
  const { theme, toggle } = useTheme();

  return (
    <button
      onClick={toggle}
      className="flex items-center justify-center w-9 h-9 rounded-lg border
                 border-slate-200 dark:border-slate-600
                 bg-white dark:bg-slate-800
                 text-slate-500 dark:text-slate-400
                 hover:border-violet-300 dark:hover:border-violet-500
                 hover:text-violet-600 dark:hover:text-violet-400
                 hover:bg-violet-50 dark:hover:bg-violet-900/30
                 transition-all"
      title={theme === "light" ? "Тёмная тема" : "Светлая тема"}
    >
      {theme === "light" ? (
        <Moon className="w-4 h-4" />
      ) : (
        <Sun className="w-4 h-4" />
      )}
    </button>
  );
}