import { erro } from "@/lib/log";
import type { createAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@projeto-renatoo/shared";
import { VALORES_VAZIOS } from "./constantes";
import { paraGravar } from "./dados-pessoais";

/**
 * Gravacao de conta de usuario com service_role, compartilhada pelo formulario
 * (`actions.ts`) e pelo Importar usuarios (`importar/actions.ts`).
 *
 * Nada aqui confere permissao: quem chama TEM que ter conferido
 * `podeAdministrarUsuarios()` com o cliente da sessao antes. O motivo esta no
 * cabecalho de `actions.ts` -- service_role ignora o RLS, entao a checagem de
 * quem chama e o unico portao.
 */

export type ClienteAdmin = ReturnType<typeof createAdminClient>;

/** Default da coluna `profiles.pais` (migration 0058). */
export const PAIS_PADRAO = VALORES_VAZIOS.pais;

export const CARGO_CLIENTE = "CLIENTE";

export const EMAIL_VALIDO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type ValoresDoUsuario = {
  nomeCompleto: string;
  email: string;
  senha: string;
  login: string;
  funcao: string;
  /** Migration 0058. `not null` com default no banco -- o formulario abre
   * preenchido, e string vazia aqui vira o default na gravacao. */
  pais: string;
  cargo: string;
  /** Migration 0019. Coluna sem grant para `authenticated`, como `cargo`:
   * so passa por aqui, atras da checagem de permissao. */
  tipo: string;
  superiorId: string;
  ativo: boolean;
  /** Ids de `grupos_sites` que um CLIENTE enxerga (migration 0014). Ignorado
   * para os demais niveis, que nao tem escopo restrito. */
  gruposDoCliente: string[];
  /** Migration 0068: `dados_pessoais_dos_usuarios`, so pela service_role. */
  cpf: string;
  re: string;
  telefone: string;
  celular: string;
  /** "Enviar E-mail para o Superior?" (0068). */
  emailSuperiorOcorrencia: boolean;
  emailSuperiorChecklist: boolean;
  emailSuperiorEvento: boolean;
};

/** As colunas de `profiles` que o formulario e a importacao gravam. */
export function perfilDosValores(valores: ValoresDoUsuario) {
  return {
    nome_completo: valores.nomeCompleto,
    login: valores.login || null,
    funcao: valores.funcao || null,
    // `|| PAIS_PADRAO` e nao `|| null`: a coluna e `not null`. Campo apagado
    // na tela volta ao default em vez de recusar a gravacao inteira.
    pais: valores.pais || PAIS_PADRAO,
    cargo: valores.cargo,
    tipo: valores.tipo,
    ativo: valores.ativo,
    superior_id: valores.superiorId || null,
    email_superior_ocorrencia: valores.emailSuperiorOcorrencia,
    email_superior_checklist: valores.emailSuperiorChecklist,
    email_superior_evento: valores.emailSuperiorEvento,
  };
}

/**
 * Grava `dados_pessoais_dos_usuarios` (migration 0068): upsert com o que veio,
 * ou apaga a linha quando os quatro campos ficaram em branco -- "sem dados
 * pessoais" e ausencia de linha, nao uma linha de nulos.
 */
export async function gravarDadosPessoais(
  admin: ClienteAdmin,
  profileId: string,
  valores: ValoresDoUsuario,
): Promise<string | null> {
  const dados = paraGravar(valores);

  if (Object.values(dados).every((valor) => valor === null)) {
    const { error } = await admin.from("dados_pessoais_dos_usuarios").delete().eq("profile_id", profileId);
    return error?.message ?? null;
  }

  const { error } = await admin
    .from("dados_pessoais_dos_usuarios")
    .upsert({ profile_id: profileId, ...dados, atualizado_em: new Date().toISOString() });
  return error?.message ?? null;
}

/**
 * Sincroniza `grupos_sites_clientes` (migration 0014).
 *
 * Nivel diferente de CLIENTE limpa o vinculo em vez de ignora-lo: rebaixar
 * alguem de CLIENTE para OPERADOR e depois promove-lo de volta reativaria em
 * silencio um escopo que ninguem reviu. Some junto com o nivel que lhe dava
 * sentido.
 */
export async function sincronizarEscopo(
  admin: ClienteAdmin,
  profileId: string,
  valores: ValoresDoUsuario,
): Promise<string | null> {
  const { error: erroLimpeza } = await admin
    .from("grupos_sites_clientes")
    .delete()
    .eq("profile_id", profileId);

  if (erroLimpeza) return erroLimpeza.message;

  if (valores.cargo !== CARGO_CLIENTE || valores.gruposDoCliente.length === 0) return null;

  const { error } = await admin.from("grupos_sites_clientes").insert(
    valores.gruposDoCliente.map((grupoId) => ({
      profile_id: profileId,
      grupo_site_id: Number(grupoId),
    })),
  );

  return error?.message ?? null;
}

/**
 * Os grupos de sites de um CLIENTE como entram na auditoria: ids, sem
 * repeticao, em ordem -- e lista vazia para qualquer outro nivel, que e o que
 * `sincronizarEscopo` de fato grava.
 */
export function gruposDoClienteGravados(valores: ValoresDoUsuario): number[] {
  if (valores.cargo !== CARGO_CLIENTE) return [];
  return [...new Set(valores.gruposDoCliente.map(Number))].sort((a, b) => a - b);
}

/**
 * Os grupos de sites que o usuario enxerga hoje, para o "antes" da auditoria.
 * `null` quando a leitura falha: a auditoria registra que nao se soube, em vez
 * de afirmar "nenhum".
 */
export async function lerGruposDoCliente(admin: ClienteAdmin, profileId: string): Promise<number[] | null> {
  const { data, error } = await admin
    .from("grupos_sites_clientes")
    .select("grupo_site_id")
    .eq("profile_id", profileId);

  if (error || !data) return null;
  return data.map((linha) => linha.grupo_site_id).sort((a, b) => a - b);
}

/**
 * Grava em `auditoria` (migration 0034) a mudanca que o trigger generico nao
 * alcanca -- ver o comentario do cabecalho de `actions.ts`. Best-effort: falha
 * ao registrar vira `erro()`, nunca recusa nem desfaz a escrita em `profiles`
 * que ja aconteceu -- a auditoria e trilha, nao portao.
 */
export async function registrarAuditoria(
  admin: ClienteAdmin,
  idRequisicao: string,
  entrada: {
    registroId: string;
    operacao: "INSERT" | "UPDATE";
    atorId: string;
    dadosAntigos: Record<string, unknown> | null;
    dadosNovos: Record<string, unknown>;
  },
): Promise<void> {
  const { error } = await admin.from("auditoria").insert({
    tabela: "profiles",
    registro_id: entrada.registroId,
    operacao: entrada.operacao,
    ator_id: entrada.atorId || null,
    dados_antigos: entrada.dadosAntigos as Json | null,
    dados_novos: entrada.dadosNovos as Json,
  });

  if (error) {
    erro(idRequisicao, "Administração de usuários: falha ao registrar em `auditoria`.", error);
  }
}

/** Traducoes dos codigos do Postgres/GoTrue que a pessoa consegue provocar. */
export function traduzirErro(mensagem: string | undefined): string {
  const texto = (mensagem ?? "").toLowerCase();

  if (texto.includes("already been registered") || texto.includes("already exists")) {
    return "Já existe um usuário com esse e-mail.";
  }
  if (texto.includes("password")) {
    return "A senha não atende aos requisitos.";
  }
  return "Não foi possível salvar o usuário. Tente novamente.";
}

export type ContaCriada = { ok: true; id: string } | { ok: false; erro: string };

/**
 * Cria a conta inteira: autenticacao, perfil, trilha, escopo do cliente e dados
 * pessoais. Qualquer passo que falhe depois da conta de autenticacao existir a
 * apaga, para a pessoa poder tentar de novo com o mesmo e-mail -- conta pela
 * metade e pior que conta nenhuma.
 *
 * Quem chama ja validou os valores e a senha (`isPasswordValid` e
 * `senhaVazada`) e ja conferiu `podeAdministrarUsuarios()`.
 */
export async function criarConta(
  admin: ClienteAdmin,
  idRequisicao: string,
  atorId: string,
  valores: ValoresDoUsuario,
): Promise<ContaCriada> {
  const perfil = perfilDosValores(valores);

  // `email_confirm: true` porque quem cria e a gestao, nao a propria pessoa:
  // nao ha e-mail de confirmacao para ela responder. Sem isso a conta nasce
  // sem poder logar.
  const { data, error } = await admin.auth.admin.createUser({
    email: valores.email,
    password: valores.senha,
    email_confirm: true,
  });

  if (error || !data.user) {
    erro(idRequisicao, "Administração de usuários: falha ao criar conta.", error);
    return { ok: false, erro: traduzirErro(error?.message) };
  }

  /**
   * O trigger `handle_new_user` (migration 0008) ja criou o perfil, sempre
   * OPERADOR e inativo -- de proposito, e ele nao le nada de
   * `raw_user_meta_data`. O nivel e a situacao escolhidos aqui sao aplicados
   * neste segundo passo, que so acontece depois da checagem de permissao de
   * quem chama.
   */
  const { error: erroPerfil } = await admin.from("profiles").update(perfil).eq("id", data.user.id);

  if (erroPerfil) {
    // A conta de autenticacao ja existe neste ponto. Deixa-la com o perfil
    // pela metade seria pior que nao ter criado: apaga e devolve o erro,
    // para a pessoa poder tentar de novo com o mesmo e-mail.
    await admin.auth.admin.deleteUser(data.user.id);
    erro(idRequisicao, "Administração de usuários: falha ao gravar perfil; conta desfeita.", erroPerfil);
    return { ok: false, erro: traduzirErro(erroPerfil.message) };
  }

  await registrarAuditoria(admin, idRequisicao, {
    registroId: data.user.id,
    operacao: "INSERT",
    atorId,
    dadosAntigos: null,
    dadosNovos: { ...perfil, email: valores.email, grupos_do_cliente: gruposDoClienteGravados(valores) },
  });

  const erroEscopo = await sincronizarEscopo(admin, data.user.id, valores);
  if (erroEscopo) {
    // Mesmo raciocinio do bloco acima: um CLIENTE sem o escopo que era para
    // ter enxerga zero coletas e parece conta quebrada.
    await admin.auth.admin.deleteUser(data.user.id);
    erro(idRequisicao, "Administração de usuários: falha ao gravar escopo; conta desfeita.", erroEscopo);
    return { ok: false, erro: traduzirErro(erroEscopo) };
  }

  // Os dados pessoais nao entram na `auditoria` acima: la eles virariam
  // uma segunda copia de CPF, legivel por outro caminho.
  const erroDados = await gravarDadosPessoais(admin, data.user.id, valores);
  if (erroDados) {
    await admin.auth.admin.deleteUser(data.user.id);
    erro(idRequisicao, "Administração de usuários: falha ao gravar dados pessoais; conta desfeita.", erroDados);
    return { ok: false, erro: traduzirErro(erroDados) };
  }

  return { ok: true, id: data.user.id };
}
