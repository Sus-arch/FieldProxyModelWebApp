import { useState } from "react";
import DataSelectionPanel from "@/components/training/DataSelectionPanel";
import ModelConfigPanel from "@/components/training/ModelConfigPanel";
import TrainingRunner from "@/components/training/TrainingRunner";
import ModelsHistory from "@/components/training/ModelsHistory";
import { Settings2, PlayCircle, History } from "lucide-react";

type Tab = "configure" | "run" | "history";

export interface TrainingConfig {
  modelName: string; fieldName: string; trainTestIds: string[]; testTestIds: string[];
  modelType: string; hyperparams: Record<string, unknown>;
}

const DEFAULT_CONFIG: TrainingConfig = { modelName: "", fieldName: "", trainTestIds: [], testTestIds: [], modelType: "random_forest", hyperparams: {} };

export default function TrainingPage() {
  const [tab, setTab] = useState<Tab>("configure");
  const [config, setConfig] = useState<TrainingConfig>(DEFAULT_CONFIG);
  const canRun = config.modelName.trim() !== "" && config.fieldName.trim() !== "" && config.trainTestIds.length > 0 && config.testTestIds.length > 0 && config.modelType !== "";

  const tabs: { key: Tab; label: string; icon: React.ReactNode }[] = [
    { key: "configure", label: "Настройка", icon: <Settings2 className="w-4 h-4" /> },
    { key: "run", label: "Запуск", icon: <PlayCircle className="w-4 h-4" /> },
    { key: "history", label: "История моделей", icon: <History className="w-4 h-4" /> },
  ];

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
      <div className="flex items-center gap-1 px-5 pt-4 pb-0">
        {tabs.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-t-xl text-sm font-medium transition-all border border-b-0 ${
              tab === t.key
                ? "bg-white dark:bg-slate-800 text-violet-700 dark:text-violet-300 border-slate-200 dark:border-slate-700 shadow-sm"
                : "bg-slate-50 dark:bg-slate-900 text-slate-500 dark:text-slate-400 border-transparent hover:text-slate-700 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
            }`}>{t.icon}{t.label}</button>
        ))}
      </div>
      <div className="flex-1 min-h-0 bg-white dark:bg-slate-800 border-t border-slate-200 dark:border-slate-700 overflow-y-auto">
        <div className="p-6">
          {tab === "configure" && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 max-w-5xl">
              <DataSelectionPanel config={config} onChange={(u) => setConfig((p) => ({ ...p, ...u }))} />
              <ModelConfigPanel config={config} onChange={(u) => setConfig((p) => ({ ...p, ...u }))} />
            </div>
          )}
          {tab === "run" && <TrainingRunner config={config} canRun={canRun} />}
          {tab === "history" && <ModelsHistory />}
        </div>
      </div>
    </div>
  );
}