"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState } from "react";
import { Button } from "@/components/Button";
import { ChevronDownIcon } from "@/components/dashboard/icons";
import { getInputClasses } from "@/components/FormField";
import { createClient } from "@/lib/supabase/client";
import {
  ACCEPT_DOS_ARQUIVOS,
  assinaturaConfere,
  caminhoDoAnexo,
  erroDoArquivo,
  MAXIMO_DE_ARQUIVOS,
  tipoPorExtensao,
  type AnexoEnviado,
} from "../painel-de-eventos/andamentos";
import { anexarArquivosDaAbertura, registrarEvento } from "./actions";
import type { Opcao } from "./queries";
import { eventosDoSite, LIMITE_DA_OBSERVACAO, subtiposDe, type EventoParaRegistro } from "./regras";

const PAINEL = "/dashboard/eventos/painel-de-eventos";
const rotulo = "mb-1.5 block text-xs font-medium uppercase tracking-wide text-brand-muted";

function Selecao({
  id,
  name,
  value,
  onChange,
  vazio,
  opcoes,
  obrigatorio,
  disabled,
}: {
  id: string;
  name: string;
  value: string;
  onChange: (valor: string) => void;
  vazio: string;
  opcoes: Opcao[];
  obrigatorio?: boolean;
  disabled?: boolean;
}) {
  return (
    <div className="relative">
      <select
        id={id}
        name={name}
        value={value}
        required={obrigatorio}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className={`${getInputClasses(false)} appearance-none pr-9 disabled:cursor-not-allowed disabled:opacity-50`}
      >
        <option value="">{vazio}</option>
        {opcoes.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <ChevronDownIcon className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-brand-muted" />
    </div>
  );
}

/** Ocorrencia registrada, mas algum arquivo nao foi junto: ela existe e nao
 * deve ser registrada de novo. */
type Parcial = { id: number; numeroAno: string; mensagem: string };

/**
 * Registrar Evento: Site, Evento, SubTipo, Classificacao, arquivos e
 * observacao, como na referencia. A ordem e: registra, envia os arquivos a
 * pasta da ocorrencia nova, liga os arquivos a ela, abre o detalhe no Painel.
 */
export function RegistrarEventoForm({
  sites,
  eventos,
  classificacoes,
}: {
  sites: Opcao[];
  eventos: EventoParaRegistro[];
  classificacoes: Opcao[];
}) {
  const router = useRouter();
  const [site, setSite] = useState("");
  const [evento, setEvento] = useState("");
  const [subevento, setSubevento] = useState("");
  const [classificacao, setClassificacao] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [parcial, setParcial] = useState<Parcial | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const campoDeArquivos = useRef<HTMLInputElement>(null);

  const opcoesDeEvento = useMemo(
    () => eventosDoSite(eventos, site ? Number(site) : null).map((e) => ({ value: String(e.id), label: e.nome })),
    [eventos, site],
  );
  const opcoesDeSubtipo = useMemo(
    () => subtiposDe(eventos, evento ? Number(evento) : null).map((e) => ({ value: String(e.id), label: e.nome })),
    [eventos, evento],
  );

  async function aoEnviar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (ocupado) return;
    setErro(null);

    const arquivos = Array.from(campoDeArquivos.current?.files ?? []);
    if (arquivos.length > MAXIMO_DE_ARQUIVOS) {
      setErro(`No máximo ${MAXIMO_DE_ARQUIVOS} arquivos.`);
      return;
    }
    // Confere ANTES de registrar: um arquivo recusado depois deixaria a
    // ocorrencia sem ele.
    for (const arquivo of arquivos) {
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
    }

    setOcupado(true);
    const formulario = new FormData(e.currentTarget);
    formulario.delete("arquivos");
    const registro = await registrarEvento(formulario);
    if (!registro.ok) {
      setOcupado(false);
      setErro(registro.erro);
      return;
    }

    if (arquivos.length > 0) {
      const storage = createClient().storage.from("ocorrencias");
      const enviados: AnexoEnviado[] = [];
      for (const arquivo of arquivos) {
        const caminho = caminhoDoAnexo(registro.id, crypto.randomUUID(), arquivo.name);
        const { error } = await storage.upload(caminho, arquivo, {
          contentType: tipoPorExtensao(arquivo.name) ?? undefined,
          upsert: false,
        });
        if (error) {
          setOcupado(false);
          setParcial({
            id: registro.id,
            numeroAno: registro.numeroAno,
            mensagem: `O arquivo "${arquivo.name}" não subiu. Anexe pelo botão Adicionar Análise no Painel.`,
          });
          return;
        }
        enviados.push({ storage_path: caminho, nome: arquivo.name });
      }
      const anexados = await anexarArquivosDaAbertura(registro.id, JSON.stringify(enviados));
      if (anexados.erro) {
        setOcupado(false);
        setParcial({ id: registro.id, numeroAno: registro.numeroAno, mensagem: anexados.erro });
        return;
      }
    }

    router.push(`${PAINEL}/${registro.id}`);
  }

  if (parcial) {
    return (
      <div className="space-y-4 p-4">
        <p role="alert" className="rounded-md border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
          Ocorrência nº {parcial.numeroAno} registrada. {parcial.mensagem}
        </p>
        <Button href={`${PAINEL}/${parcial.id}`}>Abrir a ocorrência</Button>
      </div>
    );
  }

  return (
    <form onSubmit={aoEnviar} className="space-y-4 p-4">
      {erro && (
        <p role="alert" className="rounded-md border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {erro}
        </p>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <label htmlFor="site_id" className={rotulo}>
            Site<span className="text-red-400"> *</span>
          </label>
          <Selecao
            id="site_id"
            name="site_id"
            value={site}
            onChange={(v) => {
              setSite(v);
              setEvento("");
              setSubevento("");
            }}
            vazio="Selecione o site"
            opcoes={sites}
            obrigatorio
          />
        </div>

        <div>
          <label htmlFor="evento_id" className={rotulo}>
            Evento<span className="text-red-400"> *</span>
          </label>
          <Selecao
            id="evento_id"
            name="evento_id"
            value={evento}
            onChange={(v) => {
              setEvento(v);
              setSubevento("");
            }}
            vazio={site ? "Selecione o evento" : "Escolha o site primeiro"}
            opcoes={opcoesDeEvento}
            obrigatorio
            disabled={!site}
          />
        </div>

        <div>
          <label htmlFor="subevento_id" className={rotulo}>
            SubTipo de Evento
          </label>
          <Selecao
            id="subevento_id"
            name="subevento_id"
            value={subevento}
            onChange={setSubevento}
            vazio={opcoesDeSubtipo.length > 0 ? "Selecione" : "Este evento não tem subtipos"}
            opcoes={opcoesDeSubtipo}
            disabled={opcoesDeSubtipo.length === 0}
          />
        </div>

        <div>
          <label htmlFor="classificacao_id" className={rotulo}>
            Tipo de Classificação
          </label>
          <Selecao
            id="classificacao_id"
            name="classificacao_id"
            value={classificacao}
            onChange={setClassificacao}
            vazio="Selecione"
            opcoes={classificacoes}
          />
        </div>
      </div>

      <div>
        <label htmlFor="arquivos" className={rotulo}>
          Arquivos
        </label>
        <input
          id="arquivos"
          ref={campoDeArquivos}
          name="arquivos"
          type="file"
          multiple
          accept={ACCEPT_DOS_ARQUIVOS}
          className={`${getInputClasses(false)} file:mr-3 file:cursor-pointer file:rounded file:border-0 file:bg-slate-700 file:px-3 file:py-1 file:text-xs file:font-medium file:text-white`}
        />
        <p className="mt-1.5 text-xs text-brand-muted">
          Até {MAXIMO_DE_ARQUIVOS} arquivos de 10 MB: imagem, PDF, planilha ou ZIP.
        </p>
      </div>

      <div>
        <label htmlFor="observacao" className={rotulo}>
          Observação
        </label>
        <textarea
          id="observacao"
          name="observacao"
          rows={4}
          maxLength={LIMITE_DA_OBSERVACAO}
          placeholder="Digitar observação..."
          className={`${getInputClasses(false)} resize-y`}
        />
      </div>

      <div className="flex items-center gap-3 pt-2">
        <Button type="submit" loading={ocupado} disabled={ocupado}>
          {ocupado ? "Registrando..." : "Salvar"}
        </Button>
        <Link href={PAINEL} className="text-sm text-brand-muted hover:text-white">
          Ir para o Painel de Eventos
        </Link>
      </div>
    </form>
  );
}
