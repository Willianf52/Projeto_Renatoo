-- ============================================================================
-- 0109: a mesma pessoa pode usar mais de um carro
--
-- A 0104 deixava no maximo um veiculo ativo por pessoa (`usuario_id`). O dono
-- (20/11/2026): o mesmo inspetor pode usar mais de um carro. O app passa a
-- perguntar, uma vez por dia, qual carro a pessoa esta usando (os dela
-- primeiro, depois os da frota) e pede o km dele.
--
-- So cai o indice unico; `usuario_id` continua dizendo de quem o carro e no
-- dia a dia, e varios carros podem apontar para a mesma pessoa.
-- ============================================================================

drop index if exists public.veiculos_um_ativo_por_usuario;

create index if not exists veiculos_usuario_idx
  on public.veiculos (usuario_id) where usuario_id is not null;
