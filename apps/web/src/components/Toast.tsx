"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { CheckIcon, InfoIcon, XIcon } from "./dashboard/icons";

/**
 * `info` e o aviso neutro ("o arquivo esta sendo gerado"), em azul da marca.
 * Nao ha variante de "atencao": seria um ambar, cor que a paleta nao tem.
 */
export type ToastVariant = "success" | "error" | "info";

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

/**
 * Teto de toasts empilhados. Uma rajada (varios salvamentos seguidos, varias
 * falhas de rede) virava uma coluna subindo pela tela e cobrindo a tabela; o
 * mais antigo sai para o novo entrar.
 */
const MAXIMO_NA_TELA = 3;

const APARENCIA: Record<ToastVariant, { borda: string; selo: string; Icone: typeof CheckIcon }> = {
  success: { borda: "border-brand-green/40", selo: "bg-brand-green/20 text-brand-green", Icone: CheckIcon },
  error: { borda: "border-red-500/40", selo: "bg-red-500/20 text-red-400", Icone: XIcon },
  info: { borda: "border-brand-blue/60", selo: "bg-brand-blue/25 text-white", Icone: InfoIcon },
};

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

  const show = useCallback((message: string, variant: ToastVariant = "success") => {
    const id = proximoId.current++;
    setToasts((atual) => [...atual, { id, message, variant }].slice(-MAXIMO_NA_TELA));
  }, []);

  return (
    <ToastContext.Provider value={{ show }}>
      {children}

      {/* `left-4` no celular: sem ele o `max-w-sm` (384px) passava da largura
          de uma tela de 360 e o toast saia cortado pela esquerda. */}
      <div
        aria-live="polite"
        className="pointer-events-none fixed bottom-4 left-4 right-4 z-[60] flex flex-col items-end gap-2 sm:left-auto"
      >
        {toasts.map((toast) => (
          <Aviso key={toast.id} toast={toast} aoFechar={remover} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function Aviso({ toast, aoFechar }: { toast: ToastItem; aoFechar: (id: number) => void }) {
  const { borda, selo, Icone } = APARENCIA[toast.variant];
  const [comMouse, setComMouse] = useState(false);
  const [comFoco, setComFoco] = useState(false);

  /**
   * Tempo que falta, e nao um prazo fixo: pausar e retomar tem de continuar de
   * onde parou. Sem isso, quem passava o mouse para ler e tirava ganhava 4 s
   * cheios de novo -- ou, pior, o toast sumia debaixo do cursor.
   */
  const restante = useRef(DURACAO_MS);

  // ERRO NAO SOME SOZINHO. "Nao foi possivel salvar" que desaparece em 4 s
  // enquanto a pessoa olhava a tabela e um erro que ninguem leu; sucesso e
  // informacao podem ir embora, porque a tela ja mostra o resultado.
  const somePorTempo = toast.variant !== "error";
  const pausado = comMouse || comFoco;

  useEffect(() => {
    if (!somePorTempo || pausado) return;

    const inicio = Date.now();
    const espera = setTimeout(() => aoFechar(toast.id), restante.current);

    return () => {
      clearTimeout(espera);
      restante.current -= Date.now() - inicio;
    };
  }, [aoFechar, pausado, somePorTempo, toast.id]);

  return (
    <div
      // `alert` interrompe o leitor de tela na hora; `status` espera a vez.
      // Erro e o unico que justifica interromper.
      role={toast.variant === "error" ? "alert" : "status"}
      onMouseEnter={() => setComMouse(true)}
      onMouseLeave={() => setComMouse(false)}
      onFocus={() => setComFoco(true)}
      onBlur={(evento) => {
        // O foco indo do toast para o proprio botao de fechar nao conta como
        // saida -- so sair do toast inteiro retoma a contagem.
        if (!evento.currentTarget.contains(evento.relatedTarget)) setComFoco(false);
      }}
      className={`pointer-events-auto flex w-full items-start gap-2.5 rounded-lg border bg-brand-surface px-4 py-3 text-sm text-white shadow-lg animate-slide-down sm:w-auto sm:max-w-sm ${borda}`}
    >
      <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${selo}`}>
        <Icone className="h-3 w-3" />
      </span>
      <span className="min-w-0 flex-1">{toast.message}</span>
      <button
        type="button"
        onClick={() => aoFechar(toast.id)}
        aria-label="Fechar aviso"
        // h-8 w-8 e nao so o icone de 14px: WCAG 2.2 (2.5.8) pede alvo de pelo
        // menos 24px -- a mesma regra do "mostrar senha" do `FormField`. As
        // margens negativas devolvem o espaco para o toast nao crescer.
        className="-my-1.5 -mr-2 flex h-8 w-8 shrink-0 items-center justify-center rounded text-brand-muted transition-colors hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-green"
      >
        <XIcon className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast precisa estar dentro de um ToastProvider.");
  }
  return context;
}
