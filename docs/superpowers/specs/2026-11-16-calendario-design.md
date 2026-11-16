# Calendário integrado ao Google — design (rascunho)

Data: 2026-11-16. Projeto: `~/Documents/consultoria`. Branch: `feat/clientes` (PR #2).
Rascunho: junta o que o Diego já pediu; vira design completo depois do padrão Hub.

## Pedido do Diego

- "Crie um menu de calendário, ele vai ser integrado com Google e vai gerar a possibilidade de gerar Meet, a gravação
  e a transcrição. Quero que seja criada uma nova pasta dentro do cliente com a documentação tanto da call quanto do
  arquivo de transcrição."
- "Quero um calendário que será compartilhado de forma idêntica ao calendário do Mac."
- "A agenda vai ter uma visão privada para cada consultor e uma visão para a gestora ver a agenda de todos os
  consultores." (16/11)
- Delegou as decisões ("pode fazer tudo o que depende de mim").

## Quem vê o quê (segue a hierarquia central → consultorias)

- **Consultor:** visão privada, só a própria agenda.
- **Gestora/administrador da consultoria:** a agenda de todos os consultores da consultoria, um calendário por pessoa
  (cor própria, liga/desliga na lateral, como no Calendário do Mac).
- **Central e administrador geral:** todas as consultorias (escolhe a consultoria e as pessoas na lateral).
- Leitura de minha parte: consultor não vê a agenda dos colegas. Recorte no banco (RLS), como clientes e check-ins.

## Já decidido por mim (delegado)

- Cada consultor conecta a própria conta Google (organizador = consultor; gravação e transcrição ficam no Drive dele).
  Exige Google Workspace com gravação/transcrição do Meet e escopos restritos (Calendar, Meet, Drive) — avisar o Diego.
- Menu Calendário com visões Dia, Semana, Mês e Ano; lateral com os calendários das pessoas, cores e liga/desliga.
- Reunião criada no app vira evento no Google com Meet; aparece também na aba Agenda do cliente.
- Depois da reunião: buscar gravação e transcrição e criar uma pasta da reunião nos Arquivos do cliente (precisa de
  pastas em `cliente_arquivos`), com a transcrição e a documentação da call (resumo pela integração de IA da
  consultoria).
