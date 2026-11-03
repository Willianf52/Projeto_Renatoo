import { chaveDoNome } from "@/app/dashboard/cadastros/grupo-de-sites/importacao";
import { validarAgenda, type AgendaParaGravar, type Recorrencia } from "./regras";

/**
 * "Importar Agendas" com as colunas da planilha de exemplo do sistema de
 * referencia (exemplo_checklistlab_agenda.xlsx), sem banco e sem arquivo:
 *
 *   nome | checklist(nome) | data_planejada | tolerancia(dias) |
 *   responsavel(nome) | grupo Usuarios(nome) | site(nome) |
 *   padrao_recorrencia | dias_uteis | interrupcao | intervalo |
 *   data termina | dias/horas
 *
 * - `site(nome)`: um ou varios sites separados por ";".
 * - `padrao_recorrencia`: dias entre as datas (0 = sem recorrencia, 1 =
 *   diaria, 7 = semanal, 15 = quinzenal, 30 = mensal, 60, 90, 180, 365) ou o
 *   nome ("Mensal").
 * - `dias/horas`: "H" quando a tolerancia vem em horas (vira dias, para cima).
 * - Datas: numero do Excel (46191,625), dd/mm/aaaa (com ou sem hora) ou
 *   aaaa-mm-dd.
 * - `dias_uteis`, `interrupcao` e `intervalo` do antigo nao existem aqui e sao
 *   ignorados.
 *
 * Checklist, sites, responsavel e grupo sao achados pelo NOME, sem acento nem
 * maiuscula, e precisam ja estar cadastrados.
 */

export const MAXIMO_DE_LINHAS = 300;

export type Cadastros = {
  modelos: { id: number; nome: string }[];
  sites: { id: number; nome: string }[];
  usuarios: { id: string; nome: string }[];
  grupos: { id: number; nome: string }[];
};

export type PlanoDeImportacao =
  | { ok: false; erro: string }
  | { ok: true; agendas: AgendaParaGravar[]; erros: { linha: number; mensagem: string }[] };

const PASSOS: Record<string, Recorrencia> = {
  "1": "DIARIO",
  "7": "SEMANAL",
  "14": "QUINZENAL",
  "15": "QUINZENAL",
  "30": "MENSAL",
  "31": "MENSAL",
  "60": "BIMESTRAL",
  "90": "TRIMESTRAL",
  "180": "SEMESTRAL",
  "365": "ANUAL",
  diario: "DIARIO",
  diaria: "DIARIO",
  semanal: "SEMANAL",
  quinzenal: "QUINZENAL",
  mensal: "MENSAL",
  bimestral: "BIMESTRAL",
  trimestral: "TRIMESTRAL",
  semestral: "SEMESTRAL",
  anual: "ANUAL",
};

/** A coluna pelo nome do cabecalho, sem acento, maiuscula nem o "(...)". */
function chaveDaColuna(nome: string): string {
  return chaveDoNome(nome).replace(/\s*\(.*\)\s*/g, "").replace(/\s+/g, " ").trim();
}

/** "aaaa-mm-dd" de uma data do Excel, de dd/mm/aaaa[ hh:mm] ou de aaaa-mm-dd. */
export function lerData(valor: string): string | null {
  const v = valor.trim();
  if (v === "") return null;
  const serial = Number(v.replace(",", "."));
  if (/^\d+([.,]\d+)?$/.test(v) && serial > 20000 && serial < 80000) {
    // O Excel conta dias desde 30/12/1899 (com o bug de 1900, que nao afeta datas atuais).
    const ms = Date.UTC(1899, 11, 30) + Math.floor(serial) * 86_400_000;
    return new Date(ms).toISOString().slice(0, 10);
  }
  const br = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  const iso = v.match(/^(\d{4})-(\d{2})-(\d{2})/);
  const partes = br ? [br[3], br[2], br[1]] : iso ? [iso[1], iso[2], iso[3]] : null;
  if (!partes) return null;
  const [a, m, d] = partes;
  const texto = `${a}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  const data = new Date(`${texto}T12:00:00Z`);
  return !Number.isNaN(data.getTime()) && data.toISOString().slice(0, 10) === texto ? texto : null;
}

export function planejarImportacao(linhas: string[][], cadastros: Cadastros): PlanoDeImportacao {
  const [cabecalho, ...dados] = linhas;
  if (!cabecalho) return { ok: false, erro: "O arquivo está vazio." };

  const indice = (...nomes: string[]) => cabecalho.findIndex((c) => nomes.includes(chaveDaColuna(c)));
  const col = {
    nome: indice("nome"),
    checklist: indice("checklist"),
    data: indice("data_planejada", "data planejada", "data inicial"),
    tolerancia: indice("tolerancia"),
    responsavel: indice("responsavel"),
    grupo: indice("grupo usuarios", "grupo de usuarios"),
    site: indice("site", "sites"),
    recorrencia: indice("padrao_recorrencia", "padrao de recorrencia", "recorrencia"),
    termina: indice("data termina", "data final"),
    unidade: indice("dias/horas"),
  };
  for (const [campo, rotulo] of [
    ["nome", "nome"],
    ["checklist", "checklist(nome)"],
    ["data", "data_planejada"],
    ["site", "site(nome)"],
  ] as const) {
    if (col[campo] === -1) return { ok: false, erro: `O arquivo precisa da coluna "${rotulo}".` };
  }

  const preenchidas = dados.filter((l) => l.some((c) => c.trim() !== ""));
  if (preenchidas.length === 0) return { ok: false, erro: "O arquivo não tem nenhuma agenda." };
  if (preenchidas.length > MAXIMO_DE_LINHAS) {
    return { ok: false, erro: `O arquivo passa de ${MAXIMO_DE_LINHAS} linhas. Divida em arquivos menores.` };
  }

  const porNome = <T extends { nome: string }>(lista: T[]) => new Map(lista.map((x) => [chaveDoNome(x.nome), x]));
  const modelos = porNome(cadastros.modelos);
  const sites = porNome(cadastros.sites);
  const usuarios = porNome(cadastros.usuarios);
  const grupos = porNome(cadastros.grupos);

  const agendas: AgendaParaGravar[] = [];
  const erros: { linha: number; mensagem: string }[] = [];
  const valor = (l: string[], i: number) => (i === -1 ? "" : (l[i] ?? "").trim());

  dados.forEach((l, i) => {
    if (!l.some((c) => c.trim() !== "")) return;
    const linha = i + 2;
    const falha = (mensagem: string) => erros.push({ linha, mensagem });

    const modelo = modelos.get(chaveDoNome(valor(l, col.checklist)));
    if (!modelo) return falha(`Checklist "${valor(l, col.checklist)}" não cadastrado.`);

    const nomesDosSites = valor(l, col.site).split(";").map((s) => s.trim()).filter(Boolean);
    if (nomesDosSites.length === 0) return falha("Sem site.");
    const semCadastro = nomesDosSites.filter((s) => !sites.has(chaveDoNome(s)));
    if (semCadastro.length > 0) return falha(`Site não cadastrado: ${semCadastro.join(", ")}.`);

    const responsavelTexto = valor(l, col.responsavel);
    const responsavel = responsavelTexto ? usuarios.get(chaveDoNome(responsavelTexto)) : undefined;
    if (responsavelTexto && !responsavel) return falha(`Responsável "${responsavelTexto}" não cadastrado.`);

    const grupoTexto = valor(l, col.grupo);
    const grupo = grupoTexto ? grupos.get(chaveDoNome(grupoTexto)) : undefined;
    if (grupoTexto && !grupo) return falha(`Grupo de usuários "${grupoTexto}" não cadastrado.`);

    const inicio = lerData(valor(l, col.data));
    if (!inicio) return falha("Data planejada inválida.");

    const passoTexto = chaveDoNome(valor(l, col.recorrencia) || "0").replace(/[.,]0+$/, "");
    const semRecorrencia = passoTexto === "0" || passoTexto === "";
    const recorrencia: Recorrencia | undefined = semRecorrencia ? "DIARIO" : PASSOS[passoTexto];
    if (!recorrencia) return falha(`Padrão de recorrência "${valor(l, col.recorrencia)}" não reconhecido.`);

    // Sem recorrencia: uma data so (inicio = fim).
    const fim = semRecorrencia ? inicio : lerData(valor(l, col.termina));
    if (!fim) return falha('Com recorrência, informe a "data termina".');

    const toleranciaBruta = Number((valor(l, col.tolerancia) || "0").replace(",", "."));
    if (!Number.isFinite(toleranciaBruta) || toleranciaBruta < 0) return falha("Tolerância inválida.");
    const emHoras = chaveDoNome(valor(l, col.unidade)) === "h";
    const tolerancia = Math.ceil(emHoras ? toleranciaBruta / 24 : toleranciaBruta);

    const validado = validarAgenda({
      nome: valor(l, col.nome),
      modeloId: String(modelo.id),
      responsavelId: responsavel?.id ?? "",
      grupoUsuarioId: grupo ? String(grupo.id) : "",
      dataInicial: inicio,
      dataFinal: fim,
      recorrencia,
      toleranciaDias: String(tolerancia),
      ativo: true,
      sites: nomesDosSites.map((s) => String(sites.get(chaveDoNome(s))!.id)),
    });
    if (!validado.ok) return falha(validado.erro);
    agendas.push(validado.agenda);
  });

  return { ok: true, agendas, erros };
}
