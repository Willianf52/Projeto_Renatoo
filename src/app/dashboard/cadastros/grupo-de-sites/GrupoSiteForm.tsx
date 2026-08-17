"use client";

import { useActionState } from "react";
import { Button } from "@/components/Button";
import { ChevronDownIcon } from "@/components/dashboard/icons";
import { getInputClasses } from "@/components/FormField";
import { salvarGrupoSite, type EstadoDoFormulario, type ValoresDoGrupo } from "./actions";
import { SitesMultiSelect } from "./SitesMultiSelect";
import type { Opcao, SiteParaSelecao } from "./queries";

const LISTAGEM = "/dashboard/cadastros/grupo-de-sites";

const rotuloClasses = "mb-1.5 block text-xs font-medium uppercase tracking-wide text-brand-muted";

function Rotulo({ children, obrigatorio }: { children: React.ReactNode; obrigatorio?: boolean }) {
  return (
    <span className={rotuloClasses}>
      {children}
      {obrigatorio && <span className="text-red-400"> *</span>}
    </span>
  );
}

/**
 * Select do formulario. `comVazio=false` tira a opcao em branco -- usado em
 * "Status", cuja coluna e boolean `not null`: nao ha estado "nenhum" legitimo
 * para oferecer.
 */
function Select({
  id,
  name,
  options,
  defaultValue,
  vazio,
  disabled,
  comVazio = true,
}: {
  id: string;
  name: string;
  options: Opcao[];
  defaultValue: string;
  vazio: string;
  disabled?: boolean;
  comVazio?: boolean;
}) {
  return (
    <div className="relative">
      <select
        id={id}
        name={name}
        disabled={disabled}
        defaultValue={defaultValue}
        className={`peer ${getInputClasses(false)} appearance-none pr-9 disabled:cursor-not-allowed disabled:opacity-50`}
      >
        {comVazio && <option value="">{vazio}</option>}
        {options.map((opcao) => (
          <option key={opcao.value} value={opcao.value}>
            {opcao.label}
          </option>
        ))}
      </select>
      <ChevronDownIcon className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-brand-muted transition-transform duration-200 peer-focus:rotate-180" />
    </div>
  );
}

const STATUS_OPCOES: Opcao[] = [
  { value: "ativo", label: "Ativo" },
  { value: "inativo", label: "Inativo" },
];

export function GrupoSiteForm({
  id,
  valoresIniciais,
  gruposPai,
  sites,
}: {
  /** Ausente na criacao; presente na edicao. */
  id?: number;
  valoresIniciais: ValoresDoGrupo;
  /** Migration 0024 -- ja vem sem o proprio grupo em edicao. */
  gruposPai: Opcao[];
  sites: SiteParaSelecao[];
}) {
  const [estado, formAction, enviando] = useActionState<EstadoDoFormulario, FormData>(
    salvarGrupoSite,
    {},
  );

  // Depois de uma recusa, o formulario volta com o que a pessoa tinha digitado,
  // e nao com o valor original do banco.
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
        <label htmlFor="grupo_pai_id" className={rotuloClasses}>
          Grupo de Site Pai
        </label>
        <Select
          id="grupo_pai_id"
          name="grupo_pai_id"
          options={gruposPai}
          defaultValue={valores.grupoPaiId}
          vazio="Raiz"
        />
      </div>

      <div>
        <label htmlFor="nome" className={rotuloClasses}>
          Nome
          <span className="text-red-400"> *</span>
        </label>
        <input
          id="nome"
          name="nome"
          type="text"
          required
          defaultValue={valores.nome}
          className={getInputClasses(Boolean(estado.erro))}
        />
      </div>

      <div>
        <Rotulo obrigatorio>Sites</Rotulo>
        <SitesMultiSelect sites={sites} selecionados={valores.siteIds.map(Number)} />
      </div>

      <div>
        <label htmlFor="grupo_inspecao" className={rotuloClasses}>
          Grupo de Inspeção
        </label>
        <Select
          id="grupo_inspecao"
          name="grupo_inspecao"
          options={[]}
          defaultValue=""
          vazio="Nenhum grupo de inspeção cadastrado"
          disabled
        />
      </div>

      <div>
        <label htmlFor="descricao" className={rotuloClasses}>
          Descrição
        </label>
        <textarea
          id="descricao"
          name="descricao"
          rows={3}
          defaultValue={valores.descricao}
          className={`${getInputClasses(false)} resize-y`}
        />
      </div>

      <div>
        <label htmlFor="status" className={rotuloClasses}>
          Status
        </label>
        <Select
          id="status"
          name="status"
          options={STATUS_OPCOES}
          defaultValue={valores.ativo ? "ativo" : "inativo"}
          vazio="Selecione"
          comVazio={false}
        />
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
