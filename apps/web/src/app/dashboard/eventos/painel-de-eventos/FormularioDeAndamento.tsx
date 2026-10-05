"use client";

import { startTransition, useActionState, useMemo, useRef, useState } from "react";
import { Button } from "@/components/Button";
import { getInputClasses } from "@/components/FormField";
import { ChevronDownIcon } from "@/components/dashboard/icons";
import { SelecaoMultipla } from "@/components/dashboard/SelecaoMultipla";
import { createClient } from "@/lib/supabase/client";
import { registrarAndamento, type EstadoDoAndamento } from "./actions";
import {
  ACCEPT_DOS_ARQUIVOS,
  assinaturaConfere,
  caminhoDoAnexo,
  erroDoArquivo,
  LIMITE_DO_TEXTO,
  MAXIMO_DE_ARQUIVOS,
  tipoPorExtensao,
  type AnexoEnviado,
  type TipoDeAndamento,
} from "./andamentos";
import type { OpcoesDoAndamento } from "./queries";

const rotulo = "mb-1.5 block text-xs font-medium uppercase tracking-wide text-brand-muted";

const TEXTOS = {
  ANALISE: {
    campo: "Análise do Evento",
    botao: "Salvar análise",
    ajuda: "A primeira análise muda o status da ocorrência para Em Análise.",
  },
  FINALIZACAO: {
    campo: "Ações Realizadas",
    botao: "Finalizar ocorrência",
    ajuda: "Finalizar encerra a ocorrência: o status passa para Atendido e ela não recebe mais análises.",
  },
} as const;

/**
 * "Adicionar Analise" e "Finalizar" de uma ocorrencia (migration 0064): os
 * mesmos campos do sistema de referencia, sem o SMS.
 *
 * OS ARQUIVOS SOBEM DAQUI, direto ao Storage (ver `actions.ts` para o porque);
 * a Server Action recebe so os caminhos. A ordem importa: se a gravacao
 * falhar depois do envio, os arquivos ficam orfaos no bucket -- sem policy de
 * remocao para a sessao, e e um custo aceito em troca de nao ter limite de
 * 4,5 MB.
 */
export function FormularioDeAndamento({
  ocorrenciaId,
  tipo,
  opcoes,
}: {
  ocorrenciaId: number;
  tipo: TipoDeAndamento;
  opcoes: OpcoesDoAndamento;
}) {
  const [estado, formAction, gravando] = useActionState<EstadoDoAndamento, FormData>(registrarAndamento, {});
  const [erroLocal, setErroLocal] = useState<string | null>(null);
  const [enviandoArquivos, setEnviandoArquivos] = useState(false);
  const [grupo, setGrupo] = useState("");
  const campoDeArquivos = useRef<HTMLInputElement>(null);

  const textos = TEXTOS[tipo];
  const ocupado = enviandoArquivos || gravando;
  const erro = erroLocal ?? estado.erro ?? null;
  const ehAnalise = tipo === "ANALISE";
  const apoioDoGrupo = useMemo(() => opcoes.membrosPorGrupo[grupo] ?? [], [grupo, opcoes.membrosPorGrupo]);

  async function aoEnviar(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    if (ocupado) return;
    setErroLocal(null);

    const formulario = new FormData(evento.currentTarget);
    // O arquivo em si nao vai na Server Action.
    formulario.delete("arquivos");

    const arquivos = Array.from(campoDeArquivos.current?.files ?? []);
    if (arquivos.length > MAXIMO_DE_ARQUIVOS) {
      setErroLocal(`No máximo ${MAXIMO_DE_ARQUIVOS} arquivos.`);
      return;
    }
    for (const arquivo of arquivos) {
      const recusa = erroDoArquivo(arquivo);
      if (recusa) {
        setErroLocal(recusa);
        return;
      }
      const inicio = new Uint8Array(await arquivo.slice(0, 8).arrayBuffer());
      if (!assinaturaConfere(arquivo.name, inicio)) {
        setErroLocal(`"${arquivo.name}": o conteúdo não bate com o formato do arquivo.`);
        return;
      }
    }

    const enviados: AnexoEnviado[] = [];
    if (arquivos.length > 0) {
      setEnviandoArquivos(true);
      const storage = createClient().storage.from("ocorrencias");
      for (const arquivo of arquivos) {
        const caminho = caminhoDoAnexo(ocorrenciaId, crypto.randomUUID(), arquivo.name);
        const { error } = await storage.upload(caminho, arquivo, {
          contentType: tipoPorExtensao(arquivo.name) ?? undefined,
          upsert: false,
        });
        if (error) {
          setEnviandoArquivos(false);
          setErroLocal(`Não foi possível enviar "${arquivo.name}". Tente de novo.`);
          return;
        }
        enviados.push({ storage_path: caminho, nome: arquivo.name });
      }
      setEnviandoArquivos(false);
    }

    formulario.set("arquivos_enviados", JSON.stringify(enviados));
    startTransition(() => formAction(formulario));
  }

  return (
    <form onSubmit={aoEnviar} className="space-y-4 p-4">
      <input type="hidden" name="ocorrencia_id" value={ocorrenciaId} />
      <input type="hidden" name="tipo" value={tipo} />

      {erro && (
        <p role="alert" className="rounded-md border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {erro}
        </p>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Seletor id={`${tipo}-tipo-analise`} name="tipo_analise_id" rotulo="Tipo de Análise" obrigatorio opcoes={opcoes.tiposDeAnalise} />
        {ehAnalise && (
          <Seletor
            id={`${tipo}-classificacao`}
            name="tipo_classificacao_id"
            rotulo="Tipo de Classificação"
            opcoes={opcoes.classificacoes}
          />
        )}
      </div>

      <div>
        <label htmlFor={`${tipo}-texto`} className={rotulo}>
          {textos.campo}
        </label>
        <textarea
          id={`${tipo}-texto`}
          name="texto"
          required
          rows={4}
          maxLength={LIMITE_DO_TEXTO}
          className={getInputClasses(false)}
        />
      </div>

      {ehAnalise ? (
        <>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Seletor id="analise-responsavel" name="responsavel_id" rotulo="Responsável" opcoes={opcoes.usuarios} />
            <Seletor
              id="analise-grupo"
              name="grupo_usuario_id"
              rotulo="Grupo de Usuários"
              opcoes={opcoes.grupos}
              aoMudar={setGrupo}
            />
          </div>
          <div>
            <span className={rotulo}>Apoio</span>
            <p className="mb-2 text-xs text-brand-muted">Escolha o grupo para preencher os usuários de apoio.</p>
            {/* `key`: ao trocar o grupo, remonta com os membros dele marcados. */}
            <SelecaoMultipla
              key={grupo}
              name="apoio"
              opcoes={opcoes.usuarios}
              iniciais={apoioDoGrupo}
              rotuloDoItem="usuário"
              textoSemOpcoes="Nenhum usuário cadastrado ainda."
            />
          </div>
        </>
      ) : (
        <div>
          <span className={rotulo}>Avisar sobre a Finalização</span>
          <p className="mb-2 text-xs text-brand-muted">
            Os avisos por e-mail serão enviados quando o domínio próprio estiver configurado. A escolha já fica registrada.
          </p>
          <SelecaoMultipla
            name="avisar"
            opcoes={opcoes.usuarios}
            iniciais={[]}
            rotuloDoItem="usuário"
            textoSemOpcoes="Nenhum usuário cadastrado ainda."
          />
        </div>
      )}

      <div>
        <label htmlFor={`${tipo}-arquivos`} className={rotulo}>
          Fotos da Ocorrência
        </label>
        <input
          ref={campoDeArquivos}
          id={`${tipo}-arquivos`}
          name="arquivos"
          type="file"
          multiple
          accept={ACCEPT_DOS_ARQUIVOS}
          aria-describedby={`${tipo}-arquivos-ajuda`}
          className="block w-full cursor-pointer rounded-lg border border-slate-800 bg-brand-navy text-sm text-brand-muted file:mr-4 file:cursor-pointer file:border-0 file:bg-slate-800 file:px-4 file:py-3 file:text-sm file:text-white hover:border-slate-700"
        />
        <p id={`${tipo}-arquivos-ajuda`} className="mt-1.5 text-xs text-brand-muted">
          Formatos permitidos: jpg, jpeg, png, zip, xls, xlsx e pdf. Até {MAXIMO_DE_ARQUIVOS} arquivos de 10 MB.
        </p>
      </div>

      <div>
        <label htmlFor={`${tipo}-emails`} className={rotulo}>
          E-mails externos
        </label>
        <input
          id={`${tipo}-emails`}
          name="emails_externos"
          type="text"
          autoComplete="off"
          aria-describedby={`${tipo}-emails-ajuda`}
          className={getInputClasses(false)}
        />
        <p id={`${tipo}-emails-ajuda`} className="mt-1.5 text-xs text-brand-muted">
          Separe por vírgula. O envio acontece quando o domínio próprio estiver configurado.
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-brand-muted">{textos.ajuda}</p>
        <Button type="submit" variant={ehAnalise ? "primary" : "danger"} loading={ocupado} disabled={ocupado}>
          {enviandoArquivos ? "Enviando arquivos..." : gravando ? "Salvando..." : textos.botao}
        </Button>
      </div>
    </form>
  );
}

function Seletor({
  id,
  name,
  rotulo: texto,
  opcoes,
  obrigatorio = false,
  aoMudar,
}: {
  id: string;
  name: string;
  rotulo: string;
  opcoes: { value: string; label: string }[];
  obrigatorio?: boolean;
  aoMudar?: (valor: string) => void;
}) {
  return (
    <div>
      <label htmlFor={id} className={rotulo}>
        {texto}
      </label>
      <div className="relative">
        <select
          id={id}
          name={name}
          required={obrigatorio}
          defaultValue={obrigatorio && opcoes.length === 1 ? opcoes[0].value : ""}
          onChange={aoMudar ? (evento) => aoMudar(evento.target.value) : undefined}
          className={`peer ${getInputClasses(false)} appearance-none pr-9`}
        >
          {/* Com uma opcao so (a semente "Em Analise"), ela ja vem escolhida. */}
          {!(obrigatorio && opcoes.length === 1) && <option value="">Selecione...</option>}
          {opcoes.map((opcao) => (
            <option key={opcao.value} value={opcao.value}>
              {opcao.label}
            </option>
          ))}
        </select>
        <ChevronDownIcon className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-brand-muted transition-transform duration-200 peer-focus:rotate-180" />
      </div>
    </div>
  );
}
