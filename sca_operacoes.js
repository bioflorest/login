// ============================================================
//  SCA – Módulo Operações v1.0
//  Arquivo: sca_operacoes.js
//  Carregue APÓS sca_supabase.js
//
//  O que faz:
//  Gerenciamento de operações de crédito rural.
//  Inclui formatação de códigos, cálculo de parcelas,
//  CRUD de operações e vínculo com clientes.
// ============================================================

(function () {
'use strict';

/* ─────────────────────────────────────────────────────────────
   Utilitário: formata número para código com zeros à esquerda
   ex.: 1 → "01", 12 → "12"
───────────────────────────────────────────────────────────── */
function fmtCodigo(n) {
  const num = parseInt(n, 10);
  if (isNaN(num)) return String(n);
  return num < 10 ? '0' + num : String(num);
}

/* ─────────────────────────────────────────────────────────────
   Gera próximo código sequencial com base nos registros
   existentes no Supabase (não reutiliza códigos excluídos)
───────────────────────────────────────────────────────────── */
async function gerarProximoCodigo() {
  if (window.supa) {
    try {
      const { data } = await window.supa
        .from('clientes')
        .select('codigo')
        .order('codigo', { ascending: false })
        .limit(1);
      const ultimo = data && data[0] && data[0].codigo
        ? parseInt(data[0].codigo, 10)
        : 0;
      return fmtCodigo(isNaN(ultimo) ? 1 : ultimo + 1);
    } catch (e) {
      console.warn('[SCA-Clientes] gerarProximoCodigo Supabase:', e);
    }
  }
  // Fallback: usa array local
  const lista = window.clientes || [];
  const max = lista.reduce((m, c) => {
    const n = parseInt(c.codigo, 10);
    return isNaN(n) ? m : Math.max(m, n);
  }, 0);
  return fmtCodigo(max + 1);
}

/* ─────────────────────────────────────────────────────────────
   Verifica duplicidade de CPF excluindo o registro atual (id)
───────────────────────────────────────────────────────────── */
async function cpfJaCadastrado(cpf, idAtual) {
  const key = cpf.replace(/\D/g, '');
  if (!key) return false;
  if (window.supa) {
    try {
      let q = window.supa.from('clientes').select('id,nome').eq('id', key);
      const { data } = await q;
      if (data && data.length > 0) {
        // Se encontrou e NÃO é o registro sendo editado → duplicado
        if (!idAtual || data[0].id !== idAtual) return data[0];
      }
      return false;
    } catch (e) {
      console.warn('[SCA-Clientes] cpfJaCadastrado:', e);
    }
  }
  // Fallback array local
  const lista = window.clientes || [];
  const found = lista.find(c => (c.cpf||'').replace(/\D/g,'') === key && c.id !== idAtual);
  return found || false;
}

/* ─────────────────────────────────────────────────────────────
   Exibe mensagem de status no painel do cliente
───────────────────────────────────────────────────────────── */
function clSt(msg, tipo) {
  const el = document.getElementById('cl-status');
  if (!el) return;
  el.style.display = '';
  el.innerHTML = msg;
  const cores = {
    ok:   ['#d4edda','#155724','#c3e6cb'],
    err:  ['#f8d7da','#721c24','#f5c6cb'],
    info: ['#fff3cd','#856404','#ffc107'],
  };
  const [bg, color, border] = cores[tipo] || cores.info;
  el.style.background = bg;
  el.style.color      = color;
  el.style.border     = '1px solid ' + border;
  clearTimeout(el._timer);
  el._timer = setTimeout(() => { el.style.display = 'none'; }, 4000);
}

/* ─────────────────────────────────────────────────────────────
   NOVO CLIENTE – limpa campos e gera código sequencial
───────────────────────────────────────────────────────────── */
window.novoCliente = async function () {
  if (typeof syncClientes === 'function') syncClientes();
  window.clModoEdicao = true;
  window.clIdx = -1;
  if (typeof window.clIdx !== 'undefined') window.clIdx = -1;

  // Limpa campos visuais
  ['cl-codigo','cl-cpf','cl-nome','cl-data'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  const box = document.getElementById('cl-foto-box');
  if (box) box.innerHTML = '<span style="font-size:2.5rem;color:#888;">👤</span>';

  // Define hoje como data de cadastro
  const hoje = new Date().toISOString().split('T')[0];
  const dataEl = document.getElementById('cl-data');
  if (dataEl) dataEl.value = hoje;

  // Mostra carregando no código
  const codEl = document.getElementById('cl-codigo');
  if (codEl) codEl.value = '…';

  // Foca no CPF
  const cpfEl = document.getElementById('cl-cpf');
  if (cpfEl) cpfEl.focus();

  clSt('Novo cadastro iniciado. Preencha os campos e clique em 💾 Salvar.', 'info');

  // Gera próximo código (aguarda Supabase)
  const proximo = await gerarProximoCodigo();
  if (codEl) codEl.value = proximo;
};

/* ─────────────────────────────────────────────────────────────
   EDITAR CLIENTE – ativa modo edição sem alterar código
───────────────────────────────────────────────────────────── */
window.editarCliente = function () {
  if (typeof syncClientes === 'function') syncClientes();
  const idx = (typeof window.clIdx !== 'undefined') ? window.clIdx : -1;
  const lista = window.clientes || [];
  if (idx < 0 || idx >= lista.length) {
    clSt('❌ Nenhum cliente selecionado para editar.', 'err');
    return;
  }
  window.clModoEdicao = true;
  const nomeEl = document.getElementById('cl-nome');
  if (nomeEl) nomeEl.focus();
  clSt('✏️ Modo edição ativo. Altere os campos e clique em 💾 Salvar.', 'info');
};

/* ─────────────────────────────────────────────────────────────
   SALVAR CLIENTE – valida, detecta duplicidade de CPF, persiste
───────────────────────────────────────────────────────────── */
window.salvarCliente = async function () {
  if (typeof syncClientes === 'function') syncClientes();

  const codigoEl = document.getElementById('cl-codigo');
  const cpfEl    = document.getElementById('cl-cpf');
  const nomeEl   = document.getElementById('cl-nome');
  const dataEl   = document.getElementById('cl-data');

  const codigo = (codigoEl?.value || '').trim();
  const cpf    = (cpfEl?.value    || '').trim();
  const nome   = (nomeEl?.value   || '').trim();
  const data   = dataEl?.value    || '';

  // Validação campos obrigatórios
  if (!cpf) {
    clSt('❌ CPF é obrigatório!', 'err');
    cpfEl?.focus();
    return;
  }
  if (!nome) {
    clSt('❌ Nome do cliente é obrigatório!', 'err');
    nomeEl?.focus();
    return;
  }
  if (!codigo || codigo === '…') {
    clSt('⏳ Aguarde o código ser gerado…', 'info');
    return;
  }

  const key = cpf.replace(/\D/g, '');
  const lista = window.clientes || [];
  const idx   = (typeof window.clIdx !== 'undefined') ? window.clIdx : -1;
  const clAtual = idx >= 0 ? lista[idx] : null;
  const idAtual = clAtual?.id || null;

  clSt('⏳ Verificando dados…', 'info');

  // Verifica duplicidade de CPF
  const duplicado = await cpfJaCadastrado(cpf, idAtual);
  if (duplicado) {
    clSt(`❌ CPF já cadastrado para: <b>${duplicado.nome || 'outro cliente'}</b>`, 'err');
    cpfEl?.focus();
    return;
  }

  clSt('⏳ Salvando…', 'info');

  // Monta objeto
  let cl = clAtual ? { ...clAtual } : {};
  if (!cl.id || !String(cl.id).includes('-')) cl.id = null;
  cl.codigo = fmtCodigo(codigo);
  cl.cpf    = cpf;
  cl.nome   = nome;
  cl.data_cadastro = data || null;

  if (idx < 0) {
    lista.push(cl);
    const novoIdx = lista.length - 1;
    window.clIdx = novoIdx;
    if (typeof window !== 'undefined') window.clIdx = novoIdx;
  } else {
    lista[idx] = cl;
  }
  window.clientes = lista;
  window.clModoEdicao = false;

  // Persiste no Supabase
  if (window.supa) {
    try {
      const payload = {
        codigo: cl.codigo,
        cpf:    cpf,
        nome:   nome,
        data_cadastro: data || null,
        // foto removido — salvo no Storage
        valor_total_receitas: cl.valor_total_receitas || 0,
        status_processo: cl.status_processo || null,
        status_obs:      cl.status_obs      || null,
      };
      let clienteSalvo;
      if (cl.id && String(cl.id).includes('-')) {
        const { data: upd, error } = await window.supa.from('clientes').update(payload).eq('id', cl.id).select().single();
        if (error) throw error;
        clienteSalvo = upd;
      } else {
        const { data: ins, error } = await window.supa.from('clientes').insert(payload).select().single();
        if (error) throw error;
        clienteSalvo = ins;
      }
      cl.id = clienteSalvo.id;
      lista[window.clIdx >= 0 ? window.clIdx : lista.length - 1] = { ...cl, ...clienteSalvo };
      window.clientes = lista;
      clSt('✅ Cliente salvo com sucesso!', 'ok');
      if (typeof registrarLog === 'function')
        registrarLog(idx < 0 ? '➕' : '✏️', 'Cliente salvo: ' + nome, nome);
    } catch (e) {
      clSt('❌ Erro ao salvar: ' + (e.message || e), 'err');
      console.error('[SCA-Clientes] salvarCliente:', e);
      return;
    }
  } else {
    clSt('✅ Salvo localmente (Supabase indisponível).', 'info');
  }

  if (typeof atualizarDropdownElaboracao === 'function') atualizarDropdownElaboracao();
  if (typeof renderizarDashboard === 'function') renderizarDashboard();
  if (typeof exibirCliente === 'function') exibirCliente(window.clIdx);
};

/* ─────────────────────────────────────────────────────────────
   EXCLUIR CLIENTE – confirmação obrigatória, sem reorganizar códigos
───────────────────────────────────────────────────────────── */
window.excluirCliente = async function () {
  if (typeof syncClientes === 'function') syncClientes();
  const lista = window.clientes || [];
  const idx   = (typeof window.clIdx !== 'undefined') ? window.clIdx : -1;

  if (idx < 0 || idx >= lista.length) {
    clSt('❌ Nenhum cliente selecionado para excluir.', 'err');
    return;
  }

  const cl   = lista[idx];
  const nome = cl.nome || '(sem nome)';
  const cod  = cl.codigo || idx + 1;

  const confirmado = confirm(
    `⚠️ Excluir o cliente Nº ${cod} — "${nome}"?\n\nEsta ação não pode ser desfeita.`
  );
  if (!confirmado) return;

  // Remove do Supabase
  if (cl.id && window.supa) {
    try {
      const { error } = await window.supa
        .from('clientes')
        .delete()
        .eq('id', cl.id);
      if (error) throw error;
    } catch (e) {
      clSt('❌ Erro ao excluir do banco: ' + (e.message || e), 'err');
      console.error('[SCA-Clientes] excluirCliente:', e);
      return;
    }
  }

  // Remove do array local
  lista.splice(idx, 1);
  window.clientes = lista;
  const novoIdx = lista.length > 0 ? Math.min(idx, lista.length - 1) : -1;
  window.clIdx = novoIdx;
  if (typeof window.clIdx !== 'undefined') window.clIdx = novoIdx;

  if (typeof registrarLog === 'function')
    registrarLog('🗑️', 'Cliente excluído: ' + nome, nome);
  if (typeof atualizarDropdownElaboracao === 'function') atualizarDropdownElaboracao();
  if (typeof renderizarDashboard === 'function') renderizarDashboard();
  if (typeof exibirCliente === 'function') exibirCliente(novoIdx);

  clSt(`🗑️ Cliente "${nome}" excluído.`, 'info');
};

/* ─────────────────────────────────────────────────────────────
   NAVEGAR ENTRE CLIENTES – respeita ordem do código
───────────────────────────────────────────────────────────── */
window.navCliente = function (dir) {
  if (typeof syncClientes === 'function') syncClientes();
  const lista = (window.clientes && window.clientes.length > 0)
    ? window.clientes
    : (typeof clientes !== 'undefined' ? clientes : []);

  if (lista.length === 0) {
    clSt('Nenhum cliente cadastrado.', 'info');
    return;
  }

  // Ordena por código numérico para navegação correta
  const ordenada = lista
    .map((c, i) => ({ ...c, _origIdx: i }))
    .sort((a, b) => (parseInt(a.codigo, 10) || 0) - (parseInt(b.codigo, 10) || 0));

  let curIdx = (typeof window.clIdx !== 'undefined') ? window.clIdx : 0;

  // Encontra posição na lista ordenada
  let posOrdenada = ordenada.findIndex(c => c._origIdx === curIdx);
  if (posOrdenada < 0) posOrdenada = 0;

  if (dir === 'first') posOrdenada = 0;
  else if (dir === 'last')  posOrdenada = ordenada.length - 1;
  else if (dir === 'prev')  posOrdenada = Math.max(0, posOrdenada - 1);
  else if (dir === 'next')  posOrdenada = Math.min(ordenada.length - 1, posOrdenada + 1);

  const alvo     = ordenada[posOrdenada];
  const novoIdx  = alvo._origIdx;

  window.clIdx = novoIdx;
  if (typeof window !== 'undefined') window.clIdx = novoIdx;

  if (typeof exibirCliente === 'function') exibirCliente(novoIdx);
};

/* ─────────────────────────────────────────────────────────────
   CANCELAR EDIÇÃO
───────────────────────────────────────────────────────────── */
window.cancelarCliente = function () {
  window.clModoEdicao = false;
  const idx = (typeof window.clIdx !== 'undefined') ? window.clIdx : -1;
  if (idx >= 0) {
    if (typeof exibirCliente === 'function') exibirCliente(idx);
    clSt('Edição cancelada.', 'info');
  } else {
    ['cl-codigo','cl-cpf','cl-nome','cl-data'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = '';
    });
    const box = document.getElementById('cl-foto-box');
    if (box) box.innerHTML = '<span style="font-size:2.5rem;color:#888;">👤</span>';
  }
};

/* ─────────────────────────────────────────────────────────────
   Formata código ao exibir cliente (garante "01", "02"…)
───────────────────────────────────────────────────────────── */
const _exibirClienteOrig = window.exibirCliente;
window.exibirCliente = function (i) {
  if (typeof _exibirClienteOrig === 'function') _exibirClienteOrig(i);
  // Após exibição, garante formatação do código
  const lista = window.clientes || [];
  if (i >= 0 && lista[i]) {
    const codEl = document.getElementById('cl-codigo');
    if (codEl && lista[i].codigo) {
      codEl.value = fmtCodigo(lista[i].codigo);
    }
  }
};

console.log('[SCA-Clientes] Módulo de cadastro de clientes aprimorado carregado.');
})();
