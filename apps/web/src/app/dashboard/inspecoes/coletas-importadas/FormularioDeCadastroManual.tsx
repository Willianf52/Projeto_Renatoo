"use client";

import { useActionState } from "react";
import { Button } from "@/components/Button";
import { FilterDatePicker } from "@/components/dashboard/FilterDatePicker";
import { FilterInput, FilterSelect } from "@/components/dashboard/FilterField";
import { FilterTimePicker } from "@/components/dashboard/FilterTimePicker";
import { PlusCircleIcon } from "@/components/dashboard/icons";
import { cadastrarColetas, type EstadoDoCadastro } from "./actions";
import { MAXIMO_DE_COLETAS } from "./cadastro-manual";

type Opcao = { value: string; label: string };

export type OpcoesDoCadastro = {
  coletoresDados: Opcao[];
  funcionarios: Opcao[];
  locais: Opcao[];
  areas: Opcao[];
  eventos: Opcao[];
  acoes: Opcao[];
  qualificadores: Opcao[];
};

/**
 * Cadastro manual de coletas, como o do sistema antigo: os mesmos campos, na
 * mesma ordem, e a quantidade de coletas iguais a cadastrar de uma vez.
 * Recolhido por padrao (`<details>`), para nao empurrar os filtros -- o uso
 * de todo dia da tela -- para baixo. So aparece para GESTOR (ver `page.tsx`).
 */
export function FormularioDeCadastroManual({ opcoes }: { opcoes: OpcoesDoCadastro }) {
  const [estado, formAction, enviando] = useActionState<EstadoDoCadastro, FormData>(cadastrarColetas, {});
  const valores = estado.valores ?? {};

  return (
    <details className="group border-b border-slate-800" open={Boolean(estado.erro)}>
      <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-sm font-semibold text-white hover:bg-white/5 [&::-webkit-details-marker]:hidden">
        <PlusCircleIcon className="h-4 w-4 transition-transform duration-200 group-open:rotate-45" />
        Cadastrar coleta manual
      </summary>

      <form action={formAction} className="space-y-3 px-4 pb-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5">
          <FilterDatePicker label="Data" name="data" defaultValue={valores.data} />
          <FilterTimePicker label="Hora" name="hora" defaultValue={valores.hora} />
          <FilterSelect
            label="Coletor de Dados"
            name="coletor_dados_id"
            defaultValue={valores.coletor_dados_id}
            options={opcoes.coletoresDados}
          />
          <FilterSelect
            label="Funcionário"
            name="funcionario_id"
            defaultValue={valores.funcionario_id}
            options={opcoes.funcionarios}
          />
          <FilterSelect label="Local" name="site_id" defaultValue={valores.site_id} options={opcoes.locais} />
          <FilterSelect label="Área" name="area_id" defaultValue={valores.area_id} options={opcoes.areas} />
          <FilterSelect label="Evento" name="evento_id" defaultValue={valores.evento_id} options={opcoes.eventos} />
          <FilterSelect label="Ação" name="acao_id" defaultValue={valores.acao_id} options={opcoes.acoes} />
          <FilterSelect
            label="Qualificador"
            name="qualificador_id"
            defaultValue={valores.qualificador_id}
            options={opcoes.qualificadores}
          />
          <FilterInput
            label={`Quantidade de coletas (1 a ${MAXIMO_DE_COLETAS})`}
            name="quantidade"
            defaultValue={valores.quantidade}
          />
        </div>

        <p className="text-xs text-brand-muted">
          Data, hora, funcionário, local e quantidade são obrigatórios. A data precisa estar nos últimos 30 dias, e
          cada coleta entra com &quot;Cadastro manual&quot; na Observação.
        </p>

        {estado.erro && (
          <p role="alert" className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300">
            {estado.erro}
          </p>
        )}

        <Button type="submit" loading={enviando}>
          Salvar
        </Button>
      </form>
    </details>
  );
}
