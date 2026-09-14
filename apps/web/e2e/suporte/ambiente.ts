import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@projeto-renatoo/shared";

/**
 * O que os specs de fluxo de negocio precisam saber sobre onde estao rodando.
 *
 * ESCREVEM DE VERDADE, POR ISSO SO RODAM NO STACK LOCAL. Cadastrar site, criar
 * QR code e enviar checklist deixam linha no banco -- e `auditoria` (0034)
 * guarda cada uma. Contra producao isso seria dado de teste misturado com a
 * operacao, a cada push. A guarda abaixo nao confia em convencao de env: ela
 * olha o HOST da URL. Uma service_role de producao colada por engano num
 * `.env.local` nao basta para os specs escreverem la.
 *
 * Na CI o job `e2e` sobe o stack com `supabase start` e exporta as tres
 * variaveis a partir de `supabase status`. Localmente, sem Docker, os specs se
 * pulam -- o mesmo comportamento dos specs de login sem credencial.
 */

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

function hostLocal(endereco: string | undefined): boolean {
  if (!endereco) return false;
  try {
    const { hostname } = new URL(endereco);
    return hostname === "127.0.0.1" || hostname === "localhost";
  } catch {
    return false;
  }
}

export const STACK_LOCAL = hostLocal(url) && Boolean(anonKey) && Boolean(serviceRoleKey);

export const MOTIVO_SEM_STACK =
  "requer o Supabase local (NEXT_PUBLIC_SUPABASE_URL em 127.0.0.1 e SUPABASE_SERVICE_ROLE_KEY)";

/** Sessao gravada pelo projeto `setup` -- ver auth.setup.ts. */
export const SESSAO_DO_GESTOR = "e2e/.auth/gestor.json";

/**
 * Contas descartaveis do stack local. Senha fixa no codigo de proposito: o
 * banco nasce e morre com o job, e nao ha o que proteger nele. Nenhuma destas
 * contas existe em producao, e a guarda de `STACK_LOCAL` impede que o setup as
 * crie la.
 */
export const CONTAS = {
  gestor: {
    email: "gestor.e2e@teste.local",
    senha: "Gestor-e2e-2026!",
    nome: "Gestora E2E",
    cargo: "GESTOR",
    ativo: true,
  },
  inspetor: {
    email: "inspetor.e2e@teste.local",
    senha: "Inspetor-e2e-2026!",
    nome: "Inspetor E2E",
    cargo: "INSPETOR",
    ativo: true,
  },
  inativo: {
    email: "inativo.e2e@teste.local",
    senha: "Inativo-e2e-2026!",
    nome: "Conta Inativa E2E",
    cargo: "OPERADOR",
    ativo: false,
  },
} as const;

export type Conta = (typeof CONTAS)[keyof typeof CONTAS];

/** Ignora RLS. So o setup usa, e so para o que nao tem tela: criar conta de
 * autenticacao e fixar cargo/ativo. Nenhum spec de fluxo escreve por aqui --
 * senao o teste provaria a service_role, nao a policy. */
export function clienteAdministrativo(): SupabaseClient<Database> {
  return createClient<Database>(url!, serviceRoleKey!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** Cliente com a sessao de uma conta, pela chave anonima -- o mesmo caminho
 * do app de campo. Toda escrita feita com ele passa pelas policies. */
export async function clienteDaConta(conta: Conta): Promise<SupabaseClient<Database>> {
  const cliente = createClient<Database>(url!, anonKey!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { error } = await cliente.auth.signInWithPassword({
    email: conta.email,
    password: conta.senha,
  });
  if (error) throw new Error(`Login de ${conta.email} falhou: ${error.message}`);

  return cliente;
}

/** Sufixo curto para nomes que precisam ser unicos entre execucoes -- o stack
 * local de quem roda duas vezes seguidas nao e zerado entre uma e outra. */
export function sufixoUnico(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}
