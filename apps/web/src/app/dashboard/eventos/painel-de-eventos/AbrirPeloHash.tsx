"use client";

import { useEffect } from "react";

/**
 * Abre o `<details>` cujo `id` e o da ancora da URL (`#analise`,
 * `#finalizar`) e leva a tela ate ele -- como a secao recolhida do sistema de
 * referencia. Os icones "Analisar" e "Finalizar" do Painel e os botoes do
 * detalhe so apontam para a ancora.
 *
 * Nao renderiza nada.
 */
export function AbrirPeloHash({ ids }: { ids: string[] }) {
  useEffect(() => {
    function abrir() {
      const id = window.location.hash.slice(1);
      if (!ids.includes(id)) return;
      const secao = document.getElementById(id);
      if (secao instanceof HTMLDetailsElement) {
        // Uma de cada vez: abrir a finalizacao fecha a analise.
        for (const outro of ids) {
          const el = document.getElementById(outro);
          if (el instanceof HTMLDetailsElement && outro !== id) el.open = false;
        }
        secao.open = true;
        secao.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    }

    abrir();
    window.addEventListener("hashchange", abrir);
    return () => window.removeEventListener("hashchange", abrir);
  }, [ids]);

  return null;
}
