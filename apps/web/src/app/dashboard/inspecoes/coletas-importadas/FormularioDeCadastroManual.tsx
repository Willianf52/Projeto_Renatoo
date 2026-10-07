"use client";

import { useActionState, useEffect, useState } from "react";
import { Button } from "@/components/Button";
import { FilterDatePicker } from "@/components/dashboard/FilterDatePicker";
import { FilterInput, FilterSelect } from "@/components/dashboard/FilterField";
import { FilterTimePicker } from "@/components/dashboard/FilterTimePicker";
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

/** Id do bloco que o botao "+" do cabecalho abre e fecha (`aria-controls`). */
export const ID_DO_CADASTRO_MANUAL = "cadastro-manual-de-coleta";

/** Sinal entre o botao "+" e o formulario: estao em fronteiras de Suspense
 * diferentes (o cabecalho e a faixa de baixo), sem um pai cliente em comum. */
export const EVENTO_ALTERNAR_CADASTRO = "alternar-cadastro-manual";

/**
 * Cadastro manual de coletas, como o do sistema antigo: os mesmos campos, na
 * mesma ordem, e a quantidade de coletas iguais a cadastrar de uma vez.
 * Fechado por padrao e aberto pelo botao "+" do cabecalho, como la (o
 * `btn_create` que mostra o `#addForm`). So aparece para GESTOR (ver
 * `page.tsx`). Uma recusa da action mantem o bloco aberto: so da para enviar
 * com ele aberto, e o estado de `aberto` nao muda na resposta.
 */
export function FormularioDeCadastroManual({ opcoes }: { opcoes: OpcoesDoCadastro }) {
  const [estado, formAction, enviando] = useActionState<EstadoDoCadastro, FormData>(cadastrarColetas, {});
  const valores = estado.valores ?? {};
  const [aberto, setAberto] = useState(false);

  useEffect(() => {
    const alternar = () => setAberto((atual) => !atual);
    window.addEventListener(EVENTO_ALTERNAR_CADASTRO, alternar);
    return () => window.removeEventListener(EVENTO_ALTERNAR_CADASTRO, alternar);
  }, []);

  return (
    <section
      id={ID_DO_CADASTRO_MANUAL}
      aria-label="Cadastrar coleta manual"
      hidden={!aberto}
      className="border-b border-slate-800"
    >
      <h2 className="px-4 pt-3 text-sm font-semibold text-white">Cadastrar coleta manual</h2>

      <form action={formAction} className="space-y-3 p-4">
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
    </section>
  );
}
