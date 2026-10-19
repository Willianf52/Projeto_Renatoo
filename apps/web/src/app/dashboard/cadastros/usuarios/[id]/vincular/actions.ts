"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { filtroDeUuid } from "@/lib/id-na-url";
import { erro, gerarIdDeRequisicao } from "@/lib/log";
import { podeAdministrarUsuarios } from "@/lib/permissoes";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import {
  CARGO_CLIENTE,
  lerGruposDoCliente,
  registrarAuditoria,
  trocarGruposDoCliente,
  type ClienteAdmin,
} from "../../criar-conta";

export type EstadoDoVinculo = { erro?: string };

const LISTAGEM = "/dashboard/cadastros/usuarios";
const NAO_AUTORIZADO = "Você não tem permissão para administrar usuários. Apenas Gestor pode fazer isso.";

/**
 * Vincular (como no sistema de referencia): liga um usuario a grupos de sites.
 *
 * No portal so o CLIENTE e restringido por grupo (migration 0014: os demais
 * cargos veem todos os sites), entao so ele aceita vinculo; para os outros a
 * tela nem mostra o formulario, e esta action recusa por garantia.
 *
 * Escreve com service_role, como o formulario de usuario: o portao e
 * `podeAdministrarUsuarios()`, chamado com o cliente da sessao, e vem primeiro.
 * A troca vai para `auditoria`, que e controle de acesso.
 */
export async function vincularGrupos(
  _estado: EstadoDoVinculo,
  formData: FormData,
): Promise<EstadoDoVinculo> {
  const idRequisicao = gerarIdDeRequisicao();

  if (!(await podeAdministrarUsuarios())) return { erro: NAO_AUTORIZADO };

  const usuarioId = filtroDeUuid(String(formData.get("usuario_id") ?? ""));
  if (usuarioId === undefined) return { erro: "Usuário inválido." };

  // Os ids vem da tela, mas o POST pode ser feito a mao: so inteiros positivos,
  // sem repetir.
  const brutos = formData.getAll("grupos_do_cliente").map(String);
  const grupos = [...new Set(brutos.map(Number))].sort((a, b) => a - b);
  if (grupos.some((id) => !Number.isSafeInteger(id) || id <= 0)) return { erro: "Grupo de sites inválido." };

  let admin: ClienteAdmin;
  try {
    admin = createAdminClient();
  } catch (falha) {
    erro(idRequisicao, "Vincular usuário: service_role indisponível.", falha);
    return { erro: "A administração de usuários não está configurada no servidor." };
  }

  const { data: usuario, error: erroDoUsuario } = await admin
    .from("profiles")
    .select("id, cargo")
    .eq("id", usuarioId)
    .maybeSingle();
  if (erroDoUsuario) {
    erro(idRequisicao, "Vincular usuário: falha ao ler o perfil.", erroDoUsuario);
    return { erro: "Não foi possível salvar o vínculo. Tente de novo." };
  }
  if (!usuario) return { erro: "Usuário não encontrado." };
  if (usuario.cargo !== CARGO_CLIENTE) {
    return { erro: "Só o nível Cliente é restrito por grupo de sites. Os outros níveis veem todos os sites." };
  }

  if (grupos.length > 0) {
    const { data: existentes, error: erroDosGrupos } = await admin
      .from("grupos_sites")
      .select("id")
      .in("id", grupos);
    if (erroDosGrupos) {
      erro(idRequisicao, "Vincular usuário: falha ao conferir os grupos.", erroDosGrupos);
      return { erro: "Não foi possível salvar o vínculo. Tente de novo." };
    }
    if ((existentes?.length ?? 0) !== grupos.length) return { erro: "Algum grupo de sites não existe mais." };
  }

  const supabase = await createClient();
  const { data: sessao } = await supabase.auth.getUser();

  const antes = await lerGruposDoCliente(admin, usuarioId);

  const erroDaTroca = await trocarGruposDoCliente(admin, usuarioId, grupos);
  if (erroDaTroca) {
    erro(idRequisicao, "Vincular usuário: falha ao gravar os grupos.", erroDaTroca);
    return { erro: "Não foi possível salvar o vínculo. Tente de novo." };
  }

  await registrarAuditoria(admin, idRequisicao, {
    registroId: usuarioId,
    operacao: "UPDATE",
    atorId: sessao.user?.id ?? "",
    dadosAntigos: { grupos_do_cliente: antes },
    dadosNovos: { grupos_do_cliente: grupos },
  });

  revalidatePath(LISTAGEM);
  redirect(`${LISTAGEM}?salvo=1`);
}
