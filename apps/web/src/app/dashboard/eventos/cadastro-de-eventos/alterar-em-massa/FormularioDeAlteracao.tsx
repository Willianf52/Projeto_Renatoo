"use client";

import { useActionState } from "react";
import { Button } from "@/components/Button";
import { getInputClasses } from "@/components/FormField";
import { SelecaoMultipla, type OpcaoDeSelecao } from "@/components/dashboard/SelecaoMultipla";
import { LISTAGEM } from "../regras";
import { alterarEventosEmMassa, type EstadoDaAlteracao } from "./actions";

const rotuloClasses = "mb-1.5 block text-xs font-medium uppercase tracking-wide text-brand-muted";

/** "Alterações de permissões em massa", como a caixa do sistema de referencia. */
export function FormularioDeAlteracao({
  eventos,
  sites,
  grupos,
}: {
  eventos: OpcaoDeSelecao[];
  sites: OpcaoDeSelecao[];
  grupos: OpcaoDeSelecao[];
}) {
  const [estado, formAction, enviando] = useActionState<EstadoDaAlteracao, FormData>(alterarEventosEmMassa, {});

  return (
    <form action={formAction} className="space-y-4 p-4">
      {estado.erro && (
        <p role="alert" className="rounded-md border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {estado.erro}
        </p>
      )}

      <div>
        <span className={rotuloClasses}>Eventos</span>
        <SelecaoMultipla
          name="eventos"
          opcoes={eventos}
          iniciais={[]}
          rotuloDoItem="evento"
          textoSemOpcoes="Nenhum evento cadastrado."
        />
      </div>

      <div>
        <label htmlFor="grupo_responsavel_id" className={rotuloClasses}>
          Grupo Responsável
        </label>
        <select id="grupo_responsavel_id" name="grupo_responsavel_id" defaultValue="" className={getInputClasses(false)}>
          <option value="">Não alterar</option>
          {grupos.map((g) => (
            <option key={g.value} value={g.value}>
              {g.label}
            </option>
          ))}
        </select>
      </div>

      <div>
        <span className={rotuloClasses}>Sites</span>
        <SelecaoMultipla name="sites" opcoes={sites} iniciais={[]} rotuloDoItem="site" textoSemOpcoes="Nenhum site." />
      </div>

      <fieldset>
        <legend className={rotuloClasses}>Permissões atuais</legend>
        <div className="flex flex-col gap-2 text-sm text-white sm:flex-row sm:gap-6">
          <label className="flex items-center gap-2">
            <input type="radio" name="acao" value="manter" defaultChecked className="h-4 w-4 accent-brand-green" />
            Manter permissões atuais e adicionar novas
          </label>
          <label className="flex items-center gap-2">
            <input type="radio" name="acao" value="substituir" className="h-4 w-4 accent-brand-green" />
            Remover antigas e atualizar
          </label>
        </div>
        <p className="mt-1.5 text-xs text-brand-muted">
          &quot;Remover antigas&quot; deixa cada evento só com os sites escolhidos; sem nenhum site, o evento passa a
          valer para todos.
        </p>
      </fieldset>

      <div className="flex items-center gap-3 pt-2">
        <Button type="submit" loading={enviando} disabled={enviando}>
          {enviando ? "Alterando..." : "Alterar Eventos"}
        </Button>
        <Button href={LISTAGEM} variant="secondary" disabled={enviando}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}
