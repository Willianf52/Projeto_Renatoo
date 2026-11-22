-- ============================================================================
-- pgTAP -- a mesma pessoa pode ter mais de um carro ativo (migration 0109)
-- ============================================================================

begin;

select plan(1);

insert into auth.users (id, instance_id, aud, role, email)
values ('f0000000-0000-0000-0000-000000001091', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'carros.inspetor@teste.local');
update public.profiles set ativo = true, cargo = 'INSPETOR' where id = 'f0000000-0000-0000-0000-000000001091';

select lives_ok(
  $$ insert into public.veiculos (placa, modelo, usuario_id) values
       ('TST1A91', 'Carro 1 0109', 'f0000000-0000-0000-0000-000000001091'),
       ('TST1A92', 'Carro 2 0109', 'f0000000-0000-0000-0000-000000001091') $$,
  'a mesma pessoa pode ter dois carros ativos'
);

select * from finish();
rollback;
