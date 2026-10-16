import { chaveDoNome } from "@/app/dashboard/cadastros/grupo-de-sites/importacao";
import { esquemaDeTexto, lerDuracao, lerEmailsDoEvento } from "./regras";

/**
 * Importar Eventos, sem banco e sem arquivo: recebe as linhas do CSV e os
 * eventos que ja existem, e devolve o plano. A action so executa.
 *
 * O FORMATO E O DO NOSSO EXPORTAR (`export/excel/route.ts`), achado pelo
 * NOME do cabecalho: so `Nome` e obrigatoria. Mesmas decisoes do Importar
 * Grupos de Sites (25/09): `ID` e ignorado, e evento que ja existe e PULADO,
 * nunca alterado -- importar nao mexe no que ja estava cadastrado.
 *
 * `Superior` precisa ser um evento JA cadastrado e de primeiro nivel; um pai
 * que so existe no proprio arquivo pede dois envios (o pai primeiro). `Sites`
 * e ignorada: o nome do site se repete entre grupos, e escolher o errado em
 * silencio seria pior que pedir para marcar na edicao.
 */

export const MAXIMO_DE_LINHAS = 1000;

export type EventoParaInserir = {
  nome: string;
  descricao: string | null;
  superior_id: number | null;
  tempo_atendimento_minutos: number | null;
  bloqueio_repeticao_minutos: number | null;
  ativo: boolean;
  emails: string[];
};

export type EventoExistente = { id: number; nome: string; superiorId: number | null };

export type PlanoDeImportacao =
  | { ok: false; erro: string }
  | {
      ok: true;
      novos: EventoParaInserir[];
      pulados: { linha: number; nome: string; motivo: string }[];
      erros: { linha: number; mensagem: string }[];
    };

function indiceDaColuna(cabecalho: string[], nome: string): number {
  return cabecalho.findIndex((coluna) => chaveDoNome(coluna) === nome);
}

export function planejarImportacao(linhas: string[][], existentes: EventoExistente[]): PlanoDeImportacao {
  const [cabecalho, ...dados] = linhas;
  if (!cabecalho) return { ok: false, erro: "O arquivo está vazio." };

  const coluna = {
    nome: indiceDaColuna(cabecalho, "nome"),
    descricao: indiceDaColuna(cabecalho, "descricao"),
    superior: indiceDaColuna(cabecalho, "superior"),
    emails: indiceDaColuna(cabecalho, "e-mails"),
    tempo: indiceDaColuna(cabecalho, "tempo para atendimento"),
    bloqueio: indiceDaColuna(cabecalho, "bloqueio de repeticao"),
    status: indiceDaColuna(cabecalho, "status"),
  };

  if (coluna.nome === -1) {
    return {
      ok: false,
      erro: 'A primeira linha precisa ter a coluna "Nome". Use o arquivo do botão Exportar para Excel como modelo.',
    };
  }
  if (dados.length > MAXIMO_DE_LINHAS) {
    return { ok: false, erro: `O arquivo tem mais de ${MAXIMO_DE_LINHAS} linhas. Divida em arquivos menores.` };
  }

  const porChave = new Map(existentes.map((e) => [chaveDoNome(e.nome), e]));
  const noArquivo = new Set<string>();
  const novos: EventoParaInserir[] = [];
  const pulados: { linha: number; nome: string; motivo: string }[] = [];
  const erros: { linha: number; mensagem: string }[] = [];

  dados.forEach((campos, indice) => {
    const linha = indice + 2;
    if (campos.every((campo) => campo.trim() === "")) return;
    const valor = (i: number) => (i === -1 ? "" : (campos[i] ?? "").trim());

    const nome = valor(coluna.nome).replace(/\s+/g, " ");
    const descricao = valor(coluna.descricao);
    const textoValidado = esquemaDeTexto.safeParse({ nome, descricao });
    if (!textoValidado.success) {
      erros.push({ linha, mensagem: textoValidado.error.issues[0].message });
      return;
    }

    const status = chaveDoNome(valor(coluna.status));
    if (status !== "" && status !== "ativo" && status !== "inativo") {
      erros.push({ linha, mensagem: `Status "${valor(coluna.status)}" inválido: use Ativo ou Inativo.` });
      return;
    }

    let superiorId: number | null = null;
    const superior = valor(coluna.superior);
    if (superior) {
      const pai = porChave.get(chaveDoNome(superior));
      if (!pai) {
        erros.push({ linha, mensagem: `Superior "${superior}" não está cadastrado: importe-o antes.` });
        return;
      }
      if (pai.superiorId !== null) {
        erros.push({ linha, mensagem: `"${superior}" já é um subtipo e não pode ser superior.` });
        return;
      }
      superiorId = pai.id;
    }

    const emails = lerEmailsDoEvento(valor(coluna.emails));
    if (!emails.ok) {
      erros.push({ linha, mensagem: emails.erro });
      return;
    }

    const tempo = lerDuracao(valor(coluna.tempo));
    const bloqueio = lerDuracao(valor(coluna.bloqueio));
    if (!tempo.ok || !bloqueio.ok) {
      erros.push({
        linha,
        mensagem: `${!tempo.ok ? "Tempo para Atendimento" : "Bloqueio de Repetição"} inválido: use, por exemplo, 30 minutos, 2 horas ou 1 dia.`,
      });
      return;
    }

    const chave = chaveDoNome(nome);
    if (porChave.has(chave)) {
      pulados.push({ linha, nome, motivo: "já existe um evento com esse nome" });
      return;
    }
    if (noArquivo.has(chave)) {
      pulados.push({ linha, nome, motivo: "repetido no próprio arquivo" });
      return;
    }

    noArquivo.add(chave);
    novos.push({
      nome,
      descricao: descricao === "" ? null : descricao,
      superior_id: superiorId,
      tempo_atendimento_minutos: tempo.minutos,
      bloqueio_repeticao_minutos: bloqueio.minutos,
      ativo: status !== "inativo",
      emails: emails.emails,
    });
  });

  return { ok: true, novos, pulados, erros };
}
