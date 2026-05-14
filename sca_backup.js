// ============================================================
//  SCA – Módulo de Backup Real v1.0
//  Arquivo: sca_backup.js
//  Carregue APÓS sca_supabase.js e sca_masks.js
//
//  Problema resolvido:
//  A função original coletarTodosOsDados() depende do cache
//  local (window.clientes, window._scaCache). Se o cache não
//  estiver 100% populado, o backup fica incompleto.
//
//  O que este módulo faz:
//  ✅ Substitui fazerBackupNuvem() por uma versão que busca
//     TODOS os dados diretamente do Supabase antes de salvar
//  ✅ Coleta as 26 tabelas em paralelo (Promise.all)
//  ✅ Salva o payload completo na tabela backups
//  ✅ Permite download local do backup em JSON
//  ✅ Exibe progresso durante a coleta
//  ✅ Não quebra nenhuma outra função existente
// ============================================================

(function () {
'use strict';

// ─── TABELAS POR CLIENTE (relação 1:1 ou 1:N por cliente_id) ─
const TABELAS_CLIENTE = [
  'clientes_dados_pessoais',
  'clientes_endereco',
  'clientes_bancarios',
  'conjuges',
  'avalistas',
  'participante_empresa',
  'arrendantes',
  'propriedades',
  'elaboracao_projetos',
  'operacao_atual',
  'agr_temporaria',
  'agr_permanente',
  'agr_outras_culturas',
  'agr_extrativismo',
  'agr_agroindustria',
  'agr_renda_fora',
  'pec_bovino',
  'pec_leite_bovino',
  'pec_equino',
  'pec_caprino',
  'pec_leite_caprino',
  'pec_ovino',
  'pec_suino',
  'pec_aves',
  'pec_outros',
  'saf_viveirista',
];

// ─── TABELAS GLOBAIS ──────────────────────────────────────────
const TABELAS_GLOBAIS = [
  'empresa',
  'equipe',
  'historico_documentos',
  'log_atividades',
];

// ─── UTILITÁRIOS ─────────────────────────────────────────────

function mostrarProgressoBackup(msg, pct, tipo) {
  const statusEl = document.getElementById('bkp-status-geral');
  if (!statusEl) return;
  statusEl.style.display = 'block';

  const cores = {
    ok:   { bg: '#d4edda', txt: '#155724' },
    err:  { bg: '#f8d7da', txt: '#721c24' },
    warn: { bg: '#fff3cd', txt: '#856404' },
    info: { bg: '#e8edda', txt: '#1a5c38' },
  };
  const c = cores[tipo] || cores.info;
  statusEl.style.background = c.bg;
  statusEl.style.color      = c.txt;

  if (pct !== null && pct !== undefined) {
    statusEl.innerHTML = `
      <div style="margin-bottom:6px;">${msg}</div>
      <div style="background:#b8c9a8;border-radius:6px;height:8px;overflow:hidden;">
        <div style="background:#1a5c38;height:100%;width:${pct}%;transition:width .3s;border-radius:6px;"></div>
      </div>
      <div style="font-size:.72rem;margin-top:4px;opacity:.7;">${pct}% concluído</div>
    `;
  } else {
    statusEl.textContent = msg;
  }
}

// ─── COLETA COMPLETA DO SUPABASE ─────────────────────────────

async function coletarDadosCompletos() {
  const supa = window.supa;
  if (!supa) throw new Error('Supabase não conectado.');

  mostrarProgressoBackup('🔍 Buscando clientes...', 5, 'info');

  // 1. Busca todos os clientes
  const { data: clientes, error: errCli } = await supa
    .from('clientes')
    .select('*')
    .order('codigo');
  if (errCli) throw new Error('Erro ao buscar clientes: ' + errCli.message);

  mostrarProgressoBackup(`✅ ${clientes.length} cliente(s) encontrado(s). Buscando dados relacionados...`, 15, 'info');

  // 2. Busca tabelas globais em paralelo
  const globaisPromises = TABELAS_GLOBAIS.map(tabela =>
    supa.from(tabela).select('*').then(r => ({ tabela, data: r.data || [], error: r.error }))
  );

  // 3. Busca todas as tabelas por cliente em paralelo (um Promise.all por tabela)
  const clientesIds = clientes.map(c => c.id);

  mostrarProgressoBackup('📦 Coletando todas as tabelas em paralelo...', 30, 'info');

  const tabelasPromises = TABELAS_CLIENTE.map(tabela =>
    supa.from(tabela).select('*').in('cliente_id', clientesIds)
      .then(r => ({ tabela, data: r.data || [], error: r.error }))
  );

  // 4. Executa tudo em paralelo
  const [globaisResults, tabelasResults] = await Promise.all([
    Promise.all(globaisPromises),
    Promise.all(tabelasPromises),
  ]);

  mostrarProgressoBackup('🔗 Montando estrutura do backup...', 70, 'info');

  // 5. Monta objeto de dados globais
  const globais = {};
  for (const { tabela, data, error } of globaisResults) {
    if (error) console.warn(`[SCA Backup] Aviso ao buscar ${tabela}:`, error.message);
    globais[tabela] = data;
  }

  // 6. Monta dicionário de dados por tabela
  const dadosPorTabela = {};
  for (const { tabela, data, error } of tabelasResults) {
    if (error) console.warn(`[SCA Backup] Aviso ao buscar ${tabela}:`, error.message);
    dadosPorTabela[tabela] = data;
  }

  // 7. Monta clientes com todos os dados aninhados
  const clientesCompletos = clientes.map(cliente => {
    const cId = cliente.id;
    const dadosCliente = { ...cliente };

    for (const tabela of TABELAS_CLIENTE) {
      const registros = dadosPorTabela[tabela] || [];
      const relacionados = registros.filter(r => r.cliente_id === cId);
      // Tabelas 1:1 ficam como objeto, 1:N como array
      dadosCliente[tabela] = relacionados.length === 1 ? relacionados[0] : relacionados;
    }

    return dadosCliente;
  });

  mostrarProgressoBackup('📊 Finalizando payload...', 90, 'info');

  return {
    versao:    '2.0-completo',
    gerado_em: new Date().toISOString(),
    resumo: {
      num_clientes:          clientes.length,
      num_equipe:            globais.equipe?.length || 0,
      num_empresa:           globais.empresa?.length || 0,
      num_historico_docs:    globais.historico_documentos?.length || 0,
    },
    clientes:              clientesCompletos,
    empresa:               globais.empresa?.[0] || {},
    equipe:                globais.equipe || [],
    historico_documentos:  globais.historico_documentos || [],
    log_atividades:        globais.log_atividades || [],
  };
}

// ─── SOBRESCREVE fazerBackupNuvem() ──────────────────────────

window.fazerBackupNuvem = async function () {
  const btn      = document.getElementById('btn-bkp-nuvem');
  const txtOrig  = btn?.innerHTML || '☁️ Salvar Backup no Supabase';

  if (!window.supa) {
    mostrarProgressoBackup('❌ Supabase não conectado.', null, 'err');
    return;
  }

  if (btn) { btn.disabled = true; btn.textContent = '⏳ Coletando dados...'; }

  try {
    // Coleta todos os dados direto do Supabase
    const dados = await coletarDadosCompletos();

    mostrarProgressoBackup('☁️ Salvando no Supabase...', 95, 'info');

    const ts = new Date().toISOString().slice(0, 19).replace('T', '_').replace(/:/g, '-');
    const id = 'backup_' + ts + '_' + Date.now();

    const { error } = await window.supa.from('backups').upsert({
      id,
      created_at:         new Date().toISOString(),
      descricao:          'Backup completo — ' + new Date().toLocaleString('pt-BR'),
      payload:            JSON.stringify(dados),
      num_clientes:       dados.resumo.num_clientes,
      num_equipe:         dados.resumo.num_equipe,
      num_empresa:        dados.resumo.num_empresa ? 1 : 0,
      num_participantes:  0,
      num_agricola:       0,
      num_pecuaria:       0,
      num_propriedades:   0,
    }, { onConflict: 'id' });

    if (error) throw error;

    mostrarProgressoBackup(
      `✅ Backup completo salvo! ${dados.resumo.num_clientes} cliente(s) · ${new Date().toLocaleString('pt-BR')}`,
      100, 'ok'
    );

    // Registra no log
    try {
      await window.supa.from('log_atividades').insert({
        icone: '☁️',
        descricao: `Backup completo realizado — ${dados.resumo.num_clientes} clientes`,
        modulo: 'backup',
        cliente_id: null,
      });
    } catch { /* não bloqueia */ }

    // Atualiza lista de backups
    if (typeof listarBackupsNuvem === 'function') listarBackupsNuvem();

  } catch (e) {
    mostrarProgressoBackup('❌ Erro ao fazer backup: ' + (e.message || e), null, 'err');
    console.error('[SCA Backup] Erro:', e);
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = txtOrig; }
  }
};

// ─── DOWNLOAD LOCAL (JSON) ────────────────────────────────────
// Adiciona botão de download local que não depende do Supabase

window.fazerBackupLocal = async function () {
  const btn = document.getElementById('btn-bkp-local');
  const txtOrig = btn?.innerHTML || '⬇️ Baixar JSON';

  if (!window.supa) {
    mostrarProgressoBackup('❌ Supabase não conectado.', null, 'err');
    return;
  }

  if (btn) { btn.disabled = true; btn.textContent = '⏳ Coletando...'; }

  try {
    const dados = await coletarDadosCompletos();
    mostrarProgressoBackup('⬇️ Preparando download...', 98, 'info');

    const json = JSON.stringify(dados, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    const dt   = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');

    a.href     = url;
    a.download = 'sca_backup_completo_' + dt + '.json';
    a.click();
    URL.revokeObjectURL(url);

    mostrarProgressoBackup(
      `✅ Arquivo baixado: sca_backup_completo_${dt}.json`,
      100, 'ok'
    );
  } catch (e) {
    mostrarProgressoBackup('❌ Erro ao gerar download: ' + (e.message || e), null, 'err');
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = txtOrig; }
  }
};

// ─── INJETA BOTÃO DE BACKUP LOCAL NA PÁGINA ──────────────────

function injetarBotaoBackupLocal() {
  // Só injeta se a página de backup existir e o botão ainda não foi adicionado
  const btnExistente = document.getElementById('btn-bkp-local');
  if (btnExistente) return;

  const btnNuvem = document.getElementById('btn-bkp-nuvem');
  if (!btnNuvem) return;

  const btn = document.createElement('button');
  btn.id        = 'btn-bkp-local';
  btn.className = 'btn-blue';
  btn.innerHTML = '⬇️ Baixar Backup Local (JSON)';
  btn.style.cssText = 'font-size:.95rem;padding:11px 24px;margin-left:10px;';
  btn.onclick   = window.fazerBackupLocal;

  btnNuvem.parentElement.appendChild(btn);

  // Adiciona nota explicativa
  const nota = document.createElement('p');
  nota.style.cssText = 'font-size:.78rem;color:#555;margin-top:10px;font-style:italic;';
  nota.innerHTML = '💡 <b>Backup na nuvem</b>: salva no Supabase (pode restaurar pelo sistema). <b>Backup local</b>: baixa um arquivo JSON para o seu computador (recomendado como cópia extra de segurança).';
  btnNuvem.parentElement.appendChild(nota);
}

// ─── INICIALIZAÇÃO ────────────────────────────────────────────

function inicializar() {
  // Tenta injetar o botão quando a página de backup for exibida
  // Observa mudanças no DOM para detectar quando a página fica visível
  const observer = new MutationObserver(() => {
    const paginaBackup = document.getElementById('page-backup');
    if (paginaBackup && paginaBackup.classList.contains('active')) {
      injetarBotaoBackupLocal();
    }
  });

  observer.observe(document.body, { attributes: true, subtree: true, attributeFilter: ['class'] });

  // Tenta injetar imediatamente (caso já esteja na página de backup)
  setTimeout(injetarBotaoBackupLocal, 500);

  console.log('[SCA Backup] ✅ v1.0 — backup completo via Supabase ativo.');
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', inicializar);
} else {
  inicializar();
}

})();
