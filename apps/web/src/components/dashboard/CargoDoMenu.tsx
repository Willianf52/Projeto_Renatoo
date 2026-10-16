"use client";

import { createContext, useContext, useEffect } from "react";

/**
 * Por onde o cargo chega ao menu lateral sem uma leitura a mais.
 *
 * O layout do painel e sincrono de proposito (prerender), e o menu e
 * componente do navegador: nenhum dos dois sabe o cargo. Quem sabe e a
 * saudacao "Ola, fulano" (`IdentidadeDoUsuario.tsx`), que ja le o perfil no
 * servidor atras de um <Suspense>. Ela renderiza `InformarCargoDoMenu`, que
 * entrega o cargo para a `DashboardSidebar` por este contexto.
 *
 * Ate o cargo chegar, o menu sai sem os itens de GESTOR: o padrao e o lado
 * fechado. E so vitrine -- o portao de cada tela de GESTOR e o `SomenteGestor`
 * no servidor.
 */
export const DefinirCargoDoMenu = createContext<(ehGestor: boolean) => void>(() => {});

export function InformarCargoDoMenu({ ehGestor }: { ehGestor: boolean }) {
  const definir = useContext(DefinirCargoDoMenu);
  useEffect(() => {
    definir(ehGestor);
  }, [definir, ehGestor]);
  return null;
}
