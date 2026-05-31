import { useState, useEffect } from "react";
import { fetchColumnFilterValues } from "@/api/tablesApi";
import { Database, Loader2, AlertCircle, ArrowRight, ArrowLeft, Tag } from "lucide-react";
import type { TrainingConfig } from "@/pages/TrainingPage";

interface Props {
  config: TrainingConfig;
  onChange: (update: Partial<TrainingConfig>) => void;
}

export default function DataSelectionPanel({ config, onChange }: Props) {
  const [fieldNames, setFieldNames] = useState<string[]>([]);
  const [scenariosForField, setScenariosForField] = useState<string[]>([]);
  const [loadingFields, setLoadingFields] = useState(false);
  const [loadingTests, setLoadingTests] = useState(false);

  useEffect(() => {
    setLoadingFields(true);
    fetchColumnFilterValues("meta_field_tests", "field_name", 500)
      .then((res) => setFieldNames(res.values.map(String)))
      .catch(() => setFieldNames([]))
      .finally(() => setLoadingFields(false));
  }, []);

  useEffect(() => {
    if (!config.fieldName) { setScenariosForField([]); return; }
    setLoadingTests(true);
    const load = async () => {
      try {
        const res = await fetch(
          `${import.meta.env.VITE_API_URL ?? "http://localhost:8000"}/api/tables/meta_field_tests?page=1&page_size=500&field_name=${encodeURIComponent(config.fieldName)}`
        );
        const data = await res.json();
        const ids = (data.data || []).map((r: Record<string, unknown>) => String(r.test_id));
        setScenariosForField([...new Set(ids)].sort());
      } catch { setScenariosForField([]); }
      finally { setLoadingTests(false); }
    };
    load();
  }, [config.fieldName]);

  const handleFieldChange = (field: string) => onChange({ fieldName: field, trainTestIds: [], testTestIds: [] });

  const unassigned = scenariosForField.filter((s) => !config.trainTestIds.includes(s) && !config.testTestIds.includes(s));
  const moveToTrain = (id: string) => onChange({ trainTestIds: [...config.trainTestIds, id], testTestIds: config.testTestIds.filter((t) => t !== id) });
  const moveToTest = (id: string) => onChange({ testTestIds: [...config.testTestIds, id], trainTestIds: config.trainTestIds.filter((t) => t !== id) });
  const removeFromTrain = (id: string) => onChange({ trainTestIds: config.trainTestIds.filter((t) => t !== id) });
  const removeFromTest = (id: string) => onChange({ testTestIds: config.testTestIds.filter((t) => t !== id) });
  const allToTrain = () => onChange({ trainTestIds: [...config.trainTestIds, ...unassigned] });
  const allToTest = () => onChange({ testTestIds: [...config.testTestIds, ...unassigned] });

  return (
    <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-5 shadow-sm space-y-5">
      <div className="flex items-center gap-2 text-slate-700 dark:text-slate-300">
        <Database className="w-5 h-5 text-violet-500" />
        <h3 className="text-base font-bold">Выбор данных</h3>
      </div>

      {/* Имя модели */}
      <div className="space-y-1.5">
        <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
          <Tag className="w-3 h-3 inline mr-1" />Имя модели
        </label>
        <input type="text" value={config.modelName} onChange={(e) => onChange({ modelName: e.target.value })}
          placeholder="Например: model_dep1_rf_v1"
          className="w-full px-3 py-2.5 text-sm border border-slate-200 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-violet-400 focus:outline-none bg-slate-50 dark:bg-slate-700 text-slate-700 dark:text-slate-200 placeholder-slate-400 dark:placeholder-slate-500" />
      </div>

      {/* Месторождение */}
      <div className="space-y-1.5">
        <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Месторождение</label>
        {loadingFields ? (
          <div className="flex items-center gap-2 text-slate-400 dark:text-slate-500 text-sm py-2"><Loader2 className="w-4 h-4 animate-spin" />Загрузка...</div>
        ) : (
          <select value={config.fieldName} onChange={(e) => handleFieldChange(e.target.value)}
            className="w-full px-3 py-2.5 text-sm border border-slate-200 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-violet-400 focus:outline-none bg-slate-50 dark:bg-slate-700 text-slate-700 dark:text-slate-200">
            <option value="">— Выберите месторождение —</option>
            {fieldNames.map((name) => <option key={name} value={name}>{name}</option>)}
          </select>
        )}
      </div>

      {/* Распределение сценариев */}
      {config.fieldName && (
        <div className="space-y-3">
          <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Распределение сценариев</label>
          {scenariosForField.length === 0 ? (
            <div className="flex items-center gap-2 text-slate-400 dark:text-slate-500 text-sm py-2">
              {loadingTests ? <Loader2 className="w-4 h-4 animate-spin" /> : <AlertCircle className="w-4 h-4" />}
              {loadingTests ? "Загрузка..." : "Нет сценариев"}
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-3">
              {/* Доступные */}
              <div className="space-y-2">
                <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase">Доступные ({unassigned.length})</span>
                <div className="bg-slate-50 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-600 rounded-lg p-2 min-h-[120px] max-h-[200px] overflow-y-auto space-y-1">
                  {unassigned.length === 0 ? (
                    <p className="text-[10px] text-slate-300 dark:text-slate-600 text-center py-4">Все распределены</p>
                  ) : (
                    <>
                      <div className="flex gap-1 mb-2">
                        <button onClick={allToTrain} className="flex-1 text-[10px] py-1 rounded bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400 hover:bg-green-100 dark:hover:bg-green-900/30 border border-green-200 dark:border-green-800">Все → Train</button>
                        <button onClick={allToTest} className="flex-1 text-[10px] py-1 rounded bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-amber-900/30 border border-amber-200 dark:border-amber-800">Все → Test</button>
                      </div>
                      {unassigned.map((id) => (
                        <div key={id} className="flex items-center justify-between bg-white dark:bg-slate-800 rounded px-2 py-1.5 border border-slate-100 dark:border-slate-600">
                          <span className="text-xs font-mono text-slate-600 dark:text-slate-400 truncate">{id}</span>
                          <div className="flex gap-1 flex-shrink-0">
                            <button onClick={() => moveToTrain(id)} className="p-0.5 rounded hover:bg-green-100 dark:hover:bg-green-900/30 text-green-600 dark:text-green-400" title="В Train"><ArrowRight className="w-3 h-3" /></button>
                            <button onClick={() => moveToTest(id)} className="p-0.5 rounded hover:bg-amber-100 dark:hover:bg-amber-900/30 text-amber-600 dark:text-amber-400" title="В Test"><ArrowRight className="w-3 h-3" /></button>
                          </div>
                        </div>
                      ))}
                    </>
                  )}
                </div>
              </div>

              {/* Train */}
              <div className="space-y-2">
                <span className="text-[10px] font-bold text-green-600 dark:text-green-400 uppercase">🟢 Train ({config.trainTestIds.length})</span>
                <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-2 min-h-[120px] max-h-[200px] overflow-y-auto space-y-1">
                  {config.trainTestIds.length === 0 ? (
                    <p className="text-[10px] text-green-300 dark:text-green-700 text-center py-4">Перетащите сценарии сюда</p>
                  ) : config.trainTestIds.map((id) => (
                    <div key={id} className="flex items-center justify-between bg-white dark:bg-slate-800 rounded px-2 py-1.5 border border-green-100 dark:border-green-800">
                      <span className="text-xs font-mono text-slate-600 dark:text-slate-400 truncate">{id}</span>
                      <button onClick={() => removeFromTrain(id)} className="p-0.5 rounded hover:bg-red-100 dark:hover:bg-red-900/30 text-red-400" title="Убрать"><ArrowLeft className="w-3 h-3" /></button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Test */}
              <div className="space-y-2">
                <span className="text-[10px] font-bold text-amber-600 dark:text-amber-400 uppercase">🟡 Test ({config.testTestIds.length})</span>
                <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-2 min-h-[120px] max-h-[200px] overflow-y-auto space-y-1">
                  {config.testTestIds.length === 0 ? (
                    <p className="text-[10px] text-amber-300 dark:text-amber-700 text-center py-4">Перетащите сценарии сюда</p>
                  ) : config.testTestIds.map((id) => (
                    <div key={id} className="flex items-center justify-between bg-white dark:bg-slate-800 rounded px-2 py-1.5 border border-amber-100 dark:border-amber-800">
                      <span className="text-xs font-mono text-slate-600 dark:text-slate-400 truncate">{id}</span>
                      <button onClick={() => removeFromTest(id)} className="p-0.5 rounded hover:bg-red-100 dark:hover:bg-red-900/30 text-red-400" title="Убрать"><ArrowLeft className="w-3 h-3" /></button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Summary */}
      {config.modelName && config.trainTestIds.length > 0 && config.testTestIds.length > 0 && (
        <div className="bg-violet-50 dark:bg-violet-900/20 border border-violet-200 dark:border-violet-700 rounded-lg p-3 text-xs text-violet-700 dark:text-violet-300 space-y-1">
          <p><span className="font-semibold">Модель:</span> {config.modelName}</p>
          <p><span className="font-semibold">Месторождение:</span> {config.fieldName}</p>
          <p><span className="font-semibold">Train:</span> {config.trainTestIds.map((id) => `${config.fieldName}_${id}`).join(", ")}</p>
          <p><span className="font-semibold">Test:</span> {config.testTestIds.map((id) => `${config.fieldName}_${id}`).join(", ")}</p>
          <p><span className="font-semibold">Таблица:</span> unsumry.connection → cbp</p>
        </div>
      )}

      {(!config.modelName || config.trainTestIds.length === 0 || config.testTestIds.length === 0) && config.fieldName && (
        <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400 text-xs bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 px-3 py-2 rounded-lg">
          <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
          {!config.modelName ? "Введите имя модели" : config.trainTestIds.length === 0 ? "Выберите хотя бы один Train-сценарий" : "Выберите хотя бы один Test-сценарий"}
        </div>
      )}
    </div>
  );
}