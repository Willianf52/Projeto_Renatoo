-- ============================================================================
-- VeloxLab — Administração de usuários
--
-- Ate aqui `cargo` e `ativo` nao tinham grant de update para `authenticated`
-- (migrations 0002/0007) e nada na aplicacao os escrevia. O efeito colateral,
-- somado a 0008 (conta nova nasce inativa), e que **ativar um usuario novo so
-- era possivel pelo painel do Supabase** -- o sistema nao conseguia admitir
-- ninguem por conta propria.
--
-- Este arquivo NAO afrouxa aquele grant. Ele continua fechado, e a escrita
-- passa a acontecer numa server action com service_role, que confere a funcao
-- abaixo antes de tocar no banco. O motivo de manter assim: `cargo` e a coluna
-- que define poder no sistema inteiro, e um grant para `authenticated` a
-- exporia a qualquer chamada direta a API, fora do caminho da aplicacao.
--
-- Idempotente: pode ser executado mais de uma vez sem erro.
-- ============================================================================

-- Quem administra usuarios: GESTOR, e so.
--
-- Regua deliberadamente mais estreita que `pode_administrar_cadastros()`, que
-- inclui SUPERVISOR e OPERACIONAL (migration 0009). Quem escreve `cargo`
-- concede nivel de acesso -- inclusive o proprio, se nada impedisse. Um
-- OPERACIONAL capaz de cadastrar site nao deve, pelo mesmo direito, poder se
-- promover a GESTOR: seriam duas decisoes diferentes viajando juntas, que e
-- exatamente o que a 0009 evitou ao nao reaproveitar `pode_ver_toda_operacao()`.
--
-- Se a operacao precisar que SUPERVISOR ative contas sem poder mexer em
-- `cargo`, o caminho e uma segunda funcao para esse recorte -- nao alargar
-- esta.
create or replace function public.pode_administrar_usuarios()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select public.usuario_ativo()
    and public.nivel_acesso_atual() = 'GESTOR';
$$;

comment on function public.pode_administrar_usuarios() is
  'Quem pode criar usuarios e alterar nivel de acesso/situacao. So GESTOR:
   escrever cargo e conceder poder, decisao mais estreita que administrar
   cadastro (pode_administrar_cadastros, migration 0009).';

revoke all on function public.pode_administrar_usuarios() from public;
grant execute on function public.pode_administrar_usuarios() to authenticated;

-- Indice para o filtro por nivel de acesso da tela de Usuarios, que hoje faz
-- `eq("cargo", ...)` sem cobertura. Parcial em `ativo` nao serve: a tela filtra
-- pelos dois valores.
create index if not exists profiles_cargo_idx on public.profiles (cargo);
