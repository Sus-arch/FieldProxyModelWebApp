import { useState, useEffect, useRef } from "react";
import { Search, X, Filter, ChevronDown, Loader2 } from "lucide-react";
import { fetchColumnFilterValues } from "@/api/tablesApi";

export interface Filters { [key: string]: string; }

interface Props { tableKey: string; columns: string[]; filters: Filters; onApply: (filters: Filters) => void; }

function FilterDropdown({ column, value, onChange, tableKey }: { column: string; value: string; onChange: (val: string) => void; tableKey: string }) {
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<(string | number | boolean)[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState(value || "");
  const [truncated, setTruncated] = useState(false);
  const [totalCount, setTotalCount] = useState(0);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => { if (open) setSearch(value || ""); }, [open, value]);

  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetchColumnFilterValues(tableKey, column, 500, search);
        setValues(res.values); setTruncated(res.truncated); setTotalCount(res.total_count);
      } catch { setValues([]); setTruncated(false); setTotalCount(0); }
      finally { setLoading(false); }
    }, 250);
    return () => window.clearTimeout(timer);
  }, [open, search, tableKey, column]);

  useEffect(() => { if (open && searchRef.current) setTimeout(() => searchRef.current?.focus(), 50); }, [open]);
  useEffect(() => {
    const h = (e: MouseEvent) => { if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", h); return () => document.removeEventListener("mousedown", h);
  }, []);

  const displayValue = value || "Все";
  const typedValue = search.trim();
  const hasExactMatch = values.some((v) => String(v) === typedValue);
  const applyValue = (raw: string) => { onChange(raw.trim()); setOpen(false); };

  return (
    <div className="relative" ref={dropdownRef}>
      <button onClick={() => setOpen((p) => !p)}
        className="flex items-center gap-1.5 pl-3 pr-2 py-1.5 text-sm border border-slate-200 dark:border-slate-600 rounded-lg bg-slate-50 dark:bg-slate-700 hover:bg-slate-100 dark:hover:bg-slate-600 focus:outline-none focus:ring-2 focus:ring-violet-400 transition-all min-w-[160px] justify-between">
        <span className={`truncate ${value ? "text-slate-700 dark:text-slate-200 font-medium" : "text-slate-400 dark:text-slate-500"}`}>{displayValue}</span>
        <ChevronDown className={`w-3.5 h-3.5 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-1 w-72 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg z-50 overflow-hidden">
          <div className="p-2 border-b border-slate-100 dark:border-slate-700">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
              <input ref={searchRef} type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Введите или найдите..."
                className="w-full pl-7 pr-3 py-1.5 text-sm border border-slate-200 dark:border-slate-600 rounded bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-violet-400"
                onClick={(e) => e.stopPropagation()}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); applyValue(search); } if (e.key === "Escape") setOpen(false); }} />
            </div>
            {column === "dt" && <div className="mt-1 text-[11px] text-slate-400 dark:text-slate-500">Можно ввести: <code>2024-01-01</code></div>}
          </div>
          <div className="max-h-72 overflow-y-auto">
            <button onClick={() => applyValue("")} className={`w-full text-left px-3 py-2 text-sm hover:bg-violet-50 dark:hover:bg-violet-900/30 transition-colors ${!value ? "bg-violet-50 dark:bg-violet-900/20 text-violet-700 dark:text-violet-300 font-medium" : "text-slate-700 dark:text-slate-300"}`}>— Все значения —</button>
            {typedValue && !hasExactMatch && (
              <button onClick={() => applyValue(typedValue)} className="w-full text-left px-3 py-2 text-sm text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-900/20 hover:bg-indigo-100 dark:hover:bg-indigo-900/30 transition-colors border-b border-slate-100 dark:border-slate-700">
                Использовать: <span className="font-semibold">{typedValue}</span>
              </button>
            )}
            {loading ? (
              <div className="p-4 text-center text-slate-400 dark:text-slate-500 text-sm"><Loader2 className="w-4 h-4 animate-spin mx-auto mb-2" />Загрузка...</div>
            ) : values.length === 0 ? (
              <div className="p-4 text-center text-slate-400 dark:text-slate-500 text-sm">{typedValue ? "Нажмите Enter" : "Нет данных"}</div>
            ) : (
              values.map((val, i) => {
                const strVal = String(val); const selected = value === strVal;
                return (
                  <button key={`${strVal}-${i}`} onClick={() => applyValue(strVal)} title={strVal}
                    className={`w-full text-left px-3 py-2 text-sm hover:bg-violet-50 dark:hover:bg-violet-900/30 transition-colors truncate ${selected ? "bg-violet-50 dark:bg-violet-900/20 text-violet-700 dark:text-violet-300 font-medium" : "text-slate-700 dark:text-slate-300"}`}>{strVal}</button>
                );
              })
            )}
            {truncated && <div className="px-3 py-2 text-xs text-slate-400 dark:text-slate-500 text-center border-t border-slate-100 dark:border-slate-700">Показаны 500 из {totalCount}</div>}
          </div>
        </div>
      )}
    </div>
  );
}

export default function FilterBar({ tableKey, columns, filters, onApply }: Props) {
  const [local, setLocal] = useState<Filters>(filters);
  const [expanded, setExpanded] = useState(false);
  const safeColumns = Array.isArray(columns) ? columns : [];
  useEffect(() => { setLocal(filters); }, [filters]);
  const hasActiveFilters = Object.values(filters).some((v) => v && v.trim() !== "");
  const handleClear = () => { setLocal({}); onApply({}); };
  const handleApply = () => { onApply(Object.fromEntries(Object.entries(local).filter(([_, v]) => v && v.trim() !== ""))); };
  if (safeColumns.length === 0) return null;

  return (
    <div className={`flex flex-col gap-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-4 shadow-sm transition-all ${expanded ? "ring-2 ring-violet-200 dark:ring-violet-700" : ""}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400">
          <Filter className="w-4 h-4" />
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">Фильтры</span>
        </div>
        <button onClick={() => setExpanded(!expanded)} className="text-xs text-violet-600 dark:text-violet-400 hover:text-violet-700 dark:hover:text-violet-300 font-medium">{expanded ? "Свернуть" : "Развернуть"}</button>
      </div>
      {expanded && (
        <div className="flex flex-wrap items-center gap-3">
          {safeColumns.map((col) => (
            <div key={col} className="flex items-center gap-2">
              <label className="text-xs text-slate-500 dark:text-slate-400 font-medium whitespace-nowrap capitalize">{col.replace(/_/g, " ")}</label>
              <FilterDropdown column={col} value={local[col] || ""} onChange={(val) => setLocal((p) => ({ ...p, [col]: val }))} tableKey={tableKey} />
            </div>
          ))}
          <div className="flex items-center gap-2 ml-auto">
            <button onClick={handleApply} className="px-4 py-1.5 rounded-lg text-sm font-semibold bg-gradient-to-r from-violet-500 to-indigo-600 text-white hover:opacity-90 shadow-sm transition-opacity">Применить</button>
            {hasActiveFilters && (
              <button onClick={handleClear} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-slate-500 dark:text-slate-400 hover:text-red-500 dark:hover:text-red-400 border border-slate-200 dark:border-slate-600 hover:border-red-200 dark:hover:border-red-700 hover:bg-red-50 dark:hover:bg-red-900/20 transition-all">
                <X className="w-3.5 h-3.5" />Сбросить
              </button>
            )}
          </div>
        </div>
      )}
      {!expanded && hasActiveFilters && (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {Object.entries(filters).filter(([_, v]) => v && v.trim() !== "").map(([k, v]) => (
            <span key={k} className="flex items-center gap-1 px-2 py-1 bg-violet-50 dark:bg-violet-900/20 text-violet-700 dark:text-violet-300 rounded">
              <span className="font-medium">{k.replace(/_/g, " ")}:</span> {v}
              <button onClick={() => { const nf = { ...local, [k]: "" }; setLocal(nf); onApply(Object.fromEntries(Object.entries(nf).filter(([_, val]) => val && val.trim() !== ""))); }} className="hover:text-red-500 dark:hover:text-red-400"><X className="w-3 h-3" /></button>
            </span>
          ))}
          <button onClick={handleClear} className="text-slate-400 dark:text-slate-500 hover:text-red-500 dark:hover:text-red-400 ml-1"><X className="w-3.5 h-3.5" /></button>
        </div>
      )}
    </div>
  );
}