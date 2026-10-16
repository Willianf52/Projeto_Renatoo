"use client";

import { startTransition, useActionState, useState, type FormEvent } from "react";
import { Button } from "@/components/Button";
import { getInputClasses } from "@/components/FormField";
import { importarUsuarios, type EstadoDaImportacaoDeUsuarios } from "./actions";

const LISTAGEM = "/dashboard/cadastros/usuarios";

const rotuloClasses = "mb-1.5 block text-xs font-medium uppercase tracking-wide text-brand-muted";

/** Identifica o arquivo escolhido: a previa so vale para ele. */
function chaveDoArquivo(arquivo: File | undefined): string | null {
  return arquivo ? `${arquivo.name}|${arquivo.size}|${arquivo.lastModified}` : null;
}

export function ImportarUsuariosForm() {
  const [estado, formAction, pendente] = useActionState<EstadoDaImportacaoDeUsuarios, FormData>(importarUsuarios, {});
  const [chaveAtual, setChaveAtual] = useState<string | null>(null);
  const [chaveEnviada, setChaveEnviada] = useState<string | null>(null);

  const { previa, resultado, erros } = estado;
  // So confirma o que acabou de ser mostrado: trocar o arquivo esconde o botao.
  const podeImportar = Boolean(previa) && previa!.novos.length > 0 && chaveEnviada === chaveAtual && !resultado;

  /**
   * Sem `action={formAction}` no <form> de proposito: o React limpa o campo de
   * arquivo depois de uma action, e a pessoa perderia o arquivo entre ver o
   * plano e confirmar. Aqui o envio e manual, e o campo fica como esta.
   *
   * A senha so viaja no "Importar": a pre-visualizacao nao precisa dela.
   */
  function aoEnviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const botao = (evento.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
    const dados = new FormData(evento.currentTarget);
    const modo = botao?.value === "importar" ? "importar" : "previa";
    dados.set("modo", modo);
    if (modo === "previa") dados.delete("senha");
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
        <div className="space-y-3">
          <p
            role="status"
            className="rounded-md border border-brand-green/40 bg-brand-green/10 px-4 py-3 text-sm text-brand-green"
          >
            {resultado.criados === 0 && resultado.falhas.length === 0
              ? "Nada a importar: todos os usuários do arquivo já existiam no portal."
              : `Importação concluída: ${resultado.criados} ${resultado.criados === 1 ? "usuário criado" : "usuários criados"}${resultado.falhas.length > 0 ? `, ${resultado.falhas.length} com falha` : ""}.`}
          </p>
          {resultado.falhas.length > 0 && (
            <ListaDeLinhas
              titulo="Não criados"
              itens={resultado.falhas.map((f) => ({ linha: f.linha, texto: `${f.nome}: ${f.erro}` }))}
            />
          )}
          {resultado.semSuperior.length > 0 && (
            <p className="text-sm text-amber-300">
              Criados sem o superior, porque ele não foi criado: {resultado.semSuperior.join(", ")}. Ajuste na edição
              do usuário.
            </p>
          )}
        </div>
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
            {previa.novos.length === 1 ? "usuário novo" : "usuários novos"} e {previa.existentes.length}{" "}
            {previa.existentes.length === 1 ? "que já existe" : "que já existem"} (não são alterados).
            {previa.clientesSemGrupo > 0 &&
              ` ${previa.clientesSemGrupo} ${previa.clientesSemGrupo === 1 ? "cliente entra" : "clientes entram"} sem grupo de sites e não ${previa.clientesSemGrupo === 1 ? "enxerga" : "enxergam"} nada até alguém ligar os grupos na edição.`}
          </p>

          {previa.novos.length > 0 && (
            <ListaDeLinhas
              titulo={`Usuários que serão criados (${previa.novos.length})`}
              itens={previa.novos.map((u) => ({
                linha: u.linha,
                texto: `${u.nome}, ${u.email}, ${u.nivel}${u.superior ? `, superior ${u.superior}` : ""}`,
              }))}
            />
          )}

          {previa.existentes.length > 0 && (
            <ListaDeLinhas
              titulo={`Já existem no portal (${previa.existentes.length})`}
              itens={previa.existentes.map((u) => ({ linha: u.linha, texto: `${u.nome}, ${u.email}` }))}
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
          Uma linha por usuário. As colunas são achadas pelo nome do cabeçalho; só &quot;Nome&quot; é obrigatória:
          Nome, Login, E-mail, E-mail de acesso, Função, Nível de Acesso, Tipo, País, Usuário Superior, E-mail
          Ocorrência, E-mail Checklist, E-mail Evento, Status, CPF, R.E., Telefone, Celular e Grupos de Sites
          (separados por |, só para Cliente). O acesso é o &quot;E-mail de acesso&quot;; sem ele, o Login quando
          tem formato de e-mail, senão o E-mail. Quem já existe no portal não é alterado. Nada é gravado antes de
          Importar. Até 200 linhas.
        </p>
      </div>

      {podeImportar && (
        <div>
          <label htmlFor="senha" className={rotuloClasses}>
            Senha provisória dos novos usuários
            <span className="text-red-400"> *</span>
          </label>
          <input
            id="senha"
            name="senha"
            type="password"
            autoComplete="new-password"
            required
            maxLength={16}
            className={getInputClasses(false)}
          />
          <p className="mt-1.5 text-xs text-brand-muted">
            Vale para todos os usuários criados agora. De 8 a 16 caracteres, com maiúscula, minúscula, número e
            símbolo, e que não apareça em vazamentos conhecidos. Cada pessoa troca a sua depois, em Trocar Senha.
          </p>
        </div>
      )}

      <div className="flex items-center gap-3 pt-2">
        <Button type="submit" value="previa" variant={podeImportar ? "secondary" : "primary"} loading={pendente} disabled={pendente}>
          {pendente ? "Lendo o arquivo..." : "Pré-visualizar"}
        </Button>
        {podeImportar && (
          <Button type="submit" value="importar" loading={pendente} disabled={pendente}>
            {pendente ? "Criando os usuários..." : "Importar"}
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
