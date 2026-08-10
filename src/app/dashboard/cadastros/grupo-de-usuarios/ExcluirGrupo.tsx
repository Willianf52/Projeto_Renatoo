"use client";

import { useActionState, useState } from "react";
import { CheckIcon, TrashIcon, XIcon } from "@/components/dashboard/icons";
import { excluirGrupoUsuarios, type EstadoDaExclusao } from "./actions";

/**
 * Botao de excluir da coluna "Ações" (migration 0020).
 *
 * A confirmacao e em dois passos na propria celula, e nao um `confirm()` do
 * navegador: o dialogo nativo destoa do resto da tela, e navegador nenhum
 * garante que ele apareca. Aqui o segundo clique fica visivel e cancelavel.
 *
 * Client Component pelo estado do "confirmando" -- e o unico ponto da tela que
 * precisa de JS. A listagem em volta continua sendo Server Component.
 */
const BOTAO =
  "flex h-8 w-8 items-center justify-center rounded-md text-white transition-all duration-200 hover:brightness-125 active:scale-90 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:brightness-100 disabled:active:scale-100";

export function ExcluirGrupo({ id, nome }: { id: number; nome: string }) {
  const [estado, formAction, excluindo] = useActionState<EstadoDaExclusao, FormData>(
    excluirGrupoUsuarios,
    {},
  );
  const [confirmando, setConfirmando] = useState(false);

  return (
    <div className="flex items-center gap-2">
      {confirmando ? (
        <form action={formAction} className="flex items-center gap-2">
          <input type="hidden" name="id" value={id} />
          {/* O nome no aviso e de proposito: a coluna e estreita e a linha
              rola, entao "Excluir?" sozinho nao diz qual. */}
          <span className="whitespace-nowrap text-xs text-brand-muted">Excluir {nome}?</span>
          <button
            type="submit"
            disabled={excluindo}
            title={`Confirmar exclusão de ${nome}`}
            aria-label={`Confirmar exclusão de ${nome}`}
            className={`${BOTAO} bg-red-600`}
          >
            <CheckIcon className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => setConfirmando(false)}
            disabled={excluindo}
            title="Cancelar"
            aria-label="Cancelar exclusão"
            className={`${BOTAO} bg-white/10`}
          >
            <XIcon className="h-4 w-4" />
          </button>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setConfirmando(true)}
          title={`Excluir ${nome}`}
          aria-label={`Excluir ${nome}`}
          className={`${BOTAO} bg-red-600/40`}
        >
          <TrashIcon className="h-4 w-4" />
        </button>
      )}

      {/* Fica fora do ramo do confirmando para o erro sobreviver ao
          cancelamento -- quem foi recusado precisa ler o motivo. */}
      {estado.erro && (
        <span role="alert" className="text-xs text-red-300">
          {estado.erro}
        </span>
      )}
    </div>
  );
}
