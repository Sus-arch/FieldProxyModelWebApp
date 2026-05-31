import { useState, useEffect } from "react";
import { listModels, ModelInfo } from "@/api/mlApi";
import { deleteModelAndPredictions } from "@/api/deleteApi";
import ConfirmDialog from "@/components/ConfirmDialog";
import {
  Loader2, RefreshCw, Trophy, Calendar, Cpu,
  FolderOpen, Clock, Zap, Tag, Trash2,
} from "lucide-react";

export default function ModelsHistory() {
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const loadModels = () => {
    setLoading(true); setError(null);
    listModels().then((res) => setModels(res.models)).catch((e) => setError(e instanceof Error ? e.message : "Ошибка")).finally(() => setLoading(false));
  };

  useEffect(() => { loadModels(); }, []);

  const handleDeleteModel = async (modelName: string) => {
    setDeleting(true);
    try { await deleteModelAndPredictions(modelName); loadModels(); }
    catch (e) { console.error("Ошибка удаления:", e); }
    finally { setDeleting(false); setDeleteTarget(null); }
  };

  if (loading) return <div className="flex items-center justify-center h-64"><Loader2 className="w-6 h-6 animate-spin text-violet-400" /></div>;

  if (error) return (
    <div className="text-center space-y-3 py-12">
      <p className="text-red-500 dark:text-red-400 text-sm">{error}</p>
      <button onClick={loadModels} className="text-sm text-violet-600 dark:text-violet-400 hover:underline">Повторить</button>
    </div>
  );

  return (
    <div className="space-y-4 max-w-4xl">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-bold text-slate-700 dark:text-slate-300">Обученные модели ({models.length})</h3>
        <button onClick={loadModels} className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 hover:text-violet-600 dark:hover:text-violet-400">
          <RefreshCw className="w-3.5 h-3.5" />Обновить
        </button>
      </div>

      {models.length === 0 ? (
        <div className="text-center py-16 space-y-3">
          <FolderOpen className="w-12 h-12 text-slate-300 dark:text-slate-600 mx-auto" />
          <p className="text-slate-500 dark:text-slate-400 text-sm">Нет обученных моделей</p>
        </div>
      ) : (
        <div className="space-y-3">
          {models.map((model, idx) => (
            <div key={model.path} className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-4 shadow-sm hover:shadow-md transition-shadow space-y-3">
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-1.5 flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-bold text-slate-400 dark:text-slate-500">#{models.length - idx}</span>
                    <span className="flex items-center gap-1 text-sm font-bold text-slate-700 dark:text-slate-200">
                      <Tag className="w-3.5 h-3.5 text-violet-500" />{model.model_name || "—"}
                    </span>
                    <span className="flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400">
                      <Cpu className="w-3 h-3" />{model.model_type}
                    </span>
                    {model.field_name && (
                      <span className="text-xs bg-violet-50 dark:bg-violet-900/20 text-violet-700 dark:text-violet-300 px-2 py-0.5 rounded-md font-mono">{model.field_name}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 text-xs text-slate-400 dark:text-slate-500">
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3 h-3" />{model.created_at ? new Date(model.created_at).toLocaleString("ru-RU") : "—"}
                    </span>
                    {model.training_time_seconds != null && (
                      <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{model.training_time_seconds.toFixed(3)}с</span>
                    )}
                    {model.avg_prediction_time_ms != null && (
                      <span className="flex items-center gap-1"><Zap className="w-3 h-3 text-amber-400" />{model.avg_prediction_time_ms.toFixed(4)}мс</span>
                    )}
                  </div>
                </div>

                {model.metrics_test && (
                  <div className="flex items-center gap-4 flex-shrink-0">
                    {Object.entries(model.metrics_test).map(([k, v]) => (
                      <div key={k} className="text-center">
                        <div className="text-[10px] text-slate-400 dark:text-slate-500 uppercase font-bold">{k}</div>
                        <div className={`text-lg font-mono font-bold ${
                          k === "r2" ? (v > 0.9 ? "text-green-600 dark:text-green-400" : v > 0.7 ? "text-amber-600 dark:text-amber-400" : "text-red-600 dark:text-red-400")
                          : "text-slate-700 dark:text-slate-300"
                        }`}>{v.toFixed(4)}</div>
                      </div>
                    ))}
                    {model.metrics_test.r2 > 0.95 && <Trophy className="w-5 h-5 text-amber-400" />}
                  </div>
                )}
              </div>

              {(model.train_scenarios?.length > 0 || model.test_scenarios?.length > 0) && (
                <div className="flex gap-4 text-[11px]">
                  {model.train_scenarios?.length > 0 && (
                    <div><span className="font-semibold text-green-700 dark:text-green-400">Train:</span> <span className="font-mono text-slate-600 dark:text-slate-400">{model.train_scenarios.join(", ")}</span></div>
                  )}
                  {model.test_scenarios?.length > 0 && (
                    <div><span className="font-semibold text-amber-700 dark:text-amber-400">Test:</span> <span className="font-mono text-slate-600 dark:text-slate-400">{model.test_scenarios.join(", ")}</span></div>
                  )}
                </div>
              )}

              <div className="pt-2 border-t border-slate-100 dark:border-slate-700 flex items-center justify-between">
                <div className="flex flex-wrap gap-2">
                  {model.hyperparameters && Object.entries(model.hyperparameters).map(([k, v]) => (
                    <span key={k} className="text-[10px] font-mono bg-slate-50 dark:bg-slate-700 text-slate-500 dark:text-slate-400 px-2 py-0.5 rounded">{k}={String(v)}</span>
                  ))}
                </div>
                <button onClick={() => setDeleteTarget(model.model_name)} disabled={deleting}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-red-500 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 hover:bg-red-50 dark:hover:bg-red-900/20 border border-transparent hover:border-red-200 dark:hover:border-red-800 transition-all disabled:opacity-50 flex-shrink-0">
                  <Trash2 className="w-3.5 h-3.5" />Удалить
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <ConfirmDialog open={deleteTarget !== null} title="Удалить модель"
        message={`Модель "${deleteTarget}" и все связанные предсказания будут удалены. Это необратимо.`}
        confirmText="Удалить модель и предсказания"
        onConfirm={() => deleteTarget && handleDeleteModel(deleteTarget)}
        onCancel={() => setDeleteTarget(null)} danger />
    </div>
  );
}