import * as Location from "expo-location";

import type { Localizacao } from "../campo/fila";

/**
 * O ponto do aparelho para a leitura, como o app do sistema de referencia
 * grava no inicio e no fim da visita (`geodata` / `geodata_termino`).
 *
 * REGRA DE OURO: nunca segura a leitura. Sem permissao, GPS desligado ou sem
 * resposta no prazo, devolve `null` e a leitura segue sem ponto -- quem esta
 * em campo nao pode ficar parado esperando satelite. Por isso primeiro a
 * ultima posicao conhecida (instantanea) e so depois a atual, com prazo curto.
 *
 * A permissao e pedida uma vez, so "enquanto o app esta em uso"; nao ha
 * rastreio em segundo plano.
 */

const PRAZO_MS = 4000;
/** Posicao conhecida de ate 2 minutos vale: o inspetor esta parado no QR. */
const IDADE_MAXIMA_MS = 2 * 60 * 1000;

let permissao: Promise<boolean> | null = null;

function temPermissao(): Promise<boolean> {
  permissao ??= Location.requestForegroundPermissionsAsync()
    .then((r) => r.granted)
    .catch(() => false);
  return permissao;
}

function paraLocalizacao(posicao: Location.LocationObject | null): Localizacao | null {
  if (!posicao) return null;
  return {
    latitude: posicao.coords.latitude,
    longitude: posicao.coords.longitude,
    precisao: posicao.coords.accuracy ?? null,
  };
}

export async function lerLocalizacao(): Promise<Localizacao | null> {
  try {
    if (!(await temPermissao())) {
      // Negada uma vez, pergunta de novo na proxima abertura do app.
      permissao = null;
      return null;
    }
    const conhecida = await Location.getLastKnownPositionAsync({ maxAge: IDADE_MAXIMA_MS }).catch(() => null);
    if (conhecida) return paraLocalizacao(conhecida);

    const prazo = new Promise<null>((resolver) => setTimeout(() => resolver(null), PRAZO_MS));
    const atual = Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }).catch(() => null);
    return paraLocalizacao(await Promise.race([atual, prazo]));
  } catch {
    return null;
  }
}
