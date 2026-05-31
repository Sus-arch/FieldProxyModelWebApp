// src/components/UploadButton.tsx
import { useState, useRef } from "react";
import { Upload, CheckCircle2, AlertCircle, Loader2, X } from "lucide-react";
import { uploadParquet, TableKey, UploadProgress } from "@/api/upload";

interface Props {
  tableKey: TableKey;
  tableName: string;
  onUploadSuccess?: (rowsInserted: number) => void;
  onUploadError?: (error: string) => void;
}

export default function UploadButton({
  tableKey,
  tableName,
  onUploadSuccess,
  onUploadError,
}: Props) {
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState<UploadProgress | null>(null);
  const [showToast, setShowToast] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    e.target.value = "";

    setUploading(true);
    setProgress({
      status: "uploading",
      message: "Чтение файла...",
      progress: 10,
    });
    setShowToast(true);

    try {
      const result = await uploadParquet(tableKey, file, setProgress);
      onUploadSuccess?.(result.rows_inserted);

      setTimeout(() => {
        setShowToast(false);
        setProgress(null);
      }, 3000);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Ошибка загрузки";
      setProgress({ status: "error", message, progress: 0 });
      onUploadError?.(message);
    } finally {
      setUploading(false);
    }
  };

  const handleClick = () => {
    if (!uploading) fileInputRef.current?.click();
  };

  const closeToast = () => {
    setShowToast(false);
    setProgress(null);
  };

  const StatusIcon = () => {
    if (!progress) return <Upload className="w-4 h-4" />;
    if (progress.status === "uploading" || progress.status === "processing") {
      return <Loader2 className="w-4 h-4 animate-spin" />;
    }
    if (progress.status === "done") {
      return <CheckCircle2 className="w-4 h-4 text-emerald-500 dark:text-emerald-400" />;
    }
    return <AlertCircle className="w-4 h-4 text-red-500 dark:text-red-400" />;
  };

  return (
    <>
      {/* Кнопка */}
      <button
        onClick={handleClick}
        disabled={uploading}
        title={`Загрузить данные в "${tableName}"`}
        className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
          uploading
            ? "bg-slate-100 dark:bg-slate-700 text-slate-400 dark:text-slate-500 cursor-not-allowed"
            : "border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-400 hover:border-emerald-300 dark:hover:border-emerald-500 hover:text-emerald-600 dark:hover:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-900/20"
        }`}
      >
        <StatusIcon />
        <span className="hidden sm:inline">
          {uploading ? "Загрузка…" : "Добавить"}
        </span>
      </button>

      {/* Скрытый input */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".parquet"
        onChange={handleFileSelect}
        className="hidden"
        disabled={uploading}
      />

      {/* Toast */}
      {showToast && progress && (
        <div className="fixed bottom-4 right-4 z-50 animate-slide-up">
          <div
            className={`flex items-center gap-3 px-4 py-3 rounded-xl shadow-lg border ${
              progress.status === "error"
                ? "bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800 text-red-800 dark:text-red-300"
                : "bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300"
            }`}
          >
            <StatusIcon />

            <div className="flex-1 min-w-[200px]">
              <p className="text-sm font-medium">{progress.message}</p>

              {progress.progress !== undefined && progress.progress < 100 && (
                <div className="mt-1 h-1.5 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${
                      progress.status === "error"
                        ? "bg-red-400 dark:bg-red-500"
                        : "bg-emerald-500 dark:bg-emerald-400"
                    }`}
                    style={{ width: `${progress.progress}%` }}
                  />
                </div>
              )}
            </div>

            <button
              onClick={closeToast}
              className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </>
  );
}