import { useState, useEffect } from "react";
import { TableResponse } from "@/api/tablesApi";
import {
  ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight,
  AlertCircle, Loader2, ArrowUp, ArrowDown, ArrowUpDown,
  CheckSquare, Square, MinusSquare,
} from "lucide-react";

interface Props {
  data: TableResponse | null;
  loading: boolean;
  error: string | null;
  page: number;
  onPageChange: (page: number) => void;
  sortBy?: string;
  sortDir?: "asc" | "desc";
  onSortChange?: (column: string, dir: "asc" | "desc") => void;
  onSelectionChange?: (rows: Record<string, unknown>[]) => void;
}

function formatCell(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "number") return Number.isInteger(value) ? String(value) : value.toFixed(4);
  if (typeof value === "string" && value.includes("T")) {
    try {
      const date = new Date(value);
      if (!isNaN(date.getTime())) return date.toLocaleString("ru-RU", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
    } catch {}
  }
  return String(value);
}

function rowKey(row: Record<string, unknown>): string { return JSON.stringify(row); }

export default function DataTable({ data, loading, error, page, onPageChange, sortBy, sortDir, onSortChange, onSelectionChange }: Props) {
  const columns = data?.columns ?? [];
  const rows = data?.data ?? [];
  const total = data?.total ?? 0;
  const pages = data?.pages ?? 1;
  const page_size = data?.page_size ?? 50;
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());

  useEffect(() => { setSelectedKeys(new Set()); onSelectionChange?.([]); }, [data, page]);

  const toggleRow = (row: Record<string, unknown>) => {
    const key = rowKey(row);
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      onSelectionChange?.(rows.filter((r) => next.has(rowKey(r))));
      return next;
    });
  };

  const toggleAll = () => {
    if (selectedKeys.size === rows.length) { setSelectedKeys(new Set()); onSelectionChange?.([]); }
    else { setSelectedKeys(new Set(rows.map(rowKey))); onSelectionChange?.([...rows]); }
  };

  const isSelected = (row: Record<string, unknown>) => selectedKeys.has(rowKey(row));
  const allSelected = rows.length > 0 && selectedKeys.size === rows.length;
  const someSelected = selectedKeys.size > 0 && selectedKeys.size < rows.length;

  const handleSort = (column: string) => {
    if (!onSortChange) return;
    onSortChange(column, sortBy === column && sortDir === "asc" ? "desc" : "asc");
  };

  const getSortIcon = (column: string) => {
    if (sortBy !== column) return <ArrowUpDown className="w-3 h-3 opacity-30 group-hover:opacity-60 transition-opacity" />;
    return sortDir === "asc" ? <ArrowUp className="w-3 h-3 text-violet-400" /> : <ArrowDown className="w-3 h-3 text-violet-400" />;
  };

  if (loading) return (
    <div className="flex-1 flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-indigo-200 dark:shadow-indigo-900/50">
          <Loader2 className="w-8 h-8 text-white animate-spin" />
        </div>
        <p className="text-slate-500 dark:text-slate-400 text-sm font-medium">Загрузка данных…</p>
      </div>
    </div>
  );

  if (error) return (
    <div className="flex-1 flex items-center justify-center">
      <div className="flex flex-col items-center gap-4 max-w-sm text-center">
        <div className="w-16 h-16 rounded-2xl bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-800 flex items-center justify-center">
          <AlertCircle className="w-8 h-8 text-red-500" />
        </div>
        <div>
          <p className="text-slate-800 dark:text-slate-100 font-semibold mb-1">Ошибка загрузки</p>
          <p className="text-slate-500 dark:text-slate-400 text-sm">{error}</p>
        </div>
      </div>
    </div>
  );

  if (!data) return null;

  return (
    <div className="flex flex-col h-full gap-4">
      <div className="flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="text-sm text-slate-500 dark:text-slate-400">Всего строк:</span>
            <span className="text-sm font-bold text-slate-800 dark:text-slate-100 tabular-nums">{total.toLocaleString("ru-RU")}</span>
          </div>
          <div className="w-px h-4 bg-slate-200 dark:bg-slate-700" />
          <div className="flex items-center gap-2">
            <span className="text-sm text-slate-500 dark:text-slate-400">Страница:</span>
            <span className="text-sm font-bold text-slate-800 dark:text-slate-100 tabular-nums">{page} / {pages}</span>
          </div>
          {sortBy && (
            <>
              <div className="w-px h-4 bg-slate-200 dark:bg-slate-700" />
              <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                <span>Сортировка:</span>
                <span className="font-medium text-violet-600 dark:text-violet-400">{sortBy}</span>
                <span>{sortDir === "asc" ? "↑" : "↓"}</span>
              </div>
            </>
          )}
          {selectedKeys.size > 0 && (
            <>
              <div className="w-px h-4 bg-slate-200 dark:bg-slate-700" />
              <div className="flex items-center gap-1.5 text-xs">
                <CheckSquare className="w-3.5 h-3.5 text-violet-500" />
                <span className="font-medium text-violet-600 dark:text-violet-400">Выбрано: {selectedKeys.size}</span>
              </div>
            </>
          )}
        </div>
        <div className="text-xs text-slate-400 dark:text-slate-500">{rows.length} строк на странице</div>
      </div>

      <div className="flex-1 overflow-auto rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm min-h-0">
        <table className="w-full text-sm border-collapse min-w-max">
          <thead className="sticky top-0 z-10">
            <tr className="bg-gradient-to-r from-slate-800 to-slate-700 dark:from-slate-700 dark:to-slate-600">
              <th className="text-center px-2 py-3 w-10 border-r border-slate-600">
                <button onClick={toggleAll} className="flex items-center justify-center mx-auto text-slate-400 hover:text-white transition-colors">
                  {allSelected ? <CheckSquare className="w-4 h-4 text-violet-400" /> : someSelected ? <MinusSquare className="w-4 h-4 text-violet-400" /> : <Square className="w-4 h-4" />}
                </button>
              </th>
              <th className="text-center text-xs font-semibold text-slate-400 px-3 py-3 w-12 border-r border-slate-600">#</th>
              {columns.map((col) => (
                <th key={col} onClick={() => onSortChange && handleSort(col)}
                  className={`text-left text-xs font-semibold text-slate-200 px-4 py-3 whitespace-nowrap border-r border-slate-600 last:border-r-0 tracking-wide uppercase ${onSortChange ? "cursor-pointer hover:bg-slate-600 transition-colors group" : ""}`}>
                  <div className="flex items-center gap-1.5"><span>{col}</span>{onSortChange && <span className="flex-shrink-0">{getSortIcon(col)}</span>}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={columns.length + 2} className="text-center text-slate-400 dark:text-slate-500 py-16 text-sm">Данные отсутствуют</td></tr>
            ) : rows.map((row, i) => {
              const rowNum = (page - 1) * page_size + i + 1;
              const selected = isSelected(row);
              return (
                <tr key={i} className={`group border-b border-slate-100 dark:border-slate-700 transition-colors duration-100 ${
                  selected ? "bg-violet-50 dark:bg-violet-900/20 hover:bg-violet-100/60 dark:hover:bg-violet-900/30"
                  : i % 2 === 0 ? "bg-white dark:bg-slate-800 hover:bg-violet-50/40 dark:hover:bg-slate-700/50"
                  : "bg-slate-50/50 dark:bg-slate-800/50 hover:bg-violet-50/40 dark:hover:bg-slate-700/50"
                }`}>
                  <td className="text-center px-2 py-2.5 border-r border-slate-100 dark:border-slate-700">
                    <button onClick={() => toggleRow(row)} className="flex items-center justify-center mx-auto text-slate-400 hover:text-violet-600 dark:hover:text-violet-400 transition-colors">
                      {selected ? <CheckSquare className="w-4 h-4 text-violet-500" /> : <Square className="w-4 h-4" />}
                    </button>
                  </td>
                  <td className="text-center text-xs text-slate-300 dark:text-slate-600 px-3 py-2.5 border-r border-slate-100 dark:border-slate-700 tabular-nums font-medium">{rowNum}</td>
                  {columns.map((col) => {
                    const val = row[col];
                    return (
                      <td key={col} className={`px-4 py-2.5 whitespace-nowrap border-r border-slate-100 dark:border-slate-700 last:border-r-0 tabular-nums ${
                        val === null || val === undefined ? "text-slate-300 dark:text-slate-600 italic" : "text-slate-700 dark:text-slate-300"
                      }`}>{formatCell(val)}</td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {pages > 1 && (
        <div className="flex items-center justify-center gap-2 flex-shrink-0">
          {[
            { onClick: () => onPageChange(1), disabled: page === 1, icon: <ChevronsLeft className="w-4 h-4" /> },
            { onClick: () => onPageChange(page - 1), disabled: page === 1, icon: <ChevronLeft className="w-4 h-4" /> },
          ].map((btn, i) => (
            <button key={i} onClick={btn.onClick} disabled={btn.disabled}
              className="flex items-center justify-center w-8 h-8 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:border-violet-300 dark:hover:border-violet-500 hover:text-violet-600 dark:hover:text-violet-400 disabled:opacity-40 disabled:cursor-not-allowed transition-all">
              {btn.icon}
            </button>
          ))}
          {Array.from({ length: Math.min(7, pages) }, (_, i) => {
            let p: number;
            if (pages <= 7) p = i + 1;
            else if (page <= 4) { p = i + 1; if (i === 6) p = pages; if (i === 5) p = -1; }
            else if (page >= pages - 3) { p = pages - 6 + i; if (i === 0) p = 1; if (i === 1) p = -1; }
            else p = [1, -1, page - 1, page, page + 1, -2, pages][i];
            if (p === -1 || p === -2) return <span key={`e-${i}`} className="text-slate-400 dark:text-slate-600 text-sm px-1">…</span>;
            return (
              <button key={p} onClick={() => onPageChange(p)}
                className={`flex items-center justify-center w-8 h-8 rounded-lg text-sm font-medium transition-all ${
                  p === page ? "bg-gradient-to-br from-violet-500 to-indigo-600 text-white shadow-sm border border-transparent"
                  : "border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:border-violet-300 dark:hover:border-violet-500 hover:text-violet-600 dark:hover:text-violet-400"
                }`}>{p}</button>
            );
          })}
          {[
            { onClick: () => onPageChange(page + 1), disabled: page === pages, icon: <ChevronRight className="w-4 h-4" /> },
            { onClick: () => onPageChange(pages), disabled: page === pages, icon: <ChevronsRight className="w-4 h-4" /> },
          ].map((btn, i) => (
            <button key={i} onClick={btn.onClick} disabled={btn.disabled}
              className="flex items-center justify-center w-8 h-8 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:border-violet-300 dark:hover:border-violet-500 hover:text-violet-600 dark:hover:text-violet-400 disabled:opacity-40 disabled:cursor-not-allowed transition-all">
              {btn.icon}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}