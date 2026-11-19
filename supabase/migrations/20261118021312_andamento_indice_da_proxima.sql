-- A próxima tarefa de cada linha do Andamento (andamento_dos_clientes, 20261118020729_andamento_dos_checklists.sql) é a
-- de data mais cedo entre as não feitas e não bloqueadas, em ordem de vencimento e posição. O índice das não feitas
-- (20261117181313_checklists_dos_clientes.sql) só tinha (check-list, vencimento): a ordem por posição pedia um passo de
-- ordenação que lia todas as não feitas do check-list (até 500) antes de parar, conferindo as dependências de cada uma.
-- Com a posição no índice, a leitura sai já na ordem e para na primeira tarefa livre (no caso comum, a primeira lida).
-- O índice continua servindo a tudo que o antigo servia (recontar, atrasadas, vencem em 7 dias), com o mesmo nome.
-- Medido no teste de volume (5.000 check-lists de 40 tarefas): a página da gestão foi de ~7,5 para ~5 ms; com 15 linhas
-- de 500 tarefas em que a primeira livre é a última na ordem de data (o pior caso), ~24 ms. Nenhuma linha muda.

drop index public.checklist_tarefas_vencimento_idx;
create index checklist_tarefas_vencimento_idx on public.checklist_tarefas (checklist_id, vence_em, posicao)
  where estado <> 'feita';
