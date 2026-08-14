---
name: supabase-rls-security
description: Use ao criar ou alterar uma migration em supabase/migrations/, escrever ou revisar uma policy de RLS, decidir se uma escrita usa o cliente da sessão ou service_role, adicionar uma rota de API autenticada por segredo compartilhado, ou tocar em qualquer regra de autorização (cargo, nível de acesso, escopo de cliente). Aciona também ao investigar por que uma consulta devolve vazio/RLS bloqueou algo, ou ao decidir onde uma regra de permissão deve morar (TypeScript vs. Postgres).
---

# Segurança e Supabase/RLS — performance-lab-login

Este projeto trata **RLS como a única fonte de verdade de autorização**. A
regra mais importante desta skill: se você está prestes a escrever
`if (cargo === "GESTOR")` em TypeScript para decidir se uma escrita é
permitida, pare — isso já foi tentado, causou duplicação entre TS e SQL, e
foi substituído por RPC para função `security definer`. Não reintroduza.

## 1. Regra de autorização mora no banco, chamada por RPC

```sql
-- supabase/migrations/NNNN_descricao.sql
create or replace function public.pode_administrar_cadastros()
returns boolean
language sql
security definer
stable                          -- SEMPRE stable: permite o planner cachear
                                 -- dentro da mesma transação/policy.
set search_path = public        -- SEMPRE, em toda security definer: evita
                                 -- sequestro de search_path (escalada via
                                 -- schema malicioso na frente do público).
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and ativo and cargo in ('GESTOR', 'SUPERVISOR', 'OPERACIONAL')
  );
$$;

revoke all on function public.pode_administrar_cadastros() from public;
grant execute on function public.pode_administrar_cadastros() to authenticated;
```

```ts
// Do lado do TypeScript, SÓ chame — nunca reimplemente a regra:
const { data: pode } = await supabase.rpc("pode_administrar_cadastros");
```

**Nunca** leia `profiles.cargo` em TypeScript para decidir "pode fazer X".
Ler `cargo`/`nome_completo` para **exibir** na tela é normal
(`lib/perfil-atual.ts`) — decidir permissão com esse valor lido em TS é o
antipadrão que este projeto já corrigiu uma vez.

## 2. Toda tabela sensível: RLS habilitado + grant coluna a coluna

Colunas que definem poder (`cargo`, `ativo`) **nunca** têm grant de update
para `authenticated`, mesmo que a tabela tenha policy de UPDATE:

```sql
revoke insert, update on public.profiles from authenticated;
grant update (nome_completo) on public.profiles to authenticated;
-- cargo e ativo ficam de fora do grant, de propósito: são as colunas que
-- concedem poder. Se algum dia a policy de UPDATE liberar mais, o grant
-- continua sendo o segundo portão.
```

Ao adicionar uma tabela nova, pergunte: **quais colunas nunca podem ser
escritas por `authenticated` direto, mesmo que a policy geral permita
UPDATE?** Aplique grant coluna a coluna nessas, não confie só na policy.

## 3. `service_role` só quando RLS genuinamente não alcança

`service_role` ignora RLS por completo. Use apenas quando a coluna não tem
grant para `authenticated` de propósito (ex.: `usuarios/actions.ts` escreve
`cargo`/`ativo` via `lib/supabase/admin.ts`). Regras obrigatórias sempre que
usar `service_role`:

1. A checagem de permissão roda **com o cliente da sessão**, nunca com o
   admin, e roda **antes** de qualquer escrita — porque não há RLS atrás
   para segurar o que passar.
2. Toda action que usa `service_role` documenta explicitamente, no topo do
   arquivo, por que RLS não se aplica ali.
3. Nunca inicialize o client admin no topo do módulo — só dentro da função
   que precisa dele, dentro de um `try/catch`, para a ausência da env var
   (`SUPABASE_SERVICE_ROLE_KEY`) não derrubar o resto do app que não precisa
   dela.

```ts
let admin: ReturnType<typeof createAdminClient>;
try {
  admin = createAdminClient();
} catch (falha) {
  erro(idRequisicao, "Contexto: service_role indisponível.", falha);
  return { erro: "Recurso não configurado no servidor.", valores };
}
```

## 4. UPDATE/DELETE barrado por RLS não devolve erro — devolve zero linhas

Este é o bug de segurança silenciosa mais fácil de introduzir neste projeto.
Toda escrita que passa pelo cliente da sessão (não `service_role`) e não é
um INSERT precisa confirmar que alterou alguma coisa:

```ts
const resultado = await supabase.from("tabela").update(linha).eq("id", id).select("id").maybeSingle();
const verificacao = verificarEscritaComRls(resultado, MENSAGENS_DE_ERRO, "Sem permissão ou não existe mais.");
if (!verificacao.ok) return { erro: verificacao.erro, valores };
```

Use `lib/escrita-rls.ts` (`verificarEscritaComRls`) — não reimplemente o
`if (error) ...; if (!data) ...` módulo a módulo.

## 5. Rotas autenticadas por segredo compartilhado (não por sessão)

Processos de integração (importação de coletas, webhook do Supabase) não têm
cookie de sessão. Padrão obrigatório para rota nova desse tipo:

```ts
export const dynamic = "force-dynamic"; // nunca pré-renderize rota de escrita

const segredoEsperado = process.env.MEU_SEGREDO;
if (!segredoEsperado) {
  erro(idRequisicao, "Rota X: MEU_SEGREDO não configurado no servidor.");
  return NextResponse.json({ error: "server misconfigured" }, { status: 500 });
}

if (!segredoConfere(request.headers.get("x-meu-segredo"), segredoEsperado)) {
  return NextResponse.json({ error: "unauthorized" }, { status: 401 });
}

// Rate limit DEPOIS do segredo, não antes: o alvo é quem tem o segredo
// (vazado ou não) abusando da rota, não ruído não-autenticado.
const limite = limitarTaxa(`rota-x:${identificarChamador(request)}`, 20, 60_000);
if (!limite.permitido) {
  return NextResponse.json(
    { error: "muitas requisições, tente novamente mais tarde" },
    { status: 429, headers: { "Retry-After": String(limite.tenteNovamenteEmSegundos) } },
  );
}
```

`segredoConfere` (`lib/webhook-user-updated.ts`) faz comparação em **tempo
constante** — nunca compare segredo com `===` direto (abre timing attack).
`lib/rate-limit.ts` é em memória, por processo — documente essa limitação se
usar (não vale para múltiplas réplicas sem ajuste).

## 6. Migrations: convenções obrigatórias

- Numeração sequencial (`NNNN_descricao_curta.sql`), nunca reutilize número.
- Cabeçalho em comentário explicando **por que** a migration existe — não
  "adiciona coluna X", mas o problema que a ausência causava.
- Idempotente sempre que possível: `create or replace function`,
  `drop policy if exists ... ; create policy ...`, `create index if not exists`.
- `using` e `with check` **iguais** numa policy de UPDATE — sem `with check`,
  quem pode editar poderia salvar a linha num estado que ele mesmo não
  alcança mais depois.
- Toda migration que mexe em policy de RLS **precisa** de um pgTAP
  correspondente em `supabase/tests/database/` (ver skill de testes).
- Sem down-migration formal neste projeto — mudança de schema é forward-only.
  Pense em reversibilidade ao escrever (evite `drop column` sem necessidade
  clara; prefira depreciar).

## 7. Sem staging: todo cuidado extra importa

Não há branch/staging do Supabase disponível no plano atual. Migration nova
é ensaiada por leitura cuidadosa + pgTAP rodado manualmente (ver skill de
testes) antes de aplicar em produção — nunca aplique uma migration de RLS
sem rodar o pgTAP correspondente primeiro.

## 8. Checklist antes de fechar qualquer mudança de autorização

- [ ] A regra nova está em SQL (`security definer`, `stable`,
      `set search_path`), não em TypeScript?
- [ ] `revoke`/`grant` explícitos, coluna a coluna se a tabela tem coluna
      sensível?
- [ ] UPDATE tem `using` e `with check` iguais?
- [ ] Toda escrita via cliente de sessão confere zero-linhas
      (`verificarEscritaComRls`)?
- [ ] `service_role`, se usado, está atrás de checagem com o cliente da
      sessão, feita antes de qualquer escrita?
- [ ] Existe pgTAP cobrindo o caso de permitir e o caso de negar?
- [ ] Rodou o pgTAP de verdade (não só escreveu) antes de considerar
      fechado?
