"use client";

import { useActionState } from "react";
import { Button } from "@/components/Button";
import { getInputClasses } from "@/components/FormField";
import { importarGruposSites, type EstadoDaImportacao } from "./actions";

const LISTAGEM = "/dashboard/cadastros/grupo-de-sites";

const rotuloClasses = "mb-1.5 block text-xs font-medium uppercase tracking-wide text-brand-muted";

export function ImportarGruposForm() {
  const [estado, formAction, enviando] = useActionState<EstadoDaImportacao, FormData>(
    importarGruposSites,
    {},
  );

  const resultado = estado.resultado;

  return (
    <form action={formAction} className="space-y-4 p-4">
      {estado.erro && (
        <p
          role="alert"
          className="rounded-md border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-300"
        >
          {estado.erro}
        </p>
      )}

      {resultado && !estado.erro && (
        <p
          role="status"
          className="rounded-md border border-brand-green/40 bg-brand-green/10 px-4 py-3 text-sm text-brand-green"
        >
          {resultado.criados === 0
            ? "Nenhum grupo novo no arquivo."
            : `${resultado.criados} ${resultado.criados === 1 ? "grupo importado" : "grupos importados"}.`}
          {resultado.pulados.length > 0 &&
            ` ${resultado.pulados.length} ${resultado.pulados.length === 1 ? "linha pulada" : "linhas puladas"}.`}
        </p>
      )}

      {resultado && resultado.erros.length > 0 && (
        <ListaDeLinhas titulo="Linhas com erro" itens={resultado.erros.map((e) => ({ linha: e.linha, texto: e.mensagem }))} />
      )}

      {resultado && resultado.pulados.length > 0 && (
        <ListaDeLinhas
          titulo="Linhas puladas"
          itens={resultado.pulados.map((p) => ({ linha: p.linha, texto: `${p.nome} — ${p.motivo}` }))}
        />
      )}

      <div>
        <label htmlFor="arquivo" className={rotuloClasses}>
          Arquivo CSV
          <span className="text-red-400"> *</span>
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
          Use o arquivo do botão Exportar para Excel como modelo: colunas Nome (obrigatória), Status (Ativo ou
          Inativo; vazio vale Ativo) e Descrição. A coluna ID é ignorada. Grupos que já existem são pulados, nunca
          alterados. Até 1.000 linhas e 512 KB.
        </p>
      </div>

      <div className="flex items-center gap-3 pt-2">
        <Button type="submit" loading={enviando} disabled={enviando}>
          {enviando ? "Importando..." : "Importar"}
        </Button>
        <Button href={LISTAGEM} variant="secondary" disabled={enviando}>
          {resultado && resultado.criados > 0 ? "Voltar para a lista" : "Cancelar"}
        </Button>
      </div>
    </form>
  );
}

function ListaDeLinhas({ titulo, itens }: { titulo: string; itens: { linha: number; texto: string }[] }) {
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
