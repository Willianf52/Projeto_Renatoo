"use client";

import { useActionState } from "react";
import { Button } from "@/components/Button";
import { SelecaoMultipla, type OpcaoDeSelecao } from "@/components/dashboard/SelecaoMultipla";
import { getInputClasses } from "@/components/FormField";
import { alterarEmailsEmMassa, type EstadoDoEnvio } from "./actions";
import { MAXIMO_DE_EMAILS, TIPOS_DE_EMAIL } from "./regras";

const LISTAGEM = "/dashboard/cadastros/site-planta";

const rotuloClasses = "mb-1.5 block text-xs font-medium uppercase tracking-wide text-brand-muted";
const ajudaClasses = "mt-1.5 text-xs text-brand-muted";

/**
 * "Alterar E-mails em Massa" do sistema antigo (Site/Planta), na mesma ordem:
 * Grupo de Sites, Locais, E-mails e Tipos de atualizacao. Regras em `regras.ts`.
 */
export function EmailsEmMassaForm({ grupos, locais }: { grupos: OpcaoDeSelecao[]; locais: OpcaoDeSelecao[] }) {
  const [estado, formAction, enviando] = useActionState<EstadoDoEnvio, FormData>(alterarEmailsEmMassa, {});

  return (
    <form action={formAction} className="space-y-4 p-4">
      {estado.erro && (
        <p role="alert" className="rounded-md border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {estado.erro}
        </p>
      )}
      {estado.sucesso && (
        <p role="status" className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">
          {estado.sucesso}
        </p>
      )}

      <div>
        <span className={rotuloClasses}>Grupo de Sites</span>
        <SelecaoMultipla
          name="grupos"
          opcoes={grupos}
          iniciais={[]}
          rotuloDoItem="grupo"
          textoSemOpcoes="Nenhum grupo de sites cadastrado ainda."
        />
      </div>

      <div>
        <span className={rotuloClasses}>Locais</span>
        <SelecaoMultipla
          name="locais"
          opcoes={locais}
          iniciais={[]}
          rotuloDoItem="local"
          textoSemOpcoes="Nenhum local cadastrado ainda."
        />
        <p className={ajudaClasses}>
          Ao selecionar um grupo, seus locais são incluídos na seleção. Também é possível escolher locais avulsos.
        </p>
      </div>

      <div>
        <label htmlFor="emails" className={rotuloClasses}>
          E-mails
          <span className="text-red-400"> *</span>
        </label>
        <textarea
          id="emails"
          name="emails"
          rows={3}
          required
          placeholder="nome@empresa.com.br; outro@empresa.com.br"
          className={getInputClasses(false)}
        />
        <p className={ajudaClasses}>
          Separe por vírgula, ponto e vírgula ou um por linha. No máximo {MAXIMO_DE_EMAILS}. Estes e-mails substituem
          os que os locais escolhidos já tinham na lista marcada abaixo.
        </p>
      </div>

      <fieldset>
        <legend className={rotuloClasses}>
          Tipos de atualização
          <span className="text-red-400"> *</span>
        </legend>
        <div className="flex flex-wrap gap-x-6 gap-y-2">
          {TIPOS_DE_EMAIL.map((tipo) => (
            <label key={tipo.valor} className="flex items-center gap-2 text-sm text-white">
              <input type="checkbox" name="tipos" value={tipo.valor} />
              {tipo.rotulo}
            </label>
          ))}
        </div>
        <p className={ajudaClasses}>
          Checklists: os &quot;E-mails Checklist&quot; do local, que recebem o aviso de inspeção. Eventos: os
          &quot;E-mails Eventos&quot;, que recebem o aviso de ocorrência.
        </p>
      </fieldset>

      <div className="flex items-center gap-3 pt-2">
        <Button type="submit" loading={enviando} disabled={enviando}>
          {enviando ? "Alterando..." : "Alterar E-mails"}
        </Button>
        <Button href={LISTAGEM} variant="secondary" disabled={enviando}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}
