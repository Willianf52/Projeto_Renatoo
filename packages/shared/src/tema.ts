/**
 * Identidade visual Up Servicos -- os valores, nao o mecanismo.
 *
 * Existe porque a marca precisa sair igual em dois renderizadores que nao
 * compartilham CSS: o painel web (Tailwind v4, que so le custom properties)
 * e o app de campo (React Native, que so le objeto JavaScript). Um hex
 * copiado a mao para o segundo vira, em algumas semanas, um produto com duas
 * caras -- foi exatamente o que aconteceu com o tema inicial do app, azul e
 * claro em cima de um portal navy e verde.
 *
 * A ponte, em cada lado:
 *
 * - Mobile: `apps/mobile/src/tema.ts` reexporta daqui e acrescenta so o que e
 *   de React Native (familia de fonte por peso, sombras).
 * - Web: `apps/web/src/app/globals.css` continua declarando os tokens em
 *   `@theme` -- o Tailwind precisa deles como CSS na hora do build, nao da
 *   para importar TypeScript ali. O que impede a copia de divergir e o teste
 *   `apps/web/src/lib/tema-da-marca.test.ts`, que le o CSS e compara com
 *   `CORES_DA_MARCA` abaixo. Mudar o hex de um lado so quebra o CI.
 *
 * Sem unidade nos numeros de proposito: sao px na web e pontos logicos (dp) no
 * mobile, que valem o mesmo em intencao de desenho. A regra de conversao e a
 * escala de 4 do Tailwind -- `p-4` = 16.
 */

/**
 * As seis cores da marca, indexadas pelo sufixo do custom property que as
 * declara na web (`--color-brand-navy` -> `navy`). O formato espelha o CSS de
 * proposito: e o que permite ao teste de drift comparar os dois lados inteiros
 * de uma vez, pegando token acrescentado e removido, e nao so hex trocado.
 */
export const CORES_DA_MARCA = {
  navy: "#03031a",
  surface: "#0b0b26",
  green: "#00e676",
  "green-hover": "#00c853",
  blue: "#2b6cb0",
  muted: "#a0aec0",
} as const;

/**
 * Papel de cada cor na interface. As telas usam estes nomes, nao os de cima:
 * "fundo" sobrevive a uma troca de navy, "navy" nao.
 *
 * As cores fora da marca sao as do Tailwind que o painel ja usa direto na
 * classe, resolvidas para hex porque o React Native nao tem paleta embutida:
 * slate-800 `#1e293b` (toda borda da aplicacao), slate-700 `#334155` (hover
 * de borda), red-500 `#ef4444`, red-400 `#f87171` e red-300 `#fca5a5`.
 */
export const cores = {
  fundo: CORES_DA_MARCA.navy,
  superficie: CORES_DA_MARCA.surface,
  borda: "#1e293b",
  bordaRealcada: "#334155",
  texto: "#ffffff",
  textoFraco: CORES_DA_MARCA.muted,
  primaria: CORES_DA_MARCA.green,
  primariaPressionada: CORES_DA_MARCA["green-hover"],
  /** O botao primario e verde com texto navy -- nunca branco: 1.5:1. */
  textoSobrePrimaria: CORES_DA_MARCA.navy,
  /** Placa atras da logo onde ela divide espaco com outros elementos. */
  placaDaMarca: CORES_DA_MARCA.blue,
  erroBorda: "rgba(239, 68, 68, 0.4)",
  erroFundo: "rgba(239, 68, 68, 0.1)",
  erroTexto: "#fca5a5",
  /** Mensagem presa a um campo, menor e mais discreta que o banner. */
  erroTextoDeCampo: "#f87171",
  /**
   * Bloco pulsante de carregamento: o `bg-white/10` do `Skeleton.tsx` e do
   * `TableSkeleton`, resolvido para rgba porque o React Native nao entende a
   * notacao de barra do Tailwind. Cor, e nao opacidade da peca -- a opacidade
   * fica livre para o proprio pulso animar.
   */
  esqueleto: "rgba(255, 255, 255, 0.1)",
} as const;

/**
 * Escala de espacamento, nomeada pelo papel e anotada com a classe do Tailwind
 * de onde saiu. Nomear pelo papel (e nao `p`/`m`/`g`) e o que deixa a tela do
 * mobile revisavel contra a da web sem ter que decorar tabela.
 */
export const espaco = {
  /** `mb-1.5` -- rotulo colado no campo que ele nomeia. */
  rotulo: 6,
  /** `gap-2` -- icone e texto dentro de um botao. */
  minimo: 8,
  /** `gap-3` -- entre celulas de grade e entre cartoes de lista. */
  entreItens: 12,
  /** `p-4` / `px-4 py-3` -- respiro interno de campo, cartao e barra. */
  interno: 16,
  /** `p-5` / `p-6` -- respiro de bloco que ocupa a tela. */
  confortavel: 24,
  /** `space-y-8` -- entre campos de um formulario. */
  entreCampos: 32,
  /** `mb-10` -- da marca para o conteudo. */
  secao: 40,
} as const;

/** `rounded-md` (6) em controle denso, `rounded-lg` (8) em campo e CTA. */
export const raio = {
  medio: 6,
  grande: 8,
  cartao: 12,
  pilula: 9999,
} as const;

/**
 * Escala tipografica, ja convertida de rem para dp (base 16 do Tailwind:
 * `text-xs` = 0.75rem = 12).
 *
 * `altura` existe em toda entrada porque o React Native nao tem line-height
 * implicito por tamanho como o CSS -- sem declarar, texto de duas linhas fica
 * apertado. `espacamento` e o `tracking-*` resolvido para dp no tamanho da
 * propria entrada (`tracking-wider` = 0.05em; a 14dp, 0.7).
 */
export const tipografia = {
  /** `text-3xl` + `tracking-tight` -- titulo de tela. */
  titulo: { tamanho: 30, altura: 36, peso: 700, espacamento: -0.5 },
  /** `text-xl` -- titulo de cartao ou de dialogo. */
  subtitulo: { tamanho: 20, altura: 26, peso: 700, espacamento: 0 },
  /** `text-base` -- corpo de texto e valor digitado em campo. */
  corpo: { tamanho: 16, altura: 24, peso: 400, espacamento: 0 },
  /** `text-base font-semibold` -- titulo de cartao, nome em barra. */
  destaque: { tamanho: 16, altura: 24, peso: 600, espacamento: 0 },
  /** `text-sm` -- linha de apoio e celula de tabela. */
  apoio: { tamanho: 14, altura: 20, peso: 400, espacamento: 0 },
  /** `text-sm font-medium` -- item de menu, titulo de estado vazio. */
  apoioMedio: { tamanho: 14, altura: 20, peso: 500, espacamento: 0 },
  /** `text-xs font-medium uppercase tracking-wide` -- rotulo de campo. */
  rotulo: { tamanho: 12, altura: 16, peso: 500, espacamento: 0.3 },
  /** `text-sm font-bold uppercase tracking-wider` -- CTA (`size="lg"`). */
  botao: { tamanho: 14, altura: 20, peso: 700, espacamento: 0.7 },
  /** `text-sm font-semibold` -- botao denso (`size="md"`). */
  botaoDenso: { tamanho: 14, altura: 20, peso: 600, espacamento: 0 },
  /** `text-xs` -- nota de rodape, erro de campo, link secundario. */
  nota: { tamanho: 12, altura: 16, peso: 400, espacamento: 0 },
  /** `text-xs font-bold uppercase tracking-[0.25em]` -- chapeu do hero. */
  chapeu: { tamanho: 12, altura: 16, peso: 700, espacamento: 3 },
} as const;

/** Alturas de toque. O CTA da web (`py-3.5` + `text-sm`) fecha 52. */
export const alturaDeControle = {
  denso: 40,
  padrao: 52,
} as const;

/**
 * Movimento. `saidaSuave` e o `--ease-out-soft` do globals.css, aqui em
 * coeficientes porque o `Easing.bezier` do React Native pede os quatro
 * numeros, e nao a string do CSS.
 */
export const movimento = {
  saidaSuave: [0.22, 1, 0.36, 1] as const,
  /** Curva do `animate-pulse` do Tailwind, usada pelos esqueletos de carga. */
  pulsar: [0.4, 0, 0.6, 1] as const,
  duracao: { rapida: 250, padrao: 400, entrada: 500, pulso: 2000 },
  /** Entradas em cascata do formulario de login, em ms. */
  atraso: { primeiro: 100, segundo: 180, terceiro: 260, quarto: 340 },
} as const;


/** Proporcao do arquivo `logo-up-servicos.png` (126 x 71). */
export const PROPORCAO_DA_LOGO = 126 / 71;
