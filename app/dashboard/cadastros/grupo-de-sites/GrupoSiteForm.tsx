"use client";

import Link from "next/link";
import { useActionState } from "react";
import { getInputClasses } from "@/components/FormField";
import { salvarGrupoSite, type EstadoDoFormulario, type ValoresDoGrupo } from "./actions";

const LISTAGEM = "/dashboard/cadastros/grupo-de-sites";

const rotuloClasses = "mb-1.5 block text-xs font-medium uppercase tracking-wide text-brand-muted";

export function GrupoSiteForm({
  id,
  valoresIniciais,
}: {
  /** Ausente na criacao; presente na edicao. */
  id?: number;
  valoresIniciais: ValoresDoGrupo;
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
        <label htmlFor="nome" className={rotuloClasses}>
          Nome
        </label>
        <input
          id="nome"
          name="nome"
          type="text"
          required
          defaultValue={valores.nome}
          aria-invalid={Boolean(estado.erro)}
          className={getInputClasses(Boolean(estado.erro))}
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
