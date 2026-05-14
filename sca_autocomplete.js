// ============================================================
//  SCA – Módulo Autocomplete v1.0
//  Arquivo: sca_autocomplete.js
//  Carregue APÓS sca_supabase.js
//
//  O que faz:
//  Autocomplete de CPF e Nome de cliente nos formulários.
//  Detecta duplicatas, destaca correspondências e preenche
//  campos automaticamente ao selecionar um cliente.
// ============================================================

(function() {

const acState = { cpf: -1, nome: -1 };
let acDupIdx = -1; // índice do cliente duplicado encontrado

function highlight(text, query) {
if (!query) return text;
const idx = text.toLowerCase().indexOf(query.toLowerCase());
if (idx === -1) return text;
return text.slice(0,idx) +
'<span class="ac-match">' + text.slice(idx, idx+query.length) + '</span>' +
text.slice(idx+query.length);}

function acRenderizar(tipo, resultados, query) {
const drop = document.getElementById('ac-drop-' + tipo);
if (!drop) return;
acState[tipo] = -1;

if (!resultados.length) {
drop.innerHTML = '';
drop.classList.remove('open');
return;}

drop.innerHTML = resultados.map((c, i) => {
const nomeHL = highlight(c.nome || '', query);
const cpfHL  = highlight(c.cpf  || '', query);
return `<div class="ac-item" data-idx="${c.__idx}"
onmousedown="acSelecionar(${c.__idx})"
onmouseover="acHover('${tipo}',${i})">
<div class="ac-item-name">${nomeHL}</div>
<div class="ac-item-cpf">${cpfHL}</div>
<div class="ac-item-badge">Cód. ${c.codigo || '—'}</div>
</div>`;
}).join('');

drop.classList.add('open');}

window.acBuscar = function(tipo, valor) {
const aviso = document.getElementById('ac-dup-aviso');

if (aviso) aviso.classList.remove('show');
acDupIdx = -1;

if (!valor || valor.length < 2) {
const drop = document.getElementById('ac-drop-' + tipo);
if (drop) { drop.innerHTML = ''; drop.classList.remove('open'); }
return;}

const query = valor.toLowerCase().replace(/\D/g, tipo === 'cpf' ? '' : valor);
const lista = (window.clientes || []);

const matches = lista
.map((c, i) => ({ ...c, __idx: i }))
.filter(c => {
if (tipo === 'cpf') {
const cpfLimpo = (c.cpf || '').replace(/\D/g,'');
const valLimpo = valor.replace(/\D/g,'');
return cpfLimpo.includes(valLimpo) && valLimpo.length >= 3;
} else {
return (c.nome || '').toLowerCase().includes(valor.toLowerCase());}
})
.slice(0, 8);

if (tipo === 'cpf') {
const valLimpo = valor.replace(/\D/g,'');
if (valLimpo.length === 11) {
const dupIdx = lista.findIndex(c => (c.cpf||'').replace(/\D/g,'') === valLimpo);
if (dupIdx !== -1 && dupIdx !== clIdx) {
acDupIdx = dupIdx;
const txtEl = document.getElementById('ac-dup-texto');
if (txtEl) txtEl.textContent = `CPF já cadastrado: ${lista[dupIdx].nome}`;
if (aviso) aviso.classList.add('show');
const drop = document.getElementById('ac-drop-cpf');
if (drop) { drop.innerHTML = ''; drop.classList.remove('open'); }
return;}}}

acRenderizar(tipo, matches, valor);};

window.acCarregarExistente = function() {
if (acDupIdx === -1) return;
const aviso = document.getElementById('ac-dup-aviso');
if (aviso) aviso.classList.remove('show');
clIdx = acDupIdx;
exibirCliente(clIdx);
acFecharTodos();
clStatus('📂 Cadastro existente carregado. Use ✏️ Editar para modificar.', 'info');};

window.acSelecionar = function(idx) {
const c = (window.clientes || [])[idx];
if (!c) return;

document.getElementById('cl-codigo').value = c.codigo || '';
document.getElementById('cl-cpf').value    = c.cpf    || '';
document.getElementById('cl-nome').value   = c.nome   || '';
document.getElementById('cl-data').value   = c.data_cadastro || c.data || '';

clIdx = idx;
exibirCliente(idx);
acFecharTodos();
clStatus('📂 Cadastro carregado automaticamente.', 'ok');};

window.acHover = function(tipo, i) {
acState[tipo] = i;
const drop = document.getElementById('ac-drop-' + tipo);
if (!drop) return;
drop.querySelectorAll('.ac-item').forEach((el, j) => {
el.classList.toggle('ac-selected', j === i);
});};

window.acNavegar = function(e, tipo) {
const drop = document.getElementById('ac-drop-' + tipo);
if (!drop || !drop.classList.contains('open')) return;
const items = drop.querySelectorAll('.ac-item');
if (!items.length) return;

if (e.key === 'ArrowDown') {
e.preventDefault();
acState[tipo] = Math.min(acState[tipo] + 1, items.length - 1);
} else if (e.key === 'ArrowUp') {
e.preventDefault();
acState[tipo] = Math.max(acState[tipo] - 1, 0);
} else if (e.key === 'Enter') {
e.preventDefault();
if (acState[tipo] >= 0) {
const idx = parseInt(items[acState[tipo]].dataset.idx);
acSelecionar(idx);}
return;
} else if (e.key === 'Escape') {
acFecharTodos();
return;}

items.forEach((el, j) => el.classList.toggle('ac-selected', j === acState[tipo]));
if (acState[tipo] >= 0) items[acState[tipo]].scrollIntoView({ block: 'nearest' });};

function acFecharTodos() {
['cpf','nome'].forEach(t => {
const drop = document.getElementById('ac-drop-' + t);
if (drop) { drop.innerHTML = ''; drop.classList.remove('open'); }
});}

document.addEventListener('click', function(e) {
if (!e.target.closest('.ac-wrapper') && !e.target.closest('.ac-dup-warning')) {
acFecharTodos();}
if (!e.target.closest('.busca-wrapper')) {
const r = document.getElementById('busca-global-results');
if (r) { r.innerHTML = ''; r.classList.remove('open'); }
const r2 = document.getElementById('gg-busca-results');
if (r2) { r2.innerHTML = ''; r2.classList.remove('open'); }}
});

})();

window._scaLog = [];

function logGetLocal() {
return window._scaLog || [];}

async function registrarLog(icone, texto, clienteNome) {
const entrada = {
id: 'log_' + Date.now() + '_' + Math.random().toString(36).slice(2,6),
icone: icone || '📝',
texto: texto || '',
cliente: clienteNome || '',
usuario: (document.getElementById('topbar-username') || {}).textContent || 'sistema',
data_hora: new Date().toISOString()};
window._scaLog.unshift(entrada);
if (window._scaLog.length > 200) window._scaLog.length = 200;
if (window.fbSalvar) {
window.fbSalvar('log_atividades', entrada.id, entrada).catch(() => {});}
if (document.getElementById('page-controle').classList.contains('active')) {
renderizarDashboard();
renderizarLogCompleto();}}

window._scaHistDocs = {};

function histDocsSaveCliente(cpf, docNome) {
if (!cpf) return;
const key = cpf.replace(/\D/g,'');
window._scaHistDocs[key] = window._scaHistDocs[key] || [];
window._scaHistDocs[key].unshift({ doc: docNome, data_hora: new Date().toISOString() });
if (window._scaHistDocs[key].length > 50) window._scaHistDocs[key].length = 50;
const id = 'hist_' + key + '_' + Date.now();
if (window.fbSalvar) {
window.fbSalvar('historico_docs', id, { id, cpf: key, doc: docNome, data_hora: new Date().toISOString() }).catch(() => {});
}}

function histDocsGetCliente(cpf) {
if (!cpf) return [];
const key = cpf.replace(/\D/g,'');
return window._scaHistDocs[key] || [];}

function renderizarHistoricoDocs(cpf) {
const sec = document.getElementById('hist-docs-section');
const lista = document.getElementById('hist-docs-lista');
if (!sec || !lista) return;
const docs = histDocsGetCliente(cpf);
if (docs.length === 0) { sec.style.display = 'none'; return; }
sec.style.display = 'block';
lista.innerHTML = docs.map(d => `
<div class="log-item">
<span class="log-icon">📄</span>
<span class="log-texto"><b>${d.doc}</b></span>
<span class="log-tempo">${formatarTempo(d.data_hora)}</span>
</div>`).join('');}

window.limparHistoricoCliente = function() {
if (!elabClienteSelecionado) return;
if (!confirm('Limpar histórico de documentos deste cliente?')) return;
const cpf = elabClienteSelecionado.cpf;
const key = (cpf || '').replace(/\D/g,'');
window._scaHistDocs = window._scaHistDocs || {};
window._scaHistDocs[key] = [];
renderizarHistoricoDocs(cpf);};

const STATUS_MAP = {
'Em andamento':          { cls: 'status-andamento',  icon: '🟡', btn: 'sbtn-andamento'  },
'Aguardando assinatura': { cls: 'status-assinatura', icon: '✍️', btn: 'sbtn-assinatura' },
'Concluido':             { cls: 'status-concluido',  icon: '✅', btn: 'sbtn-concluido'  },
'Cancelado':             { cls: 'status-cancelado',  icon: '❌', btn: 'sbtn-cancelado'  }};

window.definirStatusProcesso = function(status) {
if (!elabClienteSelecionado) return;
const cpf = elabClienteSelecionado.cpf;
const badge = document.getElementById('status-processo-badge');
const info = STATUS_MAP[status] || STATUS_MAP['Em andamento'];
if (badge) {
badge.className = 'status-badge ' + info.cls;
badge.textContent = info.icon + ' ' + status;}
Object.values(STATUS_MAP).forEach(v => {
const b = document.getElementById(v.btn);
if (b) b.classList.remove('sel');
});
const selBtn = document.getElementById(info.btn);
if (selBtn) selBtn.classList.add('sel');
const idx = (window.clientes || []).findIndex(c => c.cpf === cpf);
if (idx >= 0) {
window.clientes[idx].status_processo = status;
const _cIdSt=(clientes[idx]?.id)||((clientes[idx]?.cpf||'').replace(/\D/g,''));
if(_cIdSt&&window.supa){window.supa.from('clientes').update({status_processo:status}).eq('id',_cIdSt).then(r=>{if(r.error)console.warn('status err:',r.error)});}
}
registrarLog('📋', 'Status alterado para "' + status + '"', elabClienteSelecionado.nome);};

window.salvarStatusProcesso = function() {
if (!elabClienteSelecionado) return;
const obs = (document.getElementById('status-obs') || {}).value || '';
const cpf = elabClienteSelecionado.cpf;
const idx = (window.clientes || []).findIndex(c => c.cpf === cpf);
if (idx >= 0) {
window.clientes[idx].status_obs = obs;
const _cIdSO=(window.clientes[idx]?.id)||((window.clientes[idx]?.cpf||'').replace(/\D/g,''));
if(_cIdSO&&window.supa){window.supa.from('clientes').update({status_obs:obs}).eq('id',_cIdSO).then(r=>{if(r.error)console.warn('status_obs err:',r.error)});}
}};

function carregarStatusProcesso(cliente) {
const bar = document.getElementById('status-processo-bar');
if (!bar) return;
bar.style.display = cliente ? 'block' : 'none';
if (!cliente) return;
const status = cliente.status_processo || 'Em andamento';
const info = STATUS_MAP[status] || STATUS_MAP['Em andamento'];
const badge = document.getElementById('status-processo-badge');
if (badge) { badge.className = 'status-badge ' + info.cls; badge.textContent = info.icon + ' ' + status; }
Object.values(STATUS_MAP).forEach(v => {
const b = document.getElementById(v.btn);
if (b) b.classList.remove('sel');
});
const selBtn = document.getElementById(info.btn);
if (selBtn) selBtn.classList.add('sel');
const obs = document.getElementById('status-obs');
if (obs) obs.value = cliente.status_obs || '';}

function formatarTempo(iso) {
if (!iso) return '';
const agora = Date.now();
const d = new Date(iso);
const diff = Math.floor((agora - d.getTime()) / 1000);
if (diff < 60)   return 'agora';
if (diff < 3600) return Math.floor(diff/60) + 'min atrás';
if (diff < 86400) return Math.floor(diff/3600) + 'h atrás';
if (diff < 604800) return Math.floor(diff/86400) + 'd atrás';
return d.toLocaleDateString('pt-BR');}

function renderizarDashboard() {
const clientes = window.clientes || [];
const log = logGetLocal();
const total = clientes.length;
const andamento = clientes.filter(c => (!c.status_processo || c.status_processo === 'Em andamento')).length;
const concluidos = clientes.filter(c => c.status_processo === 'Concluido').length;
const assinatura = clientes.filter(c => c.status_processo === 'Aguardando assinatura').length;
const cardsEl = document.getElementById('dash-cards');
if (cardsEl) {
const cards = [
{ num: total,      label: 'Clientes',     cor: '#1a5c38' },
{ num: andamento,  label: 'Em andamento', cor: '#856404' },
{ num: assinatura, label: 'Ag. assinatura',cor: '#004085' },
{ num: concluidos, label: 'Concluídos',   cor: '#155724' },
];
cardsEl.innerHTML = cards.map(c => `
<div class="dash-card">
<div class="dash-card-num" style="color:${c.cor};">${c.num}</div>
<div class="dash-card-label">${c.label}</div>
</div>`).join('');}
const ultsClEl = document.getElementById('dash-ultimos-clientes');
if (ultsClEl) {
const recentes = [...clientes].reverse().slice(0, 5);
if (recentes.length === 0) {
ultsClEl.innerHTML = '<p style="font-size:.82rem;color:#888;font-style:italic;">Nenhum cliente cadastrado.</p>';
} else {
ultsClEl.innerHTML = recentes.map(c => {
const info = STATUS_MAP[c.status_processo] || STATUS_MAP['Em andamento'];
return `<div class="dash-item" style="cursor:pointer;" onclick="irParaCliente('${c.cpf}')">
<span class="dash-item-icon">👤</span>
<span class="dash-item-info"><b>${c.nome || '—'}</b><br/><span style="font-size:.74rem;color:#888;">${c.cpf || ''}</span></span>
<span class="status-badge ${info.cls}" style="font-size:.68rem;padding:2px 8px;">${info.icon} ${c.status_processo || 'Em andamento'}</span>
</div>`;
}).join('');}}
const ultsDocEl = document.getElementById('dash-ultimos-docs');
if (ultsDocEl) {
const docsLog = log.filter(l => l.icone === '📄').slice(0, 6);
if (docsLog.length === 0) {
ultsDocEl.innerHTML = '<p style="font-size:.82rem;color:#888;font-style:italic;">Nenhum documento gerado ainda.</p>';
} else {
ultsDocEl.innerHTML = docsLog.map(l => `
<div class="dash-item">
<span class="dash-item-icon">📄</span>
<span class="dash-item-info"><b>${l.texto}</b><br/><span style="font-size:.74rem;color:#888;">${l.cliente || ''}</span></span>
<span class="dash-item-time">${formatarTempo(l.data_hora)}</span>
</div>`).join('');}}}

function irParaCliente(cpf) {
const idx = (window.clientes || []).findIndex(c => c.cpf === cpf);
if (idx >= 0) {
clIdx = idx;
exibirCliente(idx);
showPage('clientes', document.querySelector('[onclick*="\'clientes\'"]'));}}

let _buscaIdx = -1;
window.buscaGlobalFiltrar = function(valor) {
const drop = document.getElementById('busca-global-results');
if (!drop) return;
if (!valor || valor.length < 1) { drop.innerHTML = ''; drop.classList.remove('open'); return; }
const q = valor.toLowerCase();
const matches = (window.clientes || [])
.map((c, i) => ({ ...c, __i: i }))
.filter(c => (c.nome||'').toLowerCase().includes(q) || (c.cpf||'').replace(/\D/g,'').includes(q.replace(/\D/g,'')))
.slice(0, 8);
if (!matches.length) { drop.innerHTML = '<div style="padding:10px 14px;font-size:.82rem;color:#999;font-style:italic;">Nenhum cliente encontrado.</div>'; drop.classList.add('open'); return; }
_buscaIdx = -1;
drop.innerHTML = matches.map(c => `
<div class="busca-result-item" onmousedown="buscaGlobalSelecionar(${c.__i})">
<span class="busca-result-nome">${c.nome || '—'}</span>
<span class="busca-result-cpf">${c.cpf || ''}</span>
<span class="busca-result-cod">Cód. ${c.codigo || '—'}</span>
</div>`).join('');
drop.classList.add('open');};

window.buscaGlobalNav = function(e) {
const drop = document.getElementById('busca-global-results');
if (!drop || !drop.classList.contains('open')) return;
const items = drop.querySelectorAll('.busca-result-item');
if (!items.length) return;
if (e.key === 'ArrowDown') { e.preventDefault(); _buscaIdx = Math.min(_buscaIdx+1, items.length-1); }
else if (e.key === 'ArrowUp') { e.preventDefault(); _buscaIdx = Math.max(_buscaIdx-1, 0); }
else if (e.key === 'Enter' && _buscaIdx >= 0) { e.preventDefault(); items[_buscaIdx].dispatchEvent(new Event('mousedown')); return; }
else if (e.key === 'Escape') { buscaGlobalLimpar(); return; }
items.forEach((el, j) => el.classList.toggle('ac-selected', j === _buscaIdx));
if (_buscaIdx >= 0) items[_buscaIdx].scrollIntoView({ block: 'nearest' });};

window.buscaGlobalSelecionar = function(idx) {
buscaGlobalLimpar();
clIdx = idx;
exibirCliente(idx);
showPage('clientes', document.querySelector('[onclick*="clientes"]'));};

window.buscaGlobalLimpar = function() {
const inp = document.getElementById('busca-global-input');
const drop = document.getElementById('busca-global-results');
if (inp) inp.value = '';
if (drop) { drop.innerHTML = ''; drop.classList.remove('open'); }};

function renderizarLogCompleto(comFeedback) {
const lista = document.getElementById('log-atividades-lista');
const btn   = document.getElementById('btn-log-atualizar');
if (!lista) return;

if (comFeedback && btn) {
btn.textContent = '✅ Atualizado!';
btn.style.background   = '#d4edda';
btn.style.borderColor  = '#c3e6cb';
btn.style.color        = '#155724';
setTimeout(() => {
btn.textContent       = '🔄 Atualizar';
btn.style.background  = 'none';
btn.style.borderColor = '#b8c9a8';
btn.style.color       = '';
}, 2000);}

const log = logGetLocal();
if (log.length === 0) {
lista.innerHTML = '<p style="font-size:.82rem;color:#888;font-style:italic;padding:12px 14px;">Nenhuma atividade registrada ainda.</p>';
return;}
lista.innerHTML = log.map(l => `
<div class="log-item">
<span class="log-icon">${l.icone || '📝'}</span>
<span class="log-texto">
<b>${l.texto || ''}</b>
${l.cliente ? '<span style="color:#888;"> — ' + l.cliente + '</span>' : ''}
${l.usuario ? '<span style="font-size:.72rem;color:#aaa;"> · ' + l.usuario + '</span>' : ''}
</span>
<span class="log-tempo">${formatarTempo(l.data_hora)}</span>
</div>`).join('');}
(function() {
const _gerarDocOrig = window.gerarDoc;
if (typeof _gerarDocOrig === 'function') {
window.gerarDoc = function(template, btn) {
const nomeDoc = btn ? btn.textContent.trim() : template;
const cliente = elabClienteSelecionado;
if (cliente) {
histDocsSaveCliente(cliente.cpf, nomeDoc);
registrarLog('📄', nomeDoc, cliente.nome);
renderizarHistoricoDocs(cliente.cpf);}
return _gerarDocOrig.apply(this, arguments);};}
})();

var elabClienteSelecionado = null;

(function() {
// confirmarCliente já corrigido acima
})();

window._showPageControle = function(name) {
if (name === 'controle') { setTimeout(renderizarDashboard, 100); setTimeout(renderizarLogCompleto, 120); }};

document.addEventListener('DOMContentLoaded', function() {
setTimeout(function() {
if (document.getElementById('app') && document.getElementById('app').style.display !== 'none') {
registrarLog('🔐', 'Login realizado', '');
renderizarDashboard();
renderizarLogCompleto();}
}, 2000);
});

// salvarCliente com log já integrado na função principal

(function() {

const DOMINIOS = [
'gmail.com', 'hotmail.com', 'outlook.com', 'yahoo.com',
'icloud.com', 'live.com', 'bol.com.br', 'uol.com.br',
'terra.com.br', 'ig.com.br', 'globo.com', 'protonmail.com'
];

function iniciarEmailAC(input) {
if (input._emailAC) return;
input._emailAC = true;

const parent = input.parentNode;
const wrap = document.createElement('div');
wrap.className = 'email-input-wrap';
parent.insertBefore(wrap, input);
wrap.appendChild(input);

const drop = document.createElement('div');
drop.className = 'email-drop';
wrap.appendChild(drop);

let selIdx = -1;

function fechar() {
drop.classList.remove('open');
drop.innerHTML = '';
selIdx = -1;}

function selecionar(valor) {
input.value = valor;
fechar();
input.focus();}

function renderizar(sugestoes) {
if (!sugestoes.length) { fechar(); return; }
selIdx = -1;
drop.innerHTML = sugestoes.map((s, i) =>
`<div class="email-drop-item" data-i="${i}">${s}</div>`
).join('');
drop.classList.add('open');
drop.querySelectorAll('.email-drop-item').forEach(el => {
el.addEventListener('mousedown', e => {
e.preventDefault();
selecionar(el.textContent);
});
});}

input.addEventListener('input', function() {
const val = this.value;
if (!val.includes('@')) { fechar(); return; }
const [usuario, domParcial] = val.split('@');
if (!usuario) { fechar(); return; }
const filtrados = DOMINIOS
.filter(d => !domParcial || d.startsWith(domParcial))
.map(d => usuario + '@' + d);
renderizar(filtrados.slice(0, 6));
});

input.addEventListener('keydown', function(e) {
const items = drop.querySelectorAll('.email-drop-item');
if (!items.length) return;
if (e.key === 'ArrowDown') {
e.preventDefault();
selIdx = Math.min(selIdx + 1, items.length - 1);
} else if (e.key === 'ArrowUp') {
e.preventDefault();
selIdx = Math.max(selIdx - 1, 0);
} else if (e.key === 'Enter' && selIdx >= 0) {
e.preventDefault();
selecionar(items[selIdx].textContent);
return;
} else if (e.key === 'Escape') {
fechar(); return;
} else if (e.key === 'Tab' && selIdx >= 0) {
e.preventDefault();
selecionar(items[selIdx].textContent);
return;}
items.forEach((el, i) => el.classList.toggle('sel', i === selIdx));
});

input.addEventListener('blur', () => setTimeout(fechar, 150));}

function iniciarTextoAC(input) {
if (input._textoAC) return;
input._textoAC = true;

input.addEventListener('blur', function() {
if (!this.value) return;
if (this.type === 'date' || this.id.includes('cpf') || this.id.includes('cep') ||
this.id.includes('tel') || this.id.includes('cel') || this.id.includes('ddd') ||
this.id.includes('cnpj') || this.id.includes('crea') || this.id.includes('caf')) return;
this.value = this.value.replace(/\b\w/g, l => l.toUpperCase());
});}

function aplicarEmTodos() {
document.querySelectorAll('input[type="email"]').forEach(iniciarEmailAC);
document.querySelectorAll('input[type="text"]:not([readonly]):not(.busca-input):not(.ac-wrapper input)').forEach(iniciarTextoAC);
}

document.addEventListener('DOMContentLoaded', aplicarEmTodos);
window._showPageEmail = function(name) { setTimeout(aplicarEmTodos, 200); };

document.addEventListener('click', function(e) {
if (!e.target.closest('.email-input-wrap')) {
document.querySelectorAll('.email-drop.open').forEach(d => {
d.classList.remove('open');
d.innerHTML = '';
});}
});

})();
window.addEventListener('load', function() {
setTimeout(function() {
if (document.getElementById('page-controle').classList.contains('active')) {
renderizarDashboard();
renderizarLogCompleto();}
}, 1200);
});
