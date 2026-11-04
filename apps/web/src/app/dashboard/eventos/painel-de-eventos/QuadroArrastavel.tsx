"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { moverNoQuadro } from "./actions";
import { aceitaAndamento } from "./andamentos";
import { STATUS } from "./status";

const BASE = "/dashboard/eventos/painel-de-eventos";

export type CartaoArrastavel = {
  id: number;
  status: string;
  numero: string;
  evento: string;
  local: string;
  quando: string;
  usuario: string;
  aberto: string | null;
};

/**
 * O Quadro do Painel com arrastar e soltar, como no sistema de referencia
 * (0089). Cartao encerrado nao arrasta (o banco recusaria). Enquanto a troca
 * vai ao servidor, o cartao ja aparece na coluna nova; se o servidor recusar,
 * volta e a mensagem aparece em cima.
 *
 * Pelo teclado: o select "Mover para" de cada cartao faz a mesma troca, para
 * quem nao usa mouse.
 */
export function QuadroArrastavel({ cartoes, podeMover }: { cartoes: CartaoArrastavel[]; podeMover: boolean }) {
  const router = useRouter();
  const [movidos, setMovidos] = useState<Record<number, string>>({});
  const [sobre, setSobre] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();

  const statusDe = (c: CartaoArrastavel) => movidos[c.id] ?? c.status;

  const mover = (id: number, de: string, para: string) => {
    if (de === para) return;
    setErro(null);
    setMovidos((atual) => ({ ...atual, [id]: para }));
    iniciar(async () => {
      const resultado = await moverNoQuadro(id, para);
      if (resultado.erro) {
        setMovidos((atual) => {
          const { [id]: _, ...resto } = atual;
          return resto;
        });
        setErro(resultado.erro);
        return;
      }
      router.refresh();
    });
  };

  return (
    <div className="space-y-2">
      {erro && (
        <p role="alert" className="rounded-md border border-red-500/40 bg-red-500/10 px-4 py-2 text-sm text-red-300">
          {erro}
        </p>
      )}
      <div className="flex gap-3 overflow-x-auto pb-2" aria-busy={pendente}>
        {STATUS.map((status) => {
          const daColuna = cartoes.filter((c) => statusDe(c) === status.value);
          return (
            <section
              key={status.value}
              aria-label={`${status.label}: ${daColuna.length}`}
              className={`flex w-64 shrink-0 flex-col rounded-lg border bg-brand-bg/40 ${
                sobre === status.value ? "border-slate-400" : "border-slate-800"
              }`}
              style={{ borderTopColor: status.anel, borderTopWidth: 3 }}
              onDragOver={(e) => {
                if (!podeMover) return;
                e.preventDefault();
                setSobre(status.value);
              }}
              onDragLeave={() => setSobre((atual) => (atual === status.value ? null : atual))}
              onDrop={(e) => {
                if (!podeMover) return;
                e.preventDefault();
                setSobre(null);
                const [id, de] = e.dataTransfer.getData("text/plain").split("|");
                if (id && de) mover(Number(id), de, status.value);
              }}
            >
              <h2 className="flex items-center justify-between px-3 py-2 text-sm font-semibold text-white">
                <span className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full" style={{ background: status.anel }} aria-hidden />
                  {status.label}
                </span>
                <span className="rounded-full border border-slate-700 px-2 text-xs text-brand-muted">{daColuna.length}</span>
              </h2>
              <div className="flex max-h-[32rem] min-h-16 flex-col gap-2 overflow-y-auto px-2 pb-2">
                {daColuna.length === 0 ? (
                  <p className="rounded-md border border-dashed border-slate-700 px-3 py-4 text-center text-xs text-brand-muted">
                    Nenhum evento
                  </p>
                ) : (
                  daColuna.map((c) => {
                    const atual = statusDe(c);
                    const arrastavel = podeMover && aceitaAndamento(atual);
                    return (
                      <div
                        key={c.id}
                        draggable={arrastavel}
                        onDragStart={(e) => {
                          e.dataTransfer.setData("text/plain", `${c.id}|${atual}`);
                          e.dataTransfer.effectAllowed = "move";
                        }}
                        className={`rounded-md border border-slate-800 bg-brand-surface text-xs transition-colors hover:border-slate-600 ${
                          arrastavel ? "cursor-grab active:cursor-grabbing" : ""
                        }`}
                        style={{ borderLeftColor: status.anel, borderLeftWidth: 3 }}
                      >
                        <Link href={`${BASE}/${c.id}`} className="block px-3 pt-2" draggable={false}>
                          <p className="text-brand-muted">Nº {c.numero}</p>
                          <p className="font-semibold text-brand-green">{c.evento}</p>
                          <p className="mt-1 text-slate-300">{c.local}</p>
                          <p className="text-slate-300">{c.quando}</p>
                          {c.usuario && <p className="text-slate-300">{c.usuario}</p>}
                          {c.aberto && aceitaAndamento(atual) && <p className="mt-1 font-semibold text-white">{c.aberto}</p>}
                        </Link>
                        <div className="px-3 pb-2 pt-1">
                          {arrastavel ? (
                            <label className="flex items-center gap-1 text-brand-muted">
                              <span className="sr-only">Mover o evento {c.numero} para</span>
                              <select
                                value={atual}
                                onChange={(e) => mover(c.id, atual, e.target.value)}
                                className="w-full rounded border border-slate-700 bg-brand-bg px-1 py-0.5 text-xs text-slate-200"
                              >
                                {STATUS.map((s) => (
                                  <option key={s.value} value={s.value}>
                                    {s.label}
                                  </option>
                                ))}
                              </select>
                            </label>
                          ) : null}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
