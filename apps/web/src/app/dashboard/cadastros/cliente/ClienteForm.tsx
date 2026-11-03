"use client";

import { useActionState } from "react";
import { Button } from "@/components/Button";
import { getInputClasses } from "@/components/FormField";
import { salvarCliente, type EstadoDoFormulario, type ValoresDoCliente } from "./actions";

const rotulo = "mb-1.5 block text-xs font-medium uppercase tracking-wide text-brand-muted";
const LISTAGEM = "/dashboard/cadastros/cliente";

function Campo({ id, titulo, children }: { id: string; titulo: string; children: React.ReactNode }) {
  return (
    <div>
      <label htmlFor={id} className={rotulo}>
        {titulo}
      </label>
      {children}
    </div>
  );
}

function SimNao({ id, titulo, valor }: { id: string; titulo: string; valor: boolean }) {
  return (
    <Campo id={id} titulo={titulo}>
      <select id={id} name={id} defaultValue={valor ? "sim" : "nao"} className={getInputClasses(false)}>
        <option value="nao">Não</option>
        <option value="sim">Sim</option>
      </select>
    </Campo>
  );
}

/** O cadastro da conta (0085): identificacao e as configuracoes que o portal usa. */
export function ClienteForm({ valoresIniciais, temLogotipo }: { valoresIniciais: ValoresDoCliente; temLogotipo: boolean }) {
  const [estado, formAction, enviando] = useActionState<EstadoDoFormulario, FormData>(salvarCliente, {});
  const v = estado.valores ?? valoresIniciais;

  return (
    <form action={formAction} className="space-y-5 p-4">
      {estado.erro && (
        <p role="alert" className="rounded-md border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {estado.erro}
        </p>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <Campo id="nome_fantasia" titulo="Nome Fantasia *">
          <input
            id="nome_fantasia"
            name="nome_fantasia"
            required
            maxLength={100}
            defaultValue={v.nomeFantasia}
            className={getInputClasses(false)}
          />
        </Campo>
        <Campo id="razao_social" titulo="Razão Social">
          <input
            id="razao_social"
            name="razao_social"
            maxLength={200}
            defaultValue={v.razaoSocial}
            className={getInputClasses(false)}
          />
        </Campo>
        <Campo id="cnpj" titulo="CNPJ">
          <input
            id="cnpj"
            name="cnpj"
            inputMode="numeric"
            maxLength={18}
            placeholder="00.000.000/0000-00"
            defaultValue={v.cnpj}
            className={getInputClasses(false)}
          />
        </Campo>
        <Campo id="ramo_atividade" titulo="Ramo de Atividade">
          <input
            id="ramo_atividade"
            name="ramo_atividade"
            maxLength={100}
            defaultValue={v.ramoAtividade}
            className={getInputClasses(false)}
          />
        </Campo>
        <Campo id="logotipo" titulo={temLogotipo ? "Logotipo (enviar outro troca o atual)" : "Logotipo"}>
          <input
            id="logotipo"
            name="logotipo"
            type="file"
            accept="image/png,image/jpeg"
            className={`${getInputClasses(false)} file:mr-3 file:rounded file:border-0 file:bg-slate-700 file:px-3 file:py-1 file:text-xs file:text-white`}
          />
        </Campo>
        <Campo id="status" titulo="Status">
          <select id="status" name="status" defaultValue={v.ativo ? "ativo" : "inativo"} className={getInputClasses(false)}>
            <option value="ativo">Ativo</option>
            <option value="inativo">Inativo</option>
          </select>
        </Campo>
      </div>

      <fieldset className="space-y-4 rounded-md border border-slate-800 p-4">
        <legend className="px-1 text-xs font-medium uppercase tracking-wide text-brand-muted">Configurações</legend>
        <div className="grid gap-4 md:grid-cols-2">
          <Campo id="titulo_pdf" titulo="Título do PDF">
            <input
              id="titulo_pdf"
              name="titulo_pdf"
              maxLength={80}
              defaultValue={v.tituloPdf}
              placeholder="Vai na faixa do PDF do checklist, antes do site"
              className={getInputClasses(false)}
            />
          </Campo>
          <SimNao
            id="nome_fantasia_no_remetente"
            titulo="Usar Nome Fantasia no remetente dos e-mails"
            valor={v.nomeFantasiaNoRemetente}
          />
          <SimNao id="legenda_nas_imagens" titulo="Legenda nas Imagens (PDF)" valor={v.legendaNasImagens} />
          <div className="grid grid-cols-2 gap-3">
            <Campo id="min_caracteres_descricao" titulo="Mín. caracteres da análise">
              <input
                id="min_caracteres_descricao"
                name="min_caracteres_descricao"
                inputMode="numeric"
                defaultValue={v.minCaracteresDescricao}
                className={getInputClasses(false)}
              />
            </Campo>
            <Campo id="min_caracteres_acoes" titulo="Mín. caracteres das ações">
              <input
                id="min_caracteres_acoes"
                name="min_caracteres_acoes"
                inputMode="numeric"
                defaultValue={v.minCaracteresAcoes}
                className={getInputClasses(false)}
              />
            </Campo>
          </div>
        </div>
        <p className="text-xs text-brand-muted">
          Os mínimos valem para a análise e para as ações realizadas no Painel de Eventos. Zero: sem mínimo.
        </p>
      </fieldset>

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
