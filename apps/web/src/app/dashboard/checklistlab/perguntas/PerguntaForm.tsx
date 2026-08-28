"use client";

import { useActionState } from "react";
import { Button } from "@/components/Button";
import { ChevronDownIcon } from "@/components/dashboard/icons";
import { getInputClasses } from "@/components/FormField";
import { salvarPergunta, type EstadoDoFormulario, type ValoresDaPergunta } from "./actions";

const LISTAGEM = "/dashboard/checklistlab/perguntas";

const rotuloClasses = "mb-1.5 block text-xs font-medium uppercase tracking-wide text-brand-muted";

export function PerguntaForm({
  id,
  valoresIniciais,
}: {
  /** Ausente na criacao; presente na edicao. */
  id?: number;
  valoresIniciais: ValoresDaPergunta;
}) {
  const [estado, formAction, enviando] = useActionState<EstadoDoFormulario, FormData>(
    salvarPergunta,
    {},
  );

  // Depois de uma recusa, o formulario volta com o que a pessoa tinha
  // digitado, e nao com o valor original do banco.
  const valores = estado.valores ?? valoresIniciais;

  return (
    <form action={formAction} className="space-y-4 p-4">
      {id !== undefined && <input type="hidden" name="id" value={id} />}

      {estado.erro && (
        <p
          role="alert"
          className="rounded-md border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-300"
        >
          {estado.erro}
        </p>
      )}

      <div>
        <label htmlFor="ordem" className={rotuloClasses}>
          Ordem
          <span className="text-red-400"> *</span>
        </label>
        <input
          id="ordem"
          name="ordem"
          type="number"
          min={1}
          max={9999}
          required
          defaultValue={valores.ordem}
          className={getInputClasses(Boolean(estado.erro))}
        />
        <p className="mt-1.5 text-xs text-brand-muted">
          Define a sequência em que a pergunta aparece no celular do inspetor. Dois números não
          podem se repetir — para encaixar uma pergunta no meio da lista, renumere as seguintes.
        </p>
      </div>

      <div>
        <label htmlFor="texto" className={rotuloClasses}>
          Pergunta
          <span className="text-red-400"> *</span>
        </label>
        {/* `textarea` e nao `input`: a pergunta e lida na tela de um celular,
            e o campo precisa mostrar de uma vez o que vai caber la. */}
        <textarea
          id="texto"
          name="texto"
          rows={3}
          required
          maxLength={300}
          defaultValue={valores.texto}
          className={`${getInputClasses(Boolean(estado.erro))} resize-y`}
        />
        <p className="mt-1.5 text-xs text-brand-muted">
          O inspetor responde Conforme, Não conforme ou Não se aplica.
        </p>
      </div>

      <div>
        <label htmlFor="status" className={rotuloClasses}>
          Status
        </label>
        <div className="relative">
          <select
            id="status"
            name="status"
            defaultValue={valores.ativo ? "ativo" : "inativo"}
            className={`peer ${getInputClasses(false)} appearance-none pr-9`}
          >
            <option value="ativo">Ativa</option>
            <option value="inativo">Inativa</option>
          </select>
          <ChevronDownIcon className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-brand-muted transition-transform duration-200 peer-focus:rotate-180" />
        </div>
        <p className="mt-1.5 text-xs text-brand-muted">
          Inativa some do checklist do app, mas as respostas já dadas continuam guardadas — é por
          isso que não existe excluir aqui.
        </p>
      </div>

      <div className="flex items-center gap-3 pt-2">
        <Button type="submit" loading={enviando} disabled={enviando}>
          {enviando ? "Salvando..." : "Salvar"}
        </Button>
        <Button href={LISTAGEM} variant="secondary" disabled={enviando}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}
