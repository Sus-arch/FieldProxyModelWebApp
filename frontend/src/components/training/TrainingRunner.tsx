// src/components/training/TrainingRunner.tsx
import { useState, useEffect, useRef } from "react";
import { startTraining, createSSEConnection, TrainingJobState, checkModelExists } from "@/api/mlApi";
import type { TrainingConfig } from "@/pages/TrainingPage";
import ConfirmDialog from "@/components/ConfirmDialog";
import { Play, Loader2, CheckCircle2, XCircle, Terminal, ChevronDown, ChevronUp, AlertCircle, Clock, Zap } from "lucide-react";

interface Props { config: TrainingConfig; canRun: boolean; }

const STAGE_ICONS: Record<string, string> = { queued: "⏳", loading_data: "📊", preparing_features: "🔧", training: "🧠", evaluating: "📈", saving: "💾", completed: "✅", failed: "❌" };
const STAGES_ORDER = ["loading_data", "preparing_features", "training", "evaluating", "saving"];

export default function TrainingRunner({ config, canRun }: Props) {
  const [state, setState] = useState<TrainingJobState | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showLogs, setShowLogs] = useState(true);
  const [showOverwriteDialog, setShowOverwriteDialog] = useState(false);
  const [existsInfo, setExistsInfo] = useState<{ predictions: number; metrics: number } | null>(null);
  const [checking, setChecking] = useState(false);
  const logsEndRef = useRef<HTMLDivElement>(null);
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => { if (showLogs && logsEndRef.current) logsEndRef.current.scrollIntoView({ behavior: "smooth" }); }, [state?.logs.length, showLogs]);
  useEffect(() => () => { esRef.current?.close(); }, []);

  const launchTraining = async (overwrite: boolean) => {
    setError(null); setIsRunning(true); setState(null); setShowOverwriteDialog(false);
    try {
      const res = await startTraining({
        model_name: config.modelName,
        field_name: config.fieldName,
        train_test_ids: config.trainTestIds,
        test_test_ids: config.testTestIds,
        model_type: config.modelType,
        hyperparams: Object.keys(config.hyperparams).length > 0 ? config.hyperparams : undefined,
        overwrite,
      });
      const es = createSSEConnection(res.job_id); esRef.current = es;
      es.onmessage = (e) => { try { setState(JSON.parse(e.data)); } catch {} };
      es.addEventListener("done", (e) => { try { setState(JSON.parse((e as MessageEvent).data)); } catch {} es.close(); setIsRunning(false); });
      es.onerror = () => { es.close(); setIsRunning(false); };
    } catch (err) { setError(err instanceof Error ? err.message : "Ошибка"); setIsRunning(false); }
  };

  const handleStart = async () => {
    if (!canRun) return;
    setChecking(true);
    try {
      const result = await checkModelExists(config.modelName);
      if (result.exists) {
        setExistsInfo({ predictions: result.predictions_count, metrics: result.metrics_count });
        setShowOverwriteDialog(true);
      } else {
        await launchTraining(false);
      }
    } catch {
      await launchTraining(false);
    } finally {
      setChecking(false);
    }
  };

  const currentStageIdx = state ? STAGES_ORDER.indexOf(state.stage) : -1;
  const metrics = state?.result?.metrics as Record<string, unknown> | undefined;
  const testMetrics = metrics?.test as Record<string, number> | undefined;
  const trainMetrics = metrics?.train as Record<string, number> | undefined;

  return (
    <div className="max-w-3xl space-y-6">
      {/* Config summary */}
      <div className="bg-slate-50 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-600 rounded-xl p-4 space-y-2">
        <h3 className="text-sm font-bold text-slate-700 dark:text-slate-300">Конфигурация</h3>
        <div className="grid grid-cols-2 gap-3 text-xs">
          <div><span className="text-slate-400 dark:text-slate-500">Модель</span><p className="font-mono font-semibold text-slate-700 dark:text-slate-200">{config.modelName || "—"}</p></div>
          <div><span className="text-slate-400 dark:text-slate-500">Алгоритм</span><p className="font-mono font-semibold text-slate-700 dark:text-slate-200">{config.modelType}</p></div>
          <div><span className="text-slate-400 dark:text-slate-500">Train</span><p className="font-mono text-green-700 dark:text-green-400 text-[11px]">{config.trainTestIds.map((id) => `${config.fieldName}_${id}`).join(", ") || "—"}</p></div>
          <div><span className="text-slate-400 dark:text-slate-500">Test</span><p className="font-mono text-amber-700 dark:text-amber-400 text-[11px]">{config.testTestIds.map((id) => `${config.fieldName}_${id}`).join(", ") || "—"}</p></div>
        </div>
      </div>

      {!canRun && (
        <div className="flex items-center gap-2 text-amber-700 dark:text-amber-400 text-sm bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 px-4 py-3 rounded-xl">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />Заполните все поля на вкладке «Настройка»
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 text-red-700 dark:text-red-400 text-sm bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 px-4 py-3 rounded-xl">
          <XCircle className="w-4 h-4 flex-shrink-0" />{error}
        </div>
      )}

      <button onClick={handleStart} disabled={isRunning || !canRun || checking}
        className="flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-bold bg-gradient-to-r from-violet-500 to-indigo-600 text-white hover:opacity-90 disabled:opacity-50 shadow-md transition-all">
        {isRunning || checking ? <Loader2 className="w-5 h-5 animate-spin" /> : <Play className="w-5 h-5" />}
        {checking ? "Проверка..." : isRunning ? "Обучение..." : "Запустить обучение"}
      </button>

      {/* Диалог перезаписи */}
      <ConfirmDialog
        open={showOverwriteDialog}
        title="Модель уже существует"
        message={`Модель "${config.modelName}" уже существует.\n\n${
          existsInfo
            ? `Связанных предсказаний: ${existsInfo.predictions}\nМетрик: ${existsInfo.metrics}\n\n`
            : ""
        }При перезаписи старая модель, все предсказания и метрики будут удалены.\n\nПродолжить?`}
        confirmText="Перезаписать"
        cancelText="Отмена"
        danger
        onConfirm={() => launchTraining(true)}
        onCancel={() => setShowOverwriteDialog(false)}
      />

      {state && (
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-5 shadow-sm space-y-5">
          <div>
            <div className="flex items-center justify-between text-sm mb-2">
              <span className="font-medium text-slate-700 dark:text-slate-300">{STAGE_ICONS[state.stage] || "⏳"} {state.stage_label}</span>
              <span className="text-slate-500 dark:text-slate-400 font-mono">{state.progress}%</span>
            </div>
            <div className="w-full h-3 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
              <div className={`h-full rounded-full transition-all duration-500 ease-out ${state.stage === "failed" ? "bg-red-500" : state.stage === "completed" ? "bg-green-500" : "bg-gradient-to-r from-violet-500 to-indigo-500"}`} style={{ width: `${Math.max(state.progress, 2)}%` }} />
            </div>
          </div>

          <div className="flex items-center gap-1 flex-wrap">
            {STAGES_ORDER.map((stage, idx) => {
              const isActive = stage === state.stage; const isDone = currentStageIdx > idx; const isFailed = state.stage === "failed" && isActive;
              return (
                <div key={stage} className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  isFailed ? "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400"
                  : isDone ? "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400"
                  : isActive ? "bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300 ring-1 ring-violet-300 dark:ring-violet-600"
                  : "bg-slate-50 dark:bg-slate-700 text-slate-400 dark:text-slate-500"
                }`}>
                  {isDone ? <CheckCircle2 className="w-3 h-3" /> : isActive && !isFailed ? <Loader2 className="w-3 h-3 animate-spin" /> : isFailed ? <XCircle className="w-3 h-3" /> : null}
                  <span>{STAGE_ICONS[stage]}</span>
                </div>
              );
            })}
          </div>

          {state.stage === "completed" && state.result && (
            <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-xl p-4 space-y-4">
              <div className="flex items-center gap-2 text-green-700 dark:text-green-400 font-bold text-sm"><CheckCircle2 className="w-5 h-5" />Обучение завершено!</div>
              <div className="flex gap-4">
                {metrics?.training_time_seconds != null && <div className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-400"><Clock className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500" /><span className="font-semibold">Время:</span><span className="font-mono">{Number(metrics.training_time_seconds).toFixed(3)}с</span></div>}
                {metrics?.avg_prediction_time_ms != null && <div className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-400"><Zap className="w-3.5 h-3.5 text-amber-400" /><span className="font-semibold">Предсказание:</span><span className="font-mono">{Number(metrics.avg_prediction_time_ms).toFixed(4)}мс</span></div>}
              </div>
              {state.result.train_scenarios && (
                <div className="text-xs space-y-1">
                  <p><span className="font-semibold text-green-700 dark:text-green-400">Train:</span> <span className="font-mono text-slate-600 dark:text-slate-400">{(state.result.train_scenarios as string[]).join(", ")}</span></p>
                  <p><span className="font-semibold text-amber-700 dark:text-amber-400">Test:</span> <span className="font-mono text-slate-600 dark:text-slate-400">{(state.result.test_scenarios as string[]).join(", ")}</span></p>
                </div>
              )}
              {testMetrics && (
                <div>
                  <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase mb-2">Test</p>
                  <div className="grid grid-cols-3 gap-4">{Object.entries(testMetrics).map(([k, v]) => (
                    <div key={k} className="text-center bg-white dark:bg-slate-800 rounded-lg p-3 border border-green-100 dark:border-green-800">
                      <div className="text-[10px] text-slate-400 dark:text-slate-500 uppercase font-bold">{k}</div>
                      <div className="text-lg font-mono font-bold text-slate-800 dark:text-slate-100">{typeof v === "number" ? v.toFixed(4) : String(v)}</div>
                    </div>
                  ))}</div>
                </div>
              )}
              {trainMetrics && (
                <div>
                  <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase mb-2">Train</p>
                  <div className="grid grid-cols-3 gap-4">{Object.entries(trainMetrics).map(([k, v]) => (
                    <div key={k} className="text-center bg-white dark:bg-slate-800 rounded-lg p-3 border border-slate-100 dark:border-slate-700">
                      <div className="text-[10px] text-slate-400 dark:text-slate-500 uppercase font-bold">{k}</div>
                      <div className="text-lg font-mono font-bold text-slate-800 dark:text-slate-100">{typeof v === "number" ? v.toFixed(4) : String(v)}</div>
                    </div>
                  ))}</div>
                </div>
              )}
            </div>
          )}

          {state.stage === "failed" && state.error && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-4">
              <div className="flex items-center gap-2 text-red-700 dark:text-red-400 font-bold text-sm"><XCircle className="w-5 h-5" />Ошибка</div>
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