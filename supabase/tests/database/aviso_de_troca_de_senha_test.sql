-- ============================================================================
-- pgTAP — aviso de troca de senha (migration 0053, achados M1/M2 de 16/09/2026)
--
--   1) A funcao mora fora da API, e security definer, e ninguem da sessao a
--      executa.
--   2) O trigger so dispara em mudanca de `encrypted_password`.
--   3) Sem segredos no Vault, trocar a senha NAO falha -- aviso perdido e
--      ruim; troca de senha bloqueada e pior.
--   4) Com segredos (quando o stack tem Vault e pg_net): um login nao enfileira
--      nada, uma troca de senha enfileira UM pedido, e o corpo nao carrega
--      hash nenhum. Se e-mail e senha mudam juntos, o endereco ANTIGO
--      (o do dono legitimo) tambem e avisado.
--
-- Os asserts do item 4 dependem de Vault e pg_net. O `seed.sql` (secao 4) liga
-- as duas, como producao as tem, e o assert 0 abaixo cobra isso: num stack sem
-- elas o arquivo FALHA nomeando o motivo, em vez de passar com tres SKIPs --
-- que era o ponto cego de 21/09 a 23/09/2026 (SKIP conta como passe, e o check
-- ficava verde justamente sem exercitar o aviso ao endereco antigo). Os SKIPs
-- continuam abaixo para o run nao virar cascata de erro sem sentido, mas o
-- assert 0 garante que ninguem leia o verde como prova.
-- ============================================================================

begin;

select plan(10);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password)
values ('e0530000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'troca.senha.0053@teste.local', 'hash-inicial');

-- ---------------------------------------------------------------------------
-- 1) Funcao.
-- ---------------------------------------------------------------------------
select ok(
  (select p.prosecdef
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'manutencao' and p.proname = 'avisar_troca_de_senha'),
  'avisar_troca_de_senha existe em manutencao e e security definer'
);

select ok(
  not has_function_privilege('authenticated', 'manutencao.avisar_troca_de_senha()', 'EXECUTE')
    and not has_function_privilege('anon', 'manutencao.avisar_troca_de_senha()', 'EXECUTE'),
  'anon e authenticated nao executam avisar_troca_de_senha'
);

-- ---------------------------------------------------------------------------
-- 2) Trigger.
-- ---------------------------------------------------------------------------
select ok(
  (select pg_get_triggerdef(t.oid) ilike '%UPDATE OF encrypted_password%'
          and pg_get_triggerdef(t.oid) ilike '%IS DISTINCT FROM%'
     from pg_trigger t
    where t.tgname = 'avisar_troca_de_senha' and t.tgrelid = 'auth.users'::regclass),
  'o trigger escuta so encrypted_password, e so quando ele muda'
);

-- ---------------------------------------------------------------------------
-- 3) Sem segredos: a troca de senha segue.
-- ---------------------------------------------------------------------------
select lives_ok(
  $$ update auth.users set encrypted_password = 'hash-sem-segredo'
      where id = 'e0530000-0000-0000-0000-000000000001' $$,
  'trocar a senha sem segredos no Vault nao falha'
);

select is(
  (select encrypted_password from auth.users where id = 'e0530000-0000-0000-0000-000000000001'),
  'hash-sem-segredo',
  'a troca de senha foi gravada'
);

-- ---------------------------------------------------------------------------
-- 4) Com segredos: o que vai para a fila do pg_net.
-- ---------------------------------------------------------------------------
create temporary table resultado_do_aviso (disponivel boolean, pedidos int, com_hash int, enderecos text[], motivo text);

do $$
declare
  v_antes bigint;
begin
  if to_regclass('vault.decrypted_secrets') is null
     or to_regclass('net.http_request_queue') is null then
    insert into resultado_do_aviso (disponivel, pedidos, com_hash, motivo)
    values (false, 0, 0, format(
      'extensoes ausentes (vault.decrypted_secrets: %s, net.http_request_queue: %s) -- rode `supabase db reset` para o seed.sql ligar supabase_vault e pg_net',
      coalesce(to_regclass('vault.decrypted_secrets')::text, 'AUSENTE'),
      coalesce(to_regclass('net.http_request_queue')::text, 'AUSENTE')
    ));
    return;
  end if;

  begin
    execute $q$select vault.create_secret('segredo-de-teste-0053', 'webhook_user_updated_secret')$q$;
    execute $q$select vault.create_secret('http://127.0.0.1:9/aviso-0053', 'webhook_user_updated_url')$q$;
  exception when others then
    insert into resultado_do_aviso (disponivel, pedidos, com_hash, motivo)
    values (false, 0, 0, 'vault.create_secret falhou: ' || sqlerrm);
    return;
  end;

  execute $q$select coalesce(max(id), 0) from net.http_request_queue$q$ into v_antes;

  -- Login: mexe em auth.users, mas nao na senha.
  update auth.users set last_sign_in_at = now()
   where id = 'e0530000-0000-0000-0000-000000000001';

  -- Troca de senha.
  update auth.users set encrypted_password = 'hash-com-segredo'
   where id = 'e0530000-0000-0000-0000-000000000001';

  execute format(
    $q$insert into resultado_do_aviso (disponivel, pedidos, com_hash)
       select true,
              count(*) filter (where convert_from(body, 'UTF8')::jsonb ->> 'user_id' = 'e0530000-0000-0000-0000-000000000001'),
              count(*) filter (where convert_from(body, 'UTF8') ilike '%%hash%%'
                                  or convert_from(body, 'UTF8') ilike '%%encrypted_password%%')
         from net.http_request_queue
        where id > %s and url = 'http://127.0.0.1:9/aviso-0053'$q$,
    v_antes
  );

  execute $q$select coalesce(max(id), 0) from net.http_request_queue$q$ into v_antes;

  -- Sequestro: e-mail e senha trocados no mesmo UPDATE.
  update auth.users
     set email = 'invasor.0053@teste.local', encrypted_password = 'hash-do-invasor'
   where id = 'e0530000-0000-0000-0000-000000000001';

  execute format(
    $q$update resultado_do_aviso
          set enderecos = (select array_agg(e order by e)
                             from (select convert_from(body, 'UTF8')::jsonb ->> 'email' as e
                                     from net.http_request_queue
                                    where id > %s and url = 'http://127.0.0.1:9/aviso-0053') as avisos)$q$,
    v_antes
  );
end;
$$;

-- Assert 0 -- sem isto, os tres abaixo se pulam sozinhos e o arquivo passa
-- sem ter enfileirado nada. Ver o cabecalho.
select ok(
  (select disponivel from resultado_do_aviso),
  coalesce(
    'Vault e pg_net disponiveis: ' || (select motivo from resultado_do_aviso),
    'Vault e pg_net disponiveis neste stack'
  )
);

select case when (select disponivel from resultado_do_aviso)
  then is((select pedidos from resultado_do_aviso), 1,
          'login nao enfileira aviso; a troca de senha enfileira exatamente um')
  else skip('Vault ou pg_net indisponivel neste stack', 1)
end;

select case when (select disponivel from resultado_do_aviso)
  then is((select com_hash from resultado_do_aviso), 0,
          'o corpo do aviso nao carrega hash de senha')
  else skip('Vault ou pg_net indisponivel neste stack', 1)
end;

select case when (select disponivel from resultado_do_aviso)
  then is((select enderecos from resultado_do_aviso),
          array['invasor.0053@teste.local', 'troca.senha.0053@teste.local'],
          'e-mail e senha trocados juntos avisam o endereco novo E o antigo')
  else skip('Vault ou pg_net indisponivel neste stack', 1)
end;

select is(
  (select count(*)::int from pg_trigger where tgname = 'avisar_troca_de_senha'),
  1,
  'um unico trigger de aviso -- a criacao na migration e idempotente'
);

select * from finish();

rollback;
