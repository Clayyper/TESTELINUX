const loginSection=document.getElementById('loginSection');
const menuSection=document.getElementById('menuSection');
const loginForm=document.getElementById('loginForm');
const loginStatus=document.getElementById('loginStatus');
const portalUserName=document.getElementById('portalUserName');
const portalUserRole=document.getElementById('portalUserRole');
const systemCards=document.getElementById('systemCards');
const adminPanel=document.getElementById('adminPanel');
const usersTableBody=document.getElementById('usersTableBody');
const tempUserStatus=document.getElementById('tempUserStatus');
const gerarTempUserBtn=document.getElementById('gerarTempUserBtn');
const logoutBtn=document.getElementById('logoutBtn');
const portalSubtitle=document.getElementById('homeSubtitle');
function escapeHtml(v=''){return String(v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;')}
function fmtDate(v){if(!v)return 'Sem expiração';const d=new Date(v);return Number.isNaN(d.getTime())?v:d.toLocaleString('pt-BR')}
async function fetchJson(url,opt={}){const r=await fetch(url,opt);const d=await r.json().catch(()=>({}));if(!r.ok||d.ok===false)throw new Error(d.error||'Falha na operação.');return d}
function systemCard(t,d,h){return `<a class="portal-card" href="${h}"><h3>${escapeHtml(t)}</h3><p>${escapeHtml(d)}</p><span>Acessar →</span></a>`}
function renderUsers(users=[]){usersTableBody.innerHTML=users.map(u=>`<tr><td>${escapeHtml(u.username)}</td><td>${escapeHtml(u.role)}</td><td>${escapeHtml(u.createdBy||'—')}</td><td>${escapeHtml(fmtDate(u.expiresAt))}</td></tr>`).join('')||'<tr><td colspan="4" class="muted">Nenhum usuário disponível.</td></tr>'}
async function showPortal(user){loginSection.classList.add('hidden');menuSection.classList.remove('hidden');portalUserName.textContent=user.username;portalUserRole.textContent=user.role==='admin'?'Perfil administrador — acesso total.':'Perfil auditoria.';portalSubtitle.textContent='Escolha um sistema disponível no portal.';const cards=[];if(user.role==='admin'||(user.systems||[]).includes('rescisao'))cards.push(systemCard('Sistema de Rescisão','Cálculo rescisório com memória de cálculo e totais.','/rescisao'));if(user.role==='admin'||(user.systems||[]).includes('auditoria'))cards.push(systemCard('Auditoria TRCT','Importação de PDF/imagem, comparação e relatório.','/auditoria'));cards.push(systemCard('Sistema externo','Abrir sistema externo configurado no portal.','/go/sistema-externo'));systemCards.innerHTML=cards.join('');if(user.role==='admin'){adminPanel.classList.remove('hidden');const data=await fetchJson('/api/auth/users');renderUsers(data.users)}else adminPanel.classList.add('hidden')}
async function loadSession(){try{const s=await fetchJson('/api/auth/session');if(s.authenticated&&s.user)await showPortal(s.user)}catch(_){}}
loginForm?.addEventListener('submit',async e=>{e.preventDefault();loginStatus.textContent='Entrando...';const data=Object.fromEntries(new FormData(loginForm).entries());try{const r=await fetchJson('/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});loginStatus.textContent='';await showPortal(r.user)}catch(err){loginStatus.innerHTML=`<span class="status-warn">${escapeHtml(err.message||'Login inválido.')}</span>`}});
gerarTempUserBtn?.addEventListener('click',async()=>{try{tempUserStatus.textContent='Gerando usuário temporário...';const data=await fetchJson('/api/auth/temp-user',{method:'POST'});tempUserStatus.innerHTML=`<div class="alert success-alert"><strong>Usuário:</strong> ${escapeHtml(data.user.username)}<br><strong>Senha:</strong> ${escapeHtml(data.password)}<br><strong>Expira em:</strong> ${escapeHtml(fmtDate(data.user.expiresAt))}</div>`;const users=await fetchJson('/api/auth/users');renderUsers(users.users)}catch(err){tempUserStatus.innerHTML=`<div class="status-warn">${escapeHtml(err.message||'Falha ao gerar usuário.')}</div>`}});
logoutBtn?.addEventListener('click',async()=>{try{await fetchJson('/api/auth/logout',{method:'POST'})}catch(_){}window.location.href='/'});
loadSession();
