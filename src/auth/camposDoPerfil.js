// O que o app lê do perfil de quem entrou (AuthProvider), num módulo sem React para o teste de integração ler igual
// (tests/integracao/perfilDoLogin.test.js): uma embutida ambígua no PostgREST (HTTP 300) derruba o login de todos.
export const CAMPOS_PERFIL =
  'id, nome, email, foto, cor, papel, consultoria_id, precisa_trocar_senha, exige_2fa, verificacao_desde, telefone, cidade, uf, cargo, data_entrada, tipos_de_consultoria, carga_semanal, consultoria:consultorias(nome, logo), preferencias(tema)'
// O que pode mudar com a sessão aberta (quem administra exige a verificação ou zera o app): conferido de novo a cada
// tela, ao voltar para a aba e quando algo é recusado. A própria pessoa sempre lê o próprio perfil, mesmo com aal1.
export const CAMPOS_DA_VERIFICACAO = 'exige_2fa, verificacao_desde'
