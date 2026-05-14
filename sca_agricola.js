// ============================================================
//  SCA – Módulo Agrícola v1.0
//  Arquivo: sca_agricola.js
//  Carregue APÓS sca_supabase.js e sca_receita.js
//
//  O que faz:
//  Gerenciamento multi-item das tabelas agrícolas.
//  Suporta: temporária, permanente, outras culturas, extrativismo,
//  agroindústria e renda fora. INSERT/DELETE por linha via Supabase.
// ============================================================

(function() {
'use strict';

const TABELAS_AGR = {
  temp:  'agr_temporaria',
  perm:  'agr_permanente',
  outras:'agr_outras_culturas',
  extr:  'agr_extrativismo',
  agro:  'agr_agroindustria',
  renda: 'agr_renda_fora'
};

// Mapeamento data-field → coluna do banco
const AGR_CAMPOS = {
  temp:  { cultura:'cultura', area:'area_ha', produtividade:'produtividade_kg_ha', producao:'producao_total_kg', preco:'preco_unitario', receita:'receita_bruta', periodo:'periodo_colheita', destino:'destino_producao' },
  perm:  { cultura:'cultura', area:'area_ha', plantas:'num_plantas', prod_planta:'prod_por_planta_kg', producao:'producao_total_kg', preco:'preco_unitario', receita:'receita_bruta', ano:'ano_plantio' },
  outras:{ desc:'descricao', area:'area_ha', qtd:'quantidade', unidade:'unidade', preco:'preco_unitario', receita:'receita_bruta' },
  extr:  { produto:'produto', area:'area_ha', qtd:'quantidade_kg', periodo:'periodo_coleta', preco:'preco_unitario', receita:'receita_bruta', destino:'destino' },
  agro:  { produto:'produto', qtd:'quantidade', unidade:'unidade', preco:'preco_unitario', receita:'receita_bruta', periodo:'periodo' },
  renda: { desc:'descricao', mensal:'valor_mensal', meses:'meses_no_ano', anual:'valor_anual', responsavel:'responsavel', origem:'origem' }
};

// Mapeamento inverso: coluna do banco → data-field (para carregar)
const AGR_CAMPOS_INV = {};
Object.entries(AGR_CAMPOS).forEach(([key, mapa]) => {
  AGR_CAMPOS_INV[key] = {};
  Object.entries(mapa).forEach(([field, col]) => { AGR_CAMPOS_INV[key][col] = field; });
});

function getClienteId() {
  if (typeof clIdx === 'undefined' || clIdx < 0) return null;
  return window.clientes?.[clIdx]?.id || null;
}

function n(v)  { return parseFloat((v||'').replace(/\./g,'').replace(',','.')) || null; }
function ni(v) { return parseInt(v||'') || null; }

// Salva UM item como INSERT na tabela correta
async function salvarItemAgr(key, item) {
  const clienteId = getClienteId();
  if (!clienteId) { alert('Salve o cliente primeiro.'); return null; }
  const tabela = TABELAS_AGR[key];
  const mapa = AGR_CAMPOS[key];
  const payload = { cliente_id: clienteId };

  Object.entries(mapa).forEach(([field, col]) => {
    const el = item.querySelector(`[data-field="${field}"]`);
    if (!el) return;
    const v = el.value;
    // Campos numéricos
    if (['area_ha','produtividade_kg_ha','producao_total_kg','preco_unitario','receita_bruta',
         'prod_por_planta_kg','quantidade','quantidade_kg','valor_mensal','valor_anual'].includes(col)) {
      payload[col] = n(v);
    } else if (['num_plantas','ano_plantio','meses_no_ano'].includes(col)) {
      payload[col] = ni(v);
    } else {
      payload[col] = v || null;
    }
  });

  // Se o item já tem id do banco, atualiza (UPDATE); senão insere (INSERT)
  const rowId = item.dataset.rowId;
  if (rowId && window.supa) {
    const { error } = await window.supa.from(tabela).update(payload).eq('id', rowId);
    if (error) throw error;
    return rowId;
  } else if (window.supa) {
    const { data, error } = await window.supa.from(tabela).insert(payload).select('id').single();
    if (error) throw error;
    return data?.id || null;
  }
  return null;
}

// Salva todos os itens visíveis de uma aba
window.salvarAgricola = async function(key) {
  if (!getClienteId()) { alert('Salve o cliente primeiro.'); return; }
  const lista = document.getElementById('agr-' + key + '-lista');
  if (!lista) return;
  const items = lista.querySelectorAll('.agr-item');
  try {
    for (const item of items) {
      const rowId = await salvarItemAgr(key, item);
      if (rowId) item.dataset.rowId = rowId; // guarda id para futuros updates
    }
    if (typeof atualizarTotalAgricola === 'function') atualizarTotalAgricola();
    const st = document.getElementById('agr-' + key + '-status');
    if (st) { st.textContent='✅ Salvo!'; st.style.color='#1a5c38'; st.style.display=''; setTimeout(()=>st.style.display='none',3000); }
  } catch(e) {
    console.warn('[SCA] Erro ao salvar agricola:', e);
    alert('Erro ao salvar: ' + e.message);
  }
};

window.salvarAgricolaMulti = window.salvarAgricola;

// Remove item da tela E do banco (DELETE pelo id da linha)
window.agrRemoverItem = async function(key, idx) {
  if (!confirm('Remover este item?')) return;
  const lista = document.getElementById('agr-' + key + '-lista');
  if (!lista) return;
  const item = lista.querySelectorAll('.agr-item')[idx];
  if (!item) return;

  const rowId = item.dataset.rowId;
  if (rowId && window.supa) {
    const tabela = TABELAS_AGR[key];
    const { error } = await window.supa.from(tabela).delete().eq('id', rowId);
    if (error) { console.warn('[SCA] Erro ao deletar:', error); }
  }

  item.remove();
  // Renumera títulos e botões
  lista.querySelectorAll('.agr-item').forEach((el, i) => {
    el.dataset.idx = i;
    const title = el.querySelector('strong');
    const labels = { temp:'🌱 Temporária', perm:'🌳 Permanente', outras:'🌿 Outras Culturas', extr:'🪵 Extrativismo', agro:'🏭 Agroindústria', renda:'💰 Renda Fora' };
    if (title) title.textContent = (labels[key]||key) + ' #' + (i+1);
    const btn = el.querySelector('button[onclick*="agrRemoverItem"]');
    if (btn) btn.setAttribute('onclick', `agrRemoverItem('${key}',${i})`);
  });

  if (typeof atualizarTotalAgricola === 'function') atualizarTotalAgricola();
};

// Carrega itens do banco na tela — aceita array de objetos com colunas do banco
window.carregarAgricola = function(i) {
  const a = (window.clientes?.[i] || {}).agricola || {};
  ['temp','perm','outras','extr','agro','renda'].forEach(key => {
    const lista = document.getElementById('agr-' + key + '-lista');
    if (!lista) return;
    lista.innerHTML = '';
    const arr = Array.isArray(a[key]) ? a[key] : (a[key] ? [a[key]] : []);

    if (arr.length === 0) {
      if (typeof agrAdicionarItem === 'function') agrAdicionarItem(key);
      return;
    }

    arr.forEach((row, n) => {
      // Converte colunas do banco → data-field
      const inv = AGR_CAMPOS_INV[key] || {};
      const dados = {};
      Object.entries(row).forEach(([col, val]) => {
        const field = inv[col] || col;
        dados[field] = val;
      });

      if (typeof agrGerarItem === 'function') {
        lista.insertAdjacentHTML('beforeend', agrGerarItem(key, n, dados));
        const el = lista.querySelectorAll('.agr-item')[n];
        if (el) {
          if (row.id) el.dataset.rowId = row.id; // guarda id do banco
          if (typeof agrBindCalc === 'function') agrBindCalc(el, key);
        }
      }
    });
  });

  if (typeof atualizarTotalAgricola === 'function') atualizarTotalAgricola();
};

window.carregarAgricolaMulti = window.carregarAgricola;

console.log('[SCA-Agricola] ✅ Multi-item com INSERT/DELETE por linha ativo.');

// ── PROPRIETÁRIO: copiar dados do cliente ──
window.usarDadosClienteProprietario = function() {
  const g = id => document.getElementById(id)?.value || '';
  const s = (id, v) => { const el = document.getElementById(id); if (!el || !v) return; el.value = v; };

  s('prop-prop-nome',      g('cl-nome'));
  s('prop-prop-cpf',       g('cl-cpf'));
  s('prop-prop-tipo-doc',  g('dp-tipo-id'));
  s('prop-prop-num-doc',   g('dp-num-di'));
  s('prop-prop-data-emis', g('dp-data-emissao'));
  s('prop-prop-orgao',     g('dp-orgao'));
  s('prop-prop-uf-emis',   g('dp-uf-orgao'));
  s('prop-prop-logr',      g('end-logradouro'));
  s('prop-prop-num',       g('end-numero') || g('end-num') || '');
  s('prop-prop-bairro',    g('end-bairro'));
  s('prop-prop-uf',        g('end-uf'));
  s('prop-prop-cidade',    g('end-cidade'));
  s('prop-prop-cep',       g('end-cep'));
  s('prop-prop-ddd',       g('end-ddd1'));
  s('prop-prop-tel',       g('end-cel1'));
  s('prop-prop-email',     g('end-email'));
};
window.usarDadosClienteArrendante = function() {
  const g = id => document.getElementById(id)?.value || '';
  const s = (id, v) => { const el = document.getElementById(id); if (!el || !v) return; el.value = v; };
  const ss = (id, v) => { const el = document.getElementById(id); if (!el || !v) return; el.value = v; }; // select

  // CPF e Nome (campos principais do cliente)
  s('arr-cpf',   g('cl-cpf'));
  s('arr-nome',  g('cl-nome'));

  // Documento (Dados Pessoais)
  ss('arr-tipo-id', g('dp-tipo-id'));
  s('arr-di',       g('dp-num-di'));
  s('arr-emissao',  g('dp-data-emissao'));
  ss('arr-orgao',   g('dp-orgao'));

  // Endereço
  s('arr-logradouro', g('end-logradouro'));
  s('arr-bairro',     g('end-bairro'));
  ss('arr-uf',        g('end-uf'));
  s('arr-cidade',     g('end-cidade'));
  s('arr-tel',        (g('end-ddd1') + ' ' + g('end-cel1')).trim());
  s('arr-email',      g('end-email'));
};
})();
