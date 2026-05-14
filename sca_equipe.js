// ============================================================
//  SCA – Módulo Equipe v1.0
//  Arquivo: sca_equipe.js
//  Carregue APÓS sca_supabase.js
//
//  O que faz:
//  Gerenciamento de membros da equipe técnica.
//  Funções: salvarMembro(), deletarMembro(), renderizarEquipe().
//  Persiste dados na tabela equipe do Supabase.
// ============================================================

(function() {
'use strict';

// --- SALVAR MEMBRO ---
window.salvarMembro = async function() {
  const msg = document.getElementById('equipe-msg');
  function _m(txt, ok) {
    msg.innerHTML = txt;
    msg.style.background = ok ? '#d4edda' : '#f8d7da';
    msg.style.color      = ok ? '#155724' : '#721c24';
    msg.style.display = 'block';
  }
  const nome = (document.getElementById('mem-nome').value || '').trim();
  if (!nome) { _m('❌ Nome completo é obrigatório.', false); return; }
  if (!window.supa) { _m('❌ Conexão com banco indisponível.', false); return; }
  const supaId = (document.getElementById('mem-id').value || '').trim();
  const payload = {
    nome:            nome,
    cpf:             (document.getElementById('mem-cpf').value  || '').trim() || null,
    data_nascimento: (document.getElementById('mem-nasc').value || '').trim() || null,
    cargo:           (document.getElementById('mem-cargo').value|| '').trim() || null,
    crea_cfb:        (document.getElementById('mem-crea').value || '').trim() || null,
    celular:         (document.getElementById('mem-cel').value  || '').trim() || null,
    email:           (document.getElementById('mem-email').value|| '').trim() || null,
  };
  console.log('[salvarMembro] payload:', JSON.stringify(payload), '| id:', supaId);
  try {
    let res;
    if (supaId) {
      res = await window.supa.from('equipe').update(payload).eq('id', supaId).select();
    } else {
      res = await window.supa.from('equipe').insert(payload).select();
    }
    if (res.error) throw new Error(res.error.message + (res.error.details ? ' | ' + res.error.details : ''));
    console.log('[salvarMembro] sucesso:', JSON.stringify(res.data));
    const { data: lista, error: errLer } = await window.supa.from('equipe').select('*').order('nome');
    if (errLer) throw new Error('Salvo, mas erro ao recarregar: ' + errLer.message);
    window.equipe = lista || [];
    window._scaCache = window._scaCache || {};
    window._scaCache.equipe = window.equipe;
    if (typeof renderizarEquipe === 'function') renderizarEquipe();
    if (typeof cancelarMembro === 'function') cancelarMembro();
    _m('✅ Membro salvo com sucesso!', true);
    setTimeout(function() { msg.style.display = 'none'; }, 3500);
  } catch(e) {
    _m('❌ Erro: ' + e.message, false);
    console.error('[salvarMembro] erro:', e);
  }
};

// --- EDITAR MEMBRO ---
window.editarMembro = function(i) {
  const equipeArr = window._scaCache && window._scaCache.equipe && window._scaCache.equipe.length
    ? window._scaCache.equipe
    : (typeof equipe !== 'undefined' ? equipe : []);
  const m = equipeArr[i];
  if (!m) { alert('Membro não encontrado.'); return; }
  console.log('[editarMembro] membro[' + i + ']:', JSON.stringify(m));
  document.getElementById('equipe-form').style.display = 'block';
  document.getElementById('equipe-form-titulo').textContent = '✏️ Editar Membro';
  document.getElementById('mem-id').value    = m.id              || '';
  document.getElementById('mem-nome').value  = m.nome            || '';
  document.getElementById('mem-cpf').value   = m.cpf             || '';
  document.getElementById('mem-nasc').value  = m.data_nascimento || '';
  document.getElementById('mem-crea').value  = m.crea_cfb        || '';
  document.getElementById('mem-cel').value   = m.celular         || '';
  document.getElementById('mem-email').value = m.email           || '';
  // Selecionar cargo com normalização NFC para lidar com diferenças de encoding
  var sel = document.getElementById('mem-cargo');
  var cargo = (m.cargo || '').normalize('NFC').trim();
  sel.value = '';
  var found = false;
  Array.from(sel.options).forEach(function(opt) {
    var ov = (opt.value || '').normalize('NFC').trim();
    var ot = (opt.text  || '').normalize('NFC').trim();
    if (ov === cargo || ot === cargo) { sel.value = opt.value; found = true; }
  });
  if (!found && cargo) {
    console.warn('[editarMembro] cargo "' + cargo + '" não encontrado — inserindo como opção temporária');
    var tmp = document.createElement('option');
    tmp.value = cargo;
    tmp.text  = cargo;
    tmp.setAttribute('data-temp', '1');
    sel.insertBefore(tmp, sel.options[1] || null);
    sel.value = cargo;
  }
  document.getElementById('equipe-form').scrollIntoView({ behavior: 'smooth' });
};

// --- MOSTRAR FORM NOVO MEMBRO ---
var _origMostrarFormMembro = window.mostrarFormMembro;
window.mostrarFormMembro = function() {
  // Remove opções temporárias de cargo inseridas por edições anteriores
  var sel = document.getElementById('mem-cargo');
  Array.from(sel.options).forEach(function(opt) {
    if (opt.getAttribute('data-temp')) sel.removeChild(opt);
  });
  if (typeof _origMostrarFormMembro === 'function') _origMostrarFormMembro();
};

console.log('[SCA-Equipe] funções salvarMembro e editarMembro redefinidas com colunas corretas.');
})();
