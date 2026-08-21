import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database-types";

/**
 * Formato mínimo de storage que o `@supabase/supabase-js` precisa para
 * persistir sessão. No app mobile isso é `@react-native-async-storage/async-storage`
 * — não importado aqui de propósito, para este pacote não carregar uma
 * dependência nativa de RN (mantém a possibilidade de reuso fora do mobile).
 */
export interface ArmazenamentoDeSessao {
  getItem(chave: string): Promise<string | null>;
  setItem(chave: string, valor: string): Promise<void>;
  removeItem(chave: string): Promise<void>;
}

export function criarClienteSupabase(
  url: string,
  chaveAnonima: string,
  storage: ArmazenamentoDeSessao,
): SupabaseClient<Database> {
  return createClient<Database>(url, chaveAnonima, {
    auth: {
      storage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  });
}
