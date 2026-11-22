"use client";

import { useActionState, useEffect, useRef } from "react";
import { Button } from "@/components/Button";
import { FilterDatePicker } from "@/components/dashboard/FilterDatePicker";
import { ChevronDownIcon } from "@/components/dashboard/icons";
import { getInputClasses } from "@/components/FormField";
import {
  adicionarItem,
  registrarManutencaoDeMaquina,
  salvarMaquina,
  type EstadoDoFormulario,
  type EstadoDoRegistro,
  type ValoresDaMaquina,
} from "./actions";
import type { Opcao } from "./queries";
import { TIPOS_DE_ITEM, TIPOS_DE_MANUTENCAO_DE_MAQUINA } from "./regras";

/**
 * Os formularios das maquinas e dos acessorios e produtos (0111): o cadastro
 * da maquina, a manutencao (qualquer pessoa que enxergue o site) e o item da
 * lista do site.
 */

const rotuloClasses = "mb-1.5 block text-xs font-medium uppercase tracking-wide text-brand-muted";

function Select({
  id,
  rotulo,
  options,
  defaultValue = "",
  vazio,
  obrigatorio,
}: {
  id: string;
  rotulo: string;
  options: readonly Opcao[];
  defaultValue?: string;
  vazio?: string;
  obrigatorio?: boolean;
}) {
  return (
    <div>
      <label htmlFor={id} className={rotuloClasses}>
        {rotulo}
        {obrigatorio && <span className="text-red-400"> *</span>}
      </label>
      <div className="relative">
        <select
          id={id}
          name={id}
          required={obrigatorio}
          defaultValue={defaultValue}
          className={`peer ${getInputClasses(false)} appearance-none pr-9`}
        >
          {vazio !== undefined && <option value="">{vazio}</option>}
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <ChevronDownIcon className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-brand-muted" />
      </div>
    </div>
  );
}

function Texto({
  id,
  rotulo,
  defaultValue = "",
  obrigatorio,
  erro,
  inputMode,
}: {
  id: string;
  rotulo: string;
  defaultValue?: string;
  obrigatorio?: boolean;
  erro?: boolean;
  inputMode?: "numeric";
}) {
  return (
    <div>
      <label htmlFor={id} className={rotuloClasses}>
        {rotulo}
        {obrigatorio && <span className="text-red-400"> *</span>}
      </label>
      <input
        id={id}
        name={id}
        type="text"
        required={obrigatorio}
        inputMode={inputMode}
        defaultValue={defaultValue}
        className={getInputClasses(Boolean(erro))}
      />
    </div>
  );
}

function Retorno({ estado }: { estado: { erro?: string; ok?: string } }) {
  if (estado.erro) {
    return (
      <p role="alert" className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300">
        {estado.erro}
      </p>
    );
  }
  if (estado.ok) {
    return (
      <p role="status" className="rounded-md border border-brand-green/40 bg-brand-green/10 px-3 py-2 text-sm text-brand-green">
        {estado.ok}
      </p>
    );
  }
  return null;
}

function hojeEmSaoPaulo(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
}

const STATUS_OPCOES: Opcao[] = [
  { value: "ativo", label: "Ativo" },
  { value: "inativo", label: "Inativo" },
];

export function MaquinaForm({
  id,
  valoresIniciais,
  sites,
}: {
  id?: number;
  valoresIniciais: ValoresDaMaquina;
  sites: Opcao[];
}) {
  const [estado, acao, enviando] = useActionState<EstadoDoFormulario, FormData>(salvarMaquina, {});
  const valores = estado.valores ?? valoresIniciais;

  return (
    <form action={acao} className="space-y-4 p-4">
      {id !== undefined && <input type="hidden" name="id" value={id} />}
      <Retorno estado={estado} />
      <Select id="site_id" rotulo="Site" options={sites} defaultValue={valores.siteId} vazio="Escolha o site" obrigatorio />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Texto id="modelo" rotulo="Modelo" defaultValue={valores.modelo} obrigatorio erro={Boolean(estado.erro)} />
        <Texto id="patrimonio" rotulo="Ativo (patrimônio)" defaultValue={valores.patrimonio} erro={Boolean(estado.erro)} />
      </div>
      <div>
        <label htmlFor="descricao" className={rotuloClasses}>
          Descrição
        </label>
        <textarea id="descricao" name="descricao" rows={3} maxLength={500} defaultValue={valores.descricao} className={getInputClasses(false)} />
      </div>
      <Select id="status" rotulo="Status" options={STATUS_OPCOES} defaultValue={valores.ativo ? "ativo" : "inativo"} />
      <div className="flex justify-end gap-2 border-t border-slate-800 pt-4">
        <Button href="/dashboard/cadastros/maquinas" variant="secondary">
          Cancelar
        </Button>
        <Button type="submit" loading={enviando}>
          Salvar
        </Button>
      </div>
    </form>
  );
}

/** Limpa o formulario depois de gravar, para o proximo registro comecar vazio. */
function useLimparAoGravar(estado: EstadoDoRegistro) {
  const formulario = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (estado.ok) formulario.current?.reset();
  }, [estado]);
  return formulario;
}

export function FormularioDeManutencao({ maquinaId }: { maquinaId: number }) {
  const [estado, acao, enviando] = useActionState<EstadoDoRegistro, FormData>(registrarManutencaoDeMaquina, {});
  const formulario = useLimparAoGravar(estado);

  return (
    <form ref={formulario} action={acao} className="space-y-3 p-4">
      <input type="hidden" name="maquina_id" value={maquinaId} />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Select id="tipo" rotulo="Tipo" options={TIPOS_DE_MANUTENCAO_DE_MAQUINA} vazio="Escolha" obrigatorio />
        <div>
          <span className={rotuloClasses}>
            Data <span className="text-red-400">*</span>
          </span>
          <FilterDatePicker label="Data da manutenção" name="data" defaultValue={hojeEmSaoPaulo()} />
        </div>
      </div>
      <div>
        <label htmlFor="descricao" className={rotuloClasses}>
          O que foi feito
        </label>
        <textarea id="descricao" name="descricao" rows={3} maxLength={1000} className={getInputClasses(false)} />
      </div>
      <Retorno estado={estado} />
      <div className="flex justify-end">
        <Button type="submit" loading={enviando}>
          Registrar manutenção
        </Button>
      </div>
    </form>
  );
}

export function FormularioDeItem({ siteId }: { siteId: number }) {
  const [estado, acao, enviando] = useActionState<EstadoDoRegistro, FormData>(adicionarItem, {});
  const formulario = useLimparAoGravar(estado);

  return (
    <form ref={formulario} action={acao} className="space-y-3 p-4">
      <input type="hidden" name="site_id" value={siteId} />
      <div className="grid grid-cols-1 gap-3 md:grid-cols-[10rem_1fr_8rem_1fr_auto] md:items-end">
        <Select id="tipo" rotulo="Tipo" options={TIPOS_DE_ITEM} defaultValue="ACESSORIO" obrigatorio />
        <Texto id="nome" rotulo="Nome" obrigatorio erro={Boolean(estado.erro)} />
        <Texto id="quantidade" rotulo="Quantidade" defaultValue="1" inputMode="numeric" />
        <Texto id="observacao" rotulo="Observação" />
        <Button type="submit" loading={enviando}>
          Adicionar
        </Button>
      </div>
      <Retorno estado={estado} />
    </form>
  );
}
