-- ============================================================================
-- VeloxLab — Torna os grants de tabela explicitos e versionados
--
-- PROBLEMA: um banco construido apenas a partir de `supabase/migrations/` --
-- que e o que `supabase start` faz, e o que a CI passa a fazer no job
-- `tipos-do-banco` -- nao reproduz producao. Nele `authenticated` fica sem
-- SELECT em nenhuma tabela de `public`, e `service_role` sem SELECT, INSERT,
-- UPDATE e DELETE. Toda a suite pgTAP falha com `permission denied for table
-- ...`, e nenhuma tela funcionaria contra esse banco.
--
-- CAUSA: nenhuma migration deste repositorio jamais executou `grant select`.
-- Em producao o privilegio nunca foi concedido por SQL nosso: ele vem do
-- default ACL que a plataforma Supabase declara no bootstrap do projeto
--
--   alter default privileges in schema public
--     grant arwdDxtm on tables to anon, authenticated;
--
-- e que concede os grants no instante em que cada tabela e criada. Esse
-- default e da plataforma, nao esta versionado aqui, e no stack local existe
-- apenas para o dono `supabase_admin` -- enquanto as migrations rodam como
-- `postgres`. A 0031, ao executar `alter default privileges ... revoke` para
-- fechar a escrita, materializou a entrada de `postgres` em `pg_default_acl`:
-- em producao ela nasceu a partir do default da plataforma (SELECT preservado,
-- so a escrita removida); no local, sem esse ponto de partida, nasceu sem
-- SELECT nenhum. Dai a divergencia.
--
-- O QUE ESTE ARQUIVO FAZ: escreve como SQL o estado de grants que producao ja
-- tem hoje. E uma migration de *paridade*, nao de mudanca -- levantada da
-- auditoria de 2026-08-23 contra o projeto hospedado
-- (`information_schema.role_table_grants`, `information_schema.column_privileges`
-- e `pg_default_acl`), tabela a tabela e coluna a coluna. Aplicada em
-- producao, e no-op: todo `grant` daqui concede um privilegio que ja esta la.
--
-- O QUE ESTE ARQUIVO NAO FAZ:
--
--   * Nao toca em policy, `enable row level security` nem funcao. GRANT e RLS
--     sao camadas independentes e ambas continuam obrigatorias: o GRANT diz se
--     o papel pode tocar na TABELA, a policy diz QUAIS LINHAS ele ve. Conceder
--     SELECT aqui nao abre uma linha sequer a mais -- as policies seguem
--     decidindo isso, e as tabelas sem policy de leitura continuam retornando
--     vazio.
--   * Nao devolve nada do que a 0031 fechou. `anon` recebe SELECT e mais
--     nada; `authenticated` nao recebe INSERT/UPDATE/DELETE amplo, so os
--     grants estreitos que as telas de cadastro ja usam (secoes 3 e 4).
--     TRUNCATE segue exclusivo de `service_role` -- e a unica escrita que o
--     RLS nao cobre (o Postgres nao avalia policy em TRUNCATE).
--
-- Idempotente: `grant` de privilegio ja concedido e no-op.
-- ============================================================================

-- 1) Default privileges: a tabela criada DEPOIS desta migration -------------
-- Sem esta secao, a proxima migration que criar tabela produz um objeto
-- inacessivel no banco local (e so no local, porque em producao o default da
-- plataforma continua agindo) -- exatamente a divergencia que este arquivo
-- existe para eliminar. Espelha o `pg_default_acl` de producao para o dono
-- `postgres`, que e o papel sob o qual as migrations rodam.
--
-- Repare no contraste com a 0031, que revogou INSERT/UPDATE/DELETE/TRUNCATE
-- destes mesmos dois papeis: aqui so SELECT entra, e de proposito.

alter default privileges in schema public
  grant select on tables to anon, authenticated;

alter default privileges in schema public
  grant select, insert, update, delete, truncate on tables to service_role;

-- 2) Leitura nas 19 tabelas que ja existem ----------------------------------
-- `on all tables` e seguro aqui porque o privilegio e uniforme: producao tem
-- SELECT para os tres papeis nas 19 tabelas de `public`, sem excecao.
--
-- `anon` com SELECT nao e descuido -- e o estado de producao, e a 0031
-- registrou por que revoga-lo nao acrescenta nada: todas as policies sao
-- `to authenticated`, entao o RLS ja nega qualquer linha a um papel anonimo.
-- Retirar o grant mexeria numa superficie que a aplicacao nao exercita.

grant select on all tables in schema public to anon, authenticated;

grant select, insert, update, delete, truncate on all tables in schema public to service_role;

-- 3) Escrita de `authenticated`: grants de tabela inteira --------------------
-- Os dois unicos INSERT amplos, criados pela 0036 para a escrita de campo do
-- inspetor. O RLS restringe as linhas (policies de INSERT com `auth.uid()`,
-- revisadas na 0037); o grant so abre a porta da tabela.

grant insert on public.visitas, public.leituras to authenticated;

-- DELETE das telas de cadastro. Note a assimetria, que e o estado real de
-- producao e nao um lapso deste arquivo: estas cinco tabelas tem DELETE de
-- tabela inteira, mas nenhum UPDATE de tabela inteira -- o UPDATE delas e
-- coluna a coluna, na secao 4.

grant delete on
  public.grupos_sites,
  public.grupos_usuarios,
  public.grupos_usuarios_membros,
  public.qr_codes,
  public.sites
to authenticated;

-- 4) Escrita de `authenticated`: grants por coluna ---------------------------
-- O padrao que as 0007/0009/0012/0015/0016/0024 estabeleceram: a tela escreve
-- os campos de negocio e nao alcanca `id`, `criado_em` nem `criado_por`, que
-- ficam com o default/trigger da tabela. E o mesmo motivo pelo qual `profiles`
-- so libera `nome_completo` -- `cargo` e `ativo` fora da lista sao o que
-- impede um usuario de se promover.

grant insert (nome, descricao, ativo, grupo_pai_id) on public.grupos_sites to authenticated;
grant update (nome, descricao, ativo, grupo_pai_id) on public.grupos_sites to authenticated;

grant insert (nome, descricao) on public.grupos_usuarios to authenticated;
grant update (nome, descricao) on public.grupos_usuarios to authenticated;

grant insert (grupo_id, profile_id) on public.grupos_usuarios_membros to authenticated;

grant update (nome_completo) on public.profiles to authenticated;

grant insert (codigo, finalidade, site_id, ativo) on public.qr_codes to authenticated;
grant update (codigo, finalidade, site_id, ativo) on public.qr_codes to authenticated;

-- `sites`: todas as colunas menos `id`, `criado_em` e `criado_por`.
grant insert (
  nome, sigla, ativo, cod_cliente, cod_posto, filial, regional, tipo_servico_id,
  grupo_site_id, site_superior_id, responsavel_id, cep, endereco, numero,
  complemento, bairro, cidade, uf, pais, latitude, longitude, raio_metros,
  recebe_visita, gerar_qrcode_automatico, gerar_registro_coletas,
  info_adicional_1, info_adicional_2, observacao
) on public.sites to authenticated;

grant update (
  nome, sigla, ativo, cod_cliente, cod_posto, filial, regional, tipo_servico_id,
  grupo_site_id, site_superior_id, responsavel_id, cep, endereco, numero,
  complemento, bairro, cidade, uf, pais, latitude, longitude, raio_metros,
  recebe_visita, gerar_qrcode_automatico, gerar_registro_coletas,
  info_adicional_1, info_adicional_2, observacao
) on public.sites to authenticated;
