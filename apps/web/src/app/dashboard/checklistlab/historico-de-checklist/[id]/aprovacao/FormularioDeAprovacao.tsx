"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/Button";
import { decidirAprovacao, type EstadoDaAprovacao } from "../../actions";

const LISTAGEM = "/dashboard/checklistlab/historico-de-checklist";

/** Aprovar ou reprovar o checklist que aguarda autorizacao (0089). */
export function FormularioDeAprovacao({ id }: { id: number }) {
  const [estado, formAction, enviando] = useActionState<EstadoDaAprovacao, FormData>(decidirAprovacao, {});
  const [decisao, setDecisao] = useState<"APROVADO" | "REPROVADO">("APROVADO");

  return (
    <form action={formAction} className="space-y-4 p-4">
      <input type="hidden" name="id" value={id} />
      {estado.erro && (
        <p role="alert" className="rounded-md border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {estado.erro}
        </p>
      )}
      <fieldset className="space-y-2">
        <legend className="mb-1 text-sm font-medium text-white">Decisão</legend>
        {(["APROVADO", "REPROVADO"] as const).map((valor) => (
          <label key={valor} className="flex items-center gap-2 text-sm text-slate-200">
            <input
              type="radio"
              name="decisao"
              value={valor}
              checked={decisao === valor}
              onChange={() => setDecisao(valor)}
            />
            {valor === "APROVADO" ? "Aprovar" : "Reprovar"}
          </label>
        ))}
      </fieldset>
      <div>
        <label htmlFor="motivo" className="mb-1.5 block text-sm font-medium text-white">
          Motivo {decisao === "REPROVADO" ? "(obrigatório)" : "(opcional)"}
        </label>
        <textarea
          id="motivo"
          name="motivo"
          rows={4}
          maxLength={2000}
          className="w-full rounded-md border border-slate-700 bg-brand-bg px-3 py-2 text-sm text-white"
        />
      </div>
      <div className="flex items-center gap-3">
        <Button type="submit" variant={decisao === "REPROVADO" ? "danger" : "primary"} loading={enviando} disabled={enviando}>
          {decisao === "REPROVADO" ? "Reprovar checklist" : "Aprovar checklist"}
        </Button>
        <Button href={LISTAGEM} variant="secondary" disabled={enviando}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}
