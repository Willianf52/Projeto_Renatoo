import { paraCsv } from "@/lib/csv";
import { FUSO_DO_PROJETO } from "@/lib/data-hora";
import { extrairFiltros, getTodasAsLinhas, rotuloDoStatus, type LinhaDoPainel } from "../../queries";

const COLUNAS_DO_CSV = [
  "Número / Ano",
  "Data",
  "Hora",
  "Site",
  "Evento",
  "SubTipo",
  "Classificação",
  "Usuário Abertura",
  "Status",
  "Descrição",
];

const DATA = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeZone: FUSO_DO_PROJETO });
const HORA = new Intl.DateTimeFormat("pt-BR", { timeStyle: "medium", timeZone: FUSO_DO_PROJETO });

function paraLinhaDoCsv(linha: LinhaDoPainel): string[] {
  const criado = new Date(linha.criadoEm);
  return [
    linha.numeroAno,
    DATA.format(criado),
    HORA.format(criado),
    linha.siteNiveis.join(" > "),
    linha.evento,
    linha.subtipo,
    linha.classificacao,
    linha.usuarioAbertura,
    rotuloDoStatus(linha.status),
    linha.descricao.join(" | "),
  ];
}

/**
 * "Exportar para CSV" do Painel de Eventos: os eventos do filtro inteiro (sem
 * a paginacao da tela), as colunas da lista mais SubTipo, Classificacao e a
 * Descricao do evento. Passa pelo RLS da 0063 como a tela: cada um exporta o
 * que pode ver.
 */
export async function GET(request: Request) {
  const params = Object.fromEntries(new URL(request.url).searchParams);
  const filtros = extrairFiltros(params, new Date());
  const { linhas } = await getTodasAsLinhas(filtros);

  return new Response(paraCsv(COLUNAS_DO_CSV, linhas.map(paraLinhaDoCsv)), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="painel-de-eventos.csv"',
    },
  });
}
