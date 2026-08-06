"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { erro, gerarIdDeRequisicao } from "@/lib/log";
import { isPasswordValid } from "@/lib/password-policy";
import { podeAdministrarUsuarios } from "@/lib/permissoes";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { NIVEIS_ACESSO } from "./constantes";

/**
 * Criacao e edicao de usuarios.
 *
 * Diferente de `grupo-de-sites/actions.ts` e `site-planta/actions.ts`, que
 * escrevem com o token da pessoa e deixam o RLS decidir, estas escrevem com
 * service_role -- e service_role ignora o RLS inteiro. O motivo e que `cargo`
 * e `ativo` nao tem grant de update para `authenticated` (migrations
 * 0002/0007), de proposito: sao as colunas que definem poder, e um grant as
 * exporia a qualquer chamada direta a API.
 *
 * A consequencia e que **a checagem de permissao aqui e o unico portao**. Nao
 * ha RLS atras dela para segurar o que passar. Por isso `podeAdministrarUsuarios()`
 * e chamado com o cliente da sessao (nao o admin) antes de qualquer escrita,
 * em toda action deste arquivo, e nao apenas na tela que leva ate elas.
 */

const LISTAGEM = "/dashboard/cadastros/usuarios";

const LIMITE_NOME = 200;
const LIMITE_TEXTO = 100;

const CARGOS_VALIDOS = new Set(NIVEIS_ACESSO.map((nivel) => nivel.value));

export type ValoresDoUsuario = {
  nomeCompleto: string;
  email: string;
  senha: string;
  login: string;
  funcao: string;
  cargo: string;
  superiorId: string;
  ativo: boolean;
};

export type EstadoDoFormulario = {
  erro?: string;
  /** Devolvido para o formulario nao perder o que a pessoa digitou. */
  valores?: ValoresDoUsuario;
};

function texto(formData: FormData, campo: string): string {
  return String(formData.get(campo) ?? "").trim();
}

function extrairValores(formData: FormData): ValoresDoUsuario {
  return {
    nomeCompleto: texto(formData, "nome_completo"),
    email: texto(formData, "email").toLowerCase(),
    // Nunca devolvido ao formulario -- ver `semSenha()` abaixo.
    senha: String(formData.get("senha") ?? ""),
    login: texto(formData, "login"),
    funcao: texto(formData, "funcao"),
    cargo: texto(formData, "cargo"),
    superiorId: texto(formData, "superior_id"),
    // Checkbox nao marcado nao e enviado pelo navegador -- ausencia e "false".
    ativo: formData.get("ativo") !== null,
  };
}

/** A senha nao volta para a tela num erro de validacao: ela atravessaria a
 * resposta do servidor e ficaria no HTML renderizado. Redigitar e o preco. */
function semSenha(valores: ValoresDoUsuario): ValoresDoUsuario {
  return { ...valores, senha: "" };
}

function recusar(erroDeValidacao: string, valores: ValoresDoUsuario): EstadoDoFormulario {
  return { erro: erroDeValidacao, valores: semSenha(valores) };
}

/** Validacao comum a criar e editar. A senha e checada a parte: obrigatoria na
 * criacao, opcional na edicao. */
function validar(valores: ValoresDoUsuario): string | null {
  if (!valores.nomeCompleto) return "Informe o nome completo.";
  if (valores.nomeCompleto.length > LIMITE_NOME) {
    return `O nome deve ter no máximo ${LIMITE_NOME} caracteres.`;
  }
  if (valores.login.length > LIMITE_TEXTO || valores.funcao.length > LIMITE_TEXTO) {
    return `Login e função devem ter no máximo ${LIMITE_TEXTO} caracteres.`;
  }

  // Lista fechada, espelhando `profiles_cargo_check` (migration 0003). Sem
  // esta checagem o valor iria cru para o banco e voltaria como erro de
  // constraint, que nao explica nada -- e, pior, o `<select>` da tela nao e
  // garantia nenhuma: o POST pode ser montado a mao.
  if (!CARGOS_VALIDOS.has(valores.cargo)) return "Selecione um nível de acesso válido.";

  return null;
}

const EMAIL_VALIDO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const NAO_AUTORIZADO =
  "Você não tem permissão para administrar usuários. Apenas Gestor pode fazer isso.";

/**
 * Impede que quem administra se tranque para fora ou se promova.
 *
 * Sem isto, um GESTOR se desativa (e perde a sessao no proximo passo do
 * middleware, sem ninguem para reativa-lo se for o unico) ou se rebaixa por
 * engano, com o mesmo efeito. O caso legitimo -- trocar o proprio nivel --
 * continua possivel: por outro gestor, que e como uma mudanca de poder deve
 * acontecer.
 */
function mudancaEmSiMesmo(
  idAlvo: string,
  idDeQuemEdita: string,
  valores: ValoresDoUsuario,
  atual: { cargo: string; ativo: boolean },
): string | null {
  if (idAlvo !== idDeQuemEdita) return null;

  if (!valores.ativo) return "Você não pode desativar a própria conta.";
  if (valores.cargo !== atual.cargo) {
    return "Você não pode alterar o próprio nível de acesso. Peça a outro gestor.";
  }

  return null;
}

/** Traducoes dos codigos do Postgres/GoTrue que a pessoa consegue provocar. */
function traduzirErro(mensagem: string | undefined): string {
  const texto = (mensagem ?? "").toLowerCase();

  if (texto.includes("already been registered") || texto.includes("already exists")) {
    return "Já existe um usuário com esse e-mail.";
  }
  if (texto.includes("password")) {
    return "A senha não atende aos requisitos.";
  }
  return "Não foi possível salvar o usuário. Tente novamente.";
}

export async function salvarUsuario(
  _estado: EstadoDoFormulario,
  formData: FormData,
): Promise<EstadoDoFormulario> {
  const idRequisicao = gerarIdDeRequisicao();
  const valores = extrairValores(formData);

  // Primeira coisa, antes de qualquer validacao ou escrita: nao ha RLS atras
  // desta checagem. Roda com o cliente da sessao, nunca com o admin.
  if (!(await podeAdministrarUsuarios())) {
    return recusar(NAO_AUTORIZADO, valores);
  }

  const erroDeValidacao = validar(valores);
  if (erroDeValidacao) return recusar(erroDeValidacao, valores);

  const idAlvo = texto(formData, "id");
  const criando = idAlvo === "";

  // Senha em branco na edicao quer dizer "nao mexer", nao "apagar" -- na
  // criacao ela e obrigatoria. Validada aqui, antes de qualquer escrita: mais
  // abaixo, a recusa deixaria o perfil ja gravado e so a senha por aplicar.
  const trocandoSenha = valores.senha !== "";
  if ((criando || trocandoSenha) && !isPasswordValid(valores.senha)) {
    return recusar("A senha não atende aos requisitos.", valores);
  }

  let admin: ReturnType<typeof createAdminClient>;
  try {
    admin = createAdminClient();
  } catch (falha) {
    erro(idRequisicao, "Administração de usuários: service_role indisponível.", falha);
    return recusar(
      "A administração de usuários não está configurada no servidor (SUPABASE_SERVICE_ROLE_KEY).",
      valores,
    );
  }

  const perfil = {
    nome_completo: valores.nomeCompleto,
    login: valores.login || null,
    funcao: valores.funcao || null,
    cargo: valores.cargo,
    ativo: valores.ativo,
    superior_id: valores.superiorId || null,
  };

  if (criando) {
    if (!EMAIL_VALIDO.test(valores.email)) return recusar("Informe um e-mail válido.", valores);

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
      return recusar(traduzirErro(error?.message), valores);
    }

    /**
     * O trigger `handle_new_user` (migration 0008) ja criou o perfil, sempre
     * OPERADOR e inativo -- de proposito, e ele nao le nada de
     * `raw_user_meta_data`. O nivel e a situacao escolhidos aqui sao aplicados
     * neste segundo passo, que so acontece depois da checagem de permissao
     * la em cima.
     */
    const { error: erroPerfil } = await admin.from("profiles").update(perfil).eq("id", data.user.id);

    if (erroPerfil) {
      // A conta de autenticacao ja existe neste ponto. Deixa-la com o perfil
      // pela metade seria pior que nao ter criado: apaga e devolve o erro,
      // para a pessoa poder tentar de novo com o mesmo e-mail.
      await admin.auth.admin.deleteUser(data.user.id);
      erro(idRequisicao, "Administração de usuários: falha ao gravar perfil; conta desfeita.", erroPerfil);
      return recusar(traduzirErro(erroPerfil.message), valores);
    }
  } else {
    const { data: atual, error: erroLeitura } = await admin
      .from("profiles")
      .select("cargo, ativo")
      .eq("id", idAlvo)
      .maybeSingle();

    if (erroLeitura || !atual) {
      return recusar("Usuário não encontrado.", valores);
    }

    const supabase = await createClient();
    const { data: sessao } = await supabase.auth.getUser();
    const idDeQuemEdita = sessao.user?.id ?? "";

    const autoBloqueio = mudancaEmSiMesmo(idAlvo, idDeQuemEdita, valores, atual);
    if (autoBloqueio) return recusar(autoBloqueio, valores);

    // `superior_id` referencia `profiles` com `on delete set null`; apontar
    // para si mesmo passaria pela FK e criaria uma hierarquia circular de um
    // no so, que a coluna "Superior" da listagem exibiria como o proprio nome.
    if (valores.superiorId === idAlvo) {
      return recusar("Um usuário não pode ser o próprio superior.", valores);
    }

    const { error } = await admin.from("profiles").update(perfil).eq("id", idAlvo);

    if (error) {
      erro(idRequisicao, "Administração de usuários: falha ao atualizar perfil.", error);
      return recusar(traduzirErro(error.message), valores);
    }

    if (trocandoSenha) {
      const { error: erroSenha } = await admin.auth.admin.updateUserById(idAlvo, {
        password: valores.senha,
      });

      if (erroSenha) {
        erro(idRequisicao, "Administração de usuários: falha ao trocar senha.", erroSenha);
        return recusar(traduzirErro(erroSenha.message), valores);
      }
    }
  }

  revalidatePath(LISTAGEM);
  redirect(LISTAGEM);
}
