-- ============================================================================
-- 0110: notificacao no celular (push) com o app fechado
--
-- Pedido do gestor (16/11/2026): o aviso da revisao aos 9.000 km e o da meta
-- de visitas chegam no celular. A caixa de avisos (0103) ja os guarda; esta
-- migration faz cada aviso novo virar tambem uma notificacao no aparelho.
--
-- Como:
--   * O app (APK 1.3.0, com expo-notifications e o projeto do Firebase) pede
--     a permissao, obtem o endereco de push do Expo do aparelho e o registra
--     em `dispositivos_push` por `registrar_dispositivo_push`.
--   * Quando nasce uma linha em `notificacoes`, o gatilho manda, pelo pg_net,
--     a mensagem ao servico de push do Expo (exp.host), que entrega pelo
--     Firebase. Assincrono: a resposta nunca segura nem recusa o aviso.
--   * O endereco e do APARELHO: se outra pessoa entra no mesmo celular, ele
--     passa a ser dela (por isso o registro e por funcao definer, que pode
--     trocar o dono). Ao sair do app, o registro e apagado.
--
-- O endereco de push nao e segredo de autenticacao (so permite mandar
-- mensagem a este app), mas fica fechado no RLS: cada um ve so os proprios.
-- ============================================================================

create table if not exists public.dispositivos_push (
  token text primary key check (token ~ '^ExponentPushToken\[[A-Za-z0-9_-]{10,100}\]$'),
  usuario_id uuid not null references public.profiles (id) on delete cascade,
  plataforma text not null default 'android' check (plataforma in ('android', 'ios')),
  atualizado_em timestamptz not null default now()
);

comment on table public.dispositivos_push is
  'Endereco de push (Expo) de cada aparelho e de quem esta logado nele; o gatilho de notificacoes manda o aviso para la. 0110.';

create index if not exists dispositivos_push_usuario_idx on public.dispositivos_push (usuario_id);

alter table public.dispositivos_push enable row level security;
revoke all on public.dispositivos_push from anon, authenticated;
grant select, delete on public.dispositivos_push to authenticated;

drop policy if exists dispositivos_push_ler_os_proprios on public.dispositivos_push;
create policy dispositivos_push_ler_os_proprios on public.dispositivos_push
  for select to authenticated
  using (usuario_id = (select auth.uid()));

drop policy if exists dispositivos_push_apagar_os_proprios on public.dispositivos_push;
create policy dispositivos_push_apagar_os_proprios on public.dispositivos_push
  for delete to authenticated
  using (usuario_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Registro do aparelho: definer (troca o dono de um endereco ja visto)
-- ---------------------------------------------------------------------------
create or replace function escrita.registrar_dispositivo_push(p_token text, p_plataforma text default 'android')
returns void
language plpgsql
security definer
set search_path = escrita, public, pg_temp
as $$
begin
  if auth.uid() is null or not autorizacao.usuario_ativo() then
    raise exception 'Sem permissão para registrar o aparelho.' using errcode = '42501';
  end if;

  insert into public.dispositivos_push (token, usuario_id, plataforma, atualizado_em)
  values (p_token, auth.uid(), coalesce(p_plataforma, 'android'), now())
  on conflict (token) do update
    set usuario_id = excluded.usuario_id,
        plataforma = excluded.plataforma,
        atualizado_em = now();
end;
$$;

revoke all on function escrita.registrar_dispositivo_push(text, text) from public, anon, authenticated;
grant execute on function escrita.registrar_dispositivo_push(text, text) to authenticated;

create or replace function public.registrar_dispositivo_push(p_token text, p_plataforma text default 'android')
returns void
language sql
security invoker
set search_path = public, pg_temp
as $$
  select escrita.registrar_dispositivo_push(p_token, p_plataforma);
$$;

comment on function public.registrar_dispositivo_push(text, text) is 'Envelope de escrita.registrar_dispositivo_push -- migration 0110.';

revoke all on function public.registrar_dispositivo_push(text, text) from public, anon;
grant execute on function public.registrar_dispositivo_push(text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Cada aviso novo vira push para os aparelhos do destinatario
-- ---------------------------------------------------------------------------
create or replace function manutencao.enviar_push_da_notificacao()
returns trigger
language plpgsql
security definer
set search_path = manutencao, public, pg_temp
as $$
declare
  v_mensagens jsonb;
begin
  select jsonb_agg(jsonb_build_object(
           'to', d.token,
           'title', new.titulo,
           'body', new.texto,
           'sound', 'default',
           'channelId', 'avisos',
           'priority', 'high',
           'data', jsonb_build_object('notificacao_id', new.id, 'tipo', new.tipo)
         ))
    into v_mensagens
    from public.dispositivos_push d
   where d.usuario_id = new.destinatario_id;

  if v_mensagens is null then
    return null;
  end if;

  if to_regprocedure('net.http_post(text, jsonb, jsonb, jsonb, integer)') is null then
    raise warning 'enviar_push_da_notificacao: pg_net indisponivel; aviso % fica so na caixa', new.id;
    return null;
  end if;

  execute $q$
    select net.http_post(
      url                  := 'https://exp.host/--/api/v2/push/send',
      body                 := $1,
      params               := '{}'::jsonb,
      headers              := '{"Content-Type": "application/json", "Accept": "application/json"}'::jsonb,
      timeout_milliseconds := 5000
    )
  $q$ using v_mensagens;

  return null;
exception when others then
  -- O push nunca recusa o aviso: ele continua na caixa do portal e do app.
  raise warning 'enviar_push_da_notificacao: push nao enviado (aviso %): %', new.id, sqlerrm;
  return null;
end;
$$;

revoke all on function manutencao.enviar_push_da_notificacao() from public, anon, authenticated;

drop trigger if exists notificacoes_enviar_push on public.notificacoes;
create trigger notificacoes_enviar_push
  after insert on public.notificacoes
  for each row execute function manutencao.enviar_push_da_notificacao();
