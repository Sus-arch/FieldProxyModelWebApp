import { useState, useEffect, useRef } from "react";
import {
  getAvailableModels, startPrediction, createPredictionSSE,
  AvailableModel, PredictionJobState,
} from "@/api/predictionsApi";
import {
  BarChart3, Play, Loader2, CheckCircle2, XCircle,
  Terminal, ChevronDown, ChevronUp, Cpu,
  ArrowRight, ArrowLeft,
} from "lucide-react";

export default function PredictionsPage() {
  const [models, setModels] = useState<AvailableModel[]>([]);
  const [selectedModel, setSelectedModel] = useState<AvailableModel | null>(null);
  const [loadingModels, setLoadingModels] = useState(true);
  const [scenarios, setScenarios] = useState<string[]>([]);
  const [selectedScenarios, setSelectedScenarios] = useState<string[]>([]);
  const [loadingScenarios, setLoadingScenarios] = useState(false);
  const [state, setState] = useState<PredictionJobState | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showLogs, setShowLogs] = useState(true);
  const logsEndRef = useRef<HTMLDivElement>(null);
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => { setLoadingModels(true); getAvailableModels().then((r) => setModels(r.models)).catch(() => setModels([])).finally(() => setLoadingModels(false)); }, []);

  useEffect(() => {
    if (!selectedModel?.field_name) { setScenarios([]); return; }
    setLoadingScenarios(true);
    fetch(`${import.meta.env.VITE_API_URL ?? "http://localhost:8000"}/api/tables/meta_field_tests?page=1&page_size=500&field_name=${encodeURIComponent(selectedModel.field_name)}`)
      .then((r) => r.json()).then((data) => { const ids = (data.data || []).map((r: Record<string, unknown>) => String(r.test_id)); setScenarios([...new Set(ids)].sort()); })
      .catch(() => setScenarios([])).finally(() => setLoadingScenarios(false));
    setSelectedScenarios([]);
  }, [selectedModel?.field_name]);

  useEffect(() => { if (showLogs && logsEndRef.current) logsEndRef.current.scrollIntoView({ behavior: "smooth" }); }, [state?.logs.length, showLogs]);
  useEffect(() => () => { esRef.current?.close(); }, []);

  const handleRun = async () => {
    if (!selectedModel || selectedScenarios.length === 0) return;
    setError(null); setIsRunning(true); setState(null);
    try {
      const res = await startPrediction({ model_name: selectedModel.model_name, model_path: selectedModel.path, field_name: selectedModel.field_name, predict_test_ids: selectedScenarios });
      const es = createPredictionSSE(res.job_id); esRef.current = es;
      es.onmessage = (e) => { try { setState(JSON.parse(e.data)); } catch {} };
      es.addEventListener("done", (e) => { try { setState(JSON.parse((e as MessageEvent).data)); } catch {} es.close(); setIsRunning(false); });
      es.onerror = () => { es.close(); setIsRunning(false); };
    } catch (err) { setError(err instanceof Error ? err.message : "Ошибка"); setIsRunning(false); }
  };

  const unselected = scenarios.filter((s) => !selectedScenarios.includes(s));
  const canRun = selectedModel && selectedScenarios.length > 0 && !isRunning;
  const STAGE_ICONS: Record<string, string> = { queued: "⏳", loading_data: "📊", preparing_features: "🔧", training: "🧠", evaluating: "📈", saving: "💾", completed: "✅", failed: "❌" };

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-6">
      <div className="flex items-center gap-2 text-slate-700 dark:text-slate-300">
        <BarChart3 className="w-6 h-6 text-violet-500" />
        <h2 className="text-xl font-bold">Предсказания</h2>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 max-w-5xl">
        {/* Выбор модели */}
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-5 shadow-sm space-y-4">
          <h3 className="text-sm font-bold text-slate-700 dark:text-slate-300">Выберите модель</h3>
          {loadingModels ? (
            <div className="flex items-center gap-2 text-slate-400 dark:text-slate-500 text-sm py-4"><Loader2 className="w-4 h-4 animate-spin" /> Загрузка...</div>
          ) : models.length === 0 ? (
            <p className="text-slate-400 dark:text-slate-500 text-sm py-4">Нет обученных моделей</p>
          ) : (
            <div className="space-y-2 max-h-[400px] overflow-y-auto">
              {models.map((m) => {
                const sel = selectedModel?.path === m.path;
                return (
                  <button key={m.path} onClick={() => setSelectedModel(m)}
                    className={`w-full text-left p-3 rounded-xl border-2 transition-all ${sel ? "border-violet-500 bg-violet-50 dark:bg-violet-900/20" : "border-slate-200 dark:border-slate-600 hover:border-slate-300 dark:hover:border-slate-500"}`}>
                    <div className="flex items-center justify-between">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <Cpu className="w-3.5 h-3.5 text-violet-500" />
                          <span className="text-sm font-bold text-slate-700 dark:text-slate-200">{m.model_name}</span>
                        </div>
                        <div className="flex gap-2 text-[10px] text-slate-400 dark:text-slate-500"><span>{m.model_type}</span><span>•</span><span>{m.field_name}</span></div>
                      </div>
                      {m.metrics_test && (
                        <div className="text-right">
                          <div className="text-[10px] text-slate-400 dark:text-slate-500">R²</div>
                          <div className={`text-sm font-mono font-bold ${m.metrics_test.r2 > 0.9 ? "text-green-600 dark:text-green-400" : m.metrics_test.r2 > 0.7 ? "text-amber-600 dark:text-amber-400" : "text-red-600 dark:text-red-400"}`}>{m.metrics_test.r2.toFixed(4)}</div>
                        </div>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Выбор сценариев */}
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-5 shadow-sm space-y-4">
          <h3 className="text-sm font-bold text-slate-700 dark:text-slate-300">Сценарии для предсказания</h3>
          {!selectedModel ? (
            <p className="text-slate-400 dark:text-slate-500 text-sm py-4">Сначала выберите модель</p>
          ) : loadingScenarios ? (
            <div className="flex items-center gap-2 text-slate-400 dark:text-slate-500 text-sm py-4"><Loader2 className="w-4 h-4 animate-spin" /> Загрузка...</div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase">Доступные ({unselected.length})</span>
                <div className="bg-slate-50 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-600 rounded-lg p-2 min-h-[120px] max-h-[250px] overflow-y-auto space-y-1">
                  {unselected.length === 0 ? (
                    <p className="text-[10px] text-slate-300 dark:text-slate-600 text-center py-4">Все выбраны</p>
                  ) : (
                    <>
                      <button onClick={() => setSelectedScenarios([...selectedScenarios, ...unselected])}
                        className="w-full text-[10px] py-1 rounded bg-violet-50 dark:bg-violet-900/20 text-violet-600 dark:text-violet-400 hover:bg-violet-100 dark:hover:bg-violet-900/30 border border-violet-200 dark:border-violet-700 mb-1">Выбрать все</button>
                      {unselected.map((id) => (
                        <div key={id} className="flex items-center justify-between bg-white dark:bg-slate-800 rounded px-2 py-1.5 border border-slate-100 dark:border-slate-600">
                          <span className="text-xs font-mono text-slate-600 dark:text-slate-400">{id}</span>
                          <button onClick={() => setSelectedScenarios([...selectedScenarios, id])} className="p-0.5 rounded hover:bg-violet-100 dark:hover:bg-violet-900/30 text-violet-600 dark:text-violet-400"><ArrowRight className="w-3 h-3" /></button>
                        </div>
                      ))}
                    </>
                  )}
                </div>
              </div>
              <div className="space-y-2">
                <span className="text-[10px] font-bold text-violet-600 dark:text-violet-400 uppercase">🔮 Predict ({selectedScenarios.length})</span>
                <div className="bg-violet-50 dark:bg-violet-900/20 border border-violet-200 dark:border-violet-700 rounded-lg p-2 min-h-[120px] max-h-[250px] overflow-y-auto space-y-1">
                  {selectedScenarios.length === 0 ? (
                    <p className="text-[10px] text-violet-300 dark:text-violet-700 text-center py-4">Выберите сценарии</p>
                  ) : selectedScenarios.map((id) => (
                    <div key={id} className="flex items-center justify-between bg-white dark:bg-slate-800 rounded px-2 py-1.5 border border-violet-100 dark:border-violet-800">
                      <span className="text-xs font-mono text-slate-600 dark:text-slate-400">{id}</span>
                      <button onClick={() => setSelectedScenarios(selectedScenarios.filter((s) => s !== id))} className="p-0.5 rounded hover:bg-red-100 dark:hover:bg-red-900/30 text-red-400"><ArrowLeft className="w-3 h-3" /></button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 text-red-700 dark:text-red-400 text-sm bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 px-4 py-3 rounded-xl max-w-3xl"><XCircle className="w-4 h-4" /> {error}</div>
      )}

      <button onClick={handleRun} disabled={!canRun}
        className="flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-bold bg-gradient-to-r from-violet-500 to-indigo-600 text-white hover:opacity-90 disabled:opacity-50 shadow-md transition-all">
        {isRunning ? <Loader2 className="w-5 h-5 animate-spin" /> : <Play className="w-5 h-5" />}
        {isRunning ? "Предсказание..." : "Запустить предсказание"}
      </button>

      {state && (
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-5 shadow-sm space-y-5 max-w-3xl">
          <div>
            <div className="flex items-center justify-between text-sm mb-2">
              <span className="font-medium text-slate-700 dark:text-slate-300">{STAGE_ICONS[state.stage] || "⏳"} {state.stage_label}</span>
              <span className="text-slate-500 dark:text-slate-400 font-mono">{state.progress}%</span>
            </div>
            <div className="w-full h-3 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
              <div className={`h-full rounded-full transition-all duration-500 ${state.stage === "failed" ? "bg-red-500" : state.stage === "completed" ? "bg-green-500" : "bg-gradient-to-r from-violet-500 to-indigo-500"}`} style={{ width: `${Math.max(state.progress, 2)}%` }} />
            </div>
          </div>

          {state.stage === "completed" && state.result && (
            <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-xl p-4 space-y-3">
              <div className="flex items-center gap-2 text-green-700 dark:text-green-400 font-bold text-sm"><CheckCircle2 className="w-5 h-5" /> Предсказание завершено!</div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                {[{ label: "Строк", value: state.result.rows_predicted }, { label: "Время", value: `${state.result.prediction_time_seconds}с` }, { label: "CBP mean", value: state.result.cbp_mean }, { label: "CBP std", value: state.result.cbp_std }].map((item) => (
                  <div key={item.label} className="text-center bg-white dark:bg-slate-800 rounded-lg p-2 border border-green-100 dark:border-green-800">
                    <div className="text-[10px] text-slate-400 dark:text-slate-500 uppercase font-bold">{item.label}</div>
                    <div className="font-mono font-bold text-slate-800 dark:text-slate-100">{String(item.value)}</div>
                  </div>
                ))}
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">Результаты в <code className="bg-slate-100 dark:bg-slate-700 px-1 rounded">predictions.results</code></p>
            </div>
          )}

          {state.stage === "failed" && state.error && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-4">
              <div className="flex items-center gap-2 text-red-700 dark:text-red-400 font-bold text-sm"><XCircle className="w-5 h-5" /> Ошибка</div>
              <p className="text-red-600 dark:text-red-400 text-sm mt-2 font-mono whitespace-pre-wrap">{state.error}</p>
            </div>
          )}

          <div>
            <button onClick={() => setShowLogs((p) => !p)} className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 font-medium">
              <Terminal className="w-3.5 h-3.5" />{showLogs ? "Скрыть логи" : "Показать логи"}
              {showLogs ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              <span className="text-slate-400 dark:text-slate-500">({state.logs.length})</span>
            </button>
            {showLogs && (
              <div className="mt-2 bg-slate-900 text-slate-200 rounded-xl p-4 max-h-80 overflow-y-auto font-mono text-xs space-y-0.5">
                {state.logs.map((log, i) => {
                  const time = log.timestamp.split("T")[1]?.split(".")[0] || "";
                  return (<div key={i} className={`flex gap-2 ${log.level === "error" ? "text-red-400" : log.level === "warning" ? "text-yellow-400" : "text-slate-300"}`}><span className="text-slate-500 flex-shrink-0">{time}</span><span className="text-violet-400 flex-shrink-0">[{log.stage}]</span><span>{log.message}</span></div>);
                })}
                <div ref={logsEndRef} />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}