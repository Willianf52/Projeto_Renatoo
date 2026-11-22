/**
 * O que o navegador e o servidor compartilham sobre a foto do usuario (0112):
 * o bucket, o caminho e a conferencia do arquivo. Sem nada de servidor, para
 * o `EditorDeFoto` (Client Component) poder importar.
 */

export const BUCKET_DAS_FOTOS = "fotos-de-usuario";
export const TAMANHO_MAXIMO_DA_FOTO = 2 * 1024 * 1024;
export const TIPOS_DE_FOTO = ["image/jpeg", "image/png", "image/webp"];

export function caminhoDaFoto(usuarioId: string): string {
  return `${usuarioId}/foto`;
}

/** O problema da foto escolhida, ou `null` se ela serve. */
export function problemaDaFoto(arquivo: { size: number; type: string } | null): string | null {
  if (!arquivo || arquivo.size === 0) return "Escolha uma foto.";
  if (!TIPOS_DE_FOTO.includes(arquivo.type)) return "A foto precisa ser JPG, PNG ou WebP.";
  if (arquivo.size > TAMANHO_MAXIMO_DA_FOTO) return "A foto deve ter no máximo 2 MB.";
  return null;
}
