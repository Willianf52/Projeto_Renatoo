import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/supabase/query-helpers", () => ({ buscarEmPaginas: vi.fn() }));

import { filtrarPorGrupos, type EventoDaLista } from "./queries";

const evento = (id: number) => ({ id }) as EventoDaLista;
const permissoes = [
  { evento_id: 1, grupo_site_id: 10, grupo_usuario_id: null },
  { evento_id: 2, grupo_site_id: null, grupo_usuario_id: 7 },
  { evento_id: 3, grupo_site_id: 10, grupo_usuario_id: null },
  { evento_id: 3, grupo_site_id: null, grupo_usuario_id: 7 },
];

describe("filtrarPorGrupos", () => {
  const eventos = [evento(1), evento(2), evento(3), evento(4)];

  it("sem filtro devolve todos", () => {
    expect(filtrarPorGrupos(eventos, permissoes, {}).map((e) => e.id)).toEqual([1, 2, 3, 4]);
  });

  it("Grupo de Locais deixa so os eventos com permissao nele", () => {
    expect(filtrarPorGrupos(eventos, permissoes, { grupoLocal: "10" }).map((e) => e.id)).toEqual([1, 3]);
  });

  it("os dois filtros juntos pedem os dois", () => {
    expect(filtrarPorGrupos(eventos, permissoes, { grupoLocal: "10", grupoUsuario: "7" }).map((e) => e.id)).toEqual([3]);
  });
});
