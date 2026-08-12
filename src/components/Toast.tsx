"use client";

import { createContext, useCallback, useContext, useRef, useState } from "react";
import { CheckIcon, XIcon } from "./dashboard/icons";

type ToastVariant = "success" | "error";

type ToastItem = {
  id: number;
  message: string;
  variant: ToastVariant;
};

type ToastContextValue = {
  show: (message: string, variant?: ToastVariant) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

const DURACAO_MS = 4000;

/** Nenhuma tela tinha um jeito padrao de dizer "salvou" fora do login e
 * Trocar Senha (que bloqueiam a propria tela pra mostrar a mensagem) --
 * telas que redirecionam pra listagem depois de salvar (ex.: Grupo de
 * Usuarios) nao davam confirmacao nenhuma. `ToastProvider` fica montado uma
 * vez no DashboardChrome; qualquer tela chama `useToast().show(...)`. */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const proximoId = useRef(0);

  const remover = useCallback((id: number) => {
    setToasts((atual) => atual.filter((toast) => toast.id !== id));
  }, []);

  const show = useCallback(
    (message: string, variant: ToastVariant = "success") => {
      const id = proximoId.current++;
      setToasts((atual) => [...atual, { id, message, variant }]);
      setTimeout(() => remover(id), DURACAO_MS);
    },
    [remover],
  );

  return (
    <ToastContext.Provider value={{ show }}>
      {children}

      <div
        aria-live="polite"
        className="pointer-events-none fixed bottom-4 right-4 z-[60] flex flex-col gap-2"
      >
        {toasts.map((toast) => (
          <div
            key={toast.id}
            role="status"
            className={`pointer-events-auto flex max-w-sm items-start gap-2.5 rounded-lg border px-4 py-3 text-sm shadow-lg animate-slide-down ${
              toast.variant === "success"
                ? "border-brand-green/40 bg-brand-surface text-white"
                : "border-red-500/40 bg-brand-surface text-white"
            }`}
          >
            <span
              className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${
                toast.variant === "success" ? "bg-brand-green/20 text-brand-green" : "bg-red-500/20 text-red-400"
              }`}
            >
              {toast.variant === "success" ? <CheckIcon className="h-3 w-3" /> : <XIcon className="h-3 w-3" />}
            </span>
            <span className="min-w-0 flex-1">{toast.message}</span>
            <button
              type="button"
              onClick={() => remover(toast.id)}
              aria-label="Fechar aviso"
              className="shrink-0 text-brand-muted transition-colors hover:text-white"
            >
              <XIcon className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast precisa estar dentro de um ToastProvider.");
  }
  return context;
}
