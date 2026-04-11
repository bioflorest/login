// ============================================================
//  SCA – Integração Supabase v2.1
//  Alinhado com: sca_tabelas_completo.sql + migrations v2/v3/v4
//                + Edge Function gerar-documento v2
//
//  MUDANÇAS v2.0:
//  ✅ gerarDocHTML() agora chama a Edge Function (servidor)
//  ✅ equipe.cargo corrigido para cargo_funcao
//  ✅ empresa.conselho e ddd_tel adicionados
//  ✅ conjuges: naturalidade, uf_nascimento, exposto_politicamente
//  ✅ propriedades: ger_uf e ger_municipio adicionados
//  ✅ renderizarEquipe() usa variáveis CSS do design system
//  ✅ Feedback visual unificado (sem alerts no fluxo normal)
//  ✅ carregarDadosClienteSupabase() inclui operacao_atual
//  ✅ Dashboard com cores do design system
//  ✅ Tratamento de erro uniforme com toast não-bloqueante
//
//  CORREÇÕES v2.1:
//  ✅ salvarParticipante sobrescreve versão antiga do index.html
//  ✅ Compatibilidade cliente_id text/uuid (cast automático)
//  ✅ SQL para criar tabelas com cliente_id text (não uuid)
// ============================================================

// ─── SQL PARA CORRIGIR cliente_id nas tabelas (rodar no Supabase) ────────────
// Se as tabelas foram criadas com cliente_id uuid, execute:
//
// ALTER TABLE arrendantes ALTER COLUMN cliente_id TYPE text USING cliente_id::text;
// ALTER TABLE conjuges ALTER COLUMN cliente_id TYPE text USING cliente_id::text;
// ALTER TABLE avalistas ALTER COLUMN cliente_id TYPE text USING cliente_id::text;
// ALTER TABLE participante_empresa ALTER COLUMN cliente_id TYPE text USING cliente_id::text;
// ALTER TABLE participantes ALTER COLUMN cliente_id TYPE text USING cliente_id::text;
// ─────────────────────────────────────────────────────────────────────────────

(function () {
'use strict';

// ─── CONFIGURAÇÃO DA EDGE FUNCTION ──────────────────────────
// URL base do Supabase — lida do objeto já inicializado no index.html
function getEdgeFunctionUrl() {
  const base = (window.SUPA_URL || '').replace(/\/$/, '');
  return base + '/functions/v1/gerar-documento';
}

// ─── TOAST DE FEEDBACK (substitui alerts bloqueantes) ───────
function toast(msg, tipo) {
  // Remove toast anterior se existir
  const prev = document.getElementById('_sca_toast');
  if (prev) prev.remove();

  const cores = {
    ok:   { bg: 'var(--c-pine, #1a5c38)',    fg: '#fff' },
    err:  { bg: '#dc2626',                    fg: '#fff' },
    warn: { bg: 'var(--c-amber, #d97706)',    fg: '#fff' },
    info: { bg: 'var(--c-forest, #0d3320)',   fg: '#fff' },
  };
  const c = cores[tipo] || cores.info;

  const el = document.createElement('div');
  el.id = '_sca_toast';
  el.style.cssText = [
    'position:fixed', 'bottom:24px', 'right:24px', 'z-index:9999',
    `background:${c.bg}`, `color:${c.fg}`,
    'border-radius:10px', 'padding:12px 20px',
    'font-family:var(--font-body,"DM Sans",sans-serif)',
    'font-size:.88rem', 'font-weight:600',
    'box-shadow:0 8px 28px rgba(0,0,0,.25)',
    'max-width:360px', 'line-height:1.4',
    'animation:_toastIn .25s ease',
    'pointer-events:none',
  ].join(';');
  el.textContent = msg;

  if (!document.getElementById('_sca_toast_style')) {
    const st = document.createElement('style');
    st.id = '_sca_toast_style';
    st.textContent = '@keyframes _toastIn{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}';
    document.head.appendChild(st);
  }

  document.body.appendChild(el);
  setTimeout(() => { if (el.parentNode) el.remove(); }, 3500);
}

// ─── UTILITÁRIOS ─────────────────────────────────────────────
function n(v) {
  if (v === '' || v === undefined || v === null) return null;
  return v;
}
function nd(v) {
  if (v === '' || v === undefined || v === null) return null;
  const num = parseFloat(String(v).replace(/\./g, '').replace(',', '.'));
  return isNaN(num) ? null : num;
}
function ni(v) {
  if (v === '' || v === undefined || v === null) return null;
  const num = parseInt(String(v).replace(/\D/g, ''), 10);
  return isNaN(num) ? null : num;
}
function getClienteId() {
  if (typeof clIdx === 'undefined' || clIdx < 0) return null;
  const c = window.clientes && window.clientes[clIdx];
  if (!c) return null;
  // Retorna apenas o uuid — clientes.id é uuid no Supabase
  if (c.id) return c.id;
  // Se ainda não tem uuid (cliente não salvo no Supabase), avisa
  return null;
}
function setStatus(elId, ok, msg) {
  const el = document.getElementById(elId);
  if (!el) return;
  el.style.display = '';
  el.textContent = ok ? '✅ ' + (msg || 'Salvo!') : '❌ ' + (msg || 'Erro');
  el.style.color = ok ? 'var(--c-fern, #2d8653)' : '#dc2626';
  el.style.fontWeight = '700';
  el.style.fontSize = '.8rem';
  setTimeout(() => { el.style.display = 'none'; }, 3500);
}
function setBtn(btn, estado, textoOriginal) {
  if (!btn) return;
  const estados = {
    loading: { disabled: true, text: '⏳ Salvando...', bg: 'var(--c-amber,#d97706)' },
    ok:      { disabled: false, text: '✅ Salvo!',      bg: '#16a34a' },
    err:     { disabled: false, text: '❌ Erro',        bg: '#dc2626' },
    reset:   { disabled: false, text: textoOriginal,    bg: '' },
  };
  const e = estados[estado] || estados.reset;
  btn.disabled = e.disabled;
  if (e.text) btn.innerHTML = e.text;
  btn.style.background = e.bg;
  if (estado === 'ok' || estado === 'err') {
    setTimeout(() => setBtn(btn, 'reset', textoOriginal), 2500);
  }
}

// Registra no log_atividades do Supabase
async function registrarLogDB(icone, descricao, modulo, cliente_id) {
  if (!window.supa) return;
  try {
    await window.supa.from('log_atividades').insert({
      icone, descricao, modulo,
      cliente_id: cliente_id || getClienteId() || null,
    });
    if (typeof renderizarLogCompleto === 'function') renderizarLogCompleto();
    if (typeof renderizarDashboard === 'function')   renderizarDashboard();
  } catch (e) { console.warn('[SCA] Erro log:', e); }
}


// ═══════════════════════════════════════════════════════════
// 1. CLIENTES
// ═══════════════════════════════════════════════════════════

window.salvarCliente = async function () {
  const cpf  = document.getElementById('cl-cpf')?.value?.trim();
  const nome = document.getElementById('cl-nome')?.value?.trim();
  const data = document.getElementById('cl-data')?.value;

  if (!cpf || !nome) { toast('CPF e Nome são obrigatórios.', 'warn'); return; }
  if (!window.supa)  { toast('Supabase não conectado.', 'err'); return; }

  const payload = { cpf: n(cpf), nome: n(nome), data_cadastro: n(data) || null };

  try {
    let clienteId = getClienteId();
    let resultado;

    if (clienteId) {
      resultado = await window.supa.from('clientes').update(payload).eq('id', clienteId).select().single();
    } else {
      resultado = await window.supa.from('clientes').insert(payload).select().single();
    }
    if (resultado.error) throw resultado.error;

    const clienteSalvo = resultado.data;
    clienteId = clienteSalvo.id;

    if (typeof clIdx !== 'undefined' && clIdx >= 0 && window.clientes) {
      window.clientes[clIdx] = { ...window.clientes[clIdx], ...clienteSalvo };
    } else {
      window.clientes = window.clientes || [];
      window.clientes.push(clienteSalvo);
      window.clIdx = window.clientes.length - 1;
      try { clIdx = window.clIdx; } catch (e) {}
    }
    try { clModoEdicao = false; } catch (e) {}

    const codEl = document.getElementById('cl-codigo');
    if (codEl && clienteSalvo.codigo) codEl.value = clienteSalvo.codigo;

    setStatus('cl-status', true, 'Cliente salvo com sucesso!');
    toast('👤 Cliente salvo!', 'ok');
    await registrarLogDB('👤', `Cliente salvo: ${nome}`, 'clientes', clienteId);
    if (typeof atualizarDropdownElaboracao === 'function') atualizarDropdownElaboracao();
  } catch (e) {
    toast('Erro ao salvar cliente: ' + e.message, 'err');
    console.error('[SCA] salvarCliente:', e);
  }
};

window.excluirCliente = async function () {
  const clienteId = getClienteId();
  if (!clienteId) { toast('Nenhum cliente selecionado.', 'warn'); return; }
  const nome = window.clientes[clIdx]?.nome || 'este cliente';
  if (!confirm(`Excluir "${nome}"? Esta ação não pode ser desfeita.`)) return;

  try {
    const { error } = await window.supa.from('clientes').delete().eq('id', clienteId);
    if (error) throw error;

    window.clientes.splice(clIdx, 1);

    // Reordena códigos sem buracos
    const { data: restantes } = await window.supa.from('clientes').select('id,codigo').order('codigo');
    if (restantes?.length > 0) {
      const updates = restantes
        .map((r, i) => ({ id: r.id, codigo: i + 1 }))
        .filter((r, i) => restantes[i].codigo !== r.codigo);
      for (const u of updates) {
        await window.supa.from('clientes').update({ codigo: u.codigo }).eq('id', u.id);
        const li = window.clientes.findIndex(c => c.id === u.id);
        if (li >= 0) window.clientes[li].codigo = u.codigo;
      }
    }

    window.clIdx = window.clientes.length > 0 ? Math.min(clIdx, window.clientes.length - 1) : -1;
    try { clIdx = window.clIdx; } catch (e) {}
    if (typeof exibirCliente === 'function') exibirCliente(window.clIdx);
    if (typeof atualizarDropdownElaboracao === 'function') atualizarDropdownElaboracao();
    toast('🗑️ Cliente excluído.', 'info');
    await registrarLogDB('🗑️', `Cliente excluído: ${nome}`, 'clientes', null);
  } catch (e) {
    toast('Erro ao excluir: ' + e.message, 'err');
  }
};


// ═══════════════════════════════════════════════════════════
// 2. DADOS PESSOAIS
// ═══════════════════════════════════════════════════════════

window.salvarDadosPessoais = async function () {
  const clienteId = getClienteId();
  if (!clienteId) { toast('Salve o cliente primeiro.', 'warn'); return; }

  const idadeEl = document.getElementById('dp-idade');
  const payload = {
    cliente_id:               clienteId,
    sexo:                     n(document.getElementById('dp-sexo')?.value),
    apelido:                  n(document.getElementById('dp-apelido')?.value),
    tipo_identidade:          n(document.getElementById('dp-tipo-id')?.value),
    numero_di:                n(document.getElementById('dp-num-di')?.value),
    data_emissao_di:          n(document.getElementById('dp-data-emissao')?.value) || null,
    orgao_emissor:            n(document.getElementById('dp-orgao')?.value),
    uf_orgao_emissor:         n(document.getElementById('dp-uf-orgao')?.value),
    numero_titulo:            n(document.getElementById('dp-titulo')?.value),
    data_nascimento:          n(document.getElementById('dp-nasc')?.value) || null,
    idade:                    idadeEl?.value ? ni(idadeEl.value) : null,
    uf_nascimento:            n(document.getElementById('dp-uf-nasc')?.value),
    naturalidade:             n(document.getElementById('dp-naturalidade')?.value),
    estado_civil:             n(document.getElementById('dp-estado-civil')?.value),
    regime_casamento:         n(document.getElementById('dp-regime')?.value),
    nome_pai:                 n(document.getElementById('dp-pai')?.value),
    nome_mae:                 n(document.getElementById('dp-mae')?.value),
    numero_caf:               n(document.getElementById('dp-caf')?.value),
    escolaridade:             n(document.getElementById('dp-escolaridade')?.value),
    ja_fez_financiamento:     document.getElementById('dp-financiamento')?.value === 'SIM',
    exposto_politicamente:    document.getElementById('dp-exposto')?.value === 'SIM',
    beneficiario_pol_publicas:n(document.getElementById('dp-beneficiario')?.value),
  };

  try {
    const { error } = await window.supa.from('clientes_dados_pessoais')
      .upsert(payload, { onConflict: 'cliente_id' });
    if (error) throw error;
    if (window.clientes && clIdx >= 0) window.clientes[clIdx].dados_pessoais = payload;
    setStatus('dp-status', true, 'Dados pessoais salvos!');
    await registrarLogDB('📋', 'Dados pessoais salvos', 'clientes', clienteId);
  } catch (e) {
    setStatus('dp-status', false, e.message);
    toast('Erro nos dados pessoais: ' + e.message, 'err');
  }
};


// ═══════════════════════════════════════════════════════════
// 3. ENDEREÇO E CONTATOS
// ═══════════════════════════════════════════════════════════

window.salvarEndereco = async function () {
  const clienteId = getClienteId();
  if (!clienteId) { toast('Salve o cliente primeiro.', 'warn'); return; }

  const payload = {
    cliente_id:      clienteId,
    logradouro:      n(document.getElementById('end-logradouro')?.value),
    numero:          n(document.getElementById('end-numero')?.value),
    bairro:          n(document.getElementById('end-bairro')?.value),
    uf:              n(document.getElementById('end-uf')?.value),
    cidade:          n(document.getElementById('end-cidade')?.value),
    cep:             n(document.getElementById('end-cep')?.value),
    ddd_cel1:        n(document.getElementById('end-ddd1')?.value),
    celular1:        n(document.getElementById('end-cel1')?.value),
    ddd_cel2:        n(document.getElementById('end-ddd2')?.value),
    celular2:        n(document.getElementById('end-cel2')?.value),
    ddd_residencial: n(document.getElementById('end-ddd-res')?.value),
    tel_residencial: n(document.getElementById('end-res')?.value),
    email:           n(document.getElementById('end-email')?.value),
  };

  try {
    const { error } = await window.supa.from('clientes_endereco')
      .upsert(payload, { onConflict: 'cliente_id' });
    if (error) throw error;
    if (window.clientes && clIdx >= 0) window.clientes[clIdx].endereco = payload;
    setStatus('end-status', true, 'Endereço e contatos salvos!');
    await registrarLogDB('📍', 'Endereço e contatos salvos', 'clientes', clienteId);
  } catch (e) {
    setStatus('end-status', false, e.message);
    toast('Erro no endereço: ' + e.message, 'err');
  }
};


// ═══════════════════════════════════════════════════════════
// 4. DADOS BANCÁRIOS E PROJETO
// ═══════════════════════════════════════════════════════════

window.salvarDadosBancarios = async function () {
  const clienteId = getClienteId();
  if (!clienteId) { toast('Salve o cliente primeiro.', 'warn'); return; }

  const payload = {
    cliente_id:       clienteId,
    banco_projeto:    n(document.getElementById('banc-banco-proj')?.value),
    agencia_projeto:  n(document.getElementById('banc-agencia-proj')?.value),
    uf_agencia:       n(document.getElementById('banc-uf-agencia')?.value),
    cidade_agencia:   n(document.getElementById('banc-cidade-agencia')?.value),
    linha_credito:    n(document.getElementById('banc-linha')?.value),
    tipo_projeto:     n(document.getElementById('banc-tipo-proj')?.value),
    tipo_cliente:     n(document.getElementById('banc-tipo-cliente')?.value),
    porte_cliente:    n(document.getElementById('banc-porte')?.value),
    aptidao:          n(document.getElementById('banc-aptidao')?.value),
    cultura_especie:  n(document.getElementById('banc-cultura')?.value),
    experiencia_anos: n(document.getElementById('banc-experiencia')?.value),
    banco_conta:      n(document.getElementById('banc-banco-conta')?.value),
    agencia_conta:    n(document.getElementById('banc-agencia-conta')?.value),
    conta_digito:     n(document.getElementById('banc-conta')?.value),
    uf_conta:         n(document.getElementById('banc-uf-conta')?.value),
    cidade_conta:     n(document.getElementById('banc-cidade-conta')?.value),
  };

  try {
    const { error } = await window.supa.from('clientes_bancarios')
      .upsert(payload, { onConflict: 'cliente_id' });
    if (error) throw error;
    if (window.clientes && clIdx >= 0) window.clientes[clIdx].bancarios = payload;
    setStatus('banc-status', true, 'Dados bancários salvos!');
    await registrarLogDB('🏦', 'Dados bancários e projeto salvos', 'clientes', clienteId);
  } catch (e) {
    setStatus('banc-status', false, e.message);
    toast('Erro nos dados bancários: ' + e.message, 'err');
  }
};


// ═══════════════════════════════════════════════════════════
// 5. OPERAÇÕES EM SER
// ═══════════════════════════════════════════════════════════

window.salvarOperacao = async function () {
  const clienteId = getClienteId();
  if (!clienteId) { toast('Salve o cliente primeiro.', 'warn'); return; }

  const payload = {
    cliente_id:      clienteId,
    banco:           n(document.getElementById('ops-banco')?.value),
    num_contrato:    n(document.getElementById('ops-contrato')?.value),
    finalidade:      n(document.getElementById('ops-finalidade')?.value),
    valor_total:     nd(document.getElementById('ops-valor')?.value),
    data_emissao:    n(document.getElementById('ops-emissao')?.value) || null,
    data_1a_parcela: n(document.getElementById('ops-parc1')?.value) || null,
    prazo_meses:     n(typeof getSelectOuOutro === 'function'
      ? getSelectOuOutro('ops-prazo-sel', 'ops-prazo')
      : document.getElementById('ops-prazo-sel')?.value),
    carencia_meses:  n(typeof getSelectOuOutro === 'function'
      ? getSelectOuOutro('ops-carencia-sel', 'ops-carencia')
      : document.getElementById('ops-carencia-sel')?.value),
  };

  try {
    const { data, error } = await window.supa.from('operacoes_em_ser').insert(payload).select().single();
    if (error) throw error;
    if (window.clientes && clIdx >= 0) {
      if (!window.clientes[clIdx].operacoes) window.clientes[clIdx].operacoes = [];
      window.clientes[clIdx].operacoes.push(data);
    }
    if (typeof renderizarOperacoes === 'function') renderizarOperacoes(clIdx);
    if (typeof limparOperacao === 'function') limparOperacao();
    setStatus('ops-status', true, 'Operação adicionada!');
    await registrarLogDB('📝', 'Operação em ser adicionada', 'clientes', clienteId);
  } catch (e) {
    toast('Erro ao salvar operação: ' + e.message, 'err');
  }
};

window.excluirOperacao = async function (i) {
  const clienteId = getClienteId();
  if (!clienteId || !window.clientes?.[clIdx]?.operacoes) return;
  if (!confirm('Excluir esta operação?')) return;
  const op = window.clientes[clIdx].operacoes[i];
  try {
    if (op?.id) {
      const { error } = await window.supa.from('operacoes_em_ser').delete().eq('id', op.id);
      if (error) throw error;
    }
    window.clientes[clIdx].operacoes.splice(i, 1);
    if (typeof renderizarOperacoes === 'function') renderizarOperacoes(clIdx);
    toast('Operação removida.', 'info');
  } catch (e) {
    toast('Erro ao excluir operação: ' + e.message, 'err');
  }
};


// ═══════════════════════════════════════════════════════════
// 6. OPERAÇÃO ATUAL
// ═══════════════════════════════════════════════════════════

window.salvarOperacaoAtual = async function () {
  const clienteId = getClienteId();
  if (!clienteId) { toast('Salve o cliente primeiro.', 'warn'); return; }

  const payload = {
    cliente_id:          clienteId,
    banco:               n(document.getElementById('oat-banco')?.value),
    num_contrato:        n(document.getElementById('oat-contrato')?.value),
    finalidade:          n(document.getElementById('oat-finalidade')?.value),
    valor_total:         nd(document.getElementById('oat-valor')?.value),
    data_emissao:        n(document.getElementById('oat-emissao')?.value) || null,
    comissao_banco_pct:  nd(document.getElementById('oat-comis-banc-pct')?.value),
    comissao_banco_rs:   nd(document.getElementById('oat-comis-banc-rs')?.value),
    comissao_part_pct:   nd(document.getElementById('oat-comis-part-pct')?.value),
    comissao_part_rs:    nd(document.getElementById('oat-comis-part-rs')?.value),
    data_1a_parcela:     n(document.getElementById('oat-parc1')?.value) || null,
    data_parcela_final:  n(document.getElementById('oat-parc-final')?.value) || null,
    carencia_meses:      n(document.getElementById('oat-carencia-sel')?.value),
    prazo_meses:         n(document.getElementById('oat-prazo-sel')?.value),
    ano_safra:           n(document.getElementById('oat-safra')?.value),
    carencia_atual:      ni(document.getElementById('oat-carencia-atual')?.value),
    prazo_atual:         ni(document.getElementById('oat-prazo-atual')?.value),
  };

  try {
    const { error } = await window.supa.from('operacao_atual')
      .upsert(payload, { onConflict: 'cliente_id' });
    if (error) throw error;
    if (window.clientes && clIdx >= 0) window.clientes[clIdx].operacao_atual = payload;
    setStatus('oat-status', true, 'Operação atual salva!');
    await registrarLogDB('💼', 'Operação atual salva', 'clientes', clienteId);
  } catch (e) {
    setStatus('oat-status', false, e.message);
    toast('Erro na operação atual: ' + e.message, 'err');
  }
};


// ═══════════════════════════════════════════════════════════
// 7. ANEXOS
// ═══════════════════════════════════════════════════════════

window.salvarAnexo = async function () {
  const clienteId = getClienteId();
  if (!clienteId) { toast('Salve o cliente primeiro.', 'warn'); return; }

  const descricao   = document.getElementById('anx-desc')?.value?.trim() || '';
  const arquivoNome = window._anxFileName || '';
  const arquivoData = window._anxFileData || null;

  if (!descricao && !arquivoData) {
    toast('Informe uma descrição ou selecione um arquivo.', 'warn'); return;
  }

  let arquivo_url = null;
  if (arquivoData && window.supa && arquivoNome) {
    try {
      const cpf = (window.clientes?.[clIdx]?.cpf || '').replace(/\D/g, '');
      const caminho = `anexos/${cpf}/${Date.now()}_${arquivoNome}`;
      const res = await fetch(arquivoData);
      const blob = await res.blob();
      const { error: upErr } = await window.supa.storage
        .from('imagens').upload(caminho, blob, { upsert: true, contentType: blob.type });
      if (!upErr) {
        const { data: urlData } = window.supa.storage.from('imagens').getPublicUrl(caminho);
        arquivo_url = urlData?.publicUrl || null;
      } else {
        console.warn('[SCA] Upload anexo erro:', upErr);
      }
    } catch (upEx) { console.warn('[SCA] Exceção upload:', upEx); }
  }

  const payload = {
    cliente_id:   clienteId,
    descricao:    n(descricao),
    arquivo_url:  n(arquivo_url || arquivoData),
    arquivo_nome: n(arquivoNome),
  };

  try {
    const { data, error } = await window.supa.from('anexos_clientes').insert(payload).select().single();
    if (error) throw error;
    if (window.clientes && clIdx >= 0) {
      if (!window.clientes[clIdx].anexos) window.clientes[clIdx].anexos = [];
      window.clientes[clIdx].anexos.push({ ...data, dataHora: new Date().toLocaleString('pt-BR') });
    }
    if (typeof renderizarAnexos === 'function') renderizarAnexos(clIdx);
    if (typeof limparAnexo === 'function') limparAnexo();
    setStatus('anx-status', true, 'Anexo adicionado!');
    await registrarLogDB('📎', `Anexo adicionado: ${descricao || arquivoNome}`, 'clientes', clienteId);
  } catch (e) {
    toast('Erro ao salvar anexo: ' + e.message, 'err');
  }
};

window.excluirAnexo = async function (i) {
  if (!confirm('Excluir este anexo?')) return;
  const anx = window.clientes?.[clIdx]?.anexos?.[i];
  try {
    if (anx?.id) {
      const { error } = await window.supa.from('anexos_clientes').delete().eq('id', anx.id);
      if (error) throw error;
    }
    window.clientes[clIdx].anexos.splice(i, 1);
    if (typeof renderizarAnexos === 'function') renderizarAnexos(clIdx);
    toast('Anexo removido.', 'info');
  } catch (e) { toast('Erro ao excluir anexo: ' + e.message, 'err'); }
};


// ═══════════════════════════════════════════════════════════
// 8. PARTICIPANTES
// ═══════════════════════════════════════════════════════════

window.salvarParticipante = async function (tab) {
  const clienteId = getClienteId();
  if (!clienteId) { toast('Salve o cliente primeiro.', 'warn'); return; }

  let tabela, payload;

  if (tab === 'conjugue') {
    tabela = 'conjuges';
    payload = {
      cliente_id:             clienteId,
      cpf:                    n(document.getElementById('conj-cpf')?.value),
      nome:                   n(document.getElementById('conj-nome')?.value),
      data_nascimento:        n(document.getElementById('conj-nasc')?.value) || null,
      tipo_identidade:        n(document.getElementById('conj-tipo-id')?.value),
      numero_di:              n(document.getElementById('conj-di')?.value),
      data_emissao:           n(document.getElementById('conj-emissao')?.value) || null,
      orgao_emissor:          n(document.getElementById('conj-orgao')?.value),
      uf_orgao:               n(document.getElementById('conj-uf-orgao')?.value),
      sexo:                   n(document.getElementById('conj-sexo')?.value),
      escolaridade:           n(document.getElementById('conj-escolaridade')?.value),
      profissao:              n(document.getElementById('conj-profissao')?.value),
      nome_pai:               n(document.getElementById('conj-pai')?.value),
      nome_mae:               n(document.getElementById('conj-mae')?.value),
      ddd_celular:            n(document.getElementById('conj-ddd')?.value),
      celular:                n(document.getElementById('conj-cel')?.value),
      email:                  n(document.getElementById('conj-email')?.value),
      // Campos adicionados na migration v2 e v4
      naturalidade:           n(document.getElementById('conj-naturalidade')?.value),
      uf_nascimento:          n(document.getElementById('conj-uf-nasc')?.value),
      exposto_politicamente:  document.getElementById('conj-exposto')?.value === 'SIM',
    };

  } else if (tab === 'avalista') {
    tabela = 'avalistas';
    payload = {
      cliente_id:                      clienteId,
      cpf:                             n(document.getElementById('aval-cpf')?.value),
      nome:                            n(document.getElementById('aval-nome')?.value),
      data_nascimento:                 n(document.getElementById('aval-nasc')?.value) || null,
      tipo_identidade:                 n(document.getElementById('aval-tipo-id')?.value),
      numero_di:                       n(document.getElementById('aval-di')?.value),
      data_emissao:                    n(document.getElementById('aval-emissao')?.value) || null,
      orgao_emissor:                   n(document.getElementById('aval-orgao')?.value),
      uf_orgao:                        n(document.getElementById('aval-uf-orgao')?.value),
      sexo:                            n(document.getElementById('aval-sexo')?.value),
      estado_civil:                    n(document.getElementById('aval-estado-civil')?.value),
      regime_casamento:                n(document.getElementById('aval-regime')?.value),
      profissao:                       n(document.getElementById('aval-profissao')?.value),
      nome_pai:                        n(document.getElementById('aval-pai')?.value),
      nome_mae:                        n(document.getElementById('aval-mae')?.value),
      ddd_celular:                     n(document.getElementById('aval-ddd')?.value),
      celular:                         n(document.getElementById('aval-cel')?.value),
      email:                           n(document.getElementById('aval-email')?.value),
      // Endereço (migration v2)
      logradouro:                      n(document.getElementById('aval-logradouro')?.value),
      numero:                          n(document.getElementById('aval-numero')?.value),
      bairro:                          n(document.getElementById('aval-bairro')?.value),
      cidade:                          n(document.getElementById('aval-cidade')?.value),
      uf:                              n(document.getElementById('aval-uf')?.value),
      cep:                             n(document.getElementById('aval-cep')?.value),
      naturalidade:                    n(document.getElementById('aval-naturalidade')?.value),
      uf_nascimento:                   n(document.getElementById('aval-uf-nasc')?.value),
      exposto_politicamente:           document.getElementById('aval-exposto')?.value === 'SIM',
      // Cônjuge do avalista (migration v2)
      nome_conjuge:                    n(document.getElementById('aval-conj-nome')?.value),
      cpf_conjuge:                     n(document.getElementById('aval-conj-cpf')?.value),
      tipo_identidade_conjuge:         n(document.getElementById('aval-conj-tipo-id')?.value),
      numero_di_conjuge:               n(document.getElementById('aval-conj-di')?.value),
      data_emissao_conjuge:            n(document.getElementById('aval-conj-emissao')?.value) || null,
      orgao_emissor_conjuge:           n(document.getElementById('aval-conj-orgao')?.value),
      uf_orgao_conjuge:                n(document.getElementById('aval-conj-uf-orgao')?.value),
      data_nascimento_conjuge:         n(document.getElementById('aval-conj-nasc')?.value) || null,
      nome_mae_conjuge:                n(document.getElementById('aval-conj-mae')?.value),
      naturalidade_conjuge:            n(document.getElementById('aval-conj-natural')?.value),
      sexo_conjuge:                    n(document.getElementById('aval-conj-sexo')?.value),
      ddd_celular_conjuge:             n(document.getElementById('aval-conj-ddd')?.value),
      celular_conjuge:                 n(document.getElementById('aval-conj-cel')?.value),
      email_conjuge:                   n(document.getElementById('aval-conj-email')?.value),
      exposto_politicamente_conjuge:   document.getElementById('aval-conj-exposto')?.value === 'SIM',
    };

  } else if (tab === 'empresa') {
    tabela = 'participante_empresa';
    payload = {
      cliente_id:   clienteId,
      cnpj:         n(document.getElementById('emp-cnpj')?.value),
      razao_social: n(document.getElementById('emp-razao')?.value),
      nome_fantasia:n(document.getElementById('emp-fantasia')?.value),
      data_abertura:n(document.getElementById('emp-abertura')?.value) || null,
      atividade:    n(document.getElementById('emp-atividade')?.value),
      responsavel:  n(document.getElementById('emp-responsavel')?.value),
      cargo:        n(document.getElementById('emp-cargo')?.value),
      ddd_tel:      n(document.getElementById('emp-ddd')?.value),
      telefone:     n(document.getElementById('emp-tel')?.value),
      email:        n(document.getElementById('emp-email')?.value),
    };

  } else if (tab === 'arrendante') {
    tabela = 'arrendantes';
    payload = {
      cliente_id:      clienteId,
      cpf:             n(document.getElementById('arr-cpf')?.value),
      nome:            n(document.getElementById('arr-nome')?.value),
      tipo_identidade: n(document.getElementById('arr-tipo-id')?.value),
      numero_di:       n(document.getElementById('arr-di')?.value),
      data_emissao:    n(document.getElementById('arr-emissao')?.value) || null,
      orgao_emissor:   n(document.getElementById('arr-orgao')?.value),
      logradouro:      n(document.getElementById('arr-logradouro')?.value),
      bairro:          n(document.getElementById('arr-bairro')?.value),
      uf:              n(document.getElementById('arr-uf')?.value),
      cidade:          n(document.getElementById('arr-cidade')?.value),
      telefone:        n(document.getElementById('arr-tel')?.value),
      email:           n(document.getElementById('arr-email')?.value),
    };
  } else { return; }

  const labels = { conjugue:'Cônjuge', avalista:'Avalista', empresa:'Empresa participante', arrendante:'Arrendante' };
  const statusMap = { conjugue:'conj', avalista:'aval', empresa:'emp', arrendante:'arr' };

  try {
    // Verifica se já existe registro para este cliente nesta tabela
    const { data: existing } = await window.supa
      .from(tabela).select('id').eq('cliente_id', clienteId).maybeSingle();
    let result;
    if (existing && existing.id) {
      result = await window.supa.from(tabela).update(payload).eq('id', existing.id);
    } else {
      result = await window.supa.from(tabela).insert(payload);
    }
    if (result.error) throw result.error;
    if (window.clientes && clIdx >= 0) {
      if (!window.clientes[clIdx].participantes) window.clientes[clIdx].participantes = {};
      window.clientes[clIdx].participantes[tab] = payload;
    }
    setStatus(`part-${statusMap[tab]}-status`, true, `${labels[tab]} salvo!`);
    await registrarLogDB('👥', `${labels[tab]} salvo`, 'participantes', clienteId);
  } catch (e) {
    setStatus(`part-${statusMap[tab]}-status`, false, e.message);
    toast('Erro ao salvar participante: ' + e.message, 'err');
  }
};


// ═══════════════════════════════════════════════════════════
// 9. PROPRIEDADES
// ═══════════════════════════════════════════════════════════

window.salvarPropriedade = async function () {
  const clienteId = getClienteId();
  if (!clienteId) { toast('Salve o cliente primeiro.', 'warn'); return; }

  const g  = id => n(document.getElementById(id)?.value);
  const gd = id => nd(document.getElementById(id)?.value);

  const payload = {
    cliente_id:           clienteId,
    tipo_propriedade:     g('prop-tipo'),
    // Proprietário
    prop_nome:            g('prop-prop-nome'),
    prop_cpf:             g('prop-prop-cpf'),
    prop_tipo_doc:        g('prop-prop-tipo-doc'),
    prop_num_doc:         g('prop-prop-num-doc'),
    prop_data_emissao:    g('prop-prop-data-emis') || null,
    prop_orgao:           g('prop-prop-orgao'),
    prop_uf_emissao:      g('prop-prop-uf-emis'),
    prop_logradouro:      g('prop-prop-logr'),
    prop_numero:          g('prop-prop-num'),
    prop_bairro:          g('prop-prop-bairro'),
    prop_uf:              g('prop-prop-uf'),
    prop_cidade:          g('prop-prop-cidade'),
    prop_cep:             g('prop-prop-cep'),
    prop_ddd:             g('prop-prop-ddd'),
    prop_tel:             g('prop-prop-tel'),
    prop_email:           g('prop-prop-email'),
    // Dados Gerais
    nome_propriedade:     g('prop-ger-nome'),
    denominacao:          g('prop-ger-denom'),
    inscricao_estadual:   g('prop-ger-ie'),
    nirf:                 g('prop-ger-nirf'),
    incra:                g('prop-ger-incra'),
    ger_logradouro:       g('prop-ger-logr'),
    ger_bairro:           g('prop-ger-bairro'),
    ger_cep:              g('prop-ger-cep'),
    ger_uf:               g('prop-ger-uf'),          // migration v4
    ger_municipio:        g('prop-ger-municipio'),   // migration v4
    // Vizinhos
    viz_norte:            g('prop-viz-norte'),
    viz_sul:              g('prop-viz-sul'),
    viz_leste:            g('prop-viz-leste'),
    viz_oeste:            g('prop-viz-oeste'),
    testemunha1_nome:     g('prop-viz-test1'),
    testemunha1_cpf:      g('prop-viz-cpf1'),
    testemunha2_nome:     g('prop-viz-test2'),
    testemunha2_cpf:      g('prop-viz-cpf2'),
    // Edafoclimáticos
    tipo_solo:            g('prop-ed-solo'),
    textura_solo:         g('prop-ed-textura'),
    relevo:               g('prop-ed-relevo'),
    drenagem:             g('prop-ed-drenagem'),
    precipitacao_mm:      gd('prop-ed-precip'),
    temperatura_media_c:  gd('prop-ed-temp'),
    altitude_m:           gd('prop-ed-alt'),
    bioma:                g('prop-ed-bioma'),
    // Áreas (ha)
    area_total_ha:        gd('prop-area-total'),
    area_agricultavel_ha: gd('prop-area-agri'),
    area_pastagem_ha:     gd('prop-area-past'),
    area_reserva_ha:      gd('prop-area-res'),
    area_aproveitada_ha:  gd('prop-area-aprov'),
    area_projeto_ha:      gd('prop-area-proj'),
    area_app_ha:          gd('prop-area-app'),
    area_inapta_ha:       gd('prop-area-inapta'),
    // Documentos
    doc_tipo:             g('prop-doc-tipo'),
    doc_numero:           g('prop-doc-num'),
    doc_data:             g('prop-doc-data') || null,
    doc_cartorio:         g('prop-doc-cart'),
    doc_num_car:          g('prop-doc-car'),
    doc_num_ccir:         g('prop-doc-ccir'),
    doc_num_itr:          g('prop-doc-itr'),
    doc_situacao:         g('prop-doc-sit'),
    // Benfeitorias
    benf_descricao:       g('prop-benf-desc'),
    benf_quantidade:      gd('prop-benf-qtd'),
    benf_valor_unitario:  gd('prop-benf-vunit'),
    benf_valor_total:     gd('prop-benf-vtotal'),
    // Seguros
    seg_seguradora:       g('prop-seg-seg'),
    seg_num_apolice:      g('prop-seg-apolice'),
    seg_vigencia:         g('prop-seg-vig') || null,
    seg_valor_segurado:   gd('prop-seg-valor'),
    // Nota Agronômica
    nota_responsavel:     g('prop-nota-resp'),
    nota_crea:            g('prop-nota-crea'),
    nota_data_visita:     g('prop-nota-data') || null,
    nota_observacoes:     n(document.getElementById('prop-nota-obs')?.value),
    // Acesso / Itinerário (migration v3)
    tipo_estrada:         g('prop-tipo-estrada'),
    denominacao_estrada:  g('prop-denom-estrada'),
    tipo_povoado:         g('prop-tipo-povoado'),
    denominacao_povoado:  g('prop-denom-povoado'),
    distancia_km_sede:    gd('prop-dist-sede'),
    latitude_sede:        g('prop-latitude'),
    longitude_sede:       g('prop-longitude'),
    intinerario:          n(document.getElementById('prop-itinerario')?.value),
  };

  try {
    const { error } = await window.supa.from('propriedades')
      .upsert(payload, { onConflict: 'cliente_id' });
    if (error) throw error;
    if (window.clientes && clIdx >= 0) window.clientes[clIdx].propriedade = payload;
    setStatus('prop-status', true, 'Propriedade salva!');
    await registrarLogDB('🏡', 'Propriedade salva', 'propriedades', clienteId);
  } catch (e) {
    setStatus('prop-status', false, e.message);
    toast('Erro ao salvar propriedade: ' + e.message, 'err');
  }
};


// ═══════════════════════════════════════════════════════════
// 10. PRODUÇÃO AGRÍCOLA
// ═══════════════════════════════════════════════════════════

const TABELAS_AGR = {
  temp:  'agr_temporaria',
  perm:  'agr_permanente',
  outras:'agr_outras_culturas',
  extr:  'agr_extrativismo',
  agro:  'agr_agroindustria',
  renda: 'agr_renda_fora',
};

window.salvarAgricola = async function (key) {
  const clienteId = getClienteId();
  if (!clienteId) { toast('Salve o cliente primeiro.', 'warn'); return; }
  const tabela = TABELAS_AGR[key];
  if (!tabela) return;

  const g  = id => n(document.getElementById(id)?.value);
  const gd = id => nd(document.getElementById(id)?.value);
  const gi = id => ni(document.getElementById(id)?.value);
  let payload = { cliente_id: clienteId };

  if (key === 'temp')  payload = { ...payload, cultura: g('agr-temp-cultura'), area_ha: gd('agr-temp-area'), produtividade_kg_ha: gd('agr-temp-produtividade'), producao_total_kg: gd('agr-temp-producao'), preco_unitario: gd('agr-temp-preco'), receita_bruta: gd('agr-temp-receita'), periodo_colheita: g('agr-temp-periodo'), destino_producao: g('agr-temp-destino') };
  else if (key === 'perm')  payload = { ...payload, cultura: g('agr-perm-cultura'), area_ha: gd('agr-perm-area'), num_plantas: gi('agr-perm-plantas'), prod_por_planta_kg: gd('agr-perm-prod-planta'), producao_total_kg: gd('agr-perm-producao'), preco_unitario: gd('agr-perm-preco'), receita_bruta: gd('agr-perm-receita'), ano_plantio: gi('agr-perm-ano') };
  else if (key === 'outras') payload = { ...payload, descricao: g('agr-outras-desc'), area_ha: gd('agr-outras-area'), quantidade: gd('agr-outras-qtd'), unidade: g('agr-outras-unidade'), preco_unitario: gd('agr-outras-preco'), receita_bruta: gd('agr-outras-receita') };
  else if (key === 'extr')  payload = { ...payload, produto: g('agr-extr-produto'), area_ha: gd('agr-extr-area'), quantidade_kg: gd('agr-extr-qtd'), periodo_coleta: g('agr-extr-periodo'), preco_unitario: gd('agr-extr-preco'), receita_bruta: gd('agr-extr-receita'), destino: g('agr-extr-destino') };
  else if (key === 'agro')  payload = { ...payload, produto: g('agr-agro-produto'), quantidade: gd('agr-agro-qtd'), unidade: g('agr-agro-unidade'), preco_unitario: gd('agr-agro-preco'), receita_bruta: gd('agr-agro-receita'), periodo: g('agr-agro-periodo') };
  else if (key === 'renda') payload = { ...payload, descricao: g('agr-renda-desc'), valor_mensal: gd('agr-renda-mensal'), meses_no_ano: gi('agr-renda-meses'), valor_anual: gd('agr-renda-anual'), responsavel: g('agr-renda-responsavel'), origem: g('agr-renda-origem') };

  try {
    const { error } = await window.supa.from(tabela).upsert(payload, { onConflict: 'cliente_id' });
    if (error) throw error;
    if (window.clientes && clIdx >= 0) {
      if (!window.clientes[clIdx].agricola) window.clientes[clIdx].agricola = {};
      window.clientes[clIdx].agricola[key] = payload;
    }
    if (typeof atualizarTotalAgricola === 'function') atualizarTotalAgricola();
    const st = document.getElementById(`agr-${key}-status`);
    if (st) { st.style.display = ''; setTimeout(() => st.style.display = 'none', 3000); }
    await registrarLogDB('🌾', `Produção agrícola (${key}) salva`, 'agricola', clienteId);
  } catch (e) {
    toast('Erro ao salvar produção agrícola: ' + e.message, 'err');
  }
};


// ═══════════════════════════════════════════════════════════
// 11. PRODUÇÃO PECUÁRIA
// ═══════════════════════════════════════════════════════════

const TABELAS_PEC = {
  bov:  'pec_bovino',
  leite:'pec_leite_bovino',
  equ:  'pec_equino',
  cap:  'pec_caprino',
  lcap: 'pec_leite_caprino',
  ovi:  'pec_ovino',
  sui:  'pec_suino',
  aves: 'pec_aves',
  out:  'pec_outros',
};

window.salvarPecuaria = async function (key) {
  const clienteId = getClienteId();
  if (!clienteId) { toast('Salve o cliente primeiro.', 'warn'); return; }
  const tabela = TABELAS_PEC[key];
  if (!tabela) return;

  const g  = id => n(document.getElementById(id)?.value);
  const gd = id => nd(document.getElementById(id)?.value);
  const gi = id => ni(document.getElementById(id)?.value);
  let payload = { cliente_id: clienteId };

  if (key === 'bov')   payload = { ...payload, raca_tipo: g('pec-bov-raca'), num_cabecas: gi('pec-bov-cabecas'), peso_medio_kg: gd('pec-bov-peso'), finalidade: g('pec-bov-finalidade'), preco_arroba: gd('pec-bov-preco'), cabecas_vendidas_ano: gi('pec-bov-vendidas'), receita_bruta: gd('pec-bov-receita'), valor_rebanho: gd('pec-bov-rebanho') };
  else if (key === 'leite') payload = { ...payload, num_vacas_lactacao: gi('pec-leite-vacas'), producao_vaca_dia_l: gd('pec-leite-prod-dia'), dias_lactacao: gi('pec-leite-dias'), producao_total_l: gd('pec-leite-total'), preco_leite_l: gd('pec-leite-preco'), receita_bruta: gd('pec-leite-receita') };
  else if (key === 'equ')  payload = { ...payload, raca_tipo: g('pec-equ-raca'), num_cabecas: gi('pec-equ-cabecas'), finalidade: g('pec-equ-finalidade'), preco_unitario: gd('pec-equ-preco'), unidades_vendidas: gi('pec-equ-vendidas'), receita_bruta: gd('pec-equ-receita') };
  else if (key === 'cap')  payload = { ...payload, raca_tipo: g('pec-cap-raca'), num_cabecas: gi('pec-cap-cabecas'), finalidade: g('pec-cap-finalidade'), preco_unitario: gd('pec-cap-preco'), unidades_vendidas: gi('pec-cap-vendidas'), receita_bruta: gd('pec-cap-receita') };
  else if (key === 'lcap') payload = { ...payload, num_cabras_lactacao: gi('pec-lcap-cabras'), producao_dia_l: gd('pec-lcap-prod-dia'), dias_lactacao: gi('pec-lcap-dias'), producao_total_l: gd('pec-lcap-total'), preco_leite_l: gd('pec-lcap-preco'), receita_bruta: gd('pec-lcap-receita') };
  else if (key === 'ovi')  payload = { ...payload, raca_tipo: g('pec-ovi-raca'), num_cabecas: gi('pec-ovi-cabecas'), finalidade: g('pec-ovi-finalidade'), preco_unitario: gd('pec-ovi-preco'), unidades_vendidas: gi('pec-ovi-vendidas'), receita_bruta: gd('pec-ovi-receita') };
  else if (key === 'sui')  payload = { ...payload, raca_tipo: g('pec-sui-raca'), num_cabecas: gi('pec-sui-cabecas'), peso_medio_kg: gd('pec-sui-peso'), preco_unitario: gd('pec-sui-preco'), unidades_vendidas: gi('pec-sui-vendidas'), receita_bruta: gd('pec-sui-receita') };
  else if (key === 'aves') payload = { ...payload, especie: g('pec-aves-especie'), num_aves: gi('pec-aves-qtd'), ovos_por_dia: gd('pec-aves-ovos'), preco_unitario: gd('pec-aves-preco'), aves_vendidas_ano: gi('pec-aves-vendidas'), receita_bruta: gd('pec-aves-receita') };
  else if (key === 'out')  payload = { ...payload, descricao: g('pec-out-desc'), quantidade: gd('pec-out-qtd'), unidade: g('pec-out-unidade'), preco_unitario: gd('pec-out-preco'), unidades_vendidas: gd('pec-out-vendidas'), receita_bruta: gd('pec-out-receita') };

  try {
    const { error } = await window.supa.from(tabela).upsert(payload, { onConflict: 'cliente_id' });
    if (error) throw error;
    if (window.clientes && clIdx >= 0) {
      if (!window.clientes[clIdx].pecuaria) window.clientes[clIdx].pecuaria = {};
      window.clientes[clIdx].pecuaria[key] = payload;
    }
    if (typeof atualizarTotalPec === 'function') atualizarTotalPec();
    const st = document.getElementById(`pec-${key}-status`);
    if (st) { st.style.display = ''; setTimeout(() => st.style.display = 'none', 3000); }
    await registrarLogDB('🐄', `Produção pecuária (${key}) salva`, 'pecuaria', clienteId);
  } catch (e) {
    toast('Erro ao salvar produção pecuária: ' + e.message, 'err');
  }
};


// ═══════════════════════════════════════════════════════════
// 12. EQUIPE
// ═══════════════════════════════════════════════════════════

window.salvarMembro = async function () {
  const msg  = document.getElementById('equipe-msg');
  const nome = document.getElementById('mem-nome')?.value?.trim();
  if (!nome) {
    if (msg) { msg.textContent = '❌ Nome é obrigatório.'; msg.style.cssText = 'display:block;background:#fee2e2;color:#7f1d1d;padding:8px 12px;border-radius:6px;font-size:.82rem;'; }
    return;
  }

  const supaId = document.getElementById('mem-id')?.value;
  // Alinhado com tabela: cargo_funcao (migration v4 adiciona `cargo` como alias)
  const payload = {
    nome,
    cpf:          n(document.getElementById('mem-cpf')?.value),
    data_nascimento: n(document.getElementById('mem-nasc')?.value) || null,
    cargo_funcao: n(document.getElementById('mem-cargo')?.value),
    crea_cfb:     n(document.getElementById('mem-crea')?.value),
    ddd_celular:  n(document.getElementById('mem-ddd')?.value),
    celular:      n(document.getElementById('mem-cel')?.value),
    email:        n(document.getElementById('mem-email')?.value),
  };

  try {
    let error;
    if (supaId) {
      ({ error } = await window.supa.from('equipe').update(payload).eq('id', supaId));
    } else {
      ({ error } = await window.supa.from('equipe').insert(payload));
    }
    if (error) throw error;

    const { data: eqAtual } = await window.supa.from('equipe').select('*').order('nome');
    window.equipe = eqAtual || [];
    if (window._scaCache) window._scaCache.equipe = eqAtual;
    if (typeof renderizarEquipe === 'function') renderizarEquipe();
    if (typeof cancelarMembro === 'function') cancelarMembro();
    if (msg) {
      msg.textContent = '✅ Membro salvo!';
      msg.style.cssText = 'display:block;background:#dcfce7;color:#14532d;padding:8px 12px;border-radius:6px;font-size:.82rem;';
      setTimeout(() => msg.style.display = 'none', 3000);
    }
    await registrarLogDB('👥', `Membro ${supaId ? 'atualizado' : 'adicionado'}: ${nome}`, 'equipe', null);
  } catch (e) {
    if (msg) { msg.textContent = '❌ Erro: ' + e.message; msg.style.cssText = 'display:block;background:#fee2e2;color:#7f1d1d;padding:8px 12px;border-radius:6px;font-size:.82rem;'; }
  }
};

window.excluirMembro = async function (i) {
  const mArr = window.equipe || (typeof equipe !== 'undefined' ? equipe : []);
  const m = mArr[i];
  if (!m || !confirm(`Excluir "${m.nome}"?`)) return;
  try {
    const { error } = await window.supa.from('equipe').delete().eq('id', m.id);
    if (error) throw error;
    mArr.splice(i, 1);
    if (typeof renderizarEquipe === 'function') renderizarEquipe();
    toast('Membro removido.', 'info');
    await registrarLogDB('🗑️', `Membro excluído: ${m.nome}`, 'equipe', null);
  } catch (e) { toast('Erro ao excluir: ' + e.message, 'err'); }
};


// ═══════════════════════════════════════════════════════════
// 13. EMPRESA
// ═══════════════════════════════════════════════════════════

window.salvarDadosEmpresa = async function () {
  const g = id => n(document.getElementById('empresa-' + id)?.value);

  const payload = {
    cnpj:               g('cnpj'),
    razao_social:       g('razao'),
    nome_fantasia:      g('fantasia'),
    inscricao_estadual: g('ie'),
    data_abertura:      g('abertura') || null,
    atividade:          g('atividade'),
    responsavel:        g('responsavel'),
    crea:               g('crea'),
    conselho:           g('conselho'),    // migration v4
    logradouro:         g('logradouro'),
    numero:             g('numero'),
    bairro:             g('bairro'),
    uf:                 g('uf'),
    cidade:             g('cidade'),
    cep:                g('cep'),
    ddd_tel:            g('ddd'),         // migration v4
    telefone:           g('tel'),
    celular:            g('cel'),
    email:              g('email'),
    site:               g('site'),
    logo_url:           n(window._scaCache?.empresa_logo_url || null),
  };

  // Atualiza cache local
  window._scaCache = window._scaCache || {};
  window._scaCache.empresa = payload;

  const btn = document.querySelector('[onclick*="salvarDadosEmpresa"]');
  const txtOriginal = btn?.innerHTML || '💾 Salvar Dados da Empresa';
  setBtn(btn, 'loading', txtOriginal);

  try {
    const { data: existing } = await window.supa.from('empresa').select('id').limit(1).maybeSingle();
    if (existing) {
      const { error } = await window.supa.from('empresa').update(payload).eq('id', existing.id);
      if (error) throw error;
    } else {
      const { error } = await window.supa.from('empresa').insert(payload);
      if (error) throw error;
    }
    setBtn(btn, 'ok', txtOriginal);
    toast('🏢 Dados da empresa salvos!', 'ok');
    await registrarLogDB('🏢', 'Dados da empresa atualizados', 'empresa', null);
  } catch (e) {
    setBtn(btn, 'err', txtOriginal);
    toast('Erro ao salvar empresa: ' + e.message, 'err');
  }
};


// ═══════════════════════════════════════════════════════════
// 14. ELABORAÇÃO / STATUS DO PROCESSO
// ═══════════════════════════════════════════════════════════

window.definirStatusProcesso = async function (status) {
  const clienteId = getClienteId();
  if (!clienteId) return;
  const obs = document.getElementById('status-obs')?.value || '';
  const statusMap = {
    'Em andamento': 'andamento',
    'Aguardando assinatura': 'assinatura',
    'Concluido': 'concluido',
    'Cancelado': 'cancelado',
  };

  document.querySelectorAll('.status-btn').forEach(b => b.classList.remove('sel'));
  const key = statusMap[status];
  const btn = document.getElementById('sbtn-' + key);
  if (btn) btn.classList.add('sel');

  const badge = document.getElementById('status-processo-badge');
  if (badge) { badge.className = 'status-badge status-' + key; badge.textContent = status; }

  try {
    const { error } = await window.supa.from('elaboracao_projetos')
      .upsert({ cliente_id: clienteId, status_processo: status, observacao: obs }, { onConflict: 'cliente_id' });
    if (error) throw error;
    await registrarLogDB('📄', `Status do processo: ${status}`, 'elaboracao', clienteId);
  } catch (e) { console.warn('[SCA] Erro ao salvar status:', e); }
};

window.salvarStatusProcesso = async function () {
  const clienteId = getClienteId();
  if (!clienteId) return;
  const obs    = document.getElementById('status-obs')?.value || '';
  const badge  = document.getElementById('status-processo-badge');
  const status = badge?.textContent?.trim() || 'Em andamento';
  try {
    await window.supa.from('elaboracao_projetos')
      .upsert({ cliente_id: clienteId, status_processo: status, observacao: obs }, { onConflict: 'cliente_id' });
  } catch (e) { console.warn('[SCA] Erro salvar obs status:', e); }
};


// ═══════════════════════════════════════════════════════════
// 15. GERAÇÃO DE DOCUMENTOS — VIA EDGE FUNCTION
// ═══════════════════════════════════════════════════════════

// ── GERAR DOCX via Edge Function + docxtemplater ─────────────
window.gerarDocHTML = async function (nomeTemplate, btnEl) {
  // Compatibilidade: se vier .html, troca por .docx
  const nomeDocx = nomeTemplate.replace('.html', '.docx');
  return window.gerarDocDOCX(nomeDocx, btnEl);
};

window.gerarDocDOCX = async function (nomeTemplate, btnEl) {
  const clienteId = getClienteId();
  const cpf = window.clientes?.[clIdx]?.cpf;

  if (!cpf) {
    toast('Selecione um cliente antes de gerar documentos.', 'warn'); return;
  }

  const txtOriginal = btnEl?.textContent || '';
  if (btnEl) { btnEl.disabled = true; btnEl.textContent = '⏳ Gerando...'; btnEl.className = (btnEl.className || '') + ' loading'; }

  try {
    const url   = getEdgeFunctionUrl();
    const token = window.supa?.auth?.currentSession?.access_token
      || (await window.supa?.auth?.getSession())?.data?.session?.access_token
      || '';

    // 1. Busca dados do cliente na Edge Function (retorna JSON)
    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${token}`,
        'apikey':        window.SUPA_KEY || '',
      },
      body: JSON.stringify({ cpf, template: nomeTemplate }),
    });

    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      throw new Error(err.error || `HTTP ${resp.status}`);
    }

    const dados = await resp.json();

    // 2. Baixa o template DOCX do bucket templates-docx
    const { data: blob, error: errBucket } = await window.supa.storage
      .from('templates-docx')
      .download(nomeTemplate);
    if (errBucket) throw new Error('Template "' + nomeTemplate + '" não encontrado no bucket templates-docx: ' + errBucket.message);

    // 3. Preenche o DOCX com docxtemplater usando << >> como delimitadores
    const arrayBuffer = await blob.arrayBuffer();
    const zip = new PizZip(arrayBuffer);
    const doc = new window.Docxtemplater(zip, {
      delimiters: { start: '<<', end: '>>' },
      paragraphLoop: true,
      linebreaks: true,
    });
    doc.render(dados);

    // 4. Faz download
    const docxBlob = doc.getZip().generate({
      type: 'blob',
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    });
    const nomeDownload = (dados.a_nome_cliente || 'cliente').replace(/\s+/g,'_') + '_' + nomeTemplate;
    saveAs(docxBlob, nomeDownload);

    // Registra histórico
    try {
      await window.supa?.from('historico_documentos').insert({
        cliente_id: clienteId,
        nome_documento: nomeTemplate,
      });
    } catch (_) {}
    if (typeof renderizarHistoricoDocs === 'function') renderizarHistoricoDocs();

    if (btnEl) { btnEl.className = btnEl.className.replace('loading', 'success'); btnEl.textContent = '✅ Gerado!'; }
    setTimeout(() => {
      if (btnEl) { btnEl.disabled = false; btnEl.textContent = txtOriginal; btnEl.className = btnEl.className.replace('success', '').replace('loading', '').trim(); }
    }, 2500);

  } catch (e) {
    if (btnEl) { btnEl.className = btnEl.className.replace('loading', 'error'); btnEl.textContent = '❌ Erro'; }
    toast('Erro ao gerar documento: ' + e.message, 'err');
    console.error('[SCA] 🔴 ERRO DETALHADO:', e.message, e.stack || '');
    setTimeout(() => {
      if (btnEl) { btnEl.disabled = false; btnEl.textContent = txtOriginal; btnEl.className = btnEl.className.replace('error', '').trim(); }
    }, 3000);
  }
};

// Alias para gerar todos os documentos de uma vez
window.gerarTodosHTML = async function (btnEl) {
  const templates = [
    'LGPD_Proponente.docx','LGPD_Conjuge.docx','LGPD_Avalista.docx','LGPD_Conjuge_Avalista.docx',
    'Declaracao_de_Posse.docx','Declaracao_de_Vizinhanca.docx',
    'Ficha_Proposta_PF_Proponente_PRONAF.docx','Ficha_Proposta_PF_Conjuge_PRONAF.docx',
    'Ficha_Proposta_PF_Avalista_PRONAF.docx','Ficha_Proposta_PF_AvalistaConjuge_PRONAFa.docx',
    'Declaracao_de_Desenvolvimento_de_Atividade.docx',
    'Declaracao_de_Desenvolvimento_de_Atividade_Pronaf_AC.docx',
    'Contrato_de_Prestacao_de_Servicos.docx','Contrato_de_Prestacao_de_Servicos_Pronaf_AC.docx',
    'Contrato_Particular_de_Assessoria_Tecnica.docx','Capa_do_Projeto.docx',
  ];
  for (const t of templates) {
    await window.gerarDocDOCX(t, null);
    await new Promise(r => setTimeout(r, 400));
  }
  toast('📦 Todos os documentos DOCX foram gerados!', 'ok');
};

// Histórico de documentos
window.histDocsSaveCliente = async function (cpf, nomeDoc) {
  const clienteId = getClienteId();
  if (!clienteId) return;
  try {
    await window.supa.from('historico_documentos').insert({ cliente_id: clienteId, nome_documento: nomeDoc });
  } catch (e) { console.warn('[SCA] Erro histórico doc:', e); }
};


// ═══════════════════════════════════════════════════════════
// 16. CARREGAMENTO APÓS LOGIN
// ═══════════════════════════════════════════════════════════

window.carregarDadosAposLogin = async function () {
  window._scaDadosCarregados = false;
  if (!window.supa) return;

  try {
    const [
      { data: clientesSupa },
      { data: empresaSupa },
      { data: eqSupa },
      { data: logSupa },
    ] = await Promise.all([
      window.supa.from('clientes').select('*').order('codigo'),
      window.supa.from('empresa').select('*').limit(1).maybeSingle(),
      window.supa.from('equipe').select('*').order('nome'),
      window.supa.from('log_atividades').select('*').order('created_at', { ascending: false }).limit(200),
    ]);

    if (clientesSupa?.length > 0) {
      window.clientes = clientesSupa;
      window.clIdx = 0;
      try { clIdx = 0; } catch (e) {}
      if (typeof exibirCliente === 'function') exibirCliente(0);
      if (typeof atualizarDropdownElaboracao === 'function') atualizarDropdownElaboracao();
    }

    if (empresaSupa) {
      window._scaCache = window._scaCache || {};
      // Mapeia nomes do banco → nomes usados no formulário empresa-*
      window._scaCache.empresa = {
        cnpj: empresaSupa.cnpj, razao: empresaSupa.razao_social,
        fantasia: empresaSupa.nome_fantasia, ie: empresaSupa.inscricao_estadual,
        abertura: empresaSupa.data_abertura, atividade: empresaSupa.atividade,
        responsavel: empresaSupa.responsavel, crea: empresaSupa.crea,
        conselho: empresaSupa.conselho,       // migration v4
        logradouro: empresaSupa.logradouro, numero: empresaSupa.numero,
        bairro: empresaSupa.bairro, uf: empresaSupa.uf, cidade: empresaSupa.cidade,
        cep: empresaSupa.cep, ddd: empresaSupa.ddd_tel,
        tel: empresaSupa.telefone, cel: empresaSupa.celular,
        email: empresaSupa.email, site: empresaSupa.site, logo_url: empresaSupa.logo_url,
      };
      window._scaCache.empresa_logo_url = empresaSupa.logo_url || null;
      if (typeof carregarDadosEmpresa === 'function') carregarDadosEmpresa();
    }

    if (eqSupa) {
      window.equipe = eqSupa;
      if (window._scaCache) window._scaCache.equipe = eqSupa;
      if (typeof renderizarEquipe === 'function') renderizarEquipe();
    }

    if (logSupa) {
      window._scaLog = logSupa;
      if (typeof renderizarLogCompleto === 'function') renderizarLogCompleto();
      if (typeof renderizarDashboard === 'function')   renderizarDashboard();
    }

    window._scaDadosCarregados = true;
    console.log('[SCA] ✅ Dados carregados do Supabase.');
  } catch (e) {
    window._scaDadosCarregados = true;
    console.warn('[SCA] Erro ao carregar dados:', e);
  }
};


// ═══════════════════════════════════════════════════════════
// 17. CARREGAR DADOS DO CLIENTE (ao navegar)
// ═══════════════════════════════════════════════════════════

window.carregarDadosClienteSupabase = async function (clienteId) {
  if (!window.supa || !clienteId) return;

  try {
    const [
      { data: dp }, { data: end }, { data: banc },
      { data: conj }, { data: aval }, { data: emp },
      { data: arr }, { data: prop }, { data: opAt },
      { data: agrTemp }, { data: agrPerm }, { data: agrOutras },
      { data: agrExtr }, { data: agrAgro }, { data: agrRenda },
      { data: pecBov }, { data: pecLeite }, { data: pecEqu },
      { data: pecCap }, { data: pecLcap }, { data: pecOvi },
      { data: pecSui }, { data: pecAves }, { data: pecOut },
    ] = await Promise.all([
      window.supa.from('clientes_dados_pessoais').select('*').eq('cliente_id', clienteId).maybeSingle(),
      window.supa.from('clientes_endereco').select('*').eq('cliente_id', clienteId).maybeSingle(),
      window.supa.from('clientes_bancarios').select('*').eq('cliente_id', clienteId).maybeSingle(),
      window.supa.from('conjuges').select('*').eq('cliente_id', clienteId).maybeSingle(),
      window.supa.from('avalistas').select('*').eq('cliente_id', clienteId).maybeSingle(),
      window.supa.from('participante_empresa').select('*').eq('cliente_id', clienteId).maybeSingle(),
      window.supa.from('arrendantes').select('*').eq('cliente_id', clienteId).limit(1).maybeSingle(),
      window.supa.from('propriedades').select('*').eq('cliente_id', clienteId).maybeSingle(),
      window.supa.from('operacao_atual').select('*').eq('cliente_id', clienteId).maybeSingle(), // ← adicionado
      window.supa.from('agr_temporaria').select('*').eq('cliente_id', clienteId).maybeSingle(),
      window.supa.from('agr_permanente').select('*').eq('cliente_id', clienteId).maybeSingle(),
      window.supa.from('agr_outras_culturas').select('*').eq('cliente_id', clienteId).maybeSingle(),
      window.supa.from('agr_extrativismo').select('*').eq('cliente_id', clienteId).maybeSingle(),
      window.supa.from('agr_agroindustria').select('*').eq('cliente_id', clienteId).maybeSingle(),
      window.supa.from('agr_renda_fora').select('*').eq('cliente_id', clienteId).maybeSingle(),
      window.supa.from('pec_bovino').select('*').eq('cliente_id', clienteId).maybeSingle(),
      window.supa.from('pec_leite_bovino').select('*').eq('cliente_id', clienteId).maybeSingle(),
      window.supa.from('pec_equino').select('*').eq('cliente_id', clienteId).maybeSingle(),
      window.supa.from('pec_caprino').select('*').eq('cliente_id', clienteId).maybeSingle(),
      window.supa.from('pec_leite_caprino').select('*').eq('cliente_id', clienteId).maybeSingle(),
      window.supa.from('pec_ovino').select('*').eq('cliente_id', clienteId).maybeSingle(),
      window.supa.from('pec_suino').select('*').eq('cliente_id', clienteId).maybeSingle(),
      window.supa.from('pec_aves').select('*').eq('cliente_id', clienteId).maybeSingle(),
      window.supa.from('pec_outros').select('*').eq('cliente_id', clienteId).maybeSingle(),
    ]);

    const idx = (typeof clIdx !== 'undefined' && clIdx >= 0) ? clIdx : 0;
    if (!window.clientes?.[idx]) return;
    const c = window.clientes[idx];

    if (dp)   c.dados_pessoais = dp;
    if (end)  c.endereco = end;
    if (banc) c.bancarios = banc;
    if (prop) c.propriedade = prop;
    if (opAt) c.operacao_atual = opAt;   // ← adicionado

    c.participantes = c.participantes || {};
    if (conj) c.participantes.conjugue  = conj;
    if (aval) c.participantes.avalista  = aval;
    if (emp)  c.participantes.empresa   = emp;
    if (arr)  c.participantes.arrendante = arr;

    // Mapeia banco → objeto de campos de UI
    c.agricola = c.agricola || {};
    if (agrTemp)  c.agricola.temp   = { 'agr-temp-cultura': agrTemp.cultura, 'agr-temp-area': agrTemp.area_ha, 'agr-temp-produtividade': agrTemp.produtividade_kg_ha, 'agr-temp-producao': agrTemp.producao_total_kg, 'agr-temp-preco': agrTemp.preco_unitario, 'agr-temp-receita': agrTemp.receita_bruta, 'agr-temp-periodo': agrTemp.periodo_colheita, 'agr-temp-destino': agrTemp.destino_producao };
    if (agrPerm)  c.agricola.perm   = { 'agr-perm-cultura': agrPerm.cultura, 'agr-perm-area': agrPerm.area_ha, 'agr-perm-plantas': agrPerm.num_plantas, 'agr-perm-prod-planta': agrPerm.prod_por_planta_kg, 'agr-perm-producao': agrPerm.producao_total_kg, 'agr-perm-preco': agrPerm.preco_unitario, 'agr-perm-receita': agrPerm.receita_bruta, 'agr-perm-ano': agrPerm.ano_plantio };
    if (agrOutras)c.agricola.outras = { 'agr-outras-desc': agrOutras.descricao, 'agr-outras-area': agrOutras.area_ha, 'agr-outras-qtd': agrOutras.quantidade, 'agr-outras-unidade': agrOutras.unidade, 'agr-outras-preco': agrOutras.preco_unitario, 'agr-outras-receita': agrOutras.receita_bruta };
    if (agrExtr)  c.agricola.extr   = { 'agr-extr-produto': agrExtr.produto, 'agr-extr-area': agrExtr.area_ha, 'agr-extr-qtd': agrExtr.quantidade_kg, 'agr-extr-periodo': agrExtr.periodo_coleta, 'agr-extr-preco': agrExtr.preco_unitario, 'agr-extr-receita': agrExtr.receita_bruta, 'agr-extr-destino': agrExtr.destino };
    if (agrAgro)  c.agricola.agro   = { 'agr-agro-produto': agrAgro.produto, 'agr-agro-qtd': agrAgro.quantidade, 'agr-agro-unidade': agrAgro.unidade, 'agr-agro-preco': agrAgro.preco_unitario, 'agr-agro-receita': agrAgro.receita_bruta, 'agr-agro-periodo': agrAgro.periodo };
    if (agrRenda) c.agricola.renda  = { 'agr-renda-desc': agrRenda.descricao, 'agr-renda-mensal': agrRenda.valor_mensal, 'agr-renda-meses': agrRenda.meses_no_ano, 'agr-renda-anual': agrRenda.valor_anual, 'agr-renda-responsavel': agrRenda.responsavel, 'agr-renda-origem': agrRenda.origem };

    c.pecuaria = c.pecuaria || {};
    if (pecBov)   c.pecuaria.bov   = { 'pec-bov-raca': pecBov.raca_tipo, 'pec-bov-cabecas': pecBov.num_cabecas, 'pec-bov-peso': pecBov.peso_medio_kg, 'pec-bov-finalidade': pecBov.finalidade, 'pec-bov-preco': pecBov.preco_arroba, 'pec-bov-vendidas': pecBov.cabecas_vendidas_ano, 'pec-bov-receita': pecBov.receita_bruta, 'pec-bov-rebanho': pecBov.valor_rebanho };
    if (pecLeite) c.pecuaria.leite = { 'pec-leite-vacas': pecLeite.num_vacas_lactacao, 'pec-leite-prod-dia': pecLeite.producao_vaca_dia_l, 'pec-leite-dias': pecLeite.dias_lactacao, 'pec-leite-total': pecLeite.producao_total_l, 'pec-leite-preco': pecLeite.preco_leite_l, 'pec-leite-receita': pecLeite.receita_bruta };
    if (pecEqu)   c.pecuaria.equ   = { 'pec-equ-raca': pecEqu.raca_tipo, 'pec-equ-cabecas': pecEqu.num_cabecas, 'pec-equ-finalidade': pecEqu.finalidade, 'pec-equ-preco': pecEqu.preco_unitario, 'pec-equ-vendidas': pecEqu.unidades_vendidas, 'pec-equ-receita': pecEqu.receita_bruta };
    if (pecCap)   c.pecuaria.cap   = { 'pec-cap-raca': pecCap.raca_tipo, 'pec-cap-cabecas': pecCap.num_cabecas, 'pec-cap-finalidade': pecCap.finalidade, 'pec-cap-preco': pecCap.preco_unitario, 'pec-cap-vendidas': pecCap.unidades_vendidas, 'pec-cap-receita': pecCap.receita_bruta };
    if (pecLcap)  c.pecuaria.lcap  = { 'pec-lcap-cabras': pecLcap.num_cabras_lactacao, 'pec-lcap-prod-dia': pecLcap.producao_dia_l, 'pec-lcap-dias': pecLcap.dias_lactacao, 'pec-lcap-total': pecLcap.producao_total_l, 'pec-lcap-preco': pecLcap.preco_leite_l, 'pec-lcap-receita': pecLcap.receita_bruta };
    if (pecOvi)   c.pecuaria.ovi   = { 'pec-ovi-raca': pecOvi.raca_tipo, 'pec-ovi-cabecas': pecOvi.num_cabecas, 'pec-ovi-finalidade': pecOvi.finalidade, 'pec-ovi-preco': pecOvi.preco_unitario, 'pec-ovi-vendidas': pecOvi.unidades_vendidas, 'pec-ovi-receita': pecOvi.receita_bruta };
    if (pecSui)   c.pecuaria.sui   = { 'pec-sui-raca': pecSui.raca_tipo, 'pec-sui-cabecas': pecSui.num_cabecas, 'pec-sui-peso': pecSui.peso_medio_kg, 'pec-sui-preco': pecSui.preco_unitario, 'pec-sui-vendidas': pecSui.unidades_vendidas, 'pec-sui-receita': pecSui.receita_bruta };
    if (pecAves)  c.pecuaria.aves  = { 'pec-aves-especie': pecAves.especie, 'pec-aves-qtd': pecAves.num_aves, 'pec-aves-ovos': pecAves.ovos_por_dia, 'pec-aves-preco': pecAves.preco_unitario, 'pec-aves-vendidas': pecAves.aves_vendidas_ano, 'pec-aves-receita': pecAves.receita_bruta };
    if (pecOut)   c.pecuaria.out   = { 'pec-out-desc': pecOut.descricao, 'pec-out-qtd': pecOut.quantidade, 'pec-out-unidade': pecOut.unidade, 'pec-out-preco': pecOut.preco_unitario, 'pec-out-vendidas': pecOut.unidades_vendidas, 'pec-out-receita': pecOut.receita_bruta };

    // Dispara funções de render
    ['carregarDadosPessoais','carregarEndereco','carregarDadosBancarios','carregarOperacaoAtual',
     'carregarParticipantes','carregarAgricola','carregarPecuaria','carregarPropriedade',
     'carregarStatusProcesso','renderizarAnexos','renderizarOperacoes','renderizarHistoricoDocs',
    ].forEach(fn => { if (typeof window[fn] === 'function') window[fn](idx); });

    console.log('[SCA] ✅ Dados do cliente carregados.');
  } catch (e) { console.warn('[SCA] Erro ao carregar dados do cliente:', e); }
};


// ═══════════════════════════════════════════════════════════
// 18. FUNÇÕES setVal / carregar campos na tela
// ═══════════════════════════════════════════════════════════

function setVal(id, val) {
  const el = document.getElementById(id);
  if (!el) return;
  el.value = (val === null || val === undefined) ? '' : val;
}

window.carregarDadosPessoais = function (idx) {
  const dp = window.clientes?.[idx ?? window.clIdx]?.dados_pessoais || {};
  setVal('dp-sexo', dp.sexo); setVal('dp-apelido', dp.apelido);
  setVal('dp-tipo-id', dp.tipo_identidade); setVal('dp-num-di', dp.numero_di);
  setVal('dp-data-emissao', dp.data_emissao_di); setVal('dp-orgao', dp.orgao_emissor);
  setVal('dp-uf-orgao', dp.uf_orgao_emissor); setVal('dp-titulo', dp.numero_titulo);
  setVal('dp-nasc', dp.data_nascimento); setVal('dp-uf-nasc', dp.uf_nascimento);
  setVal('dp-naturalidade', dp.naturalidade); setVal('dp-estado-civil', dp.estado_civil);
  setVal('dp-regime', dp.regime_casamento); setVal('dp-pai', dp.nome_pai);
  setVal('dp-mae', dp.nome_mae); setVal('dp-caf', dp.numero_caf);
  setVal('dp-escolaridade', dp.escolaridade);
  setVal('dp-financiamento', dp.ja_fez_financiamento ? 'SIM' : 'NÃO');
  setVal('dp-exposto', dp.exposto_politicamente ? 'SIM' : 'NÃO');
  setVal('dp-beneficiario', dp.beneficiario_pol_publicas);
  if (dp.data_nascimento && typeof calcularIdade === 'function') calcularIdade();
};

window.carregarEndereco = function (idx) {
  const e = window.clientes?.[idx ?? window.clIdx]?.endereco || {};
  setVal('end-logradouro', e.logradouro); setVal('end-numero', e.numero);
  setVal('end-bairro', e.bairro); setVal('end-uf', e.uf);
  setVal('end-cidade', e.cidade); setVal('end-cep', e.cep);
  setVal('end-ddd1', e.ddd_cel1); setVal('end-cel1', e.celular1);
  setVal('end-ddd2', e.ddd_cel2); setVal('end-cel2', e.celular2);
  setVal('end-ddd-res', e.ddd_residencial); setVal('end-res', e.tel_residencial);
  setVal('end-email', e.email);
};

window.carregarDadosBancarios = function (idx) {
  const b = window.clientes?.[idx ?? window.clIdx]?.bancarios || {};
  setVal('banc-banco-proj', b.banco_projeto); setVal('banc-agencia-proj', b.agencia_projeto);
  setVal('banc-uf-agencia', b.uf_agencia); setVal('banc-cidade-agencia', b.cidade_agencia);
  setVal('banc-linha', b.linha_credito); setVal('banc-tipo-proj', b.tipo_projeto);
  setVal('banc-tipo-cliente', b.tipo_cliente); setVal('banc-porte', b.porte_cliente);
  setVal('banc-aptidao', b.aptidao); setVal('banc-cultura', b.cultura_especie);
  setVal('banc-experiencia', b.experiencia_anos); setVal('banc-banco-conta', b.banco_conta);
  setVal('banc-agencia-conta', b.agencia_conta); setVal('banc-conta', b.conta_digito);
  setVal('banc-uf-conta', b.uf_conta); setVal('banc-cidade-conta', b.cidade_conta);
};

window.carregarOperacaoAtual = function (idx) {
  const o = window.clientes?.[idx ?? window.clIdx]?.operacao_atual || {};
  setVal('oat-banco', o.banco); setVal('oat-contrato', o.num_contrato);
  setVal('oat-finalidade', o.finalidade); setVal('oat-valor', o.valor_total);
  setVal('oat-emissao', o.data_emissao); setVal('oat-comis-banc-pct', o.comissao_banco_pct);
  setVal('oat-comis-banc-rs', o.comissao_banco_rs); setVal('oat-comis-part-pct', o.comissao_part_pct);
  setVal('oat-comis-part-rs', o.comissao_part_rs); setVal('oat-parc1', o.data_1a_parcela);
  setVal('oat-parc-final', o.data_parcela_final); setVal('oat-carencia-sel', o.carencia_meses);
  setVal('oat-prazo-sel', o.prazo_meses); setVal('oat-safra', o.ano_safra);
  setVal('oat-carencia-atual', o.carencia_atual); setVal('oat-prazo-atual', o.prazo_atual);
};

window.carregarParticipantes = function (idx) {
  const p = window.clientes?.[idx ?? window.clIdx]?.participantes || {};
  const cj = p.conjugue || {};
  setVal('conj-cpf', cj.cpf); setVal('conj-nome', cj.nome); setVal('conj-nasc', cj.data_nascimento);
  setVal('conj-tipo-id', cj.tipo_identidade); setVal('conj-di', cj.numero_di);
  setVal('conj-emissao', cj.data_emissao); setVal('conj-orgao', cj.orgao_emissor);
  setVal('conj-uf-orgao', cj.uf_orgao); setVal('conj-sexo', cj.sexo);
  setVal('conj-escolaridade', cj.escolaridade); setVal('conj-profissao', cj.profissao);
  setVal('conj-pai', cj.nome_pai); setVal('conj-mae', cj.nome_mae);
  setVal('conj-ddd', cj.ddd_celular); setVal('conj-cel', cj.celular);
  setVal('conj-email', cj.email); setVal('conj-naturalidade', cj.naturalidade);
  setVal('conj-uf-nasc', cj.uf_nascimento);

  const av = p.avalista || {};
  setVal('aval-cpf', av.cpf); setVal('aval-nome', av.nome); setVal('aval-nasc', av.data_nascimento);
  setVal('aval-tipo-id', av.tipo_identidade); setVal('aval-di', av.numero_di);
  setVal('aval-emissao', av.data_emissao); setVal('aval-orgao', av.orgao_emissor);
  setVal('aval-uf-orgao', av.uf_orgao); setVal('aval-sexo', av.sexo);
  setVal('aval-estado-civil', av.estado_civil); setVal('aval-profissao', av.profissao);
  setVal('aval-pai', av.nome_pai); setVal('aval-mae', av.nome_mae);
  setVal('aval-ddd', av.ddd_celular); setVal('aval-cel', av.celular);
  setVal('aval-email', av.email);

  const em = p.empresa || {};
  setVal('emp-cnpj', em.cnpj); setVal('emp-razao', em.razao_social);
  setVal('emp-fantasia', em.nome_fantasia); setVal('emp-abertura', em.data_abertura);
  setVal('emp-atividade', em.atividade); setVal('emp-responsavel', em.responsavel);
  setVal('emp-cargo', em.cargo); setVal('emp-ddd', em.ddd_tel);
  setVal('emp-tel', em.telefone); setVal('emp-email', em.email);

  const ar = p.arrendante || {};
  setVal('arr-cpf', ar.cpf); setVal('arr-nome', ar.nome);
  setVal('arr-tipo-id', ar.tipo_identidade); setVal('arr-di', ar.numero_di);
  setVal('arr-emissao', ar.data_emissao); setVal('arr-orgao', ar.orgao_emissor);
  setVal('arr-logradouro', ar.logradouro); setVal('arr-bairro', ar.bairro);
  setVal('arr-uf', ar.uf); setVal('arr-cidade', ar.cidade);
  setVal('arr-tel', ar.telefone); setVal('arr-email', ar.email);
};

window.carregarPropriedade = function (idx) {
  const pr = window.clientes?.[idx ?? window.clIdx]?.propriedade || {};
  setVal('prop-tipo', pr.tipo_propriedade);
  setVal('prop-prop-nome', pr.prop_nome); setVal('prop-prop-cpf', pr.prop_cpf);
  setVal('prop-prop-tipo-doc', pr.prop_tipo_doc); setVal('prop-prop-num-doc', pr.prop_num_doc);
  setVal('prop-prop-data-emis', pr.prop_data_emissao); setVal('prop-prop-orgao', pr.prop_orgao);
  setVal('prop-prop-uf-emis', pr.prop_uf_emissao); setVal('prop-prop-logr', pr.prop_logradouro);
  setVal('prop-prop-num', pr.prop_numero); setVal('prop-prop-bairro', pr.prop_bairro);
  setVal('prop-prop-uf', pr.prop_uf); setVal('prop-prop-cidade', pr.prop_cidade);
  setVal('prop-prop-cep', pr.prop_cep); setVal('prop-prop-ddd', pr.prop_ddd);
  setVal('prop-prop-tel', pr.prop_tel); setVal('prop-prop-email', pr.prop_email);
  setVal('prop-ger-nome', pr.nome_propriedade); setVal('prop-ger-denom', pr.denominacao);
  setVal('prop-ger-ie', pr.inscricao_estadual); setVal('prop-ger-nirf', pr.nirf);
  setVal('prop-ger-incra', pr.incra); setVal('prop-ger-logr', pr.ger_logradouro);
  setVal('prop-ger-bairro', pr.ger_bairro); setVal('prop-ger-cep', pr.ger_cep);
  setVal('prop-ger-uf', pr.ger_uf); setVal('prop-ger-municipio', pr.ger_municipio);
  setVal('prop-viz-norte', pr.viz_norte); setVal('prop-viz-sul', pr.viz_sul);
  setVal('prop-viz-leste', pr.viz_leste); setVal('prop-viz-oeste', pr.viz_oeste);
  setVal('prop-viz-test1', pr.testemunha1_nome); setVal('prop-viz-cpf1', pr.testemunha1_cpf);
  setVal('prop-viz-test2', pr.testemunha2_nome); setVal('prop-viz-cpf2', pr.testemunha2_cpf);
  setVal('prop-ed-solo', pr.tipo_solo); setVal('prop-ed-textura', pr.textura_solo);
  setVal('prop-ed-relevo', pr.relevo); setVal('prop-ed-drenagem', pr.drenagem);
  setVal('prop-ed-precip', pr.precipitacao_mm); setVal('prop-ed-temp', pr.temperatura_media_c);
  setVal('prop-ed-alt', pr.altitude_m); setVal('prop-ed-bioma', pr.bioma);
  setVal('prop-area-total', pr.area_total_ha); setVal('prop-area-agri', pr.area_agricultavel_ha);
  setVal('prop-area-past', pr.area_pastagem_ha); setVal('prop-area-res', pr.area_reserva_ha);
  setVal('prop-area-aprov', pr.area_aproveitada_ha); setVal('prop-area-proj', pr.area_projeto_ha);
  setVal('prop-area-app', pr.area_app_ha); setVal('prop-area-inapta', pr.area_inapta_ha);
  setVal('prop-doc-tipo', pr.doc_tipo); setVal('prop-doc-num', pr.doc_numero);
  setVal('prop-doc-data', pr.doc_data); setVal('prop-doc-cart', pr.doc_cartorio);
  setVal('prop-doc-car', pr.doc_num_car); setVal('prop-doc-ccir', pr.doc_num_ccir);
  setVal('prop-doc-itr', pr.doc_num_itr); setVal('prop-doc-sit', pr.doc_situacao);
  setVal('prop-benf-desc', pr.benf_descricao); setVal('prop-benf-qtd', pr.benf_quantidade);
  setVal('prop-benf-vunit', pr.benf_valor_unitario); setVal('prop-benf-vtotal', pr.benf_valor_total);
  setVal('prop-seg-seg', pr.seg_seguradora); setVal('prop-seg-apolice', pr.seg_num_apolice);
  setVal('prop-seg-vig', pr.seg_vigencia); setVal('prop-seg-valor', pr.seg_valor_segurado);
  setVal('prop-nota-resp', pr.nota_responsavel); setVal('prop-nota-crea', pr.nota_crea);
  setVal('prop-nota-data', pr.nota_data_visita);
  const obs = document.getElementById('prop-nota-obs');
  if (obs) obs.value = pr.nota_observacoes || '';
  // Migration v3
  setVal('prop-tipo-estrada', pr.tipo_estrada); setVal('prop-denom-estrada', pr.denominacao_estrada);
  setVal('prop-tipo-povoado', pr.tipo_povoado); setVal('prop-denom-povoado', pr.denominacao_povoado);
  setVal('prop-dist-sede', pr.distancia_km_sede); setVal('prop-latitude', pr.latitude_sede);
  setVal('prop-longitude', pr.longitude_sede);
  const itin = document.getElementById('prop-itinerario');
  if (itin) itin.value = pr.intinerario || '';
};

window.carregarAgricola = function (idx) {
  const a = window.clientes?.[idx ?? window.clIdx]?.agricola || {};
  const sv = (obj) => Object.entries(obj).forEach(([id, v]) => setVal(id, v));
  if (a.temp)  sv(a.temp);  if (a.perm)  sv(a.perm);
  if (a.outras)sv(a.outras); if (a.extr) sv(a.extr);
  if (a.agro)  sv(a.agro);  if (a.renda) sv(a.renda);
  if (typeof atualizarTotalAgricola === 'function') atualizarTotalAgricola();
};

window.carregarPecuaria = function (idx) {
  const pc = window.clientes?.[idx ?? window.clIdx]?.pecuaria || {};
  const sv = (obj) => Object.entries(obj).forEach(([id, v]) => setVal(id, v));
  Object.values(pc).forEach(obj => { if (obj) sv(obj); });
  if (typeof atualizarTotalPec === 'function') atualizarTotalPec();
};


// ═══════════════════════════════════════════════════════════
// 19. DASHBOARD
// ═══════════════════════════════════════════════════════════

window.renderizarDashboard = async function () {
  if (!window.supa) return;
  try {
    const [
      { count: totalClientes },
      { count: totalEquipe },
      { count: totalDocs },
      { count: totalAndamento },
    ] = await Promise.all([
      window.supa.from('clientes').select('*', { count: 'exact', head: true }),
      window.supa.from('equipe').select('*', { count: 'exact', head: true }),
      window.supa.from('historico_documentos').select('*', { count: 'exact', head: true }),
      window.supa.from('elaboracao_projetos').select('*', { count: 'exact', head: true })
        .eq('status_processo', 'Em andamento'),
    ]);

    const grid = document.getElementById('dash-cards');
    if (grid) {
      grid.innerHTML = [
        { num: totalClientes || 0, label: 'Clientes',    icon: '👤' },
        { num: totalEquipe   || 0, label: 'Equipe',      icon: '👥' },
        { num: totalDocs     || 0, label: 'Documentos',  icon: '📄' },
        { num: totalAndamento|| 0, label: 'Em Andamento',icon: '🔄' },
      ].map(c => `
        <div class="dash-card">
          <div class="dash-card-num">${c.num}</div>
          <div class="dash-card-label">${c.icon} ${c.label}</div>
        </div>`).join('');
    }

    const [
      { data: ultClientes },
      { data: ultDocs },
    ] = await Promise.all([
      window.supa.from('clientes').select('nome,cpf,data_cadastro').order('created_at', { ascending: false }).limit(5),
      window.supa.from('historico_documentos').select('nome_documento,gerado_em').order('gerado_em', { ascending: false }).limit(5),
    ]);

    const elCli = document.getElementById('dash-ultimos-clientes');
    if (elCli && ultClientes) {
      elCli.innerHTML = ultClientes.length === 0
        ? '<p class="empty-state" style="margin:0;">Nenhum cliente cadastrado.</p>'
        : ultClientes.map(c => `
          <div class="dash-item">
            <span class="dash-item-icon">👤</span>
            <div class="dash-item-info"><b>${c.nome}</b><br><span style="color:var(--c-text-lt);font-size:.75rem;">${c.cpf || ''}</span></div>
            <div class="dash-item-time">${c.data_cadastro ? new Date(c.data_cadastro + 'T12:00:00').toLocaleDateString('pt-BR') : ''}</div>
          </div>`).join('');
    }

    const elDocs = document.getElementById('dash-ultimos-docs');
    if (elDocs && ultDocs) {
      elDocs.innerHTML = ultDocs.length === 0
        ? '<p class="empty-state" style="margin:0;">Nenhum documento gerado.</p>'
        : ultDocs.map(d => `
          <div class="dash-item">
            <span class="dash-item-icon">📄</span>
            <div class="dash-item-info" style="font-size:.82rem;">${d.nome_documento}</div>
            <div class="dash-item-time">${d.gerado_em ? new Date(d.gerado_em).toLocaleDateString('pt-BR') : ''}</div>
          </div>`).join('');
    }
  } catch (e) { console.warn('[SCA] Erro dashboard:', e); }
};

window.renderizarLogCompleto = async function (forcar) {
  const lista = document.getElementById('log-atividades-lista');
  if (!lista || !window.supa) return;

  if (!window._scaLog || forcar) {
    try {
      const { data } = await window.supa.from('log_atividades')
        .select('*').order('created_at', { ascending: false }).limit(100);
      window._scaLog = data || [];
    } catch (e) { return; }
  }

  const log = window._scaLog || [];
  lista.innerHTML = log.length === 0
    ? '<p style="padding:14px;color:var(--c-text-lt);font-style:italic;font-size:.82rem;">Nenhuma atividade registrada.</p>'
    : log.map(item => `
      <div class="log-item">
        <span class="log-icon">${item.icone || '📌'}</span>
        <div class="log-texto">${item.descricao}</div>
        <div class="log-tempo">${item.created_at ? new Date(item.created_at).toLocaleString('pt-BR') : ''}</div>
      </div>`).join('');
};


// ═══════════════════════════════════════════════════════════
// 20. EQUIPE — renderização com design system
// ═══════════════════════════════════════════════════════════

window.renderizarEquipe = function () {
  const lista = document.getElementById('equipe-lista');
  if (!lista) return;
  const eq = window.equipe || window._scaCache?.equipe || [];

  if (eq.length === 0) {
    lista.innerHTML = `<tr><td colspan="9" style="padding:30px;text-align:center;color:var(--c-text-lt);font-style:italic;font-size:.86rem;background:var(--c-sage);">Nenhum membro cadastrado. Clique em "Adicionar Membro" para começar.</td></tr>`;
    return;
  }

  lista.innerHTML = eq.map((m, i) => {
    const nasc = m.data_nascimento ? m.data_nascimento.split('-').reverse().join('/') : '—';
    const bgRow = i % 2 === 0 ? 'var(--c-white)' : 'var(--c-sage)';
    // cargo_funcao é o campo real da tabela (migration v4 adiciona alias `cargo`)
    const cargo = m.cargo_funcao || m.cargo || '—';
    return `<tr style="background:${bgRow};border-bottom:1px solid var(--c-border-lt);font-size:.78rem;">
      <td style="padding:8px 12px;text-align:center;font-weight:700;color:var(--c-pine);border-right:1px solid var(--c-border-lt);white-space:nowrap;">${String(i + 1).padStart(3, '0')}</td>
      <td style="padding:8px 12px;font-weight:700;color:var(--c-text);border-right:1px solid var(--c-border-lt);">${m.nome || '—'}</td>
      <td style="padding:8px 12px;text-align:center;border-right:1px solid var(--c-border-lt);white-space:nowrap;font-family:monospace;font-size:.75rem;">${m.cpf || '—'}</td>
      <td style="padding:8px 12px;text-align:center;border-right:1px solid var(--c-border-lt);white-space:nowrap;">${nasc}</td>
      <td style="padding:8px 12px;color:var(--c-fern);font-weight:600;border-right:1px solid var(--c-border-lt);">${cargo}</td>
      <td style="padding:8px 12px;text-align:center;border-right:1px solid var(--c-border-lt);white-space:nowrap;">${m.crea_cfb || '—'}</td>
      <td style="padding:8px 12px;text-align:center;border-right:1px solid var(--c-border-lt);white-space:nowrap;">${m.celular || '—'}</td>
      <td style="padding:8px 12px;border-right:1px solid var(--c-border-lt);font-size:.75rem;">${m.email || '—'}</td>
      <td style="padding:8px 12px;text-align:center;white-space:nowrap;">
        <button onclick="editarMembro(${i})" style="background:var(--c-amber,#d97706);color:#fff;border:none;border-radius:6px;padding:5px 10px;cursor:pointer;font-size:.75rem;font-weight:600;margin-right:4px;">✏️</button>
        <button onclick="excluirMembro(${i})" style="background:var(--c-red,#dc2626);color:#fff;border:none;border-radius:6px;padding:5px 10px;cursor:pointer;font-size:.75rem;font-weight:600;">🗑</button>
      </td>
    </tr>`;
  }).join('');
};


// ═══════════════════════════════════════════════════════════
// 21. RENDERIZAÇÕES AUXILIARES
// ═══════════════════════════════════════════════════════════

window.renderizarAnexos = function (idx) {
  const c = window.clientes?.[idx ?? window.clIdx];
  const lista = document.getElementById('anx-lista');
  if (!lista) return;
  const anexos = c?.anexos || [];
  lista.innerHTML = anexos.length === 0
    ? '<p style="padding:12px;color:var(--c-text-lt);font-style:italic;font-size:.82rem;">Nenhum anexo.</p>'
    : anexos.map((a, i) => `
      <div class="dash-item" style="gap:8px;">
        <span class="dash-item-icon">📎</span>
        <div class="dash-item-info" style="flex:1;font-size:.82rem;">
          <b>${a.descricao || a.arquivo_nome || 'Anexo'}</b>
          ${a.arquivo_nome ? `<br><span style="color:var(--c-text-lt);font-size:.73rem;">${a.arquivo_nome}</span>` : ''}
        </div>
        ${a.arquivo_url ? `<a href="${a.arquivo_url}" target="_blank" style="font-size:.78rem;color:var(--c-fern);font-weight:600;">📥 Ver</a>` : ''}
        <button onclick="excluirAnexo(${i})" class="action-btn btn-del" title="Excluir">🗑️</button>
      </div>`).join('');
};

window.renderizarHistoricoDocs = async function () {
  const lista = document.getElementById('hist-docs-lista');
  if (!lista || !window.supa) return;
  const clienteId = getClienteId();
  if (!clienteId) {
    lista.innerHTML = '<p style="padding:10px;color:var(--c-text-lt);font-style:italic;font-size:.82rem;">Selecione um cliente.</p>';
    return;
  }
  try {
    const { data } = await window.supa.from('historico_documentos')
      .select('*').eq('cliente_id', clienteId).order('gerado_em', { ascending: false }).limit(50);
    lista.innerHTML = !data || data.length === 0
      ? '<p style="padding:10px;color:var(--c-text-lt);font-style:italic;font-size:.82rem;">Nenhum documento gerado.</p>'
      : data.map(d => `
        <div class="dash-item" style="gap:8px;">
          <span class="dash-item-icon">📄</span>
          <div class="dash-item-info" style="flex:1;font-size:.82rem;">${d.nome_documento}</div>
          <div class="dash-item-time">${d.gerado_em ? new Date(d.gerado_em).toLocaleString('pt-BR') : ''}</div>
        </div>`).join('');
  } catch (e) { console.warn('[SCA] Erro histórico docs:', e); }
};

window.renderizarOperacoes = function (idx) {
  const c = window.clientes?.[idx ?? window.clIdx];
  const lista = document.getElementById('ops-lista');
  if (!lista) return;
  const ops = c?.operacoes || [];
  const fmt = v => v ? parseFloat(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : '-';
  lista.innerHTML = ops.length === 0
    ? '<p style="padding:10px;color:var(--c-text-lt);font-style:italic;font-size:.82rem;">Nenhuma operação.</p>'
    : ops.map((o, i) => `
      <div class="dash-item" style="gap:8px;flex-wrap:wrap;">
        <span class="dash-item-icon">📝</span>
        <div class="dash-item-info" style="flex:1;font-size:.82rem;min-width:160px;">
          <b>${o.banco || '-'}</b> — ${o.finalidade || '-'}
          <br><span style="color:var(--c-text-lt);font-size:.74rem;">Contrato: ${o.num_contrato || '-'} | Valor: ${fmt(o.valor_total)}</span>
        </div>
        <button onclick="excluirOperacao(${i})" class="action-btn btn-del" title="Excluir">🗑️</button>
      </div>`).join('');
};

window.renderizarStatusTemplates = async function () {
  const lista = document.getElementById('elab-templates-lista') || document.getElementById('status-templates-lista');
  if (!lista || !window.supa) return;
  const clienteId = getClienteId();
  if (!clienteId) return;
  try {
    const { data } = await window.supa.from('elaboracao_projetos')
      .select('*').eq('cliente_id', clienteId).maybeSingle();
    if (!data) { lista.innerHTML = ''; return; }
    const status = data.status_processo || 'Em andamento';
    const obs    = data.observacao || '';
    lista.innerHTML = `
      <div class="dash-item">
        <span class="dash-item-icon">📋</span>
        <div class="dash-item-info" style="flex:1;font-size:.82rem;">
          <b>Status:</b> ${status}
          ${obs ? `<br><span style="color:var(--c-text-lt);font-size:.76rem;">${obs}</span>` : ''}
        </div>
      </div>`;
  } catch (e) { console.warn('[SCA] Erro renderizarStatusTemplates:', e); }
};

window.carregarStatusProcesso = async function (idx) {
  const c = window.clientes?.[idx ?? window.clIdx];
  const clienteId = c?.id;
  if (!clienteId || !window.supa) return;
  try {
    const { data } = await window.supa.from('elaboracao_projetos')
      .select('*').eq('cliente_id', clienteId).maybeSingle();
    if (!data) return;
    const status = data.status_processo || 'Em andamento';
    const obs    = data.observacao || '';
    setVal('status-obs', obs);
    document.querySelectorAll('.status-btn').forEach(b => b.classList.remove('sel'));
    const keyMap = { 'Em andamento':'andamento','Aguardando assinatura':'assinatura','Concluido':'concluido','Cancelado':'cancelado' };
    const key = keyMap[status];
    const btn = document.getElementById('sbtn-' + key);
    if (btn) btn.classList.add('sel');
    const badge = document.getElementById('status-processo-badge');
    if (badge) { badge.className = 'status-badge status-' + key; badge.textContent = status; }
    if (c) c.elaboracao = data;
  } catch (e) { console.warn('[SCA] Erro ao carregar status:', e); }
};

window.exibirLogoEmpresa = function () {
  const logoUrl = window._scaCache?.empresa_logo_url || window._scaCache?.empresa?.logo_url || null;
  const box = document.getElementById('emp-logo-box');
  if (box && logoUrl) {
    box.innerHTML = `<img src="${logoUrl}" style="width:100%;height:100%;object-fit:contain;" />`;
  }
};


// ═══════════════════════════════════════════════════════════
// 22. BACKUP
// ═══════════════════════════════════════════════════════════

window.fazerBackupNuvem = async function () {
  const btn = document.getElementById('btn-bkp-nuvem');
  const statusEl = document.getElementById('bkp-status-geral');

  function mostrarStatus(msg, tipo) {
    if (!statusEl) return;
    const cores = { ok:['#dcfce7','#14532d'], err:['#fee2e2','#7f1d1d'], warn:['#fef9c3','#92400e'] };
    statusEl.style.display = 'block'; statusEl.textContent = msg;
    statusEl.style.background = cores[tipo]?.[0] || '#fef9c3';
    statusEl.style.color = cores[tipo]?.[1] || '#92400e';
    statusEl.style.padding = '8px 14px'; statusEl.style.borderRadius = '6px';
    statusEl.style.fontSize = '.84rem';
  }

  if (!window.supa) { mostrarStatus('❌ Supabase não conectado.', 'err'); return; }
  const txtOrig = btn?.innerHTML || '☁️ Salvar Backup';
  setBtn(btn, 'loading', txtOrig);

  try {
    const [{ count: nCli }, { count: nEqu }, { count: nDocs }] = await Promise.all([
      window.supa.from('clientes').select('*', { count: 'exact', head: true }),
      window.supa.from('equipe').select('*', { count: 'exact', head: true }),
      window.supa.from('historico_documentos').select('*', { count: 'exact', head: true }),
    ]);
    const { error } = await window.supa.from('backups').insert({
      descricao:    'Backup manual — ' + new Date().toLocaleString('pt-BR'),
      dados:        { gerado_em: new Date().toISOString(), num_clientes: nCli, num_equipe: nEqu, num_docs: nDocs },
      tamanho_bytes:null,
    });
    if (error) throw error;
    mostrarStatus('✅ Backup salvo! (' + new Date().toLocaleString('pt-BR') + ')', 'ok');
    setBtn(btn, 'ok', txtOrig);
    if (typeof listarBackupsNuvem === 'function') listarBackupsNuvem();
    await registrarLogDB('☁️', 'Backup realizado', 'backup', null);
  } catch (e) {
    mostrarStatus('❌ Erro: ' + (e.message || e), 'err');
    setBtn(btn, 'err', txtOrig);
  }
};


// ═══════════════════════════════════════════════════════════
// 23. INTERCEPTAR SELEÇÃO DE ARQUIVO DE ANEXO
// ═══════════════════════════════════════════════════════════

window.onAnxFileSelect = function (input) {
  if (!input.files[0]) return;
  const file = input.files[0];
  window._anxFileName = file.name;
  const lbl = document.getElementById('anx-file-name');
  if (lbl) lbl.textContent = file.name;
  const reader = new FileReader();
  reader.onload = e => { window._anxFileData = e.target.result; };
  reader.readAsDataURL(file);
};


// ─── GARANTIA: sobrescreve qualquer versão antiga do index.html ───
// Este arquivo deve ser carregado APÓS o index.html para que as
// funções aqui definidas (window.salvarParticipante, etc.) prevaleçam.

console.log('[SCA] ✅ sca_supabase.js v2.1 carregado — integração completa e alinhada.');

})();
