import { CARGO_CLIENTE, EMAIL_VALIDO, type ValoresDoUsuario } from "./criar-conta";
import { erroDosDadosPessoais } from "./dados-pessoais";

/**
 * Planejador do Importar usuarios: le as linhas do CSV e decide, sem gravar
 * nada, quem sera criado, quem ja existe no portal e o que esta errado.
 *
 * As colunas sao achadas pelo nome do cabecalho, sem acento, maiuscula nem
 * pontuacao ("E-mail de acesso" = "emaildeacesso", "R.E." = "re"). So "Nome"
 * e obrigatoria; as outras tem default, e coluna desconhecida e ignorada.
 *
 * E-MAIL DE ACESSO. O portal e o app entram so por e-mail e senha. No sistema
 * antigo cada usuario tem um "Login" e um "E-mail", e quem entra usa o login.
 * Por isso: a coluna "E-mail de acesso", se vier; senao o Login, quando ele
 * tem formato de e-mail; senao o E-mail.
 *
 * Quem ja existe no portal (pelo e-mail de acesso) e pulado, nunca alterado: a
 * importacao so cria. Para mudar alguem que ja existe, ha a tela de edicao.
 */

export const MAXIMO_DE_LINHAS = 200;

export type PerfilConhecido = { id: string; email: string | null; nome: string; login: string | null };
export type GrupoConhecido = { id: number; nome: string };

export type SuperiorDoUsuario = { tipo: "existente"; id: string } | { tipo: "novo"; chave: string } | null;

/** Os valores do formulario, menos a senha (vem da tela) e o superior (resolvido na gravacao). */
export type DadosDoUsuarioNovo = Omit<ValoresDoUsuario, "senha" | "superiorId">;

export type UsuarioParaCriar = {
  /** Numero da linha na planilha, contando o cabecalho como 1. */
  linha: number;
  /** O e-mail de acesso: chave unica dentro do arquivo. */
  chave: string;
  dados: DadosDoUsuarioNovo;
  superior: SuperiorDoUsuario;
  superiorNome: string | null;
  /** 0 = sem superior novo; 1 = o superior e uma linha de nivel 0; e assim por diante. */
  nivel: number;
};

export type UsuarioQueJaExiste = { linha: number; nome: string; email: string };

export type PlanoDeUsuarios =
  | { ok: false; erro: string }
  | {
      ok: true;
      novos: UsuarioParaCriar[];
      existentes: UsuarioQueJaExiste[];
      erros: { linha: number; mensagem: string }[];
      /** CLIENTE sem grupo de sites: entra, mas nao enxerga nada ate alguem ligar os grupos. */
      clientesSemGrupo: number;
    };

const COLUNAS = {
  nome: ["nome", "nomecompleto"],
  login: ["login"],
  email: ["email"],
  acesso: ["emaildeacesso", "acesso"],
  funcao: ["funcao"],
  nivel: ["niveldeacesso", "nivel", "cargo"],
  tipo: ["tipo", "tipodeusuario"],
  pais: ["pais"],
  superior: ["usuariosuperior", "superior"],
  ocorrencia: ["emailocorrencia", "ocorrencia"],
  checklist: ["emailchecklist", "checklist", "checklistchecklistlab"],
  evento: ["emailevento", "evento"],
  status: ["status", "situacao", "ativo"],
  cpf: ["cpf"],
  re: ["re"],
  telefone: ["telefone"],
  celular: ["celular"],
  grupos: ["gruposdesites", "gruposdesitesdocliente", "grupos"],
} as const;

type Coluna = keyof typeof COLUNAS;

function normalizarCabecalho(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

/** Comparacao de nomes e referencias: sem acento, sem maiuscula, espacos unicos. */
function chaveDeTexto(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

const NIVEIS: Record<string, string> = {
  gestor: "GESTOR",
  supervisor: "SUPERVISOR",
  operacional: "OPERACIONAL",
  operador: "OPERADOR",
  cliente: "CLIENTE",
  inspetor: "INSPETOR",
};

const TIPOS: Record<string, string> = {
  "": "PADRAO",
  padrao: "PADRAO",
  usuariopadrao: "PADRAO",
  sistema: "SISTEMA",
  usuariosistema: "SISTEMA",
  powerdesk: "POWERDESK",
  usuariopowerdesk: "POWERDESK",
};

const VERDADEIRO = new Set(["sim", "s", "1", "true", "x", "ativo"]);
const FALSO = new Set(["", "nao", "n", "0", "false", "inativo"]);

function lerSimNao(valor: string): boolean | null {
  const v = normalizarCabecalho(valor);
  if (VERDADEIRO.has(v)) return true;
  if (FALSO.has(v)) return false;
  return null;
}

/** O e-mail de acesso, pela regra do cabecalho. `null` quando nenhum dos tres serve. */
export function emailDeAcesso(acesso: string, login: string, email: string): string | null {
  // A coluna "E-mail de acesso" preenchida decide sozinha, mesmo errada: quem a
  // preencheu disse qual queria, e trocar por outra seria surpresa.
  const escolhido = acesso.trim().toLowerCase();
  if (escolhido) return EMAIL_VALIDO.test(escolhido) ? escolhido : null;

  for (const candidato of [login, email]) {
    const limpo = candidato.trim().toLowerCase();
    if (limpo && EMAIL_VALIDO.test(limpo)) return limpo;
  }
  return null;
}

type LinhaLida = {
  linha: number;
  chave: string;
  dados: DadosDoUsuarioNovo;
  superiorTexto: string;
};

export function planejarImportacaoDeUsuarios(
  linhas: string[][],
  ref: { perfis: PerfilConhecido[]; grupos: GrupoConhecido[] },
): PlanoDeUsuarios {
  const [cabecalho, ...dados] = linhas;
  if (!cabecalho) return { ok: false, erro: "O arquivo está vazio." };

  const indice = new Map<Coluna, number>();
  cabecalho.forEach((coluna, i) => {
    const nome = normalizarCabecalho(coluna);
    for (const [chave, apelidos] of Object.entries(COLUNAS) as [Coluna, readonly string[]][]) {
      if (!indice.has(chave) && apelidos.includes(nome)) indice.set(chave, i);
    }
  });

  if (!indice.has("nome")) return { ok: false, erro: 'O arquivo precisa ter a coluna "Nome".' };

  const comConteudo = dados.filter((l) => l.some((c) => c.trim() !== ""));
  if (comConteudo.length === 0) return { ok: false, erro: "O arquivo não tem nenhum usuário." };
  if (comConteudo.length > MAXIMO_DE_LINHAS) {
    return { ok: false, erro: `O arquivo tem mais de ${MAXIMO_DE_LINHAS} usuários. Divida em arquivos menores.` };
  }

  const erros: { linha: number; mensagem: string }[] = [];
  const existentes: UsuarioQueJaExiste[] = [];
  const lidas: LinhaLida[] = [];
  const chavesVistas = new Map<string, number>();

  const perfilPorEmail = new Map(
    ref.perfis.filter((p) => p.email).map((p) => [p.email!.toLowerCase(), p]),
  );
  const grupoPorNome = new Map(ref.grupos.map((g) => [chaveDeTexto(g.nome), g.id]));

  dados.forEach((celulas, i) => {
    const numero = i + 2;
    if (!celulas.some((c) => c.trim() !== "")) return;

    const valor = (coluna: Coluna) => {
      const pos = indice.get(coluna);
      return pos === undefined ? "" : (celulas[pos] ?? "").trim();
    };
    const recusar = (mensagem: string) => erros.push({ linha: numero, mensagem });

    const nome = valor("nome");
    if (!nome) return recusar('A coluna "Nome" está vazia.');
    if (nome.length > 200) return recusar("O nome deve ter no máximo 200 caracteres.");

    const login = valor("login");
    const funcao = valor("funcao");
    if (login.length > 100 || funcao.length > 100) return recusar("Login e função devem ter no máximo 100 caracteres.");

    const pais = valor("pais");
    if (pais.length > 100) return recusar("O país deve ter no máximo 100 caracteres.");

    const chave = emailDeAcesso(valor("acesso"), login, valor("email"));
    if (!chave) return recusar(`${nome}: sem e-mail de acesso válido (nem o login nem o e-mail têm formato de e-mail).`);

    const repetida = chavesVistas.get(chave);
    if (repetida !== undefined) return recusar(`${nome}: o e-mail de acesso ${chave} já aparece na linha ${repetida}.`);
    chavesVistas.set(chave, numero);

    const textoDoNivel = valor("nivel");
    const cargo = NIVEIS[normalizarCabecalho(textoDoNivel)];
    if (!cargo) return recusar(`${nome}: nível de acesso "${textoDoNivel}" não existe no portal.`);

    const textoDoTipo = valor("tipo");
    const tipo = TIPOS[normalizarCabecalho(textoDoTipo)];
    if (!tipo) return recusar(`${nome}: tipo de usuário "${textoDoTipo}" não existe no portal.`);

    const ativo = lerSimNao(valor("status") || "ativo");
    if (ativo === null) return recusar(`${nome}: status "${valor("status")}" não é Ativo nem Inativo.`);

    const avisos: Record<"ocorrencia" | "checklist" | "evento", boolean> = { ocorrencia: false, checklist: false, evento: false };
    for (const coluna of ["ocorrencia", "checklist", "evento"] as const) {
      const lido = lerSimNao(valor(coluna));
      if (lido === null) return recusar(`${nome}: "${valor(coluna)}" na coluna de e-mail ao superior não é Sim nem Não.`);
      avisos[coluna] = lido;
    }

    const gruposDoCliente: string[] = [];
    if (cargo === CARGO_CLIENTE) {
      for (const nomeDoGrupo of valor("grupos").split("|").map((g) => g.trim()).filter(Boolean)) {
        const id = grupoPorNome.get(chaveDeTexto(nomeDoGrupo));
        if (id === undefined) return recusar(`${nome}: grupo de sites "${nomeDoGrupo}" não existe no portal.`);
        gruposDoCliente.push(String(id));
      }
    }

    const pessoais = { cpf: valor("cpf"), re: valor("re"), telefone: valor("telefone"), celular: valor("celular") };
    const erroPessoal = erroDosDadosPessoais(pessoais);
    if (erroPessoal) return recusar(`${nome}: ${erroPessoal}`);

    if (perfilPorEmail.has(chave)) {
      existentes.push({ linha: numero, nome, email: chave });
      return;
    }

    lidas.push({
      linha: numero,
      chave,
      superiorTexto: valor("superior"),
      dados: {
        nomeCompleto: nome,
        email: chave,
        login,
        funcao,
        pais,
        cargo,
        tipo,
        ativo,
        gruposDoCliente,
        ...pessoais,
        emailSuperiorOcorrencia: avisos.ocorrencia,
        emailSuperiorChecklist: avisos.checklist,
        emailSuperiorEvento: avisos.evento,
      },
    });
  });

  // Superior: outra linha do arquivo (por e-mail de acesso, login, e-mail ou
  // nome) ou alguem que ja existe no portal (por e-mail ou nome).
  const novaPorReferencia = new Map<string, string>();
  for (const l of lidas) {
    for (const ref of [l.chave, l.dados.login, l.dados.nomeCompleto]) {
      if (ref) novaPorReferencia.set(chaveDeTexto(ref), l.chave);
    }
  }
  const existentePorReferencia = new Map<string, PerfilConhecido[]>();
  for (const p of ref.perfis) {
    for (const r of [p.email ?? "", p.login ?? "", p.nome]) {
      if (!r) continue;
      const k = chaveDeTexto(r);
      existentePorReferencia.set(k, [...(existentePorReferencia.get(k) ?? []), p]);
    }
  }

  const superiorDe = new Map<string, { superior: SuperiorDoUsuario; nome: string | null }>();
  for (const l of lidas) {
    if (!l.superiorTexto) {
      superiorDe.set(l.chave, { superior: null, nome: null });
      continue;
    }
    const k = chaveDeTexto(l.superiorTexto);
    const nova = novaPorReferencia.get(k);
    if (nova) {
      if (nova === l.chave) {
        erros.push({ linha: l.linha, mensagem: `${l.dados.nomeCompleto}: um usuário não pode ser o próprio superior.` });
        continue;
      }
      superiorDe.set(l.chave, { superior: { tipo: "novo", chave: nova }, nome: l.superiorTexto });
      continue;
    }
    const achados = [...new Map((existentePorReferencia.get(k) ?? []).map((p) => [p.id, p])).values()];
    if (achados.length === 1) {
      superiorDe.set(l.chave, { superior: { tipo: "existente", id: achados[0].id }, nome: achados[0].nome || l.superiorTexto });
    } else if (achados.length > 1) {
      erros.push({ linha: l.linha, mensagem: `${l.dados.nomeCompleto}: há mais de um usuário "${l.superiorTexto}" no portal; use o e-mail do superior.` });
    } else {
      erros.push({ linha: l.linha, mensagem: `${l.dados.nomeCompleto}: superior "${l.superiorTexto}" não encontrado no arquivo nem no portal.` });
    }
  }

  // Nivel de cada nova (profundidade da cadeia de superiores novos), com
  // deteccao de ciclo: A chefe de B e B chefe de A nao tem ordem de criacao.
  const nivelDe = new Map<string, number>();
  const visitando = new Set<string>();
  const calcular = (chave: string): number | null => {
    const pronto = nivelDe.get(chave);
    if (pronto !== undefined) return pronto;
    if (visitando.has(chave)) return null;
    visitando.add(chave);
    const s = superiorDe.get(chave)?.superior;
    let nivel = 0;
    if (s?.tipo === "novo") {
      const acima = calcular(s.chave);
      if (acima === null) return null;
      nivel = acima + 1;
    }
    visitando.delete(chave);
    nivelDe.set(chave, nivel);
    return nivel;
  };

  const novos: UsuarioParaCriar[] = [];
  for (const l of lidas) {
    const resolvido = superiorDe.get(l.chave);
    if (!resolvido) continue; // ja virou erro acima
    const nivel = calcular(l.chave);
    if (nivel === null) {
      erros.push({ linha: l.linha, mensagem: `${l.dados.nomeCompleto}: os superiores formam um ciclo no arquivo.` });
      continue;
    }
    novos.push({
      linha: l.linha,
      chave: l.chave,
      dados: l.dados,
      superior: resolvido.superior,
      superiorNome: resolvido.nome,
      nivel,
    });
  }

  erros.sort((a, b) => a.linha - b.linha);

  return {
    ok: true,
    novos,
    existentes,
    erros,
    clientesSemGrupo: novos.filter((n) => n.dados.cargo === CARGO_CLIENTE && n.dados.gruposDoCliente.length === 0).length,
  };
}
