"use client";

import { useRouter } from "next/navigation";
import { useMemo, useRef, useState, type PointerEvent } from "react";
import { modelosDoGrupo, respostasDoTipo, rotuloDaResposta } from "@projeto-renatoo/shared";
import { Button } from "@/components/Button";
import { createClient } from "@/lib/supabase/client";
import {
  abrirVisitaDoPortal,
  desistirDaVisita,
  enviarChecklistDoPortal,
  lerPerguntasDoModelo,
  type PerguntaDoPortal,
} from "./actions";

export type SiteDoChecklist = { id: number; nome: string; grupoSiteId: number };
export type ModeloDoChecklist = { id: number; nome: string; padrao: boolean; ativo: boolean };
export type LigacaoDoChecklist = { modelo_id: number; grupo_site_id: number };

const campo = "w-full rounded-md border border-slate-700 bg-brand-bg px-3 py-2 text-sm text-white";

/** "Novo Checklist" respondido no portal (regras e passos em `actions.ts`). */
export function FormularioDoChecklist({
  sites,
  modelos,
  ligacoes,
}: {
  sites: SiteDoChecklist[];
  modelos: ModeloDoChecklist[];
  ligacoes: LigacaoDoChecklist[];
}) {
  const router = useRouter();
  const [siteId, setSiteId] = useState<number | null>(null);
  const [modeloId, setModeloId] = useState<number | null>(null);
  const [perguntas, setPerguntas] = useState<PerguntaDoPortal[] | null>(null);
  const [respostas, setRespostas] = useState<Record<number, string>>({});
  const [observacoes, setObservacoes] = useState<Record<number, string>>({});
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [assinou, setAssinou] = useState(false);
  const quadro = useRef<HTMLCanvasElement>(null);
  const desenhando = useRef(false);

  const site = sites.find((s) => s.id === siteId) ?? null;
  const modelosDoSite = useMemo(
    () => (site ? modelosDoGrupo(site.grupoSiteId, modelos, ligacoes) : []),
    [site, modelos, ligacoes],
  );

  const escolherModelo = async (id: number | null) => {
    setModeloId(id);
    setPerguntas(null);
    setRespostas({});
    setObservacoes({});
    if (id === null) return;
    const lidas = await lerPerguntasDoModelo(id);
    if (!lidas) setErro("Não foi possível carregar as perguntas.");
    else setPerguntas(lidas);
  };

  const ponto = (e: PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * e.currentTarget.width, y: ((e.clientY - r.top) / r.height) * e.currentTarget.height };
  };
  const comecar = (e: PointerEvent<HTMLCanvasElement>) => {
    const ctx = e.currentTarget.getContext("2d");
    if (!ctx) return;
    desenhando.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
    const { x, y } = ponto(e);
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.strokeStyle = "#111827";
    ctx.beginPath();
    ctx.moveTo(x, y);
  };
  const mover = (e: PointerEvent<HTMLCanvasElement>) => {
    if (!desenhando.current) return;
    const ctx = e.currentTarget.getContext("2d");
    if (!ctx) return;
    const { x, y } = ponto(e);
    ctx.lineTo(x, y);
    ctx.stroke();
    setAssinou(true);
  };
  const limpar = () => {
    const c = quadro.current;
    c?.getContext("2d")?.clearRect(0, 0, c.width, c.height);
    setAssinou(false);
  };

  const enviar = async () => {
    setErro(null);
    if (!site || !modeloId || !perguntas) return setErro("Escolha o site e o checklist.");
    const faltando = perguntas.find((p) => !respostas[p.id]);
    if (faltando) return setErro(`Responda a pergunta ${faltando.ordem}.`);
    if (!assinou || !quadro.current) return setErro("Assine no quadro antes de enviar.");

    setEnviando(true);
    const aberta = await abrirVisitaDoPortal(site.id);
    if ("erro" in aberta) {
      setEnviando(false);
      return setErro(aberta.erro);
    }
    const { visitaId } = aberta;
    const assinaturaPath = `${visitaId}/assinatura.png`;
    try {
      const fundo = document.createElement("canvas");
      fundo.width = quadro.current.width;
      fundo.height = quadro.current.height;
      const ctx = fundo.getContext("2d")!;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, fundo.width, fundo.height);
      ctx.drawImage(quadro.current, 0, 0);
      const png = await new Promise<Blob | null>((ok) => fundo.toBlob(ok, "image/png"));
      if (!png) throw new Error("assinatura");
      const { error } = await createClient()
        .storage.from("checklists")
        .upload(assinaturaPath, png, { contentType: "image/png", upsert: false });
      if (error) throw new Error("assinatura");

      const resultado = await enviarChecklistDoPortal({
        visitaId,
        modeloId,
        assinaturaPath,
        perguntas,
        respostas: perguntas.map((p) => ({ perguntaId: p.id, resposta: respostas[p.id], observacao: observacoes[p.id] ?? "" })),
      });
      if (resultado.erro) throw new Error(resultado.erro);
      router.push("/dashboard/checklistlab/historico-de-checklist?salvo=1");
    } catch (falha) {
      await desistirDaVisita(visitaId);
      setErro(
        falha instanceof Error && falha.message !== "assinatura"
          ? falha.message
          : "Não foi possível enviar a assinatura. Tente de novo.",
      );
      setEnviando(false);
    }
  };

  return (
    <div className="space-y-4 p-4">
      {erro && (
        <p role="alert" className="rounded-md border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {erro}
        </p>
      )}
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <label htmlFor="site" className="mb-1.5 block text-sm font-medium text-white">
            Site
          </label>
          <select
            id="site"
            className={campo}
            value={siteId ?? ""}
            onChange={(e) => {
              setSiteId(e.target.value ? Number(e.target.value) : null);
              void escolherModelo(null);
            }}
          >
            <option value="">Selecione</option>
            {sites.map((s) => (
              <option key={s.id} value={s.id}>
                {s.nome}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="modelo" className="mb-1.5 block text-sm font-medium text-white">
            Checklist
          </label>
          <select
            id="modelo"
            className={campo}
            value={modeloId ?? ""}
            disabled={!site}
            onChange={(e) => void escolherModelo(e.target.value ? Number(e.target.value) : null)}
          >
            <option value="">Selecione</option>
            {modelosDoSite.map((m) => (
              <option key={m.id} value={m.id}>
                {m.nome}
              </option>
            ))}
          </select>
        </div>
      </div>

      {perguntas && (
        <ol className="space-y-3">
          {perguntas.map((p, i) => (
            <li key={p.id} className="rounded-md border border-slate-800 p-3">
              {p.grupo && (i === 0 || perguntas[i - 1].grupo !== p.grupo) && (
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-brand-muted">{p.grupo}</p>
              )}
              <fieldset>
                <legend className="text-sm text-white">
                  {p.ordem}. {p.texto}
                </legend>
                <div className="mt-2 flex flex-wrap gap-3">
                  {respostasDoTipo(p.tipo).map((valor) => (
                    <label key={valor} className="flex items-center gap-1.5 text-sm text-slate-200">
                      <input
                        type="radio"
                        name={`resposta-${p.id}`}
                        checked={respostas[p.id] === valor}
                        onChange={() => setRespostas((r) => ({ ...r, [p.id]: valor }))}
                      />
                      {rotuloDaResposta(p.tipo, valor)}
                    </label>
                  ))}
                </div>
              </fieldset>
              <label className="mt-2 block">
                <span className="sr-only">Observação da pergunta {p.ordem}</span>
                <input
                  type="text"
                  placeholder="Observação"
                  maxLength={2000}
                  className={campo}
                  value={observacoes[p.id] ?? ""}
                  onChange={(e) => setObservacoes((o) => ({ ...o, [p.id]: e.target.value }))}
                />
              </label>
            </li>
          ))}
        </ol>
      )}

      {perguntas && (
        <div>
          <span className="mb-1.5 block text-sm font-medium text-white">Assinatura</span>
          <canvas
            ref={quadro}
            width={600}
            height={160}
            aria-label="Quadro de assinatura"
            className="w-full max-w-xl touch-none rounded-md border border-slate-700 bg-white"
            onPointerDown={comecar}
            onPointerMove={mover}
            onPointerUp={() => (desenhando.current = false)}
            onPointerLeave={() => (desenhando.current = false)}
          />
          <button type="button" onClick={limpar} className="mt-1 text-xs text-brand-muted underline">
            Limpar assinatura
          </button>
        </div>
      )}

      <div className="flex items-center gap-3">
        <Button type="button" onClick={() => void enviar()} loading={enviando} disabled={enviando || !perguntas}>
          {enviando ? "Enviando..." : "Finalizar checklist"}
        </Button>
        <Button href="/dashboard/checklistlab/historico-de-checklist" variant="secondary" disabled={enviando}>
          Cancelar
        </Button>
      </div>
    </div>
  );
}
