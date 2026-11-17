"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { BellIcon } from "./icons";

/**
 * O sino da barra do topo: os avisos da pessoa (0103), como a revisao do
 * veiculo e a meta de visitas. A leitura passa pelo RLS -- cada um so ve os
 * proprios --, entao o componente nao filtra por usuario.
 *
 * Client Component porque abre e fecha, e relê sozinho a cada minuto: o aviso
 * de sexta de manha chega com a pessoa ja logada. Ao abrir, as que estavam na
 * lista viram lidas.
 */

type Notificacao = {
  id: number;
  titulo: string;
  texto: string;
  link: string | null;
  criada_em: string;
  lida_em: string | null;
};

const MAXIMO_NA_LISTA = 20;
const INTERVALO_DE_RELEITURA_MS = 60_000;

const formatoDaData = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "America/Sao_Paulo",
});

/** Busca pura (sem estado de React), para o efeito e o clique decidirem o que fazer. */
async function lerNotificacoes(): Promise<Notificacao[] | null> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("notificacoes")
    .select("id, titulo, texto, link, criada_em, lida_em")
    .order("criada_em", { ascending: false })
    .limit(MAXIMO_NA_LISTA);
  return error ? null : data;
}

async function marcarComoLidas(ids: number[]): Promise<boolean> {
  if (ids.length === 0) return true;
  const supabase = createClient();
  const { error } = await supabase.from("notificacoes").update({ lida_em: new Date().toISOString() }).in("id", ids);
  return !error;
}

export function SinoDeNotificacoes() {
  const [notificacoes, setNotificacoes] = useState<Notificacao[]>([]);
  const [aberto, setAberto] = useState(false);
  const caixa = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let ativo = true;
    const atualizar = () => {
      void lerNotificacoes().then((lidas) => {
        if (ativo && lidas) setNotificacoes(lidas);
      });
    };
    atualizar();
    const relogio = setInterval(atualizar, INTERVALO_DE_RELEITURA_MS);
    return () => {
      ativo = false;
      clearInterval(relogio);
    };
  }, []);

  // Fecha ao clicar fora ou apertar Esc.
  useEffect(() => {
    if (!aberto) return;
    const aoClicar = (evento: MouseEvent) => {
      if (caixa.current && !caixa.current.contains(evento.target as Node)) setAberto(false);
    };
    const aoTeclar = (evento: KeyboardEvent) => {
      if (evento.key === "Escape") setAberto(false);
    };
    document.addEventListener("mousedown", aoClicar);
    document.addEventListener("keydown", aoTeclar);
    return () => {
      document.removeEventListener("mousedown", aoClicar);
      document.removeEventListener("keydown", aoTeclar);
    };
  }, [aberto]);

  const naoLidas = notificacoes.filter((n) => n.lida_em === null);

  const alternar = useCallback(() => {
    const abrindo = !aberto;
    setAberto(abrindo);
    if (!abrindo) return;
    // Ao abrir, as que a pessoa esta vendo passam a lidas; o destaque some so
    // na proxima abertura, para ela ainda ver quais eram novas agora.
    const ids = naoLidas.map((n) => n.id);
    void marcarComoLidas(ids).then((ok) => {
      if (!ok) return;
      const agora = new Date().toISOString();
      setNotificacoes((atuais) => atuais.map((n) => (ids.includes(n.id) ? { ...n, lida_em: n.lida_em ?? agora } : n)));
    });
  }, [aberto, naoLidas]);

  return (
    <div ref={caixa} className="relative">
      <button
        type="button"
        onClick={alternar}
        aria-expanded={aberto}
        aria-label={naoLidas.length > 0 ? `Avisos: ${naoLidas.length} novos` : "Avisos"}
        title="Avisos"
        className="relative rounded-md p-2 text-slate-300 hover:bg-slate-800 hover:text-white"
      >
        <BellIcon className="h-5 w-5" />
        {naoLidas.length > 0 ? (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
            {naoLidas.length > 9 ? "9+" : naoLidas.length}
          </span>
        ) : null}
      </button>

      {aberto ? (
        <div className="absolute right-0 top-full z-30 mt-2 w-80 max-w-[calc(100vw-2rem)] overflow-hidden rounded-lg border border-slate-800 bg-brand-surface shadow-lg animate-slide-down">
          <p className="border-b border-slate-800 px-4 py-3 text-sm font-semibold text-white">Avisos</p>
          {notificacoes.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-brand-muted">Nenhum aviso por enquanto.</p>
          ) : (
            <ul className="max-h-96 overflow-y-auto">
              {notificacoes.map((n) => {
                const conteudo = (
                  <>
                    <span className="flex items-start gap-2">
                      {naoLidas.some((x) => x.id === n.id) ? (
                        <span aria-label="Novo" className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-brand-green" />
                      ) : null}
                      <span className="text-sm font-medium text-white">{n.titulo}</span>
                    </span>
                    {n.texto ? <span className="mt-0.5 block text-xs text-brand-muted">{n.texto}</span> : null}
                    <span className="mt-1 block text-[11px] text-brand-muted">{formatoDaData.format(new Date(n.criada_em))}</span>
                  </>
                );
                return (
                  <li key={n.id} className="border-b border-slate-800/60 last:border-b-0">
                    {n.link ? (
                      <Link href={n.link} onClick={() => setAberto(false)} className="block px-4 py-3 hover:bg-white/5">
                        {conteudo}
                      </Link>
                    ) : (
                      <div className="px-4 py-3">{conteudo}</div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
