# Integrações — desenho (v1: só a conexão)

## Por quê

O sistema vai usar serviços de fora (IA, e-mail, Google). O Diego quer um lugar único para conectar cada
um, e que **todos os lugares do sistema usem a mesma conexão**. Nesta versão a tela só conecta, testa,
edita e desconecta; usar as conexões (mandar e-mail, chamar a IA, ler agenda) vem depois.

## Decisões do Diego

- Integrações da primeira versão: **IA (Claude/OpenAI)**, **E-mail (SMTP)** e **Google (Agenda/Drive)**.
- **Cada consultoria conecta as suas.** O administrador da consultoria conecta; o dono vê de todas.

## Decisões minhas (podem mudar)

- **Uma conexão por tipo por consultoria** (`ia`, `smtp`, `google`).
- **Quem faz o quê:** administrador cria, consulta, edita, testa e desconecta as da própria consultoria.
  O dono só consulta (escolhe a consultoria no filtro). Gestor e pessoa não veem o menu.
- **Segredo nunca volta para o navegador.** Chave de API, senha do SMTP e o token do Google ficam no
  Vault do Supabase (cifrados). A tabela guarda só a configuração sem segredo e o estado do último teste.
  Ao editar, o campo do segredo vem vazio: em branco mantém o atual.
- **Tudo que grava passa pela Edge Function `integracoes`** (salvar, testar, desconectar, iniciar o
  Google). O navegador só lê a tabela (RLS: admin da consultoria e dono).
- **Salvar já testa.** A resposta diz se conectou; o estado fica na tabela (`conectada` ou `com_erro`,
  com a mensagem e a hora do teste).
- **Mesma conexão em todo lugar:** `supabase/functions/_shared/integracoes.ts` tem `conexaoDa(consultoria,
  tipo)` (configuração + segredo) para as próximas funções usarem, e os testes de conexão.
- **Testes de conexão:**
  - IA Anthropic: SDK oficial, `models.list` com a chave. Modelo padrão sugerido: `claude-opus-5-5`.
  - IA OpenAI: `GET /v1/models` com a chave.
  - SMTP: abre a conexão (SSL direto, STARTTLS ou sem cifra), `EHLO`, login (`AUTH LOGIN`) quando há
    usuário, e `QUIT`. Não manda e-mail.
  - Google: OAuth da plataforma (variáveis `GOOGLE_OAUTH_CLIENT_ID` e `GOOGLE_OAUTH_CLIENT_SECRET` nas
    Edge Functions). "Conectar com Google" leva à tela do Google; a volta cai na função
    `integracoes-google`, que troca o código pelo token, guarda no Vault e volta para `/integracoes`.
    O teste renova o token e lê o e-mail da conta. Sem as variáveis, a tela avisa que falta configurar o
    app do Google na plataforma (README).
- **Tela:** tabela com as três integrações (regra das listas), situação, detalhes (ex.: "Anthropic ·
  claude-opus-5-5", "smtp.empresa.com:587 · contato@empresa.com", e-mail da conta Google), último
  teste e ações Conectar/Editar, Testar e Desconectar (com confirmação).

## Fora desta versão

Usar as conexões; mais de uma conexão do mesmo tipo; integrações por time ou por pessoa; outros
provedores. A paginação não entra porque são três linhas fixas.
