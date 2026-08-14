---
name: nextjs-architecture-patterns
description: Use ao criar ou modificar qualquer página, layout, Server Action ou rota sob src/app/ neste projeto Next.js 16 (App Router) — telas de cadastro (CRUD), formulários com FormData, filtros de listagem, exportação Excel/PDF, ou qualquer componente client-side novo em src/components/. Aciona também ao decidir entre Server Component e Client Component, ao escrever validação de formulário, ou ao adicionar um módulo novo em app/dashboard/cadastros/.
---

# Arquitetura Next.js 16 (App Router) — performance-lab-login

Este projeto segue um padrão **muito específico e repetido** para os 5 módulos
de cadastro (`site-planta`, `grupo-de-sites`, `grupo-de-usuarios`, `qr-code`,
`usuarios`) e para telas de listagem (`coletas-importadas`). Antes de propor
uma estrutura nova, verifique se o padrão abaixo já resolve — a consistência
entre módulos vale mais que uma solução "melhor" isolada.

## 1. Regra de ouro: Server Component por padrão

- **Nunca** adicione `"use client"` a um arquivo que só busca e renderiza
  dado. `page.tsx` de listagem/cadastro é sempre `async function` sem
  `"use client"`, buscando dado direto via `queries.ts` no corpo do componente.
- `"use client"` só entra quando há: estado (`useState`), efeito
  (`useEffect`), evento (`onClick`, `onChange`) ou hook do Next
  (`useRouter`, `useSearchParams`, `usePathname`).
- Componentes puramente visuais/interativos (`Button`, `FormField`,
  `FilterDatePicker`, `FilterTimePicker`) são `"use client"` porque têm
  estado ou handler — mas ficam pequenos e isolados, nunca a página inteira.
- Ao usar `useSearchParams()` num Client Component que é `page.tsx`, **sempre
  envolva em `<Suspense>`** — sem isso o `next build` falha
  (`missing-suspense-with-csr-bailout`) porque a página tentaria
  pré-renderizar estaticamente. Padrão:

  ```tsx
  export default function MinhaPage() {
    return (
      <Suspense>
        <Conteudo />
      </Suspense>
    );
  }

  function Conteudo() {
    const searchParams = useSearchParams();
    // ...
  }
  ```

## 2. Estrutura de um módulo de cadastro (CRUD)

Todo módulo sob `src/app/dashboard/cadastros/<nome>/` segue exatamente esta
forma — copie a forma, não invente uma nova:

```
<nome>/
  page.tsx              # listagem: busca via queries.ts, filtros em <form method="get">
  novo/page.tsx          # formulário vazio
  [id]/editar/page.tsx   # formulário populado
  actions.ts             # "use server" — validação + escrita
  queries.ts             # leitura (listagem, opções de filtro, busca por id)
  <Nome>Form.tsx          # "use client" — o formulário em si (campos + envio)
  export/excel/route.ts   # Route Handler, mesmo filtro da listagem
  export/pdf/page.tsx     # tela de impressão (window.print), mesmo filtro
```

## 3. Server Actions: a forma exata

Toda `actions.ts` segue esta sequência, nesta ordem. Não pule etapas nem
mude a ordem — cada uma existe por um motivo que já causou bug quando faltou:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { verificarEscritaComRls } from "@/lib/escrita-rls";
import { texto } from "@/lib/form-data";
import { traduzirErroPostgres } from "@/lib/postgrest-errors";
import { createClient } from "@/lib/supabase/server";

const LISTAGEM = "/dashboard/cadastros/<nome>";

// 1) Schema de validação — zod, limite e mensagem JUNTOS por campo. Nunca
//    volte a mapas paralelos "limites" + "rótulos" percorridos por for: é
//    exatamente o formato que causou "esqueci de validar o campo novo".
const esquemaDeTexto = z.object({
  nome: z.string().min(1, "Informe o nome.").max(200, "O nome deve ter no máximo 200 caracteres."),
});

// 2) Tipos de estado do formulário — sempre este shape, para useActionState.
export type ValoresDoX = { nome: string /* ... */ };
export type EstadoDoFormulario = { erro?: string; valores?: ValoresDoX };

// 3) Extrator — sempre via texto() de lib/form-data.ts, nunca
//    String(formData.get(x) ?? "").trim() solto no meio do código.
function extrairValores(formData: FormData): ValoresDoX {
  return { nome: texto(formData, "nome") };
}

// 4) Validação — zod primeiro (contrato), depois regra de negócio cruzada
//    entre campos (auto-referência, FK, faixa numérica) como código
//    imperativo normal. NÃO force regra de negócio para dentro do zod só
//    por consistência — só o "limite + formato simples" vai pro schema.
function validar(valores: ValoresDoX, idEmEdicao: number | null) {
  const textoValidado = esquemaDeTexto.safeParse(valores);
  if (!textoValidado.success) return { ok: false as const, erro: textoValidado.error.issues[0].message };
  // regra de negócio aqui...
  return { ok: true as const, linha: { nome: valores.nome } };
}

// 5) Mensagens de erro do Postgres — objeto declarado uma vez, usado com
//    traduzirErroPostgres(). NUNCA reimplemente a tradução de código
//    (23505/42501/23503) módulo a módulo.
const MENSAGENS_DE_ERRO = {
  duplicado: "Já existe um registro com esse nome.",
  semPermissao: "Você não tem permissão para cadastrar.",
  generico: "Não foi possível salvar. Tente novamente.",
};

export async function salvarX(_estado: EstadoDoFormulario, formData: FormData): Promise<EstadoDoFormulario> {
  const valores = extrairValores(formData);
  const idBruto = formData.get("id");
  const id = idBruto ? Number(idBruto) : null;
  if (idBruto && !Number.isInteger(id)) return { erro: "Registro inválido.", valores };

  const validacao = validar(valores, id);
  if (!validacao.ok) return { erro: validacao.erro, valores };

  const supabase = await createClient();

  if (id === null) {
    const { error } = await supabase.from("tabela").insert(validacao.linha);
    if (error) return { erro: traduzirErroPostgres(error.code, MENSAGENS_DE_ERRO), valores };
  } else {
    // 6) UPDATE SEMPRE com .select().maybeSingle() + verificarEscritaComRls().
    //    Um UPDATE barrado pelo RLS NÃO devolve erro — devolve zero linhas.
    //    Sem essa checagem, quem não tem permissão vê "sucesso" e o registro
    //    continua intacto, sem ninguém saber que nada foi salvo.
    const resultado = await supabase.from("tabela").update(validacao.linha).eq("id", id).select("id").maybeSingle();
    const verificacao = verificarEscritaComRls(
      resultado,
      MENSAGENS_DE_ERRO,
      "Você não tem permissão para editar este registro, ou ele não existe mais.",
    );
    if (!verificacao.ok) return { erro: verificacao.erro, valores };
  }

  // 7) Sempre os dois juntos, nesta ordem: revalida a listagem, depois
  //    redireciona. redirect() lança (não retorna), então não vem código
  //    depois dele na mesma função.
  revalidatePath(LISTAGEM);
  redirect(LISTAGEM);
}
```

### Operações multi-passo (ex.: escrever tabela + tabela de vínculo)

Se uma action precisa de DELETE+INSERT (ou mais de uma escrita) que precisa
ser atômica, **não encadeie duas chamadas `.from()` separadas do cliente** —
cada uma é a própria transação, e uma falhando depois da outra ter sucesso
deixa estado parcial. Escreva uma função Postgres (`language plpgsql`,
`security invoker` se a autorização já é coberta por RLS) e chame via
`supabase.rpc("nome_da_funcao", { p_param: valor })`. Veja
`supabase/migrations/0026_membros_grupo_usuarios_transacional.sql` e
`sincronizarMembros` em `grupo-de-usuarios/actions.ts` como referência exata.

## 4. Componentes de filtro (`FilterInput`/`FilterSelect`/`FilterDatePicker`/`FilterTimePicker`)

- **Nunca** use `<input type="date">` ou `<input type="time">` nativo em tela
  nova. O navegador ignora `placeholder` nesses tipos e desenha `--` — use
  `FilterDatePicker`/`FilterTimePicker` (`src/components/dashboard/`), que
  mostram o rótulo até um valor ser escolhido e têm popover próprio.
- `FilterInput` é só para texto livre — não tem mais prop `type`.
- Todo filtro de listagem é `<form method="get">` (GET nativo, sem JS no
  submit) com `name`/`defaultValue` batendo com o que `extrairFiltros()` de
  `queries.ts` espera. Não introduza `fetch`/`onSubmit` para filtro de
  listagem — quebra o padrão de URL compartilhável e sem JS no caminho crítico.
- Grid de filtros: `grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6
  gap-3`, célula de largura igual (sem `col-span` no meio da lista, só no
  último item se necessário) — span no meio de uma grade de auto-flow cria
  buraco quando o número de campos muda.

## 5. Botão compartilhado

Use `Button` de `src/components/Button.tsx` para **todo** botão/link de
ação — não escreva a string de classes Tailwind de botão do zero numa tela
nova. `variant` (`primary`/`secondary`/`danger`) + `size` (`md`/`lg`) +
`href` (vira `<Link>`) ou sem `href` (vira `<button>`) + `loading` (mostra
spinner e desabilita).

## 6. Comentários e nomenclatura

- Identificadores e comentários em **português**, sempre. Não misture inglês
  no meio de um módulo existente.
- Comentário existe para explicar **por quê**, não **o quê** — o código já
  diz o quê. Exemplo real do projeto: não escreva `// busca o perfil`, escreva
  o motivo de a consulta existir daquele jeito (ex.: por que `maybeSingle`
  em vez de `single`).
- Toda decisão não óbvia (por que RLS em vez de checagem em TS, por que um
  `for` virou zod, por que uma tabela não usa cascade) fica documentada
  inline, não só no commit.

## 7. Logging

Toda rota de API e toda falha relevante em `lib/` usa `lib/log.ts`:

```ts
import { erro, gerarIdDeRequisicao } from "@/lib/log";

const idRequisicao = gerarIdDeRequisicao();
// ...
if (falha) erro(idRequisicao, "Contexto do que falhou:", falha);
```

`erro()` já manda para o Sentry (`instrumentation.ts`/`instrumentation-client.ts`)
além do `console.error` — sem `SENTRY_DSN` configurado isso é inerte, não
precisa de guarda condicional no código que chama.

## 8. Comandos

```bash
pnpm dev            # Turbopack, com origens de rede local liberadas
pnpm lint           # eslint — rode antes de considerar uma mudança pronta
pnpm exec tsc --noEmit   # typecheck isolado, mais rápido que build completo
pnpm test           # vitest run
pnpm run build      # build de produção real — pega erro que lint/tsc não pegam
                     # (ex.: useSearchParams sem Suspense só aparece aqui)
```

Antes de considerar qualquer mudança em `app/`/`components/`/`lib/` pronta,
rode lint + typecheck + test + build nesta ordem. `next build` já pegou bug
real (Suspense faltando) que lint e typecheck não detectaram.

## 9. Erros já cometidos neste projeto — não repita

- **`useEffect` chamando uma função nomeada que faz `setState`, definida no
  corpo do componente e reutilizada em outro handler**: o
  `eslint-plugin-react-hooks` (`set-state-in-effect`) acusa cascata de
  render. Solução: extraia a busca para uma função **pura** (sem `setState`
  dentro) fora do componente, e deixe cada chamador (`useEffect`, handler de
  clique) decidir o próprio `setState` no ponto de chamada.
- **Tipos do SDK do Supabase com generic default não resolvido**
  (`AuthMFAListFactorsResponse<T = typeof FactorTypes>`) fazem `data` virar
  `any` silenciosamente depois de `await`. Anote o tipo do parâmetro do
  callback explicitamente (`(f: FatorMfa) => ...`) em vez de confiar na
  inferência quando mexer em `supabase.auth.mfa.*`.
