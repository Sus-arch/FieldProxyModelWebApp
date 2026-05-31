// src/components/FolderAwareUploadButton.tsx
import { useState, useRef } from "react";
import { Upload, Folder, FileSpreadsheet, X, Loader2, CheckCircle, AlertCircle } from "lucide-react";
import { uploadFolderStructure, UploadProgress } from "@/api/upload";

interface Props {
  onUploadComplete?: (summary: { total: number; success: number; failed: number }) => void;
  onUploadError?: (errors: string[]) => void;
}

export default function FolderAwareUploadButton({
  onUploadComplete,
  onUploadError,
}: Props) {
  const [progress, setProgress] = useState<UploadProgress & { currentFile?: string } | null>(null);
  const [result, setResult] = useState<{ total: number; success: number; failed: number } | null>(null);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 📁 Обработка выбора папки + массовая загрузка
  const handleFolderSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    
    setResult(null);
    setProgress({ status: "uploading", message: "Анализ файлов...", progress: 0 });

    try {
      const summary = await uploadFolderStructure(files, setProgress);
      
      setResult(summary);
      setProgress({ 
        status: summary.failed === 0 ? "done" : "error",
        message: summary.failed === 0 
          ? `✅ Загружено ${summary.success} файлов` 
          : `⚠️ Загружено ${summary.success}, ошибок: ${summary.failed}`,
        progress: 100 
      });
      
      if (summary.failed === 0) {
        onUploadComplete?.(summary);
      } else {
        onUploadError?.(summary.errors);
      }
      
    } catch (error) {
      setProgress({ 
        status: "error", 
        message: error instanceof Error ? error.message : "Неизвестная ошибка",
        progress: 0 
      });
      onUploadError?.([error instanceof Error ? error.message : "Неизвестная ошибка"]);
    } finally {
      // Сброс input после завершения
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  // 🗑️ Сброс состояния
  const handleReset = () => {
    setProgress(null);
    setResult(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  return (
    <div className="relative">
      {/* 📥 Скрытый input с поддержкой выбора папки */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".parquet"
        webkitdirectory=""
        directory=""
        multiple
        className="hidden"
        onChange={handleFolderSelect}
      />

      {/* 🎯 Кнопка загрузки */}
      <button
        onClick={() => fileInputRef.current?.click()}
        disabled={progress?.status === "uploading" || progress?.status === "processing"}
        className="flex items-center gap-2 px-4 py-2 rounded-lg bg-gradient-to-r from-violet-500 to-indigo-600 
                   text-white text-sm font-medium hover:from-violet-600 hover:to-indigo-700 
                   disabled:opacity-50 disabled:cursor-not-allowed shadow-md shadow-indigo-200 
                   transition-all flex-shrink-0"
      >
        {progress?.status === "uploading" || progress?.status === "processing" ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : result ? (
          result.failed === 0 ? (
            <CheckCircle className="w-4 h-4 text-emerald-300" />
          ) : (
            <AlertCircle className="w-4 h-4 text-amber-300" />
          )
        ) : (
          <>
            <Folder className="w-4 h-4" />
            <Upload className="w-4 h-4" />
          </>
        )}
        <span>{result ? "Загружено" : "Загрузить папку"}</span>
      </button>

      {/* 📊 Прогресс / Результат */}
      {(progress || result) && (
        <div className={`absolute top-full right-0 mt-2 px-3 py-2 rounded-lg text-xs shadow-lg z-50 min-w-[280px] ${
          progress?.status === "error" || (result && result.failed > 0)
            ? "bg-red-50 text-red-700 border border-red-200" 
            : progress?.status === "done"
              ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
              : "bg-white text-slate-700 border border-slate-200"
        }`}>
          {/* Заголовок статуса */}
          <div className="flex items-center justify-between mb-2">
            <span className="font-medium capitalize">
              {progress?.status || (result?.failed === 0 ? "готово" : "с ошибками")}
            </span>
            {progress?.progress !== undefined && (
              <span className="text-slate-400">{progress.progress}%</span>
            )}
          </div>

          {/* Сообщение */}
          <p className="text-slate-500 mb-2">{progress?.message}</p>
          
          {/* Текущий файл */}
          {progress?.currentFile && progress.status === "uploading" && (
            <p className="text-xs text-slate-400 mb-2 truncate">
              📄 {progress.currentFile}
            </p>
          )}

          {/* Прогресс-бар */}
          {progress?.progress !== undefined && (
            <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden mb-3">
              <div 
                className={`h-full transition-all duration-300 ${
                  progress.status === "error" ? "bg-red-500" : "bg-gradient-to-r from-violet-500 to-indigo-600"
                }`}
                style={{ width: `${progress.progress}%` }}
              />
            </div>
          )}

          {/* Итоговая статистика */}
          {result && (
            <div className="grid grid-cols-3 gap-2 text-center text-xs mb-3">
              <div className="bg-slate-100 rounded px-2 py-1">
                <div className="font-bold text-slate-700">{result.total}</div>
                <div className="text-slate-400">Всего</div>
              </div>
              <div className="bg-emerald-100 rounded px-2 py-1">
                <div className="font-bold text-emerald-700">{result.success}</div>
                <div className="text-emerald-500">Успешно</div>
              </div>
              <div className={`rounded px-2 py-1 ${result.failed > 0 ? "bg-red-100" : "bg-slate-100"}`}>
                <div className={`font-bold ${result.failed > 0 ? "text-red-700" : "text-slate-700"}`}>
                  {result.failed}
                </div>
                <div className={result.failed > 0 ? "text-red-500" : "text-slate-400"}>Ошибки</div>
              </div>
            </div>
          )}

          {/* Кнопки действий */}
          <div className="flex gap-2">
            <button
              onClick={handleReset}
              className="flex-1 py-1.5 px-2 text-xs bg-slate-100 hover:bg-slate-200 rounded transition-colors"
            >
              Закрыть
            </button>
            {(result?.failed === 0 || !result) && (
              <button
                onClick={() => fileInputRef.current?.click()}
                className="flex-1 py-1.5 px-2 text-xs bg-violet-600 hover:bg-violet-700 text-white rounded transition-colors"
              >
                Ещё
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}