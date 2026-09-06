import { Circle, Path, Rect, Svg } from "react-native-svg";

/**
 * Os mesmos desenhos do painel web (`FormField.tsx` e `dashboard/icons.tsx`),
 * traduzidos de `<svg>` para `react-native-svg` -- o `d` de cada `<path>` e
 * copia literal, entao o traco sai identico nos dois produtos.
 *
 * Trazidos um a um, conforme a tela do mobile precisa: uma biblioteca de
 * icones inteira traria mil desenhos que nao sao os da marca e ainda deixaria
 * a duvida de qual dos mil e o "certo" -- que e o problema que o painel ja
 * resolveu escolhendo os seus.
 */
type PropsDeIcone = {
  /** Lado do quadrado, em pontos. Os do painel sao `h-5 w-5` (20). */
  tamanho?: number;
  cor: string;
};

const COMUNS = {
  fill: "none",
  strokeWidth: 2,
  strokeLinecap: "round",
  strokeLinejoin: "round",
} as const;

export function IconeDeOlho({ tamanho = 20, cor }: PropsDeIcone) {
  return (
    <Svg width={tamanho} height={tamanho} viewBox="0 0 24 24" fill="none">
      <Path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" stroke={cor} {...COMUNS} />
      <Circle cx="12" cy="12" r="3" stroke={cor} {...COMUNS} />
    </Svg>
  );
}

export function IconeDeOlhoFechado({ tamanho = 20, cor }: PropsDeIcone) {
  return (
    <Svg width={tamanho} height={tamanho} viewBox="0 0 24 24" fill="none">
      <Path
        d="M9.9 4.24A9.12 9.12 0 0 1 12 4c6.5 0 10 7 10 7a17 17 0 0 1-2.42 3.6M6.61 6.61A17.15 17.15 0 0 0 2 11s3.5 7 10 7a9.14 9.14 0 0 0 4.16-.98"
        stroke={cor}
        {...COMUNS}
      />
      <Path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" stroke={cor} {...COMUNS} />
      <Path d="M2 2l20 20" stroke={cor} {...COMUNS} />
    </Svg>
  );
}

/** Cadeado do link "Perdeu sua Senha?" do painel. */
export function IconeDeCadeado({ tamanho = 14, cor }: PropsDeIcone) {
  return (
    <Svg width={tamanho} height={tamanho} viewBox="0 0 24 24" fill="none">
      <Rect x="3" y="11" width="18" height="11" rx="2" ry="2" stroke={cor} {...COMUNS} />
      <Path d="M7 11V7a5 5 0 0 1 10 0v4" stroke={cor} {...COMUNS} />
    </Svg>
  );
}

/** Lupa do estado vazio do `DataTable` do painel. */
export function IconeDeLupa({ tamanho = 20, cor }: PropsDeIcone) {
  return (
    <Svg width={tamanho} height={tamanho} viewBox="0 0 24 24" fill="none">
      <Circle cx="11" cy="11" r="7" stroke={cor} {...COMUNS} />
      <Path d="m21 21-4.3-4.3" stroke={cor} {...COMUNS} />
    </Svg>
  );
}

/**
 * Os tres desenhos da tela inicial. Nao vieram do painel -- ele nao tem um
 * menu de acoes como este --, entao seguem a mesma gramatica dos de cima
 * (traco 2, cantos redondos, grade de 24) para nao destoarem ao lado deles.
 */

/** Lista com marcas de conferido: o cartao "Inspecao". */
export function IconeDeChecklist({ tamanho = 24, cor }: PropsDeIcone) {
  return (
    <Svg width={tamanho} height={tamanho} viewBox="0 0 24 24" fill="none">
      <Path d="m3 6 2 2 3-3" stroke={cor} {...COMUNS} />
      <Path d="m3 14 2 2 3-3" stroke={cor} {...COMUNS} />
      <Path d="M12 7h9" stroke={cor} {...COMUNS} />
      <Path d="M12 15h9" stroke={cor} {...COMUNS} />
      <Path d="M12 21h9" stroke={cor} {...COMUNS} />
    </Svg>
  );
}

/** Relogio: o cartao "Agendados". */
export function IconeDeRelogio({ tamanho = 24, cor }: PropsDeIcone) {
  return (
    <Svg width={tamanho} height={tamanho} viewBox="0 0 24 24" fill="none">
      <Circle cx="12" cy="12" r="9" stroke={cor} {...COMUNS} />
      <Path d="M12 7v5l3 2" stroke={cor} {...COMUNS} />
    </Svg>
  );
}

/** Duas setas em ciclo: o cartao "Sincronizar". */
export function IconeDeSincronizar({ tamanho = 24, cor }: PropsDeIcone) {
  return (
    <Svg width={tamanho} height={tamanho} viewBox="0 0 24 24" fill="none">
      <Path d="M20 11a8 8 0 0 0-13.7-5.7L3 8.5" stroke={cor} {...COMUNS} />
      <Path d="M3 4v4.5h4.5" stroke={cor} {...COMUNS} />
      <Path d="M4 13a8 8 0 0 0 13.7 5.7L21 15.5" stroke={cor} {...COMUNS} />
      <Path d="M21 20v-4.5h-4.5" stroke={cor} {...COMUNS} />
    </Svg>
  );
}
