import React from 'react';
import { CheckCircle2, AlertTriangle, AlertCircle, Info, X } from 'lucide-react';
import { ToastMessage } from '../types';

interface ToastContainerProps {
  toasts: ToastMessage[];
  onDismiss: (id: string) => void;
}

export const ToastContainer: React.FC<ToastContainerProps> = ({ toasts, onDismiss }) => {
  if (toasts.length === 0) return null;

  return (
    <div className="fixed top-4 right-4 z-50 flex flex-col space-y-2.5 max-w-sm w-full pointer-events-none px-3 sm:px-0">
      {toasts.map((toast) => {
        const isSuccess = toast.type === 'success';
        const isWarning = toast.type === 'warning';
        const isError = toast.type === 'error';

        const borderClass = isError
          ? 'border-red-500/50 bg-red-950/90 shadow-red-950/50 text-red-200'
          : isWarning
          ? 'border-amber-500/50 bg-amber-950/90 shadow-amber-950/50 text-amber-200'
          : isSuccess
          ? 'border-emerald-500/50 bg-emerald-950/90 shadow-emerald-950/50 text-emerald-200'
          : 'border-indigo-500/50 bg-indigo-950/90 shadow-indigo-950/50 text-indigo-200';

        const Icon = isError
          ? AlertCircle
          : isWarning
          ? AlertTriangle
          : isSuccess
          ? CheckCircle2
          : Info;

        const iconColor = isError
          ? 'text-red-400'
          : isWarning
          ? 'text-amber-400'
          : isSuccess
          ? 'text-emerald-400'
          : 'text-indigo-400';

        return (
          <div
            key={toast.id}
            className={`pointer-events-auto flex items-start space-x-3 p-3.5 rounded-2xl border backdrop-blur-xl shadow-2xl transition-all duration-300 transform translate-y-0 animate-in fade-in slide-in-from-top-3 ${borderClass}`}
          >
            <Icon className={`w-5 h-5 shrink-0 mt-0.5 ${iconColor}`} />
            <div className="flex-1 min-w-0 pr-1">
              {toast.title && (
                <h4 className="text-xs font-bold text-white leading-tight mb-0.5">{toast.title}</h4>
              )}
              <p className="text-xs opacity-90 leading-relaxed break-words">{toast.message}</p>
            </div>
            <button
              onClick={() => onDismiss(toast.id)}
              className="p-1 rounded-lg hover:bg-white/10 text-white/60 hover:text-white transition-colors shrink-0"
              title="Đóng thông báo"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
};
