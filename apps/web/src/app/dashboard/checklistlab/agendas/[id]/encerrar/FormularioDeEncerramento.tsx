"use client";

import { useActionState } from "react";
import { Button } from "@/components/Button";
import { FilterDatePicker } from "@/components/dashboard/FilterDatePicker";
import { encerrarAgenda, type EstadoDoEncerramento } from "../../actions";

const LISTAGEM = "/dashboard/checklistlab/agendas";

/** "Exclusão de Agendamentos", como a janela do sistema de referencia. */
export function FormularioDeEncerramento({ id }: { id: number }) {
  const [estado, formAction, enviando] = useActionState<EstadoDoEncerramento, FormData>(encerrarAgenda, {});

  return (
    <form action={formAction} className="space-y-4 p-4">
      <input type="hidden" name="id" value={id} />
      {estado.erro && (
        <p role="alert" className="rounded-md border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {estado.erro}
        </p>
      )}
      <p className="text-sm text-slate-300">
        Os agendamentos desta agenda serão excluídos a partir da data informada abaixo, e a agenda fica inativa. Os
        checklists já feitos continuam no Histórico.
      </p>
      <div className="max-w-xs">
        <FilterDatePicker label="Data" name="data" />
      </div>
      <p className="text-xs text-amber-300">Atenção: depois de excluir os agendamentos, não será possível recuperá-los.</p>
      <div className="flex items-center gap-3 pt-2">
        <Button type="submit" variant="danger" loading={enviando} disabled={enviando}>
          {enviando ? "Excluindo..." : "Sim, excluir agendamentos e inativar a agenda"}
        </Button>
        <Button href={LISTAGEM} variant="secondary" disabled={enviando}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}
