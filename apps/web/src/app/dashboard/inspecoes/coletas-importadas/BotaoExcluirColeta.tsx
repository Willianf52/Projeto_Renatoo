"use client";

import { useActionState, useRef } from "react";
import { Button } from "@/components/Button";
import { TrashIcon, XIcon } from "@/components/dashboard/icons";
import { excluirColeta, type EstadoDaColeta } from "./actions";

/**
 * Lixeira de uma linha de Coletas Importadas (migration 0067), com
 * confirmacao num `<dialog>` nativo. O erro (coleta de visita com checklist,
 * sem permissao) aparece dentro do proprio dialogo.
 */
export function BotaoExcluirColeta({
  leituraId,
  coleta,
  filtros,
}: {
  leituraId: number;
  /** O numero da coluna Coleta, para a pessoa conferir o que vai excluir. */
  coleta: string;
  filtros: string;
}) {
  const dialogo = useRef<HTMLDialogElement>(null);
  const [estado, formAction, enviando] = useActionState<EstadoDaColeta, FormData>(excluirColeta, {});
  const idDoTitulo = `excluir-coleta-${leituraId}`;

  return (
    <>
      <button
        type="button"
        onClick={() => dialogo.current?.showModal()}
        title={`Excluir coleta ${coleta}`}
        aria-label={`Excluir coleta ${coleta}`}
        className="flex h-8 w-8 items-center justify-center rounded-md bg-red-600/40 text-white transition-all duration-200 hover:brightness-125 active:scale-[0.97]"
      >
        <TrashIcon className="h-4 w-4" />
      </button>

      <dialog
        ref={dialogo}
        aria-labelledby={idDoTitulo}
        className="m-auto w-[calc(100%-2rem)] max-w-lg rounded-lg border border-slate-800 bg-brand-surface p-0 text-white shadow-xl backdrop:bg-brand-navy/70"
      >
        <form action={formAction}>
          <input type="hidden" name="leitura_id" value={leituraId} />
          <input type="hidden" name="filtros" value={filtros} />

          <div className="flex items-center justify-between border-b border-slate-800 px-5 py-4">
            <h2 id={idDoTitulo} className="text-sm font-semibold">
              Excluir a coleta {coleta}
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

          <div className="space-y-3 px-5 py-4 text-sm">
            <p>
              A coleta será excluída do banco de dados e não poderá ser recuperada. Se for a única coleta da visita,
              a visita também sai.
            </p>
            <p>Deseja realmente excluir a coleta?</p>
            {estado.erro && (
              <p role="alert" className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-red-300">
                {estado.erro}
              </p>
            )}
          </div>

          <div className="flex justify-end gap-2 border-t border-slate-800 px-5 py-3">
            <Button type="button" variant="secondary" onClick={() => dialogo.current?.close()}>
              Cancelar
            </Button>
            <Button type="submit" variant="danger" loading={enviando}>
              Sim, excluir
            </Button>
          </div>
        </form>
      </dialog>
    </>
  );
}
