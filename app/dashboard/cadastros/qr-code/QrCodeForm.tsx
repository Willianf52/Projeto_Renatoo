"use client";

import Link from "next/link";
import { useActionState } from "react";
import { ChevronDownIcon } from "@/components/dashboard/icons";
import { getInputClasses } from "@/components/FormField";
import { salvarQrCode, type EstadoDoFormulario, type ValoresDoQrCode } from "./actions";
import type { Opcao } from "./queries";

const LISTAGEM = "/dashboard/cadastros/qr-code";

const rotuloClasses = "mb-1.5 block text-xs font-medium uppercase tracking-wide text-brand-muted";

export function QrCodeForm({
  id,
  valoresIniciais,
  sites,
}: {
  /** Ausente na criacao; presente na edicao. */
  id?: number;
  valoresIniciais: ValoresDoQrCode;
  sites: Opcao[];
}) {
  const [estado, formAction, enviando] = useActionState<EstadoDoFormulario, FormData>(
    salvarQrCode,
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
        <div>
          <label htmlFor="codigo" className={rotuloClasses}>
            Código
          </label>
          <input
            id="codigo"
            name="codigo"
            type="text"
            required
            defaultValue={valores.codigo}
            aria-describedby="codigo-ajuda"
            aria-invalid={Boolean(estado.erro)}
            className={getInputClasses(Boolean(estado.erro))}
          />
          {/* O código é lido de uma etiqueta e depois casado por texto na
              importação: espaço no meio produz um cadastro que parece certo e
              nunca casa com o lote. A action recusa; o aviso evita a viagem. */}
          <p id="codigo-ajuda" className="mt-1.5 text-xs text-brand-muted">
            Letras, números, ponto, hífen e sublinhado. Sem espaços.
          </p>
        </div>

        <div>
          <label htmlFor="site_id" className={rotuloClasses}>
            Site / Planta
          </label>
          <div className="relative">
            <select
              id="site_id"
              name="site_id"
              required
              defaultValue={valores.siteId}
              className={`peer ${getInputClasses(false)} appearance-none pr-9`}
            >
              <option value="">Selecione...</option>
              {sites.map((site) => (
                <option key={site.value} value={site.value}>
                  {site.label}
                </option>
              ))}
            </select>
            <ChevronDownIcon className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-brand-muted transition-transform duration-200 peer-focus:rotate-180" />
          </div>
        </div>

        <div className="sm:col-span-2">
          <label htmlFor="finalidade" className={rotuloClasses}>
            Finalidade
          </label>
          <input
            id="finalidade"
            name="finalidade"
            type="text"
            placeholder="Ex: Entrada principal"
            defaultValue={valores.finalidade}
            className={getInputClasses(false)}
          />
        </div>
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
