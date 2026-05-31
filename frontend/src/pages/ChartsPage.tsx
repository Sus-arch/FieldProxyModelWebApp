import { useState, useEffect } from "react";
import axios from "axios";
import { getModelsWithPredictions, getCompareData, ModelWithPredictions, CompareResponse, ChartPoint } from "@/api/chartsApi";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ScatterChart, Scatter, ReferenceLine } from "recharts";
import { BarChart3, Loader2, AlertCircle, Target } from "lucide-react";
import { useTheme } from "@/contexts/ThemeContext";

const BASE_URL = import.meta.env.VITE_API_URL ?? "http://localhost:8000";

interface ScenarioMetric { id: string; model_name: string; train_scenarios: string[]; test_scenario: string; mae: number | null; rmse: number | null; r2: number | null; created_at: string | null; }

const SCENARIO_COLORS = [
  { actual: "#10b981", predicted: "#8b5cf6" }, { actual: "#f59e0b", predicted: "#f97316" },
  { actual: "#3b82f6", predicted: "#6366f1" }, { actual: "#ef4444", predicted: "#ec4899" },
  { actual: "#14b8a6", predicted: "#06b6d4" }, { actual: "#84cc16", predicted: "#a3e635" },
  { actual: "#d946ef", predicted: "#c084fc" }, { actual: "#78716c", predicted: "#a8a29e" },
];

function getColor(idx: number) { return SCENARIO_COLORS[idx % SCENARIO_COLORS.length]; }
function formatDt(dt: string): string { try { return new Date(dt).toLocaleDateString("ru-RU", { year: "2-digit", month: "short" }); } catch { return dt; } }
function fmtMetric(v: number | null | undefined): string { return v === null || v === undefined ? "N/A" : v.toFixed(4); }

function mergeScenarios(scenarios: Record<string, ChartPoint[]>): { merged: Record<string, unknown>[]; keys: string[] } {
  const keys = Object.keys(scenarios).sort();
  const byDt: Record<string, Record<string, unknown>> = {};
  for (const k of keys) for (const pt of scenarios[k]) { if (!byDt[pt.dt]) byDt[pt.dt] = { dt: pt.dt }; byDt[pt.dt][`actual_${k}`] = pt.cbp_actual; byDt[pt.dt][`predicted_${k}`] = pt.cbp_predicted; }
  return { merged: Object.values(byDt).sort((a, b) => String(a.dt).localeCompare(String(b.dt))), keys };
}

export default function ChartsPage() {
  const { theme } = useTheme();
  const gridColor = theme === "dark" ? "#334155" : "#e2e8f0";
  const tickColor = theme === "dark" ? "#64748b" : "#94a3b8";
  const tooltipBg = theme === "dark" ? "#1e293b" : "#ffffff";
  const tooltipBorder = theme === "dark" ? "#334155" : "#e2e8f0";

  const [models, setModels] = useState<ModelWithPredictions[]>([]);
  const [selectedModel, setSelectedModel] = useState<string>("");
  const [compareData, setCompareData] = useState<CompareResponse | null>(null);
  const [metrics, setMetrics] = useState<ScenarioMetric[]>([]);
  const [selectedScenario, setSelectedScenario] = useState<string>("all");
  const [loading, setLoading] = useState(false);
  const [loadingModels, setLoadingModels] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { setLoadingModels(true); getModelsWithPredictions().then((r) => setModels(r.models)).catch(() => setModels([])).finally(() => setLoadingModels(false)); }, []);

  const loadCompare = async (name: string) => {
    setLoading(true); setError(null); setCompareData(null); setMetrics([]); setSelectedScenario("all");
    try {
      const [cd, md] = await Promise.all([getCompareData(name), axios.get<{ metrics: ScenarioMetric[] }>(`${BASE_URL}/api/predictions/metrics/${encodeURIComponent(name)}`).then((r) => r.data.metrics).catch(() => [])]);
      setCompareData(cd); setMetrics(md);
    } catch (e) { setError(e instanceof Error ? e.message : "Ошибка"); } finally { setLoading(false); }
  };

  const handleModelChange = (n: string) => { setSelectedModel(n); if (n) loadCompare(n); };
  const scenarioKeys = compareData ? Object.keys(compareData.scenarios).sort() : [];
  const singleData = selectedScenario !== "all" ? (compareData?.scenarios[selectedScenario] ?? []) : [];
  const { merged: allData, keys: mergedKeys } = compareData ? mergeScenarios(compareData.scenarios) : { merged: [], keys: [] };
  const scatterData = (() => { const pts = selectedScenario === "all" ? scenarioKeys.flatMap((k) => compareData?.scenarios[k] ?? []) : singleData; return pts.filter((p) => p.cbp_predicted != null && p.cbp_actual != null).map((p) => ({ predicted: p.cbp_predicted!, actual: p.cbp_actual! })); })();
  const getMetric = (s: string) => metrics.find((m) => m.test_scenario === s);

  const tooltipStyle = { borderRadius: "12px", border: `1px solid ${tooltipBorder}`, fontSize: "12px", backgroundColor: tooltipBg, color: theme === "dark" ? "#e2e8f0" : "#334155" };

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-6">
      <div className="flex items-center gap-2 text-slate-700 dark:text-slate-300"><BarChart3 className="w-6 h-6 text-violet-500" /><h2 className="text-xl font-bold">Графики</h2></div>

      {/* Модель */}
      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-4 shadow-sm max-w-2xl space-y-3">
        <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Модель</label>
        {loadingModels ? <div className="flex items-center gap-2 text-slate-400 dark:text-slate-500 text-sm"><Loader2 className="w-4 h-4 animate-spin" />Загрузка...</div>
          : models.length === 0 ? <p className="text-slate-400 dark:text-slate-500 text-sm">Нет моделей</p>
          : <select value={selectedModel} onChange={(e) => handleModelChange(e.target.value)} className="w-full px-3 py-2.5 text-sm border border-slate-200 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-violet-400 focus:outline-none bg-slate-50 dark:bg-slate-700 text-slate-700 dark:text-slate-200">
            <option value="">— Выберите —</option>{models.map((m) => <option key={m.model_name} value={m.model_name}>{m.model_name} ({m.predictions_count})</option>)}
          </select>}
      </div>

      {loading && <div className="flex items-center gap-2 text-slate-400 dark:text-slate-500"><Loader2 className="w-5 h-5 animate-spin" />Загрузка...</div>}
      {error && <div className="flex items-center gap-2 text-red-600 dark:text-red-400 text-sm bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 px-4 py-3 rounded-xl max-w-2xl"><AlertCircle className="w-4 h-4" />{error}</div>}

      {compareData && (
        <>
          {/* Метрики таблица */}
          {metrics.length > 0 && (
            <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-5 shadow-sm max-w-5xl">
              <h3 className="text-sm font-bold text-slate-700 dark:text-slate-300 mb-4 flex items-center gap-2"><Target className="w-4 h-4 text-violet-500" />Метрики по сценариям</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm border-collapse">
                  <thead><tr className="bg-slate-50 dark:bg-slate-700/50 border-b border-slate-200 dark:border-slate-600">
                    {["Сценарий", "Train", "MAE", "RMSE", "R²", "ID"].map((h) => <th key={h} className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">{h}</th>)}
                  </tr></thead>
                  <tbody>{metrics.map((m, idx) => {
                    const color = getColor(scenarioKeys.indexOf(m.test_scenario) >= 0 ? scenarioKeys.indexOf(m.test_scenario) : idx);
                    return (
                      <tr key={m.id} className="border-b border-slate-100 dark:border-slate-700 hover:bg-violet-50/30 dark:hover:bg-violet-900/10 transition-colors">
                        <td className="px-4 py-2.5"><div className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: color.actual }} /><span className="font-mono font-medium text-slate-700 dark:text-slate-300">{m.test_scenario}</span></div></td>
                        <td className="px-4 py-2.5 text-xs font-mono text-slate-500 dark:text-slate-400">{m.train_scenarios.join(", ")}</td>
                        <td className="text-center px-4 py-2.5 font-mono text-slate-700 dark:text-slate-300">{fmtMetric(m.mae)}</td>
                        <td className="text-center px-4 py-2.5 font-mono text-slate-700 dark:text-slate-300">{fmtMetric(m.rmse)}</td>
                        <td className="text-center px-4 py-2.5"><span className={`font-mono font-bold ${m.r2 === null ? "text-slate-400" : m.r2 > 0.9 ? "text-green-600 dark:text-green-400" : m.r2 > 0.7 ? "text-amber-600 dark:text-amber-400" : "text-red-600 dark:text-red-400"}`}>{fmtMetric(m.r2)}</span></td>
                        <td className="text-center px-4 py-2.5"><span className="text-[10px] font-mono text-slate-400 dark:text-slate-500 bg-slate-50 dark:bg-slate-700 px-2 py-0.5 rounded">{m.id}</span></td>
                      </tr>);
                  })}</tbody>
                </table>
              </div>
            </div>
          )}

          {/* Фильтр */}
          <div className="flex items-center gap-2 flex-wrap max-w-4xl">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">Сценарий:</span>
            <button onClick={() => setSelectedScenario("all")} className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${selectedScenario === "all" ? "bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300 ring-1 ring-violet-300 dark:ring-violet-600" : "bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-600"}`}>Все ({scenarioKeys.length})</button>
            {scenarioKeys.map((key, idx) => {
              const color = getColor(idx);
              return (<button key={key} onClick={() => setSelectedScenario(key)} className={`px-3 py-1.5 rounded-lg text-xs font-mono font-medium transition-all flex items-center gap-1.5 ${selectedScenario === key ? "bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300 ring-1 ring-violet-300 dark:ring-violet-600" : "bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-600"}`}><span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: color.actual }} />{key}</button>);
            })}
          </div>

          {/* Легенда */}
          {selectedScenario === "all" && scenarioKeys.length > 1 && (
            <div className="flex flex-wrap gap-4 text-xs max-w-4xl">
              {scenarioKeys.map((key, idx) => { const c = getColor(idx); return (
                <div key={key} className="flex items-center gap-2"><span className="font-mono font-medium text-slate-600 dark:text-slate-400">{key}:</span>
                  <span className="flex items-center gap-1"><span className="w-4 h-0.5 rounded" style={{ backgroundColor: c.actual }} /><span className="text-slate-400 dark:text-slate-500">факт</span></span>
                  <span className="flex items-center gap-1"><span className="w-4 h-0.5 rounded border-b-2 border-dashed" style={{ borderColor: c.predicted }} /><span className="text-slate-400 dark:text-slate-500">прогноз</span></span>
                </div>); })}
            </div>
          )}

          {/* Главный график */}
          <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-5 shadow-sm">
            <h3 className="text-sm font-bold text-slate-700 dark:text-slate-300 mb-4">CBP: предсказание vs реальность{selectedScenario !== "all" && <span className="ml-2 font-mono text-violet-600 dark:text-violet-400">({selectedScenario})</span>}</h3>
            {selectedScenario !== "all" && (() => { const m = getMetric(selectedScenario); if (!m) return null; return (
              <div className="flex gap-6 mb-4 text-xs">
                <div className="flex items-center gap-1.5"><span className="text-slate-400 dark:text-slate-500 font-semibold">MAE:</span><span className="font-mono font-bold text-slate-700 dark:text-slate-300">{fmtMetric(m.mae)}</span></div>
                <div className="flex items-center gap-1.5"><span className="text-slate-400 dark:text-slate-500 font-semibold">RMSE:</span><span className="font-mono font-bold text-slate-700 dark:text-slate-300">{fmtMetric(m.rmse)}</span></div>
                <div className="flex items-center gap-1.5"><span className="text-slate-400 dark:text-slate-500 font-semibold">R²:</span><span className={`font-mono font-bold ${m.r2 === null ? "text-slate-400" : m.r2 > 0.9 ? "text-green-600 dark:text-green-400" : m.r2 > 0.7 ? "text-amber-600 dark:text-amber-400" : "text-red-600 dark:text-red-400"}`}>{fmtMetric(m.r2)}</span></div>
              </div>); })()}
            <div className="h-[450px]">
              <ResponsiveContainer width="100%" height="100%">
                {selectedScenario === "all" ? (
                  <LineChart data={allData}>
                    <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
                    <XAxis dataKey="dt" tickFormatter={formatDt} tick={{ fontSize: 11, fill: tickColor }} interval="preserveStartEnd" />
                    <YAxis tick={{ fontSize: 11, fill: tickColor }} />
                    <Tooltip labelFormatter={(l) => `Дата: ${l}`} contentStyle={tooltipStyle} />
                    <Legend wrapperStyle={{ fontSize: "11px" }} />
                    {mergedKeys.map((key, idx) => { const c = getColor(idx); return [
                      <Line key={`a_${key}`} type="monotone" dataKey={`actual_${key}`} name={`${key} факт`} stroke={c.actual} strokeWidth={2} dot={false} connectNulls />,
                      <Line key={`p_${key}`} type="monotone" dataKey={`predicted_${key}`} name={`${key} прогноз`} stroke={c.predicted} strokeWidth={2} strokeDasharray="6 3" dot={false} connectNulls />,
                    ]; }).flat()}
                  </LineChart>
                ) : (
                  <LineChart data={singleData}>
                    <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
                    <XAxis dataKey="dt" tickFormatter={formatDt} tick={{ fontSize: 11, fill: tickColor }} interval="preserveStartEnd" />
                    <YAxis tick={{ fontSize: 11, fill: tickColor }} />
                    <Tooltip labelFormatter={(l) => `Дата: ${l}`} contentStyle={tooltipStyle} />
                    <Legend wrapperStyle={{ fontSize: "12px" }} />
                    <Line type="monotone" dataKey="cbp_actual" name="Реальное" stroke="#10b981" strokeWidth={2} dot={false} connectNulls />
                    <Line type="monotone" dataKey="cbp_predicted" name="Предсказание" stroke="#8b5cf6" strokeWidth={2} dot={false} strokeDasharray="5 5" connectNulls />
                  </LineChart>
                )}
              </ResponsiveContainer>
            </div>
          </div>

          {/* Scatter */}
          {scatterData.length > 0 && (
            <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-5 shadow-sm">
              <h3 className="text-sm font-bold text-slate-700 dark:text-slate-300 mb-4">Корреляция</h3>
              <div className="h-[400px]">
                <ResponsiveContainer width="100%" height="100%">
                  <ScatterChart>
                    <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
                    <XAxis type="number" dataKey="actual" tick={{ fontSize: 11, fill: tickColor }} label={{ value: "Реальное CBP", position: "bottom", style: { fontSize: 12, fill: tickColor } }} />
                    <YAxis type="number" dataKey="predicted" tick={{ fontSize: 11, fill: tickColor }} label={{ value: "Предсказание CBP", angle: -90, position: "insideLeft", style: { fontSize: 12, fill: tickColor } }} />
                    <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => v.toFixed(4)} />
                    <Scatter data={scatterData} fill="#8b5cf6" fillOpacity={0.6} r={3} />
                    {(() => { const vals = [...scatterData.map((d) => d.actual), ...scatterData.map((d) => d.predicted)]; return <ReferenceLine segment={[{ x: Math.min(...vals), y: Math.min(...vals) }, { x: Math.max(...vals), y: Math.max(...vals) }]} stroke="#10b981" strokeDasharray="5 5" strokeWidth={2} />; })()}
                  </ScatterChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* По сценариям */}
          {selectedScenario === "all" && scenarioKeys.length > 1 && (
            <div className="space-y-4">
              <h3 className="text-sm font-bold text-slate-700 dark:text-slate-300">По сценариям</h3>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {scenarioKeys.map((key, idx) => { const sd = compareData.scenarios[key]; const c = getColor(idx); const m = getMetric(key); return (
                  <div key={key} className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-4 shadow-sm">
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="text-xs font-bold text-slate-600 dark:text-slate-400 font-mono flex items-center gap-2"><span className="w-3 h-3 rounded-full" style={{ backgroundColor: c.actual }} />{key}<span className="text-slate-400 dark:text-slate-500 font-normal">({sd.length})</span></h4>
                      {m && <div className="flex gap-3 text-[10px]">
                        <span className="text-slate-400 dark:text-slate-500">MAE: <span className="font-mono font-bold text-slate-600 dark:text-slate-400">{fmtMetric(m.mae)}</span></span>
                        <span className="text-slate-400 dark:text-slate-500">R²: <span className={`font-mono font-bold ${m.r2 === null ? "text-slate-400" : m.r2 > 0.9 ? "text-green-600 dark:text-green-400" : m.r2 > 0.7 ? "text-amber-600 dark:text-amber-400" : "text-red-600 dark:text-red-400"}`}>{fmtMetric(m.r2)}</span></span>
                      </div>}
                    </div>
                    <div className="h-[250px]"><ResponsiveContainer width="100%" height="100%">
                      <LineChart data={sd}>
                        <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
                        <XAxis dataKey="dt" tickFormatter={formatDt} tick={{ fontSize: 10, fill: tickColor }} interval="preserveStartEnd" />
                        <YAxis tick={{ fontSize: 10, fill: tickColor }} />
                        <Tooltip labelFormatter={(l) => `${l}`} contentStyle={tooltipStyle} />
                        <Line type="monotone" dataKey="cbp_actual" name="Факт" stroke={c.actual} strokeWidth={2} dot={false} connectNulls />
                        <Line type="monotone" dataKey="cbp_predicted" name="Прогноз" stroke={c.predicted} strokeWidth={2} dot={false} strokeDasharray="4 4" connectNulls />
                      </LineChart>
                    </ResponsiveContainer></div>
                  </div>); })}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}