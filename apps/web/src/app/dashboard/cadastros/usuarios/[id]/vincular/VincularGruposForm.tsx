"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/Button";
import { getInputClasses } from "@/components/FormField";
import type { FilterOption } from "../../constantes";
import { vincularGrupos, type EstadoDoVinculo } from "./actions";

const LISTAGEM = "/dashboard/cadastros/usuarios";

/** Busca sem diferenciar maiuscula nem acento: "lote" acha "Lote 1". */
function normalizar(valor: string): string {
  return valor.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

/**
 * Os grupos de sites de um CLIENTE, em caixas de marcar com busca (sao dezenas
 * de grupos). Todas as caixas ficam no formulario, mesmo as escondidas pela
 * busca: o que foi marcado antes de filtrar continua indo no envio.
 */
export function VincularGruposForm({
  usuarioId,
  grupos,
  marcados,
}: {
  usuarioId: string;
  grupos: FilterOption[];
  marcados: string[];
}) {
  const [estado, formAction, enviando] = useActionState<EstadoDoVinculo, FormData>(vincularGrupos, {});
  const [busca, setBusca] = useState("");
  const [selecionados, setSelecionados] = useState<Set<string>>(() => new Set(marcados));
  const termo = normalizar(busca);

  function alternar(valor: string, marcado: boolean) {
    setSelecionados((atual) => {
      const novo = new Set(atual);
      if (marcado) novo.add(valor);
      else novo.delete(valor);
      return novo;
    });
  }

  return (
    <form action={formAction} className="space-y-4 p-4">
      {estado.erro && (
        <p
          role="alert"
          className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-300 animate-slide-down"
        >
          {estado.erro}
        </p>
      )}

      <input type="hidden" name="usuario_id" value={usuarioId} />

      <p className="text-xs text-brand-muted">
        Um cliente só enxerga as coletas, os sites e os checkpoints dos grupos marcados aqui. Sem nenhum
        marcado, não vê nada.
      </p>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <input
          type="search"
          aria-label="Buscar grupo de sites"
          placeholder="Buscar grupo de sites..."
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          className={`${getInputClasses(false)} max-w-xs`}
        />
        <span className="text-xs font-semibold text-white">
          {selecionados.size} de {grupos.length} selecionados
        </span>
      </div>

      {grupos.length === 0 ? (
        <p className="text-sm text-brand-muted">
          Nenhum grupo de sites cadastrado ainda. Cadastre um em Cadastros → Grupo de Sites.
        </p>
      ) : (
        <div className="max-h-96 overflow-y-auto rounded-md border border-slate-800 p-3">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {grupos.map((grupo) => (
              <label
                key={grupo.value}
                htmlFor={`grupo-${grupo.value}`}
                hidden={termo !== "" && !normalizar(grupo.label).includes(termo)}
                className="flex items-center gap-2 text-sm text-white"
              >
                <input
                  id={`grupo-${grupo.value}`}
                  type="checkbox"
                  name="grupos_do_cliente"
                  value={grupo.value}
                  checked={selecionados.has(grupo.value)}
                  onChange={(e) => alternar(grupo.value, e.target.checked)}
                  className="h-4 w-4 rounded border-slate-700 bg-brand-navy accent-brand-green"
                />
                {grupo.label}
              </label>
            ))}
          </div>
        </div>
      )}

      <div className="flex items-center gap-3 pt-2">
        <Button type="submit" loading={enviando} disabled={enviando}>
          {enviando ? "Salvando..." : "Salvar"}
        </Button>
        <Button href={LISTAGEM} variant="secondary" disabled={enviando}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}
