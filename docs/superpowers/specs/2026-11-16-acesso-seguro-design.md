# Acesso seguro: verificação em duas etapas e senha forte — design

Data: 2026-11-16. Projeto: `~/Documents/consultoria`. Branch: `feat/clientes` (PR #2).

## Pedido do Diego

- "Dentro de Acesso, ative o duplo fator de autenticação." (16/11, 22:08)
- "E o campo senha: coloque um campo de senha e um botão de validar senha forte ou fraca e um gerador de senha."
  (16/11, 22:09)
- Referência: a aba Acesso da janela de pessoa do Hub (`.superpowers/sdd/avulsos/ficha-hub-inventario.md`: cartões
  com chave "Exigir verificação em duas etapas", "Zerar verificação em duas etapas", campo de senha com Gerar/Copiar e
  barra de força). Decisões delegadas, marcadas **(minha)**.

## Verificação em duas etapas (app autenticador, TOTP)

- **Na aba Acesso da ficha** (quem pode editar o acesso da pessoa — mesma regra de hoje):
  - cartão com chave **"Exigir verificação em duas etapas"** (guarda `perfis.exige_2fa`);
  - situação: "Ativa desde dd/mm" / "Ainda não configurada" / "Desligada";
  - **"Zerar verificação em duas etapas"** (celular perdido): apaga os fatores da pessoa e encerra as sessões dela em
    todos os aparelhos (confirmação com o botão de perigo dizendo que ela sai de todos os aparelhos e, conforme a
    chave "Exigir" como está na ficha, que vai configurar de novo no próximo acesso ou entrar só com a senha).
- **Em Meu perfil**: a própria pessoa **ativa** (QR code + chave para copiar + código de 6 dígitos para confirmar) ou
  **desativa** (pede um código atual; se a verificação for exigida, não deixa desativar).
- **Entrar**: depois da senha (ou do Google), quem tem a verificação ativa vê "Digite o código do seu app autenticador"
  (6 dígitos). Quem tem `exige_2fa` e ainda não configurou passa pela tela de configurar antes de entrar no app.
- **No banco (minha)**: a sessão só vale por inteiro com o nível `aal2` quando a pessoa tem verificação ativa ou
  exigida — `private.liberado()` (usado pelas regras de acesso e funções) passa a exigir isso, e as Edge Functions
  (`quemChama`) também. Assim, sem o código, nada é lido nem gravado além do que é da própria pessoa: ela lê o
  próprio perfil (é assim que a tela sabe que falta o código), as próprias ausências e lê e grava as próprias
  preferências (tema). Se o token traz `session_id`, a sessão precisa existir no Auth (para todos) e, para quem
  precisa do código, ser `aal2` também lá: depois do Zerar (ou do Sair), o token antigo para de valer na hora.
- Supabase: ligar TOTP (`[auth.mfa.totp] enroll_enabled/verify_enabled = true` no `config.toml`; na nuvem, no painel do
  Supabase — README). SMS fica de fora.
- **(minha)** Sem códigos de recuperação nesta entrega: quem perder o celular pede a quem administra para "Zerar".

## Senha forte e gerador

Componente `CampoSenha` (em `src/components/campos/`), usado em "Definir senha provisória" (ficha → Acesso, pessoa
nova), em Meu perfil (trocar senha) e na tela de nova senha do primeiro acesso:
- mostrar/ocultar; **medidor de força ao vivo** (Fraca / Média / Forte, barra com cor) e a **lista de regras** com
  check: pelo menos 10 caracteres **(minha; hoje o mínimo é 8)**, letra maiúscula, letra minúscula, número, símbolo;
  botão **"Validar"** que diz em uma frase se a senha é forte ou o que falta **(pedido do Diego)**;
- **"Gerar senha"**: 16 caracteres com todos os tipos (`crypto.getRandomValues`), já preenche e mostra; **"Copiar"**;
- só deixa salvar senha **Forte** **(minha)**; o servidor também recusa senha fraca (política de senha do Supabase:
  tamanho mínimo e tipos de caractere no `config.toml`; Edge Function que define senha confere de novo).

## Testes

- pgTAP: com `exige_2fa` e sessão `aal1`, `liberado()` é falso e as leituras somem; com `aal2`, voltam; sem 2FA, nada
  muda para ninguém.
- Integração: Edge Function recusa sessão `aal1` de quem precisa de `aal2`; "Zerar" só para quem pode.
- Tela: chave "Exigir", situação, "Zerar" com confirmação; Meu perfil ativar/desativar; tela do código no entrar;
  `CampoSenha` (força, regras, Validar, Gerar, Copiar, bloqueio de senha fraca).

## Fora desta entrega

SMS, chave de segurança física (WebAuthn), códigos de recuperação, "lembrar este aparelho".
