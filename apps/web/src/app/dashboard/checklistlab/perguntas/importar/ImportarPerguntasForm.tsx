"use client";

import { useActionState } from "react";
import { Button } from "@/components/Button";
import { getInputClasses } from "@/components/FormField";
import { importarPerguntas, type EstadoDaImportacao } from "./actions";

const rotuloClasses = "mb-1.5 block text-xs font-medium uppercase tracking-wide text-brand-muted";

export function ImportarPerguntasForm({ modeloId }: { modeloId: number }) {
  const [estado, formAction, enviando] = useActionState<EstadoDaImportacao, FormData>(importarPerguntas, {});
  const resultado = estado.resultado;
  const lista = `/dashboard/checklistlab/perguntas?modelo=${modeloId}`;

  return (
    <form action={formAction} className="space-y-4 p-4">
      <input type="hidden" name="modelo" value={modeloId} />

      {estado.erro && (
        <p role="alert" className="rounded-md border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {estado.erro}
        </p>
      )}

      {resultado && !estado.erro && (
        <p role="status" className="rounded-md border border-brand-green/40 bg-brand-green/10 px-4 py-3 text-sm text-brand-green">
          {resultado.criadas === 0
            ? "Nenhuma pergunta nova no arquivo."
            : `${resultado.criadas} ${resultado.criadas === 1 ? "pergunta importada" : "perguntas importadas"}.`}
          {resultado.pulados.length > 0 &&
            ` ${resultado.pulados.length} ${resultado.pulados.length === 1 ? "linha pulada" : "linhas puladas"}.`}
        </p>
      )}

      {resultado && resultado.erros.length > 0 && (
        <Lista titulo="Linhas com erro" itens={resultado.erros.map((e) => ({ linha: e.linha, texto: e.mensagem }))} />
      )}
      {resultado && resultado.pulados.length > 0 && (
        <Lista titulo="Linhas puladas" itens={resultado.pulados.map((p) => ({ linha: p.linha, texto: `${p.nome}: ${p.motivo}` }))} />
      )}

      <div>
        <label htmlFor="arquivo" className={rotuloClasses}>
          Arquivo CSV<span className="text-red-400"> *</span>
        </label>
        <input
          id="arquivo"
          name="arquivo"
          type="file"
          accept=".csv,text/csv"
          required
          className={`${getInputClasses(false)} file:mr-3 file:cursor-pointer file:rounded file:border-0 file:bg-slate-700 file:px-3 file:py-1 file:text-xs file:font-medium file:text-white`}
        />
        <p className="mt-1.5 text-xs text-brand-muted">
          Colunas pelo nome do cabeçalho: Pergunta (obrigatória), Respostas (CNA, CN ou SN; vazio vale CNA), Grupo e Tipo
          de Evento (já cadastrados), Status (Ativa ou Inativa). As perguntas entram no fim do checklist, na ordem do
          arquivo; a coluna Ordem é ignorada. Pergunta que já existe neste checklist é pulada. Até 500 linhas e 512 KB.
        </p>
      </div>

      <div className="flex items-center gap-3 pt-2">
        <Button type="submit" loading={enviando} disabled={enviando}>
          {enviando ? "Importando..." : "Importar"}
        </Button>
        <Button href={lista} variant="secondary" disabled={enviando}>
          {resultado && resultado.criadas > 0 ? "Voltar para as perguntas" : "Cancelar"}
        </Button>
      </div>
    </form>
  );
}

function Lista({ titulo, itens }: { titulo: string; itens: { linha: number; texto: string }[] }) {
  return (
    <div>
      <span className={rotuloClasses}>{titulo}</span>
      <ul className="max-h-60 space-y-1 overflow-y-auto rounded-md border border-slate-800 px-4 py-3 text-sm text-slate-300">
        {itens.map((item) => (
          <li key={`${item.linha}-${item.texto}`}>
            <span className="text-brand-muted">Linha {item.linha}:</span> {item.texto}
          </li>
        ))}
      </ul>
    </div>
  );
}
