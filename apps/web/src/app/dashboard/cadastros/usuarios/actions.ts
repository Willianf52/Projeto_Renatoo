"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { texto } from "@/lib/form-data";
import { erro, gerarIdDeRequisicao } from "@/lib/log";
import { isPasswordValid } from "@/lib/password-policy";
import { podeAdministrarUsuarios } from "@/lib/permissoes";
import { senhaVazada } from "@/lib/senha-vazada";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { NIVEIS_ACESSO, TIPOS_USUARIO } from "./constantes";
import {
  CARGO_CLIENTE,
  EMAIL_VALIDO,
  criarConta,
  gravarDadosPessoais,
  gruposDoClienteGravados,
  lerGruposDoCliente,
  perfilDosValores,
  registrarAuditoria,
  sincronizarEscopo,
  traduzirErro,
  type ClienteAdmin,
  type ValoresDoUsuario,
} from "./criar-conta";
import { erroDosDadosPessoais } from "./dados-pessoais";

export type { ValoresDoUsuario } from "./criar-conta";

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
 *
 * Pelo mesmo motivo, `profiles` fica de fora do trigger generico de
 * `auditoria` (migration 0034): a conexao de `service_role` nao carrega JWT
 * de pessoa nenhuma, e `auth.uid()` dentro do trigger seria sempre `null`.
 * Esta action grava em `auditoria` explicitamente (`registrarAuditoria`), no
 * mesmo lugar que ja sabe quem esta editando.
 *
 * A gravacao em si (criar a conta, escopo, dados pessoais, trilha) mora em
 * `criar-conta.ts`, compartilhada com o Importar usuarios.
 */

const LISTAGEM = "/dashboard/cadastros/usuarios";

/** `login`/`funcao` compartilham mensagem de proposito -- a tela nunca disse
 * qual dos dois passou do limite, so que algum passou. */
const MENSAGEM_LOGIN_FUNCAO = "Login e função devem ter no máximo 100 caracteres.";

const esquemaDeTexto = z.object({
  nomeCompleto: z
    .string()
    .min(1, "Informe o nome completo.")
    .max(200, "O nome deve ter no máximo 200 caracteres."),
  login: z.string().max(100, MENSAGEM_LOGIN_FUNCAO),
  funcao: z.string().max(100, MENSAGEM_LOGIN_FUNCAO),
  pais: z.string().max(100, "O país deve ter no máximo 100 caracteres."),
});

const CARGOS_VALIDOS = new Set(NIVEIS_ACESSO.map((nivel) => nivel.value));
const TIPOS_VALIDOS = new Set(TIPOS_USUARIO.map((tipo) => tipo.value));

export type EstadoDoFormulario = {
  erro?: string;
  /** Devolvido para o formulario nao perder o que a pessoa digitou. */
  valores?: ValoresDoUsuario;
};

function extrairValores(formData: FormData): ValoresDoUsuario {
  return {
    nomeCompleto: texto(formData, "nome_completo"),
    email: texto(formData, "email").toLowerCase(),
    // Nunca devolvido ao formulario -- ver `semSenha()` abaixo.
    senha: String(formData.get("senha") ?? ""),
    login: texto(formData, "login"),
    funcao: texto(formData, "funcao"),
    pais: texto(formData, "pais"),
    cargo: texto(formData, "cargo"),
    tipo: texto(formData, "tipo"),
    superiorId: texto(formData, "superior_id"),
    // Checkbox nao marcado nao e enviado pelo navegador -- ausencia e "false".
    ativo: formData.get("ativo") !== null,
    // `getAll`: sao varios checkboxes com o mesmo name, um por grupo.
    gruposDoCliente: formData
      .getAll("grupos_do_cliente")
      .map((valor) => String(valor).trim())
      .filter(Boolean),
    cpf: texto(formData, "cpf"),
    re: texto(formData, "re"),
    telefone: texto(formData, "telefone"),
    celular: texto(formData, "celular"),
    emailSuperiorOcorrencia: formData.get("email_superior_ocorrencia") !== null,
    emailSuperiorChecklist: formData.get("email_superior_checklist") !== null,
    emailSuperiorEvento: formData.get("email_superior_evento") !== null,
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
  const textoValidado = esquemaDeTexto.safeParse(valores);
  if (!textoValidado.success) return textoValidado.error.issues[0].message;

  // Lista fechada, espelhando `profiles_cargo_check` (migration 0003). Sem
  // esta checagem o valor iria cru para o banco e voltaria como erro de
  // constraint, que nao explica nada -- e, pior, o `<select>` da tela nao e
  // garantia nenhuma: o POST pode ser montado a mao.
  if (!CARGOS_VALIDOS.has(valores.cargo)) return "Selecione um nível de acesso válido.";

  // Mesmo raciocinio, agora contra `profiles_tipo_check` (migration 0019).
  if (!TIPOS_VALIDOS.has(valores.tipo)) return "Selecione um tipo de usuário válido.";

  if (valores.cargo === CARGO_CLIENTE && valores.gruposDoCliente.some((id) => !/^\d+$/.test(id))) {
    return "Grupo de sites inválido.";
  }

  return erroDosDadosPessoais(valores);
}

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

  // Cedo, e nao so dentro do ramo de edicao como antes: quem esta editando
  // agora tambem vira `ator_id` em `auditoria` na criacao, nao so no
  // autobloqueio de `mudancaEmSiMesmo` (que so faz sentido editando).
  const supabase = await createClient();
  const { data: sessao } = await supabase.auth.getUser();
  const idDeQuemEdita = sessao.user?.id ?? "";

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

  // Compensa o "Prevent use of leaked passwords" do Supabase Auth, indisponível
  // no plano Free (docs/melhorias.md #8). Só roda depois de isPasswordValid: é
  // uma checagem de rede, mais cara, e não faz sentido pagá-la para uma senha
  // que já seria recusada pela política de composição.
  if ((criando || trocandoSenha) && (await senhaVazada(valores.senha))) {
    return recusar(
      "Esta senha apareceu em vazamentos de dados conhecidos. Escolha outra.",
      valores,
    );
  }

  let admin: ClienteAdmin;
  try {
    admin = createAdminClient();
  } catch (falha) {
    erro(idRequisicao, "Administração de usuários: service_role indisponível.", falha);
    return recusar(
      "A administração de usuários não está configurada no servidor (SUPABASE_SERVICE_ROLE_KEY).",
      valores,
    );
  }

  if (criando) {
    if (!EMAIL_VALIDO.test(valores.email)) return recusar("Informe um e-mail válido.", valores);

    const criada = await criarConta(admin, idRequisicao, idDeQuemEdita, valores);
    if (!criada.ok) return recusar(criada.erro, valores);
  } else {
    const perfil = perfilDosValores(valores);

    // Colunas por extenso, e nao so `cargo, ativo` como antes: viram
    // `dados_antigos` do registro em `auditoria` mais abaixo, e um diff que so
    // sabe cargo/ativo esconderia troca de nome, login, funcao, tipo ou
    // superior.
    const { data: atual, error: erroLeitura } = await admin
      .from("profiles")
      .select(
        "nome_completo, login, funcao, cargo, tipo, ativo, superior_id, email_superior_ocorrencia, email_superior_checklist, email_superior_evento",
      )
      .eq("id", idAlvo)
      .maybeSingle();

    if (erroLeitura || !atual) {
      return recusar("Usuário não encontrado.", valores);
    }

    const autoBloqueio = mudancaEmSiMesmo(idAlvo, idDeQuemEdita, valores, atual);
    if (autoBloqueio) return recusar(autoBloqueio, valores);

    // `superior_id` referencia `profiles` com `on delete set null`; apontar
    // para si mesmo passaria pela FK e criaria uma hierarquia circular de um
    // no so, que a coluna "Superior" da listagem exibiria como o proprio nome.
    if (valores.superiorId === idAlvo) {
      return recusar("Um usuário não pode ser o próprio superior.", valores);
    }

    // O escopo do CLIENTE (quais sites ele enxerga) e controle de acesso: a
    // troca precisa ficar na trilha, e `grupos_sites_clientes` e gravada com
    // `service_role`, sem JWT -- um trigger daria `ator_id` nulo (ver a 0070).
    // Lido ANTES de sincronizar, para o registro ter o "antes" de verdade.
    const gruposAntes = await lerGruposDoCliente(admin, idAlvo);

    const erroEscopo = await sincronizarEscopo(admin, idAlvo, valores);
    if (erroEscopo) {
      erro(idRequisicao, "Administração de usuários: falha ao gravar escopo.", erroEscopo);
      return recusar(traduzirErro(erroEscopo), valores);
    }

    const { error } = await admin.from("profiles").update(perfil).eq("id", idAlvo);

    if (error) {
      erro(idRequisicao, "Administração de usuários: falha ao atualizar perfil.", error);
      return recusar(traduzirErro(error.message), valores);
    }

    const erroDados = await gravarDadosPessoais(admin, idAlvo, valores);
    if (erroDados) {
      erro(idRequisicao, "Administração de usuários: falha ao gravar dados pessoais.", erroDados);
      return recusar(traduzirErro(erroDados), valores);
    }

    await registrarAuditoria(admin, idRequisicao, {
      registroId: idAlvo,
      operacao: "UPDATE",
      atorId: idDeQuemEdita,
      dadosAntigos: { ...atual, grupos_do_cliente: gruposAntes },
      dadosNovos: { ...perfil, grupos_do_cliente: gruposDoClienteGravados(valores) },
    });

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
  redirect(`${LISTAGEM}?salvo=1`);
}
