import { useState, useEffect, createContext, useContext, useCallback } from "react";
import { X, CheckCircle2, AlertTriangle, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import { API_ERROR_EVENT } from "@/api/client";

type ToastType = "success" | "error" | "info";

interface Toast {
  id: string;
  message: string;
  type: ToastType;
}

interface ToastContextValue {
  toast: (message: string, type?: ToastType) => void;
}

const ToastContext = createContext<ToastContextValue>({
  toast: () => {},
});

export function useToast() {
  return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const addToast = useCallback((message: string, type: ToastType = "info") => {
    const id = crypto.randomUUID();
    setToasts((prev) => [...prev, { id, message, type }]);
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  // Listen for API error events from axios interceptor
  useEffect(() => {
    const handler = (e: Event) => {
      const message = (e as CustomEvent<string>).detail;
      addToast(message, "error");
    };
    window.addEventListener(API_ERROR_EVENT, handler);
    return () => window.removeEventListener(API_ERROR_EVENT, handler);
  }, [addToast]);

  return (
    <ToastContext.Provider value={{ toast: addToast }}>
      {children}
      <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2">
        {toasts.map((t) => (
          <ToastItem key={t.id} toast={t} onDismiss={() => removeToast(t.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onDismiss, 5000);
    return () => clearTimeout(timer);
  }, [onDismiss]);

  const icons = {
    success: <CheckCircle2 className="h-4 w-4 text-green-600" />,
    error: <AlertTriangle className="h-4 w-4 text-red-600" />,
    info: <Info className="h-4 w-4 text-blue-600" />,
  };

  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-lg border bg-white px-4 py-3 shadow-lg animate-in slide-in-from-right-full",
        toast.type === "error" && "border-red-200 bg-red-50",
        toast.type === "success" && "border-green-200 bg-green-50",
      )}
    >
      {icons[toast.type]}
      <span className="text-sm">{toast.message}</span>
      <button onClick={onDismiss} className="ml-2 rounded p-0.5 hover:bg-black/10">
        <X className="h-3 w-3" />
      </button>
    </div>
  );
}
