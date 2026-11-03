import { FUSO_DO_PROJETO } from "@/lib/data-hora";
import { rotuloDaSituacaoDoEmail, rotuloDoMotivoDoEmail, rotuloDoStatus, type OcorrenciaDetalhe } from "./queries";

const PAINEL = "/dashboard/eventos/painel-de-eventos";
const HISTORICO = "/dashboard/checklistlab/historico-de-checklist";

const DATA_HORA = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: FUSO_DO_PROJETO,
});

/** "28/08/2026 - 16:01 hs", como no detalhe (e no sistema de referencia). */
function dataHora(iso: string): string {
  return `${DATA_HORA.format(new Date(iso)).replace(", ", " - ")} hs`;
}

/**
 * Uma ocorrencia inteira no papel: os campos do "Registro de Evento On-Line",
 * as fotos, as analises e a finalizacao, e os e-mails enviados. Serve ao
 * "Exportar para PDF" do detalhe e ao "PDF Unificado" do Painel, que imprime
 * uma destas por pagina.
 *
 * Server Component sem estado: o dialogo de impressao e do `ImprimirAoAbrir`
 * na pagina que usa este componente.
 */
export function OcorrenciaImpressa({ ocorrencia, novaPagina = false }: { ocorrencia: OcorrenciaDetalhe; novaPagina?: boolean }) {
  const quando = dataHora(ocorrencia.criadoEm);
  const campos: { rotulo: string; valor: string }[] = [
    { rotulo: "Número / Ano", valor: ocorrencia.numeroAno },
    { rotulo: "Data / Hora", valor: quando },
    { rotulo: "Status", valor: rotuloDoStatus(ocorrencia.status) },
    { rotulo: "Classificação", valor: ocorrencia.classificacao },
    { rotulo: "Site", valor: ocorrencia.siteNiveis.join(" > ") },
    { rotulo: "Evento", valor: ocorrencia.evento },
    { rotulo: "SubTipo", valor: ocorrencia.subtipo },
    { rotulo: "Local do evento", valor: ocorrencia.local },
    { rotulo: "Registrado por", valor: ocorrencia.usuarioAbertura ? `${ocorrencia.usuarioAbertura} em ${quando}` : quando },
  ];

  return (
    <section className={`${novaPagina ? "mt-8 break-before-page print:mt-0" : ""} space-y-4 text-xs`}>
      <h2 className="border-b border-slate-400 pb-1 text-base font-semibold">
        Registro de Evento {ocorrencia.numeroAno}: {ocorrencia.evento}
      </h2>

      <dl className="grid grid-cols-2 gap-x-6 gap-y-2">
        {campos.map((campo) => (
          <div key={campo.rotulo} className="grid grid-cols-[7.5rem_1fr] gap-2">
            <dt className="font-semibold text-slate-600">{campo.rotulo}:</dt>
            <dd className="min-w-0 break-words">{campo.valor}</dd>
          </div>
        ))}
        <div className="col-span-2 grid grid-cols-[7.5rem_1fr] gap-2">
          <dt className="font-semibold text-slate-600">Observação:</dt>
          <dd className="min-w-0 whitespace-pre-line break-words">{ocorrencia.descricao.join("\n")}</dd>
        </div>
      </dl>

      {(ocorrencia.fotos.length > 0 || ocorrencia.arquivosDaAbertura.length > 0) && (
        <div className="break-inside-avoid">
          <h3 className="mb-1 font-semibold">Arquivos ({ocorrencia.fotos.length + ocorrencia.arquivosDaAbertura.length})</h3>
          {ocorrencia.arquivosDaAbertura.length > 0 && (
            <p className="mb-1">{ocorrencia.arquivosDaAbertura.map((a) => a.nome).join(", ")}</p>
          )}
          <div className="flex flex-wrap gap-2">
            {ocorrencia.fotos.map((fotoId) => (
              // Mesma rota e mesmo motivo das fotos do Historico de Checklist (ver midia.ts).
              // eslint-disable-next-line @next/next/no-img-element -- bytes do bucket privado sob a sessao
              <img
                key={fotoId}
                src={`${HISTORICO}/${ocorrencia.checklistId}/fotos/${fotoId}`}
                alt={`Foto do checklist ${ocorrencia.checklistId}`}
                className="h-28 w-28 rounded border border-slate-300 object-cover"
              />
            ))}
          </div>
        </div>
      )}

      <div>
        <h3 className="mb-1 font-semibold">Análises e finalização ({ocorrencia.andamentos.length})</h3>
        {ocorrencia.andamentos.length === 0 ? (
          <p className="text-slate-600">Nenhuma análise registrada para este evento.</p>
        ) : (
          <table className="w-full border-collapse">
            <thead>
              <tr>
                {["Data / Hora", "Tipo", "Usuário", "Tipo de Análise", "Classificação", "Responsável", "Texto"].map((coluna) => (
                  <th key={coluna} className="border border-slate-300 bg-slate-100 px-2 py-1 text-left font-semibold">
                    {coluna}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ocorrencia.andamentos.map((a) => (
                <tr key={a.id} className="break-inside-avoid align-top">
                  <td className="border border-slate-300 px-2 py-1 whitespace-nowrap">{dataHora(a.criadoEm)}</td>
                  <td className="border border-slate-300 px-2 py-1">{a.tipo === "FINALIZACAO" ? "Finalização" : "Análise"}</td>
                  <td className="border border-slate-300 px-2 py-1">{a.autor}</td>
                  <td className="border border-slate-300 px-2 py-1">{a.tipoDeAnalise}</td>
                  <td className="border border-slate-300 px-2 py-1">{a.classificacao}</td>
                  <td className="border border-slate-300 px-2 py-1">{a.responsavel}</td>
                  <td className="border border-slate-300 px-2 py-1 whitespace-pre-line">{a.texto}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {ocorrencia.emails.length > 0 && (
        <div className="break-inside-avoid">
          <h3 className="mb-1 font-semibold">E-mails Enviados</h3>
          <table className="w-full border-collapse">
            <thead>
              <tr>
                {["Destinatário", "Momento", "Data / Hora", "Situação", "Remetente"].map((coluna) => (
                  <th key={coluna} className="border border-slate-300 bg-slate-100 px-2 py-1 text-left font-semibold">
                    {coluna}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ocorrencia.emails.map((e) => (
                <tr key={e.id}>
                  <td className="border border-slate-300 px-2 py-1">{e.destinatario}</td>
                  <td className="border border-slate-300 px-2 py-1">{rotuloDoMotivoDoEmail(e.motivo)}</td>
                  <td className="border border-slate-300 px-2 py-1">{dataHora(e.enviadoEm ?? e.criadoEm)}</td>
                  <td className="border border-slate-300 px-2 py-1">{rotuloDaSituacaoDoEmail(e.status)}</td>
                  <td className="border border-slate-300 px-2 py-1">{e.remetente}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-[10px] text-slate-500 print:hidden">
        <a href={`${PAINEL}/${ocorrencia.id}`}>Abrir este evento no portal</a>
      </p>
    </section>
  );
}
