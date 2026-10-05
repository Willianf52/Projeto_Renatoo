"use client";

import { useRef } from "react";
import { InfoIcon, XIcon } from "@/components/dashboard/icons";

/**
 * O "i" do Painel de Eventos: abre a "Descricao do Evento", como o modal do
 * sistema de referencia. `<dialog>` nativo, que cuida do foco e do Esc.
 */
export function DescricaoDoEvento({ numeroAno, linhas }: { numeroAno: string; linhas: string[] }) {
  const dialogo = useRef<HTMLDialogElement>(null);
  const idDoTitulo = `descricao-${numeroAno.replace(/\D/g, "")}`;

  return (
    <>
      <button
        type="button"
        onClick={() => dialogo.current?.showModal()}
        title="Descrição do Evento"
        aria-label={`Descrição do evento ${numeroAno}`}
        className="inline-flex h-8 w-8 items-center justify-center rounded-md text-white transition-colors hover:bg-white/10"
      >
        <InfoIcon className="h-4 w-4" />
      </button>

      <dialog
        ref={dialogo}
        aria-labelledby={idDoTitulo}
        className="m-auto w-[calc(100%-2rem)] max-w-lg rounded-lg border border-slate-800 bg-brand-surface p-0 text-white shadow-xl backdrop:bg-brand-navy/70"
      >
        <div className="flex items-center justify-between border-b border-slate-800 px-5 py-4">
          <h2 id={idDoTitulo} className="text-sm font-semibold">
            Descrição do Evento {numeroAno}
          </h2>
          <button
            type="button"
            aria-label="Fechar"
            onClick={() => dialogo.current?.close()}
            className="rounded-md p-1 text-brand-muted hover:bg-slate-800 hover:text-white"
          >
            <XIcon className="h-5 w-5" />
          </button>
        </div>
        <div className="space-y-1 px-5 py-4 text-sm">
          {linhas.map((linha, indice) => (
            <p key={indice} className="whitespace-pre-line break-words">
              {linha}
            </p>
          ))}
        </div>
        <div className="flex justify-end border-t border-slate-800 px-5 py-3">
          <button
            type="button"
            onClick={() => dialogo.current?.close()}
            className="rounded-md bg-brand-green px-4 py-2 text-sm font-semibold text-brand-navy transition-colors hover:bg-brand-green-hover"
          >
            Fechar
          </button>
        </div>
      </dialog>
    </>
  );
}
