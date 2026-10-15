"use client";

import { useActionState } from "react";
import { Button } from "@/components/Button";
import { ChevronDownIcon } from "@/components/dashboard/icons";
import { getInputClasses } from "@/components/FormField";
import {
  salvarTipoDeAnalise,
  salvarTipoDeClassificacao,
  type EstadoDoFormulario,
  type ValoresDoTipo,
} from "./actions";
import { CADASTROS, type TipoDeCadastro } from "./config";

const rotuloClasses = "mb-1.5 block text-xs font-medium uppercase tracking-wide text-brand-muted";

export function TipoForm({
  tipo,
  id,
  valoresIniciais,
}: {
  tipo: TipoDeCadastro;
  /** Ausente na criacao; presente na edicao. */
  id?: number;
  valoresIniciais: ValoresDoTipo;
}) {
  const acao = tipo === "analise" ? salvarTipoDeAnalise : salvarTipoDeClassificacao;
  const [estado, formAction, enviando] = useActionState<EstadoDoFormulario, FormData>(acao, {});
  const valores = estado.valores ?? valoresIniciais;

  return (
    <form action={formAction} className="space-y-4 p-4">
      {id !== undefined && <input type="hidden" name="id" value={id} />}

      {estado.erro && (
        <p role="alert" className="rounded-md border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {estado.erro}
        </p>
      )}

      <div>
        <label htmlFor="nome" className={rotuloClasses}>
          Nome<span className="text-red-400"> *</span>
        </label>
        <input
          id="nome"
          name="nome"
          type="text"
          required
          maxLength={100}
          defaultValue={valores.nome}
          aria-invalid={Boolean(estado.erro)}
          className={getInputClasses(Boolean(estado.erro))}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="cor" className={rotuloClasses}>
            Cor
          </label>
          {/* Seletor nativo de cor: sempre tem valor, entao o tipo salvo pelo
              formulario sempre ganha cor (os da 0064 ficam sem ate alguem
              editar). */}
          <input
            id="cor"
            name="cor"
            type="color"
            defaultValue={valores.cor}
            className="h-11 w-full cursor-pointer rounded-md border border-slate-700 bg-brand-navy p-1"
          />
        </div>

        <div>
          <label htmlFor="status" className={rotuloClasses}>
            Status
          </label>
          <div className="relative">
            <select
              id="status"
              name="status"
              defaultValue={valores.ativo ? "ativo" : "inativo"}
              className={`${getInputClasses(false)} appearance-none pr-9`}
            >
              <option value="ativo">Ativo</option>
              <option value="inativo">Inativo</option>
            </select>
            <ChevronDownIcon className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-brand-muted" />
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3 pt-2">
        <Button type="submit" loading={enviando} disabled={enviando}>
          {enviando ? "Salvando..." : "Salvar"}
        </Button>
        <Button href={CADASTROS[tipo].rota} variant="secondary" disabled={enviando}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}
