"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/Button";
import { UserIcon } from "@/components/dashboard/icons";
import { BUCKET_DAS_FOTOS, caminhoDaFoto, problemaDaFoto } from "@/lib/foto-do-usuario-cliente";
import { createClient } from "@/lib/supabase/client";
import { registrarFoto, removerFoto } from "./actions";

/**
 * Trocar ou remover a foto de uma pessoa (0112): a propria, em "Minha Foto",
 * ou a de outra pessoa, pelo GESTOR na edicao do usuario. O arquivo sobe do
 * navegador direto para o bucket privado (o RLS confere quem pode) e a action
 * registra a troca.
 *
 * A previa depois do envio vem do LINK ASSINADO do bucket, e nao de um
 * `URL.createObjectURL` do arquivo escolhido (auditoria de 23/11/2026, alerta
 * do CodeQL js/xss-through-dom): nada que vem do campo de arquivo chega ao
 * `src` da imagem, so o que o proprio armazenamento devolveu.
 */
export function EditorDeFoto({ usuarioId, fotoAtual }: { usuarioId: string; fotoAtual: string | null }) {
  const router = useRouter();
  const entrada = useRef<HTMLInputElement>(null);
  const [previa, setPrevia] = useState<string | null>(fotoAtual);
  const [enviando, setEnviando] = useState(false);
  const [mensagem, setMensagem] = useState<{ texto: string; erro: boolean } | null>(null);

  async function enviar(arquivo: File) {
    const problema = problemaDaFoto(arquivo);
    if (problema) {
      setMensagem({ texto: problema, erro: true });
      return;
    }
    setEnviando(true);
    setMensagem(null);
    const supabase = createClient();
    const { error } = await supabase.storage
      .from(BUCKET_DAS_FOTOS)
      .upload(caminhoDaFoto(usuarioId), arquivo, { upsert: true, contentType: arquivo.type, cacheControl: "60" });
    if (error) {
      setEnviando(false);
      setMensagem({ texto: "Não foi possível enviar a foto. Tente novamente.", erro: true });
      return;
    }
    const resultado = await registrarFoto(usuarioId);
    setEnviando(false);
    if (resultado.erro) {
      setMensagem({ texto: resultado.erro, erro: true });
      return;
    }
    // Link temporario da foto que acabou de ser guardada (uma hora, como a
    // pagina). Sem ele, a pagina recarregada mostra a nova de todo modo.
    const { data: assinado } = await supabase.storage
      .from(BUCKET_DAS_FOTOS)
      .createSignedUrl(caminhoDaFoto(usuarioId), 60 * 60);
    if (assinado?.signedUrl) setPrevia(assinado.signedUrl);
    setMensagem({ texto: "Foto salva.", erro: false });
    router.refresh();
  }

  async function remover() {
    setEnviando(true);
    setMensagem(null);
    const resultado = await removerFoto(usuarioId);
    setEnviando(false);
    if (resultado.erro) {
      setMensagem({ texto: resultado.erro, erro: true });
      return;
    }
    setPrevia(null);
    setMensagem({ texto: "Foto removida.", erro: false });
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center">
      <div className="flex h-28 w-28 shrink-0 items-center justify-center overflow-hidden rounded-full bg-brand-green/20 text-brand-green">
        {previa ? (
          // eslint-disable-next-line @next/next/no-img-element -- link assinado e temporario do bucket privado
          <img src={previa} alt="Foto do usuário" className="h-full w-full object-cover" />
        ) : (
          <UserIcon className="h-12 w-12" />
        )}
      </div>
      <div className="space-y-3">
        <input
          ref={entrada}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={(e) => {
            const arquivo = e.target.files?.[0];
            if (arquivo) void enviar(arquivo);
            e.target.value = "";
          }}
        />
        <div className="flex flex-wrap gap-2">
          <Button type="button" loading={enviando} onClick={() => entrada.current?.click()}>
            {previa ? "Trocar foto" : "Escolher foto"}
          </Button>
          {previa ? (
            <Button type="button" variant="secondary" disabled={enviando} onClick={() => void remover()}>
              Remover foto
            </Button>
          ) : null}
        </div>
        <p className="text-xs text-brand-muted">JPG, PNG ou WebP, até 2 MB. Só você e a gestão veem a foto.</p>
        {mensagem ? (
          <p role={mensagem.erro ? "alert" : "status"} className={`text-sm ${mensagem.erro ? "text-red-300" : "text-brand-green"}`}>
            {mensagem.texto}
          </p>
        ) : null}
      </div>
    </div>
  );
}
