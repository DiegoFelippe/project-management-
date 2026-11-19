-- Arquivos do cliente seguram o cliente, como os check-ins: cliente_arquivos.cliente_id passa de "on delete cascade"
-- para "on delete restrict", como manda o design ("Ligações futuras": cada ligação nova tem cliente_id references
-- clientes on delete restrict; o cliente só é apagado sem nada ligado). Apagar cliente com arquivo dá 23503, que a
-- tela traduz para "arquive em vez de apagar". A troca não apaga nada: só muda o que acontece no próximo delete.
-- O app continua chamando limparPastaDoCliente depois de apagar o cliente, para tirar objetos que ficaram sem linha.

alter table public.cliente_arquivos
  drop constraint cliente_arquivos_cliente_id_fkey,
  add constraint cliente_arquivos_cliente_id_fkey
    foreign key (cliente_id) references public.clientes on delete restrict;
