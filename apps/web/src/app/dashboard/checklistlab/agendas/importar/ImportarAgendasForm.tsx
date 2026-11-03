"use client";

import { useActionState } from "react";
import { Button } from "@/components/Button";
import { getInputClasses } from "@/components/FormField";
import { importarAgendas, type EstadoDaImportacao } from "./actions";

const LISTAGEM = "/dashboard/checklistlab/agendas";
const rotulo = "mb-1.5 block text-xs font-medium uppercase tracking-wide text-brand-muted";

export function ImportarAgendasForm() {
  const [estado, formAction, enviando] = useActionState<EstadoDaImportacao, FormData>(importarAgendas, {});

  return (
    <form action={formAction} className="space-y-4 p-4">
      {estado.erro && (
        <p role="alert" className="rounded-md border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {estado.erro}
        </p>
      )}
      {!estado.erro && estado.criadas !== undefined && (
        <p role="status" className="rounded-md border border-brand-green/40 bg-brand-green/10 px-4 py-3 text-sm text-brand-green">
          {estado.criadas === 1 ? "1 agenda importada." : `${estado.criadas} agendas importadas.`}
        </p>
      )}
      {estado.erros && estado.erros.length > 0 && (
        <ul className="max-h-60 space-y-1 overflow-y-auto rounded-md border border-slate-800 px-4 py-3 text-sm text-slate-300">
          {estado.erros.map((e) => (
            <li key={`${e.linha}-${e.mensagem}`}>
              <span className="text-brand-muted">Linha {e.linha}:</span> {e.mensagem}
            </li>
          ))}
        </ul>
      )}

      <div>
        <label htmlFor="arquivo" className={rotulo}>
          Arquivo CSV<span className="text-red-400"> *</span>
        </label>
        <input
          id="arquivo"
          name="arquivo"
          type="file"
          accept=".csv,text/csv"
          required
          className={`${getInputClasses(false)} file:mr-3 file:rounded file:border-0 file:bg-slate-700 file:px-3 file:py-1 file:text-xs file:text-white`}
        />
        <p className="mt-1.5 text-xs text-brand-muted">
          As mesmas colunas da planilha do sistema antigo: nome, checklist(nome), data_planejada, tolerancia(dias),
          responsavel(nome), grupo Usuários(nome), site(nome) (vários separados por ;), padrao_recorrencia (0 sem
          recorrência, 1 diária, 7 semanal, 15, 30, 60, 90, 180 ou 365), data termina e dias/horas. Salve a planilha como
          CSV no Excel. Até 300 linhas.{" "}
          <a href={`${LISTAGEM}/importar/exemplo`} className="text-brand-green hover:underline">
            Arquivo de exemplo
          </a>
        </p>
      </div>

      <div className="flex items-center gap-3 pt-2">
        <Button type="submit" loading={enviando} disabled={enviando}>
          {enviando ? "Importando..." : "Importar"}
        </Button>
        <Button href={LISTAGEM} variant="secondary" disabled={enviando}>
          Voltar
        </Button>
      </div>
    </form>
  );
}
