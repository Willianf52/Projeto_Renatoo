"use client";

import Link from "next/link";
import { useActionState } from "react";
import { ChevronDownIcon } from "@/components/dashboard/icons";
import { getInputClasses } from "@/components/FormField";
import { salvarSite, type EstadoDoFormulario, type ValoresDoSite } from "./actions";
import type { Opcao } from "./queries";

const LISTAGEM = "/dashboard/cadastros/site-planta";

const rotuloClasses = "mb-1.5 block text-xs font-medium uppercase tracking-wide text-brand-muted";

function Campo({
  id,
  rotulo,
  children,
  className = "",
}: {
  id: string;
  rotulo: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <label htmlFor={id} className={rotuloClasses}>
        {rotulo}
      </label>
      {children}
    </div>
  );
}

/**
 * Select do formulario, nao do filtro. `FilterSelect` nao serve aqui: ele usa
 * a primeira opcao como rotulo flutuante (nao ha `<label>` na barra de
 * filtros) e pinta o texto de `brand-muted`. Num formulario o valor escolhido
 * precisa ler como valor preenchido, e o rotulo e um `<label>` de verdade.
 */
function Select({
  id,
  name,
  options,
  defaultValue,
  required,
  vazio,
}: {
  id: string;
  name: string;
  options: Opcao[];
  defaultValue: string;
  required?: boolean;
  vazio: string;
}) {
  return (
    <div className="relative">
      <select
        id={id}
        name={name}
        required={required}
        defaultValue={defaultValue}
        className={`peer ${getInputClasses(false)} appearance-none pr-9`}
      >
        <option value="">{vazio}</option>
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

export function SiteForm({
  id,
  valoresIniciais,
  opcoes,
}: {
  /** Ausente na criacao; presente na edicao. */
  id?: number;
  valoresIniciais: ValoresDoSite;
  opcoes: { gruposSites: Opcao[]; tiposServico: Opcao[]; responsaveis: Opcao[] };
}) {
  const [estado, formAction, enviando] = useActionState<EstadoDoFormulario, FormData>(
    salvarSite,
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

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Campo id="nome" rotulo="Nome" className="sm:col-span-2">
          <input
            id="nome"
            name="nome"
            type="text"
            required
            defaultValue={valores.nome}
            aria-invalid={Boolean(estado.erro)}
            className={getInputClasses(Boolean(estado.erro))}
          />
        </Campo>

        <Campo id="grupo_site_id" rotulo="Grupo de Sites">
          <Select
            id="grupo_site_id"
            name="grupo_site_id"
            required
            options={opcoes.gruposSites}
            defaultValue={valores.grupoSiteId}
            vazio="Selecione..."
          />
        </Campo>

        <Campo id="sigla" rotulo="Sigla">
          <input
            id="sigla"
            name="sigla"
            type="text"
            defaultValue={valores.sigla}
            className={getInputClasses(false)}
          />
        </Campo>

        <Campo id="tipo_servico_id" rotulo="Tipo de Serviço">
          <Select
            id="tipo_servico_id"
            name="tipo_servico_id"
            options={opcoes.tiposServico}
            defaultValue={valores.tipoServicoId}
            vazio="Nenhum"
          />
        </Campo>

        <Campo id="responsavel_id" rotulo="Responsável">
          <Select
            id="responsavel_id"
            name="responsavel_id"
            options={opcoes.responsaveis}
            defaultValue={valores.responsavelId}
            vazio="Nenhum"
          />
        </Campo>

        <Campo id="regional" rotulo="Regional">
          <input
            id="regional"
            name="regional"
            type="text"
            defaultValue={valores.regional}
            className={getInputClasses(false)}
          />
        </Campo>

        <div className="grid grid-cols-3 gap-3">
          <Campo id="cidade" rotulo="Cidade" className="col-span-2">
            <input
              id="cidade"
              name="cidade"
              type="text"
              defaultValue={valores.cidade}
              className={getInputClasses(false)}
            />
          </Campo>

          <Campo id="uf" rotulo="UF">
            <input
              id="uf"
              name="uf"
              type="text"
              maxLength={2}
              defaultValue={valores.uf}
              // `uf` e char(2) no banco: maxLength evita a viagem ao servidor no
              // caso comum, mas quem valida de verdade e a action -- maxLength
              // nao sobrevive a um POST montado a mao.
              className={`${getInputClasses(false)} uppercase`}
            />
          </Campo>
        </div>

        {/* Coordenadas vazias sao validas e querem dizer "ainda nao
            cadastradas" (migration 0003). A action exige as duas juntas: uma
            sozinha nao localiza nada. */}
        <Campo id="latitude" rotulo="Latitude">
          <input
            id="latitude"
            name="latitude"
            type="text"
            inputMode="decimal"
            placeholder="-30.0346"
            defaultValue={valores.latitude}
            className={getInputClasses(false)}
          />
        </Campo>

        <Campo id="longitude" rotulo="Longitude">
          <input
            id="longitude"
            name="longitude"
            type="text"
            inputMode="decimal"
            placeholder="-51.2177"
            defaultValue={valores.longitude}
            className={getInputClasses(false)}
          />
        </Campo>

        <Campo id="observacao" rotulo="Observação" className="sm:col-span-2">
          <textarea
            id="observacao"
            name="observacao"
            rows={3}
            defaultValue={valores.observacao}
            className={`${getInputClasses(false)} resize-y`}
          />
        </Campo>
      </div>

      <div className="flex items-center gap-2">
        <input
          id="ativo"
          name="ativo"
          type="checkbox"
          defaultChecked={valores.ativo}
          className="h-4 w-4 rounded border-slate-700 bg-brand-navy accent-brand-green"
        />
        <label htmlFor="ativo" className="text-sm text-white">
          Ativo
        </label>
      </div>

      <div className="flex items-center gap-3 pt-2">
        <button
          type="submit"
          disabled={enviando}
          className="flex h-10 items-center justify-center rounded-md bg-brand-green px-6 text-sm font-semibold text-brand-navy shadow-sm transition-all duration-200 hover:bg-brand-green-hover hover:shadow-lg hover:shadow-brand-green/30 focus:outline-none focus:ring-2 focus:ring-brand-green active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:shadow-sm disabled:active:scale-100"
        >
          {enviando ? "Salvando..." : "Salvar"}
        </button>
        <Link
          href={LISTAGEM}
          className="flex h-10 items-center justify-center rounded-md border border-slate-800 px-6 text-sm font-medium text-brand-muted transition-colors duration-200 hover:bg-brand-navy hover:text-white"
        >
          Cancelar
        </Link>
      </div>
    </form>
  );
}
