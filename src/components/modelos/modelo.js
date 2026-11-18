// O rascunho do editor de modelos de check-in: nada vai ao banco antes de Salvar, e Cancelar descarta tudo. As funções
// daqui são puras (devolvem um rascunho novo; o que não mudou continua o mesmo objeto, para o editor não redesenhar as
// 500 tarefas a cada letra) e seguem as regras e os limites do salvar_modelo
// (supabase/migrations/20261117172026_modelos_salvar_ao_criar.sql), para o erro aparecer antes de ir ao banco.
//
// Rascunho: { nome, descricao, tipo ('' = nenhum), para ('todas' | id da consultoria | '' = "uma", sem escolher),
//   etapas: [{ id, nome, tarefas: [{ id, titulo, descricao, obrigatoria, prazo_dias (texto, como o CampoNumero),
//   depende_de: [id] }] }] }.
// Os ids das etapas e das tarefas só valem dentro do rascunho: o banco cria ids novos a cada Salvar (a tarefa vai com
// o id como "chave", e o "depende de" aponta para as chaves).

export const LIMITES = {
  etapas: 50, tarefas: 500, dependencias: 30, nome: 80, descricao: 400, etapa: 60, titulo: 80, descricaoDaTarefa: 160,
  prazo: 365,
}

let sequencia = 0
const novoId = (prefixo) => `${prefixo}-novo-${(sequencia += 1)}`

export function novaTarefa(prazo = 7) {
  return { id: novoId('t'), titulo: '', descricao: '', obrigatoria: true, prazo_dias: String(prazo), depende_de: [] }
}

// Modelo novo: uma etapa "Diagnóstico" com uma tarefa em branco.
export function rascunhoNovo(para = 'todas') {
  return { nome: '', descricao: '', tipo: '', para, etapas: [{ id: novoId('e'), nome: 'Diagnóstico', tarefas: [novaTarefa(2)] }] }
}

// O modelo do banco (modelo_completo) no formato do editor. Duplicar: "Cópia de X" (o banco cria o modelo novo).
export function rascunhoDe(modelo, { duplicar = false } = {}) {
  return {
    nome: duplicar ? `Cópia de ${modelo.nome}`.slice(0, LIMITES.nome) : modelo.nome,
    descricao: modelo.descricao ?? '',
    tipo: modelo.tipo ?? '',
    para: modelo.consultoria?.id ?? 'todas',
    etapas: modelo.etapas.map((e) => ({
      id: e.id,
      nome: e.nome,
      tarefas: e.tarefas.map((t) => ({
        id: t.id, titulo: t.titulo, descricao: t.descricao ?? '', obrigatoria: t.obrigatoria, prazo_dias: String(t.prazo_dias),
        depende_de: [...(t.depende_de ?? [])],
      })),
    })),
  }
}

// As tarefas na ordem do modelo inteiro (etapa por etapa), com a etapa e o número de cada uma.
export function tarefasEmOrdem(rascunho) {
  const lista = []
  for (const e of rascunho.etapas) for (const t of e.tarefas) lista.push({ ...t, etapa_id: e.id, ordem: lista.length + 1 })
  return lista
}

// id da tarefa → número dela no modelo inteiro (1..n).
export function ordemGlobal(rascunho) {
  const ordem = new Map()
  for (const e of rascunho.etapas) for (const t of e.tarefas) ordem.set(t.id, ordem.size + 1)
  return ordem
}

// Prazo "dia N": inteiro de 0 a 365, escrito só com algarismos.
export const prazoValido = (texto) => /^\d+$/.test(String(texto ?? '').trim()) && Number(texto) <= LIMITES.prazo

const nomeDaTarefa = (t) => t.titulo?.trim() || 'Sem título'

// { msg (o primeiro problema, para o rodapé; null = pode salvar), nome, para (as marcas dos campos da esquerda),
// etapas, tarefas (ids com problema) }.
export function validarModelo(rascunho) {
  const erros = { msg: null, nome: false, para: false, etapas: new Set(), tarefas: new Set() }
  const avisar = (texto) => { erros.msg ??= texto }
  const todas = tarefasEmOrdem(rascunho)
  const ordem = new Map(todas.map((t) => [t.id, t.ordem]))
  const porId = new Map(todas.map((t) => [t.id, t]))

  const nome = rascunho.nome.trim()
  if (nome.length < 2) { erros.nome = true; avisar('Dê um nome ao modelo, com pelo menos 2 letras.') }
  if (nome.length > LIMITES.nome) { erros.nome = true; avisar(`O nome do modelo vai até ${LIMITES.nome} letras.`) }
  if (rascunho.descricao.trim().length > LIMITES.descricao) avisar(`A descrição do modelo vai até ${LIMITES.descricao} letras.`)
  if (!rascunho.para) { erros.para = true; avisar('Escolha para qual consultoria é o modelo.') }
  if (rascunho.etapas.length > LIMITES.etapas || todas.length > LIMITES.tarefas) {
    avisar(`O modelo passou do limite: até ${LIMITES.etapas} etapas e ${LIMITES.tarefas} tarefas.`)
  }
  if (!todas.length) avisar('O modelo precisa de pelo menos uma tarefa.')

  for (const e of rascunho.etapas) {
    if (!e.nome.trim()) { erros.etapas.add(e.id); avisar('Dê um nome a cada etapa.') }
    if (e.nome.trim().length > LIMITES.etapa) { erros.etapas.add(e.id); avisar(`O nome da etapa vai até ${LIMITES.etapa} letras.`) }
  }
  for (const e of rascunho.etapas) {
    if (!e.tarefas.length) {
      erros.etapas.add(e.id)
      avisar(`A etapa "${e.nome.trim() || 'sem nome'}" está sem tarefas: acrescente uma tarefa ou apague a etapa.`)
    }
  }

  const marcar = (t, texto) => { erros.tarefas.add(t.id); avisar(texto) }
  for (const t of todas) if (!t.titulo.trim()) marcar(t, 'Dê um título a cada tarefa.')
  for (const t of todas) if (t.titulo.trim().length > LIMITES.titulo) marcar(t, `O título da tarefa vai até ${LIMITES.titulo} letras.`)
  for (const t of todas) {
    if (t.descricao.trim().length > LIMITES.descricaoDaTarefa) marcar(t, `A descrição da tarefa vai até ${LIMITES.descricaoDaTarefa} letras.`)
  }
  for (const t of todas) if (!prazoValido(t.prazo_dias)) marcar(t, `O prazo de cada tarefa vai do dia 0 ao dia ${LIMITES.prazo}.`)
  for (const t of todas) {
    if (new Set(t.depende_de).size > LIMITES.dependencias) marcar(t, `Cada tarefa depende de no máximo ${LIMITES.dependencias} outras.`)
  }
  // Sem ciclo: a dependência só aponta para tarefa que vem antes na lista (a mesma regra do banco).
  for (const t of todas) {
    for (const d of t.depende_de) {
      if (!porId.has(d)) {
        marcar(t, `"${nomeDaTarefa(t)}" depende de uma tarefa que não está mais no modelo. Tire a dependência.`)
      } else if (d === t.id) {
        marcar(t, `"${nomeDaTarefa(t)}" não pode depender dela mesma. Tire a dependência.`)
      } else if (ordem.get(d) >= t.ordem) {
        marcar(t, `"${nomeDaTarefa(t)}" depende de "${nomeDaTarefa(porId.get(d))}", que vem depois. Mova uma das duas ou tire a dependência.`)
      }
    }
  }
  return erros
}

// O p_dados do salvar_modelo: { nome, descricao, tipo, para, etapas: [{ nome, tarefas: [{ chave, titulo, descricao,
// obrigatoria, prazo_dias, depende_de: [chave] }] }] }. Texto aparado; vazio vira nulo.
export function paraSalvar(rascunho) {
  const texto = (v) => v.trim() || null
  const dados = {
    nome: rascunho.nome.trim(),
    descricao: texto(rascunho.descricao),
    tipo: rascunho.tipo || null,
    etapas: rascunho.etapas.map((e) => ({
      nome: e.nome.trim(),
      tarefas: e.tarefas.map((t) => ({
        chave: t.id, titulo: t.titulo.trim(), descricao: texto(t.descricao), obrigatoria: t.obrigatoria,
        prazo_dias: Number(String(t.prazo_dias).trim()), depende_de: [...new Set(t.depende_de)],
      })),
    })),
  }
  return rascunho.para ? { ...dados, para: rascunho.para } : dados
}

// ── Mudanças (cada uma devolve um rascunho novo) ──

const comEtapas = (rascunho, etapas) => ({ ...rascunho, etapas })

export function mudarEtapa(rascunho, id, mudancas) {
  return comEtapas(rascunho, rascunho.etapas.map((e) => (e.id === id ? { ...e, ...mudancas } : e)))
}

export function mudarTarefa(rascunho, id, mudancas) {
  return comEtapas(rascunho, rascunho.etapas.map((e) => (
    e.tarefas.some((t) => t.id === id)
      ? { ...e, tarefas: e.tarefas.map((t) => (t.id === id ? { ...t, ...mudancas } : t)) }
      : e
  )))
}

// Sobe (-1) ou desce (1) uma posição; a primeira da etapa sobe para o fim da etapa de cima e a última desce para o
// começo da de baixo. A primeira do modelo não sobe e a última não desce.
export function moverTarefa(rascunho, id, direcao) {
  const ei = rascunho.etapas.findIndex((e) => e.tarefas.some((t) => t.id === id))
  if (ei < 0) return rascunho
  const etapas = rascunho.etapas.map((e) => ({ ...e, tarefas: [...e.tarefas] }))
  const daEtapa = etapas[ei].tarefas
  const ti = daEtapa.findIndex((t) => t.id === id)
  const [tarefa] = daEtapa.splice(ti, 1)
  if (direcao < 0) {
    if (ti > 0) daEtapa.splice(ti - 1, 0, tarefa)
    else if (ei > 0) etapas[ei - 1].tarefas.push(tarefa)
    else return rascunho
  } else if (ti < daEtapa.length) daEtapa.splice(ti + 1, 0, tarefa)
  else if (ei < etapas.length - 1) etapas[ei + 1].tarefas.unshift(tarefa)
  else return rascunho
  // Só as etapas que mudaram ganham objeto novo.
  const mudou = (i) => i === ei || (i === ei + direcao && etapas[i].tarefas.length !== rascunho.etapas[i].tarefas.length)
  return comEtapas(rascunho, etapas.map((e, i) => (mudou(i) ? e : rascunho.etapas[i])))
}

export function moverEtapa(rascunho, id, direcao) {
  const i = rascunho.etapas.findIndex((e) => e.id === id)
  const j = i + direcao
  if (i < 0 || j < 0 || j >= rascunho.etapas.length) return rascunho
  const etapas = [...rascunho.etapas]
  ;[etapas[i], etapas[j]] = [etapas[j], etapas[i]]
  return comEtapas(rascunho, etapas)
}

// Tira as tarefas e as dependências para elas.
export function tirarTarefas(rascunho, ids) {
  const fora = new Set(ids)
  return comEtapas(rascunho, rascunho.etapas.map((e) => {
    const mexe = e.tarefas.some((t) => fora.has(t.id) || t.depende_de.some((d) => fora.has(d)))
    if (!mexe) return e
    return {
      ...e,
      tarefas: e.tarefas.filter((t) => !fora.has(t.id)).map((t) => (
        t.depende_de.some((d) => fora.has(d)) ? { ...t, depende_de: t.depende_de.filter((d) => !fora.has(d)) } : t
      )),
    }
  }))
}

// Apaga a etapa com as tarefas dela (e as dependências para elas).
export function tirarEtapa(rascunho, id) {
  const etapa = rascunho.etapas.find((e) => e.id === id)
  if (!etapa) return rascunho
  const sem = tirarTarefas(rascunho, etapa.tarefas.map((t) => t.id))
  return comEtapas(sem, sem.etapas.filter((e) => e.id !== id))
}

// Tarefa nova no fim da etapa, com o prazo da última dela (ou 7). { rascunho, id }.
export function acrescentarTarefa(rascunho, etapaId) {
  const etapa = rascunho.etapas.find((e) => e.id === etapaId)
  const tarefa = novaTarefa(prazoValido(etapa?.tarefas.at(-1)?.prazo_dias) ? Number(etapa.tarefas.at(-1).prazo_dias) : 7)
  return {
    rascunho: comEtapas(rascunho, rascunho.etapas.map((e) => (e.id === etapaId ? { ...e, tarefas: [...e.tarefas, tarefa] } : e))),
    id: tarefa.id,
  }
}

// Etapa nova no fim, sem nome, com uma tarefa no maior prazo do modelo (pelo menos 7). { rascunho, id }.
export function acrescentarEtapa(rascunho) {
  const prazos = tarefasEmOrdem(rascunho).filter((t) => prazoValido(t.prazo_dias)).map((t) => Number(t.prazo_dias))
  const etapa = { id: novoId('e'), nome: '', tarefas: [novaTarefa(Math.max(7, ...prazos))] }
  return { rascunho: comEtapas(rascunho, [...rascunho.etapas, etapa]), id: etapa.id }
}

// Põe ou tira "id depende de dep".
export function alternarDependencia(rascunho, id, dep) {
  const tarefa = tarefasEmOrdem(rascunho).find((t) => t.id === id)
  if (!tarefa) return rascunho
  const depende_de = tarefa.depende_de.includes(dep) ? tarefa.depende_de.filter((d) => d !== dep) : [...tarefa.depende_de, dep]
  return mudarTarefa(rascunho, id, { depende_de })
}

// As tarefas que dependem desta (perdem a dependência se ela sair).
export const dependentesDe = (rascunho, id) => tarefasEmOrdem(rascunho).filter((t) => t.depende_de.includes(id))

export function resumoDoRascunho(rascunho) {
  const todas = tarefasEmOrdem(rascunho)
  const obrigatorias = todas.filter((t) => t.obrigatoria).length
  const prazos = todas.filter((t) => prazoValido(t.prazo_dias)).map((t) => Number(t.prazo_dias))
  return {
    etapas: rascunho.etapas.length, tarefas: todas.length, obrigatorias, opcionais: todas.length - obrigatorias,
    maiorPrazo: prazos.length ? Math.max(...prazos) : 0,
  }
}
