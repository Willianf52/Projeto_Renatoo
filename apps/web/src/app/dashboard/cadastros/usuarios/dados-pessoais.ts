/**
 * CPF, RE, telefone e celular do cadastro de usuarios (migration 0068). Puro,
 * para ser usado pela action e pelo formulario e testado sem banco.
 *
 * O banco guarda so digitos (checks da 0068); a tela aceita com ou sem
 * pontuacao e mostra formatado.
 */

export type DadosPessoais = { cpf: string; re: string; telefone: string; celular: string };

export const DADOS_PESSOAIS_VAZIOS: DadosPessoais = { cpf: "", re: "", telefone: "", celular: "" };

export function somenteDigitos(valor: string): string {
  return valor.replace(/\D/g, "");
}

/**
 * Digitos verificadores do CPF. Sequencia repetida (111.111.111-11) passa na
 * conta e e recusada a parte: e o "CPF de teste" mais digitado.
 */
export function cpfValido(cpf: string): boolean {
  if (!/^\d{11}$/.test(cpf) || /^(\d)\1{10}$/.test(cpf)) return false;

  const digitos = cpf.split("").map(Number);
  const verificador = (quantidade: number) => {
    const soma = digitos.slice(0, quantidade).reduce((total, d, i) => total + d * (quantidade + 1 - i), 0);
    const resto = (soma * 10) % 11;
    return resto === 10 ? 0 : resto;
  };

  return verificador(9) === digitos[9] && verificador(10) === digitos[10];
}

/** Recusa com a mensagem do primeiro campo errado, ou `null`. */
export function erroDosDadosPessoais(dados: DadosPessoais): string | null {
  const cpf = somenteDigitos(dados.cpf);
  if (cpf && !cpfValido(cpf)) return "CPF inválido.";

  if (dados.re.trim().length > 30) return "O RE deve ter no máximo 30 caracteres.";

  for (const [campo, rotulo] of [
    ["telefone", "Telefone"],
    ["celular", "Celular"],
  ] as const) {
    const numero = somenteDigitos(dados[campo]);
    if (numero && !/^\d{10,11}$/.test(numero)) return `${rotulo} inválido: use DDD e número, com 10 ou 11 dígitos.`;
  }

  return null;
}

/** O que vai para `dados_pessoais_dos_usuarios`: so digitos, vazio vira nulo. */
export function paraGravar(dados: DadosPessoais): {
  cpf: string | null;
  re: string | null;
  telefone: string | null;
  celular: string | null;
} {
  return {
    cpf: somenteDigitos(dados.cpf) || null,
    re: dados.re.trim() || null,
    telefone: somenteDigitos(dados.telefone) || null,
    celular: somenteDigitos(dados.celular) || null,
  };
}

export function formatarCpf(cpf: string | null | undefined): string {
  const d = somenteDigitos(cpf ?? "");
  return d.length === 11 ? `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}` : (cpf ?? "");
}

export function formatarTelefone(numero: string | null | undefined): string {
  const d = somenteDigitos(numero ?? "");
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return numero ?? "";
}
