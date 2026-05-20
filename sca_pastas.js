// ============================================================
//  SCA – Módulo Sistema de Pastas v1.0
//  Arquivo: sca_pastas.js
//  Carregue APÓS sca_supabase.js
//
//  O que faz:
//  Gerenciamento de pastas de clientes no Supabase Storage.
//  Criação automática de subpastas padrão, listagem, upload
//  e download de arquivos por cliente.
// ============================================================

// ══════════════════════════════════════════════════
//  SISTEMA DE PASTAS SCA — Armazenamento no Supabase
// ══════════════════════════════════════════════════
const PASTA_BUCKET = 'pastas-clientes';
const SUBPASTAS_PADRAO = [
  '01_Docs_pessoais','02_Docs_propriedade','03_Mapas','04_Fotos',
  '05_Ficha_de_campo','06_Adubacao','07_Docs_automaticos','08_Projeto_assinado',
  '09_Terras','10_Planilhas','11_Operacoes_em_ser','12_Cedula_bancaria',
  '13_Laudos','14_Notas_fiscais','15_SPdoc_pasta_de_envio','16_Diligencias'
];

// ══════════════════════════════════════════════════
//  CRIPTOGRAFIA AES-256-GCM — transparente ao usuário
//  A chave vem de window.SCA_CRYPTO_KEY (defina no
//  index.html ANTES de carregar este script):
//    <script>window.SCA_CRYPTO_KEY = 'sua-chave-secreta';</script>
// ══════════════════════════════════════════════════
const _SCA_CRYPTO_SALT = 'sca-pastas-salt-v1';
let _scaCryptoKey = null; // cache da CryptoKey derivada

async function _scaGetKey() {
  if (_scaCryptoKey) return _scaCryptoKey;
  const secret = window.SCA_CRYPTO_KEY || 'sca-chave-padrao-troque-isso';
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw', enc.encode(secret), 'PBKDF2', false, ['deriveKey']
  );
  _scaCryptoKey = await crypto.subtle.deriveKey(
    { name:'PBKDF2', salt:enc.encode(_SCA_CRYPTO_SALT), iterations:100000, hash:'SHA-256' },
    keyMaterial,
    { name:'AES-GCM', length:256 },
    false,
    ['encrypt','decrypt']
  );
  return _scaCryptoKey;
}

async function _scaEncrypt(file) {
  const key = await _scaGetKey();
  const iv  = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name:'AES-GCM', iv }, key, await file.arrayBuffer()
  );
  // Retorna Blob com [IV(12 bytes) + dados criptografados]
  return new Blob([iv, encrypted], { type:'application/octet-stream' });
}

async function _scaDecrypt(arrayBuffer) {
  const key = await _scaGetKey();
  const iv        = arrayBuffer.slice(0, 12);
  const encrypted = arrayBuffer.slice(12);
  return await crypto.subtle.decrypt({ name:'AES-GCM', iv }, key, encrypted);
}

function _scaMime(nome) {
  const ext = (nome.replace(/\.enc$/,'').split('.').pop()||'').toLowerCase();
  const map = {
    pdf:'application/pdf', png:'image/png',
    jpg:'image/jpeg', jpeg:'image/jpeg', gif:'image/gif',
    webp:'image/webp', bmp:'image/bmp', svg:'image/svg+xml',
    mp4:'video/mp4', mov:'video/quicktime', avi:'video/x-msvideo',
    mkv:'video/x-matroska', webm:'video/webm',
    mp3:'audio/mpeg', wav:'audio/wav', ogg:'audio/ogg', aac:'audio/aac',
    docx:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    xlsx:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    pptx:'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    txt:'text/plain', csv:'text/csv',
  };
  return map[ext] || 'application/octet-stream';
}

let _pastaRaiz   = '';   // ex: "CPF_NOME"
let _pastaCaminho= [];   // breadcrumb: [{nome,path}]
let _pastaItens  = [];   // itens carregados
let _pastaSelIdx = -1;   // índice selecionado

function _pastaStatus(msg, tipo='ok') {
  const el = document.getElementById('pasta-status-bar');
  if (!el) return;
  const cores = { ok:'#d4edda|#155724', err:'#f8d7da|#721c24', info:'#d1ecf1|#0c5460', warn:'#fff3cd|#856404' };
  const [bg, fg] = (cores[tipo]||cores.info).split('|');
  el.style.background = bg; el.style.color = fg; el.style.border = `1px solid ${fg}44`;
  el.textContent = msg; el.style.display = '';
  setTimeout(() => el.style.display = 'none', 3500);
}

function _nomePastaCliente() {
  const c = window.clientes && window.clientes[window.clIdx];
  if (!c) return null;
  const nomeRaw = (c.nome || 'Cliente')
    .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .replace(/[^a-zA-Z0-9 ]/g,'').trim().replace(/\s+/g,'_');
  const cpf = (c.cpf || 'semcpf').replace(/\D/g,'');
  return `${cpf}_${nomeRaw}`;
}

function _pastaAtual() {
  if (_pastaCaminho.length === 0) return _pastaRaiz;
  return _pastaCaminho[_pastaCaminho.length - 1].path;
}

function _iconeArquivo(nome) {
  const ext = (nome.split('.').pop() || '').toLowerCase();
  const map = {
    pdf:'📄', doc:'📝', docx:'📝', xls:'📊', xlsx:'📊', ppt:'📋', pptx:'📋',
    jpg:'🖼️', jpeg:'🖼️', png:'🖼️', gif:'🖼️', webp:'🖼️', bmp:'🖼️',
    mp4:'🎬', avi:'🎬', mov:'🎬', mkv:'🎬',
    mp3:'🎵', wav:'🎵', ogg:'🎵',
    zip:'📦', rar:'📦', '7z':'📦',
    txt:'📃', csv:'📃', json:'📃',
  };
  return map[ext] || '📎';
}

function _fmtTamanho(bytes) {
  if (!bytes) return '';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1048576) return (bytes/1024).toFixed(1) + ' KB';
  return (bytes/1048576).toFixed(1) + ' MB';
}

// ── ABRIR MODAL ──────────────────────────────────
async function criarPastaCliente() {
  if (typeof clIdx === 'undefined' || clIdx < 0 || !window.clientes || !window.clientes[clIdx]) {
    alert('⚠️ Selecione um cliente antes de criar a pasta.'); return;
  }
  if (!window.supa) { alert('❌ Supabase não conectado.'); return; }

  const raiz = _nomePastaCliente();
  if (!raiz) { alert('Cliente sem nome/CPF.'); return; }

  // Botão de feedback
  const btn = document.querySelector('[onclick="criarPastaCliente()"]');
  const origHTML = btn ? btn.innerHTML : '';
  if (btn) { btn.disabled = true; btn.innerHTML = '⏳ Criando...'; }

  try {
    await _garantirEstrutura_silencioso(raiz);
    _mostrarToastPasta('📁 Pasta criada com sucesso!\nSua nova pasta já está disponível e pronta para uso.');
  } catch(e) {
    alert('❌ Erro ao criar pasta: ' + (e.message || e));
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = origHTML; }
  }
}

async function _garantirEstrutura_silencioso(raiz) {
  const inf = new Blob([JSON.stringify({criado_em:new Date().toISOString()})],{type:'application/json'});
  await window.supa.storage.from(PASTA_BUCKET).upload(`${raiz}/.info`,inf,{upsert:true});
  for (const sub of SUBPASTAS_PADRAO) {
    const ph = new Blob([''],{type:'text/plain'});
    await window.supa.storage.from(PASTA_BUCKET).upload(`${raiz}/${sub}/.keep`,ph,{upsert:false});
  }
}

function _mostrarToastPasta(msg) {
  let toast = document.getElementById('pasta-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'pasta-toast';
    toast.style.cssText = 'position:fixed;bottom:32px;left:50%;transform:translateX(-50%);background:#1a5c38;color:#fff;border-radius:14px;padding:18px 28px;font-family:Nunito,sans-serif;font-size:.92rem;font-weight:700;box-shadow:0 8px 32px rgba(0,0,0,.28);z-index:9999;text-align:center;line-height:1.6;min-width:260px;max-width:90vw;opacity:0;transition:opacity .3s ease;white-space:pre-line;';
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.style.opacity = '1';
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => { toast.style.opacity = '0'; }, 3500);
}

function fecharPastaModal() {
  document.getElementById('pasta-modal').classList.remove('open');
  _pastaSelIdx = -1;
}

async function abrirGerenciadorPastas() {
  if (typeof clIdx === 'undefined' || clIdx < 0 || !window.clientes || !window.clientes[clIdx]) {
    alert('⚠️ Selecione um cliente antes de abrir o gerenciador.'); return;
  }
  if (!window.supa) { alert('❌ Supabase não conectado.'); return; }

  const raiz = _nomePastaCliente();
  if (!raiz) { alert('Cliente sem nome/CPF.'); return; }

  // Verifica se a pasta já existe no Supabase
  const { data, error } = await window.supa.storage.from('clientes-docs').list(raiz, { limit: 1 });
  if (error || !data) {
    const confirmar = confirm('Este cliente ainda não possui pasta criada.\nDeseja criar agora?');
    if (confirmar) { criarPastaCliente(); }
    return;
  }

  // Pasta existe: abre direto no gerenciador
  _pastaRaiz = raiz;
  _pastaCaminho = [];
  _pastaSelIdx = -1;

  const c = window.clientes[window.clIdx];
  document.getElementById('pasta-header-title').textContent = '🗂️ ' + (c.nome || 'Cliente');
  document.getElementById('pasta-modal').classList.add('open');
  await _renderizarPasta();
}

// ── CRIAR ESTRUTURA PADRÃO ───────────────────────
async function _garantirEstrutura() {
  const raiz = _pastaRaiz;
  // Cria arquivo marcador na raiz
  const inf = new Blob([JSON.stringify({criado_em:new Date().toISOString()})],{type:'application/json'});
  await window.supa.storage.from(PASTA_BUCKET).upload(`${raiz}/.info`,inf,{upsert:true});
  // Cria subpastas padrão
  for (const sub of SUBPASTAS_PADRAO) {
    const ph = new Blob([''],{type:'text/plain'});
    await window.supa.storage.from(PASTA_BUCKET).upload(`${raiz}/${sub}/.keep`,ph,{upsert:false});
  }
}

// ── RENDERIZAR CONTEÚDO DA PASTA ─────────────────
async function _renderizarPasta() {
  const grid = document.getElementById('pasta-grid');
  grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:24px;color:#888;font-size:.85rem;">⏳ Carregando...</div>';
  _pastaSelIdx = -1;
  document.getElementById('pasta-sel-info').textContent = '';

  const caminho = _pastaAtual();
  try {
    const { data, error } = await window.supa.storage.from(PASTA_BUCKET).list(caminho, { limit:200, sortBy:{column:'name',order:'asc'} });
    if (error) throw error;

    // Separa pastas e arquivos (ignora .keep e .info)
    const pastas   = (data||[]).filter(i => !i.id && i.name !== '.keep' && i.name !== '.info');
    const arquivos = (data||[]).filter(i => !!i.id && i.name !== '.keep' && i.name !== '.info');
    _pastaItens = [...pastas, ...arquivos];

    _renderizarBreadcrumb();

    if (_pastaItens.length === 0) {
      grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:24px;color:#aaa;font-style:italic;font-size:.84rem;">📭 Pasta vazia</div>';
      return;
    }

    grid.innerHTML = _pastaItens.map((item, i) => {
      const isPasta = !item.id;
      const icon = isPasta ? '📁' : _iconeArquivo(item.name);
      const size = isPasta ? '' : _fmtTamanho(item.metadata?.size);
      return `<div class="pasta-item" id="pi-${i}" onclick="selecionarItem(${i})" ondblclick="abrirItem(${i})">
        <div class="pasta-item-actions">
          <button class="pia" style="background:#f39c12;color:#fff;" title="Renomear" onclick="event.stopPropagation();_pastaSelIdx=${i};renomearSelecionado()">✏️</button>
          <button class="pia" style="background:#e74c3c;color:#fff;" title="Excluir" onclick="event.stopPropagation();_pastaSelIdx=${i};excluirSelecionado()">🗑️</button>
        </div>
        <span class="pasta-item-icon">${icon}</span>
        <div class="pasta-item-name">${item.name}</div>
        ${size ? `<div class="pasta-item-size">${size}</div>` : ''}
      </div>`;
    }).join('');
  } catch(e) {
    grid.innerHTML = `<div style="grid-column:1/-1;color:#e74c3c;padding:14px;">❌ Erro: ${e.message}</div>`;
  }
}

function _renderizarBreadcrumb() {
  const bc = document.getElementById('pasta-breadcrumb');
  let html = `<span class="bc-item" onclick="navPasta(0)">🏠 ${_pastaRaiz.split('_').slice(1).join(' ')}</span>`;
  _pastaCaminho.forEach((item, i) => {
    html += `<span class="bc-sep">›</span><span class="bc-item" onclick="navPasta(${i+1})">${item.nome}</span>`;
  });
  bc.innerHTML = html;
}

// ── NAVEGAÇÃO ────────────────────────────────────
function selecionarItem(i) {
  document.querySelectorAll('.pasta-item').forEach(el => el.classList.remove('selected'));
  const el = document.getElementById('pi-' + i);
  if (el) el.classList.add('selected');
  _pastaSelIdx = i;
  const item = _pastaItens[i];
  document.getElementById('pasta-sel-info').textContent = item ? (item.name + (item.metadata?.size ? ' · ' + _fmtTamanho(item.metadata.size) : '')) : '';
}

async function abrirItem(i) {
  const item = _pastaItens[i];
  if (!item) return;
  if (!item.id) {
    // É pasta
    const novoCaminho = _pastaAtual() + '/' + item.name;
    _pastaCaminho.push({ nome: item.name, path: novoCaminho });
    await _renderizarPasta();
  } else {
    // É arquivo — abre preview
    await previewArquivo(item);
  }
}

async function navPasta(nivel) {
  if (nivel === 0) { _pastaCaminho = []; }
  else { _pastaCaminho = _pastaCaminho.slice(0, nivel); }
  _pastaSelIdx = -1;
  await _renderizarPasta();
}

// ── NOVA SUBPASTA ────────────────────────────────
async function novaPastaPrompt() {
  const nome = prompt('Nome da nova subpasta:');
  if (!nome || !nome.trim()) return;
  const nomeOk = nome.trim().replace(/[/\\?%*:|"<>]/g,'_');
  const path = _pastaAtual() + '/' + nomeOk + '/.keep';
  const { error } = await window.supa.storage.from(PASTA_BUCKET).upload(path, new Blob([''],{type:'text/plain'}), {upsert:false});
  if (error && !error.message.includes('already')) { _pastaStatus('❌ Erro: ' + error.message, 'err'); return; }
  _pastaStatus('✅ Subpasta criada!', 'ok');
  await _renderizarPasta();
}

// ── UPLOAD DE ARQUIVOS (com criptografia AES-256-GCM) ───────────────────────────
async function uploadArquivos(files) {
  if (!files || files.length === 0) return;
  _pastaStatus('⏳ Enviando ' + files.length + ' arquivo(s)...', 'info');
  let ok = 0, err = 0;
  for (const file of files) {
    try {
      const encBlob = await _scaEncrypt(file);                // criptografa
      const path = _pastaAtual() + '/' + file.name + '.enc'; // salva com .enc
      const { error } = await window.supa.storage.from(PASTA_BUCKET).upload(path, encBlob, {upsert:true});
      if (error) err++; else ok++;
    } catch(e) { console.error('[SCA Crypto] Erro upload:', e); err++; }
  }
  _pastaStatus(`✅ ${ok} enviado(s) 🔒 (criptografado)${err ? ' · ❌ ' + err + ' erro(s)' : ''}`, err ? 'warn' : 'ok');
  document.getElementById('pasta-upload-input').value = '';
  await _renderizarPasta();
}

async function onDropArquivos(e) {
  e.preventDefault();
  document.getElementById('pasta-drop-zone').classList.remove('drag-over');
  const files = e.dataTransfer.files;
  if (files.length) await uploadArquivos(files);
}

// ── RENOMEAR ─────────────────────────────────────
async function renomearSelecionado() {
  if (_pastaSelIdx < 0) { _pastaStatus('Selecione um item primeiro.','warn'); return; }
  const item = _pastaItens[_pastaSelIdx];
  const novo = prompt('Novo nome:', item.name);
  if (!novo || novo.trim() === item.name) return;
  const novoOk = novo.trim().replace(/[/\\?%*:|"<>]/g,'_');
  const origem = _pastaAtual() + '/' + item.name;
  const destino= _pastaAtual() + '/' + novoOk;

  if (!item.id) {
    // pasta: cria .keep no novo nome, sem poder mover pasta no Supabase storage
    _pastaStatus('ℹ️ Para renomear pastas, crie uma nova e mova os arquivos manualmente.','warn'); return;
  }
  // arquivo
  const { error } = await window.supa.storage.from(PASTA_BUCKET).move(origem, destino);
  if (error) { _pastaStatus('❌ Erro: ' + error.message,'err'); return; }
  _pastaStatus('✅ Renomeado!','ok');
  await _renderizarPasta();
}

// ── EXCLUIR ──────────────────────────────────────
async function excluirSelecionado() {
  if (_pastaSelIdx < 0) { _pastaStatus('Selecione um item primeiro.','warn'); return; }
  const item = _pastaItens[_pastaSelIdx];
  if (!confirm(`Excluir "${item.name}"?${!item.id ? '\n\nATENÇÃO: todos os arquivos dentro serão excluídos!' : ''}`)) return;

  if (!item.id) {
    // Excluir pasta recursivamente
    await _excluirPastaRecursivo(_pastaAtual() + '/' + item.name);
  } else {
    const { error } = await window.supa.storage.from(PASTA_BUCKET).remove([_pastaAtual() + '/' + item.name]);
    if (error) { _pastaStatus('❌ Erro: ' + error.message,'err'); return; }
  }
  _pastaStatus('✅ Excluído!','ok');
  _pastaSelIdx = -1;
  await _renderizarPasta();
}

async function _excluirPastaRecursivo(caminho) {
  const { data } = await window.supa.storage.from(PASTA_BUCKET).list(caminho, {limit:200});
  if (!data) return;
  for (const item of data) {
    if (!item.id) await _excluirPastaRecursivo(caminho + '/' + item.name);
    else await window.supa.storage.from(PASTA_BUCKET).remove([caminho + '/' + item.name]);
  }
}

// ── PREVIEW (compatível com arquivos antigos e novos criptografados) ────────
async function previewArquivo(item) {
  const path = _pastaAtual() + '/' + item.name;
  const isEnc = item.name.endsWith('.enc'); // arquivo novo (criptografado)

  if (isEnc) _pastaStatus('🔓 Descriptografando...', 'info');

  try {
    // Baixa o arquivo do Supabase
    const { data: blob, error } = await window.supa.storage.from(PASTA_BUCKET).download(path);
    if (error || !blob) { _pastaStatus('❌ Não foi possível baixar o arquivo.','err'); return; }

    let url, nomeReal, mime;

    if (isEnc) {
      // Arquivo novo: descriptografa
      const decrypted = await _scaDecrypt(await blob.arrayBuffer());
      nomeReal = item.name.slice(0, -4); // remove .enc
      mime = _scaMime(nomeReal);
      url  = URL.createObjectURL(new Blob([decrypted], { type: mime }));
    } else {
      // Arquivo antigo: usa signed URL direto (sem descriptografar)
      const { data: urlData } = await window.supa.storage.from(PASTA_BUCKET).createSignedUrl(path, 3600);
      if (!urlData?.signedUrl) { _pastaStatus('❌ Não foi possível gerar link.','err'); return; }
      nomeReal = item.name;
      mime = _scaMime(nomeReal);
      url  = urlData.signedUrl;
    }

    const ext = (nomeReal.split('.').pop()||'').toLowerCase();
    const imgs = ['jpg','jpeg','png','gif','webp','bmp','svg'];
    const pdfs = ['pdf'];
    const vids = ['mp4','mov','avi','mkv','webm'];
    const auds = ['mp3','wav','ogg','aac'];

    // Botão de download real (arquivo descriptografado)
    function _btnDownload() {
      return `<div style="text-align:center;margin-top:12px;display:flex;gap:10px;justify-content:center;flex-wrap:wrap;">
        <a href="${url}" download="${nomeReal}" style="background:#2c5282;color:#fff;border-radius:7px;padding:7px 18px;text-decoration:none;font-size:.84rem;font-weight:700;">⬇️ Baixar</a>
        <button onclick="_scaPrint('${url}')" style="background:#1a5c38;color:#fff;border:none;border-radius:7px;padding:7px 18px;font-size:.84rem;font-weight:700;cursor:pointer;">🖨️ Imprimir</button>
      </div>`;
    }

    let content = '';
    if (imgs.includes(ext)) {
      content = `<img src="${url}" style="max-width:80vw;max-height:75vh;border-radius:8px;" />`;
    } else if (pdfs.includes(ext)) {
      content = `<iframe src="${url}" style="width:80vw;height:80vh;border:none;border-radius:8px;"></iframe>`;
    } else if (vids.includes(ext)) {
      content = `<video controls style="max-width:80vw;max-height:75vh;border-radius:8px;"><source src="${url}" type="${mime}"></video>`;
    } else if (auds.includes(ext)) {
      content = `<audio controls style="width:320px;"><source src="${url}" type="${mime}"></audio>`;
    } else {
      content = `<div style="padding:20px;text-align:center;">
        <div style="font-size:3rem;margin-bottom:12px;">${_iconeArquivo(nomeReal)}</div>
        <div style="font-weight:700;margin-bottom:14px;">${nomeReal}</div>
        <a href="${url}" download="${nomeReal}" style="background:#1a5c38;color:#fff;border-radius:8px;padding:10px 22px;text-decoration:none;font-weight:700;">⬇️ Baixar arquivo</a>
      </div>`;
    }

    document.getElementById('pasta-preview-content').innerHTML =
      `<div style="text-align:center;margin-bottom:10px;font-weight:700;color:#1a2a4a;">${nomeReal}</div>` +
      content + _btnDownload();
    document.getElementById('pasta-preview-modal').classList.add('open');
    _pastaStatus('', 'ok');
  } catch(e) {
    console.error('[SCA Crypto] Erro preview:', e);
    _pastaStatus('❌ Erro ao abrir arquivo: ' + e.message, 'err');
  }
}

// Impressão via iframe
function _scaPrint(url) {
  const iframe = document.createElement('iframe');
  iframe.style.display = 'none';
  iframe.src = url;
  document.body.appendChild(iframe);
  iframe.onload = () => { iframe.contentWindow.print(); };
}

function fecharPreview() {
  document.getElementById('pasta-preview-modal').classList.remove('open');
  document.getElementById('pasta-preview-content').innerHTML = '';
}

// ── DOWNLOAD ZIP ─────────────────────────────────
async function baixarPastaZip() {
  if (typeof JSZip === 'undefined') { _pastaStatus('❌ JSZip não carregado.','err'); return; }
  const btn = document.getElementById('btn-download-zip');
  if (btn) { btn.disabled = true; btn.innerHTML = '⏳ Gerando ZIP...'; }
  _pastaStatus('⏳ Preparando ZIP, aguarde...','info');

  try {
    const zip = new JSZip();
    await _zipRecursivo(zip, _pastaRaiz, '');
    const blob = await zip.generateAsync({ type:'blob', compression:'DEFLATE', compressionOptions:{level:6} });
    const c = window.clientes && window.clientes[window.clIdx];
    const nome = (c?.nome || 'cliente').replace(/\s+/g,'_');
    saveAs(blob, nome + '_pastas.zip');
    _pastaStatus('✅ ZIP baixado com sucesso!','ok');
  } catch(e) {
    _pastaStatus('❌ Erro ao gerar ZIP: ' + e.message,'err');
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = '⬇️ Baixar ZIP'; }
  }
}

async function _zipRecursivo(zip, caminho, zipPath) {
  const { data } = await window.supa.storage.from(PASTA_BUCKET).list(caminho, {limit:200});
  if (!data) return;
  for (const item of data) {
    if (item.name === '.keep' || item.name === '.info') continue;
    if (!item.id) {
      // é subpasta
      const nomePasta = item.name;
      const folder = zip.folder(zipPath ? zipPath + '/' + nomePasta : nomePasta);
      await _zipRecursivo(folder || zip, caminho + '/' + nomePasta, zipPath ? zipPath + '/' + nomePasta : nomePasta);
    } else {
      try {
        // Baixa arquivo — se for .enc descriptografa, senão usa direto
        const { data: blob } = await window.supa.storage.from(PASTA_BUCKET).download(caminho + '/' + item.name);
        if (blob) {
          let fileBlob = blob;
          let nomeNoZip = item.name;
          if (item.name.endsWith('.enc')) {
            // Arquivo novo: descriptografa e remove .enc
            const decrypted = await _scaDecrypt(await blob.arrayBuffer());
            nomeNoZip = item.name.slice(0, -4);
            fileBlob = new Blob([decrypted], { type: _scaMime(nomeNoZip) });
          }
          // Arquivo antigo: entra no ZIP como está, com nome original
          const zipFilePath = zipPath ? zipPath + '/' + nomeNoZip : nomeNoZip;
          (zip.file ? zip : zip).file(zipFilePath, fileBlob);
        }
      } catch(e) { console.warn('ZIP skip:', item.name, e); }
    }
  }
}

// Fechar modal ao clicar fora
document.getElementById('pasta-modal').addEventListener('click', function(e) {
  if (e.target === this) fecharPastaModal();
});
document.getElementById('pasta-preview-modal').addEventListener('click', function(e) {
  if (e.target === this) fecharPreview();
});

// ══════════════════════════════════════════════════
//  GERENCIADOR GLOBAL DE PASTAS
// ══════════════════════════════════════════════════
let _ggClientesExibidos = [];

function _ggStatus(msg, tipo) {
  const el = document.getElementById('gg-status');
  if (!el) return;
  const cores = { ok:'#d4edda|#155724', err:'#f8d7da|#721c24', info:'#d1ecf1|#0c5460', warn:'#fff3cd|#856404' };
  const [bg, fg] = (cores[tipo]||cores.info).split('|');
  el.style.background = bg; el.style.color = fg; el.style.border = `1px solid ${fg}44`;
  el.textContent = msg; el.style.display = '';
}

async function abrirGerenciadorGlobal() {
  if (!window.supa) { _ggStatus('❌ Supabase não conectado.', 'err'); return; }
  const grid = document.getElementById('gg-grid');
  if (!grid) return;
  grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:40px;color:#888;">⏳ Carregando pastas dos clientes...</div>';
  _ggStatus('⏳ Buscando pastas no Supabase...', 'info');

  try {
    // Lista todas as pastas raiz no bucket
    const { data, error } = await window.supa.storage.from(PASTA_BUCKET).list('', { limit: 500, sortBy: { column: 'name', order: 'asc' } });
    if (error) throw error;

    // Pega lista de clientes cadastrados para fazer o match
    const clientes = window.clientes || [];

    // Filtra apenas pastas (sem id = são diretórios)
    const pastas = (data || []).filter(i => !i.id && i.name && i.name !== '.keep' && i.name !== '.info');

    // Para cada pasta, tenta associar ao cliente cadastrado
    _ggClientesExibidos = pastas.map(pasta => {
      const partes = pasta.name.split('_');
      const cpfPasta = partes[0] || '';
      const clienteMatch = clientes.find(c => (c.cpf || '').replace(/\D/g,'') === cpfPasta);
      const nomeExibicao = clienteMatch
        ? clienteMatch.nome
        : partes.slice(1).join(' ').replace(/_/g,' ') || pasta.name;
      const cpfExibicao = clienteMatch
        ? (clienteMatch.cpf || cpfPasta)
        : cpfPasta.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
      const codigo = clienteMatch ? (clienteMatch.codigo || '') : '';
      return { pastaNome: pasta.name, nomeExibicao, cpfExibicao, codigo, clienteIdx: clienteMatch ? clientes.indexOf(clienteMatch) : -1 };
    });

    if (_ggClientesExibidos.length === 0) {
      grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:40px;color:#aaa;font-style:italic;">📭 Nenhuma pasta encontrada. Crie pastas pelo cadastro de clientes.</div>';
      _ggStatus('ℹ️ Nenhuma pasta encontrada no bucket.', 'info');
      return;
    }

    _ggRenderizar(_ggClientesExibidos);
    _ggStatus(`✅ ${_ggClientesExibidos.length} pasta(s) de cliente(s) encontrada(s).`, 'ok');
  } catch(e) {
    grid.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:40px;color:#e74c3c;">❌ Erro ao carregar pastas: ${e.message}</div>`;
    _ggStatus('❌ Erro ao carregar: ' + e.message, 'err');
  }
}

function _ggRenderizar(lista) {
  const grid = document.getElementById('gg-grid');
  if (!grid) return;
  if (lista.length === 0) {
    grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:40px;color:#aaa;font-style:italic;">🔍 Nenhum cliente encontrado com esse nome.</div>';
    return;
  }
  grid.innerHTML = lista.map((item, i) => `
    <div style="background:#fff;border:1.5px solid #d0dbc8;border-radius:12px;padding:14px 12px 12px;text-align:center;transition:border-color .15s,box-shadow .15s;position:relative;display:flex;flex-direction:column;gap:6px;"
      onmouseover="this.style.borderColor='#6c3483';this.style.boxShadow='0 4px 16px rgba(108,52,131,.18)'"
      onmouseout="this.style.borderColor='#d0dbc8';this.style.boxShadow=''">
      <div style="font-size:2.2rem;">📁</div>
      <div style="font-size:.76rem;font-weight:700;color:#1a2a4a;word-break:break-word;line-height:1.4;">${item.nomeExibicao}</div>
      ${item.cpfExibicao ? `<div style="font-size:.64rem;color:#888;font-family:monospace;">${item.cpfExibicao}</div>` : ''}
      ${item.codigo ? `<div><span style="background:#6c3483;color:#fff;border-radius:4px;padding:2px 8px;font-size:.62rem;font-weight:700;">Cód. ${item.codigo}</span></div>` : ''}
      <div style="display:flex;gap:5px;justify-content:center;margin-top:6px;flex-wrap:wrap;">
        <button onclick="ggAbrirPastaCliente('${item.pastaNome}','${item.nomeExibicao.replace(/'/g,"\\'")}',${item.clienteIdx})"
          style="background:#6c3483;color:#fff;border:none;border-radius:7px;padding:6px 10px;font-size:.72rem;font-weight:700;cursor:pointer;font-family:'Nunito',sans-serif;flex:1;min-width:60px;"
          title="Abrir pasta">📂 Abrir</button>
        <button onclick="ggRenomearPasta('${item.pastaNome}',${_ggClientesExibidos.indexOf(item)})"
          style="background:#e6a817;color:#000;border:none;border-radius:7px;padding:6px 10px;font-size:.72rem;font-weight:700;cursor:pointer;font-family:'Nunito',sans-serif;"
          title="Renomear pasta">✏️</button>
        <button onclick="ggDeletarPasta('${item.pastaNome}','${item.nomeExibicao.replace(/'/g,"\\'")}',${_ggClientesExibidos.indexOf(item)})"
          style="background:#e74c3c;color:#fff;border:none;border-radius:7px;padding:6px 10px;font-size:.72rem;font-weight:700;cursor:pointer;font-family:'Nunito',sans-serif;"
          title="Excluir pasta">🗑️</button>
      </div>
    </div>
  `).join('');
}

let _ggBuscaIdx = -1;

async function ggFiltrar(valor) {
  const drop = document.getElementById('gg-busca-results');
  if (!drop) return;

  if (!valor || valor.length < 1) {
    drop.innerHTML = '';
    drop.classList.remove('open');
    return;
  }

  // Se ainda não carregou as pastas, carrega primeiro
  if (_ggClientesExibidos.length === 0) {
    await abrirGerenciadorGlobal();
  }

  const q = valor.toLowerCase().trim();
  const matches = _ggClientesExibidos.filter(item =>
    item.nomeExibicao.toLowerCase().includes(q) ||
    item.cpfExibicao.replace(/\D/g,'').includes(q.replace(/\D/g,'')) ||
    (item.codigo && item.codigo.toString().includes(q))
  ).slice(0, 8);

  if (!matches.length) {
    drop.innerHTML = '<div style="padding:10px 14px;font-size:.82rem;color:#999;font-style:italic;">Nenhum cliente encontrado.</div>';
    drop.classList.add('open');
    return;
  }

  _ggBuscaIdx = -1;
  drop.innerHTML = matches.map(item => `
    <div class="busca-result-item" onmousedown="ggBuscaSelecionar('${item.pastaNome}','${item.nomeExibicao.replace(/'/g,"\\'")}',${item.clienteIdx})">
      <span class="busca-result-nome">${item.nomeExibicao}</span>
      <span class="busca-result-cpf">${item.cpfExibicao || ''}</span>
      ${item.codigo ? `<span class="busca-result-cod" style="font-size:.72rem;color:#6c3483;font-weight:700;">Cód. ${item.codigo}</span>` : ''}
    </div>`).join('');
  drop.classList.add('open');
}

window.ggBuscaNav = function(e) {
  const drop = document.getElementById('gg-busca-results');
  if (!drop || !drop.classList.contains('open')) return;
  const items = drop.querySelectorAll('.busca-result-item');
  if (!items.length) return;
  if (e.key === 'ArrowDown') { e.preventDefault(); _ggBuscaIdx = Math.min(_ggBuscaIdx+1, items.length-1); }
  else if (e.key === 'ArrowUp') { e.preventDefault(); _ggBuscaIdx = Math.max(_ggBuscaIdx-1, 0); }
  else if (e.key === 'Enter' && _ggBuscaIdx >= 0) { e.preventDefault(); items[_ggBuscaIdx].dispatchEvent(new Event('mousedown')); return; }
  else if (e.key === 'Escape') { ggBuscaLimpar(); return; }
  items.forEach((el, j) => el.classList.toggle('ac-selected', j === _ggBuscaIdx));
  if (_ggBuscaIdx >= 0) items[_ggBuscaIdx].scrollIntoView({ block: 'nearest' });
};

window.ggBuscaSelecionar = function(pastaNome, nomeCliente, clienteIdx) {
  ggBuscaLimpar();
  ggAbrirPastaCliente(pastaNome, nomeCliente, clienteIdx);
};

window.ggBuscaLimpar = function() {
  const inp = document.getElementById('gg-busca');
  const drop = document.getElementById('gg-busca-results');
  if (inp) inp.value = '';
  if (drop) { drop.innerHTML = ''; drop.classList.remove('open'); }
};

async function ggAbrirPastaCliente(pastaNome, nomeCliente, clienteIdx) {
  if (!window.supa) { alert('❌ Supabase não conectado.'); return; }
  if (clienteIdx >= 0) window.clIdx = clienteIdx;
  _pastaRaiz    = pastaNome;
  _pastaCaminho = [];
  _pastaSelIdx  = -1;
  document.getElementById('pasta-header-title').textContent = '📁 ' + nomeCliente;
  document.getElementById('pasta-modal').classList.add('open');
  await _renderizarPasta();
}

async function ggRenomearPasta(pastaNome, idx) {
  const item = _ggClientesExibidos[idx];
  if (!item) return;
  const novoNome = prompt('Novo nome para a pasta:', item.nomeExibicao);
  if (!novoNome || novoNome.trim() === '' || novoNome.trim() === item.nomeExibicao) return;

  // Reconstrói o nome da pasta: CPF_NOMENOVO
  const partes = pastaNome.split('_');
  const cpfParte = partes[0] || '';
  const nomeFormatado = novoNome.trim()
    .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .replace(/[^a-zA-Z0-9 ]/g,'').trim().replace(/\s+/g,'_');
  const novoNomePasta = cpfParte ? `${cpfParte}_${nomeFormatado}` : nomeFormatado;

  _ggStatus('⏳ Renomeando pasta...', 'info');
  try {
    // No Supabase Storage não existe "mover pasta" diretamente.
    // Estratégia: lista todos os arquivos da pasta antiga, copia para nova, deleta os antigos.
    await _ggMoverPasta(pastaNome, novoNomePasta);
    // Atualiza item local
    _ggClientesExibidos[idx].pastaNome    = novoNomePasta;
    _ggClientesExibidos[idx].nomeExibicao = novoNome.trim();
    _ggRenderizar(_ggClientesExibidos);
    _ggStatus(`✅ Pasta renomeada para "${novoNome.trim()}" com sucesso!`, 'ok');
  } catch(e) {
    _ggStatus('❌ Erro ao renomear: ' + (e.message || e), 'err');
  }
}

async function _ggMoverPasta(origemRaiz, destinoRaiz) {
  // Lista recursiva e recria no novo caminho
  async function moverRecursivo(origemPath, destinoPath) {
    const { data, error } = await window.supa.storage.from(PASTA_BUCKET).list(origemPath, { limit: 500 });
    if (error || !data) return;
    for (const item of data) {
      const srcPath  = `${origemPath}/${item.name}`;
      const dstPath  = `${destinoPath}/${item.name}`;
      if (!item.id) {
        // subpasta
        await moverRecursivo(srcPath, dstPath);
      } else {
        // arquivo: faz move
        const { error: mvErr } = await window.supa.storage.from(PASTA_BUCKET).move(srcPath, dstPath);
        if (mvErr) console.warn('Move erro:', srcPath, mvErr);
      }
    }
  }
  await moverRecursivo(origemRaiz, destinoRaiz);
}

async function ggDeletarPasta(pastaNome, nomeCliente, idx) {
  if (!confirm(`⚠️ Excluir a pasta de "${nomeCliente}" e TODO o seu conteúdo?\n\nEsta ação não pode ser desfeita!`)) return;
  _ggStatus('⏳ Excluindo pasta...', 'info');
  try {
    await _excluirPastaRecursivo(pastaNome);
    _ggClientesExibidos.splice(idx, 1);
    _ggRenderizar(_ggClientesExibidos);
    _ggStatus(`✅ Pasta de "${nomeCliente}" excluída com sucesso!`, 'ok');
  } catch(e) {
    _ggStatus('❌ Erro ao excluir: ' + (e.message || e), 'err');
  }
}
