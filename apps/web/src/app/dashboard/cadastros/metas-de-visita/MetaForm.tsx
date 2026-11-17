"use client";

import { useActionState } from "react";
import { Button } from "@/components/Button";
import { ChevronDownIcon } from "@/components/dashboard/icons";
import { getInputClasses } from "@/components/FormField";
import { salvarMeta, type EstadoDaMeta } from "./actions";
import { PERIODOS } from "./periodos";
import type { Opcao } from "./queries";

const rotuloClasses = "mb-1.5 block text-xs font-medium uppercase tracking-wide text-brand-muted";

function Select({
  id,
  rotulo,
  opcoes,
  inicial = "",
}: {
  id: string;
  rotulo: string;
  opcoes: readonly Opcao[];
  inicial?: string;
}) {
  return (
    <div>
      <label htmlFor={id} className={rotuloClasses}>
        {rotulo} <span className="text-red-400">*</span>
      </label>
      <div className="relative">
        <select id={id} name={id} required defaultValue={inicial} className={`peer ${getInputClasses(false)} appearance-none pr-9`}>
          {inicial === "" && <option value="">Escolha</option>}
          {opcoes.map((o) => (
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

/** Nova meta (ou troca da meta de quem ja tem uma no mesmo lugar e periodo). */
export function MetaForm({ usuarios, sites }: { usuarios: Opcao[]; sites: Opcao[] }) {
  const [estado, acao, enviando] = useActionState<EstadoDaMeta, FormData>(salvarMeta, {});

  return (
    <form action={acao} className="space-y-3 p-4">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_1fr_10rem_9rem_auto] md:items-end">
        <Select id="usuario_id" rotulo="Pessoa" opcoes={usuarios} />
        <Select id="site_id" rotulo="Lugar" opcoes={sites} />
        <Select id="periodo" rotulo="Período" opcoes={PERIODOS} inicial="SEMANAL" />
        <div>
          <label htmlFor="quantidade" className={rotuloClasses}>
            Visitas <span className="text-red-400">*</span>
          </label>
          <input
            id="quantidade"
            name="quantidade"
            type="number"
            min={1}
            max={200}
            required
            defaultValue={4}
            className={getInputClasses(Boolean(estado.erro))}
          />
        </div>
        <Button type="submit" loading={enviando}>
          Salvar meta
        </Button>
      </div>
      {estado.erro ? (
        <p role="alert" className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300">
          {estado.erro}
        </p>
      ) : null}
      {estado.ok ? (
        <p role="status" className="rounded-md border border-brand-green/40 bg-brand-green/10 px-3 py-2 text-sm text-brand-green">
          {estado.ok}
        </p>
      ) : null}
      <p className="text-xs text-brand-muted">
        Salvar a mesma pessoa, lugar e período troca a meta. Conta qualquer checklist que a pessoa enviar no lugar
        dentro do período: o dia, a semana (segunda a domingo), a quinzena (1 a 15 e 16 ao fim do mês) ou o mês.
        Quem está abaixo recebe um aviso perto do fim: no diário às 14h, no semanal na sexta, no quinzenal dois
        dias antes e no mensal três dias antes do fim.
      </p>
    </form>
  );
}
