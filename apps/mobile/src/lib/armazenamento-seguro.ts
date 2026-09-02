import * as SecureStore from "expo-secure-store";
import type { ArmazenamentoDeSessao } from "@projeto-renatoo/shared";

/**
 * Sessao do Supabase guardada no Keychain (iOS) / Keystore (Android), com
 * fragmentacao.
 *
 * POR QUE FRAGMENTAR: o SecureStore recusa valores acima de 2048 bytes no
 * Android. A sessao do Supabase mede 2113 bytes num usuario recem-criado, sem
 * metadado nenhum -- medido contra o stack local em 2026-08-23. Ou seja, ela
 * ja nasce estourando o limite, e cresce com o que for para `user_metadata`.
 *
 * Gravar direto falharia de um jeito ruim: a sessao simplesmente nao
 * persistiria, e o inspetor seria deslogado a cada abertura do app -- em
 * campo, sem ninguem para pedir a senha de novo. Por isso o valor e quebrado
 * em pedacos e um manifesto guarda quantos sao.
 *
 * Formato no storage, para `sb-xxx-auth-token`:
 *
 *   sb-xxx-auth-token        -> "3"   (manifesto: quantidade de pedacos)
 *   sb-xxx-auth-token.0      -> pedaco 0
 *   sb-xxx-auth-token.1      -> pedaco 1
 *   sb-xxx-auth-token.2      -> pedaco 2
 *
 * O ponto e valido em chave do SecureStore (`[A-Za-z0-9._-]`).
 */

/**
 * Margem sobre os 2048 do Android: o limite vale para o valor codificado, e
 * este numero precisa sobrar espaco para qualquer overhead da plataforma.
 */
const LIMITE_DE_BYTES_POR_PEDACO = 1600;

/**
 * `AFTER_FIRST_UNLOCK` em vez do padrao `WHEN_UNLOCKED`: depois de reiniciar o
 * aparelho, o app precisa conseguir ler a sessao antes de o inspetor
 * desbloquear a tela -- e o que permite o refresh de token acontecer em
 * segundo plano. Com o padrao, a leitura falharia e a sessao pareceria
 * perdida.
 */
const OPCOES: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK,
};

/**
 * Bytes que o caractere ocupa em UTF-8. Escrito a mao em vez de `TextEncoder`
 * para nao depender de o runtime do Hermes expor a API.
 */
function bytesDoCaractere(codigo: number): number {
  if (codigo < 0x80) return 1;
  if (codigo < 0x800) return 2;
  if (codigo < 0x10000) return 3;
  return 4;
}

/**
 * Quebra por BYTES, nao por caracteres: um `nome_completo` acentuado ocupa
 * dois bytes por letra, e contar caracteres deixaria o pedaco passar do
 * limite sem aviso.
 *
 * Nunca corta no meio de um par surrogate (emoji, por exemplo). Metade de um
 * par nao e texto UTF-8 valido, e a plataforma poderia corromper na volta.
 */
function fragmentar(valor: string): string[] {
  // Valor vazio vira UM pedaco vazio, nao zero pedacos: com zero, o manifesto
  // gravaria "0" e a leitura devolveria `null` -- ou seja, guardar "" e ler
  // de volta daria "nao ha nada guardado". O supabase-js nao grava vazio
  // hoje, mas um storage que nao devolve o que recebeu e armadilha.
  if (valor === "") return [""];

  const pedacos: string[] = [];
  let inicio = 0;

  while (inicio < valor.length) {
    let bytes = 0;
    let fim = inicio;

    while (fim < valor.length) {
      const codigo = valor.codePointAt(fim) ?? 0;
      const largura = codigo > 0xffff ? 2 : 1;
      const custo = bytesDoCaractere(codigo);

      if (bytes + custo > LIMITE_DE_BYTES_POR_PEDACO && fim > inicio) break;

      bytes += custo;
      fim += largura;
    }

    pedacos.push(valor.slice(inicio, fim));
    inicio = fim;
  }

  return pedacos;
}

const chaveDoPedaco = (chave: string, indice: number) => `${chave}.${indice}`;

/**
 * Apaga pedacos a partir de um indice ate nao achar mais. Usado tanto no
 * `removeItem` quanto antes de gravar: sem isso, uma sessao que encolhe
 * deixaria pedacos velhos para tras, e a leitura seguinte montaria um JSON
 * cortado no meio.
 */
async function apagarPedacosAPartirDe(chave: string, indice: number): Promise<void> {
  for (let i = indice; ; i += 1) {
    const pedaco = await SecureStore.getItemAsync(chaveDoPedaco(chave, i), OPCOES);
    if (pedaco === null) return;
    await SecureStore.deleteItemAsync(chaveDoPedaco(chave, i), OPCOES);
  }
}

export const armazenamentoSeguro: ArmazenamentoDeSessao = {
  async getItem(chave) {
    const manifesto = await SecureStore.getItemAsync(chave, OPCOES);
    if (manifesto === null) return null;

    const quantidade = Number.parseInt(manifesto, 10);
    if (!Number.isInteger(quantidade) || quantidade < 1) return null;

    const pedacos: string[] = [];

    for (let i = 0; i < quantidade; i += 1) {
      const pedaco = await SecureStore.getItemAsync(chaveDoPedaco(chave, i), OPCOES);

      // Pedaco faltando e sessao incompleta. Devolver o que sobrou entregaria
      // um JSON truncado ao supabase-js, que trataria como corrompido de um
      // jeito menos claro. `null` significa "nao ha sessao" e leva ao login.
      if (pedaco === null) return null;

      pedacos.push(pedaco);
    }

    return pedacos.join("");
  },

  async setItem(chave, valor) {
    const pedacos = fragmentar(valor);

    /**
     * Manifesto apagado ANTES de tocar nos pedacos.
     *
     * Deixa-lo apontando para a contagem antiga durante a reescrita nao
     * protegia nada: os pedacos que ele indexa sao sobrescritos em ordem,
     * entao uma falha no meio deixava `.0` novo ao lado de `.1`/`.2` velhos,
     * com o manifesto ainda dizendo "3". O `getItem` concatenava os tres e
     * devolvia um JSON emendado de DUAS sessoes -- exatamente o "valor pela
     * metade" que a ordem anterior dizia impedir. Com a sessao nascendo acima
     * do limite de 2048 bytes (ver o cabecalho), fragmentar e o caminho
     * normal, nao a excecao.
     *
     * Sem manifesto, `getItem` devolve null e a pessoa cai no login -- o pior
     * caso que o `SessaoProvider` ja trata como aceitavel, e muito melhor que
     * entregar sessao costurada ao supabase-js.
     */
    await SecureStore.deleteItemAsync(chave, OPCOES);

    for (let i = 0; i < pedacos.length; i += 1) {
      await SecureStore.setItemAsync(chaveDoPedaco(chave, i), pedacos[i], OPCOES);
    }

    // Sobra de uma sessao anterior maior que esta.
    await apagarPedacosAPartirDe(chave, pedacos.length);

    // Manifesto por ultimo: e so aqui que a entrada volta a existir, e ela so
    // existe depois de todos os pedacos estarem gravados.
    await SecureStore.setItemAsync(chave, String(pedacos.length), OPCOES);
  },

  async removeItem(chave) {
    // Manifesto primeiro: a partir daqui `getItem` ja devolve null, mesmo que
    // a limpeza dos pedacos seja interrompida.
    await SecureStore.deleteItemAsync(chave, OPCOES);
    await apagarPedacosAPartirDe(chave, 0);
  },
};
