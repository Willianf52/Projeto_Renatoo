"use client";

import { useActionState, useRef } from "react";
import { Button } from "@/components/Button";
import { TrashIcon, XIcon } from "@/components/dashboard/icons";
import { excluirChecklist, type EstadoDaExclusao } from "./actions";

/**
 * "Excluir checklist" do detalhe, com a confirmacao do sistema antigo
 * ("Exclusao Fisica") num `<dialog>` nativo, que cuida do foco e do Esc. O
 * erro (ocorrencia ja analisada, sem permissao) aparece dentro do proprio
 * dialogo, ao lado do botao que o causou.
 */
export function BotaoExcluirChecklist({ checklistId, filtros }: { checklistId: number; filtros: string }) {
  const dialogo = useRef<HTMLDialogElement>(null);
  const [estado, formAction, enviando] = useActionState<EstadoDaExclusao, FormData>(excluirChecklist, {});
  const idDoTitulo = `excluir-checklist-${checklistId}`;

  return (
    <>
      <Button type="button" variant="danger" onClick={() => dialogo.current?.showModal()}>
        <TrashIcon className="h-4 w-4" />
        Excluir checklist
      </Button>

      <dialog
        ref={dialogo}
        aria-labelledby={idDoTitulo}
        className="m-auto w-[calc(100%-2rem)] max-w-lg rounded-lg border border-slate-800 bg-brand-surface p-0 text-white shadow-xl backdrop:bg-brand-navy/70"
      >
        <form action={formAction}>
          <input type="hidden" name="checklist_id" value={checklistId} />
          <input type="hidden" name="filtros" value={filtros} />

          <div className="flex items-center justify-between border-b border-slate-800 px-5 py-4">
            <h2 id={idDoTitulo} className="text-sm font-semibold">
              Exclusão física do checklist
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
              O checklist, as respostas, as fotos, a assinatura e as ocorrências abertas por ele serão excluídos
              do banco de dados. Depois de excluídos, não será possível recuperá-los.
            </p>
            <p>Deseja realmente excluir o checklist?</p>
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
