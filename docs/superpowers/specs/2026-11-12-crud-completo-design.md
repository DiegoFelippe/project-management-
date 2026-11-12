# CRUD completo: consultorias, usuários e times — design

Data: 2026-11-12. Projeto: `~/Documents/consultoria` (IXC Consult). Continua o design
`2026-11-12-login-usuarios-times-design.md`; tudo que está lá continua valendo, menos o que este muda.

## Por que

Regra nova do Diego (no `CLAUDE.md`): tudo que o app cria tem criar, consultar, editar e apagar na tela.
Consultorias, usuários e times saíram só com criar e consultar.

## Decisões do Diego

- **Usuário:** "remover" é **desativar**. O login fica bloqueado, a pessoa some das listas de ativos, o
  histórico fica, e dá para **reativar**. Não há apagar de vez.
- **Consultoria:** "apagar" é **arquivar**. Ninguém dela entra mais, ela some das listas, os dados ficam,
  e o dono pode **reativar**. Não há apagar de vez.
- **Gestor do time:** só o **administrador** da consultoria troca. O gestor não passa o time adiante.
- **E-mail do usuário não muda.** Para trocar de e-mail: acesso novo + desativar o antigo.

## O que cada papel faz (operações novas em negrito)

| Item | Dono | Administrador | Gestor |
| --- | --- | --- | --- |
| Consultoria | criar, ver, **renomear, arquivar, reativar** | ver a dele | — |
| Usuário (pessoa/gestor) | ver | criar, ver, **editar nome, papel (pessoa ↔ gestor) e times; desativar; reativar** | criar pessoa, ver, **editar nome e times (só os dele) das pessoas que vê** |
| Administrador | criar, ver, **editar nome, desativar, reativar** | — | — |
| Time | ver | criar, ver, **editar nome/descrição, trocar gestor, apagar** | criar, ver, **editar nome/descrição do time dele, apagar o time dele** |
| Pessoa no time | ver | colocar, tirar | colocar, tirar (times dele) |

- Ninguém edita o próprio papel nem se desativa.
- **Apagar time** apaga só o time: as pessoas continuam com acesso; saem só daquele time.
- **Desativar gestor que ainda gerencia times:** a tela pede para trocar o gestor desses times antes
  (o banco recusa desativar quem é gestor de algum time).

## Como funciona (escolhas minhas, para conferir)

- **Desativar** = `perfis.ativo = false` + login bloqueado no Supabase Auth (`ban_duration`), feito por uma
  Edge Function `gerenciar-acesso` (ações `desativar`, `reativar`, `editar`). O bloqueio no Auth derruba
  sessões novas; as regras do banco (`liberado()` exige `ativo`) cortam na hora qualquer sessão aberta.
- **Arquivar consultoria** = `consultorias.arquivada_em` + todos os logins dela bloqueados, pela Edge Function
  `gerenciar-consultoria` (ações `renomear`, `arquivar`, `reativar`; só o dono). `liberado()` também exige a
  consultoria não arquivada.
- **Editar time** (nome, descrição, gestor) e **apagar time** direto pelo banco, com regras novas de
  `update`/`delete` em `times` (gestor do time e admin; trocar `gestor_id` só admin, por gatilho).
- **Telas:**
  - Usuários: cada linha ganha **Editar** (janela com nome, papel e times) e **Desativar**/**Reativar**;
    filtro **Ativos / Desativados**; situação "Desativado".
  - Times: no detalhe do time, **Editar** (nome, descrição e, para o admin, gestor) e **Apagar time**.
  - Consultorias: no cartão, **Renomear**, **Arquivar**/**Reativar**; filtro **Ativas / Arquivadas**.
  - Toda ação de apagar/desativar/arquivar abre uma **confirmação** dizendo o que acontece e o que fica.
- **Quem está desativado** e tenta entrar vê: "Seu acesso foi desativado. Fale com o administrador da sua
  consultoria." (consultoria arquivada: "Sua consultoria está arquivada…").
- **Testes:** regras no banco (pgTAP), Edge Functions (integração) e telas (unidade), como as outras.

## Mais escolhas minhas (depois da leitura do revisor)

- **Quem edita quem:**
  - o administrador edita e desativa só pessoas e gestores da consultoria dele; nunca outro administrador
    nem o dono;
  - administradores são editados e desativados só pelo dono;
  - o gestor edita só o **nome** das pessoas que vê (as que criou ou que estão nos times dele) e só coloca e
    tira pessoas dos **times dele**, nunca dos times de outro gestor.
- **Nome e papel** mudam só pela Edge Function `gerenciar-acesso` (o navegador não tem `update` em `perfis`).
  Times de uma pessoa continuam pelo `time_membros`, como hoje.
- **Desativar e reativar não mexem** em "convite pendente" nem em "senha provisória": ao reativar, a pessoa
  volta exatamente como estava. Na tela, "Desativado" aparece antes de qualquer outra situação.
- **Arquivar consultoria:**
  - não atinge o dono (ele não pertence a nenhuma consultoria);
  - bloqueia no Auth só quem está ativo. Se um bloqueio falhar no meio, o banco já corta tudo (a regra
    `liberado()` olha a consultoria arquivada) e a função devolve quantos ficaram sem bloqueio, para
    tentar de novo;
  - **reativar** desbloqueia só quem continua `ativo`: quem foi desativado individualmente segue desativado.
- **O dono continua vendo** times e pessoas de consultorias arquivadas (só olhar), com o filtro Arquivadas.
- **Nome de consultoria não se repete** (sem diferenciar maiúsculas e espaços nas pontas): "Já existe uma
  consultoria com esse nome."

## Fora deste pedaço

- Apagar de vez usuário ou consultoria (decisão do Diego: desativar/arquivar).
- Trocar e-mail.
- Histórico de quem fez o quê (auditoria).
