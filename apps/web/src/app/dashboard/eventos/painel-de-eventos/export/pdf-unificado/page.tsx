import type { Metadata } from "next";
import { CabecalhoDaImpressao } from "@/components/dashboard/CabecalhoDaImpressao";
import { ImprimirAoAbrir } from "@/components/dashboard/ImprimirAoAbrir";
import { OcorrenciaImpressa } from "../../OcorrenciaImpressa";
import { extrairFiltros, getOcorrencia, getTodasAsLinhas, type OcorrenciaDetalhe, type SearchParams } from "../../queries";

/**
 * Pagina de impressao aberta em aba nova; espera as consultas antes de
 * renderizar (ver `historico-de-checklist/export/pdf/page.tsx`).
 */
export const instant = false;

/** O titulo da aba vira o nome sugerido do arquivo ao salvar como PDF. */
export const metadata: Metadata = { title: "eventos_unificado" };

/**
 * Cada evento custa algumas consultas (andamentos, fotos, e-mails); passar
 * disto deixa a aba minutos carregando. A pagina diz que cortou.
 */
const TETO_DO_PDF_UNIFICADO = 50;

/**
 * "Exportar Eventos para PDF Unificado": os eventos do filtro, cada um inteiro
 * (campos, fotos, analises e e-mails), um por pagina, num unico dialogo de
 * impressao -- o que o botao de mesmo nome faz no sistema de referencia.
 */
export default async function PdfUnificadoDosEventosPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const filtros = extrairFiltros(await searchParams, new Date());
  const { linhas, cortado } = await getTodasAsLinhas(filtros);
  const escolhidas = linhas.slice(0, TETO_DO_PDF_UNIFICADO);
  const detalhes = (await Promise.all(escolhidas.map((linha) => getOcorrencia(linha.id)))).filter(
    (d): d is OcorrenciaDetalhe => d !== null,
  );
  const limitado = cortado || linhas.length > TETO_DO_PDF_UNIFICADO;

  return (
    <div data-paleta="original" className="bg-white p-6 text-black">
      <ImprimirAoAbrir esperarImagens />

      {detalhes.length === 0 && (
        <>
          <CabecalhoDaImpressao titulo="Painel de Eventos" />
          <p className="text-sm">Nenhum evento encontrado com os filtros escolhidos.</p>
        </>
      )}

      {/* A quantidade vai sob o titulo da primeira folha, e nao num titulo
          proprio acima dela: o logo fica no topo, como nos outros PDFs. */}
      {detalhes.map((detalhe, indice) => (
        <OcorrenciaImpressa
          key={detalhe.id}
          ocorrencia={detalhe}
          novaPagina={indice > 0}
          apoio={
            indice === 0
              ? `Painel de Eventos: ${detalhes.length} ${detalhes.length === 1 ? "evento" : "eventos"}${
                  limitado ? `, limitado aos ${TETO_DO_PDF_UNIFICADO} mais recentes` : ""
                }`
              : undefined
          }
        />
      ))}
    </div>
  );
}
