import { z } from "zod";

/**
 * Regras de campo do cadastro de site, num arquivo que nao e `"use server"`:
 * um arquivo de Server Actions so pode exportar funcoes assincronas, e estas
 * regras agora servem a DOIS caminhos -- o formulario (`actions.ts`) e o
 * Importar sites (`importacao.ts`). Uma so fonte, para o arquivo importado
 * nao aceitar o que a tela recusaria (nem o contrario).
 */

/**
 * Limites de aplicacao, nao do banco -- recusam colagem acidental de texto
 * enorme, nao regra de negocio. `uf` e a excecao: e `char(2)` no banco
 * (migration 0003), validada a parte por regex.
 *
 * Limite e mensagem vivem juntos, campo a campo, em vez de dois mapas
 * paralelos (limites + rotulos) percorridos por um loop -- era exatamente o
 * formato onde "esqueci de adicionar o campo novo em um dos dois mapas"
 * virava um bug silencioso (campo sem limite, ou limite sem mensagem).
 *
 * `codCliente`/`codPosto`/`filial` (migration 0021) ficam folgados de
 * proposito: sao chaves de sistemas de terceiros, formato desconhecido.
 */
export const esquemaDeTexto = z.object({
  nome: z.string().min(1, "Informe o nome do site.").max(200, "O nome deve ter no máximo 200 caracteres."),
  sigla: z.string().max(20, "A sigla deve ter no máximo 20 caracteres."),
  regional: z.string().max(100, "A regional deve ter no máximo 100 caracteres."),
  cidade: z.string().max(100, "A cidade deve ter no máximo 100 caracteres."),
  observacao: z.string().max(1000, "A observação deve ter no máximo 1000 caracteres."),
  // Sem mascara de formato de proposito: o cadastro tambem atende endereco
  // fora do Brasil, e um padrao de 8 digitos recusaria um CEP legitimo.
  cep: z.string().max(20, "O CEP deve ter no máximo 20 caracteres."),
  endereco: z.string().max(200, "O endereço deve ter no máximo 200 caracteres."),
  numero: z.string().max(20, "O número deve ter no máximo 20 caracteres."),
  bairro: z.string().max(100, "O bairro deve ter no máximo 100 caracteres."),
  complemento: z.string().max(100, "O complemento deve ter no máximo 100 caracteres."),
  pais: z.string().max(60, "O país deve ter no máximo 60 caracteres."),
  codCliente: z.string().max(50, "O código do cliente deve ter no máximo 50 caracteres."),
  codPosto: z.string().max(50, "O código do posto deve ter no máximo 50 caracteres."),
  filial: z.string().max(50, "A filial deve ter no máximo 50 caracteres."),
  infoAdicional1: z.string().max(200, "A informação adicional 1 deve ter no máximo 200 caracteres."),
  infoAdicional2: z.string().max(200, "A informação adicional 2 deve ter no máximo 200 caracteres."),
});

/**
 * Raio de tolerancia em metros. Vazio e valido (sem raio definido); negativo
 * nao e -- raio negativo nao quer dizer nada, e o banco aceitaria.
 */
export function lerRaio(valor: string): { ok: true; valor: number | null } | { ok: false; erro: string } {
  if (valor === "") return { ok: true, valor: null };

  const numero = Number(valor);
  if (!Number.isInteger(numero)) {
    return { ok: false, erro: "O raio deve ser um número inteiro de metros." };
  }
  if (numero < 0) return { ok: false, erro: "O raio não pode ser negativo." };

  return { ok: true, valor: numero };
}

/**
 * Coordenada opcional (migration 0025). Vazio e "nao informada"; preenchido
 * precisa estar dentro do intervalo valido -- o banco (`numeric(10,7)`)
 * aceitaria qualquer numero de ate 3 digitos antes da virgula, mas 91 de
 * latitude nao significa nada.
 */
export function lerCoordenada(
  valor: string,
  limite: number,
  rotulo: string,
): { ok: true; valor: number | null } | { ok: false; erro: string } {
  if (valor === "") return { ok: true, valor: null };

  // Aceita virgula decimal: e o separador que o teclado numerico do celular
  // produz em pt-BR, e o "GPS" do formulario grava com ponto -- os dois
  // precisam entrar.
  const numero = Number(valor.replace(",", "."));
  if (!Number.isFinite(numero)) {
    return { ok: false, erro: `${rotulo} deve ser um número.` };
  }
  if (numero < -limite || numero > limite) {
    return { ok: false, erro: `${rotulo} deve estar entre -${limite} e ${limite}.` };
  }

  return { ok: true, valor: numero };
}
