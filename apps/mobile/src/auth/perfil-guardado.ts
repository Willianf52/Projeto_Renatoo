import { abrirFila } from "../campo/fila";
import type { PerfilDoInspetor } from "./SessaoProvider";

/**
 * Copia do ultimo perfil lido com sucesso, no SQLite do aparelho (tabela
 * `meta` de `fila.ts`).
 *
 * POR QUE EXISTE (teste no emulador, 12/10/2026): o app relia `profiles` a
 * cada abertura e, sem sinal, caia em "Perfil nao encontrado" com so o botao
 * "Sair" -- o inspetor que abrisse o app num subsolo ficava travado, e "Sair"
 * sem sinal o deixava sem como entrar de novo. Com a copia, falta de REDE usa o
 * ultimo perfil conhecido; resposta do SERVIDOR (inativo, sem perfil) continua
 * valendo como antes. A seguranca nao muda: quem decide gravar e o RLS do banco
 * (`usuario_ativo()`), que recusa o envio de uma conta desativada no momento em
 * que ele chega, com ou sem esta copia.
 *
 * Uma chave por conta (`perfil:<id>`): o aparelho e compartilhado entre turnos,
 * e a copia de um inspetor nunca serve ao outro. `sair` apaga a de quem saiu.
 */

const prefixo = "perfil:";

/** Confere o que voltou do disco: so um perfil inteiro, e da conta pedida. */
export function perfilGuardadoValido(valor: unknown, id: string): PerfilDoInspetor | null {
  if (typeof valor !== "object" || valor === null) return null;
  const { id: idGuardado, email, nome_completo: nome, cargo, ativo } = valor as Record<string, unknown>;
  if (idGuardado !== id) return null;
  if (typeof cargo !== "string" || typeof ativo !== "boolean" || typeof email !== "string") return null;
  if (nome !== null && typeof nome !== "string") return null;
  return { id, email, nome_completo: nome, cargo, ativo };
}

export async function guardarPerfil(perfil: PerfilDoInspetor): Promise<void> {
  const banco = await abrirFila();
  await banco.runAsync(
    "insert into meta (chave, valor) values (?, ?) on conflict (chave) do update set valor = excluded.valor",
    prefixo + perfil.id,
    JSON.stringify(perfil),
  );
}

export async function lerPerfilGuardado(id: string): Promise<PerfilDoInspetor | null> {
  const banco = await abrirFila();
  const linha = await banco.getFirstAsync<{ valor: string }>("select valor from meta where chave = ?", prefixo + id);
  if (!linha) return null;
  try {
    return perfilGuardadoValido(JSON.parse(linha.valor), id);
  } catch {
    return null;
  }
}

export async function esquecerPerfil(id: string): Promise<void> {
  const banco = await abrirFila();
  await banco.runAsync("delete from meta where chave = ?", prefixo + id);
}
