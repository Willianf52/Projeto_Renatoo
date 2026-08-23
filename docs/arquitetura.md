# Arquitetura

Como o código em `src/` é organizado, e o padrão a seguir ao adicionar uma
feature nova. Não é aspiracional: reflete o que já existe em produção hoje.

## Feature-first via colocation de rota

O App Router do Next.js já é, por si só, um índice de features: cada pasta
sob `src/app/dashboard/{cadastros,inspecoes}/<feature>/` contém tudo que
aquela feature precisa, colocado junto da rota — em vez de espalhado por um
`src/features/` paralelo. É o padrão "Split project files by feature or
route" da própria documentação do Next
(`node_modules/next/dist/docs/01-app/01-getting-started/02-project-structure.md`),
e as 7 features já existentes seguem exatamente esta forma:

```
dashboard/cadastros/usuarios/
  page.tsx           # Server Component — monta a tela, chama queries.ts
  actions.ts          # "use server" — toda mutação passa por aqui
  queries.ts            # leitura, roda no server (createClient() lê cookies)
  UsuarioForm.tsx          # "use client" só aqui — precisa de useState/eventos
  constantes.ts
  actions.test.ts
  queries.test.ts
  novo/page.tsx
  [id]/editar/page.tsx
```

As demais features (`grupo-de-sites`, `grupo-de-usuarios`, `qr-code`,
`site-planta`, `inspecoes/coletas-importadas`, `inspecoes/relatorios/*`)
seguem o mesmo esqueleto. **Ao adicionar uma feature nova, comece copiando a
forma de uma dessas — não um `src/features/` novo.** Duplicar a árvore de
rotas fora de `app/` contraria tanto a recomendação do framework quanto a
convenção já consolidada aqui.

### Exemplo: uma feature futura ("checklists de visitas")

Sem spec ainda, então isto é só a forma esperada, não pastas reais no repo:

```
dashboard/inspecoes/checklists-de-visitas/
  page.tsx              # lista os checklists (Server Component)
  actions.ts              # "use server" — criar/editar/excluir checklist
  queries.ts                 # getChecklists(filtros), getChecklist(id)
  ChecklistForm.tsx             # "use client" — só se tiver estado local
  novo/page.tsx
  [id]/editar/page.tsx
```

## Onde vive código compartilhado

| Pasta | Conteúdo | Exemplos |
|---|---|---|
| `src/components/` | UI genérica, sem saber de domínio | `Button`, `Toast`, `FormField`, `Spinner`, `HeroPanel` |
| `src/components/dashboard/` | UI compartilhada *entre* features do painel | `DataTable`, `Filter*Picker`, `DashboardSidebar`/`Navbar`, `useClickOutside` |
| `src/lib/` | Lógica de negócio e infra, sem JSX | `supabase/`, `permissoes.ts`, `rate-limit.ts`, `password-policy.ts` |

Regra prática: se um componente aparece em mais de uma feature, sobe para
`src/components/dashboard/`. Se nasceu numa feature e só ela usa, fica na
pasta da feature (ex.: `UsuarioForm.tsx`, `SitesMultiSelect.tsx`) — subir
cedo demais cria abstração sem uso real, subir tarde demais é só mover um
arquivo.

## Server Components, Client Components e Server Actions

- **Padrão é Server Component.** `"use client"` só entra quando o arquivo usa
  `useState`/`useEffect`/`useRef` ou responde a evento de navegador
  (`onClick`, `onChange`) — é o critério que já rege os 27 arquivos client
  existentes no projeto. Ver `FilterDatePicker.tsx`/`FilterTimePicker.tsx`/
  `FilterMonthPicker.tsx` (popover com estado próprio) vs `page.tsx` de
  qualquer feature (busca dado, não mantém estado).
- **Mutação sempre por Server Action** em `actions.ts` com `"use server"` no
  topo do arquivo — nunca `fetch` direto do client para o Supabase em
  escrita. As 5 features de cadastro seguem isto hoje sem exceção.
- **Cliente de escrita privilegiada é `src/lib/supabase/admin.ts`**
  (`service_role`, ignora RLS), guardado por `import "server-only"` no topo:
  um import acidental a partir de um Client Component quebra o build em vez
  de embarcar a chave num bundle público. Confirmado por grep: nenhum
  arquivo `"use client"` no projeto importa `@/lib/supabase/server` ou
  `@/lib/supabase/admin` — a fronteira é real, não só documentada.

## Tipagem integrada com o Supabase

`src/lib/supabase/database.types.ts` é gerado a partir do schema do projeto
Supabase (`UpServiços`, `wcmqmeikpwwpwyztqwni`) e alimenta o generic
`Database` nos três factories de client:

- `src/lib/supabase/server.ts` — `createServerClient<Database>(...)`
- `src/lib/supabase/client.ts` — `createBrowserClient<Database>(...)`
- `src/lib/supabase/admin.ts` — `createClient<Database>(...)`

Toda chamada `.from(...)`/`.select(...)`/`.eq(...)` no projeto passa a ter
autocomplete e checagem de tipo de coluna a partir disto — sem precisar
declarar tipo nenhum a mais em cada `queries.ts`.

**Para regenerar** depois de uma migration nova:

```
supabase start            # aplica supabase/migrations/ num Postgres local
pnpm run types:generate   # gen types --local > database.types.ts
```

Contra o **local**, de propósito: é o único schema que já contém a migration
do branch atual. O job `banco` da CI repete o comando e falha se o
arquivo commitado divergir — ver README, "Tipos do banco".

Sem Docker, `pnpm run types:generate:remoto` (ou a integração MCP do
Supabase) gera pelo projeto hospedado, com a ressalva de que ele reflete o
que já está em produção, não o que o PR propõe.

### Por que `aplicarFiltros`/`aplicarFiltrosDeColeta` continuam com `query: any`

Três funções (`coletas-importadas/queries.ts`, `qr-code/queries.ts`,
`site-planta/queries.ts`) recebem um builder do PostgREST já criado e
re-encadeiam `.eq()`/`.gte()`/`.lte()` condicionalmente. O generic `Database`
tipa o que `.from()` devolve, não resolve reencadear um builder já tipado
sem repetir cada método na assinatura da função — por isso continuam `any`,
de propósito, com o motivo documentado no comentário de cada uma. Não é uma
lacuna que sobrou; é uma troca já avaliada.
