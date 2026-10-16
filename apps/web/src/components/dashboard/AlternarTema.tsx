"use client";

import { useSyncExternalStore } from "react";
import { CHAVE_DO_TEMA, temaValido, type Tema } from "@/lib/tema";
import { MoonIcon, SunIcon } from "./icons";

/**
 * O sol/lua do topo, como no sistema de referencia: troca o `data-tema` do
 * <html> e guarda a escolha no navegador. O tema em vigor e lido do proprio
 * <html> (o script do <head> ja o aplicou), e nao de estado do React: assim o
 * botao nunca discorda da tela.
 */
function lerTema(): Tema {
  return temaValido(document.documentElement.getAttribute("data-tema"));
}

const ouvintes = new Set<() => void>();

function assinar(ouvinte: () => void) {
  ouvintes.add(ouvinte);
  return () => ouvintes.delete(ouvinte);
}

export function AlternarTema() {
  // No servidor nao ha <html> para ler: renderiza o padrao, e o navegador
  // corrige na hidratacao se a pessoa escolheu o outro.
  const tema = useSyncExternalStore(assinar, lerTema, () => temaValido(null));
  const proximo: Tema = tema === "claro" ? "escuro" : "claro";

  function alternar() {
    document.documentElement.setAttribute("data-tema", proximo);
    try {
      localStorage.setItem(CHAVE_DO_TEMA, proximo);
    } catch {
      // Armazenamento bloqueado: o tema vale ate recarregar a pagina.
    }
    for (const ouvinte of ouvintes) ouvinte();
  }

  const titulo = proximo === "escuro" ? "Usar o tema escuro" : "Usar o tema claro";

  return (
    <button
      type="button"
      onClick={alternar}
      title={titulo}
      aria-label={titulo}
      className="flex h-9 items-center gap-1 rounded-full border border-slate-700 bg-white/5 p-1 text-slate-300 transition-colors hover:bg-white/10 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-green"
    >
      <span className={`flex h-7 w-7 items-center justify-center rounded-full ${tema === "claro" ? "bg-branco text-tinta" : ""}`}>
        <SunIcon className="h-4 w-4" />
      </span>
      <span className={`flex h-7 w-7 items-center justify-center rounded-full ${tema === "escuro" ? "bg-branco text-tinta" : ""}`}>
        <MoonIcon className="h-4 w-4" />
      </span>
    </button>
  );
}
