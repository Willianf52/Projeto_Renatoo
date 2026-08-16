# Melhorias do Sistema — Revisão Fullstack

Levantamento feito lendo middleware, RLS, fluxo de auth e as telas do dashboard.
Organizado por prioridade. Cada item cita o arquivo/linha onde o problema
aparece hoje.

> Última revisão: 2026-08-06. A lista foi podada do que já entrou — o histórico
> fica em "Itens fechados", no fim, para não reabrir discussão já resolvida.
> Segurança tem documento próprio (`AUDITORIA-SEGURANCA.md`); aqui só entra o
> que não é achado de auditoria.
>
> **A numeração é sequencial e muda a cada revisão** — markdown renumera lista
> ordenada sozinho, então não adianta tentar preservar o número de um item
> fechado. Por isso a tabela do fim identifica cada item pelo nome, não pelo
> número, e referência entre itens também: número aqui não é identificador.
>
> Esta revisão mudou o ângulo: até aqui a lista media o projeto contra si mesmo
> (o que está construído está bem construído?). Passou a medi-lo contra o
> sistema de referência — **o que ainda não existe**. Daí os itens novos de
> alta prioridade serem todos de ausência, não de defeito.
>
> Rodada seguinte: o painel inicial (item 1) foi construído e depois retirado
> a pedido nesta mesma sessão — fica registrado como estava, não fechado. Os
> itens 3, 5, 9 e 10 entraram em "Itens fechados". O item 2 segue aberto por
> depender de confirmação externa (quem conhece a tela original) que este
> ambiente não tem como obter sozinho.
>
> 2026-08-07: confirmado com o dono do produto que `/dashboard` cair direto em
> Coletas Importadas **é o comportamento esperado**, não uma lacuna — o item
> "painel inicial" saiu de "Alta prioridade" e foi para "Itens fechados" como
> decisão de produto, não pendência técnica.
>
> 2026-08-15: teste funcional de ponta a ponta (telas de escrita, com conta
> real) achou um bug de dado, não só de tela — entrou direto em "Itens
> fechados" já corrigido.
>
> 2026-08-15: confirmado com o dono do produto o significado dos três
> filtros de `coletas-importadas` que estavam com semântica assumida —
> "Localização", "Tipo" e "Checkpoint" interpretam os campos exatamente como
> a implementação já fazia. Item saiu de "Média prioridade" para "Itens
> fechados".
>
> 2026-08-16: achado do advisor de segurança do Supabase (funções
> `SECURITY DEFINER` chamáveis via RPC por `anon`/`authenticated`) fechado
> em duas migrations — a segunda (0028) corrigindo um resíduo que a
> primeira (0027) deixou aberto por engano de sessão anterior. Direto em
> "Itens fechados", nunca esteve nesta lista como item aberto.
>
> 2026-08-16: tentativa de ligar a proteção contra senha vazada (item 8)
> pelo painel do Supabase recusada pelo próprio Supabase — exige plano Pro.
> Item permanece aberto, mas a causa mudou de "toggle manual pendente" para
> "depende de decisão de upgrade de plano".
>
> 2026-08-16: primeira rodada do advisor `performance` do Supabase (nunca
> conferido antes nesta lista, só o de `security`). Achados de baixa
> prioridade viram item 9.

## Alta prioridade

Nenhum item aberto nesta categoria no momento.

## Média prioridade

3. **`Eventos`, `ChecklistLab` e `Suporte` no menu, desabilitados.**
   `DashboardSidebar.tsx:63-65` — mantidos visíveis de propósito, para
   preservar a estrutura de navegação do sistema de referência. Não têm tabela
   nem tela. Ficam aqui para não se perderem de vista.

7. **Site / Planta não tem `Perda`/`Prevenção` (e-mails de classificação),
   `Notificações Eventos` nem `Tipo de Curva`.** O formulário de referência
   traz os quatro campos; nenhum tem tabela ou coluna correspondente hoje, e
   por decisão explícita (2026-08-10) ficaram de fora do formulário — nem como
   placeholder, diferente do que "Grupo de Inspeção" recebeu em Grupo de
   Sites. Voltam a esta lista de propósito, para não se perderem: entram
   quando alguém decidir o que cada um representa e criar o schema por trás.

## Baixa prioridade / nice-to-have

4. **Teto de 15 caracteres na senha.** `lib/password-policy.ts:43` documenta o
   custo: recusa a saída padrão da maioria dos gerenciadores e qualquer
   passphrase. É paridade exigida com o sistema legado — revisitar quando a
   exigência cair.

5. **Sentry ligado no código (2026-08-11), inerte até existir um DSN.**
   `@sentry/nextjs` instalado; `src/instrumentation.ts` (servidor/edge) e
   `src/instrumentation-client.ts` (navegador) chamam `Sentry.init` com
   `dsn: process.env.SENTRY_DSN` / `NEXT_PUBLIC_SENTRY_DSN` — sem essas
   variáveis (não configuradas em nenhum ambiente ainda) o SDK não envia nada,
   é a forma documentada de ficar inerte. `lib/log.ts` (usado por
   `lib/supabase/middleware.ts`, `lib/perfil-atual.ts`, `lib/permissoes.ts` e
   pelas rotas de API) e os dois `error.tsx` (`app/error.tsx`,
   `app/dashboard/error.tsx`) chamam `Sentry.captureException`/
   `captureMessage` além do `console.error` de sempre. Falta só criar a conta
   Sentry e colar o DSN em `.env.local`/no ambiente de produção — ver
   `.env.example`.

6. **"Organização" no navbar é fixa.** `app/dashboard/layout.tsx:45` — já
    marcado como placeholder até existir tabela de organizações. Mantido aqui
    só para não se perder de vista.

8. **Proteção contra senha vazada desligada no Supabase Auth.** Achado pelo
   `get_advisors` (2026-08-11): a checagem contra HaveIBeenPwned.org não está
   ativada. O toggle fica em Authentication → Sign In / Providers → Email →
   "Prevent use of leaked passwords". Tentativa de ativação em 2026-08-16
   (via navegador, direto no painel) recusada pelo próprio Supabase: **"Configuring
   leaked password protection via HaveIBeenPwned.org is available on Pro
   Plans and up"** — o projeto UpServiços está no plano Free hoje. Não é mais
   "sem custo": depende de upgrade de plano, decisão do dono do produto, não
   passo técnico pendente.

9. **Achados do advisor `performance` do Supabase (RLS reavalia `auth.uid()`
   por linha, FKs sem índice, índices nunca usados).** Primeira vez que este
   advisor foi conferido (2026-08-16) — até aqui só o de `security` era
   rodado. Três grupos, nenhum urgente:
   - Seis policies de RLS chamam `auth.uid()`/`auth.<função>()` direto na
     cláusula em vez de `(select auth.<função>())`: `profiles` (duas
     policies), `grupos_usuarios_membros`, `grupos_sites_clientes`,
     `visitas`, `leituras`. Sem o `select`, o Postgres reavalia a função a
     cada linha em vez de uma vez por query — puramente mecânico, não muda
     quem vê o quê.
   - Nove foreign keys sem índice cobrindo:
     `leituras.acao_id`/`area_id`/`qr_code_id`/`qualificador_id`,
     `profiles.superior_id`,
     `sites.criado_por`/`responsavel_id`/`tipo_servico_id`,
     `visitas.coletor_dados_id`/`motivo_visita_id`.
   - Cerca de 17 índices (a maioria trigram, de busca) nunca usados —
     esperado com pouco dado de produção ainda, não é sinal de índice
     desnecessário por si só.

9. **Extensão `pg_trgm` instalada no schema `public`.** Mesmo achado do
   `get_advisors`. Funciona onde está (`supabase/migrations/0011`), mas o
   recomendado é um schema próprio para extensões — mover exige uma migration
   que recria os índices GIN que dependem dela (`grupos_sites`, `profiles`,
   `sites`), então não é mudança de baixo risco o suficiente para fazer sem
   revisão.

10. **`salvarSite`/`salvarGrupoSite`/`salvarGrupoUsuarios`/`salvarQrCode`/`salvarUsuario` reimplementavam,
    cada um, o mesmo extrator de `FormData` e a mesma tabela de tradução de
    erro do Postgres.** Fechado (2026-08-11): `texto()` foi para
    `lib/form-data.ts`, e `traduzirErroPostgres()`/`CODIGO_POSTGRES` para
    `lib/postgrest-errors.ts` — cada `actions.ts` agora só declara as
    mensagens específicas da própria tela. Os limites de tamanho por campo
    (que viviam em mapas paralelos tipo `LIMITES_ENDERECO`/`ROTULOS`,
    percorridos por um `for`) viraram schemas `zod` — limite e mensagem no
    mesmo lugar, por campo, em vez de dois mapas que precisavam ser mantidos
    em sincronia à mão. Regra de negócio cruzada entre campos (auto-referência
    de site/grupo, raio, coordenadas, nível de acesso válido) continua
    imperativa de propósito — não é duplicação, é lógica específica de cada
    tela.

    A decisão pós-escrita também se repetia igual nas quatro telas que
    escrevem com o token da sessão (RLS ativo): `if (error) traduz; if
    (!data) "sem permissão"` depois de todo UPDATE/DELETE/INSERT-com-select —
    o UPDATE/DELETE barrado pelo RLS não devolve erro, devolve zero linhas, e
    sem essa checagem a tela mostraria sucesso com o registro intacto.
    Extraído para `lib/escrita-rls.ts` (`verificarEscritaComRls`), usado em
    `site-planta`, `grupo-de-sites`, `grupo-de-usuarios` (insert, update e
    exclusão) e `qr-code`. `usuarios/actions.ts` fica de fora de propósito —
    escreve com `service_role`, que ignora RLS inteiro, mecanismo diferente.
    Só a decisão foi compartilhada; a consulta em si (tabela, colunas,
    mensagens) continua em cada `actions.ts`, então nenhum `.insert()`/
    `.update()`/`.delete()` existente mudou de forma — os mocks dos testes não
    precisaram mudar.

    Cobertura: os 325 testes existentes passaram inalterados em cada etapa,
    mais 3 novos para `escrita-rls.ts`, com lint/typecheck/build de produção
    limpos ao final.

---

## Itens fechados

Registrados para não voltarem à lista. Identificados pelo nome: o número que
tinham na revisão em que foram levantados não vale mais nada depois que a lista
renumera.

| Item | Como ficou |
|---|---|
| Funções `SECURITY DEFINER` de RLS chamáveis por `anon`/`authenticated` via RPC | Achado do advisor de segurança do Supabase. Migration 0027 revogou `EXECUTE` de `anon` em oito funções auxiliares (`e_cliente`, `nivel_acesso_atual`, `pode_administrar_cadastros`, `pode_administrar_grupos_usuarios`, `pode_administrar_usuarios`, `pode_ver_grupo_site`, `pode_ver_toda_operacao`, `usuario_ativo`) — `authenticated` fica de fora de propósito, as policies de RLS chamam essas funções com o privilégio de quem roda a query, não do dono. Nenhuma vazava dado: todas leem só a partir de `auth.uid()`, nulo para `anon`. A 0027 ficou aplicada no banco mas o arquivo não foi commitado na sessão em que foi criada (2026-08-16, 00:03) — detectado e commitado na sessão seguinte. Ao revisar, `handle_new_user()` (trigger de `auth.users`) continuava executável por `anon` **e** `authenticated` mesmo revogada nominalmente: diferente das outras oito, nunca teve `revoke all from public` na criação (migration 0008), então mantinha o grant implícito de `PUBLIC` — e os dois papéis são membros de `PUBLIC`. Migration 0028 revogou de `PUBLIC` diretamente. Confirmado nos grants reais (`proacl`/`has_function_privilege`) antes e depois, não só no advisor. Detalhe técnico completo em `docs/auditoria-seguranca.md` |
| Filtros de `coletas-importadas` com semântica assumida, não confirmada | Confirmado com o dono do produto em 2026-08-15: as três interpretações já implementadas em `queries.ts` (`aplicarFiltrosDeColeta`) estão corretas. "Localização" é presença/ausência de coordenada GPS na própria leitura (`leituras.tem_localizacao`), não um filtro de local; "Tipo" é o `tipo_servico` cadastrado no site da visita (`visitas.sites.tipo_servico_id`), não um tipo da coleta em si; "Checkpoint" é o QR-Code específico onde a leitura foi escaneada (`leituras.qr_code_id`). Nenhum código mudou — o item só saiu de "assumido" para "confirmado" |
| `salvarSite` gravava todo Site / Planta como inativo, sempre | `site-planta/actions.ts:115` lia `formData.get("ativo")`, um campo que não existe no formulário — o Status da tela (`SiteForm.tsx`) é um `<select name="status">` com valores `"ativo"`/`"inativo"`, não um checkbox. Resultado: `ativo` era sempre `false`, em criação **e** edição, e o site sumia em silêncio da listagem (filtro padrão "Ativos"), parecendo que o cadastro tinha falhado. Achado testando a tela com dado real e confirmado direto no banco (site criado com Status = Ativo na tela, gravado com `ativo: false`). Corrigido para ler `status` como `grupo-de-sites/actions.ts` já fazia (`!== "inativo"`); dois testes que atestavam o comportamento errado foram corrigidos, mais um novo cobrindo os três casos (ausente/ativo/inativo) |
| `ToastOnMount` mostrava o toast de sucesso duas vezes | `useEffect` sem guard: o StrictMode do React (dev) monta, "desmonta" e remonta todo efeito sem cleanup de propósito, e `show()` não é idempotente. Reproduzido em Grupo de Usuários (único uso hoje) em toda criação/edição. Corrigido com `useRef` marcando que o efeito já rodou; teste novo (`ToastOnMount.test.tsx`) renderiza dentro de `<StrictMode>` contra o `ToastProvider` real e confere que só um toast chega ao DOM |
| Banco vazio (sem `seed.sql`) não tinha como ser populado só pela tela | `Novo Grupo de Sites` exige ao menos um site existente; `Novo Site / Planta` exige um grupo existente — travam um ao outro quando as duas tabelas partem vazias. Não é bug de código (o multi-select funciona normalmente assim que existe 1 site), é ausência de caminho de bootstrap pela UI; `seed.sql` sempre contornou isso inserindo os dois direto via SQL. Documentado no README, na seção "Banco de dados", para quem for provisionar um ambiente novo sem rodar o seed |
| `/dashboard` sem tela própria (painel inicial) | Confirmado com o dono do produto em 2026-08-07: cair direto em Coletas Importadas ao entrar no sistema **é o comportamento esperado**, não uma ausência a preencher. `metas_visitas` segue sem consulta nenhuma, mas deixa de ser tratado como pendência — só volta à lista se o critério de produto mudar |
| Coluna "Ações" vazia em Coletas Importadas | Não havia ação real para colocar nela — a única candidata (mostrar a coordenada exata da leitura, hoje só usada como presença/ausência no filtro "Localização") foi descartada por decisão de produto. A coluna saiu de `TABLE_COLUMNS`, e `toTableRow` passou a ser a lista completa de campos da linha, sem mais precisar de tratamento especial na página |
| `package-lock.json` local | Apagado da máquina de desenvolvimento — estava fora do controle de versão (`.gitignore`), então a divergência com `pnpm-lock.yaml` não afetava o repositório, só o ambiente local |
| QR-Code não gerava a imagem do QR | Biblioteca `qrcode` adicionada (`lib/qrcode.ts`, PNG em data URL — mais simples e mais seguro que embutir SVG cru). A tela de editar QR-Code mostra o código renderizado para conferência, e o botão "Imprimir Etiquetas" (`export/etiquetas`, componente `FolhaDeEtiquetas`) gera uma folha para impressão com todos os QR do filtro atual — mesmo mecanismo de `ImprimirAoAbrir` que "Exportar para PDF" já usava, mas em grade de cartões em vez de tabela |
| Leitura sem `area` escapava da deduplicação da importação | Migration 0017: a constraint `unique (visita_id, area_id, data_hora)` da 0004 recriada com `nulls not distinct`, para que dois `NULL` em `area_id` colidam como duplicata igual já acontecia com o campo preenchido. `onConflict` da rota de importação não mudou — mesmas colunas, mesmo nome de constraint. pgTAP em `leitura_sem_area_dedup_test.sql` cobre a colisão e o caso que não deveria colidir (instantes diferentes) |
| `Grupo de Usuários` era placeholder — o último do menu | Cadastro completo com seleção de membros (checkboxes com filtro local) + migration 0016. A regra de quem administra **não** é a das 0009/0012/0015, e a diferença é o ponto: `pode_administrar_cadastros()` inclui OPERACIONAL, mas o conteúdo deste cadastro é a lista de pessoas — e a policy da 0006 só devolve a operação inteira para quem `pode_ver_toda_operacao()`. Com apenas o primeiro predicado, um OPERACIONAL criaria um grupo e não veria um único membro para colocar dentro: escrita autorizada sobre dado que ele não alcança. Daí `pode_administrar_grupos_usuarios()` ser a conjunção das duas — colapsa hoje em GESTOR + SUPERVISOR, mas continua correta se qualquer uma das listas mudar. Membros são apagados e recriados a cada salvamento em vez de diferenciados: a tabela é só a chave primária, não há nada a preservar, e o diff custaria um round-trip a mais para chegar no mesmo lugar |
| `QR-Code` era placeholder | Cadastro completo (listagem com busca e filtros de site/grupo/situação, criar/editar, exportar Excel e PDF) + migration 0015 com o padrão de escrita das 0009/0012. Era o mais urgente dos dois porque a rota de importação resolve `checkpoint` pelo código do QR e recusa o lote quando ele não existe — o cadastro era pré-requisito sem tela. Duas decisões próprias: o código só aceita letras, números, ponto, hífen e sublinhado (ele é lido de etiqueta e casado por texto na importação; espaço no meio sobrevive ao `trim` das bordas e produz um cadastro que parece certo na tela e nunca casa com o lote), e a policy de escrita exige `pode_ver_grupo_site()` além de `pode_administrar_cadastros()` — hoje redundante, mas impede que uma combinação futura de nível com escopo pendure checkpoint num site que nem enxerga |
| `CLIENTE` era um nível de acesso que não fazia nada | Migration 0014: tabela `grupos_sites_clientes` (N:N — um contato de holding acompanha mais de um grupo, e começar 1:1 obrigaria a migrar dado depois), helpers `e_cliente()`/`pode_ver_grupo_site()`, e as policies de `grupos_sites`, `sites`, `qr_codes`, `visitas` e `leituras` reescritas para recortar por grupo. Antes disso um CLIENTE logava e via a tela de coletas **vazia** — não "restrita": vazia, sem explicar por quê. Era paridade **e** segurança: as policies das três tabelas de cadastro eram `usuario_ativo()` puro, então ativar um CLIENTE pela tela nova de Usuários entregaria a ele os sites de todos os clientes, com coordenadas, mais o código de todo checkpoint — o mesmo vazamento que a 0008 fechou para conta criada de fora. O predicado é "não é cliente OU o grupo está entre os dele", para quem não é CLIENTE manter exatamente a visão anterior sem depender de vínculo nenhum. A atribuição entra pelo formulário de Usuários (checkboxes que aparecem só no nível CLIENTE), gravada com service_role atrás do mesmo portão da 0013. **Efeito colateral que quase passou:** o cache de referências de `coletas-importadas/queries.ts` guardava `sites`/`grupos_sites`/`qr_codes` entre usuários, apoiado no comentário de que as três não tinham recorte — premissa que a 0014 derruba. As três saíram do cache, e o teste que afirmava o contrário foi invertido. pgTAP em `escopo_de_cliente_test.sql` cobre os dois lados e o caso que quebraria calado (quem não é cliente segue vendo tudo) |
| `Usuários` era só leitura — o sistema não admitia ninguém | CRUD completo (`usuarios/actions.ts`, `UsuarioForm.tsx`, `novo/`, `[id]/editar/`), com 24 testes concentrados no portão de permissão. Combinado com a 0008 (conta nova nasce inativa), **ativar um usuário novo só era possível pelo painel do Supabase**. A escrita usa `service_role` porque `cargo` e `ativo` não têm grant para `authenticated` (0002/0007) e **não devem ter** — são as colunas que definem poder. A consequência é que a checagem na action é o único portão: não há RLS atrás dela. Daí a migration 0013 criar `pode_administrar_usuarios()` (só GESTOR, régua mais estreita que `pode_administrar_cadastros()`, que inclui SUPERVISOR e OPERACIONAL — senão quem cadastra site poderia se promover a GESTOR), a checagem rodar com o cliente da sessão antes de qualquer escrita, e o pgTAP `pode_administrar_usuarios_test.sql` cobrir os cinco níveis mais o gestor inativo. Bloqueia ainda desativar a própria conta e alterar o próprio nível — sem isso o único gestor se tranca para fora |
| `visitas`/`leituras` sem caminho de entrada | `POST /api/importar/coletas` (`app/api/importar/coletas/route.ts` + `lib/importar-coletas.ts`, com 34 testes). As migrations 0003/0004 registravam que a escrita "ocorre no servidor com service_role" — mas a rota nunca existiu, e a tela de Coletas Importadas listava vazio em qualquer ambiente novo: os 14 filtros, a paginação e as duas exportações estavam construídos sobre uma tabela que nada alimentava. Formato achatado (uma linha por leitura, referências por nome), autenticação por segredo compartilhado como o webhook. Contrato em `docs/importacao-de-coletas.md`. **Não exercitado contra banco de verdade** — mesma lacuna do pgTAP |
| `seed.sql` vazio | Semeia as tabelas de referência que a 0004 não cobre (`eventos`, `acoes`, `qualificadores`, `tipos_servico` — select de filtro vazio parece defeito de tela, não tabela sem cadastro) e um grupo de sites com unidades e QR codes, para a importação ter em que se apoiar. Não semeia `visitas`/`leituras` de propósito: mascararia uma importação quebrada com uma tela cheia |
| `Site / Planta` era placeholder | Cadastro completo: listagem com busca livre (nome/sigla/cidade) e filtros de grupo, tipo de serviço e situação; formulário de criar/editar; exportar Excel e PDF. Migration 0012 dá a `sites` o mesmo padrão de escrita que a 0009 deu a `grupos_sites` (grant por coluna + policy em `pode_administrar_cadastros()`), acrescenta `unique (grupo_site_id, nome)`, faz `criado_por` vir de `auth.uid()` por default — para não poder ser forjada — e cobre a busca com índices trigram. Era o placeholder mais crítico: `sites` é o "Local" de toda coleta e do filtro `Locais` |
| `podeAdministrarCadastros` presa dentro de uma tela | Subiu para `lib/permissoes.ts` quando Site / Planta passou a precisar da mesma regra; a alternativa era a segunda tela importar de dentro da pasta da primeira. Mesmo movimento que `escaparLike` → `lib/postgrest-escape.ts`. Testes junto, em `lib/permissoes.test.ts` |
| `pnpm-lock.yaml` fora de sincronia | `@playwright/test` entrou na revisão anterior sem atualizar o lock, e o próximo push quebraria o CI no `--frozen-lockfile`. Resolvido com `npx pnpm@11.18.0 install --lockfile-only` |
| Cookies renovados perdidos no redirect | `preservarSessao()` em `lib/supabase/middleware.ts`, com teste de regressão |
| Cache de referências guardava falha | `getReferenciasCompartilhadas` não grava no cache se alguma consulta trouxe `error` |
| CI não rodava em push para `main` | Gatilho apontado para `branches: [main]`. Falta marcar o job como required em branch protection — só dá para fazer na UI do GitHub |
| Botão "Sair" podia não sair | `DashboardNavbar` checa o retorno de `signOut()`, avisa na tela e libera o botão. Corrigiu junto um segundo defeito: `signingOut` nunca voltava a `false`, então numa falha o botão travava em "Saindo...". Coberto por Playwright hoje só indiretamente (o fluxo de login, não o de logout) |
| Três consultas a `profiles` por requisição | Duas saíram quando `podeAdministrarCadastros()` e `podeVerTodaOperacao()` viraram chamadas RPC às funções `security definer` do banco. A do layout virou `lib/perfil-atual.ts`, memoizada por requisição com `cache()` do React — o ponto não é o número de round-trips hoje, é que tela nova reusa em vez de abrir a sua. A do middleware fica: roda em invocação separada do render, e nenhum cache de requisição atravessa as duas |
| A regra de autorização duplicada em TS e em SQL | `podeAdministrarCadastros()` e `podeVerTodaOperacao()` (`usuarios/queries.ts`, ex-`getNivelAcessoAtual`/`podeVerTodosOsUsuarios`) passaram a chamar `pode_administrar_cadastros()`/`pode_ver_toda_operacao()` via RPC em vez de reimplementar a regra em TS a partir de `cargo`/`ativo`. Fonte única; teste cobre concessão, negação e falha do RPC negando por padrão. O round-trip a menos é o mesmo citado em "Três consultas a `profiles`" |
| `error.tsx`/`not-found.tsx` só no nível do dashboard | `app/error.tsx` e `app/not-found.tsx`, seguindo a identidade visual do login (fundo `brand-navy`, logo, sem depender do `DashboardChrome`) |
| Índices não cobrem buscas nem ordenação real | `supabase/migrations/0011_indices_de_busca_e_ordenacao.sql`: GIN + `pg_trgm` para os `ilike` de `grupos_sites`/`profiles`, índice composto `(data_hora desc, id desc)` em `leituras` no lugar do de coluna única da 0004, e índice em `profiles.nome_completo`. A 0012 estendeu o mesmo tratamento a `sites`. Não testado contra banco local — mesma lacuna do `config.toml` que as policies de RLS tinham (ver abaixo) |
| `combinarDataHora` sem timezone explícito | Deslocamento `-03:00` fixo no timestamp montado (Brasil não observa horário de verão desde 2019, então o deslocamento não varia), com teste cobrindo os três casos (`combinarDataHora`, exportada de `coletas-importadas/queries.ts`). A importação exige o mesmo, pelo mesmo motivo: recusa timestamp sem fuso |
| `packageManager` ausente no `package.json` | Campo `"packageManager": "pnpm@11.18.0"` adicionado; `pnpm/action-setup` no CI não crava mais `version:` — lê do `package.json`, então local e CI não podem mais divergir |
| Cliente Supabase do browser recriado a cada chamada | Singleton de módulo em `lib/supabase/client.ts`: `createClient()` memoiza a instância entre chamadas |
| Botão desabilitado não alcança quem usa teclado | Componente único `components/dashboard/AcaoDesabilitada.tsx`, com `aria-disabled` + `onClick` no-op no lugar do atributo `disabled`, que preserva o foco por teclado. Precisou de `"use client"`: o `onClick` é uma função, e função não atravessa o limite servidor/cliente sem a diretiva |
| `escaparLike` duplicado nas duas telas | Virou `lib/postgrest-escape.ts`, com teste próprio. `escaparPostgrest` foi junto, e a composição dos dois virou `termoParaOr` — a ordem entre eles não é intercambiável e agora está fixada num lugar só |
| As policies de RLS não tinham um teste sequer | `supabase/config.toml` criado (via `supabase init`) e sete suites pgTAP em `supabase/tests/database/`: conta nova nasce inativa/OPERADOR mesmo forjando `raw_user_meta_data` (0005/0008), OPERADOR não lê perfil alheio e GESTOR/SUPERVISOR ativos leem (0006), `anon` não escreve em `grupos_sites` (0010), UPDATE em `cargo`/`ativo` negado para `authenticated` (0007), dedup de leitura sem área (0017), `pode_administrar_usuarios()` (0013) e escopo de CLIENTE (0014). **Executadas (2026-08-11)** direto contra o projeto de produção, cada uma dentro de `begin;...rollback;` própria — branch de desenvolvimento não está disponível no plano atual do Supabase, e é o caminho que fica pendente para quando houver. 32/32 asserts passaram, nada persistiu. Achado no processo: `escopo_de_cliente_test.sql` tinha um bug de sintaxe nunca detectado (`id like` contra coluna `uuid` sem cast) — corrigido para `id::text like`. `pnpm test:db` continua sendo o caminho de verdade quando houver Docker ou branch |
| Nenhum teste de ponta a ponta do fluxo de auth | Playwright instalado (`e2e/`, `playwright.config.ts`, `pnpm test:e2e`). Seis specs rodam sem credencial nenhuma e passam. Login → dashboard e conta inativa barrada estão escritos mas pulam sozinhos sem `E2E_EMAIL`/`E2E_PASSWORD`/`E2E_INACTIVE_EMAIL`/`E2E_INACTIVE_PASSWORD`. Fora do CI de propósito: rodar contra o Supabase real consome o rate limit de auth dele a cada push |
| Botões de exportar Excel/PDF sem handler | "Exportar para Excel" virou CSV (`lib/csv.ts` — ponto e vírgula como separador e BOM UTF-8, para abrir certo no Excel em pt-BR); "Exportar para PDF" é uma tela de impressão (`components/dashboard/TabelaImpressao.tsx` + `ImprimirAoAbrir`) que dispara `window.print()`. As rotas respeitam o mesmo filtro da listagem, com teto de 2000 linhas e aviso de truncamento. Site / Planta nasceu já com as duas |
| `console.error` sem correlação | `lib/log.ts`: cada log do middleware, `perfil-atual.ts` e das rotas de API carrega um id curto por requisição/invocação. O destino (mandar para um serviço externo) segue em aberto — linha própria na lista acima |
| Envs sem validação, erro genérico | `lib/env.ts`, com mensagem apontando o `.env.example`. A `service_role` fica de fora de propósito: é lida sob demanda em `lib/supabase/admin.ts`, para um projeto sem importação configurada continuar subindo |
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

**O que nada nesta revisão pôde verificar:** nenhuma migration, policy ou
consulta desta rodada rodou contra um Postgres de verdade — não há Docker
neste ambiente para `supabase start`. Vale para a 0012, para o `seed.sql` e
para a rota de importação inteira, que passa 34 testes de formato e zero de
integração. `pnpm test:db` e um `curl` contra o ambiente local são o próximo
passo antes de confiar em qualquer um dos três.
