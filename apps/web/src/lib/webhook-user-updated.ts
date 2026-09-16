import { createHash, timingSafeEqual } from "node:crypto";

/**
 * Validacao do aviso de troca de senha, separada da rota para poder ser
 * testada sem carregar o cliente do Resend (que e server-only e exige
 * RESEND_API_KEY so por ser importado).
 *
 * QUEM CHAMA (desde a migration 0053): o trigger `avisar_troca_de_senha` em
 * `auth.users`, que so dispara quando `encrypted_password` muda e manda
 * APENAS `{ type, user_id, email }`.
 *
 * Antes era um Database Webhook criado pelo painel, disparado em todo UPDATE
 * de `auth.users` -- inclusive o `last_sign_in_at` de cada login -- com o
 * registro inteiro no corpo: hash bcrypt da senha e hashes dos tokens de
 * recuperacao chegando a aplicacao em toda entrada no sistema, so para ela
 * comparar dois hashes. Achado M2 da auditoria de AppSec de 16/09/2026.
 */

export const TIPO_TROCA_DE_SENHA = "PASSWORD_CHANGED";

export type AvisoDeTrocaDeSenha = {
  userId: string;
  email: string;
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

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Tipo do TypeScript nao valida nada em runtime: o corpo chega da rede e
 * precisa ser conferido campo a campo antes de ser usado. */
export function lerAvisoDeTrocaDeSenha(valor: unknown): AvisoDeTrocaDeSenha | null {
  if (typeof valor !== "object" || valor === null) return null;

  const corpo = valor as Record<string, unknown>;
  if (corpo.type !== TIPO_TROCA_DE_SENHA) return null;
  if (typeof corpo.user_id !== "string" || !UUID.test(corpo.user_id)) return null;
  if (typeof corpo.email !== "string") return null;

  // O endereco vai direto para o envio de e-mail, entao nao pode ser texto
  // arbitrario nem de tamanho arbitrario. 254 e o limite de um e-mail valido.
  const email = corpo.email.trim();
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;

  return { userId: corpo.user_id, email };
}

/**
 * Corpo do Database Webhook antigo (`{ type, table, schema, record,
 * old_record }`).
 *
 * Reconhecido so para ser IGNORADO com 200, e nao recusado com 400: enquanto
 * o webhook antigo nao for apagado no painel do Supabase (o dono da migration
 * nao tem privilegio para remove-lo -- ver a 0053), ele continua disparando a
 * cada login. Um 400 a cada entrada no sistema viraria ruido de log; processar
 * o formato de novo mandaria o aviso em dobro junto com o trigger novo.
 */
export function eFormatoDoWebhookAntigo(valor: unknown): boolean {
  if (typeof valor !== "object" || valor === null) return false;
  const corpo = valor as Record<string, unknown>;
  return corpo.schema === "auth" && corpo.table === "users" && typeof corpo.record === "object";
}
