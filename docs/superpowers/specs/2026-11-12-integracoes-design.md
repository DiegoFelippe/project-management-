# Integrações — desenho (v1: só a conexão)

## Por quê

O sistema vai usar serviços de fora (IA, e-mail, Google). O Diego quer um lugar único para conectar cada
um, e que **todos os lugares do sistema usem a mesma conexão**. Nesta versão a tela só conecta, testa,
edita e desconecta; usar as conexões (mandar e-mail, chamar a IA, ler agenda) vem depois.

## Decisões do Diego

- Integrações da primeira versão: **IA (Claude/OpenAI)**, **E-mail (SMTP)** e **Google (Agenda/Drive)**.
- **Cada consultoria conecta as suas.** O administrador da consultoria conecta; o dono vê de todas.

## Decisões minhas (podem mudar)

- **Uma conexão por tipo por consultoria** (`ia`, `smtp`, `google`; na v2, também `slack` e `whatsapp`).
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

## v2 (17/11): Testar na janela, Slack e WhatsApp

Pedido do Diego: "Nas integrações crie um botão de teste e implemente o Slack." / "E o WhatsApp." / "Vamos fazer
apenas a conexão, depois eu defino para onde vai."

- **Só a conexão** do Slack e do WhatsApp, uma por consultoria, com as mesmas regras das outras. CRUD como hoje:
  **criar** (Conectar) e **editar** (Editar, formulário preenchido; o token vem em branco e em branco fica o
  guardado) pelo administrador da consultoria; **consultar** na tabela pelo administrador e pelo dono (que só olha);
  **apagar** (Desconectar, com confirmação: some a conexão e o token guardado). Nenhum aviso é mandado ainda.
- **Slack:** app do Slack com **token de bot** (`xoxb-`, no Vault) e, opcional, o canal do teste (`#nome` ou o ID).
  Teste: `auth.test` (confere o token e lê o workspace e o nome do bot, guardados na configuração para a linha
  mostrar) e, com canal, `chat.postMessage` com "Teste da IXC Consult: conexão funcionando.". Escopos no README.
- **WhatsApp:** **WhatsApp Business Cloud API** (oficial da Meta): ID do número (`phone_number_id`), ID da conta
  (`waba_id`) e token permanente de um usuário do sistema (no Vault). Teste: `GET /{phone_number_id}` na Graph API
  (confere o token e o ID; lê o número e o nome verificado) e, com um número do teste digitado (formato internacional,
  nunca guardado), manda o modelo `hello_world` (en_US). Versão da Graph numa constante (`VERSAO_DA_GRAPH`, `v26.0`).
- **Testar dentro da janela** de IA, e-mail, Slack e WhatsApp (o Google conecta pelo OAuth e não tem janela): ação
  `testar_rascunho` da Edge Function, que testa o que foi digitado **sem gravar nada** (nem o resultado); segredo em
  branco usa o guardado. IA: uma pergunta curta ao modelo (confere a chave e o nome do modelo); e-mail: uma mensagem de
  teste para o e-mail de quem testa; Slack e WhatsApp: como acima. Rodapé: Cancelar · Testar ("Testando…") · Salvar
  ("Salvando…"). Salvar continua testando no servidor (a situação da linha), sem mandar mensagem; o Testar da linha
  testa a conexão salva e, no Slack, posta no canal salvo.
- **O que fala só por HTTP fica sem Deno** em `supabase/functions/_shared/conexoes.ts` (Slack, WhatsApp e a pergunta à
  IA), testado com o Slack, a Meta e a IA falsos de `conexoes-falsas.ts` (`npm test`), sem rede.
- **Banco:** a regra da coluna `tipo` aceita `slack` e `whatsapp`; os cartões contam 5 integrações por consultoria
  (`indicadores_de_integracoes`).
