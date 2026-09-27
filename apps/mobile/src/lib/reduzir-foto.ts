import { requireOptionalNativeModule } from "expo";

import { capturarErro } from "./observabilidade";

/**
 * Reduz a foto da camera antes de ela entrar no checklist.
 *
 * O PROBLEMA. `quality: 0.6` no seletor so mexe na compressao do JPEG, nao na
 * resolucao: o iPhone entrega 12 MP ou mais, e as fotos do primeiro teste em
 * aparelho (25/09/2026) chegaram ao bucket com 1,4 MB em media. No plano free
 * do Supabase o Storage tem 1 GB -- cerca de 700 fotos, ou poucas semanas de
 * operacao. E cada foto dessas e o que o inspetor sobe pela rede de campo.
 *
 * 1600 px no lado maior le etiqueta, placa e o estado do local, que e o que a
 * foto precisa provar, e fica na casa de 200-300 KB.
 *
 * FALHA ABERTA. Qualquer problema aqui devolve a foto original: foto grande e
 * custo, foto perdida e checklist que nao fecha. Em especial, o
 * `runtimeVersion` do app e `appVersion`, entao uma atualizacao OTA pode
 * chegar a um APK gerado ANTES de `expo-image-manipulator` entrar no build.
 * Importar o modulo nesse aparelho derrubaria o app no toque em "Tirar foto"
 * -- por isso a checagem do modulo nativo vem antes do `import`, que e
 * dinamico de proposito.
 */

export const LADO_MAIOR_DA_FOTO = 1600;

/** Compressao do JPEG reduzido. A foto ja veio a 0.6 do seletor; com menos pixels, 0.7 aqui nao acrescenta artefato visivel. */
const COMPRESSAO_DA_FOTO_REDUZIDA = 0.7;

/**
 * O lado a limitar, ou `null` quando a foto ja cabe. So um dos dois lados vai
 * para o `resize`: o outro sai da proporcao, e passar os dois deformaria a
 * imagem.
 */
export function tamanhoReduzido(
  largura: number,
  altura: number,
  ladoMaior: number = LADO_MAIOR_DA_FOTO,
): { width: number } | { height: number } | null {
  if (largura <= ladoMaior && altura <= ladoMaior) return null;
  return largura >= altura ? { width: ladoMaior } : { height: ladoMaior };
}

export async function reduzirFoto(uri: string): Promise<string> {
  // APK anterior ao modulo: segue com a foto como sempre foi, sem registrar
  // erro -- nao e falha, e aparelho desatualizado, e o piso de versao cuida
  // disso por outro caminho.
  if (!requireOptionalNativeModule("ExpoImageManipulator")) return uri;

  try {
    const { ImageManipulator, SaveFormat } = await import("expo-image-manipulator");

    // A decodificacao ja aplica a orientacao do EXIF: largura e altura aqui
    // sao as da foto como ela aparece, e nao as do sensor. E por isso que se
    // decodifica antes de decidir o lado, em vez de confiar no que o seletor
    // informou.
    const original = await ImageManipulator.manipulate(uri).renderAsync();
    const tamanho = tamanhoReduzido(original.width, original.height);

    if (!tamanho) return uri;

    const reduzida = await ImageManipulator.manipulate(original).resize(tamanho).renderAsync();
    const salva = await reduzida.saveAsync({
      format: SaveFormat.JPEG,
      compress: COMPRESSAO_DA_FOTO_REDUZIDA,
    });

    return salva.uri;
  } catch (falha) {
    capturarErro(falha, { onde: "reduzirFoto" });
    return uri;
  }
}
