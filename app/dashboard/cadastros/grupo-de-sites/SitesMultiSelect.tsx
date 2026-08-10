"use client";

import { useState } from "react";
import type { SiteParaSelecao } from "./queries";

/**
 * Multi-selecao de sites do formulario de Grupo de Sites, com os dois
 * comportamentos do sistema de referencia: marcar um site pai marca os
 * filhos junto (quando o toggle "Seleciona filhos" esta ligado), e
 * "Selecionar Tudo" marca ou desmarca a lista inteira.
 *
 * Uma lista de checkboxes rolavel, e nao um `<select multiple>`: o nativo nao
 * tem como oferecer os dois comportamentos acima sem reconstruir a interacao
 * do zero, e um checkbox por linha e acessivel por teclado de graca.
 *
 * O estado marcado vive aqui (client), mas quem le no envio e o servidor --
 * cada checkbox marcado manda `site_ids` no FormData, e a action revalida
 * tudo de novo. Este componente so decide o que aparece marcado na tela.
 */
export function SitesMultiSelect({
  sites,
  selecionados,
}: {
  sites: SiteParaSelecao[];
  /** Ids ja pertencentes a este grupo (edicao) ou vazio (criacao). */
  selecionados: number[];
}) {
  const [marcados, setMarcados] = useState<Set<number>>(() => new Set(selecionados));
  const [comFilhos, setComFilhos] = useState(true);

  function descendentes(id: number): number[] {
    const filhos = sites.filter((s) => s.paiId === id).map((s) => s.id);
    return filhos.flatMap((filhoId) => [filhoId, ...descendentes(filhoId)]);
  }

  function alternar(id: number, marcar: boolean) {
    setMarcados((atual) => {
      const novo = new Set(atual);
      const alvos = marcar && comFilhos ? [id, ...descendentes(id)] : [id];
      for (const alvo of alvos) {
        if (marcar) novo.add(alvo);
        else novo.delete(alvo);
      }
      return novo;
    });
  }

  function selecionarTudo(marcar: boolean) {
    setMarcados(marcar ? new Set(sites.map((s) => s.id)) : new Set());
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 pb-2">
        <label className="flex items-center gap-2 text-sm text-white">
          <input
            type="checkbox"
            checked={comFilhos}
            onChange={(evento) => setComFilhos(evento.target.checked)}
            className="h-4 w-4 rounded border-slate-700 bg-brand-navy accent-brand-green"
          />
          Seleciona filhos ao selecionar site pai
        </label>
        <label className="flex items-center gap-2 text-sm text-white">
          <input
            type="checkbox"
            checked={sites.length > 0 && marcados.size === sites.length}
            onChange={(evento) => selecionarTudo(evento.target.checked)}
            className="h-4 w-4 rounded border-slate-700 bg-brand-navy accent-brand-green"
          />
          Selecionar Tudo
        </label>
      </div>

      <div className="max-h-60 overflow-y-auto rounded-md border border-slate-800 bg-brand-navy p-2">
        {sites.length === 0 && (
          <p className="px-2 py-1 text-sm text-brand-muted">Nenhum site cadastrado.</p>
        )}
        {sites.map((site) => (
          <label
            key={site.id}
            className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-sm text-white hover:bg-brand-surface"
            style={{ paddingLeft: `${8 + site.profundidade * 16}px` }}
          >
            <input
              type="checkbox"
              name="site_ids"
              value={site.id}
              checked={marcados.has(site.id)}
              onChange={(evento) => alternar(site.id, evento.target.checked)}
              className="h-4 w-4 shrink-0 rounded border-slate-700 bg-brand-navy accent-brand-green"
            />
            {site.nome}
          </label>
        ))}
      </div>
    </div>
  );
}
