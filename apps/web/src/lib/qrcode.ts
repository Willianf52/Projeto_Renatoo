import QRCode from "qrcode";

/**
 * PNG em data URL para uma <img>. Mais simples e mais seguro que embutir o
 * SVG bruto via dangerouslySetInnerHTML -- não há HTML de terceiro para
 * sanitizar, só uma string de imagem.
 */
export function gerarQrCodeDataUrl(codigo: string): Promise<string> {
  return QRCode.toDataURL(codigo, { margin: 1, width: 240 });
}
