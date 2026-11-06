"use client";

import { useActionState, useRef } from "react";
import { Button } from "@/components/Button";
import { TrashIcon, XIcon } from "@/components/dashboard/icons";
import { CLASSES_DO_TOM, HOVER_DO_TOM } from "@/components/dashboard/tons-de-acao";
import { excluirEvento, type EstadoDaExclusao } from "./actions";

/**
 * Lixeira de uma linha do Cadastro de Eventos (0094), com confirmacao num
 * `<dialog>` nativo, como a de Coletas Importadas. O erro (evento com
 * ocorrencias, SubTipos ou perguntas ligadas) aparece dentro do dialogo, com a
 * orientacao do banco ("inative o evento").
 */
export function BotaoExcluirEvento({ eventoId, nome, filtros }: { eventoId: number; nome: string; filtros: string }) {
  const dialogo = useRef<HTMLDialogElement>(null);
  const [estado, formAction, enviando] = useActionState<EstadoDaExclusao, FormData>(excluirEvento, {});
  const idDoTitulo = `excluir-evento-${eventoId}`;

  return (
    <>
      <button
        type="button"
        onClick={() => dialogo.current?.showModal()}
        title={`Excluir ${nome}`}
        aria-label={`Excluir ${nome}`}
        className={`flex h-8 w-8 items-center justify-center rounded-md transition-all duration-200 active:scale-[0.97] ${CLASSES_DO_TOM.perigo} ${HOVER_DO_TOM.perigo}`}
      >
        <TrashIcon className="h-4 w-4" />
      </button>

      <dialog
        ref={dialogo}
        aria-labelledby={idDoTitulo}
        className="m-auto w-[calc(100%-2rem)] max-w-lg rounded-lg border border-slate-800 bg-brand-surface p-0 text-white shadow-xl backdrop:bg-brand-navy/70"
      >
        <form action={formAction}>
          <input type="hidden" name="evento_id" value={eventoId} />
          <input type="hidden" name="filtros" value={filtros} />

          <div className="flex items-center justify-between border-b border-slate-800 px-5 py-4">
            <h2 id={idDoTitulo} className="text-sm font-semibold">
              Excluir o evento {nome}
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
              O evento será excluído e não poderá ser recuperado. Só dá para excluir um evento que ainda não tem
              ocorrências, SubTipos, coletas nem perguntas de checklist ligados; nos outros casos, inative o evento.
            </p>
            <p>Deseja realmente excluir o evento?</p>
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
