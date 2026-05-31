import { useState } from "react";
import { Trash2, Filter, AlertCircle, Loader2 } from "lucide-react";
import { deleteRowsByFilters, deleteRowsByPKs } from "@/api/deleteApi";
import ConfirmDialog from "@/components/ConfirmDialog";

interface Props { tableKey: string; filters: Record<string, string>; selectedRows: Record<string, unknown>[]; onDeleted: () => void; }

export default function DeletePanel({ tableKey, filters, selectedRows, onDeleted }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmType, setConfirmType] = useState<"rows" | "filtered" | "all" | null>(null);
  const [lastResult, setLastResult] = useState<string | null>(null);
  const hasFilters = Object.values(filters).some((v) => v && v.trim());
  const hasSelected = selectedRows.length > 0;

  const exec = async (fn: () => Promise<{ deleted: number }>, msg: string) => {
    setLoading(true); setError(null);
    try { const res = await fn(); setLastResult(`${msg}: ${res.deleted}`); onDeleted(); }
    catch (e) { setError(e instanceof Error ? e.message : "Ошибка"); }
    finally { setLoading(false); setConfirmType(null); }
  };

  return (
    <>
      <div className="flex items-center gap-2 flex-wrap">
        <button onClick={() => setConfirmType("rows")} disabled={!hasSelected || loading}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800 hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-40 disabled:cursor-not-allowed transition-all">
          <Trash2 className="w-3.5 h-3.5" />Удалить выбранные ({selectedRows.length})
        </button>
        <button onClick={() => setConfirmType("filtered")} disabled={!hasFilters || loading}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-amber-600 dark:text-amber-400 border border-amber-200 dark:border-amber-800 hover:bg-amber-50 dark:hover:bg-amber-900/20 disabled:opacity-40 disabled:cursor-not-allowed transition-all">
          <Filter className="w-3.5 h-3.5" />Удалить по фильтрам
        </button>
        <button onClick={() => setConfirmType("all")} disabled={loading}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-red-700 dark:text-red-400 border border-red-300 dark:border-red-700 hover:bg-red-50 dark:hover:bg-red-900/20 transition-all">
          <Trash2 className="w-3.5 h-3.5" />Очистить таблицу
        </button>
        {loading && <Loader2 className="w-4 h-4 animate-spin text-slate-400" />}
        {error && <span className="flex items-center gap-1 text-xs text-red-600 dark:text-red-400"><AlertCircle className="w-3 h-3" />{error}</span>}
        {lastResult && <span className="text-xs text-green-600 dark:text-green-400 font-medium">{lastResult}</span>}
      </div>
      <ConfirmDialog open={confirmType === "rows"} title="Удалить выбранные строки" message={`Удалить ${selectedRows.length} строк?`} onConfirm={() => exec(() => deleteRowsByPKs(tableKey, selectedRows), "Удалено")} onCancel={() => setConfirmType(null)} />
      <ConfirmDialog open={confirmType === "filtered"} title="Удалить по фильтрам" message={`Удалить строки по фильтрам: ${Object.entries(filters).filter(([_, v]) => v).map(([k, v]) => `${k}=${v}`).join(", ")}`} onConfirm={() => exec(() => deleteRowsByFilters(tableKey, filters), "Удалено по фильтрам")} onCancel={() => setConfirmType(null)} />
      <ConfirmDialog open={confirmType === "all"} title="Очистить таблицу" message="Удалить ВСЕ строки?" confirmText="Очистить" onConfirm={() => exec(() => deleteRowsByFilters(tableKey, {}, true), "Очищено")} onCancel={() => setConfirmType(null)} danger />
    </>
  );
}