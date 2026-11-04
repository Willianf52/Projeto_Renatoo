"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import {
  ACCEPT_DOS_ARQUIVOS,
  assinaturaConfere,
  caminhoDoAnexo,
  erroDoArquivo,
  tipoPorExtensao,
} from "@/app/dashboard/eventos/painel-de-eventos/andamentos";
import { Button } from "@/components/Button";
import { TrashIcon } from "@/components/dashboard/icons";
import { createClient } from "@/lib/supabase/client";
import { registrarAnexoDoSite, removerAnexoDoSite } from "./anexos";

export type AnexoDoSite = { id: number; nome: string; criadoEm: string };

const FORMATO = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" });

/** "Anexos" do Site/Planta (0089): lista, envia e remove arquivos do site. */
export function AnexosDoSite({ siteId, anexos }: { siteId: number; anexos: AnexoDoSite[] }) {
  const router = useRouter();
  const entrada = useRef<HTMLInputElement>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [, iniciar] = useTransition();

  const enviar = async (arquivos: FileList | null) => {
    if (!arquivos || arquivos.length === 0) return;
    setErro(null);
    setEnviando(true);
    try {
      const storage = createClient().storage.from("sites");
      for (const arquivo of Array.from(arquivos)) {
        const recusa = erroDoArquivo(arquivo);
        if (recusa) {
          setErro(recusa);
          return;
        }
        const inicio = new Uint8Array(await arquivo.slice(0, 8).arrayBuffer());
        if (!assinaturaConfere(arquivo.name, inicio)) {
          setErro(`"${arquivo.name}": o conteúdo não bate com o formato do arquivo.`);
          return;
        }
        const caminho = caminhoDoAnexo(siteId, crypto.randomUUID(), arquivo.name);
        const { error } = await storage.upload(caminho, arquivo, {
          contentType: tipoPorExtensao(arquivo.name) ?? undefined,
          upsert: false,
        });
        if (error) {
          setErro(`Não foi possível enviar "${arquivo.name}". Tente de novo.`);
          return;
        }
        const resultado = await registrarAnexoDoSite(siteId, caminho, arquivo.name);
        if (resultado.erro) {
          setErro(resultado.erro);
          return;
        }
      }
      iniciar(() => router.refresh());
    } finally {
      setEnviando(false);
      if (entrada.current) entrada.current.value = "";
    }
  };

  const remover = (anexo: AnexoDoSite) => {
    if (!window.confirm(`Remover o anexo "${anexo.nome}"?`)) return;
    iniciar(async () => {
      const resultado = await removerAnexoDoSite(anexo.id);
      if (resultado.erro) setErro(resultado.erro);
      else router.refresh();
    });
  };

  return (
    <div className="space-y-3 p-4">
      {erro && (
        <p role="alert" className="rounded-md border border-red-500/40 bg-red-500/10 px-4 py-2 text-sm text-red-300">
          {erro}
        </p>
      )}
      {anexos.length === 0 ? (
        <p className="text-sm text-brand-muted">Nenhum anexo neste site.</p>
      ) : (
        <ul className="divide-y divide-slate-800 rounded-md border border-slate-800">
          {anexos.map((anexo) => (
            <li key={anexo.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
              <a
                href={`/dashboard/cadastros/site-planta/anexos/${anexo.id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="truncate text-brand-green hover:underline"
              >
                {anexo.nome}
              </a>
              <span className="flex shrink-0 items-center gap-2 text-xs text-brand-muted">
                {FORMATO.format(new Date(anexo.criadoEm))}
                <button
                  type="button"
                  onClick={() => remover(anexo)}
                  className="rounded p-1 text-red-300 hover:bg-red-500/10"
                  aria-label={`Remover o anexo ${anexo.nome}`}
                >
                  <TrashIcon className="h-4 w-4" />
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <label htmlFor="anexos-do-site" className="sr-only">
          Anexar arquivos ao site
        </label>
        <input
          ref={entrada}
          id="anexos-do-site"
          type="file"
          multiple
          accept={ACCEPT_DOS_ARQUIVOS}
          onChange={(e) => void enviar(e.target.files)}
          className="hidden"
        />
        <Button type="button" variant="secondary" loading={enviando} disabled={enviando} onClick={() => entrada.current?.click()}>
          {enviando ? "Enviando..." : "Anexar arquivo"}
        </Button>
        <span className="text-xs text-brand-muted">Imagem, PDF, planilha ou zip, até 10 MB cada.</span>
      </div>
    </div>
  );
}
