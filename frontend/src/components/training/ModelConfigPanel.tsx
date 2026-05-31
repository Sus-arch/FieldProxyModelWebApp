import { useState, useEffect } from "react";
import { getModelTypes, ModelTypeInfo } from "@/api/mlApi";
import { Cpu, Loader2, Settings } from "lucide-react";
import type { TrainingConfig } from "@/pages/TrainingPage";

interface Props {
  config: TrainingConfig;
  onChange: (update: Partial<TrainingConfig>) => void;
}

const MODEL_LABELS: Record<string, { name: string; desc: string }> = {
  linear: { name: "Linear Regression", desc: "Быстрая, интерпретируемая" },
  decision_tree: { name: "Decision Tree", desc: "Простая, быстрая" },
  random_forest: { name: "Random Forest", desc: "Устойчивая, хорошо обобщает" },
  gradient_boosting: { name: "Gradient Boosting", desc: "Точная, медленная" },
  xgboost: { name: "XGBoost", desc: "Топ для табличных данных" },
};

export default function ModelConfigPanel({ config, onChange }: Props) {
  const [modelTypes, setModelTypes] = useState<Record<string, ModelTypeInfo>>({});
  const [loading, setLoading] = useState(true);
  const [showAdvanced, setShowAdvanced] = useState(false);

  useEffect(() => {
    getModelTypes()
      .then((data) => {
        setModelTypes(data);
        if (data[config.modelType]) onChange({ hyperparams: { ...data[config.modelType].default_params } });
      })
      .catch(() => setModelTypes({}))
      .finally(() => setLoading(false));
  }, []);

  const handleModelChange = (type: string) => {
    const defaults = modelTypes[type]?.default_params || {};
    onChange({ modelType: type, hyperparams: { ...defaults } });
  };

  const handleParamChange = (key: string, value: string) => {
    const numVal = parseFloat(value);
    onChange({ hyperparams: { ...config.hyperparams, [key]: isNaN(numVal) ? value : numVal } });
  };

  if (loading) {
    return (
      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-5 shadow-sm flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 animate-spin text-violet-400" />
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-5 shadow-sm space-y-5">
      <div className="flex items-center gap-2 text-slate-700 dark:text-slate-300">
        <Cpu className="w-5 h-5 text-violet-500" />
        <h3 className="text-base font-bold">Модель</h3>
      </div>

      <div className="grid grid-cols-1 gap-2">
        {Object.keys(modelTypes).map((type) => {
          const label = MODEL_LABELS[type] || { name: type, desc: "" };
          const selected = config.modelType === type;
          return (
            <button key={type} onClick={() => handleModelChange(type)}
              className={`flex items-start gap-3 px-4 py-3 rounded-xl border-2 text-left transition-all ${
                selected
                  ? "border-violet-500 bg-violet-50 dark:bg-violet-900/20"
                  : "border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700/50 hover:border-slate-300 dark:hover:border-slate-500"
              }`}>
              <div className={`w-4 h-4 rounded-full border-2 mt-0.5 flex-shrink-0 ${
                selected ? "border-violet-500 bg-violet-500" : "border-slate-300 dark:border-slate-500"
              }`}>
                {selected && <div className="w-full h-full rounded-full flex items-center justify-center"><div className="w-1.5 h-1.5 bg-white rounded-full" /></div>}
              </div>
              <div className="min-w-0">
                <p className={`text-sm font-semibold ${selected ? "text-violet-700 dark:text-violet-300" : "text-slate-700 dark:text-slate-300"}`}>{label.name}</p>
                <p className="text-[11px] text-slate-400 dark:text-slate-500">{label.desc}</p>
              </div>
            </button>
          );
        })}
      </div>

      <div>
        <button onClick={() => setShowAdvanced((p) => !p)}
          className="flex items-center gap-2 text-xs text-violet-600 dark:text-violet-400 hover:text-violet-700 dark:hover:text-violet-300 font-medium">
          <Settings className="w-3.5 h-3.5" />
          {showAdvanced ? "Скрыть параметры" : "Настроить гиперпараметры"}
        </button>
        {showAdvanced && Object.keys(config.hyperparams).length > 0 && (
          <div className="mt-3 space-y-3 bg-slate-50 dark:bg-slate-700/50 rounded-lg p-4 border border-slate-100 dark:border-slate-600">
            {Object.entries(config.hyperparams).map(([key, value]) => (
              <div key={key} className="flex items-center gap-3">
                <label className="text-xs text-slate-600 dark:text-slate-400 font-mono w-40 flex-shrink-0">{key}</label>
                <input type="text" value={String(value)} onChange={(e) => handleParamChange(key, e.target.value)}
                  className="flex-1 px-3 py-1.5 text-sm border border-slate-200 dark:border-slate-600 rounded-lg font-mono bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 focus:ring-2 focus:ring-violet-400 focus:outline-none" />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}