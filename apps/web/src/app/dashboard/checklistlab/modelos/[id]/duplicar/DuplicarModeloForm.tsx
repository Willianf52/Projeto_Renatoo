"use client";

import { useActionState } from "react";
import { Button } from "@/components/Button";
import { getInputClasses } from "@/components/FormField";
import { duplicarModelo, type EstadoDaDuplicacao } from "../../actions";

const rotuloClasses = "mb-1.5 block text-xs font-medium uppercase tracking-wide text-brand-muted";

export function DuplicarModeloForm({ origem, nomeSugerido }: { origem: number; nomeSugerido: string }) {
  const [estado, formAction, enviando] = useActionState<EstadoDaDuplicacao, FormData>(duplicarModelo, {});

  return (
    <form action={formAction} className="space-y-4 p-4">
      <input type="hidden" name="origem" value={origem} />

      {estado.erro && (
        <p role="alert" className="rounded-md border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {estado.erro}
        </p>
      )}

      <div>
        <label htmlFor="nome" className={rotuloClasses}>
          Nome do novo checklist<span className="text-red-400"> *</span>
        </label>
        <input
          id="nome"
          name="nome"
          type="text"
          required
          maxLength={200}
          defaultValue={estado.nome ?? nomeSugerido}
          className={getInputClasses(Boolean(estado.erro))}
        />
        <p className="mt-1.5 text-xs text-brand-muted">
          Copia todas as perguntas, com grupo, respostas, tipo de evento e status. Os grupos de sites não vão junto: o
          novo checklist abre na edição para você escolher onde ele vale.
        </p>
      </div>

      <div className="flex items-center gap-3 pt-2">
        <Button type="submit" loading={enviando} disabled={enviando}>
          {enviando ? "Duplicando..." : "Duplicar"}
        </Button>
        <Button href="/dashboard/checklistlab/modelos" variant="secondary" disabled={enviando}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}
