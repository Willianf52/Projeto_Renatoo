import { createHash, timingSafeEqual } from "node:crypto";

/**
 * Validacao do webhook de UPDATE em auth.users, separada da rota para poder
 * ser testada sem carregar o cliente do Resend (que e server-only e exige
 * RESEND_API_KEY so por ser importado).
 */

export type UsuarioWebhook = {
  id: string;
  email: string;
  encrypted_password: string | null;
};

export type UserUpdatedPayload = {
  type: string;
  table: string;
  schema: string;
  record: UsuarioWebhook;
  old_record: UsuarioWebhook | null;
};

/**
 * Comparacao em tempo constante. Com "!==", o tempo de resposta varia conforme
 * quantos caracteres iniciais batem, e um atacante recupera o segredo byte a
 * byte medindo latencia. O sha256 antes iguala o tamanho das entradas:
 * timingSafeEqual exige buffers do mesmo comprimento e, sem isso, o proprio
 * tamanho do segredo vazaria pela excecao.
 */
export function segredoConfere(recebido: string | null | undefined, esperado: string): boolean {
  if (!recebido) return false;
  const digest = (valor: string) => createHash("sha256").update(valor).digest();
  return timingSafeEqual(digest(recebido), digest(esperado));
}

function lerUsuario(valor: unknown): UsuarioWebhook | null {
  if (typeof valor !== "object" || valor === null) return null;

  const usuario = valor as Record<string, unknown>;
  if (typeof usuario.id !== "string" || typeof usuario.email !== "string") return null;

  // O endereco vai direto para o envio de e-mail, entao nao pode ser texto
  // arbitrario nem de tamanho arbitrario. 254 e o limite de um e-mail valido.
  const email = usuario.email.trim();
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;

  const senha = usuario.encrypted_password;
  if (senha !== undefined && senha !== null && typeof senha !== "string") return null;

  return { id: usuario.id, email, encrypted_password: senha ?? null };
}

/** Tipo do TypeScript nao valida nada em runtime: o corpo chega da rede e
 * precisa ser conferido campo a campo antes de ser usado. */
export function lerPayload(valor: unknown): UserUpdatedPayload | null {
  if (typeof valor !== "object" || valor === null) return null;

  const corpo = valor as Record<string, unknown>;
  if (
    typeof corpo.type !== "string" ||
    typeof corpo.table !== "string" ||
    typeof corpo.schema !== "string"
  ) {
    return null;
  }

  const record = lerUsuario(corpo.record);
  if (!record) return null;

  return {
    type: corpo.type,
    table: corpo.table,
    schema: corpo.schema,
    record,
    old_record: lerUsuario(corpo.old_record),
  };
}

export function isEventoRelevante(payload: UserUpdatedPayload): boolean {
  return payload.schema === "auth" && payload.table === "users" && payload.type === "UPDATE";
}

export function isSenhaAlterada(payload: UserUpdatedPayload): boolean {
  const senhaAntiga = payload.old_record?.encrypted_password;
  const senhaNova = payload.record.encrypted_password;
  return Boolean(senhaAntiga) && Boolean(senhaNova) && senhaAntiga !== senhaNova;
}
