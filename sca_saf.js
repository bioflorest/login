// ============================================================
//  SCA – Módulo SAF v1.0
//  Arquivo: sca_saf.js
//  Carregue APÓS sca_supabase.js
//
//  O que faz:
//  Funções auxiliares do módulo SAF (Sistema Agroflorestal).
//  safUsarDadosCliente(): copia dados do cliente/proprietário
//  para os campos do formulário SAF.
// ============================================================

window.safUsarDadosCliente = function() {
  const g = id => document.getElementById(id)?.value || '';
  const s = (id, v) => { const el = document.getElementById(id); if (el && v) el.value = v; };

  // Produtor: nome do proprietário ou do cliente
  const nome = g('prop-prop-nome') || g('cl-nome') || '';
  // Propriedade: nome da propriedade (aba Dados Gerais)
  const propriedade = g('prop-ger-nome') || '';
  // Responsável Técnico: vem da aba Empresa
  const respTecnico = g('empresa-responsavel') || '';
  // CPF e RG
  const cpf = g('prop-prop-cpf') || g('cl-cpf') || '';
  const rg  = g('prop-prop-num-doc') || '';
  // Endereço
  const logr   = g('prop-prop-logr') || g('end-logradouro') || '';
  const num    = g('prop-prop-num')  || g('end-numero')     || '';
  const end    = logr + (num ? ', ' + num : '');
  const cidade = g('prop-prop-cidade') || g('end-cidade') || '';
  const cep    = g('prop-prop-cep')    || g('end-cep')    || '';

  if (!nome && !cpf) {
    safStatus('⚠️ Nenhum dado de proprietário encontrado. Preencha primeiro a aba Propriedades.', '#fff3cd', '#856404');
    return;
  }

  // Arranjo Espacial
  s('saf-ae-produtor',     nome);
  s('saf-ae-propriedade',  propriedade);
  s('saf-ae-resp-tecnico', respTecnico);
  // Dispara replicação automática (preenche Escala Temporal e Estimativa)
  const aeProdutor = document.getElementById('saf-ae-produtor');
  if (aeProdutor) aeProdutor.dispatchEvent(new Event('input'));

  // Escala Temporal (garante mesmo sem safAutoReplicar)
  s('saf-et-produtor',    nome);
  s('saf-et-propriedade', propriedade);
  s('saf-et-resp-tecnico', respTecnico);

  // Estimativa de Produção SAF
  s('saf-ep-produtor',    nome);
  s('saf-ep-propriedade', propriedade);
  s('saf-ep-resp-tecnico', respTecnico);

  // Fornecimento de Mudas
  s('saf-fm-produtor', nome);
  s('saf-fm-cpf',      cpf);
  s('saf-fm-rg',       rg);
  s('saf-fm-endereco', end);
  s('saf-fm-cidade',   cidade);
  s('saf-fm-cep',      cep);

  safStatus('✅ Dados do cliente preenchidos em todas as seções!', '#d4edda', '#155724');
};

window.safAutoReplicar = function() {
  const produtor    = document.getElementById('saf-ae-produtor').value;
  const propriedade = document.getElementById('saf-ae-propriedade').value;
  const respTecnico = document.getElementById('saf-ae-resp-tecnico').value;

  document.getElementById('saf-et-produtor').value     = produtor;
  document.getElementById('saf-et-propriedade').value  = propriedade;
  document.getElementById('saf-et-resp-tecnico').value = respTecnico;

  document.getElementById('saf-ep-produtor').value     = produtor;
  document.getElementById('saf-ep-propriedade').value  = propriedade;
  document.getElementById('saf-ep-resp-tecnico').value = respTecnico;

  document.getElementById('saf-fm-produtor').value     = produtor;
};

window.safSalvar = function() {
  const dados = {};
  document.querySelectorAll('[id^="saf-"]').forEach(el => {
    if (el.tagName === 'INPUT') dados[el.id] = el.value;
  });
  if (window.supa && window.clientes?.[window.clIdx]?.id) {
    const clienteId = window.clientes[window.clIdx].id;
    window.supa.from('saf').upsert({ cliente_id: clienteId, dados: dados }, { onConflict: 'cliente_id' }).then(({ error }) => {
      safStatus(error ? '❌ Erro: ' + error.message : '✅ SAF salvo!', error ? '#f8d7da' : '#d4edda', error ? '#721c24' : '#155724');
    });
  } else {
    safStatus('⚠️ Sem cliente selecionado ou sem conexão.', '#fff3cd', '#856404');
  }
};

window.safLimpar = function() {
  if (!confirm('Limpar todos os campos do formulário SAF?')) return;
  document.querySelectorAll('[id^="saf-"]').forEach(el => { if (el.tagName === 'INPUT') el.value = ''; });
  safStatus('🗑️ Formulário limpo.', '#f8d7da', '#721c24');
};

window.safStatus = function(msg, bg, color) {
  const el = document.getElementById('saf-status');
  el.style.cssText = `display:block;background:${bg};color:${color};`;
  el.textContent = msg;
  setTimeout(() => { el.style.display = 'none'; }, 3000);
};

window.safCarregar = function(clienteId) {
  if (!window.supa || !clienteId) return;
  window.supa.from('saf').select('dados').eq('cliente_id', clienteId).maybeSingle().then(({ data, error }) => {
    if (error || !data || !data.dados) return;
    const dados = data.dados;
    Object.entries(dados).forEach(([id, val]) => {
      const el = document.getElementById(id);
      if (el && el.tagName === 'INPUT') el.value = val || '';
    });
  });
};

window.mascararCEP = function(el) {
  let v = el.value.replace(/\D/g, '').slice(0, 8);
  if (v.length > 5) v = v.slice(0,5) + '-' + v.slice(5);
  el.value = v;
};
