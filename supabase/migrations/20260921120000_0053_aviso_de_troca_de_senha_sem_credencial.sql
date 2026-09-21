-- ============================================================================
-- 0053 — aviso de troca de senha sem credencial e sem segredo no catalogo
--
-- O PROBLEMA (achados M1 e M2 da auditoria de AppSec de 16/09/2026).
--
-- O aviso "sua senha foi alterada" (`/api/webhooks/user-updated`) era
-- alimentado por um Database Webhook criado pelo painel do Supabase, que vive
-- como o trigger "user-updated" em `auth.users`. Tres defeitos, todos dele:
--
--   1. SEGREDO EM TEXTO PURO NA DDL. O cabecalho `x-webhook-secret` ficava
--      literal na definicao do trigger -- e sai em todo `pg_dump` de schema:
--      o backup diario no R2 e o ensaio de restauracao na CI. Quem tivesse um
--      backup forjava o aviso para qualquer endereco (phishing com o nosso
--      remetente).
--   2. CREDENCIAL EM TRANSITO A CADA LOGIN. Disparava em TODO update de
--      `auth.users` -- o `last_sign_in_at` de cada login incluido -- mandando
--      `record` e `old_record` inteiros: hash bcrypt da senha e hashes dos
--      tokens de recuperacao, para a aplicacao comparar dois hashes.
--   3. AVISO PERDIDO NO PICO. Como todo login chamava a rota, 30 logins no
--      inicio do turno esgotavam o limite de taxa dela (30/min, mesmo IP do
--      pg_net). Uma troca de senha nesse minuto levava 429, o pg_net nao
--      tenta de novo, e o dono da conta nunca era avisado -- justamente o
--      controle que denuncia sequestro de conta.
--
-- A CORRECAO. Um trigger nosso, que:
--   - so dispara quando `encrypted_password` muda (`update of` + `when`);
--   - manda so `{ type: 'PASSWORD_CHANGED', user_id, email }` -- e, se o
--     e-mail mudou no mesmo UPDATE, um segundo aviso para o endereco antigo;
--   - le URL e segredo do Vault (`vault.decrypted_secrets`), nunca da DDL;
--   - NUNCA derruba a troca de senha: segredo ausente, pg_net ausente ou
--     falha de enfileiramento viram `warning` e a troca segue. Um aviso
--     perdido e ruim; uma pessoa que nao consegue trocar a senha e pior.
--
-- O QUE ESTA MIGRATION NAO CONSEGUE FAZER: apagar o webhook antigo. O
-- `postgres` que roda as migrations tem privilegio TRIGGER em `auth.users`
-- (cria trigger), mas nao e dono da tabela (`supabase_auth_admin`), e DROP
-- TRIGGER exige ser dono -- conferido em producao em 16/09. A tentativa abaixo
-- fica num bloco com tratamento de erro e, sem privilegio, so avisa.
--
-- ORDEM DE IMPLANTACAO (nenhum aviso perdido, nenhum em dobro):
--   1. Gerar um segredo novo e grava-lo no Vault, junto com a URL:
--        select vault.create_secret('<segredo-novo>', 'webhook_user_updated_secret');
--        select vault.create_secret('https://<dominio>/api/webhooks/user-updated', 'webhook_user_updated_url');
--   2. Aplicar esta migration. A partir daqui o trigger novo chama a rota
--      ANTIGA, que recusa o corpo novo (e o segredo novo): o webhook antigo
--      ainda entrega o aviso.
--   3. Trocar `SUPABASE_WEBHOOK_SECRET` na Vercel pelo segredo novo e publicar
--      a aplicacao deste PR. A rota passa a aceitar so o corpo novo e ignora
--      o antigo com 200 (o webhook antigo, com o segredo antigo, leva 401).
--   4. Apagar o webhook "user-updated" em Database -> Webhooks no painel.
-- ============================================================================

create schema if not exists manutencao;

create or replace function manutencao.avisar_troca_de_senha()
returns trigger
language plpgsql
security definer
set search_path = manutencao, public, pg_temp
as $$
declare
  v_url     text;
  v_segredo text;
  v_email   text;
begin
  -- Verificado em tempo de execucao, e nao por `create extension`: o stack
  -- local da CI pode nao ter Vault/pg_net, e a ausencia nao pode quebrar a
  -- troca de senha nem a aplicacao da migration.
  if to_regclass('vault.decrypted_secrets') is null
     or to_regprocedure('net.http_post(text, jsonb, jsonb, jsonb, integer)') is null then
    raise warning 'avisar_troca_de_senha: Vault ou pg_net indisponivel; aviso nao enviado (usuario %)', new.id;
    return new;
  end if;

  execute $q$select decrypted_secret from vault.decrypted_secrets where name = 'webhook_user_updated_url'$q$
    into v_url;
  execute $q$select decrypted_secret from vault.decrypted_secrets where name = 'webhook_user_updated_secret'$q$
    into v_segredo;

  if v_url is null or v_segredo is null then
    raise warning 'avisar_troca_de_senha: segredos do Vault nao configurados; aviso nao enviado (usuario %)', new.id;
    return new;
  end if;

  -- Se e-mail e senha mudam no mesmo UPDATE (o trigger dispara: a coluna
  -- `encrypted_password` esta no SET), avisar so `new.email` avisaria o
  -- endereco que quem sequestrou a conta acabou de colocar. O dono legitimo
  -- e o do `old.email` -- ele tambem recebe. Numa troca normal os dois sao
  -- iguais e sai um aviso so.
  foreach v_email in array array(
    select distinct e from unnest(array[new.email, old.email]) as e where e is not null
  ) loop
    -- `execute` e nao chamada direta: a funcao compila mesmo sem pg_net
    -- instalado. O pg_net so enfileira; a requisicao sai depois do commit.
    execute $q$
      select net.http_post(
        url                  := $1,
        body                 := $2,
        params               := '{}'::jsonb,
        headers              := $3,
        timeout_milliseconds := 5000
      )
    $q$
    using
      v_url,
      jsonb_build_object('type', 'PASSWORD_CHANGED', 'user_id', new.id, 'email', v_email),
      jsonb_build_object('Content-Type', 'application/json', 'x-webhook-secret', v_segredo);
  end loop;

  return new;
exception when others then
  -- Nunca o segredo nem a URL na mensagem: warning vai para o log do Postgres.
  raise warning 'avisar_troca_de_senha: falha ao enfileirar o aviso (usuario %): %', new.id, sqlerrm;
  return new;
end;
$$;

revoke all on function manutencao.avisar_troca_de_senha() from public, anon, authenticated;

comment on function manutencao.avisar_troca_de_senha() is
  'Enfileira o aviso de troca de senha para /api/webhooks/user-updated, so com user_id e email. URL e segredo vem do Vault. Nunca impede a troca. Ver migration 0053.';

-- Idempotente sem DROP TRIGGER (que exigiria ser dono de auth.users).
do $$
begin
  if not exists (
    select 1 from pg_trigger
     where tgname = 'avisar_troca_de_senha'
       and tgrelid = 'auth.users'::regclass
  ) then
    create trigger avisar_troca_de_senha
      after update of encrypted_password on auth.users
      for each row
      when (old.encrypted_password is distinct from new.encrypted_password)
      execute function manutencao.avisar_troca_de_senha();
  end if;
end;
$$;

-- Tentativa de remover o webhook antigo. Sem privilegio (o caso em producao),
-- so avisa -- o passo 4 do cabecalho faz isso pelo painel.
do $$
begin
  if exists (
    select 1 from pg_trigger
     where tgname = 'user-updated'
       and tgrelid = 'auth.users'::regclass
  ) then
    begin
      drop trigger "user-updated" on auth.users;
    exception when insufficient_privilege then
      raise notice '0053: sem privilegio para remover o webhook antigo "user-updated"; apague-o em Database -> Webhooks.';
    end;
  end if;
end;
$$;
