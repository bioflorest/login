// ============================================================
//  SCA – Módulo Links/Gov.br v1.0
//  Arquivo: sca_links.js
//  Carregue APÓS sca_supabase.js
//
//  O que faz:
//  Gerenciamento de links externos, portais gov e credenciais Gov.br.
//  Funções: lkTab(), lkCarregar(), lkSalvar(), lkDeletar(),
//  lkCarregarCreds(), lkSalvarCred().
// ============================================================

(function(){
'use strict';
var _lkC=[],_lkF=[],_lkSel=null,_lkEId=null,_lkUrl='';

window.lkTab=function(a){
  document.getElementById('lk-tab-portais').classList.toggle('active',a==='portais');
  document.getElementById('lk-tab-govbr').classList.toggle('active',a==='govbr');
  document.getElementById('lk-panel-portais').classList.toggle('visivel',a==='portais');
  document.getElementById('lk-panel-govbr').classList.toggle('visivel',a==='govbr');
  if(a==='govbr')lkCarregarCreds();
};

window.lkCarregar=function(el){
  document.querySelectorAll('.lk-site-btn').forEach(function(b){b.classList.remove('active');});
  el.classList.add('active');
  var url=el.dataset.url,titulo=el.dataset.titulo;
  _lkUrl=url;
  document.getElementById('lk-titulo').textContent=titulo;
  document.getElementById('lk-url').textContent=url.replace(/^https?:\/\//,'').split('?')[0];
  document.getElementById('lk-iframe-box').classList.add('visivel');

  // Abre o portal em nova aba (portais gov bloqueiam iframe via X-Frame-Options)
  window.open(url,'_blank');

  // Exibe mensagem amigável no painel interno
  document.getElementById('sca-iframe-links').removeAttribute('src');
  document.getElementById('sca-iframe-links').srcdoc=
    '<html><body style="margin:0;font-family:Nunito,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;background:#e8edda;">'
    +'<div style="text-align:center;padding:32px;max-width:340px;">'
    +'<div style="font-size:2.8rem;margin-bottom:14px;">🌐</div>'
    +'<div style="font-size:1rem;font-weight:700;color:#1a2a4a;margin-bottom:8px;">'+titulo+'</div>'
    +'<p style="font-size:.82rem;color:#555;line-height:1.6;margin-bottom:18px;">Portal aberto em nova aba.<br>Portais do governo bloqueiam exibição dentro de sistemas (X-Frame-Options).<br>Continue usando o SCA aqui enquanto acessa o portal ao lado.</p>'
    +'<button onclick="window.parent.lkExterno&&window.parent.lkExterno()" '
    +'style="background:#1a5c38;color:#fff;border:none;border-radius:8px;padding:9px 20px;font-size:.82rem;font-weight:700;cursor:pointer;">↗ Abrir novamente</button>'
    +'</div></body></html>';
  _lkBar(url);
};

window.lkExterno=function(){if(_lkUrl)window.open(_lkUrl,'_blank');};

function _lkBar(url){
  var gov=url&&url.includes('acesso.gov.br');
  var bar=document.getElementById('lk-autofill-bar');
  if(gov&&_lkSel){bar.classList.add('visivel');document.getElementById('lk-autofill-nome').textContent=_lkSel._nome;}
  else{bar.classList.remove('visivel');}
}

window.lkAutoFill=async function(){
  if(!_lkSel)return;
  /* Decifra senha antes de usar no autofill */
  var senDec=(typeof window.scaDecifrar==='function') ? await window.scaDecifrar(_lkSel.senha_govbr||'') : (_lkSel.senha_govbr||'');
  var f=document.getElementById('sca-iframe-links');
  try{
    var d=f.contentDocument||f.contentWindow.document;
    var cf=d.querySelector('input[name="username"],input[id*="cpf"],input[type="text"]');
    var sf=d.querySelector('input[name="password"],input[type="password"]');
    if(cf){cf.value=_lkSel.cpf_govbr;cf.dispatchEvent(new Event('input',{bubbles:true}));}
    if(sf){sf.value=senDec;sf.dispatchEvent(new Event('input',{bubbles:true}));}
    if(typeof toast==='function')toast('⚡ Preenchido!','ok');
  }catch(e){
    if(typeof toast==='function')toast('Site bloqueou — veja os dados abaixo','warn');
    _lkPopup(_lkSel);
  }
};

async function _lkPopup(c){
  var p=document.getElementById('_lk_pop');if(p)p.remove();
  /* Decifra senha antes de exibir no popup de autofill */
  var senDec=(typeof window.scaDecifrar==='function') ? await window.scaDecifrar(c.senha_govbr||'') : (c.senha_govbr||'');
  var el=document.createElement('div');el.id='_lk_pop';
  el.style.cssText='position:fixed;bottom:70px;right:16px;z-index:9999;background:#e8edda;border:1px solid #1a5c38;border-radius:10px;padding:14px 16px;font-family:Nunito,sans-serif;font-size:.82rem;color:#222;box-shadow:0 6px 20px rgba(0,0,0,.2);min-width:210px;max-width:90vw';
  el.innerHTML='<div style="font-weight:800;margin-bottom:8px;color:#1a5c38">🔑 Chave de Acesso</div>'
    +'<div style="margin-bottom:6px"><span style="color:#888;font-size:.68rem">CPF:</span><br><strong>'+c.cpf_govbr+'</strong>'
    +' <button onclick="navigator.clipboard.writeText(\''+c.cpf_govbr+'\');toast&&toast(\'Copiado!\',\'ok\')" style="margin-left:5px;font-size:.6rem;padding:1px 5px;border-radius:3px;border:1px solid #ccc;background:#fff;cursor:pointer">📋</button></div>'
    +'<div><span style="color:#888;font-size:.68rem">Senha:</span><br><strong>'+senDec+'</strong>'
    +' <button onclick="navigator.clipboard.writeText(\''+senDec+'\');toast&&toast(\'Copiado!\',\'ok\')" style="margin-left:5px;font-size:.6rem;padding:1px 5px;border-radius:3px;border:1px solid #ccc;background:#fff;cursor:pointer">📋</button></div>'
    +'<button onclick="this.parentNode.remove()" style="margin-top:9px;font-size:.65rem;padding:2px 9px;border-radius:4px;border:1px solid #ccc;background:transparent;color:#666;cursor:pointer">Fechar</button>';
  document.body.appendChild(el);
  setTimeout(function(){if(el.parentNode)el.remove();},15000);
}

window.lkCarregarCreds=async function(){
  if(!window.supa)return;
  try{
    var r=await window.supa.from('credenciais_govbr').select('*,clientes(id,nome,cpf)').order('created_at',{ascending:false});
    if(r.error)throw r.error;
    _lkC=(r.data||[]).map(function(c){return Object.assign({},c,{_nome:c.clientes&&c.clientes.nome||'—',_cpfcl:c.clientes&&c.clientes.cpf||''});});
    _lkF=_lkC.slice();_lkRender();
  }catch(e){console.warn('[LK]',e);}
};

function _lkRender(){
  var l=document.getElementById('lk-cred-lista');if(!l)return;
  if(!_lkF.length){l.innerHTML='<div style="text-align:center;padding:20px 0;color:#aaa;font-size:.78rem">Nenhuma credencial cadastrada</div>';return;}
  l.innerHTML=_lkF.map(function(c){
    return '<div class="lk-cred-item'+(_lkSel&&_lkSel.id===c.id?' selecionado':'')+'" onclick="lkVerCred(\''+c.id+'\')" style="cursor:pointer;" title="Clique para visualizar">'
      +'<div class="lk-avatar">'+(c._nome[0]||'?').toUpperCase()+'</div>'
      +'<div class="lk-cred-info"><strong>'+c._nome+'</strong><span>CPF Acesso: '+(c.cpf_govbr||'—')+'</span></div>'
      +(c.cpf_govbr?'<span class="lk-tag-ok">✓ Cadastrado</span>':'')
      +'<button onclick="event.stopPropagation();lkVerCred(\''+c.id+'\')" title="Visualizar credencial" style="margin-left:6px;font-size:.65rem;padding:2px 7px;border-radius:4px;border:1px solid #1a5c38;background:#e8f5e9;cursor:pointer;color:#1a5c38">👁️ Ver</button>'
      +'<button onclick="event.stopPropagation();lkAbrirModal(\''+c.id+'\')" title="Editar credencial" style="margin-left:4px;font-size:.65rem;padding:2px 7px;border-radius:4px;border:1px solid #ccc;background:#fff;cursor:pointer;color:#555">✏️</button>'
      +'</div>';
  }).join('');
}

window.lkFiltrarCreds=function(valor){
  var drop=document.getElementById('lk-busca-results');
  if(!drop)return;

  if(!valor||valor.length<1){
    drop.innerHTML='';drop.classList.remove('open');
    _lkF=_lkC.slice();_lkRender();
    return;
  }

  var q=valor.toLowerCase().trim();
  var matches=_lkC.filter(function(c){
    return c._nome.toLowerCase().includes(q)||
      (c.cpf_govbr||'').replace(/\D/g,'').includes(q.replace(/\D/g,''))||
      (c._cpfcl||'').replace(/\D/g,'').includes(q.replace(/\D/g,''));
  }).slice(0,8);

  _lkBuscaIdx=-1;
  if(!matches.length){
    drop.innerHTML='<div style="padding:10px 14px;font-size:.82rem;color:#999;font-style:italic;">Nenhum cliente encontrado.</div>';
    drop.classList.add('open');
    return;
  }

  drop.innerHTML=matches.map(function(c){
    return '<div class="busca-result-item" onmousedown="lkBuscaSelecionar(\''+c.id+'\')">'
      +'<span class="busca-result-nome">'+c._nome+'</span>'
      +'<span class="busca-result-cpf">'+(c.cpf_govbr?'CPF Acesso: '+c.cpf_govbr:'')+'</span>'
      +(c.cpf_govbr?'<span class="busca-result-cod" style="font-size:.72rem;color:#1a5c38;font-weight:700;">✓ Cadastrado</span>':'')
      +'</div>';
  }).join('');
  drop.classList.add('open');
};

var _lkBuscaIdx=-1;

window.lkBuscaNav=function(e){
  var drop=document.getElementById('lk-busca-results');
  if(!drop||!drop.classList.contains('open'))return;
  var items=drop.querySelectorAll('.busca-result-item');
  if(!items.length)return;
  if(e.key==='ArrowDown'){e.preventDefault();_lkBuscaIdx=Math.min(_lkBuscaIdx+1,items.length-1);}
  else if(e.key==='ArrowUp'){e.preventDefault();_lkBuscaIdx=Math.max(_lkBuscaIdx-1,0);}
  else if(e.key==='Enter'&&_lkBuscaIdx>=0){e.preventDefault();items[_lkBuscaIdx].dispatchEvent(new Event('mousedown'));return;}
  else if(e.key==='Escape'){lkBuscaLimpar();return;}
  items.forEach(function(el,j){el.classList.toggle('ac-selected',j===_lkBuscaIdx);});
  if(_lkBuscaIdx>=0)items[_lkBuscaIdx].scrollIntoView({block:'nearest'});
};

window.lkBuscaSelecionar=function(id){
  lkBuscaLimpar();
  lkSelCred(id);
};

window.lkBuscaLimpar=function(){
  var inp=document.getElementById('lk-busca-input');
  var drop=document.getElementById('lk-busca-results');
  if(inp)inp.value='';
  if(drop){drop.innerHTML='';drop.classList.remove('open');}
  _lkF=_lkC.slice();_lkRender();
};

window.lkSelCred=function(id){
  _lkSel=_lkC.find(function(c){return c.id===id;})||null;
  _lkRender();_lkBar(_lkUrl);
  if(_lkSel&&typeof toast==='function')toast('👤 '+_lkSel._nome+' selecionado — vá para Portais para usar','ok');
};

window.lkAbrirModal=async function(id){
  _lkEId=id||null;
  document.getElementById('modal-lkcred-titulo').textContent=id?'Editar Credencial':'Nova Chave de Acesso';
  document.getElementById('btn-del-lkcred').style.display=id?'':'none';
  var sel=document.getElementById('lk-cred-cliente');
  sel.innerHTML='<option value="">— Selecione —</option>';
  if(window.supa){var r=await window.supa.from('clientes').select('id,nome,cpf').order('nome');(r.data||[]).forEach(function(cl){var o=document.createElement('option');o.value=cl.id;o.dataset.cpf=cl.cpf||'';o.textContent=(cl.nome||'—')+(cl.cpf?' · '+cl.cpf:'');sel.appendChild(o);});}
  if(id){
    var c=_lkC.find(function(x){return x.id===id;});
    if(c){
      sel.value=c.cliente_id||'';
      document.getElementById('lk-cred-cpf').value=c.cpf_govbr||'';
      /* ── Decifra senha antes de exibir no campo de edição ── */
      var senDec=(typeof window.scaDecifrar==='function') ? await window.scaDecifrar(c.senha_govbr||'') : (c.senha_govbr||'');
      document.getElementById('lk-cred-senha').value=senDec;
      document.getElementById('lk-cred-obs').value=c.observacao||'';
    }
  }
  else{sel.value='';['lk-cred-cpf','lk-cred-senha','lk-cred-obs'].forEach(function(i){document.getElementById(i).value='';});}
  document.getElementById('modal-lkcred').classList.add('aberto');
};

window.lkFecharModal=function(){document.getElementById('modal-lkcred').classList.remove('aberto');_lkEId=null;};

window.lkSalvarCred=async function(){
  if(!window.supa){if(typeof toast==='function')toast('Sem conexão com banco','err');return;}
  var cid=document.getElementById('lk-cred-cliente').value;
  var cpf=document.getElementById('lk-cred-cpf').value.replace(/\D/g,'');
  var sen=document.getElementById('lk-cred-senha').value;
  var obs=document.getElementById('lk-cred-obs').value||null;
  if(!cid){if(typeof toast==='function')toast('Selecione um cliente','warn');return;}
  if(!cpf){if(typeof toast==='function')toast('Informe o CPF','warn');return;}
  if(!sen){if(typeof toast==='function')toast('Informe a senha','warn');return;}
  /* ── Cifra a senha com AES-256-GCM antes de enviar ao Supabase ── */
  var senCifrada = (typeof window.scaCifrar==='function') ? await window.scaCifrar(sen) : sen;
  var pay={cliente_id:cid,cpf_govbr:cpf,senha_govbr:senCifrada,observacao:obs};
  try{
    if(_lkEId){
      var{error}=await window.supa.from('credenciais_govbr').update(pay).eq('id',_lkEId).select();
      if(error)throw error;
    }else{
      var{error}=await window.supa.from('credenciais_govbr').insert(pay).select();
      if(error)throw error;
    }
    if(typeof toast==='function')toast(_lkEId?'✅ Atualizado!':'✅ Salvo!','ok');
    lkFecharModal();lkCarregarCreds();
  }catch(e){
    if(typeof toast==='function')toast('Erro: '+(e.message||JSON.stringify(e)),'err');
    console.error('[Gov.br] Erro ao salvar:',e);
  }
};

window.lkDeletarCred=async function(){
  if(!_lkEId||!window.supa)return;
  if(!confirm('Deletar esta credencial?'))return;
  var r=await window.supa.from('credenciais_govbr').delete().eq('id',_lkEId);
  if(r.error){if(typeof toast==='function')toast('Erro ao deletar','err');return;}
  if(typeof toast==='function')toast('🗑️ Removida','warn');
  if(_lkSel&&_lkSel.id===_lkEId){_lkSel=null;document.getElementById('lk-autofill-bar').classList.remove('visivel');}
  lkFecharModal();lkCarregarCreds();
};

window.lkEditarSel=function(){if(_lkSel)lkAbrirModal(_lkSel.id);};

window.lkAutoPreencherCPF=function(sel){
  var opt=sel.options[sel.selectedIndex];
  var cpf=opt&&opt.dataset.cpf||'';
  var cpfInput=document.getElementById('lk-cred-cpf');
  if(cpfInput&&cpf&&!_lkEId){
    var v=cpf.replace(/\D/g,'').slice(0,11);
    if(v.length>9)v=v.replace(/^(\d{3})(\d{3})(\d{3})(\d{0,2})$/,'$1.$2.$3-$4');
    else if(v.length>6)v=v.replace(/^(\d{3})(\d{3})(\d{0,3})$/,'$1.$2.$3');
    else if(v.length>3)v=v.replace(/^(\d{3})(\d{0,3})$/,'$1.$2');
    cpfInput.value=v;
  }else if(cpfInput&&!cpf&&!_lkEId){cpfInput.value='';}
};
window.lkMascaraCPF=function(el){
  var v=el.value.replace(/\D/g,'').slice(0,11);
  if(v.length>9)v=v.replace(/^(\d{3})(\d{3})(\d{3})(\d{0,2})$/,'$1.$2.$3-$4');
  else if(v.length>6)v=v.replace(/^(\d{3})(\d{3})(\d{0,3})$/,'$1.$2.$3');
  else if(v.length>3)v=v.replace(/^(\d{3})(\d{0,3})$/,'$1.$2');
  el.value=v;
};

window.lkCopiarCPF=function(){
  var v=document.getElementById('lk-cred-cpf').value;
  if(!v){if(typeof toast==='function')toast('CPF vazio','warn');return;}
  navigator.clipboard.writeText(v).then(function(){if(typeof toast==='function')toast('📋 CPF copiado!','ok');}).catch(function(){if(typeof toast==='function')toast('Erro ao copiar','err');});
};
window.lkCopiarSenha=function(){
  var v=document.getElementById('lk-cred-senha').value;
  if(!v){if(typeof toast==='function')toast('Senha vazia','warn');return;}
  navigator.clipboard.writeText(v).then(function(){if(typeof toast==='function')toast('📋 Senha copiada!','ok');}).catch(function(){if(typeof toast==='function')toast('Erro ao copiar','err');});
};
window.lkToggleSenha=function(){
  var inp=document.getElementById('lk-cred-senha');
  var btn=document.getElementById('btn-lk-ver-senha');
  if(inp.type==='password'){inp.type='text';btn.innerHTML='🙈 Ocultar';}
  else{inp.type='password';btn.innerHTML='👁️ Ver';}
};
var _mlkcred=document.getElementById('modal-lkcred');if(_mlkcred)_mlkcred.addEventListener('click',function(e){if(e.target===this)lkFecharModal();});

var _lkVerId=null;
var _lkVerSenhaVisivel=false;

window.lkVerCred=async function(id){
  var c=_lkC.find(function(x){return x.id===id;});
  if(!c)return;
  _lkVerId=id;
  _lkVerSenhaVisivel=false;
  document.getElementById('lkver-cliente').textContent=(c._nome||'—')+(c.cpf_govbr?' · '+c.cpf_govbr:'');
  document.getElementById('lkver-cpf').textContent=c.cpf_govbr||'—';
  var sd=document.getElementById('lkver-senha');
  /* ── Decifra a senha do banco antes de guardar no dataset ── */
  var senDec=(typeof window.scaDecifrar==='function') ? await window.scaDecifrar(c.senha_govbr||'') : (c.senha_govbr||'');
  sd.dataset.senha=senDec;
  sd.textContent='••••••••';
  sd.style.letterSpacing='2px';
  document.getElementById('btn-lkver-olho').innerHTML='👁️ Ver';
  var obsW=document.getElementById('lkver-obs-wrap');
  var obsD=document.getElementById('lkver-obs');
  if(c.observacao){obsW.style.display='';obsD.textContent=c.observacao;}else{obsW.style.display='none';}
  var m=document.getElementById('modal-lkver');
  m.style.display='flex';
};

window.lkFecharVer=function(){
  document.getElementById('modal-lkver').style.display='none';
  _lkVerId=null;_lkVerSenhaVisivel=false;
};

window.lkVerToggleSenha=function(){
  var sd=document.getElementById('lkver-senha');
  var btn=document.getElementById('btn-lkver-olho');
  _lkVerSenhaVisivel=!_lkVerSenhaVisivel;
  if(_lkVerSenhaVisivel){sd.textContent=sd.dataset.senha||'—';sd.style.letterSpacing='normal';btn.innerHTML='🙈 Ocultar';}
  else{sd.textContent='••••••••';sd.style.letterSpacing='2px';btn.innerHTML='👁️ Ver';}
};

window.lkVerCopiarCPF=function(){
  var v=document.getElementById('lkver-cpf').textContent;
  if(!v||v==='—')return;
  navigator.clipboard.writeText(v).then(function(){if(typeof toast==='function')toast('📋 CPF copiado!','ok');});
};

window.lkVerCopiarSenha=function(){
  var v=document.getElementById('lkver-senha').dataset.senha;
  if(!v)return;
  navigator.clipboard.writeText(v).then(function(){if(typeof toast==='function')toast('📋 Senha copiada!','ok');});
};

window.lkVerEditar=function(){
  var id=_lkVerId;
  lkFecharVer();
  if(id)setTimeout(function(){lkAbrirModal(id);},80);
};

var _mlkver=document.getElementById('modal-lkver');if(_mlkver)_mlkver.addEventListener('click',function(e){if(e.target===this)lkFecharVer();});
})();
