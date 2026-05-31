import { AlertTriangle, X } from "lucide-react";

interface Props { open: boolean; title: string; message: string; confirmText?: string; cancelText?: string; danger?: boolean; onConfirm: () => void; onCancel: () => void; }

export default function ConfirmDialog({ open, title, message, confirmText = "Удалить", cancelText = "Отмена", danger = true, onConfirm, onCancel }: Props) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" onClick={onCancel} />
      <div className="relative bg-white dark:bg-slate-800 rounded-2xl shadow-2xl max-w-md w-full mx-4 p-6 space-y-4">
        <button onClick={onCancel} className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"><X className="w-4 h-4" /></button>
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${danger ? "bg-red-100 dark:bg-red-900/30" : "bg-amber-100 dark:bg-amber-900/30"}`}>
            <AlertTriangle className={`w-5 h-5 ${danger ? "text-red-600 dark:text-red-400" : "text-amber-600 dark:text-amber-400"}`} />
          </div>
          <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100">{title}</h3>
        </div>
        <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed whitespace-pre-wrap">{message}</p>
        <div className="flex items-center justify-end gap-3 pt-2">
          <button onClick={onCancel} className="px-4 py-2 rounded-lg text-sm font-medium text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-700 transition-all">{cancelText}</button>
          <button onClick={onConfirm} className={`px-4 py-2 rounded-lg text-sm font-bold text-white transition-all ${danger ? "bg-red-600 hover:bg-red-700" : "bg-amber-600 hover:bg-amber-700"}`}>{confirmText}</button>
        </div>
      </div>
    </div>
  );
}