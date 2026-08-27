/**
 * Regras de dado de campo compartilhadas entre o painel web e o app dos
 * inspetores.
 *
 * Este arquivo e a *fonte unica* das regras -- nao um segundo lugar onde elas
 * tambem aparecem. Quem ja tinha uma copia (`src/lib/importar-coletas.ts`,
 * da rota de importacao) passou a importar daqui, mantendo as proprias
 * mensagens: o formato de erro da rota de integracao e o do formulario do
 * app sao publicos diferentes, mas a regra que decide o que e valido e a
 * mesma. Por isso as funcoes daqui devolvem um *motivo* em vez de um texto
 * pronto -- quem chama escolhe como falar com o proprio usuario.
 *
 * Sem dependencia de zod, Supabase ou React: os esquemas de formulario
 * (`esquemas.ts`) montam zod por cima disto, e a rota de importacao consome
 * as mesmas funcoes sem zod nenhum.
 */

/**
 * Limites de aplicacao, nao do banco -- recusam colagem acidental de texto
 * enorme, nao regra de negocio. Mesmo espirito dos limites de
 * `site-planta/actions.ts`.
 */
export const LIMITE_NOME = 200;
export const LIMITE_OBSERVACAO = 1000;

/** Maior e-mail valido pela RFC 5321. */
export const LIMITE_EMAIL = 254;

/**
 * Teto de linhas por requisicao. Um lote maior que isto vira mais de uma
 * chamada: o objetivo e limitar o corpo que o servidor precisa segurar em
 * memoria e o tamanho da transacao no banco, nao o volume total importavel.
 */
export const LIMITE_DO_LOTE = 1000;

/**
 * Deslocamento de fuso no fim do texto: `Z`, `-03:00` ou `-0300`.
 *
 * Nao usamos `z.iso.datetime({ offset: true })` do zod: ele recusa a forma
 * sem os dois-pontos (`-0300`), que a rota de importacao aceita desde o
 * primeiro lote integrado. Trocar por uma validacao mais rigorosa aqui
 * quebraria quem ja integra, sem ganho nenhum de correcao.
 */
export const FUSO_OBRIGATORIO = /(Z|[+-]\d{2}:?\d{2})$/;

export type MotivoDeInstanteInvalido = "sem-fuso" | "data-invalida";

export type InstanteNormalizado =
  | { ok: true; iso: string }
  | { ok: false; motivo: MotivoDeInstanteInvalido };

/**
 * Timestamp com deslocamento de fuso obrigatorio, normalizado para UTC.
 *
 * `new Date("2026-08-01T08:12:00")` -- sem fuso -- e interpretado no fuso de
 * quem executa. O mesmo instante enviado pelo celular de um inspetor em
 * campo e reprocessado no servidor geraria horarios diferentes, sem erro
 * nenhum. Exigir o fuso e a unica defesa barata contra isso, e vale ainda
 * mais no mobile: o aparelho pode estar em fuso diferente do servidor.
 */
export function normalizarInstante(valor: string): InstanteNormalizado {
  const texto = valor.trim();

  if (!FUSO_OBRIGATORIO.test(texto)) return { ok: false, motivo: "sem-fuso" };

  const data = new Date(texto);
  if (Number.isNaN(data.getTime())) return { ok: false, motivo: "data-invalida" };

  return { ok: true, iso: data.toISOString() };
}

/**
 * Presenca de coordenada. Nao le o valor -- so responde se veio alguma
 * coisa. `null`, ausente e string vazia sao "o aparelho nao obteve sinal",
 * que era o significado de `latitude is null` antes da migration 0022.
 *
 * A coordenada em si nao e guardada desde a 0022; so a presenca dela vira
 * `tem_localizacao` (0023). Por isso nao ha validacao de intervalo: uma
 * latitude 91 nao corrompe nada, e recusar por causa dela seria rigor sobre
 * um campo que o sistema declarou nao usar.
 */
export function temCoordenada(valor: unknown): boolean {
  return valor !== undefined && valor !== null && valor !== "";
}

/**
 * Chave de agrupamento das leituras em visitas. A migration 0004 declara
 * `unique (numero_coleta, site_id)`: o numero da coleta vem do dispositivo e
 * so e unico dentro de um site.
 */
export function chaveDaVisita(numeroColeta: number, siteId: number): string {
  return `${numeroColeta}::${siteId}`;
}

/**
 * Motivo da visita corretiva. Mesmo teto da observacao de leitura: e texto
 * livre digitado no celular, e o limite existe para recusar colagem
 * acidental, nao para restringir o que o inspetor tem a dizer.
 */
export const LIMITE_MOTIVO = 1000;

/**
 * Fotos por checklist. O minimo e 1 porque uma visita sem foto nenhuma nao
 * comprova nada -- e o mesmo raciocinio do "visita sem leitura nao e
 * inspecao" em `esquemas.ts`. O maximo e o que um aparelho em rede movel
 * consegue enviar antes de o inspetor desistir e fechar o app.
 */
export const MINIMO_DE_FOTOS = 1;
export const MAXIMO_DE_FOTOS = 10;
