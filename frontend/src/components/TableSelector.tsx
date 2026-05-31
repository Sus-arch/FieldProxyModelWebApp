import { TableMeta } from "@/api/tablesApi";
import { Table2 } from "lucide-react";

interface Props { tables: TableMeta[]; selectedKey: string | null; onSelect: (key: string) => void; }

export default function TableSelector({ tables, selectedKey, onSelect }: Props) {
  return (
    <div className="space-y-1.5">
      {tables.map((t) => (
        <button key={t.key} onClick={() => onSelect(t.key)}
          className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl text-left transition-all ${
            selectedKey === t.key
              ? "bg-violet-50 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300 ring-1 ring-violet-200 dark:ring-violet-700 shadow-sm"
              : "text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700/50 hover:text-slate-800 dark:hover:text-slate-200"
          }`}>
          <Table2 className="w-4 h-4 flex-shrink-0" />
          <div className="min-w-0">
            <p className="text-sm font-medium truncate">{t.label}</p>
            <p className="text-[10px] text-slate-400 dark:text-slate-500 truncate">{t.schema}.{t.key}</p>
          </div>
        </button>
      ))}
    </div>
  );
}