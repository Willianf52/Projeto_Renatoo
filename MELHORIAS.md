# Melhorias do Sistema — Revisão Fullstack

Levantamento feito lendo middleware, RLS, fluxo de auth e as telas do dashboard.
Organizado por prioridade. Cada item cita o arquivo/linha onde o problema
aparece hoje.

## Alta prioridade

1. **Variáveis de ambiente sem validação, erro genérico quando faltam.**
   `lib/supabase/client.ts:5-6`, `lib/supabase/server.ts:8-9` e
   `lib/supabase/middleware.ts:16-17` usam `process.env.X!` (non-null
   assertion). Quando a env falta — como aconteceu nesta sessão — o erro
   aparece fundo dentro do SDK do Supabase ("Your project's URL and Key are
   required..."), sem dizer qual variável está ausente. Sugestão: um
   `lib/env.ts` que lê e valida as duas envs uma vez, lançando erro explícito
   ("NEXT_PUBLIC_SUPABASE_URL não definida — copie .env.example para
   .env.local") se faltar alguma.

2. **Sem testes automatizados nem CI.** Não há framework de teste no
   `package.json` (nem vitest/jest) nem `.github/workflows`. A lógica mais
   sensível do sistema — `lib/safe-redirect.ts` (proteção contra open
   redirect), os ramos de bloqueio em `lib/supabase/middleware.ts`
   (`motivoBloqueio`), e agora a resolução de filtros em
   `app/dashboard/inspecoes/coletas-importadas/queries.ts` — é exatamente o
   tipo de código que se beneficia de teste unitário, porque um bug ali é
   silencioso (libera acesso que deveria negar) em vez de quebrar visualmente.
   Sugestão: vitest para lógica pura, + um pipeline de CI mínimo (lint +
   typecheck + build) rodando em cada PR.

3. **`coletas-importadas` foi ligada a dados reais nesta sessão, mas alguns
   filtros têm semântica assumida por mim, não confirmada.** Especificamente:
   "Localização" foi interpretado como presença/ausência de coordenadas GPS na
   leitura (`leituras.latitude`), "Tipo" como `tipos_servico` do site, e
   "Checkpoint" como `qr_codes`. Se o sistema de referência (UP Serviços) usa
   esses campos com outro significado, os filtros vão silenciosamente
   restringir errado. Vale confirmar com quem conhece a tela original antes de
   considerar essa página fechada.

## Média prioridade

4. **Botões de exportar Excel/PDF sem handler.**
   `app/dashboard/inspecoes/coletas-importadas/page.tsx` — os botões existem
   na UI mas `onClick` não está implementado. Ficou fora do escopo de "ligar
   os dados"; é a próxima peça óbvia dessa tela.

5. **Sem `error.tsx` / `not-found.tsx` em `app/`.** Uma exceção não tratada em
   qualquer página (por exemplo, a query do Supabase falhando em
   `coletas-importadas`) cai na tela de erro genérica do Next em vez de uma UI
   consistente com o resto do sistema. Vale um `error.tsx` no nível do
   dashboard pelo menos.

6. **Sem `loading.tsx` no dashboard.** A página de coletas agora dispara
   várias queries em paralelo (`getFilterOptions` + `getColetas`) antes de
   renderizar; sem um `loading.tsx`, a navegação fica sem feedback visual até
   o Server Component terminar.

7. **Inconsistência `.single()` vs `.maybeSingle()` na mesma consulta.**
   `app/dashboard/layout.tsx:19-23` busca o perfil com `.single()`, enquanto
   `lib/supabase/middleware.ts:65-69` busca a mesma linha com
   `.maybeSingle()`. Como o middleware já bloqueia usuário sem perfil antes de
   chegar no layout, não é um bug ativo hoje — mas é uma armadilha se algum
   dia o layout for alcançado sem passar pelo middleware (ex: rota nova fora
   do matcher).

8. **Sem rate limiting/feedback de tentativas no login.**
   `components/LoginPage.tsx:66` chama `signInWithPassword` sem nenhum
   controle de tentativas repetidas no cliente. O Supabase Auth limita no
   backend, mas o usuário pode martelar "Entrar" sem nenhum sinal de que está
   sendo limitado.

9. **`console.error` espalhado sem correlação.**
   `lib/supabase/middleware.ts:73,79` e `app/dashboard/layout.tsx:29` logam
   erros de forma solta, sem request id nem integração com um serviço de
   observabilidade (Sentry, etc.). Hoje isso só vai para o stdout do servidor;
   antes de produção vale decidir onde esses erros vão ser vistos de fato.

## Baixa prioridade / nice-to-have

10. **Cliente Supabase do browser recriado a cada chamada.**
    `lib/supabase/client.ts` — `createClient()` é chamado de novo em cada
    `handleSubmit` (LoginPage, TrocarSenha, RecuperarSenha, NovaSenha,
    DashboardNavbar). Funciona, mas o padrão comum é memoizar num singleton de
    módulo para evitar recriar o client a cada submit.

11. **"Organização" no navbar é fixa, com TODO explícito no código.**
    `app/dashboard/layout.tsx:38-39` — `organization="UP SERVIÇOS..."` já está
    marcado como placeholder até existir tabela de organizações. Mantido aqui
    só para não se perder de vista.

12. **Paginação nos filtros de `coletas-importadas` ainda não trata "Hora
    Inicial/Final" com timezone explícito.** `queries.ts` monta o timestamp
    combinando data+hora sem sufixo de timezone
    (`combinarDataHora`); o Postgres vai interpretar conforme o timezone da
    conexão. Funciona para o caso comum, mas vale revisitar se o time
    operacional estiver em fuso diferente do servidor.

---

**Já implementado nesta sessão:** ligação de `coletas-importadas` a dados
reais (queries via Supabase respeitando RLS, filtros em `<form method="get">`,
paginação real). Ver item 3 acima para a única ressalva.
