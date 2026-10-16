"use server";

import { revalidatePath } from "next/cache";
import { lerCsv } from "@/lib/csv";
import { erro as registrarErro, gerarIdDeRequisicao } from "@/lib/log";
import { isPasswordValid } from "@/lib/password-policy";
import { podeAdministrarUsuarios } from "@/lib/permissoes";
import { senhaVazada } from "@/lib/senha-vazada";
import { createAdminClient } from "@/lib/supabase/admin";
import { buscarEmPaginas } from "@/lib/supabase/query-helpers";
import { createClient } from "@/lib/supabase/server";
import { NIVEIS_ACESSO } from "../constantes";
import { criarConta, type ClienteAdmin } from "../criar-conta";
import { planejarImportacaoDeUsuarios, type PlanoDeUsuarios, type UsuarioParaCriar } from "../importacao";

const LISTAGEM = "/dashboard/cadastros/usuarios";

/** Abaixo do teto de 1 MB do corpo de uma Server Action. 200 usuarios cabem em poucos KB. */
const TAMANHO_MAXIMO = 256 * 1024;

const ROTULO_DO_NIVEL = new Map(NIVEIS_ACESSO.map((n) => [n.value, n.label]));

/** O que a pre-visualizacao mostra. Nada disto foi gravado. */
export type ResumoDaPreviaDeUsuarios = {
  novos: { linha: number; nome: string; email: string; nivel: string; superior: string | null }[];
  existentes: { linha: number; nome: string; email: string }[];
  clientesSemGrupo: number;
};

export type ResultadoDaImportacaoDeUsuarios = {
  criados: number;
  falhas: { linha: number; nome: string; erro: string }[];
  /** Criados sem o superior porque o superior deles falhou. */
  semSuperior: string[];
};

export type EstadoDaImportacaoDeUsuarios = {
  erro?: string;
  /** Linhas do arquivo com problema: com qualquer uma, ninguem e criado. */
  erros?: { linha: number; mensagem: string }[];
  previa?: ResumoDaPreviaDeUsuarios;
  resultado?: ResultadoDaImportacaoDeUsuarios;
};

const NAO_AUTORIZADO = "Você não tem permissão para administrar usuários. Apenas Gestor pode fazer isso.";

/**
 * Importar usuarios. Mesmo portao do formulario (`../actions.ts`): a escrita e
 * com service_role, entao `podeAdministrarUsuarios()` com o cliente da sessao
 * e o UNICO portao, e vem antes de ler o arquivo.
 *
 * A senha provisoria vem da tela, digitada por quem importa, e vale para todos
 * os criados nesta importacao. Ela passa pelas mesmas regras do formulario
 * (`isPasswordValid` e `senhaVazada`) e nunca volta na resposta.
 */
export async function importarUsuarios(
  _estado: EstadoDaImportacaoDeUsuarios,
  formData: FormData,
): Promise<EstadoDaImportacaoDeUsuarios> {
  if (!(await podeAdministrarUsuarios())) return { erro: NAO_AUTORIZADO };

  const arquivo = formData.get("arquivo");
  if (!(arquivo instanceof File) || arquivo.size === 0) {
    return { erro: "Escolha o arquivo .csv com os usuários." };
  }
  if (!arquivo.name.toLowerCase().endsWith(".csv")) {
    return { erro: "O arquivo precisa ser .csv. No Excel: Arquivo › Salvar como › CSV." };
  }
  if (arquivo.size > TAMANHO_MAXIMO) {
    return { erro: "O arquivo passa de 256 KB. Divida em arquivos menores." };
  }

  // Sem o campo, so mostra o plano: gravar exige pedir "importar".
  const importar = String(formData.get("modo") ?? "") === "importar";

  const idRequisicao = gerarIdDeRequisicao();
  const supabase = await createClient();

  let plano: PlanoDeUsuarios;
  try {
    // O GESTOR le todos os perfis (`pode_ver_toda_operacao`, 0006): e o que
    // diz quem ja existe e quem pode ser superior.
    const [perfis, grupos] = await Promise.all([
      buscarEmPaginas<{ id: string; email: string | null; nome_completo: string; login: string | null }>((de, ate) =>
        supabase.from("profiles").select("id, email, nome_completo, login").order("id").range(de, ate),
      ),
      buscarEmPaginas<{ id: number; nome: string }>((de, ate) =>
        supabase.from("grupos_sites").select("id, nome").order("id").range(de, ate),
      ),
    ]);

    plano = planejarImportacaoDeUsuarios(lerCsv(decodificar(await arquivo.arrayBuffer())), {
      perfis: perfis.linhas.map((p) => ({ id: p.id, email: p.email, nome: p.nome_completo, login: p.login })),
      grupos: grupos.linhas,
    });
  } catch (falha) {
    registrarErro(idRequisicao, "Importar usuários: falha ao ler o que já existe:", falha);
    return { erro: "Não foi possível ler os usuários do portal. Tente novamente." };
  }

  if (!plano.ok) return { erro: plano.erro };

  // TUDO OU NADA quando ha linha com erro, como nos outros importadores.
  if (plano.erros.length > 0) {
    return {
      erro: "Nenhum usuário foi criado. Corrija as linhas abaixo e envie o arquivo de novo.",
      erros: plano.erros,
    };
  }

  if (!importar) return { previa: resumir(plano) };

  if (plano.novos.length === 0) {
    return { resultado: { criados: 0, falhas: [], semSuperior: [] } };
  }

  // Com a previa junto: a senha recusada nao obriga a pre-visualizar de novo.
  const senha = String(formData.get("senha") ?? "");
  if (!senha) return { erro: "Digite a senha provisória dos novos usuários.", previa: resumir(plano) };
  if (!isPasswordValid(senha)) {
    return {
      erro: "A senha provisória não atende aos requisitos (8 a 16 caracteres, com maiúscula, minúscula, número e símbolo).",
      previa: resumir(plano),
    };
  }
  if (await senhaVazada(senha)) {
    return { erro: "Esta senha apareceu em vazamentos de dados conhecidos. Escolha outra.", previa: resumir(plano) };
  }

  let admin: ClienteAdmin;
  try {
    admin = createAdminClient();
  } catch (falha) {
    registrarErro(idRequisicao, "Importar usuários: service_role indisponível.", falha);
    return { erro: "A administração de usuários não está configurada no servidor (SUPABASE_SERVICE_ROLE_KEY)." };
  }

  const { data: sessao } = await supabase.auth.getUser();
  const resultado = await executar(admin, idRequisicao, sessao.user?.id ?? "", plano.novos, senha);

  revalidatePath(LISTAGEM);
  return { resultado };
}

function resumir(plano: Extract<PlanoDeUsuarios, { ok: true }>): ResumoDaPreviaDeUsuarios {
  return {
    novos: plano.novos.map((u) => ({
      linha: u.linha,
      nome: u.dados.nomeCompleto,
      email: u.chave,
      nivel: ROTULO_DO_NIVEL.get(u.dados.cargo) ?? u.dados.cargo,
      superior: u.superiorNome,
    })),
    existentes: plano.existentes,
    clientesSemGrupo: plano.clientesSemGrupo,
  };
}

/**
 * Cria um por um, superiores antes (pelo nivel do planejador), para o id do
 * superior novo ja existir quando o subordinado nasce. NAO e uma transacao: cada
 * conta e independente, e a falha de uma nao desfaz as outras -- a lista de
 * falhas diz quem ficou de fora, e reenviar o arquivo e seguro (quem ja entrou
 * aparece como "ja existe" e nao e repetido).
 */
async function executar(
  admin: ClienteAdmin,
  idRequisicao: string,
  atorId: string,
  novos: UsuarioParaCriar[],
  senha: string,
): Promise<ResultadoDaImportacaoDeUsuarios> {
  const idPorChave = new Map<string, string>();
  const falhas: ResultadoDaImportacaoDeUsuarios["falhas"] = [];
  const semSuperior: string[] = [];
  let criados = 0;

  const emOrdem = [...novos].sort((a, b) => a.nivel - b.nivel || a.linha - b.linha);

  for (const novo of emOrdem) {
    let superiorId = "";
    if (novo.superior?.tipo === "existente") superiorId = novo.superior.id;
    if (novo.superior?.tipo === "novo") {
      superiorId = idPorChave.get(novo.superior.chave) ?? "";
      if (!superiorId) semSuperior.push(novo.dados.nomeCompleto);
    }

    const criada = await criarConta(admin, idRequisicao, atorId, { ...novo.dados, senha, superiorId });
    if (criada.ok) {
      idPorChave.set(novo.chave, criada.id);
      criados++;
    } else {
      falhas.push({ linha: novo.linha, nome: novo.dados.nomeCompleto, erro: criada.erro });
    }
  }

  return { criados, falhas, semSuperior };
}

/**
 * UTF-8 primeiro (o "CSV UTF-8" do Excel). Se nao for UTF-8 valido, cai para
 * Windows-1252, o que o Excel em pt-BR grava no "CSV (separado por virgulas)".
 */
function decodificar(bytes: ArrayBuffer): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder("windows-1252").decode(bytes);
  }
}
