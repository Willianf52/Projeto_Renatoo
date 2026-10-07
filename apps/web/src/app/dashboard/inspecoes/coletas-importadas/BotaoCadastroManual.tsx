"use client";

import { useState } from "react";
import { PlusIcon } from "@/components/dashboard/icons";
import { EVENTO_ALTERNAR_CADASTRO, ID_DO_CADASTRO_MANUAL } from "./FormularioDeCadastroManual";

/**
 * O "+" do cabecalho de Coletas Importadas, como o do sistema antigo: abre e
 * fecha o cadastro manual. Mesma caixa dos botoes de exportar (`Acao`), ao
 * lado deles. So aparece para GESTOR (ver `page.tsx`).
 */
export function BotaoCadastroManual() {
  const [aberto, setAberto] = useState(false);
  const rotulo = aberto ? "Fechar cadastro manual" : "Cadastrar coleta manual";

  return (
    <button
      type="button"
      title={rotulo}
      aria-label={rotulo}
      aria-controls={ID_DO_CADASTRO_MANUAL}
      aria-expanded={aberto}
      onClick={() => {
        setAberto((atual) => !atual);
        window.dispatchEvent(new Event(EVENTO_ALTERNAR_CADASTRO));
      }}
      className="flex h-8 w-8 items-center justify-center rounded-md bg-sky-600/40 text-white transition-all duration-200 hover:brightness-125 active:scale-[0.97]"
    >
      <PlusIcon className={aberto ? "h-4 w-4 rotate-45 transition-transform duration-200" : "h-4 w-4 transition-transform duration-200"} />
    </button>
  );
}
