import { criarClienteSupabase } from "@projeto-renatoo/shared";

import { armazenamentoSeguro } from "./armazenamento-seguro";
import { env } from "./env";

/**
 * Cliente unico do app.
 *
 * `criarClienteSupabase` mora em `packages/shared` e recebe o storage por
 * parametro justamente para o pacote compartilhado nao carregar dependencia
 * nativa de React Native -- quem injeta o armazenamento e este arquivo, que
 * so existe no mobile. O contrato `ArmazenamentoDeSessao` do shared descreve
 * a superficie que ele precisa cumprir.
 *
 * O storage e o Keychain/Keystore, nao o AsyncStorage: o token de acesso e o
 * de refresh ficariam em texto claro no sandbox do app, legiveis num aparelho
 * com root ou num backup extraido. Para um app que vive no bolso de quem esta
 * em campo, e a diferenca entre perder o aparelho e perder a sessao junto.
 * A fragmentacao que o `armazenamento-seguro` faz nao e detalhe opcional --
 * ver o comentario de la sobre o limite de 2048 bytes.
 *
 * A chave usada e a anonima (publica). Ela nao concede nada por si: toda
 * leitura e escrita passa pelo RLS, e o app so alcanca o que as policies
 * permitirem para o usuario logado. A chave `service_role` nao entra em
 * aplicacao cliente em hipotese nenhuma -- ela ignora RLS, e num APK
 * publicado seria extraivel.
 */
export const supabase = criarClienteSupabase(
  env.supabaseUrl,
  env.supabaseAnonKey,
  armazenamentoSeguro,
);
