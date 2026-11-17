"use client";

import { useActionState } from "react";
import { Button } from "@/components/Button";
import { ChevronDownIcon } from "@/components/dashboard/icons";
import { getInputClasses } from "@/components/FormField";
import { salvarVeiculo, type EstadoDoFormulario, type ValoresDoVeiculo } from "./actions";
import type { Opcao } from "./queries";

const LISTAGEM = "/dashboard/cadastros/veiculos";
const rotuloClasses = "mb-1.5 block text-xs font-medium uppercase tracking-wide text-brand-muted";

function Select({
  id,
  options,
  defaultValue,
  vazio,
}: {
  id: string;
  options: Opcao[];
  defaultValue: string;
  vazio?: string;
}) {
  return (
    <div className="relative">
      <select
        id={id}
        name={id}
        defaultValue={defaultValue}
        className={`peer ${getInputClasses(false)} appearance-none pr-9`}
      >
        {vazio !== undefined && <option value="">{vazio}</option>}
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

function Campo({
  id,
  rotulo,
  defaultValue,
  obrigatorio,
  dica,
  erro,
  inputMode,
}: {
  id: string;
  rotulo: string;
  defaultValue: string;
  obrigatorio?: boolean;
  dica?: string;
  erro: boolean;
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
        className={getInputClasses(erro)}
      />
      {dica && <p className="mt-1.5 text-xs text-brand-muted">{dica}</p>}
    </div>
  );
}

const STATUS_OPCOES: Opcao[] = [
  { value: "ativo", label: "Ativo" },
  { value: "inativo", label: "Inativo" },
];

export function VeiculoForm({
  id,
  valoresIniciais,
  usuarios,
}: {
  id?: number;
  valoresIniciais: ValoresDoVeiculo;
  usuarios: Opcao[];
}) {
  const [estado, formAction, enviando] = useActionState<EstadoDoFormulario, FormData>(salvarVeiculo, {});
  const valores = estado.valores ?? valoresIniciais;
  const comErro = Boolean(estado.erro);

  return (
    <form action={formAction} className="space-y-4 p-4">
      {id !== undefined && <input type="hidden" name="id" value={id} />}

      {estado.erro && (
        <p role="alert" className="rounded-md border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {estado.erro}
        </p>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Campo id="placa" rotulo="Placa" defaultValue={valores.placa} obrigatorio dica="ABC-1234 ou ABC-1D23." erro={comErro} />
        <Campo id="modelo" rotulo="Modelo" defaultValue={valores.modelo} obrigatorio erro={comErro} />
        <Campo id="cor" rotulo="Cor" defaultValue={valores.cor} erro={comErro} />
        <Campo id="empresa" rotulo="Empresa" defaultValue={valores.empresa} erro={comErro} />
      </div>

      <div>
        <label htmlFor="usuario_id" className={rotuloClasses}>
          Usuário do veículo
        </label>
        <Select id="usuario_id" options={usuarios} defaultValue={valores.usuarioId} vazio="Nenhum" />
        <p className="mt-1.5 text-xs text-brand-muted">
          Quem usa o veículo no dia a dia. Cada pessoa tem no máximo um veículo ativo.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Campo
          id="km_ultima_revisao"
          rotulo="Km da última revisão"
          defaultValue={valores.kmUltimaRevisao}
          inputMode="numeric"
          dica="Para o veículo que já chega rodado. Depois, a revisão registrada atualiza sozinha."
          erro={comErro}
        />
        <div>
          <label htmlFor="status" className={rotuloClasses}>
            Status
          </label>
          <Select id="status" options={STATUS_OPCOES} defaultValue={valores.ativo ? "ativo" : "inativo"} />
        </div>
      </div>

      <div className="flex justify-end gap-2 border-t border-slate-800 pt-4">
        <Button href={LISTAGEM} variant="secondary">
          Cancelar
        </Button>
        <Button type="submit" loading={enviando}>
          Salvar
        </Button>
      </div>
    </form>
  );
}
