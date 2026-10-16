import { ROTULO_DO_TIPO_DE_RESPOSTA, TIPOS_DE_RESPOSTA, type TipoDeResposta } from "@projeto-renatoo/shared";
import { chaveDoNome } from "@/app/dashboard/cadastros/grupo-de-sites/importacao";

/**
 * Importar Perguntas de UM checklist (migration 0073), sem banco e sem
 * arquivo: recebe as linhas do CSV e o que ja existe, e devolve o plano.
 *
 * Colunas achadas pelo NOME do cabecalho: so `Pergunta` e obrigatoria.
 *   - `Respostas`: o codigo (CNA, CN, SN) ou o rotulo da tela; vazio vale CNA,
 *     o tipo de quase todas as perguntas de hoje (638 de 738).
 *   - `Grupo` e `Tipo de Evento`: pelo nome, e precisam ja estar cadastrados.
 *     Vazio: sem grupo / "NÃO CONFORMIDADE".
 *   - `Status`: Ativa/Ativo ou Inativa/Inativo; vazio vale ativa.
 * `Ordem` e ignorada: as perguntas entram no FIM do checklist, na ordem do
 * arquivo -- aceitar a ordem da planilha bateria no `unique (modelo_id,
 * ordem)` a cada linha repetida, e reordenar depois e uma seta na lista.
 *
 * Pergunta que ja existe no checklist (mesmo texto, sem acento nem maiuscula)
 * e PULADA, nunca alterada -- mesma regra dos outros Importar.
 */

export const MAXIMO_DE_LINHAS = 500;

export type PerguntaParaInserir = {
  ordem: number;
  texto: string;
  tipo_resposta: TipoDeResposta;
  grupo_pergunta_id: number | null;
  evento_id: number | null;
  ativo: boolean;
};

export type Existentes = {
  textos: string[];
  maiorOrdem: number;
  grupos: { id: number; nome: string }[];
  eventos: { id: number; nome: string }[];
};

export type PlanoDeImportacao =
  | { ok: false; erro: string }
  | {
      ok: true;
      novas: PerguntaParaInserir[];
      pulados: { linha: number; nome: string; motivo: string }[];
      erros: { linha: number; mensagem: string }[];
    };

function indiceDaColuna(cabecalho: string[], ...nomes: string[]): number {
  return cabecalho.findIndex((coluna) => nomes.includes(chaveDoNome(coluna)));
}

/** "CNA", "cn", ou o rotulo da tela ("Sim / Não"). */
export function lerTipoDeResposta(valor: string): TipoDeResposta | null {
  const limpo = valor.trim();
  if (limpo === "") return "CNA";
  const codigo = limpo.toUpperCase();
  if ((TIPOS_DE_RESPOSTA as readonly string[]).includes(codigo)) return codigo as TipoDeResposta;
  const chave = chaveDoNome(limpo).replace(/\s*\/\s*/g, "/");
  for (const tipo of TIPOS_DE_RESPOSTA) {
    if (chaveDoNome(ROTULO_DO_TIPO_DE_RESPOSTA[tipo]).replace(/\s*\/\s*/g, "/") === chave) return tipo;
  }
  return null;
}

export function planejarImportacao(linhas: string[][], existentes: Existentes): PlanoDeImportacao {
  const [cabecalho, ...dados] = linhas;
  if (!cabecalho) return { ok: false, erro: "O arquivo está vazio." };

  const coluna = {
    texto: indiceDaColuna(cabecalho, "pergunta"),
    tipo: indiceDaColuna(cabecalho, "respostas", "tipo de resposta"),
    grupo: indiceDaColuna(cabecalho, "grupo", "grupo de perguntas"),
    evento: indiceDaColuna(cabecalho, "tipo de evento", "evento"),
    status: indiceDaColuna(cabecalho, "status"),
  };
  if (coluna.texto === -1) {
    return { ok: false, erro: 'A primeira linha precisa ter a coluna "Pergunta".' };
  }
  if (dados.length > MAXIMO_DE_LINHAS) {
    return { ok: false, erro: `O arquivo tem mais de ${MAXIMO_DE_LINHAS} linhas. Divida em arquivos menores.` };
  }

  const grupoPorNome = new Map(existentes.grupos.map((g) => [chaveDoNome(g.nome), g.id]));
  const eventoPorNome = new Map(existentes.eventos.map((e) => [chaveDoNome(e.nome), e.id]));
  const jaExistem = new Set(existentes.textos.map(chaveDoNome));
  const noArquivo = new Set<string>();
  let proxima = existentes.maiorOrdem;

  const novas: PerguntaParaInserir[] = [];
  const pulados: { linha: number; nome: string; motivo: string }[] = [];
  const erros: { linha: number; mensagem: string }[] = [];

  dados.forEach((campos, indice) => {
    const linha = indice + 2;
    if (campos.every((campo) => campo.trim() === "")) return;
    const valor = (i: number) => (i === -1 ? "" : (campos[i] ?? "").trim());

    const texto = valor(coluna.texto).replace(/\s+/g, " ");
    if (!texto) return void erros.push({ linha, mensagem: "Informe o texto da pergunta." });
    if (texto.length > 300) return void erros.push({ linha, mensagem: "A pergunta deve ter no máximo 300 caracteres." });

    const tipo = lerTipoDeResposta(valor(coluna.tipo));
    if (!tipo) {
      return void erros.push({ linha, mensagem: `Respostas "${valor(coluna.tipo)}" inválidas: use CNA, CN ou SN.` });
    }

    let grupoId: number | null = null;
    if (valor(coluna.grupo)) {
      grupoId = grupoPorNome.get(chaveDoNome(valor(coluna.grupo))) ?? null;
      if (grupoId === null) {
        return void erros.push({ linha, mensagem: `Grupo "${valor(coluna.grupo)}" não está cadastrado em Grupo Perguntas.` });
      }
    }

    let eventoId: number | null = null;
    if (valor(coluna.evento)) {
      eventoId = eventoPorNome.get(chaveDoNome(valor(coluna.evento))) ?? null;
      if (eventoId === null) {
        return void erros.push({ linha, mensagem: `Tipo de evento "${valor(coluna.evento)}" não está cadastrado.` });
      }
    }

    const status = chaveDoNome(valor(coluna.status));
    if (!["", "ativa", "ativo", "inativa", "inativo"].includes(status)) {
      return void erros.push({ linha, mensagem: `Status "${valor(coluna.status)}" inválido: use Ativa ou Inativa.` });
    }

    const chave = chaveDoNome(texto);
    if (jaExistem.has(chave)) return void pulados.push({ linha, nome: texto, motivo: "já existe neste checklist" });
    if (noArquivo.has(chave)) return void pulados.push({ linha, nome: texto, motivo: "repetida no próprio arquivo" });
    noArquivo.add(chave);

    proxima += 1;
    novas.push({
      ordem: proxima,
      texto,
      tipo_resposta: tipo,
      grupo_pergunta_id: grupoId,
      evento_id: eventoId,
      ativo: !status.startsWith("inativ"),
    });
  });

  if (proxima > 9999) return { ok: false, erro: "O checklist passaria de 9999 perguntas." };
  return { ok: true, novas, pulados, erros };
}
