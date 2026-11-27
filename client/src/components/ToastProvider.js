"use client";

import { createContext, useCallback, useContext, useState } from "react";
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from "lucide-react";

const ToastContext = createContext({
  notify: () => {},
  confirm: async () => false,
});

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const [confirmState, setConfirmState] = useState(null);

  const removeToast = useCallback((id) => {
    setToasts((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const notify = useCallback(
    (message, type = "info", durationMs = 4500) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      setToasts((prev) => [...prev.slice(-4), { id, message, type }]);
      if (durationMs > 0) {
        setTimeout(() => removeToast(id), durationMs);
      }
    },
    [removeToast],
  );

  const confirm = useCallback((options) => {
    return new Promise((resolve) => {
      setConfirmState({
        title: options?.title || "Confirm action",
        message: options?.message || "Are you sure you want to continue?",
        confirmLabel: options?.confirmLabel || "Confirm",
        cancelLabel: options?.cancelLabel || "Cancel",
        destructive: Boolean(options?.destructive),
        resolve,
      });
    });
  }, []);

  const handleConfirmResult = (result) => {
    if (confirmState?.resolve) confirmState.resolve(result);
    setConfirmState(null);
  };

  return (
    <ToastContext.Provider value={{ notify, confirm }}>
      {children}

      {/* Toast stack */}
      <div
        aria-live="polite"
        className="pointer-events-none fixed right-4 bottom-4 z-50 flex w-full max-w-sm flex-col gap-2 px-4 sm:px-0"
      >
        {toasts.map((toast) => {
          const styles =
            toast.type === "success"
              ? "border-emerald-200 bg-emerald-50 text-emerald-900"
              : toast.type === "error"
                ? "border-rose-200 bg-rose-50 text-rose-900"
                : "border-zinc-200 bg-white text-zinc-800";
          const Icon =
            toast.type === "success"
              ? CheckCircle2
              : toast.type === "error"
                ? XCircle
                : Info;
          const iconColor =
            toast.type === "success"
              ? "text-emerald-600"
              : toast.type === "error"
                ? "text-rose-600"
                : "text-indigo-600";

          return (
            <div
              key={toast.id}
              className={`pointer-events-auto flex items-start gap-2.5 rounded-xl border px-3.5 py-3 text-sm shadow-lg ${styles}`}
            >
              <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${iconColor}`} />
              <p className="flex-1 text-xs font-medium leading-relaxed">{toast.message}</p>
              <button
                type="button"
                onClick={() => removeToast(toast.id)}
                className="rounded p-0.5 text-zinc-400 hover:text-zinc-700"
                aria-label="Dismiss notification"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          );
        })}
      </div>

      {/* Global confirmation modal */}
      {confirmState ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-zinc-900/50 backdrop-blur-[1px]"
            onClick={() => handleConfirmResult(false)}
            role="presentation"
          />
          <div className="relative z-10 w-full max-w-md rounded-xl border border-zinc-200 bg-white p-6 shadow-xl">
            <div className="flex items-start gap-3">
              <span
                className={`rounded-lg p-2 ${
                  confirmState.destructive
                    ? "bg-rose-50 text-rose-600"
                    : "bg-indigo-50 text-indigo-600"
                }`}
              >
                <AlertTriangle className="h-5 w-5" />
              </span>
              <div className="flex-1">
                <h3 className="text-base font-semibold text-zinc-900">{confirmState.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-zinc-600">
                  {confirmState.message}
                </p>
              </div>
            </div>

            <div className="mt-6 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => handleConfirmResult(false)}
                className="rounded-lg border border-zinc-200 bg-white px-3.5 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
              >
                {confirmState.cancelLabel}
              </button>
              <button
                type="button"
                onClick={() => handleConfirmResult(true)}
                className={`rounded-lg px-4 py-2 text-sm font-medium text-white shadow-sm ${
                  confirmState.destructive
                    ? "bg-rose-600 hover:bg-rose-700"
                    : "bg-indigo-600 hover:bg-indigo-700"
                }`}
              >
                {confirmState.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </ToastContext.Provider>
  );
}

export const useToast = () => {
  const ctx = useContext(ToastContext);
  return {
    success: (msg) => ctx.notify(msg, "success"),
    error: (msg) => ctx.notify(msg, "error"),
    info: (msg) => ctx.notify(msg, "info"),
  };
};

export const useConfirm = () => {
  const ctx = useContext(ToastContext);
  return ctx.confirm;
};
