"use client";

import { useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { nomesDosFiltros, registrarEvento, rotaNormalizada } from "@/lib/telemetria";

/**
 * Registra `tela_aberta` a cada navegacao dentro do painel -- inclusive a
 * troca de filtro, que muda a querystring sem mudar a rota. Montado uma vez no
 * layout do dashboard, entao tela nova ja nasce medida sem ninguem lembrar.
 *
 * Mora dentro de um `<Suspense>` no layout: `useSearchParams` suspende no
 * prerender, e sem a fronteira o layout inteiro deixaria de ser estatico.
 *
 * Em `next dev` o Strict Mode roda o efeito duas vezes e o evento sai em
 * dobro; em producao, uma vez por navegacao.
 */
export function RegistroDeTelaAberta() {
  const caminho = usePathname();
  const busca = useSearchParams().toString();

  useEffect(() => {
    registrarEvento("tela_aberta", {
      rota: rotaNormalizada(caminho),
      filtros: nomesDosFiltros(busca),
    });
  }, [caminho, busca]);

  return null;
}
