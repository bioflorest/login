// ============================================================
//  SCA – Integração Supabase Completa
//  Substitui TODAS as funções de salvar/carregar do sistema
//  para gravar nas tabelas corretas do banco de dados.
//
//  COMO USAR:
//  Adicione este script no index.html, APÓS o bloco do Supabase:
//  <script src="sca_supabase.js"></script>
//  (ou cole o conteúdo dentro de uma tag <script> no final do body)
// ============================================================

(function() {
'use strict';

// ─── UTILITÁRIOS ────────────────────────────────────────────

function n(v) {
  // Converte string vazia para null, mantém 0 como 0
  if (v === '' || v === undefined || v === null) return null;
  return v;
}

function nd(v) {
  // Converte para número decimal ou null
  if (v === '' || v === undefined || v === null) return null;
  const num = parseFloat(String(v).replace(/\./g, '').replace(',', '.'));
  return isNaN(num) ? null : num;
}

function ni(v) {
  // Converte para inteiro ou null
  if (v === '' || v === undefined || v === null) return null;
  const num = parseInt(String(v).replace(/\D/g, ''), 10);
  return isNaN(num) ? null : num;
}

function bool(v) {
  // Converte SIM/NÃO para boolean
  if (v === 'SIM' || v === true) return true;
  if (v === 'NÃO' || v === false) return false;
  return null;
}

function getClienteId() {
  // Retorna o UUID do cliente atual da sessão
  if (typeof clIdx === 'undefined' || clIdx < 0) return null;
  const c = window.clientes && window.clientes[clIdx];
  return (c && c.id) ? c.id : null;
}

function mostrarFeedback(elId, tipo) {
  const el = document.getElementById(elId);
  if (!el) return;
  el.style.display = '';
  setTimeout(() => el.style.display = 'none', 3000);
}

// Registra no log_atividades do Supabase
async function registrarLogDB(icone, descricao, modulo, cliente_id) {
  if (!window.supa) return;
  try {
    await window.supa.from('log_atividades').insert({
      icone, descricao, modulo,
      cliente_id: cliente_id || getClienteId() || null,
    });
    // Atualiza dashboard se visível
    if (typeof renderizarLogCompleto === 'function') renderizarLogCompleto();
    if (typeof renderizarDashboard === 'function') renderizarDashboard();
  } catch(e) { console.warn('Erro log:', e); }
}


// ─── 1. CLIENTES ────────────────────────────────────────────

window.salvarCliente = async function() {
  const cpf    = document.getElementById('cl-cpf')?.value?.trim();
  const nome   = document.getElementById('cl-nome')?.value?.trim();
  const data   = document.getElementById('cl-data')?.value;

  if (!cpf || !nome) {
    alert('CPF e Nome são obrigatórios.'); return;
  }

  if (!window.supa) { alert('Supabase não conectado.'); return; }

  const payload = {
    cpf: n(cpf),
    nome: n(nome),
    data_cadastro: n(data) || null,
  };

  try {
    let clienteId = getClienteId();
    let resultado;

    if (clienteId) {
      // Atualiza existente
      resultado = await window.supa.from('clientes').update(payload).eq('id', clienteId).select().single();
    } else {
      // Insere novo
      resultado = await window.supa.from('clientes').insert(payload).select().single();
    }

    if (resultado.error) throw resultado.error;

    const clienteSalvo = resultado.data;
    clienteId = clienteSalvo.id;

    // Atualiza array local
    if (typeof clIdx !== 'undefined' && clIdx >= 0 && window.clientes) {
      window.clientes[clIdx] = { ...window.clientes[clIdx], ...clienteSalvo };
    } else {
      window.clientes = window.clientes || [];
      window.clientes.push(clienteSalvo);
      window.clIdx = window.clientes.length - 1;
      // Sincroniza a variável local clIdx do escopo global
      try { clIdx = window.clIdx; } catch(e) {}
    }
    // Garante que clModoEdicao seja desativado após salvar
    try { clModoEdicao = false; } catch(e) {}

    // Atualiza código no campo readonly
    const codEl = document.getElementById('cl-codigo');
    if (codEl && clienteSalvo.codigo) codEl.value = clienteSalvo.codigo;

    const st = document.getElementById('cl-status');
    if (st) {
      st.textContent = '✅ Cliente salvo com sucesso!';
      st.style.background = '#d4edda'; st.style.color = '#155724';
      st.style.display = '';
      setTimeout(() => st.style.display = 'none', 3000);
    }

    await registrarLogDB('👤', `Cliente salvo: ${nome}`, 'clientes', clienteId);

    if (typeof atualizarDropdownElaboracao === 'function') atualizarDropdownElaboracao();

  } catch(e) {
    alert('Erro ao salvar cliente: ' + e.message);
    console.error(e);
  }
};

window.excluirCliente = async function() {
  const clienteId = getClienteId();
  if (!clienteId) { alert('Nenhum cliente selecionado.'); return; }
  const nome = window.clientes[clIdx]?.nome || 'este cliente';
  if (!confirm(`Excluir "${nome}"? Esta ação não pode ser desfeita.`)) return;

  try {
    // 1. Apaga do banco
    const { error } = await window.supa.from('clientes').delete().eq('id', clienteId);
    if (error) throw error;

    // 2. Remove do array local
    window.clientes.splice(clIdx, 1);

    // 3. Reordena códigos no Supabase (1, 2, 3... sem buracos)
    const restantes = await window.supa.from('clientes').select('id,codigo').order('codigo', { ascending: true });
    if (restantes.data && restantes.data.length > 0) {
      for (let i = 0; i < restantes.data.length; i++) {
        const novoCode = i + 1;
        if (restantes.data[i].codigo !== novoCode) {
          await window.supa.from('clientes').update({ codigo: novoCode }).eq('id', restantes.data[i].id);
          // Atualiza no array local também
          const localIdx = window.clientes.findIndex(c => c.id === restantes.data[i].id);
          if (localIdx >= 0) window.clientes[localIdx].codigo = novoCode;
        }
      }
    }

    // 4. Atualiza navegação e tela
    window.clIdx = window.clientes.length > 0 ? Math.min(clIdx, window.clientes.length - 1) : -1;
    try { clIdx = window.clIdx; } catch(e) {}
    if (typeof exibirCliente === 'function') exibirCliente(window.clIdx);
    if (typeof atualizarDropdownElaboracao === 'function') atualizarDropdownElaboracao();
    await registrarLogDB('🗑️', `Cliente excluído: ${nome}`, 'clientes', null);
  } catch(e) {
    alert('Erro ao excluir: ' + e.message);
  }
};


// ─── 2. DADOS PESSOAIS ──────────────────────────────────────

window.salvarDadosPessoais = async function() {
  const clienteId = getClienteId();
  if (!clienteId) { alert('Salve o cliente primeiro.'); return; }

  const payload = {
    cliente_id:              clienteId,
    sexo:                    n(document.getElementById('dp-sexo')?.value),
    apelido:                 n(document.getElementById('dp-apelido')?.value),
    tipo_identidade:         n(document.getElementById('dp-tipo-id')?.value),
    numero_di:               n(document.getElementById('dp-num-di')?.value),
    data_emissao_di:         n(document.getElementById('dp-data-emissao')?.value) || null,
    orgao_emissor:           n(document.getElementById('dp-orgao')?.value),
    uf_orgao_emissor:        n(document.getElementById('dp-uf-orgao')?.value),
    numero_titulo:           n(document.getElementById('dp-titulo')?.value),
    data_nascimento:         n(document.getElementById('dp-nasc')?.value) || null,
    uf_nascimento:           n(document.getElementById('dp-uf-nasc')?.value),
    naturalidade:            n(document.getElementById('dp-naturalidade')?.value),
    estado_civil:            n(document.getElementById('dp-estado-civil')?.value),
    regime_casamento:        n(document.getElementById('dp-regime')?.value),
    nome_pai:                n(document.getElementById('dp-pai')?.value),
    nome_mae:                n(document.getElementById('dp-mae')?.value),
    numero_caf:              n(document.getElementById('dp-caf')?.value),
    escolaridade:            n(document.getElementById('dp-escolaridade')?.value),
    ja_fez_financiamento:    document.getElementById('dp-financiamento')?.value === 'SIM',
    exposto_politicamente:   document.getElementById('dp-exposto')?.value === 'SIM',
    beneficiario_pol_publicas: n(document.getElementById('dp-beneficiario')?.value),
  };

  // Idade calculada
  const idadeEl = document.getElementById('dp-idade');
  if (idadeEl?.value) payload.idade = ni(idadeEl.value);

  try {
    const { error } = await window.supa.from('clientes_dados_pessoais')
      .upsert(payload, { onConflict: 'cliente_id' });
    if (error) throw error;

    // Salva também no objeto local para manter compatibilidade
    if (window.clientes && clIdx >= 0) {
      window.clientes[clIdx].dados_pessoais = payload;
    }

    mostrarFeedback('dp-status');
    await registrarLogDB('📋', 'Dados pessoais salvos', 'clientes', clienteId);
  } catch(e) {
    alert('Erro ao salvar dados pessoais: ' + e.message);
    console.error(e);
  }
};


// ─── 3. ENDEREÇO E CONTATOS ─────────────────────────────────

window.salvarEndereco = async function() {
  const clienteId = getClienteId();
  if (!clienteId) { alert('Salve o cliente primeiro.'); return; }

  const payload = {
    cliente_id:     clienteId,
    logradouro:     n(document.getElementById('end-logradouro')?.value),
    numero:         n(document.getElementById('end-numero')?.value),
    bairro:         n(document.getElementById('end-bairro')?.value),
    uf:             n(document.getElementById('end-uf')?.value),
    cidade:         n(document.getElementById('end-cidade')?.value),
    cep:            n(document.getElementById('end-cep')?.value),
    ddd_cel1:       n(document.getElementById('end-ddd1')?.value),
    celular1:       n(document.getElementById('end-cel1')?.value),
    ddd_cel2:       n(document.getElementById('end-ddd2')?.value),
    celular2:       n(document.getElementById('end-cel2')?.value),
    ddd_residencial:n(document.getElementById('end-ddd-res')?.value),
    tel_residencial:n(document.getElementById('end-res')?.value),
    email:          n(document.getElementById('end-email')?.value),
  };

  try {
    const { error } = await window.supa.from('clientes_endereco')
      .upsert(payload, { onConflict: 'cliente_id' });
    if (error) throw error;

    if (window.clientes && clIdx >= 0) window.clientes[clIdx].endereco = payload;
    mostrarFeedback('end-status');
    await registrarLogDB('📍', 'Endereço e contatos salvos', 'clientes', clienteId);
  } catch(e) {
    alert('Erro ao salvar endereço: ' + e.message);
  }
};


// ─── 4. DADOS BANCÁRIOS E PROJETO ───────────────────────────

window.salvarDadosBancarios = async function() {
  const clienteId = getClienteId();
  if (!clienteId) { alert('Salve o cliente primeiro.'); return; }

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
    mostrarFeedback('banc-status');
    await registrarLogDB('🏦', 'Dados bancários e projeto salvos', 'clientes', clienteId);
  } catch(e) {
    alert('Erro ao salvar dados bancários: ' + e.message);
  }
};


// ─── 5. OPERAÇÕES EM SER ────────────────────────────────────

window.salvarOperacao = async function() {
  const clienteId = getClienteId();
  if (!clienteId) { alert('Salve o cliente primeiro.'); return; }

  const payload = {
    cliente_id:     clienteId,
    banco:          n(document.getElementById('ops-banco')?.value),
    num_contrato:   n(document.getElementById('ops-contrato')?.value),
    finalidade:     n(document.getElementById('ops-finalidade')?.value),
    valor_total:    nd(document.getElementById('ops-valor')?.value),
    data_emissao:   n(document.getElementById('ops-emissao')?.value) || null,
    data_1a_parcela:n(document.getElementById('ops-parc1')?.value) || null,
    prazo_meses:    n(typeof getSelectOuOutro === 'function'
      ? getSelectOuOutro('ops-prazo-sel','ops-prazo')
      : document.getElementById('ops-prazo-sel')?.value),
    carencia_meses: n(typeof getSelectOuOutro === 'function'
      ? getSelectOuOutro('ops-carencia-sel','ops-carencia')
      : document.getElementById('ops-carencia-sel')?.value),
  };

  try {
    const { data, error } = await window.supa.from('operacoes_em_ser').insert(payload).select().single();
    if (error) throw error;

    // Mantém array local
    if (window.clientes && clIdx >= 0) {
      if (!window.clientes[clIdx].operacoes) window.clientes[clIdx].operacoes = [];
      window.clientes[clIdx].operacoes.push(data);
    }

    if (typeof renderizarOperacoes === 'function') renderizarOperacoes(clIdx);
    if (typeof limparOperacao === 'function') limparOperacao();
    mostrarFeedback('ops-status');
    await registrarLogDB('📝', 'Operação em ser adicionada', 'clientes', clienteId);
  } catch(e) {
    alert('Erro ao salvar operação: ' + e.message);
  }
};

window.excluirOperacao = async function(i) {
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
  } catch(e) {
    alert('Erro ao excluir operação: ' + e.message);
  }
};


// ─── 6. OPERAÇÃO ATUAL ──────────────────────────────────────

window.salvarOperacaoAtual = async function() {
  const clienteId = getClienteId();
  if (!clienteId) { alert('Salve o cliente primeiro.'); return; }

  const payload = {
    cliente_id:           clienteId,
    banco:                n(document.getElementById('oat-banco')?.value),
    num_contrato:         n(document.getElementById('oat-contrato')?.value),
    finalidade:           n(document.getElementById('oat-finalidade')?.value),
    valor_total:          nd(document.getElementById('oat-valor')?.value),
    data_emissao:         n(document.getElementById('oat-emissao')?.value) || null,
    comissao_banco_pct:   nd(document.getElementById('oat-comis-banc-pct')?.value),
    comissao_banco_rs:    nd(document.getElementById('oat-comis-banc-rs')?.value),
    comissao_part_pct:    nd(document.getElementById('oat-comis-part-pct')?.value),
    comissao_part_rs:     nd(document.getElementById('oat-comis-part-rs')?.value),
    data_1a_parcela:      n(document.getElementById('oat-parc1')?.value) || null,
    data_parcela_final:   n(document.getElementById('oat-parc-final')?.value) || null,
    carencia_meses:       n(typeof getSelectOuOutro === 'function'
      ? getSelectOuOutro('oat-carencia-sel','oat-carencia')
      : document.getElementById('oat-carencia-sel')?.value),
    prazo_meses:          n(typeof getSelectOuOutro === 'function'
      ? getSelectOuOutro('oat-prazo-sel','oat-prazo')
      : document.getElementById('oat-prazo-sel')?.value),
    ano_safra:            n(document.getElementById('oat-safra')?.value),
    carencia_atual:       ni(document.getElementById('oat-carencia-atual')?.value) || 0,
    prazo_atual:          ni(document.getElementById('oat-prazo-atual')?.value) || 0,
  };

  try {
    const { error } = await window.supa.from('operacao_atual')
      .upsert(payload, { onConflict: 'cliente_id' });
    if (error) throw error;

    if (window.clientes && clIdx >= 0) window.clientes[clIdx].operacao_atual = payload;
    mostrarFeedback('oat-status');
    await registrarLogDB('💼', 'Operação atual salva', 'clientes', clienteId);
  } catch(e) {
    alert('Erro ao salvar operação atual: ' + e.message);
  }
};


// ─── 7. ANEXOS ──────────────────────────────────────────────

window.salvarAnexo = async function() {
  const clienteId = getClienteId();
  if (!clienteId) { alert('Salve o cliente primeiro.'); return; }

  const descricao   = document.getElementById('anx-descricao')?.value?.trim();
  const arquivoNome = window._anxFileName || '';
  const arquivoData = window._anxFileData || null;

  if (!descricao && !arquivoData) {
    alert('Informe uma descrição ou selecione um arquivo.'); return;
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
        console.warn('Erro upload anexo Supabase Storage:', upErr);
      }
    } catch(upEx) {
      console.warn('Exceção upload anexo:', upEx);
    }
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
      window.clientes[clIdx].anexos.push({ ...data, data: arquivoData, dataHora: new Date().toLocaleString('pt-BR') });
    }

    if (typeof renderizarAnexos === 'function') renderizarAnexos(clIdx);
    if (typeof limparAnexo === 'function') limparAnexo();
    mostrarFeedback('anx-status');
    await registrarLogDB('📎', `Anexo adicionado: ${descricao || arquivoNome}`, 'clientes', clienteId);
  } catch(e) {
    alert('Erro ao salvar anexo: ' + e.message);
  }
};

window.excluirAnexo = async function(i) {
  if (!confirm('Excluir este anexo?')) return;
  const clienteId = getClienteId();
  const anx = window.clientes?.[clIdx]?.anexos?.[i];
  try {
    if (anx?.id) {
      const { error } = await window.supa.from('anexos_clientes').delete().eq('id', anx.id);
      if (error) throw error;
    }
    window.clientes[clIdx].anexos.splice(i, 1);
    if (typeof renderizarAnexos === 'function') renderizarAnexos(clIdx);
  } catch(e) {
    alert('Erro ao excluir anexo: ' + e.message);
  }
};


// ─── 8. PARTICIPANTES ───────────────────────────────────────

window.salvarParticipante = async function(tab) {
  const clienteId = getClienteId();
  if (!clienteId) { alert('Salve o cliente primeiro.'); return; }

  let tabela, payload;

  if (tab === 'conjugue') {
    tabela = 'conjuges';
    payload = {
      cliente_id:     clienteId,
      cpf:            n(document.getElementById('conj-cpf')?.value),
      nome:           n(document.getElementById('conj-nome')?.value),
      data_nascimento:n(document.getElementById('conj-nasc')?.value) || null,
      tipo_identidade:n(document.getElementById('conj-tipo-id')?.value),
      numero_di:      n(document.getElementById('conj-di')?.value),
      data_emissao:   n(document.getElementById('conj-emissao')?.value) || null,
      orgao_emissor:  n(document.getElementById('conj-orgao')?.value),
      uf_orgao:       n(document.getElementById('conj-uf-orgao')?.value),
      sexo:           n(document.getElementById('conj-sexo')?.value),
      escolaridade:   n(document.getElementById('conj-escolaridade')?.value),
      profissao:      n(document.getElementById('conj-profissao')?.value),
      nome_pai:       n(document.getElementById('conj-pai')?.value),
      nome_mae:       n(document.getElementById('conj-mae')?.value),
      ddd_celular:    n(document.getElementById('conj-ddd')?.value),
      celular:        n(document.getElementById('conj-cel')?.value),
      email:          n(document.getElementById('conj-email')?.value),
    };

  } else if (tab === 'avalista') {
    tabela = 'avalistas';
    payload = {
      cliente_id:     clienteId,
      cpf:            n(document.getElementById('aval-cpf')?.value),
      nome:           n(document.getElementById('aval-nome')?.value),
      data_nascimento:n(document.getElementById('aval-nasc')?.value) || null,
      tipo_identidade:n(document.getElementById('aval-tipo-id')?.value),
      numero_di:      n(document.getElementById('aval-di')?.value),
      data_emissao:   n(document.getElementById('aval-emissao')?.value) || null,
      orgao_emissor:  n(document.getElementById('aval-orgao')?.value),
      uf_orgao:       n(document.getElementById('aval-uf-orgao')?.value),
      sexo:           n(document.getElementById('aval-sexo')?.value),
      estado_civil:   n(document.getElementById('aval-estado-civil')?.value),
      profissao:      n(document.getElementById('aval-profissao')?.value),
      nome_pai:       n(document.getElementById('aval-pai')?.value),
      nome_mae:       n(document.getElementById('aval-mae')?.value),
      ddd_celular:    n(document.getElementById('aval-ddd')?.value),
      celular:        n(document.getElementById('aval-cel')?.value),
      email:          n(document.getElementById('aval-email')?.value),
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
      cliente_id:     clienteId,
      cpf:            n(document.getElementById('arr-cpf')?.value),
      nome:           n(document.getElementById('arr-nome')?.value),
      tipo_identidade:n(document.getElementById('arr-tipo-id')?.value),
      numero_di:      n(document.getElementById('arr-di')?.value),
      data_emissao:   n(document.getElementById('arr-emissao')?.value) || null,
      orgao_emissor:  n(document.getElementById('arr-orgao')?.value),
      logradouro:     n(document.getElementById('arr-logradouro')?.value),
      bairro:         n(document.getElementById('arr-bairro')?.value),
      uf:             n(document.getElementById('arr-uf')?.value),
      cidade:         n(document.getElementById('arr-cidade')?.value),
      ddd_tel:        n(document.getElementById('arr-tel')?.value),
      telefone:       n(document.getElementById('arr-tel')?.value),
      email:          n(document.getElementById('arr-email')?.value),
    };
  } else {
    return;
  }

  const labels = { conjugue:'Cônjuge', avalista:'Avalista', empresa:'Empresa do participante', arrendante:'Arrendante' };
  const statusKeys = { conjugue:'conj', avalista:'aval', empresa:'emp', arrendante:'arr' };

  try {
    const { error } = await window.supa.from(tabela)
      .upsert(payload, { onConflict: 'cliente_id' });
    if (error) throw error;

    // Salva no objeto local
    if (window.clientes && clIdx >= 0) {
      if (!window.clientes[clIdx].participantes) window.clientes[clIdx].participantes = {};
      window.clientes[clIdx].participantes[tab] = payload;
    }

    const key = statusKeys[tab];
    mostrarFeedback(`part-${key}-status`);
    await registrarLogDB('👥', `${labels[tab]} salvo`, 'participantes', clienteId);
  } catch(e) {
    alert('Erro ao salvar participante: ' + e.message);
    console.error(e);
  }
};


// ─── 9. PROPRIEDADES ────────────────────────────────────────

window.salvarPropriedade = async function() {
  const clienteId = getClienteId();
  if (!clienteId) { alert('Salve o cliente primeiro.'); return; }

  const g = id => n(document.getElementById(id)?.value);

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
    precipitacao_mm:      nd(document.getElementById('prop-ed-precip')?.value),
    temperatura_media_c:  nd(document.getElementById('prop-ed-temp')?.value),
    altitude_m:           nd(document.getElementById('prop-ed-alt')?.value),
    bioma:                g('prop-ed-bioma'),

    // Áreas (ha)
    area_total_ha:        nd(document.getElementById('prop-area-total')?.value),
    area_agricultavel_ha: nd(document.getElementById('prop-area-agri')?.value),
    area_pastagem_ha:     nd(document.getElementById('prop-area-past')?.value),
    area_reserva_ha:      nd(document.getElementById('prop-area-res')?.value),
    area_aproveitada_ha:  nd(document.getElementById('prop-area-aprov')?.value),
    area_projeto_ha:      nd(document.getElementById('prop-area-proj')?.value),
    area_app_ha:          nd(document.getElementById('prop-area-app')?.value),
    area_inapta_ha:       nd(document.getElementById('prop-area-inapta')?.value),

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
    benf_quantidade:      nd(document.getElementById('prop-benf-qtd')?.value),
    benf_valor_unitario:  nd(document.getElementById('prop-benf-vunit')?.value),
    benf_valor_total:     nd(document.getElementById('prop-benf-vtotal')?.value),

    // Seguros
    seg_seguradora:       g('prop-seg-seg'),
    seg_num_apolice:      g('prop-seg-apolice'),
    seg_vigencia:         g('prop-seg-vig') || null,
    seg_valor_segurado:   nd(document.getElementById('prop-seg-valor')?.value),

    // Nota Agronômica
    nota_responsavel:     g('prop-nota-resp'),
    nota_crea:            g('prop-nota-crea'),
    nota_data_visita:     g('prop-nota-data') || null,
    nota_observacoes:     n(document.getElementById('prop-nota-obs')?.value),
  };

  try {
    const { error } = await window.supa.from('propriedades')
      .upsert(payload, { onConflict: 'cliente_id' });
    if (error) throw error;

    if (window.clientes && clIdx >= 0) window.clientes[clIdx].propriedade = payload;
    mostrarFeedback('prop-status');
    await registrarLogDB('🏡', 'Propriedade salva', 'propriedades', clienteId);
  } catch(e) {
    alert('Erro ao salvar propriedade: ' + e.message);
    console.error(e);
  }
};


// ─── 10. PRODUÇÃO AGRÍCOLA ──────────────────────────────────

const TABELAS_AGR = {
  temp:  'agr_temporaria',
  perm:  'agr_permanente',
  outras:'agr_outras_culturas',
  extr:  'agr_extrativismo',
  agro:  'agr_agroindustria',
  renda: 'agr_renda_fora',
};

window.salvarAgricola = async function(key) {
  const clienteId = getClienteId();
  if (!clienteId) { alert('Salve o cliente primeiro.'); return; }

  const tabela = TABELAS_AGR[key];
  if (!tabela) return;

  const g  = id => n(document.getElementById(id)?.value);
  const gd = id => nd(document.getElementById(id)?.value);
  const gi = id => ni(document.getElementById(id)?.value);

  let payload = { cliente_id: clienteId };

  if (key === 'temp') {
    payload = { ...payload,
      cultura: g('agr-temp-cultura'), area_ha: gd('agr-temp-area'),
      produtividade_kg_ha: gd('agr-temp-produtividade'), producao_total_kg: gd('agr-temp-producao'),
      preco_unitario: gd('agr-temp-preco'), receita_bruta: gd('agr-temp-receita'),
      periodo_colheita: g('agr-temp-periodo'), destino_producao: g('agr-temp-destino'),
    };
  } else if (key === 'perm') {
    payload = { ...payload,
      cultura: g('agr-perm-cultura'), area_ha: gd('agr-perm-area'),
      num_plantas: gi('agr-perm-plantas'), prod_por_planta_kg: gd('agr-perm-prod-planta'),
      producao_total_kg: gd('agr-perm-producao'), preco_unitario: gd('agr-perm-preco'),
      receita_bruta: gd('agr-perm-receita'), ano_plantio: gi('agr-perm-ano'),
    };
  } else if (key === 'outras') {
    payload = { ...payload,
      descricao: g('agr-outras-desc'), area_ha: gd('agr-outras-area'),
      quantidade: gd('agr-outras-qtd'), unidade: g('agr-outras-unidade'),
      preco_unitario: gd('agr-outras-preco'), receita_bruta: gd('agr-outras-receita'),
    };
  } else if (key === 'extr') {
    payload = { ...payload,
      produto: g('agr-extr-produto'), area_ha: gd('agr-extr-area'),
      quantidade_kg: gd('agr-extr-qtd'), periodo_coleta: g('agr-extr-periodo'),
      preco_unitario: gd('agr-extr-preco'), receita_bruta: gd('agr-extr-receita'),
      destino: g('agr-extr-destino'),
    };
  } else if (key === 'agro') {
    payload = { ...payload,
      produto: g('agr-agro-produto'), quantidade: gd('agr-agro-qtd'),
      unidade: g('agr-agro-unidade'), preco_unitario: gd('agr-agro-preco'),
      receita_bruta: gd('agr-agro-receita'), periodo: g('agr-agro-periodo'),
    };
  } else if (key === 'renda') {
    payload = { ...payload,
      descricao: g('agr-renda-desc'), valor_mensal: gd('agr-renda-mensal'),
      meses_no_ano: gi('agr-renda-meses'), valor_anual: gd('agr-renda-anual'),
      responsavel: g('agr-renda-responsavel'), origem: g('agr-renda-origem'),
    };
  }

  try {
    const { error } = await window.supa.from(tabela)
      .upsert(payload, { onConflict: 'cliente_id' });
    if (error) throw error;

    if (window.clientes && clIdx >= 0) {
      if (!window.clientes[clIdx].agricola) window.clientes[clIdx].agricola = {};
      window.clientes[clIdx].agricola[key] = payload;
    }

    if (typeof atualizarTotalAgricola === 'function') atualizarTotalAgricola();
    const st = document.getElementById(`agr-${key}-status`);
    if (st) { st.style.display = ''; setTimeout(() => st.style.display = 'none', 3000); }
    await registrarLogDB('🌾', `Produção agrícola (${key}) salva`, 'agricola', clienteId);
  } catch(e) {
    alert('Erro ao salvar produção agrícola: ' + e.message);
  }
};


// ─── 11. PRODUÇÃO PECUÁRIA ──────────────────────────────────

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

window.salvarPecuaria = async function(key) {
  const clienteId = getClienteId();
  if (!clienteId) { alert('Salve o cliente primeiro.'); return; }

  const tabela = TABELAS_PEC[key];
  if (!tabela) return;

  const g  = id => n(document.getElementById(id)?.value);
  const gd = id => nd(document.getElementById(id)?.value);
  const gi = id => ni(document.getElementById(id)?.value);

  let payload = { cliente_id: clienteId };

  if (key === 'bov') {
    payload = { ...payload,
      raca_tipo: g('pec-bov-raca'), num_cabecas: gi('pec-bov-cabecas'),
      peso_medio_kg: gd('pec-bov-peso'), finalidade: g('pec-bov-finalidade'),
      preco_arroba: gd('pec-bov-preco'), cabecas_vendidas_ano: gi('pec-bov-vendidas'),
      receita_bruta: gd('pec-bov-receita'), valor_rebanho: gd('pec-bov-rebanho'),
    };
  } else if (key === 'leite') {
    payload = { ...payload,
      num_vacas_lactacao: gi('pec-leite-vacas'), producao_vaca_dia_l: gd('pec-leite-prod-dia'),
      dias_lactacao: gi('pec-leite-dias'), producao_total_l: gd('pec-leite-total'),
      preco_leite_l: gd('pec-leite-preco'), receita_bruta: gd('pec-leite-receita'),
    };
  } else if (key === 'equ') {
    payload = { ...payload,
      raca_tipo: g('pec-equ-raca'), num_cabecas: gi('pec-equ-cabecas'),
      finalidade: g('pec-equ-finalidade'), preco_unitario: gd('pec-equ-preco'),
      unidades_vendidas: gi('pec-equ-vendidas'), receita_bruta: gd('pec-equ-receita'),
    };
  } else if (key === 'cap') {
    payload = { ...payload,
      raca_tipo: g('pec-cap-raca'), num_cabecas: gi('pec-cap-cabecas'),
      finalidade: g('pec-cap-finalidade'), preco_unitario: gd('pec-cap-preco'),
      unidades_vendidas: gi('pec-cap-vendidas'), receita_bruta: gd('pec-cap-receita'),
    };
  } else if (key === 'lcap') {
    payload = { ...payload,
      num_cabras_lactacao: gi('pec-lcap-cabras'), producao_dia_l: gd('pec-lcap-prod-dia'),
      dias_lactacao: gi('pec-lcap-dias'), producao_total_l: gd('pec-lcap-total'),
      preco_leite_l: gd('pec-lcap-preco'), receita_bruta: gd('pec-lcap-receita'),
    };
  } else if (key === 'ovi') {
    payload = { ...payload,
      raca_tipo: g('pec-ovi-raca'), num_cabecas: gi('pec-ovi-cabecas'),
      finalidade: g('pec-ovi-finalidade'), preco_unitario: gd('pec-ovi-preco'),
      unidades_vendidas: gi('pec-ovi-vendidas'), receita_bruta: gd('pec-ovi-receita'),
    };
  } else if (key === 'sui') {
    payload = { ...payload,
      raca_tipo: g('pec-sui-raca'), num_cabecas: gi('pec-sui-cabecas'),
      peso_medio_kg: gd('pec-sui-peso'), preco_unitario: gd('pec-sui-preco'),
      unidades_vendidas: gi('pec-sui-vendidas'), receita_bruta: gd('pec-sui-receita'),
    };
  } else if (key === 'aves') {
    payload = { ...payload,
      especie: g('pec-aves-especie'), num_aves: gi('pec-aves-qtd'),
      ovos_por_dia: gd('pec-aves-ovos'), preco_unitario: gd('pec-aves-preco'),
      aves_vendidas_ano: gi('pec-aves-vendidas'), receita_bruta: gd('pec-aves-receita'),
    };
  } else if (key === 'out') {
    payload = { ...payload,
      descricao: g('pec-out-desc'), quantidade: gd('pec-out-qtd'),
      unidade: g('pec-out-unidade'), preco_unitario: gd('pec-out-preco'),
      unidades_vendidas: gd('pec-out-vendidas'), receita_bruta: gd('pec-out-receita'),
    };
  }

  try {
    const { error } = await window.supa.from(tabela)
      .upsert(payload, { onConflict: 'cliente_id' });
    if (error) throw error;

    if (window.clientes && clIdx >= 0) {
      if (!window.clientes[clIdx].pecuaria) window.clientes[clIdx].pecuaria = {};
      window.clientes[clIdx].pecuaria[key] = payload;
    }

    if (typeof atualizarTotalPec === 'function') atualizarTotalPec();
    const st = document.getElementById(`pec-${key}-status`);
    if (st) { st.style.display = ''; setTimeout(() => st.style.display = 'none', 3000); }
    await registrarLogDB('🐄', `Produção pecuária (${key}) salva`, 'pecuaria', clienteId);
  } catch(e) {
    alert('Erro ao salvar produção pecuária: ' + e.message);
  }
};


// ─── 12. EQUIPE ─────────────────────────────────────────────

window.salvarMembro = async function() {
  const msg  = document.getElementById('equipe-msg');
  const nome = document.getElementById('mem-nome')?.value?.trim();
  if (!nome) {
    if (msg) { msg.textContent = '❌ Nome é obrigatório.'; msg.style.background = '#f8d7da'; msg.style.color = '#721c24'; msg.style.display = 'block'; }
    return;
  }

  const supaId = document.getElementById('mem-id')?.value;
  const payload = {
    nome,
    cpf:             n(document.getElementById('mem-cpf')?.value),
    data_nascimento: n(document.getElementById('mem-nasc')?.value) || null,
    cargo_funcao:    n(document.getElementById('mem-cargo')?.value),
    crea_cfb:        n(document.getElementById('mem-crea')?.value),
    ddd_celular:     n(document.getElementById('mem-ddd')?.value),
    celular:         n(document.getElementById('mem-cel')?.value),
    email:           n(document.getElementById('mem-email')?.value),
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
    if (typeof equipe !== 'undefined') window.equipe = eqAtual;
    if (window._scaCache) window._scaCache.equipe = eqAtual;
    if (typeof renderizarEquipe === 'function') renderizarEquipe();
    if (typeof cancelarMembro === 'function') cancelarMembro();
    if (msg) {
      msg.textContent = '✅ Membro salvo!'; msg.style.background = '#d4edda'; msg.style.color = '#155724';
      msg.style.display = 'block'; setTimeout(() => msg.style.display = 'none', 3000);
    }
    await registrarLogDB('👥', `Membro ${supaId ? 'atualizado' : 'adicionado'}: ${nome}`, 'equipe', null);
  } catch(e) {
    if (msg) { msg.textContent = '❌ Erro: ' + e.message; msg.style.background = '#f8d7da'; msg.style.color = '#721c24'; msg.style.display = 'block'; }
  }
};

window.excluirMembro = async function(i) {
  const mArr = window.equipe || (typeof equipe !== 'undefined' ? equipe : []);
  const m = mArr[i];
  if (!m || !confirm(`Excluir "${m.nome}"?`)) return;
  try {
    const { error } = await window.supa.from('equipe').delete().eq('id', m.id);
    if (error) throw error;
    mArr.splice(i, 1);
    if (typeof renderizarEquipe === 'function') renderizarEquipe();
    await registrarLogDB('🗑️', `Membro excluído: ${m.nome}`, 'equipe', null);
  } catch(e) { alert('Erro ao excluir: ' + e.message); }
};


// ─── 13. EMPRESA ────────────────────────────────────────────

window.salvarDadosEmpresa = async function() {
  const campos = ['cnpj','razao','fantasia','ie','abertura','atividade','responsavel','crea',
    'logradouro','numero','bairro','uf','cidade','cep','tel','cel','email','site'];

  const dados = {};
  campos.forEach(c => {
    const el = document.getElementById('empresa-' + c);
    if (el) dados[c] = el.value;
  });
  if (window._scaCache?.empresa_logo) dados.logo = window._scaCache.empresa_logo;
  if (window._scaCache?.empresa_logo_url) dados.logo_url = window._scaCache.empresa_logo_url;

  window._scaCache = window._scaCache || {};
  window._scaCache.empresa = dados;

  const payload = {
    cnpj:               n(dados.cnpj),
    razao_social:       n(dados.razao),
    nome_fantasia:      n(dados.fantasia),
    inscricao_estadual: n(dados.ie),
    data_abertura:      n(dados.abertura) || null,
    atividade:          n(dados.atividade),
    responsavel:        n(dados.responsavel),
    crea:               n(dados.crea),
    logradouro:         n(dados.logradouro),
    numero:             n(dados.numero),
    bairro:             n(dados.bairro),
    uf:                 n(dados.uf),
    cidade:             n(dados.cidade),
    cep:                n(dados.cep),
    ddd_tel:            n(dados.ddd_tel || null),
    telefone:           n(dados.tel),
    celular:            n(dados.cel),
    email:              n(dados.email),
    site:               n(dados.site),
    logo_url:           n(dados.logo_url || dados.logo || null),
  };

  const btn = document.querySelector('[onclick*="salvarDadosEmpresa"]');
  if (btn) { btn.disabled = true; btn.innerHTML = '⏳ Salvando...'; btn.style.background = '#f39c12'; }

  try {
    const { data: existing } = await window.supa.from('empresa').select('id').limit(1).maybeSingle();
    if (existing) {
      const { error } = await window.supa.from('empresa').update(payload).eq('id', existing.id);
      if (error) throw error;
    } else {
      const { error } = await window.supa.from('empresa').insert(payload);
      if (error) throw error;
    }

    if (btn) { btn.innerHTML = '✅ Salvo!'; btn.style.background = '#27ae60'; }
    setTimeout(() => {
      if (btn) { btn.innerHTML = '💾 Salvar Dados da Empresa'; btn.style.background = ''; btn.disabled = false; }
    }, 2500);

    await registrarLogDB('🏢', 'Dados da empresa atualizados', 'empresa', null);
  } catch(e) {
    if (btn) { btn.innerHTML = '❌ Erro!'; btn.style.background = '#e74c3c'; }
    setTimeout(() => {
      if (btn) { btn.innerHTML = '💾 Salvar Dados da Empresa'; btn.style.background = ''; btn.disabled = false; }
    }, 3000);
    alert('Erro ao salvar empresa: ' + e.message);
    console.error(e);
  }
};


// ─── 14. ELABORAÇÃO / STATUS DO PROCESSO ────────────────────

window.definirStatusProcesso = async function(status) {
  const clienteId = getClienteId();
  if (!clienteId) return;

  const obs = document.getElementById('status-obs')?.value || '';

  // Atualiza visual
  document.querySelectorAll('.status-btn').forEach(b => b.classList.remove('sel'));
  const key = { 'Em andamento':'andamento','Aguardando assinatura':'assinatura','Concluido':'concluido','Cancelado':'cancelado' }[status];
  const btn = document.getElementById('sbtn-' + key);
  if (btn) btn.classList.add('sel');

  const badge = document.getElementById('status-processo-badge');
  if (badge) {
    badge.className = 'status-badge status-' + key;
    badge.textContent = status;
  }

  try {
    const { error } = await window.supa.from('elaboracao_projetos')
      .upsert({ cliente_id: clienteId, status_processo: status, observacao: obs }, { onConflict: 'cliente_id' });
    if (error) throw error;
    await registrarLogDB('📄', `Status do processo: ${status}`, 'elaboracao', clienteId);
  } catch(e) {
    console.warn('Erro ao salvar status:', e);
  }
};

window.salvarStatusProcesso = async function() {
  const clienteId = getClienteId();
  if (!clienteId) return;
  const obs = document.getElementById('status-obs')?.value || '';
  const badge = document.getElementById('status-processo-badge');
  const status = badge?.textContent?.trim() || 'Em andamento';
  try {
    await window.supa.from('elaboracao_projetos')
      .upsert({ cliente_id: clienteId, status_processo: status, observacao: obs }, { onConflict: 'cliente_id' });
  } catch(e) { console.warn('Erro salvar obs status:', e); }
};


// ─── 15. HISTÓRICO DE DOCUMENTOS GERADOS ────────────────────

window.histDocsSaveCliente = async function(cpf, nomeDoc) {
  const clienteId = getClienteId();
  if (!clienteId) return;
  try {
    await window.supa.from('historico_documentos').insert({
      cliente_id: clienteId,
      nome_documento: nomeDoc,
    });
  } catch(e) { console.warn('Erro ao salvar histórico doc:', e); }
};


// ─── 16. CARREGAMENTO APÓS LOGIN ────────────────────────────

window.carregarDadosAposLogin = async function() {
  window._scaDadosCarregados = false;
  if (!window.supa) return;

  try {
    // Clientes
    const { data: clientesSupa } = await window.supa.from('clientes').select('*').order('codigo');
    if (clientesSupa?.length > 0) {
      window.clientes = clientesSupa;
      if (typeof clientes !== 'undefined') window.clIdx = 0;
      if (typeof exibirCliente === 'function') exibirCliente(0);
      if (typeof atualizarDropdownElaboracao === 'function') atualizarDropdownElaboracao();
    }

    // Empresa
    const { data: empresaSupa } = await window.supa.from('empresa').select('*').limit(1).maybeSingle();
    if (empresaSupa) {
      window._scaCache = window._scaCache || {};
      window._scaCache.empresa = {
        cnpj: empresaSupa.cnpj, razao: empresaSupa.razao_social,
        fantasia: empresaSupa.nome_fantasia, ie: empresaSupa.inscricao_estadual,
        abertura: empresaSupa.data_abertura, atividade: empresaSupa.atividade,
        responsavel: empresaSupa.responsavel, crea: empresaSupa.crea,
        logradouro: empresaSupa.logradouro, numero: empresaSupa.numero,
        bairro: empresaSupa.bairro, uf: empresaSupa.uf, cidade: empresaSupa.cidade,
        cep: empresaSupa.cep, tel: empresaSupa.telefone, cel: empresaSupa.celular,
        email: empresaSupa.email, site: empresaSupa.site, logo_url: empresaSupa.logo_url,
      };
      window._scaCache.empresa_logo_url = empresaSupa.logo_url || null;
      if (typeof carregarDadosEmpresa === 'function') carregarDadosEmpresa();
    }

    // Equipe
    const { data: eqSupa } = await window.supa.from('equipe').select('*').order('nome');
    if (eqSupa) {
      window.equipe = eqSupa;
      if (window._scaCache) window._scaCache.equipe = eqSupa;
      if (typeof renderizarEquipe === 'function') renderizarEquipe();
    }

    // Log de atividades
    const { data: logSupa } = await window.supa.from('log_atividades')
      .select('*').order('created_at', { ascending: false }).limit(200);
    if (logSupa) {
      window._scaLog = logSupa;
      if (typeof renderizarLogCompleto === 'function') renderizarLogCompleto();
      if (typeof renderizarDashboard === 'function') renderizarDashboard();
    }

    window._scaDadosCarregados = true;
    console.log('✅ Dados carregados do Supabase (integração completa).');
  } catch(e) {
    window._scaDadosCarregados = true;
    console.warn('Erro ao carregar dados:', e);
  }
};


// ─── 17. DASHBOARD ──────────────────────────────────────────

window.renderizarDashboard = async function() {
  if (!window.supa) return;

  try {
    // Cards de resumo
    const [
      { count: totalClientes },
      { count: totalEquipe },
      { count: totalDocs },
    ] = await Promise.all([
      window.supa.from('clientes').select('*', { count: 'exact', head: true }),
      window.supa.from('equipe').select('*', { count: 'exact', head: true }),
      window.supa.from('historico_documentos').select('*', { count: 'exact', head: true }),
    ]);

    const grid = document.getElementById('dash-cards');
    if (grid) {
      const cards = [
        { num: totalClientes || 0, label: 'Clientes', cor: '#1a5c38' },
        { num: totalEquipe   || 0, label: 'Equipe',   cor: '#2c5282' },
        { num: totalDocs     || 0, label: 'Documentos', cor: '#7b2d8b' },
      ];
      grid.innerHTML = cards.map(c => `
        <div class="dash-card">
          <div class="dash-card-num" style="color:${c.cor}">${c.num}</div>
          <div class="dash-card-label">${c.label}</div>
        </div>`).join('');
    }

    // Últimos clientes
    const { data: ultClientes } = await window.supa.from('clientes')
      .select('nome,cpf,data_cadastro').order('created_at', { ascending: false }).limit(5);
    const elCli = document.getElementById('dash-ultimos-clientes');
    if (elCli && ultClientes) {
      elCli.innerHTML = ultClientes.length === 0
        ? '<p style="padding:12px;color:#888;font-style:italic;font-size:.82rem;">Nenhum cliente.</p>'
        : ultClientes.map(c => `
          <div class="dash-item">
            <span class="dash-item-icon">👤</span>
            <div class="dash-item-info"><b>${c.nome}</b><br><span style="color:#888;font-size:.76rem;">${c.cpf || ''}</span></div>
            <div class="dash-item-time">${c.data_cadastro ? new Date(c.data_cadastro + 'T12:00:00').toLocaleDateString('pt-BR') : ''}</div>
          </div>`).join('');
    }

    // Últimos documentos
    const { data: ultDocs } = await window.supa.from('historico_documentos')
      .select('nome_documento,gerado_em,cliente_id').order('gerado_em', { ascending: false }).limit(5);
    const elDocs = document.getElementById('dash-ultimos-docs');
    if (elDocs && ultDocs) {
      elDocs.innerHTML = ultDocs.length === 0
        ? '<p style="padding:12px;color:#888;font-style:italic;font-size:.82rem;">Nenhum documento gerado.</p>'
        : ultDocs.map(d => `
          <div class="dash-item">
            <span class="dash-item-icon">📄</span>
            <div class="dash-item-info" style="font-size:.82rem;">${d.nome_documento}</div>
            <div class="dash-item-time">${d.gerado_em ? new Date(d.gerado_em).toLocaleDateString('pt-BR') : ''}</div>
          </div>`).join('');
    }

  } catch(e) { console.warn('Erro dashboard:', e); }
};

window.renderizarLogCompleto = async function(forcar) {
  const lista = document.getElementById('log-atividades-lista');
  if (!lista || !window.supa) return;

  if (!window._scaLog || forcar) {
    try {
      const { data } = await window.supa.from('log_atividades')
        .select('*').order('created_at', { ascending: false }).limit(100);
      window._scaLog = data || [];
    } catch(e) { return; }
  }

  const log = window._scaLog || [];
  if (log.length === 0) {
    lista.innerHTML = '<p style="padding:12px;color:#888;font-style:italic;font-size:.82rem;">Nenhuma atividade registrada.</p>';
    return;
  }

  lista.innerHTML = log.map(item => `
    <div class="log-item">
      <span class="log-icon">${item.icone || '📌'}</span>
      <div class="log-texto">${item.descricao}</div>
      <div class="log-tempo">${item.created_at ? new Date(item.created_at).toLocaleString('pt-BR') : ''}</div>
    </div>`).join('');
};


// ─── 18. BACKUP ─────────────────────────────────────────────

window.fazerBackupNuvem = async function() {
  const btn = document.getElementById('btn-bkp-nuvem');
  const statusEl = document.getElementById('bkp-status-geral');

  function mostrarStatus(msg, tipo) {
    if (!statusEl) return;
    statusEl.style.display = 'block'; statusEl.textContent = msg;
    const cores = { ok: ['#d4edda','#155724'], err: ['#f8d7da','#721c24'], warn: ['#fff3cd','#856404'] };
    statusEl.style.background = cores[tipo]?.[0] || '#fff3cd';
    statusEl.style.color = cores[tipo]?.[1] || '#856404';
  }

  if (!window.supa) { mostrarStatus('❌ Supabase não conectado.','err'); return; }
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Salvando...'; }

  try {
    const { count: nCli }  = await window.supa.from('clientes').select('*',{count:'exact',head:true});
    const { count: nEqu }  = await window.supa.from('equipe').select('*',{count:'exact',head:true});
    const { count: nDocs } = await window.supa.from('historico_documentos').select('*',{count:'exact',head:true});

    const { error } = await window.supa.from('backups').insert({
      descricao:    'Backup manual — ' + new Date().toLocaleString('pt-BR'),
      dados:        { gerado_em: new Date().toISOString(), num_clientes: nCli, num_equipe: nEqu, num_docs: nDocs },
      tamanho_bytes:null,
    });
    if (error) throw error;

    mostrarStatus('✅ Backup salvo! (' + new Date().toLocaleString('pt-BR') + ')', 'ok');
    if (typeof listarBackupsNuvem === 'function') listarBackupsNuvem();
    await registrarLogDB('☁️', 'Backup realizado', 'backup', null);
  } catch(e) {
    mostrarStatus('❌ Erro: ' + (e.message || e), 'err');
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = '☁️ Salvar Backup no Supabase'; }
  }
};


// ─── 19. ARQUIVO DE ANEXO — interceptar seleção ─────────────

// Guarda referência ao arquivo selecionado no escopo global
const _origOnAnxFileSelect = window.onAnxFileSelect;
window.onAnxFileSelect = function(input) {
  if (!input.files[0]) return;
  const file = input.files[0];
  window._anxFileName = file.name;
  document.getElementById('anx-file-name').textContent = file.name;
  const reader = new FileReader();
  reader.onload = e => { window._anxFileData = e.target.result; };
  reader.readAsDataURL(file);
};

// ─── 20. CARREGAR DADOS DO CLIENTE DO SUPABASE ──────────────
// Chamado ao navegar entre clientes — popula todas as seções

window.carregarDadosClienteSupabase = async function(clienteId) {
  if (!window.supa || !clienteId) return;

  try {
    const [
      { data: dp },
      { data: end },
      { data: banc },
      { data: conj },
      { data: aval },
      { data: emp },
      { data: arr },
      { data: prop },
      { data: agrTemp },
      { data: agrPerm },
      { data: agrOutras },
      { data: agrExtr },
      { data: agrAgro },
      { data: agrRenda },
      { data: pecBov },
      { data: pecLeite },
      { data: pecEqu },
      { data: pecCap },
      { data: pecLcap },
      { data: pecOvi },
      { data: pecSui },
      { data: pecAves },
      { data: pecOut },
    ] = await Promise.all([
      window.supa.from('clientes_dados_pessoais').select('*').eq('cliente_id', clienteId).maybeSingle(),
      window.supa.from('clientes_endereco').select('*').eq('cliente_id', clienteId).maybeSingle(),
      window.supa.from('clientes_bancarios').select('*').eq('cliente_id', clienteId).maybeSingle(),
      window.supa.from('conjuges').select('*').eq('cliente_id', clienteId).maybeSingle(),
      window.supa.from('avalistas').select('*').eq('cliente_id', clienteId).maybeSingle(),
      window.supa.from('participante_empresa').select('*').eq('cliente_id', clienteId).maybeSingle(),
      window.supa.from('arrendantes').select('*').eq('cliente_id', clienteId).maybeSingle(),
      window.supa.from('propriedades').select('*').eq('cliente_id', clienteId).maybeSingle(),
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

    const idx = window.clIdx >= 0 ? window.clIdx : 0;
    if (!window.clientes || !window.clientes[idx]) return;
    const c = window.clientes[idx];

    // Popula objeto local
    if (dp)   c.dados_pessoais = dp;
    if (end)  c.endereco = end;
    if (banc) c.bancarios = banc;
    if (prop) c.propriedade = prop;

    c.participantes = c.participantes || {};
    if (conj) c.participantes.conjugue = conj;
    if (aval) c.participantes.avalista = aval;
    if (emp)  c.participantes.empresa  = emp;
    if (arr)  c.participantes.arrendante = arr;

    c.agricola = c.agricola || {};
    if (agrTemp)  { c.agricola.temp  = { 'agr-temp-cultura': agrTemp.cultura, 'agr-temp-area': agrTemp.area_ha, 'agr-temp-produtividade': agrTemp.produtividade_kg_ha, 'agr-temp-producao': agrTemp.producao_total_kg, 'agr-temp-preco': agrTemp.preco_unitario, 'agr-temp-receita': agrTemp.receita_bruta, 'agr-temp-periodo': agrTemp.periodo_colheita, 'agr-temp-destino': agrTemp.destino_producao }; }
    if (agrPerm)  { c.agricola.perm  = { 'agr-perm-cultura': agrPerm.cultura, 'agr-perm-area': agrPerm.area_ha, 'agr-perm-plantas': agrPerm.num_plantas, 'agr-perm-prod-planta': agrPerm.prod_por_planta_kg, 'agr-perm-producao': agrPerm.producao_total_kg, 'agr-perm-preco': agrPerm.preco_unitario, 'agr-perm-receita': agrPerm.receita_bruta, 'agr-perm-ano': agrPerm.ano_plantio }; }
    if (agrOutras){ c.agricola.outras = { 'agr-outras-desc': agrOutras.descricao, 'agr-outras-area': agrOutras.area_ha, 'agr-outras-qtd': agrOutras.quantidade, 'agr-outras-unidade': agrOutras.unidade, 'agr-outras-preco': agrOutras.preco_unitario, 'agr-outras-receita': agrOutras.receita_bruta }; }
    if (agrExtr)  { c.agricola.extr  = { 'agr-extr-produto': agrExtr.produto, 'agr-extr-area': agrExtr.area_ha, 'agr-extr-qtd': agrExtr.quantidade_kg, 'agr-extr-periodo': agrExtr.periodo_coleta, 'agr-extr-preco': agrExtr.preco_unitario, 'agr-extr-receita': agrExtr.receita_bruta, 'agr-extr-destino': agrExtr.destino }; }
    if (agrAgro)  { c.agricola.agro  = { 'agr-agro-produto': agrAgro.produto, 'agr-agro-qtd': agrAgro.quantidade, 'agr-agro-unidade': agrAgro.unidade, 'agr-agro-preco': agrAgro.preco_unitario, 'agr-agro-receita': agrAgro.receita_bruta, 'agr-agro-periodo': agrAgro.periodo }; }
    if (agrRenda) { c.agricola.renda = { 'agr-renda-desc': agrRenda.descricao, 'agr-renda-mensal': agrRenda.valor_mensal, 'agr-renda-meses': agrRenda.meses_no_ano, 'agr-renda-anual': agrRenda.valor_anual, 'agr-renda-responsavel': agrRenda.responsavel, 'agr-renda-origem': agrRenda.origem }; }

    c.pecuaria = c.pecuaria || {};
    if (pecBov)  { c.pecuaria.bov   = { 'pec-bov-raca': pecBov.raca_tipo, 'pec-bov-cabecas': pecBov.num_cabecas, 'pec-bov-peso': pecBov.peso_medio_kg, 'pec-bov-finalidade': pecBov.finalidade, 'pec-bov-preco': pecBov.preco_arroba, 'pec-bov-vendidas': pecBov.cabecas_vendidas_ano, 'pec-bov-receita': pecBov.receita_bruta, 'pec-bov-rebanho': pecBov.valor_rebanho }; }
    if (pecLeite){ c.pecuaria.leite = { 'pec-leite-vacas': pecLeite.num_vacas_lactacao, 'pec-leite-prod-dia': pecLeite.producao_vaca_dia_l, 'pec-leite-dias': pecLeite.dias_lactacao, 'pec-leite-total': pecLeite.producao_total_l, 'pec-leite-preco': pecLeite.preco_leite_l, 'pec-leite-receita': pecLeite.receita_bruta }; }
    if (pecEqu)  { c.pecuaria.equ   = { 'pec-equ-raca': pecEqu.raca_tipo, 'pec-equ-cabecas': pecEqu.num_cabecas, 'pec-equ-finalidade': pecEqu.finalidade, 'pec-equ-preco': pecEqu.preco_unitario, 'pec-equ-vendidas': pecEqu.unidades_vendidas, 'pec-equ-receita': pecEqu.receita_bruta }; }
    if (pecCap)  { c.pecuaria.cap   = { 'pec-cap-raca': pecCap.raca_tipo, 'pec-cap-cabecas': pecCap.num_cabecas, 'pec-cap-finalidade': pecCap.finalidade, 'pec-cap-preco': pecCap.preco_unitario, 'pec-cap-vendidas': pecCap.unidades_vendidas, 'pec-cap-receita': pecCap.receita_bruta }; }
    if (pecLcap) { c.pecuaria.lcap  = { 'pec-lcap-cabras': pecLcap.num_cabras_lactacao, 'pec-lcap-prod-dia': pecLcap.producao_dia_l, 'pec-lcap-dias': pecLcap.dias_lactacao, 'pec-lcap-total': pecLcap.producao_total_l, 'pec-lcap-preco': pecLcap.preco_leite_l, 'pec-lcap-receita': pecLcap.receita_bruta }; }
    if (pecOvi)  { c.pecuaria.ovi   = { 'pec-ovi-raca': pecOvi.raca_tipo, 'pec-ovi-cabecas': pecOvi.num_cabecas, 'pec-ovi-finalidade': pecOvi.finalidade, 'pec-ovi-preco': pecOvi.preco_unitario, 'pec-ovi-vendidas': pecOvi.unidades_vendidas, 'pec-ovi-receita': pecOvi.receita_bruta }; }
    if (pecSui)  { c.pecuaria.sui   = { 'pec-sui-raca': pecSui.raca_tipo, 'pec-sui-cabecas': pecSui.num_cabecas, 'pec-sui-peso': pecSui.peso_medio_kg, 'pec-sui-preco': pecSui.preco_unitario, 'pec-sui-vendidas': pecSui.unidades_vendidas, 'pec-sui-receita': pecSui.receita_bruta }; }
    if (pecAves) { c.pecuaria.aves  = { 'pec-aves-especie': pecAves.especie, 'pec-aves-qtd': pecAves.num_aves, 'pec-aves-ovos': pecAves.ovos_por_dia, 'pec-aves-preco': pecAves.preco_unitario, 'pec-aves-vendidas': pecAves.aves_vendidas_ano, 'pec-aves-receita': pecAves.receita_bruta }; }
    if (pecOut)  { c.pecuaria.out   = { 'pec-out-desc': pecOut.descricao, 'pec-out-qtd': pecOut.quantidade, 'pec-out-unidade': pecOut.unidade, 'pec-out-preco': pecOut.preco_unitario, 'pec-out-vendidas': pecOut.unidades_vendidas, 'pec-out-receita': pecOut.receita_bruta }; }

    // Popula campos na tela
    if (typeof carregarDadosPessoais === 'function')  carregarDadosPessoais(idx);
    if (typeof carregarEndereco === 'function')        carregarEndereco(idx);
    if (typeof carregarDadosBancarios === 'function')  carregarDadosBancarios(idx);
    if (typeof carregarOperacaoAtual === 'function')   carregarOperacaoAtual(idx);
    if (typeof carregarParticipantes === 'function')   carregarParticipantes(idx);
    if (typeof carregarAgricola === 'function')        carregarAgricola(idx);
    if (typeof carregarPecuaria === 'function')        carregarPecuaria(idx);
    if (typeof carregarPropriedade === 'function')     carregarPropriedade(idx);

    console.log('✅ Dados do cliente carregados do Supabase.');
  } catch(e) {
    console.warn('Erro ao carregar dados do cliente:', e);
  }
};

// ─── 21. FUNÇÕES DE CARREGAR — populam campos na tela ───────

// Helper: seta valor de um campo pelo id
function setVal(id, val) {
  const el = document.getElementById(id);
  if (!el) return;
  el.value = (val === null || val === undefined) ? '' : val;
}

// ── Dados Pessoais ───────────────────────────────────────────
window.carregarDadosPessoais = function(idx) {
  const c = window.clientes?.[idx ?? window.clIdx];
  const dp = c?.dados_pessoais || {};
  setVal('dp-sexo',          dp.sexo);
  setVal('dp-apelido',       dp.apelido);
  setVal('dp-tipo-id',       dp.tipo_identidade);
  setVal('dp-num-di',        dp.numero_di);
  setVal('dp-data-emissao',  dp.data_emissao_di);
  setVal('dp-orgao',         dp.orgao_emissor);
  setVal('dp-uf-orgao',      dp.uf_orgao_emissor);
  setVal('dp-titulo',        dp.numero_titulo);
  setVal('dp-nasc',          dp.data_nascimento);
  setVal('dp-uf-nasc',       dp.uf_nascimento);
  setVal('dp-naturalidade',  dp.naturalidade);
  setVal('dp-estado-civil',  dp.estado_civil);
  setVal('dp-regime',        dp.regime_casamento);
  setVal('dp-pai',           dp.nome_pai);
  setVal('dp-mae',           dp.nome_mae);
  setVal('dp-caf',           dp.numero_caf);
  setVal('dp-escolaridade',  dp.escolaridade);
  setVal('dp-financiamento', dp.ja_fez_financiamento ? 'SIM' : 'NÃO');
  setVal('dp-exposto',       dp.exposto_politicamente ? 'SIM' : 'NÃO');
  setVal('dp-beneficiario',  dp.beneficiario_pol_publicas);
  if (dp.idade) setVal('dp-idade', dp.idade);
};

// ── Endereço e Contatos ──────────────────────────────────────
window.carregarEndereco = function(idx) {
  const c = window.clientes?.[idx ?? window.clIdx];
  const e = c?.endereco || {};
  setVal('end-logradouro', e.logradouro);
  setVal('end-numero',     e.numero);
  setVal('end-bairro',     e.bairro);
  setVal('end-uf',         e.uf);
  setVal('end-cidade',     e.cidade);
  setVal('end-cep',        e.cep);
  setVal('end-ddd1',       e.ddd_cel1);
  setVal('end-cel1',       e.celular1);
  setVal('end-ddd2',       e.ddd_cel2);
  setVal('end-cel2',       e.celular2);
  setVal('end-ddd-res',    e.ddd_residencial);
  setVal('end-res',        e.tel_residencial);
  setVal('end-email',      e.email);
};

// ── Dados Bancários e Projeto ────────────────────────────────
window.carregarDadosBancarios = function(idx) {
  const c = window.clientes?.[idx ?? window.clIdx];
  const b = c?.bancarios || {};
  setVal('banc-banco-proj',      b.banco_projeto);
  setVal('banc-agencia-proj',    b.agencia_projeto);
  setVal('banc-uf-agencia',      b.uf_agencia);
  setVal('banc-cidade-agencia',  b.cidade_agencia);
  setVal('banc-linha',           b.linha_credito);
  setVal('banc-tipo-proj',       b.tipo_projeto);
  setVal('banc-tipo-cliente',    b.tipo_cliente);
  setVal('banc-porte',           b.porte_cliente);
  setVal('banc-aptidao',         b.aptidao);
  setVal('banc-cultura',         b.cultura_especie);
  setVal('banc-experiencia',     b.experiencia_anos);
  setVal('banc-banco-conta',     b.banco_conta);
  setVal('banc-agencia-conta',   b.agencia_conta);
  setVal('banc-conta',           b.conta_digito);
  setVal('banc-uf-conta',        b.uf_conta);
  setVal('banc-cidade-conta',    b.cidade_conta);
};

// ── Operação Atual ───────────────────────────────────────────
window.carregarOperacaoAtual = function(idx) {
  const c = window.clientes?.[idx ?? window.clIdx];
  const o = c?.operacao_atual || {};
  setVal('oat-banco',           o.banco);
  setVal('oat-contrato',        o.num_contrato);
  setVal('oat-finalidade',      o.finalidade);
  setVal('oat-valor',           o.valor_total);
  setVal('oat-emissao',         o.data_emissao);
  setVal('oat-comis-banc-pct',  o.comissao_banco_pct);
  setVal('oat-comis-banc-rs',   o.comissao_banco_rs);
  setVal('oat-comis-part-pct',  o.comissao_part_pct);
  setVal('oat-comis-part-rs',   o.comissao_part_rs);
  setVal('oat-parc1',           o.data_1a_parcela);
  setVal('oat-parc-final',      o.data_parcela_final);
  setVal('oat-carencia-sel',    o.carencia_meses);
  setVal('oat-prazo-sel',       o.prazo_meses);
  setVal('oat-safra',           o.ano_safra);
  setVal('oat-carencia-atual',  o.carencia_atual);
  setVal('oat-prazo-atual',     o.prazo_atual);
};

// ── Participantes (cônjuge, avalista, empresa, arrendante) ───
window.carregarParticipantes = function(idx) {
  const c = window.clientes?.[idx ?? window.clIdx];
  const p = c?.participantes || {};

  // Cônjuge
  const cj = p.conjugue || {};
  setVal('conj-cpf',          cj.cpf);
  setVal('conj-nome',         cj.nome);
  setVal('conj-nasc',         cj.data_nascimento);
  setVal('conj-tipo-id',      cj.tipo_identidade);
  setVal('conj-di',           cj.numero_di);
  setVal('conj-emissao',      cj.data_emissao);
  setVal('conj-orgao',        cj.orgao_emissor);
  setVal('conj-uf-orgao',     cj.uf_orgao);
  setVal('conj-sexo',         cj.sexo);
  setVal('conj-escolaridade', cj.escolaridade);
  setVal('conj-profissao',    cj.profissao);
  setVal('conj-pai',          cj.nome_pai);
  setVal('conj-mae',          cj.nome_mae);
  setVal('conj-ddd',          cj.ddd_celular);
  setVal('conj-cel',          cj.celular);
  setVal('conj-email',        cj.email);

  // Avalista
  const av = p.avalista || {};
  setVal('aval-cpf',          av.cpf);
  setVal('aval-nome',         av.nome);
  setVal('aval-nasc',         av.data_nascimento);
  setVal('aval-tipo-id',      av.tipo_identidade);
  setVal('aval-di',           av.numero_di);
  setVal('aval-emissao',      av.data_emissao);
  setVal('aval-orgao',        av.orgao_emissor);
  setVal('aval-uf-orgao',     av.uf_orgao);
  setVal('aval-sexo',         av.sexo);
  setVal('aval-estado-civil', av.estado_civil);
  setVal('aval-profissao',    av.profissao);
  setVal('aval-pai',          av.nome_pai);
  setVal('aval-mae',          av.nome_mae);
  setVal('aval-ddd',          av.ddd_celular);
  setVal('aval-cel',          av.celular);
  setVal('aval-email',        av.email);

  // Empresa participante
  const em = p.empresa || {};
  setVal('emp-cnpj',          em.cnpj);
  setVal('emp-razao',         em.razao_social);
  setVal('emp-fantasia',      em.nome_fantasia);
  setVal('emp-abertura',      em.data_abertura);
  setVal('emp-atividade',     em.atividade);
  setVal('emp-responsavel',   em.responsavel);
  setVal('emp-cargo',         em.cargo);
  setVal('emp-ddd',           em.ddd_tel);
  setVal('emp-tel',           em.telefone);
  setVal('emp-email',         em.email);

  // Arrendante
  const ar = p.arrendante || {};
  setVal('arr-cpf',           ar.cpf);
  setVal('arr-nome',          ar.nome);
  setVal('arr-tipo-id',       ar.tipo_identidade);
  setVal('arr-di',            ar.numero_di);
  setVal('arr-emissao',       ar.data_emissao);
  setVal('arr-orgao',         ar.orgao_emissor);
  setVal('arr-logradouro',    ar.logradouro);
  setVal('arr-bairro',        ar.bairro);
  setVal('arr-uf',            ar.uf);
  setVal('arr-cidade',        ar.cidade);
  setVal('arr-tel',           ar.telefone);
  setVal('arr-email',         ar.email);
};

// ── Propriedade ──────────────────────────────────────────────
window.carregarPropriedade = function(idx) {
  const c  = window.clientes?.[idx ?? window.clIdx];
  const pr = c?.propriedade || {};

  setVal('prop-tipo',           pr.tipo_propriedade);
  // Proprietário
  setVal('prop-prop-nome',      pr.prop_nome);
  setVal('prop-prop-cpf',       pr.prop_cpf);
  setVal('prop-prop-tipo-doc',  pr.prop_tipo_doc);
  setVal('prop-prop-num-doc',   pr.prop_num_doc);
  setVal('prop-prop-data-emis', pr.prop_data_emissao);
  setVal('prop-prop-orgao',     pr.prop_orgao);
  setVal('prop-prop-uf-emis',   pr.prop_uf_emissao);
  setVal('prop-prop-logr',      pr.prop_logradouro);
  setVal('prop-prop-num',       pr.prop_numero);
  setVal('prop-prop-bairro',    pr.prop_bairro);
  setVal('prop-prop-uf',        pr.prop_uf);
  setVal('prop-prop-cidade',    pr.prop_cidade);
  setVal('prop-prop-cep',       pr.prop_cep);
  setVal('prop-prop-ddd',       pr.prop_ddd);
  setVal('prop-prop-tel',       pr.prop_tel);
  setVal('prop-prop-email',     pr.prop_email);
  // Dados Gerais
  setVal('prop-ger-nome',       pr.nome_propriedade);
  setVal('prop-ger-denom',      pr.denominacao);
  setVal('prop-ger-ie',         pr.inscricao_estadual);
  setVal('prop-ger-nirf',       pr.nirf);
  setVal('prop-ger-incra',      pr.incra);
  setVal('prop-ger-logr',       pr.ger_logradouro);
  setVal('prop-ger-bairro',     pr.ger_bairro);
  setVal('prop-ger-cep',        pr.ger_cep);
  // Vizinhos
  setVal('prop-viz-norte',      pr.viz_norte);
  setVal('prop-viz-sul',        pr.viz_sul);
  setVal('prop-viz-leste',      pr.viz_leste);
  setVal('prop-viz-oeste',      pr.viz_oeste);
  setVal('prop-viz-test1',      pr.testemunha1_nome);
  setVal('prop-viz-cpf1',       pr.testemunha1_cpf);
  setVal('prop-viz-test2',      pr.testemunha2_nome);
  setVal('prop-viz-cpf2',       pr.testemunha2_cpf);
  // Edafoclimáticos
  setVal('prop-ed-solo',        pr.tipo_solo);
  setVal('prop-ed-textura',     pr.textura_solo);
  setVal('prop-ed-relevo',      pr.relevo);
  setVal('prop-ed-drenagem',    pr.drenagem);
  setVal('prop-ed-precip',      pr.precipitacao_mm);
  setVal('prop-ed-temp',        pr.temperatura_media_c);
  setVal('prop-ed-alt',         pr.altitude_m);
  setVal('prop-ed-bioma',       pr.bioma);
  // Áreas
  setVal('prop-area-total',     pr.area_total_ha);
  setVal('prop-area-agri',      pr.area_agricultavel_ha);
  setVal('prop-area-past',      pr.area_pastagem_ha);
  setVal('prop-area-res',       pr.area_reserva_ha);
  setVal('prop-area-aprov',     pr.area_aproveitada_ha);
  setVal('prop-area-proj',      pr.area_projeto_ha);
  setVal('prop-area-app',       pr.area_app_ha);
  setVal('prop-area-inapta',    pr.area_inapta_ha);
  // Documentos
  setVal('prop-doc-tipo',       pr.doc_tipo);
  setVal('prop-doc-num',        pr.doc_numero);
  setVal('prop-doc-data',       pr.doc_data);
  setVal('prop-doc-cart',       pr.doc_cartorio);
  setVal('prop-doc-car',        pr.doc_num_car);
  setVal('prop-doc-ccir',       pr.doc_num_ccir);
  setVal('prop-doc-itr',        pr.doc_num_itr);
  setVal('prop-doc-sit',        pr.doc_situacao);
  // Benfeitorias
  setVal('prop-benf-desc',      pr.benf_descricao);
  setVal('prop-benf-qtd',       pr.benf_quantidade);
  setVal('prop-benf-vunit',     pr.benf_valor_unitario);
  setVal('prop-benf-vtotal',    pr.benf_valor_total);
  // Seguros
  setVal('prop-seg-seg',        pr.seg_seguradora);
  setVal('prop-seg-apolice',    pr.seg_num_apolice);
  setVal('prop-seg-vig',        pr.seg_vigencia);
  setVal('prop-seg-valor',      pr.seg_valor_segurado);
  // Nota Agronômica
  setVal('prop-nota-resp',      pr.nota_responsavel);
  setVal('prop-nota-crea',      pr.nota_crea);
  setVal('prop-nota-data',      pr.nota_data_visita);
  setVal('prop-nota-obs',       pr.nota_observacoes);
};

// ── Produção Agrícola ────────────────────────────────────────
window.carregarAgricola = function(idx) {
  const c = window.clientes?.[idx ?? window.clIdx];
  const ag = c?.agricola || {};

  const t = ag.temp || {};
  setVal('agr-temp-cultura',       t['agr-temp-cultura']);
  setVal('agr-temp-area',          t['agr-temp-area']);
  setVal('agr-temp-produtividade', t['agr-temp-produtividade']);
  setVal('agr-temp-producao',      t['agr-temp-producao']);
  setVal('agr-temp-preco',         t['agr-temp-preco']);
  setVal('agr-temp-receita',       t['agr-temp-receita']);
  setVal('agr-temp-periodo',       t['agr-temp-periodo']);
  setVal('agr-temp-destino',       t['agr-temp-destino']);

  const pm = ag.perm || {};
  setVal('agr-perm-cultura',       pm['agr-perm-cultura']);
  setVal('agr-perm-area',          pm['agr-perm-area']);
  setVal('agr-perm-plantas',       pm['agr-perm-plantas']);
  setVal('agr-perm-prod-planta',   pm['agr-perm-prod-planta']);
  setVal('agr-perm-producao',      pm['agr-perm-producao']);
  setVal('agr-perm-preco',         pm['agr-perm-preco']);
  setVal('agr-perm-receita',       pm['agr-perm-receita']);
  setVal('agr-perm-ano',           pm['agr-perm-ano']);

  const ou = ag.outras || {};
  setVal('agr-outras-desc',        ou['agr-outras-desc']);
  setVal('agr-outras-area',        ou['agr-outras-area']);
  setVal('agr-outras-qtd',         ou['agr-outras-qtd']);
  setVal('agr-outras-unidade',     ou['agr-outras-unidade']);
  setVal('agr-outras-preco',       ou['agr-outras-preco']);
  setVal('agr-outras-receita',     ou['agr-outras-receita']);

  const ex = ag.extr || {};
  setVal('agr-extr-produto',       ex['agr-extr-produto']);
  setVal('agr-extr-area',          ex['agr-extr-area']);
  setVal('agr-extr-qtd',           ex['agr-extr-qtd']);
  setVal('agr-extr-periodo',       ex['agr-extr-periodo']);
  setVal('agr-extr-preco',         ex['agr-extr-preco']);
  setVal('agr-extr-receita',       ex['agr-extr-receita']);
  setVal('agr-extr-destino',       ex['agr-extr-destino']);

  const ai = ag.agro || {};
  setVal('agr-agro-produto',       ai['agr-agro-produto']);
  setVal('agr-agro-qtd',           ai['agr-agro-qtd']);
  setVal('agr-agro-unidade',       ai['agr-agro-unidade']);
  setVal('agr-agro-preco',         ai['agr-agro-preco']);
  setVal('agr-agro-receita',       ai['agr-agro-receita']);
  setVal('agr-agro-periodo',       ai['agr-agro-periodo']);

  const re = ag.renda || {};
  setVal('agr-renda-desc',         re['agr-renda-desc']);
  setVal('agr-renda-mensal',       re['agr-renda-mensal']);
  setVal('agr-renda-meses',        re['agr-renda-meses']);
  setVal('agr-renda-anual',        re['agr-renda-anual']);
  setVal('agr-renda-responsavel',  re['agr-renda-responsavel']);
  setVal('agr-renda-origem',       re['agr-renda-origem']);

  if (typeof atualizarTotalAgricola === 'function') atualizarTotalAgricola();
};

// ── Produção Pecuária ────────────────────────────────────────
window.carregarPecuaria = function(idx) {
  const c = window.clientes?.[idx ?? window.clIdx];
  const pc = c?.pecuaria || {};

  const bov = pc.bov || {};
  setVal('pec-bov-raca',          bov['pec-bov-raca']);
  setVal('pec-bov-cabecas',       bov['pec-bov-cabecas']);
  setVal('pec-bov-peso',          bov['pec-bov-peso']);
  setVal('pec-bov-finalidade',    bov['pec-bov-finalidade']);
  setVal('pec-bov-preco',         bov['pec-bov-preco']);
  setVal('pec-bov-vendidas',      bov['pec-bov-vendidas']);
  setVal('pec-bov-receita',       bov['pec-bov-receita']);
  setVal('pec-bov-rebanho',       bov['pec-bov-rebanho']);

  const lei = pc.leite || {};
  setVal('pec-leite-vacas',       lei['pec-leite-vacas']);
  setVal('pec-leite-prod-dia',    lei['pec-leite-prod-dia']);
  setVal('pec-leite-dias',        lei['pec-leite-dias']);
  setVal('pec-leite-total',       lei['pec-leite-total']);
  setVal('pec-leite-preco',       lei['pec-leite-preco']);
  setVal('pec-leite-receita',     lei['pec-leite-receita']);

  const equ = pc.equ || {};
  setVal('pec-equ-raca',          equ['pec-equ-raca']);
  setVal('pec-equ-cabecas',       equ['pec-equ-cabecas']);
  setVal('pec-equ-finalidade',    equ['pec-equ-finalidade']);
  setVal('pec-equ-preco',         equ['pec-equ-preco']);
  setVal('pec-equ-vendidas',      equ['pec-equ-vendidas']);
  setVal('pec-equ-receita',       equ['pec-equ-receita']);

  const cap = pc.cap || {};
  setVal('pec-cap-raca',          cap['pec-cap-raca']);
  setVal('pec-cap-cabecas',       cap['pec-cap-cabecas']);
  setVal('pec-cap-finalidade',    cap['pec-cap-finalidade']);
  setVal('pec-cap-preco',         cap['pec-cap-preco']);
  setVal('pec-cap-vendidas',      cap['pec-cap-vendidas']);
  setVal('pec-cap-receita',       cap['pec-cap-receita']);

  const lca = pc.lcap || {};
  setVal('pec-lcap-cabras',       lca['pec-lcap-cabras']);
  setVal('pec-lcap-prod-dia',     lca['pec-lcap-prod-dia']);
  setVal('pec-lcap-dias',         lca['pec-lcap-dias']);
  setVal('pec-lcap-total',        lca['pec-lcap-total']);
  setVal('pec-lcap-preco',        lca['pec-lcap-preco']);
  setVal('pec-lcap-receita',      lca['pec-lcap-receita']);

  const ovi = pc.ovi || {};
  setVal('pec-ovi-raca',          ovi['pec-ovi-raca']);
  setVal('pec-ovi-cabecas',       ovi['pec-ovi-cabecas']);
  setVal('pec-ovi-finalidade',    ovi['pec-ovi-finalidade']);
  setVal('pec-ovi-preco',         ovi['pec-ovi-preco']);
  setVal('pec-ovi-vendidas',      ovi['pec-ovi-vendidas']);
  setVal('pec-ovi-receita',       ovi['pec-ovi-receita']);

  const sui = pc.sui || {};
  setVal('pec-sui-raca',          sui['pec-sui-raca']);
  setVal('pec-sui-cabecas',       sui['pec-sui-cabecas']);
  setVal('pec-sui-peso',          sui['pec-sui-peso']);
  setVal('pec-sui-preco',         sui['pec-sui-preco']);
  setVal('pec-sui-vendidas',      sui['pec-sui-vendidas']);
  setVal('pec-sui-receita',       sui['pec-sui-receita']);

  const ave = pc.aves || {};
  setVal('pec-aves-especie',      ave['pec-aves-especie']);
  setVal('pec-aves-qtd',          ave['pec-aves-qtd']);
  setVal('pec-aves-ovos',         ave['pec-aves-ovos']);
  setVal('pec-aves-preco',        ave['pec-aves-preco']);
  setVal('pec-aves-vendidas',     ave['pec-aves-vendidas']);
  setVal('pec-aves-receita',      ave['pec-aves-receita']);

  const out = pc.out || {};
  setVal('pec-out-desc',          out['pec-out-desc']);
  setVal('pec-out-qtd',           out['pec-out-qtd']);
  setVal('pec-out-unidade',       out['pec-out-unidade']);
  setVal('pec-out-preco',         out['pec-out-preco']);
  setVal('pec-out-vendidas',      out['pec-out-vendidas']);
  setVal('pec-out-receita',       out['pec-out-receita']);

  if (typeof atualizarTotalPec === 'function') atualizarTotalPec();
};

// ── Status do Processo / Elaboração ─────────────────────────
window.carregarStatusProcesso = async function(idx) {
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
    const key = { 'Em andamento':'andamento','Aguardando assinatura':'assinatura','Concluido':'concluido','Cancelado':'cancelado' }[status];
    const btn = document.getElementById('sbtn-' + key);
    if (btn) btn.classList.add('sel');
    const badge = document.getElementById('status-processo-badge');
    if (badge) { badge.className = 'status-badge status-' + key; badge.textContent = status; }
    if (c) c.elaboracao = data;
  } catch(e) { console.warn('Erro ao carregar status processo:', e); }
};

// ── Foto do Cliente ──────────────────────────────────────────
window.carregarFoto = function(idx) {
  const c = window.clientes?.[idx ?? window.clIdx];
  const fotoUrl = c?.foto_url || c?.dados_pessoais?.foto_url || null;
  const el = document.getElementById('cl-foto') || document.getElementById('foto-preview');
  if (!el) return;
  if (fotoUrl) {
    if (el.tagName === 'IMG') { el.src = fotoUrl; el.style.display = ''; }
    else { el.style.backgroundImage = `url(${fotoUrl})`; }
  } else {
    if (el.tagName === 'IMG') { el.src = ''; el.style.display = 'none'; }
    else { el.style.backgroundImage = 'none'; }
  }
};

// ── Logo da Empresa ──────────────────────────────────────────
// UPLOAD: carregarLogoEmpresa(input) está no index.html — não sobrescrever!
// Esta função apenas exibe a logo já salva no preview (sem argumento = modo exibição)
window.exibirLogoEmpresa = function() {
  const logoUrl = window._scaCache?.empresa_logo_url || window._scaCache?.empresa?.logo_url || null;
  const box = document.getElementById('emp-logo-box');
  if (box && logoUrl) {
    box.innerHTML = '<img src="' + logoUrl + '" style="width:100%;height:100%;object-fit:contain;" />';
  }
};

// ── Renderizar Anexos ────────────────────────────────────────
window.renderizarAnexos = function(idx) {
  const c = window.clientes?.[idx ?? window.clIdx];
  const lista = document.getElementById('anx-lista');
  if (!lista) return;
  const anexos = c?.anexos || [];
  if (anexos.length === 0) {
    lista.innerHTML = '<p style="padding:10px;color:#888;font-style:italic;font-size:.82rem;">Nenhum anexo.</p>';
    return;
  }
  lista.innerHTML = anexos.map((a, i) => `
    <div class="dash-item" style="gap:8px;">
      <span class="dash-item-icon">📎</span>
      <div class="dash-item-info" style="flex:1;font-size:.82rem;">
        <b>${a.descricao || a.arquivo_nome || 'Anexo'}</b>
        ${a.arquivo_nome ? `<br><span style="color:#888;font-size:.74rem;">${a.arquivo_nome}</span>` : ''}
      </div>
      ${a.arquivo_url ? `<a href="${a.arquivo_url}" target="_blank" style="font-size:.78rem;color:#1a5c38;">📥 Ver</a>` : ''}
      <button onclick="excluirAnexo(${i})" class="action-btn btn-del" title="Excluir">🗑️</button>
    </div>`).join('');
};

// ── Renderizar Equipe ────────────────────────────────────────
window.renderizarEquipe = function() {
  const lista = document.getElementById('equipe-lista');
  if (!lista) return;
  const eq = window.equipe || window._scaCache?.equipe || [];
  if (eq.length === 0) {
    lista.innerHTML = '<tr><td colspan="9" style="padding:30px;text-align:center;color:#888;font-style:italic;font-size:.86rem;background:#d4dcc5;">Nenhum membro cadastrado. Clique em "Adicionar Membro" para começar.</td></tr>';
    return;
  }
  lista.innerHTML = eq.map((m, i) => {
    const nasc = m.data_nascimento ? m.data_nascimento.split('-').reverse().join('/') : '—';
    const bg = i % 2 === 0 ? '#e8edda' : '#d4dcc5';
    return `<tr style="background:${bg};border-bottom:1px solid #b8c9a8;font-size:.78rem;">
      <td style="padding:8px 12px;text-align:center;font-weight:700;color:#1a2a4a;border-right:1px solid #b8c9a8;white-space:nowrap;">${String(i+1).padStart(3,'0')}</td>
      <td style="padding:8px 12px;font-weight:700;color:#1a2a4a;border-right:1px solid #b8c9a8;">${m.nome || '—'}</td>
      <td style="padding:8px 12px;text-align:center;border-right:1px solid #b8c9a8;white-space:nowrap;">${m.cpf || '—'}</td>
      <td style="padding:8px 12px;text-align:center;border-right:1px solid #b8c9a8;white-space:nowrap;">${nasc}</td>
      <td style="padding:8px 12px;color:#1a5c38;font-weight:600;border-right:1px solid #b8c9a8;">${m.cargo || '—'}</td>
      <td style="padding:8px 12px;text-align:center;border-right:1px solid #b8c9a8;white-space:nowrap;">${m.crea_cfb || '—'}</td>
      <td style="padding:8px 12px;text-align:center;border-right:1px solid #b8c9a8;white-space:nowrap;">${m.celular || '—'}</td>
      <td style="padding:8px 12px;border-right:1px solid #b8c9a8;">${m.email || '—'}</td>
      <td style="padding:8px 12px;text-align:center;white-space:nowrap;">
        <button onclick="editarMembro(${i})" style="background:#f39c12;color:#fff;border:none;border-radius:7px;padding:5px 10px;cursor:pointer;font-size:.75rem;font-weight:700;margin-right:4px;">✏️</button>
        <button onclick="excluirMembro(${i})" style="background:#e74c3c;color:#fff;border:none;border-radius:7px;padding:5px 10px;cursor:pointer;font-size:.75rem;font-weight:700;">🗑</button>
      </td>
    </tr>`;
  }).join('');
};

// ── Renderizar Histórico de Documentos ──────────────────────
window.renderizarHistoricoDocs = async function() {
  const lista = document.getElementById('hist-docs-lista');
  if (!lista || !window.supa) return;
  const clienteId = getClienteId();
  if (!clienteId) {
    lista.innerHTML = '<p style="padding:10px;color:#888;font-style:italic;font-size:.82rem;">Selecione um cliente.</p>';
    return;
  }
  try {
    const { data } = await window.supa.from('historico_documentos')
      .select('*').eq('cliente_id', clienteId).order('gerado_em', { ascending: false }).limit(50);
    if (!data || data.length === 0) {
      lista.innerHTML = '<p style="padding:10px;color:#888;font-style:italic;font-size:.82rem;">Nenhum documento gerado.</p>';
      return;
    }
    lista.innerHTML = data.map(d => `
      <div class="dash-item" style="gap:8px;">
        <span class="dash-item-icon">📄</span>
        <div class="dash-item-info" style="flex:1;font-size:.82rem;">${d.nome_documento}</div>
        <div class="dash-item-time">${d.gerado_em ? new Date(d.gerado_em).toLocaleString('pt-BR') : ''}</div>
      </div>`).join('');
  } catch(e) { console.warn('Erro histórico docs:', e); }
};

// ── histDocsGetCliente ───────────────────────────────────────
window.histDocsGetCliente = async function(clienteId) {
  if (!window.supa || !clienteId) return [];
  try {
    const { data } = await window.supa.from('historico_documentos')
      .select('*').eq('cliente_id', clienteId).order('gerado_em', { ascending: false });
    return data || [];
  } catch(e) { return []; }
};

// ── Renderizar Operações em Ser ──────────────────────────────
window.renderizarOperacoes = function(idx) {
  const c = window.clientes?.[idx ?? window.clIdx];
  const lista = document.getElementById('ops-lista');
  if (!lista) return;
  const ops = c?.operacoes || [];
  if (ops.length === 0) {
    lista.innerHTML = '<p style="padding:10px;color:#888;font-style:italic;font-size:.82rem;">Nenhuma operação.</p>';
    return;
  }
  const fmt = v => v ? parseFloat(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : '-';
  lista.innerHTML = ops.map((o, i) => `
    <div class="dash-item" style="gap:8px;flex-wrap:wrap;">
      <span class="dash-item-icon">📝</span>
      <div class="dash-item-info" style="flex:1;font-size:.82rem;min-width:160px;">
        <b>${o.banco || '-'}</b> — ${o.finalidade || '-'}
        <br><span style="color:#888;font-size:.74rem;">Contrato: ${o.num_contrato || '-'} | Valor: ${fmt(o.valor_total)}</span>
      </div>
      <button onclick="excluirOperacao(${i})" class="action-btn btn-del" title="Excluir">🗑️</button>
    </div>`).join('');
};

// ── Renderizar Status Templates (Elaboração) ─────────────────
window.renderizarStatusTemplates = async function() {
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
          ${obs ? `<br><span style="color:#888;font-size:.76rem;">${obs}</span>` : ''}
        </div>
      </div>`;
  } catch(e) { console.warn('Erro renderizarStatusTemplates:', e); }
};

console.log('✅ sca_supabase.js carregado — integração completa ativa.');

})();
