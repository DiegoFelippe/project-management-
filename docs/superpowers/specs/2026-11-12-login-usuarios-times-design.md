# Login, usuários e times — design

Data: 2026-11-12. Projeto: `~/Documents/consultoria` (React 19 + Vite 8, Node 26, Supabase local no Docker; depois Vercel + Supabase na nuvem).

## Por que

A plataforma é contratada por **várias empresas de consultoria**. Cada consultoria usa a plataforma para controlar projetos de várias empresas clientes (a parte de projetos vem depois). Antes de qualquer projeto, a plataforma precisa saber **quem é quem**: de qual consultoria a pessoa é, em quais times está e quem manda em quê. Este primeiro pedaço entrega a porta de entrada (login) e as tarefas de quem administra pessoas: **criar consultoria**, **criar usuário** e **criar time**.

## Quem é quem (decidido por Diego)

| Papel | O que faz |
| --- | --- |
| **Dono da plataforma** | É Diego (`diego@ixcsoft.com.br`). Vê tudo, de todas as consultorias. Cadastra cada consultoria que contrata a plataforma e o administrador dela. No futuro verá as métricas de todo mundo. |
| **Administrador da consultoria** | Cada consultoria tem o seu. Cria gestores e pessoas da consultoria e vê a consultoria inteira (todos os times e todas as pessoas dela). |
| **Gestor** | Cria os times dele, cria o acesso das pessoas e as coloca nos times dele. Só vê e mexe nos times dele. |
| **Pessoa** | Entra para trabalhar nos projetos do(s) time(s) dela. Pode estar em mais de um time da consultoria. |

- **Uma consultoria nunca vê nada de outra.** Nem descobre que um e-mail tem acesso em outra consultoria.
- Gestor não cria gestor. Quem cria gestor é o administrador da consultoria.
- Os itens **Usuários** e **Times** do menu aparecem para gestor e administrador da consultoria (e para o dono). A pessoa comum não vê esses itens.
- As **empresas clientes** (donas dos projetos) entram quando chegar a parte de Projetos, dentro de cada consultoria. Fora deste pedaço.

## Objetivos

1. **Tela de login** (a mesma para todas as consultorias) com:
   - e-mail e senha;
   - **Entrar com Google**;
   - **Entrar com SSO da empresa** (só a opção por enquanto; ver "SSO");
   - "Esqueci minha senha";
   - **sem** "criar conta".
   Depois de entrar, a pessoa cai direto na consultoria dela.
2. **Ninguém se cadastra sozinho.** Só entra quem tem acesso criado pelo dono, por um administrador ou por um gestor.
   - Google: se o e-mail da conta Google é o mesmo de um acesso criado, a pessoa entra com o Google.
   - Google com e-mail sem acesso criado: **barrado**, com mensagem clara na tela de login.
3. **Criar consultoria** (só o dono, no menu **Consultorias**): nome da consultoria e o primeiro administrador dela (nome e e-mail, por convite ou com senha, como em "Criar acesso").
4. **Criar acesso**, com duas formas (Diego pediu as duas):
   - **Enviar convite:** informa nome, e-mail, papel e times. A pessoa recebe um e-mail com link para escolher a senha (ou pode entrar com o Google, se o e-mail for o mesmo).
   - **Criar com senha:** informa nome, e-mail, papel, times e uma **senha provisória**, que quem cria passa para a pessoa por fora. No primeiro acesso a pessoa é **obrigada a trocar a senha** antes de usar o sistema.
   - Na hora de criar, **já se escolhe em quais times a pessoa entra** (zero ou mais).
   - O acesso criado é sempre da consultoria de quem cria.
   - **Gestor** só pode dar o papel **Pessoa** e só pode escolher **times dele**. **Administrador da consultoria** pode dar **Pessoa** ou **Gestor** e escolher qualquer time da consultoria.
5. **Criar time**: nome (e descrição opcional). Quando quem cria é gestor, ele é o gestor do time. Quando é o administrador da consultoria, ele escolhe o gestor do time entre os gestores da consultoria.
6. **Menu e telas**:
   - **Times:** lista de times em cartões (nome, gestor, rostos das pessoas, quantidade). Abrir um time mostra as pessoas dele e permite colocar e tirar pessoas.
   - **Usuários:** lista das pessoas (nome, e-mail, papel, times, situação) e o botão **Novo acesso**.
   - **Consultorias** (só o dono): lista das consultorias com o administrador, quantidade de pessoas e times, e o botão **Nova consultoria**.
   - **Início:** tela simples de boas-vindas (o conteúdo de verdade vem depois).
7. **Dono da plataforma:** Diego, criado por um comando do projeto (local agora; o mesmo comando serve para a nuvem depois). Ele recebe um e-mail para definir a senha; nenhuma senha passa pelo chat.

## SSO (decidido por Diego: configurar por último)

- Agora: o botão **Entrar com SSO da empresa** existe e pede o e-mail do trabalho.
- Enquanto nenhuma consultoria tiver SSO configurado, ele responde com uma mensagem clara ("O SSO da sua empresa ainda não foi configurado. Entre com e-mail e senha ou com o Google.").
- Depois: o SSO de empresa do Supabase (SAML: Microsoft Entra, Okta, Google Workspace etc.) é do plano pago e é configurado para cada consultoria. Fora deste pedaço.

## Visual (aprovado por Diego no navegador)

O **conceito** é o do app de música (`pdf2musescore/frontend/src/components/shell/`) e da moldura do Hub da Karina; **as cores são novas: opção C, "claro e azul"**.

- **Moldura:** trilho de ícones à esquerda (72 px; logo em cima; cada item é um ícone num quadrado arredondado com o nome pequeno embaixo; o item aberto acende no azul), barra fina em cima (52 px) que mostra onde a pessoa está ("Nome da consultoria › Times"), e o conteúdo num **painel rebaixado** com só o canto superior esquerdo arredondado e uma sombra interna leve. Embaixo do trilho: a bolinha com as iniciais da pessoa e o Sair.
- **Celular:** o trilho vira uma gaveta aberta por um botão na barra de cima (como no app de música).
- **Cores (opção C):** moldura branca `#ffffff`, painel `#eef1f5`, destaque azul `#2563eb` (texto branco sobre ele), texto principal `#0f172a`, texto secundário `#64748b`, bordas `#e2e8f0`.
- **Login:** duas colunas. À esquerda, a arte com o logo e a frase "Projetos, times e pessoas no mesmo lugar."; à direita, o formulário. No celular, a arte vira uma faixa em cima.
- **Novo acesso:** janela no centro com a chave "Enviar convite / Criar com senha", nome, e-mail, papel, times em etiquetas para marcar, e o botão principal que muda de nome conforme a forma ("Enviar convite" / "Criar acesso").
- Os modelos aprovados estão em `.superpowers/brainstorm/86894-1794487295/content/telas-v2.html` (fora do git), mostrados na cor C. Eles são de antes da decisão das várias consultorias: a tela **Consultorias** do dono segue o mesmo padrão da tela Times (cartões + botão "Nova consultoria").

## Restrições

- **A chave secreta do Supabase nunca vai para o navegador.** Tudo que cria acesso (convite, usuário com senha, papel, consultoria) roda do lado do servidor: uma função do Supabase (Edge Function), que funciona igual no Docker local e na nuvem. O navegador usa só a chave publicável.
- **Toda tabela com RLS** ligado e políticas que seguem os papéis acima, sempre recortadas pela consultoria. Papel e consultoria nunca vêm de `user_metadata` (a pessoa consegue editar); ficam numa tabela do banco protegida.
- **Funciona no Docker local agora e na Vercel + Supabase na nuvem depois**, sem mudar código: só variáveis de ambiente e configuração do Supabase.
- Os e-mails locais (convite, esqueci a senha) aparecem no Mailpit (`http://127.0.0.1:54524`).
- Português do Brasil em tudo que a pessoa vê.
- Pacotes com versão fixa e `package-lock.json` no git (regra do Supabase).

## Fora deste pedaço (não fazer agora)

- Configurar o SSO de verdade.
- Métricas do dono e dos administradores.
- O menu **Projetos**, empresas clientes e qualquer funcionalidade de projeto (o item pode aparecer no trilho como "em breve", desabilitado).
- Desativar ou apagar acesso, trocar o papel de alguém, transferir time para outro gestor, apagar time, apagar ou suspender consultoria.
- Pessoa em mais de uma consultoria ao mesmo tempo.
- Modo escuro.
- Login com outros provedores além de Google.
- Cobrança e planos da plataforma.

## O que seria um fracasso mesmo funcionando

- Uma consultoria ver qualquer coisa de outra (inclusive chamando a API direto, sem a tela), ou descobrir que um e-mail tem acesso em outra.
- Alguém conseguir criar conta sozinho (pelo formulário ou pelo Google).
- Um gestor ver ou mexer em time ou pessoa de outro gestor.
- A chave secreta aparecer no código do navegador ou no git.
- Pessoa criada "com senha" conseguir usar o sistema sem trocar a senha provisória.

## Em aberto (só na hora de publicar)

- **Serviço de e-mail na nuvem:** o e-mail embutido do Supabase só entrega para quem é do time do projeto no Supabase e manda poucos por hora. Para convites de verdade é preciso um provedor (Resend, SendGrid etc.) e um domínio de envio. É só configuração, não muda o código.

## Escolhas que deixei para quem constrói (marcadas como minhas)

- **Bibliotecas de tela:** as mesmas do app de música — Tailwind CSS 4, componentes no estilo shadcn/ui (Radix), ícones `lucide-react`, avisos `sonner`, rotas `react-router-dom`. Linguagem JavaScript (`.jsx`), como o projeto já está.
- **Quem cria administradores de consultoria:** só o dono (o primeiro, ao criar a consultoria; outros depois, pela tela da consultoria). O administrador cria gestores e pessoas, não outros administradores.
- **O dono dentro das consultorias:** vê Times e Usuários de todas, com um filtro de consultoria, só para olhar. Quem cria gestores, pessoas e times dentro da consultoria é o administrador dela (e os gestores).
- **E-mail que já tem acesso:**
  - na mesma consultoria: o sistema não cria outro acesso; oferece colocar essa pessoa nos times escolhidos;
  - em outra consultoria: recusa com uma mensagem genérica ("Não foi possível criar esse acesso com esse e-mail. Fale com o suporte."), sem dizer onde o e-mail está.
- **Quem o gestor vê em Usuários:** as pessoas dos times dele e as que ele mesmo criou (mesmo sem time ainda). O administrador vê todo mundo da consultoria.
- **Pessoa vê os próprios times** pelo banco (para o futuro), mas não tem os menus Times e Usuários.
- **Time = um gestor + uma lista de membros.** O gestor do time é um campo do time, não um membro. Marcar times ao criar alguém (de qualquer papel) sempre quer dizer **membro** desses times. Um gestor (ou o administrador) pode ser membro do time de outro gestor da mesma consultoria: ele vê esse time como membro, mas não mexe nele. Mexer no time (nome, membros) é só do gestor do time e do administrador da consultoria. Nos cartões, o rosto do gestor aparece primeiro e a contagem "N pessoas" soma gestor + membros.
- **Em "Novo acesso", times que aparecem para marcar:** para o gestor, só os times dele; para o administrador, todos os da consultoria.
- **Troca obrigatória da senha provisória vale em qualquer forma de entrar** (inclusive Google) e é garantida também no banco: enquanto a pessoa não troca, as regras de acesso das tabelas não liberam nada além do próprio perfil. Assim a senha que o gestor conhece deixa de valer.
- **Situação em Usuários:** "Convite pendente", "Senha provisória" (criada com senha e ainda não trocou) ou "Ativo".
- **Gestor olhando uma pessoa que também está em times de outros gestores:** ele vê só os times dele na linha dessa pessoa.
- **Convite:** vale pelo prazo padrão do Supabase; em Usuários, quem tem convite pendente ganha o botão **Reenviar convite**.
- **E-mails em português:** os modelos de convite e de "esqueci a senha" são traduzidos (no Supabase local pelo `config.toml`; na nuvem, os mesmos textos no painel).
- **Google barrado:** o cadastro aberto do Supabase fica desligado (`enable_signup = false`). Conferido no código do Supabase Auth: com isso, um Google com e-mail que já tem acesso é ligado à conta existente (inclusive convite ainda não aceito), e um Google com e-mail novo é recusado com o erro `signup_disabled`, que a tela traduz.
- **Dados de exemplo no local:** uma consultoria de exemplo com administrador, gestor e pessoas de teste, criada por um comando separado, só para o Docker local (nunca na nuvem).
- **Testes:** regras de acesso do banco testadas no próprio Postgres local (`supabase test db`), com atenção especial a uma consultoria não enxergar a outra; a função de criar acesso e as telas testadas de ponta a ponta no navegador local, inclusive com o e-mail chegando no Mailpit.
- **Google no local:** precisa de um "cliente OAuth" criado no Google Cloud (ID e segredo) e cadastrado no Supabase. Sem isso, o botão aparece e mostra uma mensagem clara de que o Google ainda não foi configurado. O passo a passo vai no README.
- **Versões fixas** em todos os pacotes (sem `^`).
- Nomes de tabelas, rotas e arquivos.
