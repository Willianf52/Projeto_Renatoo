# Melhorias do Sistema — Revisão Fullstack

Levantamento feito lendo middleware, RLS, fluxo de auth e as telas do dashboard.
Organizado por prioridade. Cada item cita o arquivo/linha onde o problema
aparece hoje.

> Última revisão: 2026-08-05. A lista foi podada do que já entrou — o histórico
> fica em "Itens fechados", no fim, para não reabrir discussão já resolvida.
> Segurança tem documento próprio (`AUDITORIA-SEGURANCA.md`); aqui só entra o
> que não é achado de auditoria.
>
> **A numeração é sequencial e muda a cada revisão** — markdown renumera lista
> ordenada sozinho, então não adianta tentar preservar o número de um item
> fechado. Por isso a tabela do fim identifica cada item pelo nome, não pelo
> número, e referência entre itens também: número aqui não é identificador.

## Alta prioridade

1. **As policies de RLS não têm um único teste.** Os testes cobrem bem a lógica
   pura em TypeScript, mas a autorização de verdade mora nas 10 migrations em
   `supabase/migrations/` — e é nelas que todo o resto se apoia ("quem autoriza
   de verdade é o RLS, no banco", `grupo-de-sites/queries.ts:70`). Some-se a
   isso que `supabase/` só tem `migrations/`, sem `config.toml`: hoje não há
   como rodar `supabase db reset` local e verificar nada.

   As invariantes já estão escritas em português nos comentários das migrations;
   falta virarem asserção com pgTAP:

   - conta nova nasce inativa e como OPERADOR (0005, 0008);
   - OPERADOR não lê perfil alheio, GESTOR/SUPERVISOR leem (0006);
   - `anon` não escreve em `grupos_sites` (0010);
   - UPDATE em `cargo` e `ativo` negado para `authenticated` (0007).

## Média prioridade

2. **Nenhum teste de ponta a ponta do fluxo de auth.** Middleware, RLS e telas
   são testados isoladamente; nada exercita a costura entre eles. Playwright
   cobrindo login → dashboard, `redirectTo` preservado, e conta inativa barrada
   com a mensagem certa.

3. **Filtros de `coletas-importadas` com semântica assumida, não confirmada.**
   "Localização" foi interpretado como presença/ausência de coordenadas na
   leitura (`leituras.latitude`), "Tipo" como `tipos_servico` do site e
   "Checkpoint" como `qr_codes`. Se o sistema de referência (UP Serviços) usa
   esses campos com outro significado, os filtros restringem errado em
   silêncio. Confirmar com quem conhece a tela original antes de considerar a
   página fechada.

4. **Botões de exportar Excel/PDF sem handler.** Em
   `coletas-importadas/page.tsx` e `grupo-de-sites/page.tsx` os botões existem
   e estão desabilitados com o motivo no rótulo. É a próxima peça óbvia dessas
   telas.

## Baixa prioridade / nice-to-have

5. **`package-lock.json` local.** Está no `.gitignore` e não é rastreado, então
   não é problema de repositório — mas existe na máquina de desenvolvimento e é
   exatamente a divergência npm/pnpm que a auditoria registra como já tendo
   causado dor.

6. **Teto de 15 caracteres na senha.** `lib/password-policy.ts:43` documenta o
   custo: recusa a saída padrão da maioria dos gerenciadores e qualquer
   passphrase. É paridade exigida com o sistema legado — revisitar quando a
   exigência cair.

7. **`console.error` sem correlação nem destino.** `lib/supabase/middleware.ts`,
   `app/dashboard/layout.tsx` e a rota do webhook logam solto, só para o stdout
   do servidor. O `TODO` em `app/dashboard/error.tsx:13` já marca o lugar de
   plugar observabilidade.

8. **"Organização" no navbar é fixa.** `app/dashboard/layout.tsx:45` — já
   marcado como placeholder até existir tabela de organizações. Mantido aqui só
   para não se perder de vista.

---

## Itens fechados

Registrados para não voltarem à lista. Identificados pelo nome: o número que
tinham na revisão em que foram levantados não vale mais nada depois que a lista
renumera.

| Item | Como ficou |
|---|---|
| Cookies renovados perdidos no redirect | `preservarSessao()` em `lib/supabase/middleware.ts`, com teste de regressão |
| Cache de referências guardava falha | `getReferenciasCompartilhadas` não grava no cache se alguma consulta trouxe `error` |
| CI não rodava em push para `main` | Gatilho apontado para `branches: [main]`. Falta marcar o job como required em branch protection — só dá para fazer na UI do GitHub |
| Botão "Sair" podia não sair | `DashboardNavbar` checa o retorno de `signOut()`, avisa na tela e libera o botão. Corrigiu junto um segundo defeito: `signingOut` nunca voltava a `false`, então numa falha o botão travava em "Saindo...". Sem teste automatizado — ver "teste de ponta a ponta do fluxo de auth" |
| Três consultas a `profiles` por requisição | Duas saíram quando `podeAdministrarCadastros()` e `podeVerTodaOperacao()` viraram chamadas RPC às funções `security definer` do banco. A do layout virou `lib/perfil-atual.ts`, memoizada por requisição com `cache()` do React — o ponto não é o número de round-trips hoje, é que tela nova reusa em vez de abrir a sua. A do middleware fica: roda em invocação separada do render, e nenhum cache de requisição atravessa as duas |
| A regra de autorização duplicada em TS e em SQL | `podeAdministrarCadastros()` (`grupo-de-sites/queries.ts`) e `podeVerTodaOperacao()` (`usuarios/queries.ts`, ex-`getNivelAcessoAtual`/`podeVerTodosOsUsuarios`) passaram a chamar `pode_administrar_cadastros()`/`pode_ver_toda_operacao()` via RPC em vez de reimplementar a regra em TS a partir de `cargo`/`ativo`. Fonte única; teste cobre concessão, negação e falha do RPC negando por padrão. O round-trip a menos é o mesmo citado em "Três consultas a `profiles`" |
| `error.tsx`/`not-found.tsx` só no nível do dashboard | `app/error.tsx` e `app/not-found.tsx`, seguindo a identidade visual do login (fundo `brand-navy`, logo, sem depender do `DashboardChrome`) |
| Índices não cobrem buscas nem ordenação real | `supabase/migrations/0011_indices_de_busca_e_ordenacao.sql`: GIN + `pg_trgm` para os `ilike` de `grupos_sites`/`profiles`, índice composto `(data_hora desc, id desc)` em `leituras` no lugar do de coluna única da 0004, e índice em `profiles.nome_completo`. Não testado contra banco local — mesma lacuna do `config.toml` que os testes de RLS pendentes registram |
| `combinarDataHora` sem timezone explícito | Deslocamento `-03:00` fixo no timestamp montado (Brasil não observa horário de verão desde 2019, então o deslocamento não varia), com teste cobrindo os três casos (`combinarDataHora`, exportada de `coletas-importadas/queries.ts`) |
| `packageManager` ausente no `package.json` | Campo `"packageManager": "pnpm@11.18.0"` adicionado; `pnpm/action-setup` no CI não crava mais `version:` — lê do `package.json`, então local e CI não podem mais divergir |
| Cliente Supabase do browser recriado a cada chamada | Singleton de módulo em `lib/supabase/client.ts`: `createClient()` memoiza a instância entre chamadas |
| Botão desabilitado não alcança quem usa teclado | Componente único `components/dashboard/AcaoDesabilitada.tsx` (antes duplicado em `grupo-de-sites/page.tsx` e como dois botões soltos em `coletas-importadas/page.tsx`), com `aria-disabled` + `onClick` no-op no lugar do atributo `disabled`, que preserva o foco por teclado |
| `escaparLike` duplicado nas duas telas | Virou `lib/postgrest-escape.ts`, com teste próprio. `escaparPostgrest` foi junto, e a composição dos dois virou `termoParaOr` — a ordem entre eles não é intercambiável e agora está fixada num lugar só |
| Envs sem validação, erro genérico | `lib/env.ts`, com mensagem apontando o `.env.example` |
| Sem testes nem CI | vitest + `.github/workflows/ci.yml` (lint, typecheck, teste, build) |
| Sem `error.tsx` | `app/dashboard/error.tsx` — o par em `app/` fechou junto (ver acima) |
| Sem `loading.tsx` | `app/dashboard/loading.tsx` |
| `.single()` vs `.maybeSingle()` | Layout passou a usar `maybeSingle`, com o motivo no comentário |
| Sem feedback de tentativas no login | Bloqueio de 30s após 5 falhas em `components/LoginForm.tsx` |

**Decisão de produto, não pendência:** a troca de senha não exige a senha atual
(commit `778c869`). O risco está descrito em `AUDITORIA-SEGURANCA.md` (A07) —
quem alcança uma sessão aberta troca a senha e tranca o dono para fora. A
mitigação seria o e-mail de aviso, que hoje não chega a ninguém porque o
remetente ainda é `onboarding@resend.dev` (`lib/resend.ts:29`), que só entrega
ao dono da conta Resend.
