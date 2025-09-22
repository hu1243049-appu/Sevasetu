/* Paste this into app.js (type=module)
   Edit API_BASE to point to your backend (e.g., 'http://localhost:5000/api')
*/

const API_BASE = window.__API__ || 'http://localhost:5000/api';

// --- Utilities ---
const qs = s => document.querySelector(s);
const qsa = s => Array.from(document.querySelectorAll(s));
function toast(msg, ms = 3500){
  const t = document.createElement('div'); t.className = 'toast'; t.textContent = msg;
  const wrap = qs('#toast'); wrap.appendChild(t); wrap.classList.remove('hide');
  setTimeout(()=>{ t.remove(); if(!wrap.children.length) wrap.classList.add('hide'); }, ms);
}

// Auth helpers
function saveSession(token, profile){ localStorage.setItem('ss_token', token); localStorage.setItem('ss_profile', JSON.stringify(profile)); }
function clearSession(){ localStorage.removeItem('ss_token'); localStorage.removeItem('ss_profile'); }
function getToken(){ return localStorage.getItem('ss_token'); }
function getProfile(){ return JSON.parse(localStorage.getItem('ss_profile')||'null'); }
function authHeaders(){ const t = getToken(); return t ? {'Authorization': 'Bearer '+t} : {}; }

// SPA routing
const routes = ['#/', '#/about', '#/awareness', '#/leaderboard', '#/contact', '#/dashboard', '#/admin'];
function setActiveRoute(hash){ qsa('.nav-link').forEach(a=> a.classList.toggle('active', a.dataset.route === hash));
  qsa('main section').forEach(s=> s.classList.remove('active'));
  const target = hash.replace('#','') || '/';
  const id = target === '/' ? 'home' : target.replace('/','');
  const el = qs(`#${id}`);
  if(el) el.classList.add('active');
}
window.addEventListener('hashchange', ()=> setActiveRoute(location.hash || '#/'));

qsa('.nav-link').forEach(a=> a.addEventListener('click', ()=>{ location.hash = a.dataset.route; }));
qs('#btn-login').addEventListener('click', ()=> openAuth('login'));
qs('#btn-register').addEventListener('click', ()=> openAuth('register'));
qs('#cta-vol').addEventListener('click', ()=> openAuth('register','volunteer'));
qs('#cta-ngo').addEventListener('click', ()=> openAuth('register','ngo'));
qs('#close-auth').addEventListener('click', ()=> toggleAuthModal(false));
qs('#logout').addEventListener('click', ()=>{ clearSession(); toast('Logged out'); location.hash='#/'; updateUI(); });

// Initial route
setActiveRoute(location.hash || '#/');

// Load some data for home
async function loadHome(){
  try{
    const res = await fetch(API_BASE + '/tasks');
    if(res.ok){ const j = await res.json(); renderHomeTasks(j.tasks || []); qs('#stat-tasks').textContent = j.tasks?.length || 0; }
  }catch(e){ console.warn(e); }
}
function renderHomeTasks(tasks){ const wrap = qs('#home-tasks'); wrap.innerHTML = tasks.slice(0,4).map(t=> `<div class="row card" style="padding:12px"><div><strong>${escapeHtml(t.title)}</strong><div class='muted small'>${escapeHtml(t.location||'Remote')}</div></div><div class='right'><button class='btn ghost' data-id='${t.id}' onclick='openSubmissionModal("${t.id}")'>Submit</button></div></div>`).join(''); }

// Simple escape
function escapeHtml(s=''){ return String(s).replace(/[&<>"']/g, c=> ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":"&#39;"})[c]); }

// AUTH MODAL
function toggleAuthModal(show=true){ const m = qs('#auth-modal'); m.classList.toggle('hide', !show); }
function openAuth(mode='register', rolePref=null){
  const title = mode === 'login' ? 'Login' : 'Register'; qs('#auth-title').textContent = title;
  const forms = qs('#auth-forms'); forms.innerHTML = '';
  if(mode === 'login'){
    forms.innerHTML = `
      <form id='form-login' class='top-gap'>
        <div class='field'><label>Email</label><input name='email' required/></div>
        <div class='field'><label>Password</label><input type='password' name='password' required/></div>
        <div class='top-gap'><button class='btn'>Login</button></div>
      </form>`;
    qs('#form-login').addEventListener('submit', async e=>{ e.preventDefault(); const fd = Object.fromEntries(new FormData(e.target).entries()); const res = await fetch(API_BASE + '/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(fd)}); const j = await res.json(); if(res.ok){ saveSession(j.token, j.profile); toggleAuthModal(false); updateUI(); toast('Welcome back'); } else toast(j.error || 'Login failed'); });
  } else {
    // Register shows volunteer and NGO forms tabs
    forms.innerHTML = `
      <div class='row-wrap top-gap'>
        <button id='tab-vol' class='btn'>Volunteer</button>
        <button id='tab-ngo' class='btn ghost'>NGO</button>
      </div>
      <div id='reg-forms' class='top-gap'></div>
    `;
    qs('#tab-vol').addEventListener('click', ()=> renderRegForm('volunteer'));
    qs('#tab-ngo').addEventListener('click', ()=> renderRegForm('ngo'));
    // default
    renderRegForm(rolePref || 'volunteer');
  }
  toggleAuthModal(true);
}
function renderRegForm(role){ const root = qs('#reg-forms'); root.innerHTML = '';
  if(role === 'volunteer'){
    root.innerHTML = `
      <form id='form-reg-vol'>
        <div class='field'><label>Full name</label><input name='name' required/></div>
        <div class='field'><label>City</label><input name='city' required/></div>
        <div class='field'><label>Contact</label><input name='contact' required/></div>
        <div class='field'><label>Email</label><input type='email' name='email' required/></div>
        <div class='field'><label>Password</label><input type='password' name='password' required/></div>
        <div class='top-gap'><button class='btn'>Register</button></div>
      </form>`;
    qs('#form-reg-vol').addEventListener('submit', async e=>{ e.preventDefault(); const fd = Object.fromEntries(new FormData(e.target).entries()); fd.role = 'volunteer'; const res = await fetch(API_BASE + '/auth/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(fd)}); const j = await res.json(); if(res.ok){ toast('Registered — please login'); toggleAuthModal(false);} else toast(j.error||'Error'); });
  } else {
    root.innerHTML = `
      <form id='form-reg-ngo'>
        <div class='field'><label>Organization Name</label><input name='name' required/></div>
        <div class='field'><label>Contact Person</label><input name='contact_person' required/></div>
        <div class='field'><label>City</label><input name='city' required/></div>
        <div class='field'><label>Type of work</label><select name='type_of_work'><option>Education</option><option>Health</option><option>Environment</option></select></div>
        <div class='field'><label>Email</label><input type='email' name='email' required/></div>
        <div class='field'><label>Phone</label><input name='phone' required/></div>
        <div class='field'><label>Password</label><input type='password' name='password' required/></div>
        <div class='top-gap'><button class='btn'>Register NGO</button></div>
      </form>`;
    qs('#form-reg-ngo').addEventListener('submit', async e=>{ e.preventDefault(); const fd = Object.fromEntries(new FormData(e.target).entries()); fd.role='ngo'; const res = await fetch(API_BASE + '/auth/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(fd)}); const j = await res.json(); if(res.ok){ toast('NGO registered — awaiting verification'); toggleAuthModal(false);} else toast(j.error||'Error'); });
  }
}

// Submission Modal (file upload)
window.openSubmissionModal = function(taskId){
  const modal = document.createElement('div'); modal.className='modal';
  modal.innerHTML = `<div class='modal-card card'>
    <div class='row-wrap'><h3>Submit Proof</h3><div class='right'><button class='btn ghost' id='close-sub'>Close</button></div></div>
    <form id='submit-proof' class='top-gap' enctype='multipart/form-data'>
      <div class='field'><label>Photo (optional)</label><input type='file' name='proof_file' accept='image/*' /></div>
      <div class='field'><label>External Link (optional)</label><input name='external_link' /></div>
      <div class='top-gap'><button class='btn'>Submit</button></div>
    </form>
  </div>`;
  document.body.appendChild(modal);
  modal.querySelector('#close-sub').addEventListener('click', ()=> modal.remove());
  modal.querySelector('#submit-proof').addEventListener('submit', async e=>{
    e.preventDefault(); const form = e.target; const fd = new FormData(form); fd.append('task_id', taskId);
    const res = await fetch(API_BASE + '/submissions', { method:'POST', headers: authHeaders(), body: fd });
    const j = await res.json(); if(res.ok){ toast('Submission created'); modal.remove(); } else toast(j.error||'Error');
  });
}

// DASHBOARD
async function renderDashboard(){
  const profile = getProfile();
  if(!profile){ location.hash='#/'; toast('Please login'); return; }
  // show dashboard section
  location.hash='#/dashboard'; setActiveRoute('#/dashboard'); qs('#dash-title').textContent = `${profile.role.charAt(0).toUpperCase()+profile.role.slice(1)} Dashboard`;
  const container = qs('#dash-content'); container.innerHTML = '';

  if(profile.role === 'volunteer'){
    // Volunteer view: tasks, join NGO, submissions, points
    container.innerHTML = `
      <div class='row-wrap'>
        <div class='card' style='flex:1'>
          <h3>Your Points</h3>
          <div class='top-gap'><h2 id='vol-points'>${profile.points||0}</h2></div>
          <div class='top-gap badge-grid'>
            <div class='badge'><div class='medal bronze'></div><div class='muted small'>Bronze - 50</div></div>
            <div class='badge'><div class='medal silver'></div><div class='muted small'>Silver - 75</div></div>
            <div class='badge'><div class='medal gold'></div><div class='muted small'>Gold - 100</div></div>
          </div>
        </div>
        <div class='card' style='flex:2'>
          <h3>Available Tasks</h3>
          <div id='vol-tasks' class='grid top-gap'></div>
        </div>
      </div>
    `;
    // load tasks
    const res = await fetch(API_BASE + '/tasks', { headers: authHeaders() }); if(res.ok){ const j = await res.json(); qs('#vol-tasks').innerHTML = j.tasks.map(t=> `<div class='row card' style='padding:10px'><div><strong>${escapeHtml(t.title)}</strong><div class='muted small'>${escapeHtml(t.location||'Remote')}</div></div><div class='right'><button class='btn ghost' onclick='openSubmissionModal("${t.id}")'>Submit</button></div></div>`).join(''); }
  }

  else if(profile.role === 'ngo'){
    // NGO view: post task, view submissions
    container.innerHTML = `
      <div class='row-wrap'>
        <div class='card' style='flex:1'>
          <h3>Quick Actions</h3>
          <div class='top-gap'><button id='btn-post-task' class='btn'>Post New Task</button></div>
        </div>
        <div class='card' style='flex:2'>
          <h3>Your Tasks</h3>
          <div id='ngo-tasks' class='grid top-gap'></div>
        </div>
      </div>
    `;
    qs('#btn-post-task').addEventListener('click', ()=> openPostTaskModal());
    const res = await fetch(API_BASE + '/ngo/tasks', { headers: authHeaders() }); if(res.ok){ const j = await res.json(); qs('#ngo-tasks').innerHTML = j.tasks.map(t=> `<div class='card row-wrap' style='padding:10px'><div style='flex:1'><strong>${escapeHtml(t.title)}</strong><div class='muted small'>${escapeHtml(t.location)}</div></div><div><button class='btn ghost' onclick='openSubmissionsModal("${t.id}")'>View Submissions</button></div></div>`).join(''); }
  }

  else if(profile.role === 'admin'){
    // Admin: metrics
    const res = await fetch(API_BASE + '/admin/metrics', { headers: authHeaders() }); if(res.ok){ const j = await res.json(); qs('#dash-content').innerHTML = `<div class='row-wrap'>${Object.keys(j).map(k=>`<div class='card' style='flex:1'><div class='muted small'>${k.replace(/_/g,' ')}</div><h3>${j[k]}</h3></div>`).join('')}</div>`; }
  }
}

// NGO: Post task modal
function openPostTaskModal(){
  const modal = document.createElement('div'); modal.className='modal'; modal.innerHTML = `<div class='modal-card card'><h3>Post Task</h3><form id='post-task' class='top-gap'><div class='field'><label>Title</label><input name='title' required /></div><div class='field'><label>Description</label><textarea name='description'></textarea></div><div class='field'><label>Location</label><input name='location' /></div><div class='top-gap'><button class='btn'>Post</button><button type='button' id='close-this' class='btn ghost' style='margin-left:8px'>Close</button></div></form></div>`;
  document.body.appendChild(modal); modal.querySelector('#close-this').addEventListener('click', ()=> modal.remove());
  modal.querySelector('#post-task').addEventListener('submit', async e=>{ e.preventDefault(); const fd = Object.fromEntries(new FormData(e.target).entries()); const res = await fetch(API_BASE + '/tasks', { method:'POST', headers:{...authHeaders(),'Content-Type':'application/json'}, body:JSON.stringify(fd) }); const j = await res.json(); if(res.ok){ toast('Task posted'); modal.remove(); renderDashboard(); } else toast(j.error||'Error'); });
}

// View submissions for a task (NGO)
window.openSubmissionsModal = async function(taskId){
  const res = await fetch(API_BASE + `/tasks/${taskId}/submissions`, { headers: authHeaders() }); if(!res.ok){ toast('Error loading submissions'); return; }
  const j = await res.json(); const modal = document.createElement('div'); modal.className='modal'; modal.innerHTML = `<div class='modal-card card'><h3>Submissions</h3><div class='top-gap'>${(j.submissions||[]).map(s=>`<div class='card top-gap' style='padding:10px'><div class='row-wrap'><div style='flex:1'><strong>${escapeHtml(s.volunteer_name||'Volunteer')}</strong><div class='muted small'>${new Date(s.created_at).toLocaleString()}</div></div><div>${s.status}</div></div><div class='top-gap'><img src='${s.proof_url || ''}' style='max-width:160px;border-radius:8px'/></div><div class='top-gap'><button class='btn' data-id='${s.id}' data-action='approve'>Approve</button><button class='btn ghost' data-id='${s.id}' data-action='reject' style='margin-left:8px'>Reject</button></div></div>`).join('')}</div><div class='top-gap'><button id='close-s' class='btn ghost'>Close</button></div></div>`;
  document.body.appendChild(modal); modal.querySelector('#close-s').addEventListener('click', ()=> modal.remove());
  modal.querySelectorAll('button[data-action]').forEach(b=> b.addEventListener('click', async ()=>{
    const id = b.dataset.id; const action = b.dataset.action; const res2 = await fetch(API_BASE + `/submissions/${id}/${action==='approve'?'approve':'reject'}`, { method:'POST', headers: authHeaders() }); const jr = await res2.json(); if(res2.ok){ toast('Done'); modal.remove(); renderDashboard(); } else toast(jr.error||'Error'); }));
}

// Leaderboard & Awareness simple loaders
async function loadLeaderboard(){ const res = await fetch(API_BASE + '/leaderboard').catch(()=>null); if(res && res.ok){ const j = await res.json(); qs('#leaderboard-list').innerHTML = (j.top||[]).map(u=>`<div class='card'><strong>${escapeHtml(u.name)}</strong><div class='muted small'>${escapeHtml(u.city)} — ${u.points} pts</div></div>`).join(''); } }
async function loadAwareness(){ const vids = ['dQw4w9WgXcQ','3GwjfUFyY6M']; qs('#awareness-list').innerHTML = vids.map(id=>`<div class='card video'><iframe src='https://www.youtube.com/embed/${id}' allowfullscreen></iframe></div>`).join(''); }

// Contact form
qs('#contact-form').addEventListener('submit', async e=>{ e.preventDefault(); const fd = Object.fromEntries(new FormData(e.target).entries()); const res = await fetch(API_BASE + '/contact',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(fd)}); if(res.ok){ toast('Message sent'); e.target.reset(); } else toast('Error'); });

// Update UI after login/logout
function updateUI(){ const prof = getProfile(); if(prof){ qs('#btn-login').classList.add('hide'); qs('#btn-register').classList.add('hide'); qs('#main-nav').insertAdjacentHTML('beforeend', `<a id='nav-dash' data-route='#/dashboard' class='nav-link'>Dashboard</a>`); if(prof.role === 'admin'){ qs('#main-nav').insertAdjacentHTML('beforeend', `<a id='nav-admin' data-route='#/admin' class='nav-link'>Admin</a>`);} }
  else { qs('#btn-login').classList.remove('hide'); qs('#btn-register').classList.remove('hide'); const dashLink = qs('#nav-dash'); if(dashLink) dashLink.remove(); const adm = qs('#nav-admin'); if(adm) adm.remove(); }
}

// bootstrap
(async function bootstrap(){
  updateUI(); await loadHome(); loadAwareness(); loadLeaderboard();
  // if logged in auto open dashboard
  if(getProfile()) renderDashboard();
})();

/* End of app.js */
