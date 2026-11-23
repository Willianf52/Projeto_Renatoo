"use client";

import { useActionState, useEffect, useRef } from "react";
import { Button } from "@/components/Button";
import { FilterDatePicker } from "@/components/dashboard/FilterDatePicker";
import { ChevronDownIcon } from "@/components/dashboard/icons";
import { getInputClasses } from "@/components/FormField";
import { registrarKm, registrarManutencao, type EstadoDoRegistro } from "./actions";
import { TIPOS_DE_MANUTENCAO } from "./regras";

const rotuloClasses = "mb-1.5 block text-xs font-medium uppercase tracking-wide text-brand-muted";

/** A mensagem da gravacao, embaixo do formulario. */
function Retorno({ estado }: { estado: EstadoDoRegistro }) {
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

/** Limpa o formulario depois de gravar, para o proximo registro comecar vazio. */
function useLimparAoGravar(estado: EstadoDoRegistro) {
  const formulario = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (estado.ok) formulario.current?.reset();
  }, [estado]);
  return formulario;
}

export function FormularioDeKm({ veiculoId }: { veiculoId: number }) {
  const [estado, acao, enviando] = useActionState<EstadoDoRegistro, FormData>(registrarKm, {});
  const formulario = useLimparAoGravar(estado);

  return (
    <form ref={formulario} action={acao} className="space-y-3 p-4">
      <input type="hidden" name="veiculo_id" value={veiculoId} />
      <div>
        <label htmlFor="km" className={rotuloClasses}>
          Km do painel <span className="text-red-400">*</span>
        </label>
        <input id="km" name="km" type="text" inputMode="numeric" required className={getInputClasses(Boolean(estado.erro))} />
      </div>
      <Retorno estado={estado} />
      <div className="flex justify-end">
        <Button type="submit" loading={enviando}>
          Registrar km
        </Button>
      </div>
    </form>
  );
}

function hojeEmSaoPaulo(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
}

export function FormularioDeManutencao({ veiculoId }: { veiculoId: number }) {
  const [estado, acao, enviando] = useActionState<EstadoDoRegistro, FormData>(registrarManutencao, {});
  const formulario = useLimparAoGravar(estado);

  return (
    <form ref={formulario} action={acao} className="space-y-3 p-4">
      <input type="hidden" name="veiculo_id" value={veiculoId} />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div>
          <label htmlFor="tipo" className={rotuloClasses}>
            Tipo <span className="text-red-400">*</span>
          </label>
          <div className="relative">
            <select id="tipo" name="tipo" required defaultValue="" className={`peer ${getInputClasses(false)} appearance-none pr-9`}>
              <option value="">Escolha</option>
              {TIPOS_DE_MANUTENCAO.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
            <ChevronDownIcon className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-brand-muted" />
          </div>
        </div>
        <div>
          <span className={rotuloClasses}>
            Data <span className="text-red-400">*</span>
          </span>
          <FilterDatePicker label="Data da manutenção" name="data" defaultValue={hojeEmSaoPaulo()} />
        </div>
        <div>
          <label htmlFor="km_manutencao" className={rotuloClasses}>
            Km
          </label>
          <input id="km_manutencao" name="km" type="text" inputMode="numeric" className={getInputClasses(false)} />
        </div>
      </div>
      <div>
        <label htmlFor="descricao" className={rotuloClasses}>
          O que foi feito
        </label>
        <textarea id="descricao" name="descricao" rows={3} maxLength={1000} className={getInputClasses(false)} />
      </div>
      <p className="text-xs text-brand-muted">Na revisão, informe o km: a próxima é contada a partir dele.</p>
      <Retorno estado={estado} />
      <div className="flex justify-end">
        <Button type="submit" loading={enviando}>
          Registrar manutenção
        </Button>
      </div>
    </form>
  );
}
