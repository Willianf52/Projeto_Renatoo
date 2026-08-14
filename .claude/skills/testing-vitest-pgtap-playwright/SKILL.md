---
name: testing-vitest-pgtap-playwright
description: Use ao escrever ou revisar testes neste projeto — testes unitários de Server Action/query com Vitest, testes de componente React (FilterDatePicker/FilterTimePicker e similares), testes de política de RLS com pgTAP em supabase/tests/database/, ou specs Playwright em e2e/. Aciona também ao decidir se uma mudança precisa de teste novo, ao mockar o cliente Supabase, ou ao rodar a suíte antes de considerar uma tarefa concluída.
---

# Testes — performance-lab-login (Vitest / pgTAP / Playwright)

## 1. Regra inegociável: toda tarefa termina com a suíte rodando

Antes de considerar qualquer mudança em `src/` pronta:

```bash
pnpm lint
pnpm exec tsc --noEmit
pnpm test           # vitest run
pnpm run build       # pega erro que lint/tsc não pegam (ex.: Suspense faltando)
```

Se a mudança tocou `supabase/migrations/` ou policy de RLS, o pgTAP também
precisa rodar de verdade (seção 3) — escrever o `.sql` sem executar não
conta como testado.

## 2. Vitest — Server Actions e queries

### Ambiente: `node` por padrão, `jsdom` só por arquivo

`vitest.config.mts` usa `environment: "node"` globalmente — rápido, sem DOM,
serve para quase toda a suíte (lib/, actions, queries). Um arquivo que
precisa de DOM (teste de componente React) declara isso **sozinho**, no
topo, e não muda o ambiente global:

```ts
// @vitest-environment jsdom
```

Não troque `environment` para `"jsdom"` no config global só para um arquivo
novo — deixa a suíte inteira mais lenta.

### Mock do cliente Supabase: padrão "array de chamadas"

```ts
const { createClientMock, redirectMock, revalidatePathMock, resultados, chamadas } = vi.hoisted(() => {
  const resultados = { insert: { data: { id: 9 }, error: null as { code: string } | null } };
  const chamadas: Array<{ tipo: string; args: unknown[] }> = [];
  const registrar = (tipo: string, ...args: unknown[]) => chamadas.push({ tipo, args });

  const createClientMock = vi.fn(async () => ({
    from: (tabela: string) => ({
      insert: (linha: unknown) => {
        registrar("insert", tabela, linha);
        return { select: () => ({ maybeSingle: () => Promise.resolve(resultados.insert) }) };
      },
    }),
    rpc: (nome: string, params: unknown) => {
      registrar(nome, params);
      return Promise.resolve({ error: null });
    },
  }));

  return { createClientMock, redirectMock: vi.fn(), revalidatePathMock: vi.fn(), resultados, chamadas };
});

vi.mock("@/lib/supabase/server", () => ({ createClient: createClientMock }));
vi.mock("next/cache", () => ({ revalidatePath: revalidatePathMock }));
vi.mock("next/navigation", () => ({ redirect: redirectMock }));

const { salvarX } = await import("./actions"); // import DEPOIS dos vi.mock
```

Regras:
- `vi.hoisted()` para tudo que os `vi.mock()` referenciam — sem isso o mock
  quebra por ordem de hoisting do Vitest.
- `beforeEach` sempre reseta `chamadas.length = 0` e os valores de
  `resultados` para o caso de sucesso — cada teste começa limpo.
- Quando a implementação muda de `.from().delete()/.insert()` para
  `.rpc("nome_da_funcao", params)`, **atualize o mock e as asserções junto**
  — não deixe o mock simular uma chamada que o código não faz mais.

### O que cobrir em toda action nova (mínimo)

1. Validação recusa cada campo obrigatório/fora do limite, **sem** chegar ao
   banco (`expect(chamadas).toHaveLength(0)`).
2. Caminho de sucesso: `insert`/`update` recebe exatamente o objeto
   esperado (valores normalizados: string vazia → `null`, trim aplicado).
3. Tradução de erro do Postgres (duplicado `23505`, sem permissão `42501`,
   FK inválida `23503`).
4. UPDATE que devolve zero linhas (`data: null, error: null`) é tratado como
   recusa, não sucesso.
5. `id` não numérico é recusado antes de tocar o banco.

### Testes de componente (React Testing Library)

```tsx
// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MeuComponente } from "./MeuComponente";

// OBRIGATÓRIO: sem `globals: true` no vitest.config.mts, o cleanup
// automático do Testing Library não se registra sozinho — sem isto, o
// segundo teste em diante encontra elementos do teste anterior no DOM.
afterEach(cleanup);

it("...", async () => {
  const user = userEvent.setup();
  render(<MeuComponente />);
  await user.click(screen.getByRole("button", { name: "..." }));
  expect(screen.getByRole("dialog")).toBeInTheDocument();
});
```

Nunca esqueça o `afterEach(cleanup)` — é o erro mais fácil de cometer aqui e
produz falhas confusas ("multiple elements found") em vez de um erro óbvio.

## 3. pgTAP — políticas de RLS

### Estrutura de todo arquivo em `supabase/tests/database/`

```sql
begin;

select plan(N);  -- N = número exato de asserts abaixo

-- fixture: usuários/dados de teste com uuid determinístico (prefixo
-- reconhecível, ex. 'a0000000-...'), nunca dado real.
insert into auth.users (id, instance_id, aud, role, email) values (...);
update public.profiles set ativo = true, cargo = 'GESTOR' where id = '...';

set local role authenticated;
set local "request.jwt.claims" to '{"sub": "...", "role": "authenticated"}';

select is((select count(*)::int from public.tabela), 1, 'descrição do que isso prova');
select throws_ok($$ insert into ... $$, '42501', null, 'descrição');
select lives_ok($$ select public.minha_funcao(...) $$, 'descrição');

reset role;

select * from finish();

rollback;  -- SEMPRE — nada deste arquivo pode persistir
```

Regras:
- `begin;`/`rollback;` **sempre** envolvendo o arquivo inteiro — um pgTAP
  que não desfaz sozinho não pode ser rodado com segurança contra produção.
- Todo `id::text` ao comparar com `like` — `profiles.id` é `uuid`, não
  `text`; `where id like 'a0000000%'` quebra em tempo de execução sem cast.
  (Bug real já cometido e corrigido neste projeto — ver
  `escopo_de_cliente_test.sql`.)
- Cubra sempre os três lados de uma regra de autorização: quem **pode**,
  quem **não pode**, e o caso que quebraria calado (ex.: RLS nova
  esvaziando a visão de quem não deveria ser afetado).
- Para provar atomicidade de uma função Postgres (delete+insert numa
  transação), force uma falha no meio (ex.: FK inválida no segundo passo) e
  confirme que o primeiro passo também não persistiu.

### Como rodar

Ambiente local sem Docker não roda `supabase test db`. Caminho usado neste
projeto quando não há Docker nem branch de desenvolvimento disponível
(plano atual do Supabase não inclui branching):

1. Confirme a extensão: `create extension if not exists pgtap with schema extensions;`
   (uma vez, idempotente).
2. Rode o arquivo **inteiro** direto contra o projeto real via MCP do
   Supabase (`execute_sql`), sempre dentro do próprio `begin;...rollback;`
   do arquivo — nunca contra produção sem o rollback.
3. **Armadilha:** rodar múltiplos `select algum_assert(...)` como
   statements separados numa chamada só faz o executor devolver **apenas o
   resultado do último statement** — as linhas TAP anteriores (`ok 1`,
   `ok 2`...) somem. Envolva cada assert num `insert into tap_output (line)
   select ...` (tabela temporária criada no início do script) e finalize
   com `select line from tap_output;` antes do `rollback;`, para ver o
   resultado completo de uma vez:

   ```sql
   begin;
   create temp table tap_output (line text);
   -- grant all on tap_output to authenticated;  -- só se o script troca de role
   insert into tap_output (line) select plan(N);
   insert into tap_output (line) select is(..., ..., '...');
   insert into tap_output (line) select * from finish();
   select line from tap_output;
   rollback;
   ```

4. Se o script faz `set local role authenticated`, dê
   `grant all on tap_output to authenticated;` logo após criar a tabela —
   senão o `insert into tap_output` falha por falta de permissão quando o
   role muda.
5. Depois de confirmar que passa, atualize o cabeçalho do próprio arquivo
   `.sql` registrando data e resultado ("Executado (data) direto contra
   produção, dentro de transação com rollback. N/N asserts passaram") — não
   deixe o comentário antigo "NÃO EXECUTADO" mentir sobre o estado real.

## 4. Playwright (e2e/)

- Specs pulam sozinhas sem `E2E_EMAIL`/`E2E_PASSWORD`/`E2E_INACTIVE_EMAIL`/
  `E2E_INACTIVE_PASSWORD` — de propósito, para não gastar rate limit do
  Supabase Auth a cada push de CI.
- Não rode e2e contra produção sem credencial de teste dedicada.
- `pnpm test:e2e` roda local; não está no workflow de CI por decisão
  explícita (custo de rate limit).

## 5. Antes de abrir mão de escrever um teste

Se a mudança é em `lib/` puro (sem I/O) e você está tentado a pular o
teste porque "é óbvio" — não pule. Toda função em `lib/` neste projeto tem
teste próprio (`password-policy.ts`, `safe-redirect.ts`, `rate-limit.ts`,
`mfa.ts` quando existir, etc.) mesmo sendo pequena — é o padrão do projeto,
e uma função pura sem teste é a exceção que quebra a régua para a próxima
pessoa que copiar o padrão.
