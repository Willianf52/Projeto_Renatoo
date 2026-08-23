/**
 * Achata `profiles.superior_id` (migration 0003) numa lista indentada por
 * hierarquia, como no sistema de referencia: `->Gesiel` no primeiro nivel,
 * `--->Gilmar` abaixo dele. Usada por qualquer tela que precise escolher uma
 * ou mais pessoas respeitando a cadeia de chefia -- hoje o filtro/campo
 * "Responsável" de Site / Planta e o campo "Usuários" de Grupo de Usuários.
 *
 * Achatada e nao aninhada porque os dois destinos sao um `<option>` ou um
 * `<label>` de checkbox, nenhum dos dois aceita estrutura -- o prefixo e o
 * unico jeito de mostrar profundidade ali.
 *
 * Raiz e quem nao tem superior OU cujo superior nao veio na lista: o RLS de
 * `profiles` (migration 0006) recorta a consulta de quem chama, e sem esta
 * segunda condicao uma pessoa cujo chefe ficou de fora sumiria da lista
 * inteira, em vez de aparecer no topo.
 */

export type PerfilBruto = { id: string; nome_completo: string | null; superior_id: string | null };
export type OpcaoHierarquica = { value: string; label: string };

export function montarHierarquiaDePerfis(perfis: PerfilBruto[]): OpcaoHierarquica[] {
  const filhos = new Map<string | null, PerfilBruto[]>();
  const ids = new Set(perfis.map((p) => p.id));

  for (const perfil of perfis) {
    const pai = perfil.superior_id && ids.has(perfil.superior_id) ? perfil.superior_id : null;
    filhos.set(pai, [...(filhos.get(pai) ?? []), perfil]);
  }

  const opcoes: OpcaoHierarquica[] = [];
  // `superior_id` nao tem trava contra ciclo no banco (A chefia B, B chefia A).
  // Sem este conjunto a recursao nao terminaria e a tela travaria no servidor.
  const visitados = new Set<string>();

  const incluir = (perfil: PerfilBruto, profundidade: number) => {
    visitados.add(perfil.id);
    opcoes.push({
      value: perfil.id,
      label: `${"-".repeat(2 * profundidade + 1)}>${perfil.nome_completo || "(sem nome)"}`,
    });
  };

  const descer = (pai: string | null, profundidade: number) => {
    for (const perfil of filhos.get(pai) ?? []) {
      if (visitados.has(perfil.id)) continue;
      incluir(perfil, profundidade);
      descer(perfil.id, profundidade + 1);
    }
  };

  descer(null, 0);

  // Num ciclo fechado ninguem e raiz, entao a descida acima nao alcanca
  // ninguem do ciclo e as pessoas sumiriam da lista em silencio -- pior que o
  // loop que o conjunto de visitados evita. Quem sobrou entra no primeiro
  // nivel: melhor aparecer sem a hierarquia certa do que nao aparecer.
  for (const perfil of perfis) {
    if (!visitados.has(perfil.id)) incluir(perfil, 0);
  }

  return opcoes;
}
