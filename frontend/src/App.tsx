// src/App.tsx
import { useEffect, useState, useCallback } from "react";
import {
  fetchTablesMeta,
  fetchTableData,
  TableMeta,
  TableResponse,
  FetchParams,
} from "@/api/tablesApi";
import TableSelector from "@/components/TableSelector";
import DataTable from "@/components/DataTable";
import FilterBar from "@/components/FilterBar";
import DeletePanel from "@/components/DeletePanel";
import FolderAwareUploadButton from "@/components/FolderAwareUploadButton";
import ThemeToggle from "@/components/ThemeToggle";
import TrainingPage from "@/pages/TrainingPage";
import PredictionsPage from "@/pages/PredictionsPage";
import ChartsPage from "@/pages/ChartsPage";
import {
  Database,
  LayoutGrid,
  RefreshCw,
  Table2,
  ChevronDown,
  X,
  Menu,
  Brain,
  BarChart3,
  TrendingUp,
} from "lucide-react";

export type TableKey =
  | "data_group"
  | "data_well"
  | "data_connection"
  | "unsumry_connection"
  | "meta_field_tests"
  | "predictions_results";

type AppPage = "tables" | "training" | "predictions" | "charts";

interface Filters extends Record<string, string> {}

interface SortState {
  by: string;
  dir: "asc" | "desc";
}

export default function App() {
  const [currentPage, setCurrentPage] = useState<AppPage>("tables");
  const [tables, setTables] = useState<TableMeta[]>([]);
  const [metaLoading, setMetaLoading] = useState(true);
  const [metaError, setMetaError] = useState<string | null>(null);
  const [selectedKey, setSelectedKey] = useState<TableKey | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [tableData, setTableData] = useState<TableResponse | null>(null);
  const [dataLoading, setDataLoading] = useState(false);
  const [dataError, setDataError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState<Filters>({});
  const [sort, setSort] = useState<SortState>({ by: "", dir: "asc" });
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [selectedRows, setSelectedRows] = useState<Record<string, unknown>[]>([]);

  useEffect(() => {
    setMetaLoading(true);
    fetchTablesMeta()
      .then(setTables)
      .catch((e) =>
        setMetaError(e instanceof Error ? e.message : "Ошибка загрузки метаданных")
      )
      .finally(() => setMetaLoading(false));
  }, []);

  const loadData = useCallback(
    async (key: string, p: number, f: Filters, s: SortState) => {
      setDataLoading(true);
      setDataError(null);
      try {
        const params: FetchParams = {
          page: p,
          page_size: 50,
          ...(s.by ? { sort_by: s.by, sort_dir: s.dir } : {}),
          ...Object.fromEntries(
            Object.entries(f).filter(([_, v]) => v && v.trim() !== "")
          ),
        };
        const res = await fetchTableData(key, params);
        setTableData(res);
        setLastRefresh(new Date());
      } catch (e: unknown) {
        const err = e as { message?: string };
        setDataError(err?.message ?? "Не удалось загрузить данные");
      } finally {
        setDataLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    if (!selectedKey || currentPage !== "tables") return;
    loadData(selectedKey, page, filters, sort);
  }, [selectedKey, page, filters, sort, loadData, currentPage]);

  const handleSelectTable = (key: TableKey) => {
    setCurrentPage("tables");
    if (key === selectedKey) return;
    setSelectedKey(key);
    setPage(1);
    setFilters({});
    setSort({ by: "", dir: "asc" });
    setTableData(null);
    setSelectedRows([]);
    setMobileSidebarOpen(false);
  };

  const handleApplyFilters = (newFilters: Filters) => { setFilters(newFilters); setPage(1); };
  const handleSortChange = (column: string, dir: "asc" | "desc") => { setSort({ by: column, dir }); setPage(1); };
  const selectedMeta = tables.find((t) => t.key === selectedKey);
  const handleRefresh = () => { if (selectedKey) loadData(selectedKey, page, filters, sort); };

  const handleUploadSuccess = (summary: { total: number; success: number; failed: number }) => {
    console.log(`Загружено: ${summary.success}/${summary.total}`);
    handleRefresh();
  };

  const handleUploadError = (errors: string[]) => {
    console.error("Ошибки:", errors);
    setDataError(`Ошибки: ${errors.slice(0, 3).join("; ")}${errors.length > 3 ? "..." : ""}`);
  };

  const getColumnNames = (meta: TableMeta | undefined): string[] => {
    if (!meta?.columns) return [];
    return meta.columns.map((col) => typeof col === "string" ? col : (col as { name: string }).name);
  };

  const navBtn = (pg: AppPage, label: string, icon: React.ReactNode) => (
    <button
      onClick={() => { setCurrentPage(pg); setMobileSidebarOpen(false); }}
      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
        currentPage === pg
          ? "bg-violet-50 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300 ring-1 ring-violet-200 dark:ring-violet-700"
          : "text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700/50 hover:text-slate-800 dark:hover:text-slate-200"
      }`}
    >
      {icon}
      {label}
    </button>
  );

  const renderSidebarContent = () => (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-100 dark:border-slate-700">
        <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 shadow-md shadow-indigo-200 dark:shadow-indigo-900/50 flex-shrink-0">
          <Database className="w-5 h-5 text-white" />
        </div>
        <div className="min-w-0">
          <h2 className="text-sm font-bold text-slate-800 dark:text-slate-100 truncate">Proxy model</h2>
          <p className="text-xs text-slate-400 dark:text-slate-500">Web app</p>
        </div>
      </div>

      <div className="px-4 pt-4 pb-2">
        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-300 dark:text-slate-600 px-2 mb-2">
          Навигация
        </p>
        <div className="space-y-1">
          {navBtn("tables", "Таблицы", <LayoutGrid className="w-4 h-4 flex-shrink-0" />)}
          {navBtn("training", "Обучение", <Brain className="w-4 h-4 flex-shrink-0" />)}
          {navBtn("predictions", "Предсказания", <BarChart3 className="w-4 h-4 flex-shrink-0" />)}
          {navBtn("charts", "Графики", <TrendingUp className="w-4 h-4 flex-shrink-0" />)}
        </div>
      </div>

      {currentPage === "tables" && (
        <>
          <div className="px-4 pt-3 pb-2">
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-300 dark:text-slate-600 px-2">Таблицы</p>
          </div>
          <div className="flex-1 overflow-y-auto px-4 pb-4">
            {metaLoading ? (
              <div className="space-y-3">
                {[...Array(4)].map((_, i) => (
                  <div key={i} className="h-14 rounded-xl bg-slate-100 dark:bg-slate-700 animate-pulse" />
                ))}
              </div>
            ) : metaError ? (
              <div className="text-sm text-red-500 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-800">
                {metaError}
              </div>
            ) : (
              <TableSelector tables={tables} selectedKey={selectedKey} onSelect={handleSelectTable} />
            )}
          </div>
        </>
      )}

      <div className="px-4 py-3 border-t border-slate-100 dark:border-slate-700 mt-auto">
        <p className="text-xs text-slate-300 dark:text-slate-600 text-center">{tables.length} таблиц доступно</p>
      </div>
    </div>
  );

  const renderBreadcrumb = () => {
    if (currentPage === "tables") {
      return (
        <>
          <LayoutGrid className="w-4 h-4 text-slate-400 dark:text-slate-500 flex-shrink-0" />
          <span className="text-sm text-slate-400 dark:text-slate-500 flex-shrink-0">Таблицы</span>
          {selectedMeta && (
            <>
              <ChevronDown className="w-3.5 h-3.5 text-slate-300 dark:text-slate-600 rotate-[-90deg] flex-shrink-0" />
              <div className="flex items-center gap-2 min-w-0">
                <Table2 className="w-4 h-4 text-violet-500 flex-shrink-0" />
                <span className="text-sm font-semibold text-slate-800 dark:text-slate-100 truncate">{selectedMeta.label}</span>
                <span className="hidden sm:inline text-xs text-slate-400 dark:text-slate-500 bg-slate-100 dark:bg-slate-700 px-2 py-0.5 rounded-md truncate">{selectedMeta.key}</span>
              </div>
            </>
          )}
        </>
      );
    }
    const map: Record<AppPage, { icon: React.ReactNode; label: string }> = {
      tables: { icon: null, label: "" },
      training: { icon: <Brain className="w-4 h-4 text-violet-500 flex-shrink-0" />, label: "Обучение моделей" },
      predictions: { icon: <BarChart3 className="w-4 h-4 text-violet-500 flex-shrink-0" />, label: "Предсказания" },
      charts: { icon: <TrendingUp className="w-4 h-4 text-violet-500 flex-shrink-0" />, label: "Графики" },
    };
    const { icon, label } = map[currentPage];
    return (
      <>
        {icon}
        <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">{label}</span>
      </>
    );
  };

  return (
    <div className="flex h-screen bg-slate-100 dark:bg-slate-900 font-sans overflow-hidden transition-colors duration-200">
      {/* Desktop sidebar */}
      <aside className={`hidden md:flex flex-col transition-all duration-300 ease-in-out ${
        sidebarOpen ? "w-72" : "w-0 overflow-hidden"
      } bg-white dark:bg-slate-800 border-r border-slate-200 dark:border-slate-700 shadow-sm flex-shrink-0`}>
        {renderSidebarContent()}
      </aside>

      {/* Mobile sidebar */}
      {mobileSidebarOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setMobileSidebarOpen(false)} />
          <div className="relative w-72 bg-white dark:bg-slate-800 shadow-2xl flex flex-col h-full">
            <div className="absolute top-3 right-3 z-10">
              <button onClick={() => setMobileSidebarOpen(false)}
                className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-400">
                <X className="w-4 h-4" />
              </button>
            </div>
            {renderSidebarContent()}
          </div>
        </div>
      )}

      {/* Main */}
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        {/* Header */}
        <header className="flex items-center gap-3 px-5 py-3 bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 shadow-sm flex-shrink-0">
          <button onClick={() => { setSidebarOpen((v) => !v); setMobileSidebarOpen((v) => !v); }}
            className="flex items-center justify-center w-9 h-9 rounded-lg border border-slate-200 dark:border-slate-600 hover:border-violet-300 dark:hover:border-violet-500 hover:bg-violet-50 dark:hover:bg-violet-900/30 text-slate-500 dark:text-slate-400 hover:text-violet-600 dark:hover:text-violet-400 transition-all flex-shrink-0">
            <Menu className="w-4 h-4" />
          </button>

          <div className="flex items-center gap-2 min-w-0 flex-1">{renderBreadcrumb()}</div>

          <div className="flex items-center gap-2 flex-shrink-0">
            {currentPage === "tables" && (
              <>
                {lastRefresh && (
                  <span className="hidden lg:block text-xs text-slate-400 dark:text-slate-500">
                    Обновлено {lastRefresh.toLocaleTimeString("ru-RU")}
                  </span>
                )}
                {selectedKey && selectedMeta && (
                  <FolderAwareUploadButton onUploadComplete={handleUploadSuccess} onUploadError={handleUploadError} />
                )}
                {selectedKey && (
                  <button onClick={handleRefresh} disabled={dataLoading}
                    className="flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-600 text-sm text-slate-600 dark:text-slate-400 hover:border-violet-300 dark:hover:border-violet-500 hover:text-violet-600 dark:hover:text-violet-400 hover:bg-violet-50 dark:hover:bg-violet-900/30 transition-all disabled:opacity-50">
                    <RefreshCw className={`w-3.5 h-3.5 ${dataLoading ? "animate-spin" : ""}`} />
                    <span className="hidden sm:inline font-medium">Обновить</span>
                  </button>
                )}
              </>
            )}

          <ThemeToggle />
          
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 flex flex-col min-h-0 overflow-hidden">
          {currentPage === "tables" ? (
            <div className="flex-1 flex flex-col min-h-0 p-5 gap-4 overflow-hidden">
              {!selectedKey ? (
                <div className="flex-1 flex items-center justify-center">
                  <div className="text-center space-y-6 max-w-md">
                    <div className="relative mx-auto w-24 h-24">
                      <div className="absolute inset-0 rounded-3xl bg-gradient-to-br from-violet-500 to-indigo-600 shadow-2xl shadow-indigo-300 dark:shadow-indigo-900 animate-pulse" />
                      <div className="absolute inset-0 flex items-center justify-center">
                        <Database className="w-12 h-12 text-white" />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Выберите таблицу</h1>
                      <p className="text-slate-500 dark:text-slate-400 text-sm leading-relaxed">Выберите таблицу из списка слева.</p>
                    </div>
                    {!metaLoading && tables.length > 0 && (
                      <div className="flex flex-wrap justify-center gap-2">
                        {tables.map((t) => (
                          <button key={t.key} onClick={() => handleSelectTable(t.key as TableKey)}
                            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm font-medium text-slate-700 dark:text-slate-300 hover:border-violet-300 dark:hover:border-violet-500 hover:text-violet-600 dark:hover:text-violet-400 hover:bg-violet-50 dark:hover:bg-violet-900/30 shadow-sm transition-all">
                            <Table2 className="w-3.5 h-3.5" />{t.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <>
                  {selectedMeta && <FilterBar tableKey={selectedMeta.key} columns={getColumnNames(selectedMeta)} filters={filters} onApply={handleApplyFilters} />}
                  {selectedMeta && <DeletePanel tableKey={selectedMeta.key} filters={filters} selectedRows={selectedRows} onDeleted={() => { setSelectedRows([]); handleRefresh(); }} />}
                  <div className="flex-1 min-h-0 flex flex-col">
                    <DataTable data={tableData} loading={dataLoading} error={dataError} page={page} onPageChange={setPage} sortBy={sort.by} sortDir={sort.dir} onSortChange={handleSortChange} onSelectionChange={setSelectedRows} />
                  </div>
                </>
              )}
            </div>
          ) : currentPage === "training" ? (
            <TrainingPage />
          ) : currentPage === "predictions" ? (
            <PredictionsPage />
          ) : (
            <ChartsPage />
          )}
        </main>
      </div>
    </div>
  );
}