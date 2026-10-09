"use client";

import { startTransition, useActionState, useState, type FormEvent } from "react";
import { Button } from "@/components/Button";
import { getInputClasses } from "@/components/FormField";
import { importarSites, type EstadoDaImportacaoDeSites } from "./actions";

const LISTAGEM = "/dashboard/cadastros/site-planta";

const rotuloClasses = "mb-1.5 block text-xs font-medium uppercase tracking-wide text-brand-muted";

/** Identifica o arquivo escolhido: a previa so vale para ele. */
function chaveDoArquivo(arquivo: File | undefined): string | null {
  return arquivo ? `${arquivo.name}|${arquivo.size}|${arquivo.lastModified}` : null;
}

export function ImportarSitesForm() {
  const [estado, formAction, pendente] = useActionState<EstadoDaImportacaoDeSites, FormData>(importarSites, {});
  const [chaveAtual, setChaveAtual] = useState<string | null>(null);
  const [chaveEnviada, setChaveEnviada] = useState<string | null>(null);

  const { previa, resultado, erros } = estado;
  // So confirma o que acabou de ser mostrado: trocar o arquivo esconde o botao.
  const podeImportar = Boolean(previa) && chaveEnviada === chaveAtual && !resultado;

  /**
   * Sem `action={formAction}` no <form> de proposito: o React limpa o campo de
   * arquivo depois de uma action, e a pessoa perderia o arquivo entre ver o
   * plano e confirmar. Aqui o envio e manual, e o campo fica como esta.
   */
  function aoEnviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const botao = (evento.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
    const dados = new FormData(evento.currentTarget);
    dados.set("modo", botao?.value === "importar" ? "importar" : "previa");
    setChaveEnviada(chaveAtual);
    startTransition(() => formAction(dados));
  }

  return (
    <form onSubmit={aoEnviar} className="space-y-4 p-4">
      {estado.erro && (
        <p
          role="alert"
          className="rounded-md border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-300"
        >
          {estado.erro}
        </p>
      )}

      {resultado && (
        <p
          role="status"
          className="rounded-md border border-brand-green/40 bg-brand-green/10 px-4 py-3 text-sm text-brand-green"
        >
          {resultado.criados === 0 && resultado.completados === 0
            ? "Nada a importar: todos os sites do arquivo já estavam completos."
            : `Importação concluída: ${resultado.criados} ${resultado.criados === 1 ? "site criado" : "sites criados"} e ${resultado.completados} ${resultado.completados === 1 ? "completado" : "completados"}.`}
        </p>
      )}

      {erros && erros.length > 0 && (
        <ListaDeLinhas titulo="Linhas com erro" itens={erros.map((e) => ({ linha: e.linha, texto: e.mensagem }))} />
      )}

      {previa && !resultado && (
        <div className="space-y-3">
          <p
            role="status"
            className="rounded-md border border-sky-500/40 bg-sky-500/10 px-4 py-3 text-sm text-sky-200"
          >
            Pré-visualização, nada foi gravado: {previa.novos.length}{" "}
            {previa.novos.length === 1 ? "site novo" : "sites novos"}, {previa.completar.length} para completar e{" "}
            {previa.semMudanca} sem mudança.
            {previa.semResponsavel > 0 &&
              ` ${previa.semResponsavel} ${previa.semResponsavel === 1 ? "site novo tem" : "sites novos têm"} responsável sem conta no portal e ficam sem responsável.`}
          </p>

          {previa.novos.length > 0 && (
            <ListaDeLinhas
              titulo={`Sites que serão criados (${previa.novos.length})`}
              itens={previa.novos.map((s) => ({
                linha: s.linha,
                texto: `${s.nome}, grupo ${s.grupo}${s.superior ? `, superior ${s.superior}` : ""}`,
              }))}
            />
          )}

          {previa.completar.length > 0 && (
            <ListaDeLinhas
              titulo={`Sites que serão completados (${previa.completar.length})`}
              itens={previa.completar.map((s) => ({
                linha: s.linha,
                texto: `${s.nome}: ${[s.regional ? `regional ${s.regional}` : null, s.superior ? `superior ${s.superior}` : null]
                  .filter(Boolean)
                  .join(", ")}`,
              }))}
            />
          )}
        </div>
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
          onChange={(evento) => setChaveAtual(chaveDoArquivo(evento.target.files?.[0]))}
          className={`${getInputClasses(false)} file:mr-3 file:cursor-pointer file:rounded file:border-0 file:bg-slate-700 file:px-3 file:py-1 file:text-xs file:font-medium file:text-white`}
        />
        <p className="mt-1.5 text-xs text-brand-muted">
          Use o Excel de Site / Planta do sistema antigo, salvo como CSV (Arquivo › Salvar como › CSV). As colunas são
          achadas pelo nome do cabeçalho; só &quot;nome&quot; é obrigatória, e o que o portal não tem é ignorado.
          Site que já existe (mesmo nome) só ganha regional e site superior, e só se estiverem vazios; os demais são
          criados, com grupo e hierarquia. Nada é gravado antes de Importar. Até 1.000 linhas e 512 KB.
        </p>
      </div>

      <div className="flex items-center gap-3 pt-2">
        <Button type="submit" value="previa" variant={podeImportar ? "secondary" : "primary"} loading={pendente} disabled={pendente}>
          {pendente ? "Lendo o arquivo..." : "Pré-visualizar"}
        </Button>
        {podeImportar && (
          <Button type="submit" value="importar" loading={pendente} disabled={pendente}>
            {pendente ? "Importando..." : "Importar"}
          </Button>
        )}
        <Button href={LISTAGEM} variant="secondary" disabled={pendente}>
          {resultado ? "Voltar para a lista" : "Cancelar"}
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
