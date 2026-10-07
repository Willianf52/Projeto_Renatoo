import { ImprimirAoAbrir } from "@/components/dashboard/ImprimirAoAbrir";
import { formatarDataHora } from "@/lib/data-hora";
import {
  TETO_DO_PDF_UNIFICADO,
  TIPO_CONSULTORIA,
  camposDoResumo,
  extrairFiltros,
  getChecklistsDetalhados,
  getHistorico,
  type ChecklistDetalhe,
  type FotoDoChecklist,
  type SearchParams,
} from "../../queries";

const LISTAGEM = "/dashboard/checklistlab/historico-de-checklist";

/**
 * "Exportar PDF Unificado": os checklists do filtro, cada um inteiro
 * (cabecalho, respostas, fotos e assinatura), um por pagina, num unico
 * dialogo de impressao. E o que o botao de mesmo nome faz no sistema antigo,
 * que manda todos os ids do filtro de uma vez.
 *
 * Mesmo mecanismo do "Exportar para PDF" ao lado (ver `../pdf/page.tsx`): a
 * pagina espera as consultas e `ImprimirAoAbrir` abre o dialogo, aqui so
 * depois de as fotos chegarem.
 */
export const instant = false;

export default async function ExportarPdfUnificadoPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const filtros = extrairFiltros(await searchParams);
  const historico = await getHistorico(filtros);
  const ids = historico.linhas.slice(0, TETO_DO_PDF_UNIFICADO).map((linha) => linha.id);
  const detalhes = await getChecklistsDetalhados(ids);
  const cortado = historico.truncado || historico.linhas.length > TETO_DO_PDF_UNIFICADO;

  return (
    <div className="bg-white p-6 text-black">
      <ImprimirAoAbrir esperarImagens />

      <h1 className="mb-1 text-lg font-semibold">Histórico de Checklist (PDF unificado)</h1>
      <p className="mb-4 text-xs text-slate-600">
        {detalhes.length} {detalhes.length === 1 ? "checklist" : "checklists"}
        {cortado &&
          `, limitado aos primeiros ${TETO_DO_PDF_UNIFICADO}. Ajuste os filtros para reduzir o total`}
      </p>

      {detalhes.map((detalhe, indice) => (
        <ChecklistImpresso key={detalhe.linha.id} detalhe={detalhe} novaPagina={indice > 0} />
      ))}
    </div>
  );
}

function ChecklistImpresso({ detalhe, novaPagina }: { detalhe: ChecklistDetalhe; novaPagina: boolean }) {
  const { linha } = detalhe;
  const consultoria = linha.tipo === TIPO_CONSULTORIA;

  return (
    <section className={`${novaPagina ? "mt-8 break-before-page print:mt-0" : ""} space-y-4`}>
      <h2 className="border-b border-slate-400 pb-1 text-base font-semibold">
        Checklist de {linha.checklist} ({linha.numeroAno || `#${linha.id}`})
      </h2>

      <dl className="grid grid-cols-3 gap-x-4 gap-y-2 text-xs">
        {camposDoResumo(detalhe).map((campo) => (
          <div key={campo.rotulo} className="min-w-0">
            <dt className="font-semibold uppercase text-slate-600">{campo.rotulo}</dt>
            <dd className="break-words">{campo.valor}</dd>
          </div>
        ))}
      </dl>

      {detalhe.motivoDaCorretiva !== null && (
        <div className="text-xs">
          <h3 className="mb-1 font-semibold">Motivo da visita corretiva</h3>
          <p className="whitespace-pre-line">{detalhe.motivoDaCorretiva}</p>
        </div>
      )}

      {consultoria && (
        <div>
          <h3 className="mb-1 text-xs font-semibold">
            Respostas ({detalhe.respostas.length} de {linha.totalPerguntas})
          </h3>
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr>
                {["Ordem", "Pergunta", "Resposta", "Observação", "Fotos"].map((coluna) => (
                  <th
                    key={coluna}
                    className="border border-slate-300 bg-slate-100 px-2 py-1 text-left font-semibold"
                  >
                    {coluna}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {detalhe.respostas.map((resposta) => (
                <tr key={resposta.perguntaId} className="break-inside-avoid">
                  <td className="border border-slate-300 px-2 py-1">{resposta.ordem}</td>
                  <td className="border border-slate-300 px-2 py-1">{resposta.pergunta}</td>
                  <td className="border border-slate-300 px-2 py-1">{resposta.resposta}</td>
                  <td className="border border-slate-300 px-2 py-1">{resposta.observacao}</td>
                  <td className="border border-slate-300 px-2 py-1">
                    {resposta.fotos.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {resposta.fotos.map((foto) => (
                          <Foto key={foto.id} checklistId={linha.id} foto={foto} tamanho="h-16 w-16" />
                        ))}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {detalhe.fotos.length > 0 && (
        <div>
          <h3 className="mb-1 text-xs font-semibold">{consultoria ? "Fotos gerais" : "Fotos"}</h3>
          <div className="flex flex-wrap gap-2">
            {detalhe.fotos.map((foto) => (
              <figure key={foto.id} className="break-inside-avoid">
                <Foto checklistId={linha.id} foto={foto} tamanho="h-32 w-32" />
                <figcaption className="text-[10px] text-slate-600">{formatarDataHora(foto.criadoEm)}</figcaption>
              </figure>
            ))}
          </div>
        </div>
      )}

      {detalhe.temAssinatura && (
        <div className="break-inside-avoid">
          <h3 className="mb-1 text-xs font-semibold">Assinatura do responsável no local</h3>
          {/* O traco e BRANCO sobre fundo transparente (ver a tela de
              detalhe): `invert` o deixa preto sobre o papel. */}
          {/* eslint-disable-next-line @next/next/no-img-element -- a rota
              devolve bytes do bucket privado sob a sessao de quem pede (ver
              midia.ts); next/image buscaria sem cookie. */}
          <img
            src={`${LISTAGEM}/${linha.id}/assinatura`}
            alt={`Assinatura do checklist ${linha.id}`}
            className="max-h-32 invert"
          />
        </div>
      )}
    </section>
  );
}

function Foto({ checklistId, foto, tamanho }: { checklistId: number; foto: FotoDoChecklist; tamanho: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- ver a assinatura acima.
    <img
      src={`${LISTAGEM}/${checklistId}/fotos/${foto.id}`}
      alt={`Foto do checklist ${checklistId}`}
      className={`${tamanho} rounded border border-slate-300 object-cover`}
    />
  );
}
