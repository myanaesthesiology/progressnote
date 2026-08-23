const state={
  boot:null,area:'ALL',active:[],view:'dashboard',bundle:null,currentNote:null,
  token:'',publicConfig:null,handover:[],handoverArea:'',handoverQuery:''
};
const DAILY_FIELDS=['hopi','problems','cns','cvs','respiratory','git','renal','haematology','infection','indwellingCatheters','otherInvestigations','assessment','plan'];

function safeStorageGet_(key){try{return window.localStorage?localStorage.getItem(key)||'':''}catch(e){return''}}
function safeStorageSet_(key,value){try{if(window.localStorage)localStorage.setItem(key,value)}catch(e){}}
function safeStorageRemove_(key){try{if(window.localStorage)localStorage.removeItem(key)}catch(e){}}

function showFatalStartup_(err){
  const root=document.getElementById('authRoot');
  if(!root)return;
  const msg=(err&&err.message)?err.message:String(err||'Unknown startup error');
  root.classList.remove('hidden');
  root.innerHTML=`<div class="auth-card"><h1>ICU Clinical Notes</h1><div class="danger-note"><b>Startup error</b><br><br>${esc(msg)}</div><div class="auth-actions"><button class="btn" onclick="location.reload()">Retry</button></div><div class="auth-note">Frontend v7 · GitHub assets + native Apps Script RPC.</div></div>`;
}
window.addEventListener('error',e=>{if(document.getElementById('authRoot')&&!document.getElementById('authRoot').classList.contains('hidden'))showFatalStartup_(e.error||new Error(e.message||'JavaScript error'));});
window.addEventListener('unhandledrejection',e=>{if(document.getElementById('authRoot')&&!document.getElementById('authRoot').classList.contains('hidden'))showFatalStartup_(e.reason||new Error('Unhandled promise rejection'));});

function bootApp_(){
  try{
    renderLogin();
    state.token=safeStorageGet_('icu_notes_session_v7') || safeStorageGet_('icu_notes_session_v6') || safeStorageGet_('icu_notes_session_v5');
    if(!(window.google&&google.script&&google.script.run)){
      setLoginConnectionStatus_('This frontend must be opened using the deployed Apps Script /exec URL. The GitHub Pages URL is only the source repository.',true);
      return;
    }
    setLoginConnectionStatus_('Connected to Apps Script · checking database…');
    publicCall('getPublicConfig',null,cfg=>{
      state.publicConfig=cfg||{};
      document.title=(cfg&&cfg.appName)||'ICU Clinical Notes';
      if(!state.token){renderLogin();setLoginConnectionStatus_('Connected · ready to log in');return;}
      publicCall('getAuthStatus',state.token,st=>{
        if(st&&st.authenticated)startApp();
        else{clearSession();renderLogin();setLoginConnectionStatus_('Connected · ready to log in');}
      },()=>{clearSession();renderLogin();setLoginConnectionStatus_('Connected · ready to log in');});
    },e=>{renderLogin();setLoginConnectionStatus_('Backend error: '+((e&&e.message)||String(e)),true);});
  }catch(err){showFatalStartup_(err);}
}
function setLoginConnectionStatus_(msg,isError=false){
  const el=document.getElementById('loginConnectionStatus');
  if(!el)return;
  el.textContent=msg;
  el.className=isError?'danger-note':'auth-note';
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',bootApp_,{once:true});
else setTimeout(bootApp_,0);

function normalizeGasError_(e){
  if(e&&e.message)return new Error(e.message);
  return new Error(String(e||'Apps Script request failed.'));
}
function publicCall(fn,arg,ok,fail){
  if(!(window.google&&google.script&&google.script.run)){
    const e=new Error('Apps Script RPC is unavailable. Open the deployed /exec URL.');
    if(fail)fail(e);else toast(e.message,true);return;
  }
  try{
    google.script.run
      .withSuccessHandler(data=>{if(ok)ok(data);})
      .withFailureHandler(err=>{const e=normalizeGasError_(err);if(fail)fail(e);else toast(e.message,true);})
      .publicApi(fn,arg===undefined?null:arg);
  }catch(err){const e=normalizeGasError_(err);if(fail)fail(e);else toast(e.message,true);}
}
function run(fn,arg,ok,fail){
  if(!state.token){renderLogin();return;}
  try{
    google.script.run
      .withSuccessHandler(data=>{if(ok)ok(data);})
      .withFailureHandler(err=>{
        const e=normalizeGasError_(err);
        const msg=e.message;
        if(/AUTH_REQUIRED|SESSION_EXPIRED/.test(msg)){clearSession();renderLogin('Your session has ended. Please log in again.');return;}
        toast(msg,true);if(fail)fail(e);
      })
      .api(state.token,fn,arg===undefined?null:arg);
  }catch(err){const e=normalizeGasError_(err);toast(e.message,true);if(fail)fail(e);}
}

function clearSession(){state.token='';safeStorageRemove_('icu_notes_session_v7');safeStorageRemove_('icu_notes_session_v6');safeStorageRemove_('icu_notes_session_v5');}
function startApp(){
  document.getElementById('authRoot').classList.add('hidden');
  document.getElementById('appRoot').classList.remove('hidden');
  run('getBootstrap',null,boot=>{
    state.boot=boot;state.active=boot.activeAdmissions||[];
    document.getElementById('brand').textContent=boot.appName||'ICU Clinical Notes';
    const u=boot.currentUser||{};
    document.getElementById('userId').textContent=(u.displayName||boot.userId||'')+(u.designation?' · '+u.designation:'');
    renderAreaNav();renderDashboard();
  });
}

function renderLogin(message=''){
  document.getElementById('appRoot').classList.add('hidden');
  const root=document.getElementById('authRoot');root.classList.remove('hidden');
  root.innerHTML=`<div class="auth-card">
    <h1>${esc(state.publicConfig?.appName||'ICU Clinical Notes')}</h1>
    <p>Sign in with your ICU Notes username and password.</p>
    ${message?`<div class="auth-note">${esc(message)}</div>`:''}
    <div class="field"><label>Username</label><input id="lgUser" autocomplete="username"></div>
    <div class="field"><label>Password</label><input id="lgPass" type="password" autocomplete="current-password" onkeydown="if(event.key==='Enter')submitLogin()"></div>
    <div class="auth-actions"><button class="btn primary" onclick="submitLogin()">Login</button><button class="btn" onclick="renderRegister()">Register</button><button class="btn ghost" onclick="renderVerify()">Verify email</button></div>
    <button class="btn ghost" style="margin-top:8px" onclick="renderForgot()">Forgot password?</button>
    <div class="auth-note">Registration is only accepted if your email is already listed by the administrator in <b>TRUSTED_EMAILS</b>.</div><div class="auth-note" id="loginConnectionStatus">Frontend v7 loaded · connecting database…</div>
  </div>`;
}

function submitLogin(){
  publicCall('loginUser',{username:val('lgUser'),password:val('lgPass')},r=>{
    state.token=r.token;safeStorageSet_('icu_notes_session_v7',r.token);startApp();
  });
}

function renderRegister(){
  document.getElementById('authRoot').innerHTML=`<div class="auth-card">
    <h1>Create account</h1><p>Your email must already be on the trusted list.</p>
    <div class="field"><label>Trusted email</label><input id="rgEmail" type="email" autocomplete="email"></div>
    <div class="field"><label>Name</label><input id="rgName" placeholder="e.g. Dr Ahmad"></div>
    <div class="field"><label>Designation</label><input id="rgDesig" placeholder="MO / Registrar / Specialist"></div>
    <div class="field"><label>Username</label><input id="rgUser" autocomplete="username" placeholder="4–32 characters"></div>
    <div class="field"><label>Password</label><input id="rgPass" type="password" autocomplete="new-password" placeholder="At least 8 characters, with a letter and number"></div>
    <div class="field"><label>Confirm password</label><input id="rgPass2" type="password" autocomplete="new-password"></div>
    <div class="auth-actions"><button class="btn" onclick="renderLogin()">Back</button><button class="btn primary" onclick="submitRegister()">Register & send code</button></div>
  </div>`;
}
function submitRegister(){
  if(val('rgPass')!==val('rgPass2'))return toast('Passwords do not match.',true);
  publicCall('registerUser',{email:val('rgEmail'),displayName:val('rgName'),designation:val('rgDesig'),username:val('rgUser'),password:val('rgPass')},r=>{
    renderVerify(r.username,`Verification code sent to ${r.emailMasked}.`);
  });
}

function renderVerify(key='',message=''){
  document.getElementById('authRoot').innerHTML=`<div class="auth-card">
    <h1>Verify email</h1>${message?`<div class="auth-note">${esc(message)}</div>`:''}
    <div class="field"><label>Username or email</label><input id="vfKey" value="${esc(key)}"></div>
    <div class="field"><label>6-digit verification code</label><input id="vfCode" inputmode="numeric" maxlength="6"></div>
    <div class="auth-actions"><button class="btn" onclick="renderLogin()">Back</button><button class="btn primary" onclick="submitVerify()">Verify</button><button class="btn" onclick="resendVerify()">Resend code</button></div>
  </div>`;
}
function submitVerify(){publicCall('verifyEmail',{usernameOrEmail:val('vfKey'),code:val('vfCode')},()=>renderLogin('Email verified. You can now log in.'))}
function resendVerify(){publicCall('resendVerification',{usernameOrEmail:val('vfKey')},r=>toast(`New code sent to ${r.emailMasked}.`))}

function renderForgot(){
  document.getElementById('authRoot').innerHTML=`<div class="auth-card">
    <h1>Reset password</h1>
    <div class="field"><label>Username or email</label><input id="pwKey"></div>
    <div class="auth-actions"><button class="btn" onclick="renderLogin()">Back</button><button class="btn primary" onclick="sendResetCode()">Send reset code</button></div>
  </div>`;
}
function sendResetCode(){
  const key=val('pwKey');publicCall('startPasswordReset',{usernameOrEmail:key},r=>{
    document.getElementById('authRoot').innerHTML=`<div class="auth-card">
      <h1>Enter reset code</h1><div class="auth-note">${esc(r.message||'Check your email.')}</div>
      <input type="hidden" id="pwKey2" value="${esc(key)}">
      <div class="field"><label>6-digit code</label><input id="pwCode" inputmode="numeric" maxlength="6"></div>
      <div class="field"><label>New password</label><input id="pwNew" type="password"></div>
      <div class="field"><label>Confirm new password</label><input id="pwNew2" type="password"></div>
      <div class="auth-actions"><button class="btn" onclick="renderLogin()">Cancel</button><button class="btn primary" onclick="completeReset()">Change password</button></div>
    </div>`;
  });
}
function completeReset(){
  if(val('pwNew')!==val('pwNew2'))return toast('Passwords do not match.',true);
  publicCall('completePasswordReset',{usernameOrEmail:val('pwKey2'),code:val('pwCode'),newPassword:val('pwNew')},()=>renderLogin('Password changed. Please log in.'));
}
function logout(){const tok=state.token;clearSession();publicCall('logoutUser',tok,()=>renderLogin('You have logged out.'),()=>renderLogin('You have logged out.'))}

function esc(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]))}
function fmtDate(s){if(!s)return'';const d=new Date(s);return isNaN(d)?esc(s):d.toLocaleString('en-MY',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'})}
function todayLocal(){const d=new Date();d.setMinutes(d.getMinutes()-d.getTimezoneOffset());return d.toISOString().slice(0,16)}
function toast(msg,err=false){const h=document.getElementById('toastHost');h.innerHTML=`<div class="toast ${err?'err':''}">${esc(msg)}</div>`;setTimeout(()=>h.innerHTML='',4000)}
function closeModal(){document.getElementById('modalHost').innerHTML=''}
function modal(title,body,foot='',wide=false){document.getElementById('modalHost').innerHTML=`<div class="modal-back" onclick="if(event.target===this)closeModal()"><div class="modal ${wide?'wide':''}"><div class="modal-head"><h3>${title}</h3><span style="flex:1"></span><button class="btn small" onclick="closeModal()">✕</button></div><div class="modal-body">${body}</div>${foot?`<div class="modal-foot">${foot}</div>`:''}</div></div>`}

function renderAreaNav(){
  const nav=document.getElementById('areaNav');
  const items=['ALL',...(state.boot.areas||[])];
  nav.innerHTML='<h4>Critical area</h4>'+items.map(a=>`<button class="area-btn ${state.area===a?'active':''}" onclick="setArea('${esc(a)}')">${a==='ALL'?'All Active':esc(a)}</button>`).join('');
}
function setArea(a){state.area=a;renderAreaNav();if(state.view==='handover'){state.handoverArea=a;renderHandoverView()}else renderDashboard()}
function refreshDashboard(cb){run('getBootstrap',null,b=>{state.boot=b;state.active=b.activeAdmissions||[];renderAreaNav();if(cb)cb();else renderDashboard()})}
function goDashboard(){state.view='dashboard';state.bundle=null;state.currentNote=null;refreshDashboard()}


function goHandover(area){
  state.view='handover';
  state.handoverArea=area||((state.area&&state.area!=='ALL')?state.area:((state.boot?.areas||[]).includes('Peripheral Ward')?'Peripheral Ward':'ALL'));
  state.area=state.handoverArea;renderAreaNav();
  renderHandoverView();
}
function openSearchMobile(){
  if(state.view==='handover'){
    const q=prompt('Search handover by name, RN, ward or bed',state.handoverQuery||'');
    if(q!==null){state.handoverQuery=q;renderHandoverView();}
  }else{
    modal('Search patient',`<div class="field"><label>Name or RN</label><input id="searchInputMobile" onkeydown="if(event.key==='Enter')doSearchMobile()"></div>`,
      `<button class="btn" onclick="closeModal()">Cancel</button><button class="btn primary" onclick="doSearchMobile()">Search</button>`);
  }
}
function doSearchMobile(){
  const q=val('searchInputMobile');closeModal();
  if(!q)return;
  run('searchPatients',q,rows=>showSearchResults(rows));
}
function showSearchResults(rows){
  modal('Patient search',rows.length?rows.map(x=>{const p=x.patient,a=x.activeAdmission||x.latestAdmission;return `<div class="note-row"><div><b>${esc(p.Name)}</b><div class="meta">RN ${esc(p.RN)}</div></div><div class="meta">${a?esc(a.Status)+' · '+esc(a.Area||'')+' '+esc(a.Ward_Bed||''):'No admission'}</div><div>${x.activeAdmission?`<button class="btn small" onclick="closeModal();openPatient('${x.activeAdmission.Admission_ID}')">Open</button>`:`<button class="btn small" onclick="openReadmit('${p.Patient_ID}')">Readmit</button>`}</div></div>`}).join(''):'<div class="empty">No matching patient.</div>','',true);
}

function renderHandoverView(){
  const areas=['ALL',...(state.boot?.areas||[])];
  const area=state.handoverArea||'Peripheral Ward';
  const opts=areas.map(a=>`<option value="${esc(a)}" ${a===area?'selected':''}>${a==='ALL'?'All areas':esc(a)}</option>`).join('');
  document.getElementById('main').innerHTML=`
    <div class="handover-toolbar">
      <div class="toolbar" style="margin-bottom:0">
        <select id="hvArea" class="search" style="width:auto;min-width:170px" onchange="state.handoverArea=this.value;renderHandoverView()">${opts}</select>
        <input id="hvSearch" class="search" placeholder="Search name, RN, ward or bed" value="${esc(state.handoverQuery||'')}" onkeydown="if(event.key==='Enter'){state.handoverQuery=this.value;renderHandoverView()}">
        <button class="btn" onclick="state.handoverQuery=val('hvSearch');renderHandoverView()">Filter</button>
        <span class="spacer"></span>
        <button class="btn" onclick="openAreaHandover()">Print / export handover</button>
      </div>
    </div>
    <div class="section-title"><h2>Mobile Handover</h2><span class="count">Latest signed clinical entry</span></div>
    <div id="handoverBoard"><div class="empty">Loading handover…</div></div>`;
  run('getHandoverBoard',{area:area,query:state.handoverQuery||''},rows=>{
    state.handover=rows||[];renderHandoverRows();
  });
}
function renderHandoverRows(){
  const host=document.getElementById('handoverBoard');if(!host)return;
  const rows=state.handover||[];
  if(!rows.length){host.innerHTML='<div class="empty">No active patients found.</div>';return;}
  const peripheral=state.handoverArea==='Peripheral Ward';
  if(peripheral){
    const groups={};
    rows.forEach(r=>{const k=r.wardName||'Ward not specified';(groups[k]||(groups[k]=[])).push(r)});
    host.innerHTML=Object.keys(groups).sort((a,b)=>a.localeCompare(b,undefined,{numeric:true})).map(k=>`<section class="handover-group"><div class="handover-group-title">${esc(k)} · ${groups[k].length} patient${groups[k].length===1?'':'s'}</div><div class="handover-list">${groups[k].map(handoverCard).join('')}</div></section>`).join('');
  }else{
    host.innerHTML=`<div class="handover-list">${rows.map(handoverCard).join('')}</div>`;
  }
}
function handoverCard(x){
  const last=x.latestEntry;let freshness='No signed entry',cls='stale';
  if(last?.dateTime){const hrs=(Date.now()-new Date(last.dateTime).getTime())/36e5;freshness=hrs<1?'Updated <1 h ago':`Updated ${Math.floor(hrs)} h ago`;cls=hrs<=24?'fresh':'stale';}
  const loc=[x.area,x.wardName,x.bed].filter(Boolean).join(' · ');
  return `<article class="handover-card" onclick="this.classList.toggle('expanded')">
    <div class="identity"><div style="min-width:0"><h3>${esc(x.name)}</h3><div class="meta">RN ${esc(x.rn)} · Age ${esc(x.age||'-')} · ICU Day ${esc(x.icuDay||'-')}</div><div class="loc">${esc(loc)}</div></div><span style="flex:1"></span><span class="badge">${esc(x.bed||x.wardBed||'')}</span></div>
    <div class="handover-section"><b>Comorbidities</b>${esc(x.comorbidities||'-')}</div>
    <div class="handover-section"><b>Short presenting history</b>${esc(x.shortHopi||x.diagnosis||'-')}</div>
    <div class="handover-section"><b>Problems / issues</b>${esc(x.problems||'-')}</div>
    <div class="latest-entry"><div style="display:flex;gap:8px;align-items:center"><b style="font-size:11px">${esc(last?.type||'Latest entry')}</b><span class="meta ${cls}">${esc(freshness)}</span></div>
      <div style="white-space:pre-wrap;font-size:12px;margin-top:4px">${esc(last?.text||'No signed clinical entry yet.')}</div>
      ${last?`<div class="meta" style="margin-top:5px">${fmtDate(last.dateTime)} · ${esc(last.authorName||'')}</div>`:''}
    </div>
    <div class="card-actions"><button class="btn small" onclick="event.stopPropagation();openPatient('${x.admissionId}')">Open patient</button><button class="btn small primary" onclick="event.stopPropagation();newNote('${x.admissionId}','Daily Review')">+ Review</button></div>
  </article>`;
}

function renderDashboard(){
  state.view='dashboard';
  const list=state.active.filter(x=>state.area==='ALL'||x.admission.Area===state.area);
  document.getElementById('main').innerHTML=`
    <div class="toolbar">
      <button class="btn primary" onclick="openAddPatient()">+ New patient</button>
      <button class="btn" onclick="goHandover()">Mobile handover</button>
      <button class="btn" onclick="openSummaryCards()">Summary cards</button><button class="btn" onclick="openAreaHandover()">Print handover</button>
      <span class="spacer"></span>
      <input class="search" id="searchInput" placeholder="Search name or RN" onkeydown="if(event.key==='Enter')doSearch()">
      <button class="btn" onclick="doSearch()">Search</button>
    </div>
    <div class="section-title"><h2>${state.area==='ALL'?'Active ICU / Critical Area Patients':esc(state.area)}</h2><span class="count">${list.length} patient${list.length===1?'':'s'}</span></div>
    <div class="grid">${list.length?list.map(patientCard).join(''):'<div class="empty" style="grid-column:1/-1">No active patients in this area.</div>'}</div>`;
}
function patientCard(x){
  const p=x.patient,a=x.admission,n=x.latestDaily;
  return `<article class="card"><div style="display:flex;gap:8px;align-items:start"><div><h3>${esc(p.Name)}</h3><div class="meta">RN ${esc(p.RN)} · ${esc(a.Area)} ${a.Ward_Bed?'· '+esc(a.Ward_Bed):''}</div></div><span style="flex:1"></span><span class="badge">ICU Day ${esc(x.icuDay||'-')}</span></div><div class="diag"><b>${esc(a.Primary_Diagnosis||'No diagnosis entered')}</b></div><div class="problems">${esc(n?.Problems||x.activeProblemSummary||'No current problems recorded yet.')}</div><div class="meta" style="margin-top:7px">${n?'Last Daily Review: '+fmtDate(n.Note_DateTime):'No Daily Review yet'}</div><div class="card-actions"><button class="btn small" onclick="openPatient('${a.Admission_ID}')">Open patient</button><button class="btn small primary" onclick="newNote('${a.Admission_ID}','Daily Review')">+ Daily Review</button></div></article>`
}

function openPatient(admissionId){run('getPatientBundle',admissionId,b=>{state.bundle=b;state.view='patient';renderPatient()})}
function renderPatient(){
  const {patient:p,admission:a,notes}=state.bundle;
  document.getElementById('main').innerHTML=`
    <div class="patient-head"><div><div class="meta">${esc(a.Area)} ${a.Ward_Bed?'· '+esc(a.Ward_Bed):''}</div><h2>${esc(p.Name)} <span style="font-weight:500;color:#667085">· RN ${esc(p.RN)}</span></h2><div class="meta">Age ${esc(p.Age||'-')} · ICU Day ${esc(state.bundle.icuDay||'-')} · ${esc(a.Primary_Diagnosis||'')} · Admission ${fmtDate(a.Admission_DateTime)}</div></div><div class="right"><button class="btn" onclick="openMovePatient()">Change area / bed</button><button class="btn danger" onclick="openDischarge()">Discharge</button></div></div>
    <div class="toolbar"><button class="btn primary" onclick="openEntryMenu()">+ New entry</button><button class="btn" onclick="goDashboard()">← Dashboard</button></div>
    <div class="tabs"><button class="tab active">Timeline</button><button class="tab" onclick="showPatientSummary()">Patient summary</button></div>
    <div>${notes.length?notes.map(noteRow).join(''):'<div class="empty">No clinical entries yet.</div>'}</div>`;
}
function noteRow(n){const prev=n.Problems||n.Simple_Entry||n.HOPI||n.Procedure_Name||'';return `<div class="note-row"><div><div class="note-type">${esc(n.Entry_Type)}</div><div class="meta">${fmtDate(n.Note_DateTime)}</div><span class="badge ${n.Status==='SIGNED'?'signed':'draft'}">${esc(n.Status)}</span></div><div><div class="meta">${esc(n.Author_UserID||'')}</div><div class="note-preview">${esc(prev)}</div></div><div><button class="btn small" onclick="viewNote('${n.Note_ID}')">View / print</button>${n.Status==='DRAFT'&&n.Author_UserID===state.boot.userId?`<button class="btn small" onclick="editNote('${n.Note_ID}')">Edit</button>`:''}</div></div>`}
function showPatientSummary(){const p=state.bundle.patient,a=state.bundle.admission,probs=state.bundle.problems||[],devs=state.bundle.devices||[],locs=state.bundle.locations||[];modal('Patient summary',`<div class="form-grid"><div class="field"><label>Name</label><div>${esc(p.Name)}</div></div><div class="field"><label>RN</label><div>${esc(p.RN)}</div></div><div class="field"><label>Age</label><div>${esc(p.Age||'-')}</div></div><div class="field"><label>Area / Bed</label><div>${esc(a.Area)} / ${esc(a.Ward_Bed||'-')}</div></div><div class="field full"><label>Comorbidities</label><div style="white-space:pre-wrap">${esc(p.Comorbidities||'-')}</div></div><div class="field full"><label>Allergies</label><div style="white-space:pre-wrap">${esc(p.Allergies||'-')}</div></div><div class="field full"><label>Short presenting history</label><div style="white-space:pre-wrap">${esc(a.Short_Presenting_History||'-')}</div></div><div class="field full"><label>Primary diagnosis</label><div>${esc(a.Primary_Diagnosis||'-')}</div></div></div><h3 class="system-title">Structured problems</h3><button class="btn small primary" onclick="openProblem()">+ Add problem</button><div style="margin-top:8px">${probs.length?probs.map(x=>`<div class="note-row"><div><b>${esc(x.Status)}</b><div class="meta">${esc(x.Onset_Date||'')}</div></div><div><b>${esc(x.Problem)}</b><div class="meta">${esc(x.Notes||'')}</div></div><button class="btn small" onclick="openProblem('${x.Problem_ID}')">Edit</button></div>`).join(''):'<div class="meta">No structured problems yet.</div>'}</div><h3 class="system-title">Indwelling devices</h3><button class="btn small primary" onclick="openDevice()">+ Add device</button><div style="margin-top:8px">${devs.length?devs.map(x=>`<div class="note-row"><div><b>${esc(x.Status)}</b><div class="meta">${fmtDate(x.Inserted_DateTime)}</div></div><div><b>${esc(x.Device_Type)}</b> ${x.Site?'· '+esc(x.Site):''}<div class="meta">${esc(x.Notes||'')}</div></div><button class="btn small" onclick="openDevice('${x.Device_ID}')">Edit</button></div>`).join(''):'<div class="meta">No devices recorded.</div>'}</div><h3 class="system-title">Location history</h3><div>${locs.length?locs.map(x=>`<div class="meta" style="margin:5px 0">${fmtDate(x.Start_DateTime)} — ${esc(x.Area)} ${x.Ward_Name?'· '+esc(x.Ward_Name):''}${x.Bed?' · '+esc(x.Bed):''}${x.End_DateTime?' → '+fmtDate(x.End_DateTime):' · CURRENT'}</div>`).join(''):'<div class="meta">No location history recorded.</div>'}</div>`, '', true)}
function refreshPatientBundle(cb){const id=state.bundle.admission.Admission_ID;run('getPatientBundle',id,b=>{state.bundle=b;if(cb)cb();else renderPatient()})}
function openProblem(id=''){const x=(state.bundle.problems||[]).find(p=>p.Problem_ID===id)||{};const sts=(state.boot.problemStatuses||['New','Active','Improving','Resolved','Chronic']).map(v=>`<option ${v===x.Status?'selected':''}>${esc(v)}</option>`).join('');modal(id?'Edit problem':'Add problem',`<div class="form-grid"><div class="field full"><label>Problem *</label><input id="prProblem" value="${esc(x.Problem||'')}"></div><div class="field"><label>Status</label><select id="prStatus">${sts}</select></div><div class="field"><label>Onset date</label><input id="prOnset" type="date" value="${esc(x.Onset_Date||'')}"></div><div class="field full"><label>Notes</label><textarea id="prNotes">${esc(x.Notes||'')}</textarea></div></div>`,`<button class="btn" onclick="closeModal();showPatientSummary()">Cancel</button><button class="btn primary" onclick="submitProblem('${id}')">Save</button>`)}
function submitProblem(id){run('saveProblem',{problemId:id,admissionId:state.bundle.admission.Admission_ID,problem:val('prProblem'),status:val('prStatus'),onsetDate:val('prOnset'),notes:val('prNotes')},b=>{state.bundle=b;closeModal();toast('Problem list updated.');showPatientSummary()})}
function openDevice(id=''){const x=(state.bundle.devices||[]).find(d=>d.Device_ID===id)||{};const sts=(state.boot.deviceStatuses||['In situ','Removed']).map(v=>`<option ${v===x.Status?'selected':''}>${esc(v)}</option>`).join('');modal(id?'Edit device':'Add device',`<div class="form-grid"><div class="field"><label>Device type *</label><input id="dvType" value="${esc(x.Device_Type||'')}" placeholder="ETT / CVC / arterial line / urinary catheter"></div><div class="field"><label>Site</label><input id="dvSite" value="${esc(x.Site||'')}"></div><div class="field"><label>Inserted date/time</label><input id="dvIn" type="datetime-local" value="${x.Inserted_DateTime?toLocalInput(x.Inserted_DateTime):todayLocal()}"></div><div class="field"><label>Status</label><select id="dvStatus">${sts}</select></div><div class="field"><label>Removed date/time</label><input id="dvOut" type="datetime-local" value="${x.Removed_DateTime?toLocalInput(x.Removed_DateTime):''}"></div><div class="field full"><label>Notes</label><textarea id="dvNotes">${esc(x.Notes||'')}</textarea></div></div>`,`<button class="btn" onclick="closeModal();showPatientSummary()">Cancel</button><button class="btn primary" onclick="submitDevice('${id}')">Save</button>`)}
function submitDevice(id){run('saveDevice',{deviceId:id,admissionId:state.bundle.admission.Admission_ID,deviceType:val('dvType'),site:val('dvSite'),insertedDateTime:val('dvIn'),status:val('dvStatus'),removedDateTime:val('dvOut'),notes:val('dvNotes')},b=>{state.bundle=b;closeModal();toast('Device list updated.');showPatientSummary()})}


const OCR_ASSETS={
  cropperCss:'https://cdn.jsdelivr.net/npm/cropperjs@1.6.2/dist/cropper.min.css',
  cropperJs:'https://cdn.jsdelivr.net/npm/cropperjs@1.6.2/dist/cropper.min.js',
  tesseractJs:'https://cdn.jsdelivr.net/npm/tesseract.js@7.0.0/dist/tesseract.min.js'
};
function loadStyleOnce_(id,url){
  if(document.getElementById(id))return Promise.resolve();
  return new Promise((resolve,reject)=>{
    const link=document.createElement('link');link.id=id;link.rel='stylesheet';link.href=url;
    link.onload=()=>resolve();link.onerror=()=>reject(new Error('Unable to load OCR stylesheet.'));document.head.appendChild(link);
  });
}
function loadScriptOnce_(id,url,test){
  if(test())return Promise.resolve();
  const existing=document.getElementById(id);
  if(existing&&existing.dataset.loaded==='1')return Promise.resolve();
  return new Promise((resolve,reject)=>{
    const script=existing||document.createElement('script');script.id=id;script.src=url;script.async=true;
    script.onload=()=>{script.dataset.loaded='1';test()?resolve():reject(new Error('OCR library loaded but did not initialize.'));};
    script.onerror=()=>reject(new Error('Unable to download OCR library. Check internet access and try again.'));
    if(!existing)document.head.appendChild(script);
  });
}
async function ensureOcrLibrariesLoaded_(){
  if(typeof Cropper!=='undefined'&&typeof Tesseract!=='undefined')return;
  await loadStyleOnce_('icu-cropper-css',OCR_ASSETS.cropperCss);
  await loadScriptOnce_('icu-cropper-js',OCR_ASSETS.cropperJs,()=>typeof Cropper!=='undefined');
  await loadScriptOnce_('icu-tesseract-js',OCR_ASSETS.tesseractJs,()=>typeof Tesseract!=='undefined');
}

function closeOcr(){
  try{if(state.ocrCropper)state.ocrCropper.destroy()}catch(_){ }
  state.ocrCropper=null;
  if(state.ocrObjectUrl){try{URL.revokeObjectURL(state.ocrObjectUrl)}catch(_){}}
  state.ocrObjectUrl='';state.ocrOriginalCanvas=null;state.ocrProcessedCanvas=null;state.ocrResult=null;
  document.getElementById('ocrHost').innerHTML='';
}
function ocrCandidates(context){
  if(context==='PATIENT_DETAILS') return [
    ['PATIENT_DETAILS','Auto-detect patient details'],['apAdmissionHopi','Admission HOPI / clerking'],
    ['apHopi','Short presenting history'],['apComorb','Comorbidities'],['apPMH','Relevant PMH'],
    ['apDrug','Drug history'],['apDx','Primary diagnosis']
  ];
  const all=[
    ['hopi','HOPI / Clinical Summary'],['problems','Problems / Issues'],['cns','CNS'],['cvs','CVS'],
    ['respiratory','Respiratory'],['git','GIT / Nutrition'],['renal','Renal / Fluid'],
    ['haematology','Haematology / Blood Ix'],['infection','Infection / Infective Parameters'],
    ['indwellingCatheters','Indwelling Catheters / Lines'],['otherInvestigations','Other Investigations'],
    ['assessment','Assessment'],['plan','Plan'],['simpleEntry','Clinical entry'],['simpleTitle','Title / reason'],['procedureName','Procedure']
  ];
  return all.filter(x=>document.getElementById(x[0]));
}
async function openOcrAssist(context){
  const candidates=ocrCandidates(context);
  if(!candidates.length)return toast('No editable OCR target is available on this screen.',true);
  closeOcr();
  document.getElementById('ocrHost').innerHTML=`<div class="modal-back" style="z-index:80"><div class="modal"><div class="modal-head"><h3>Local OCR Assist</h3></div><div class="modal-body"><div class="empty">Loading OCR tools only when needed…</div></div></div></div>`;
  try{await ensureOcrLibrariesLoaded_();}
  catch(e){document.getElementById('ocrHost').innerHTML='';return toast(e.message||String(e),true);}
  closeOcr();
  document.getElementById('ocrHost').innerHTML=`<div class="modal-back" style="z-index:80" onclick="if(event.target===this)closeOcr()"><div class="modal wide">
    <div class="modal-head"><h3>Local OCR Assist</h3><span style="flex:1"></span><button class="btn small" onclick="closeOcr()">✕</button></div>
    <div class="modal-body">
      <div class="form-grid">
        <div class="field"><label>Insert / detect into</label><select id="ocrTarget">${candidates.map(x=>`<option value="${esc(x[0])}">${esc(x[1])}</option>`).join('')}</select></div>
        <div class="field"><label>When inserting text</label><select id="ocrMode"><option value="APPEND">Append to existing text</option><option value="REPLACE">Replace existing text</option></select></div>
        <div class="field"><label>Contrast enhancement</label><input id="ocrContrast" type="range" min="0" max="80" value="36" oninput="document.getElementById('ocrContrastValue').textContent=this.value"><span class="meta">Level: <b id="ocrContrastValue">36</b></span></div>
        <div class="field"><label>Preprocessing</label><label style="font-weight:500"><input id="ocrSharpen" type="checkbox" checked> Sharpen before automatic threshold</label></div>
      </div>
      <div class="ocr-controls">
        <button class="btn primary" onclick="document.getElementById('ocrCamera').click()">📷 Camera capture</button>
        <button class="btn" onclick="document.getElementById('ocrGallery').click()">🖼 Gallery upload</button>
        <input id="ocrCamera" type="file" accept="image/*" capture="environment" class="hidden" onchange="loadOcrImage(this.files?.[0],'${context}')">
        <input id="ocrGallery" type="file" accept="image/*" class="hidden" onchange="loadOcrImage(this.files?.[0],'${context}')">
      </div>
      <div class="auth-note"><b>Privacy:</b> OCR runs in this browser using Tesseract.js. The photograph is kept only temporarily in browser memory and is not uploaded to Apps Script, Google Drive, or the database. Always compare OCR text with the source before saving/signing.</div>
      <div id="ocrProgress" class="meta" style="margin-top:10px">Choose or photograph an image.</div>
      <div class="ocr-progressbar"><div id="ocrProgressBar"></div></div>
      <div id="ocrEditor" class="hidden">
        <div class="ocr-source-wrap"><img id="ocrSourceImage" alt="Local OCR image preview"></div>
        <div class="ocr-controls">
          <button class="btn small" onclick="ocrRotate(-90)">↶ Rotate left</button>
          <button class="btn small" onclick="ocrRotate(90)">↷ Rotate right</button>
          <button class="btn small" onclick="ocrResetCrop()">Reset crop</button>
          <button class="btn small" onclick="autoOrientCurrentOcrImage()">Auto-rotate again</button>
        </div>
        <div class="ocr-memory-note">Adjust the crop box around the useful clinical text. Manual rotation is available if automatic orientation is imperfect.</div>
      </div>
      <div id="ocrProcessedWrap" class="ocr-previews hidden"><figure><figcaption>Cropped source</figcaption><canvas id="ocrCropPreview"></canvas></figure><figure><figcaption>Enhanced OCR image</figcaption><canvas id="ocrEnhancedPreview"></canvas></figure></div>
      <div id="ocrResult"></div>
    </div>
    <div class="modal-foot"><button class="btn" onclick="closeOcr()">Cancel</button><button id="ocrRunBtn" class="btn primary" disabled onclick="preprocessAndRunOcr('${context}')">Preprocess & OCR</button></div>
  </div></div>`;
}

function setOcrProgress(text,pct){
  const t=document.getElementById('ocrProgress'),b=document.getElementById('ocrProgressBar');
  if(t)t.textContent=text||'';if(b)b.style.width=Math.max(0,Math.min(100,Number(pct||0)))+'%';
}

async function ensureOcrWorker(){
  if(state.ocrWorker)return state.ocrWorker;
  setOcrProgress('Loading local OCR engine…',4);
  state.ocrPhase='loading';
  state.ocrWorker=await Tesseract.createWorker('eng',1,{logger:m=>{
    if(!m)return;
    const pct=Math.round((Number(m.progress)||0)*100);
    const label=(m.status||'OCR').replace(/_/g,' ');
    if(state.ocrPhase==='orientation')setOcrProgress('Auto-rotate: '+label,Math.max(5,Math.min(42,pct*.42)));
    else if(state.ocrPhase==='recognition')setOcrProgress('OCR: '+label,55+Math.round(pct*.44));
  }});
  return state.ocrWorker;
}

async function fileToCanvas(file,maxSide=2000){
  if(!file)throw new Error('No image selected.');
  if(!file.type.startsWith('image/'))throw new Error('Please select an image file.');
  let bitmap;
  try{bitmap=await createImageBitmap(file,{imageOrientation:'from-image'})}catch(_){bitmap=await createImageBitmap(file)}
  const scale=Math.min(1,maxSide/Math.max(bitmap.width,bitmap.height));
  const c=document.createElement('canvas');c.width=Math.max(1,Math.round(bitmap.width*scale));c.height=Math.max(1,Math.round(bitmap.height*scale));
  c.getContext('2d',{willReadFrequently:true}).drawImage(bitmap,0,0,c.width,c.height);if(bitmap.close)bitmap.close();return c;
}

async function loadOcrImage(file,context){
  if(!file)return;
  try{
    setOcrProgress('Loading image into browser memory…',2);
    state.ocrOriginalCanvas=await fileToCanvas(file,2000);
    document.getElementById('ocrEditor').classList.remove('hidden');
    document.getElementById('ocrRunBtn').disabled=true;
    await autoOrientCurrentOcrImage();
    document.getElementById('ocrRunBtn').disabled=false;
  }catch(e){toast(e.message||String(e),true);setOcrProgress('Unable to prepare image.',0)}
}

async function autoOrientCurrentOcrImage(){
  if(!state.ocrOriginalCanvas)return;
  try{
    const worker=await ensureOcrWorker();state.ocrPhase='orientation';setOcrProgress('Automatically checking document orientation…',5);
    const result=await worker.recognize(state.ocrOriginalCanvas,{rotateAuto:true},{imageColor:true});
    const rotated=result?.data?.imageColor||state.ocrOriginalCanvas.toDataURL('image/jpeg',0.92);
    setOcrCropperSource(rotated);setOcrProgress('Auto-rotation complete. Crop the useful text, then run OCR.',45);
  }catch(e){
    setOcrCropperSource(state.ocrOriginalCanvas.toDataURL('image/jpeg',0.92));
    setOcrProgress('Auto-rotation was unavailable; use manual rotate if needed.',45);
  }
}

function setOcrCropperSource(src){
  const img=document.getElementById('ocrSourceImage');if(!img)return;
  if(state.ocrCropper){try{state.ocrCropper.destroy()}catch(_){ }state.ocrCropper=null;}
  img.onload=()=>{state.ocrCropper=new Cropper(img,{viewMode:1,dragMode:'move',autoCropArea:.92,responsive:true,background:false,checkOrientation:true,rotatable:true,scalable:false,zoomable:true});};
  img.src=src;
}
function ocrRotate(deg){if(state.ocrCropper)state.ocrCropper.rotate(Number(deg)||0)}
function ocrResetCrop(){if(state.ocrCropper)state.ocrCropper.reset()}

function copyCanvasInto(source,target){target.width=source.width;target.height=source.height;target.getContext('2d').drawImage(source,0,0)}
function otsuThreshold(hist,total){
  let sum=0;for(let i=0;i<256;i++)sum+=i*hist[i];let sumB=0,wB=0,max=0,threshold=127;
  for(let i=0;i<256;i++){wB+=hist[i];if(!wB)continue;const wF=total-wB;if(!wF)break;sumB+=i*hist[i];const mB=sumB/wB,mF=(sum-sumB)/wF;const between=wB*wF*(mB-mF)*(mB-mF);if(between>max){max=between;threshold=i;}}
  return threshold;
}
function preprocessCanvas(source,contrastLevel,sharpen){
  const maxW=1700,maxH=2300,scale=Math.min(1,maxW/source.width,maxH/source.height);const w=Math.max(1,Math.round(source.width*scale)),h=Math.max(1,Math.round(source.height*scale));
  const c=document.createElement('canvas');c.width=w;c.height=h;const ctx=c.getContext('2d',{willReadFrequently:true});ctx.drawImage(source,0,0,w,h);
  const img=ctx.getImageData(0,0,w,h),d=img.data,n=w*h,gray=new Uint8ClampedArray(n),hist=new Uint32Array(256);
  const cv=Math.max(0,Math.min(80,Number(contrastLevel)||0));const factor=(259*(cv+255))/(255*(259-cv));
  for(let i=0,p=0;i<d.length;i+=4,p++){let g=.299*d[i]+.587*d[i+1]+.114*d[i+2];g=factor*(g-128)+128;gray[p]=Math.max(0,Math.min(255,g));}
  let work=gray;
  if(sharpen&&w>2&&h>2){const out=new Uint8ClampedArray(gray);for(let y=1;y<h-1;y++){let row=y*w;for(let x=1;x<w-1;x++){const p=row+x;const v=5*gray[p]-gray[p-1]-gray[p+1]-gray[p-w]-gray[p+w];out[p]=Math.max(0,Math.min(255,v));}}work=out;}
  for(let i=0;i<n;i++)hist[work[i]]++;const threshold=otsuThreshold(hist,n);
  for(let p=0,i=0;p<n;p++,i+=4){const v=work[p]>threshold?255:0;d[i]=d[i+1]=d[i+2]=v;d[i+3]=255;}
  ctx.putImageData(img,0,0);return c;
}

async function preprocessAndRunOcr(context){
  if(!state.ocrCropper)return toast('Choose an image first.',true);
  const btn=document.getElementById('ocrRunBtn');if(btn)btn.disabled=true;
  try{
    setOcrProgress('Cropping image…',47);
    const cropped=state.ocrCropper.getCroppedCanvas({maxWidth:2200,maxHeight:3000,imageSmoothingEnabled:true,imageSmoothingQuality:'high'});
    if(!cropped||!cropped.width||!cropped.height)throw new Error('The crop area is empty.');
    const cropPrev=document.getElementById('ocrCropPreview');copyCanvasInto(cropped,cropPrev);
    setOcrProgress('Grayscale → contrast → sharpen → automatic threshold…',51);
    const enhanced=preprocessCanvas(cropped,val('ocrContrast'),document.getElementById('ocrSharpen')?.checked!==false);state.ocrProcessedCanvas=enhanced;
    copyCanvasInto(enhanced,document.getElementById('ocrEnhancedPreview'));document.getElementById('ocrProcessedWrap').classList.remove('hidden');
    const worker=await ensureOcrWorker();state.ocrPhase='recognition';setOcrProgress('Running OCR locally on this device…',55);
    const result=await worker.recognize(enhanced,{rotateAuto:true});
    const text=String(result?.data?.text||'').trim();if(!text)throw new Error('No readable text was detected. Try a tighter crop, better lighting, or reduce contrast.');
    const suggestions=parseLocalOcrPatientDetails(text);state.ocrResult={text,suggestions,provider:'Local Tesseract.js',targetSection:val('ocrTarget'),confidence:result?.data?.confidence};
    setOcrProgress(`OCR complete${Number.isFinite(result?.data?.confidence)?' · confidence '+Math.round(result.data.confidence)+'%':''}. Review before inserting.`,100);
    renderOcrResult(context,state.ocrResult);
    run('logLocalOcr',{characterCount:text.length,targetSection:val('ocrTarget'),patientId:state.bundle?.patient?.Patient_ID||'',admissionId:state.bundle?.admission?.Admission_ID||''},()=>{},()=>{});
  }catch(e){toast(e.message||String(e),true);setOcrProgress('OCR failed. '+(e.message||String(e)),0)}finally{if(btn)btn.disabled=false;state.ocrPhase='idle'}
}

function parseLocalOcrPatientDetails(text){
  const t=String(text||'').replace(/\r/g,'');const line=pattern=>{const m=t.match(pattern);return m?String(m[1]||'').trim():''};
  const rn=line(/(?:^|\n)\s*(?:RN|MRN|Hospital\s*(?:No|Number)|Registration\s*(?:No|Number))\s*[:#-]?\s*([A-Za-z0-9\-\/]+)/im);
  const name=line(/(?:^|\n)\s*(?:Patient\s*)?Name\s*[:\-]\s*([^\n]+)/im);
  const age=line(/(?:^|\n|\s)Age\s*[:\-]?\s*(\d{1,3})(?:\s*(?:y|yr|yrs|years))?/im);
  const sex=line(/(?:^|\n|\s)(?:Sex|Gender)\s*[:\-]?\s*(Male|Female|M|F)\b/im);
  const ward=line(/(?:^|\n)\s*Ward\s*[:\-]\s*([^\n]+)/im);const bed=line(/(?:^|\n|\s)Bed\s*[:#\-]?\s*([A-Za-z0-9\-]+)/im);
  const diagnosis=line(/(?:^|\n)\s*(?:Diagnosis|Dx)\s*[:\-]\s*([^\n]+)/im);
  const hopi=t.match(/(?:HOPI|History\s+of\s+Presenting\s+Illness)\s*[:\-]?\s*([\s\S]{20,}?)(?=\n\s*(?:PMH|Past\s+Medical|Diagnosis|Dx|Examination|Plan|Assessment|Problems?)\b|$)/im);
  return {name,rn,age,sex:sex?(sex.toUpperCase()==='M'?'Male':sex.toUpperCase()==='F'?'Female':sex):'',wardName:ward,bed,primaryDiagnosis:diagnosis,hopi:hopi?String(hopi[1]).trim():''};
}

function renderOcrResult(context,r){
  const sug=r.suggestions||{};const labels={name:'Name',rn:'RN',age:'Age',sex:'Sex',wardName:'Ward',bed:'Bed',primaryDiagnosis:'Diagnosis',hopi:'HOPI'};
  const sugRows=Object.entries(sug).filter(([k,v])=>v).map(([k,v])=>`<div><b>${esc(labels[k]||k)}</b>: ${esc(v)}</div>`).join('');
  document.getElementById('ocrResult').innerHTML=`${context==='PATIENT_DETAILS'&&sugRows?`<div class="auth-note" style="margin-top:10px"><b>Detected patient details</b><div style="margin-top:5px">${sugRows}</div></div>`:''}
    <h4 style="margin-bottom:6px">Extracted text — preview before insertion</h4><div class="ocr-preview">${esc(r.text||'')}</div>
    <div class="auth-actions">${context==='PATIENT_DETAILS'?'<button class="btn" onclick="applyOcrPatientSuggestions()">Apply detected details</button>':''}<button class="btn primary" onclick="insertOcrText()">Insert extracted text</button></div>`;
}
function setIfSuggested(id,value,onlyIfEmpty=true){const el=document.getElementById(id);if(!el||!value)return;if(!onlyIfEmpty||!el.value)el.value=value;}
function applyOcrPatientSuggestions(){const s=state.ocrResult?.suggestions||{};setIfSuggested('apName',s.name);setIfSuggested('apRN',s.rn);setIfSuggested('apAge',s.age);setIfSuggested('apSex',s.sex);setIfSuggested('apWard',s.wardName);setIfSuggested('apBed',s.bed);setIfSuggested('apDx',s.primaryDiagnosis);setIfSuggested('apAdmissionHopi',s.hopi);if(s.hopi)setIfSuggested('apHopi',s.hopi);toast('Detected fields applied where the form was blank. Review every field.');}
function insertOcrText(){const r=state.ocrResult;if(!r?.text)return;let id=val('ocrTarget');if(id==='PATIENT_DETAILS'){applyOcrPatientSuggestions();id='apAdmissionHopi';}const el=document.getElementById(id);if(!el)return toast('The selected target field is no longer available.',true);const mode=val('ocrMode');if(mode==='REPLACE'||!el.value)el.value=r.text;else el.value=el.value.replace(/\s+$/,'')+'\n'+r.text;toast('OCR text inserted. Review it before saving.');closeOcr();}


function openEntryMenu(){const a=state.bundle.admission.Admission_ID;modal('New clinical entry',`<div class="grid">${state.boot.noteTypes.filter(x=>x!=='Addendum').map(t=>`<button class="btn" style="padding:18px;text-align:left" onclick="closeModal();newNote('${a}','${t.replace(/'/g,"\\'")}')"><b>${esc(t)}</b></button>`).join('')}</div>`)}
function newNote(admissionId,type,seed=null){if(!state.bundle||state.bundle.admission.Admission_ID!==admissionId){run('getPatientBundle',admissionId,b=>{state.bundle=b;openNoteEditor(type,seed)})}else openNoteEditor(type,seed)}
function editNote(noteId){const n=state.bundle.notes.find(x=>x.Note_ID===noteId);if(n)openNoteEditor(n.Entry_Type,n)}

function openNoteEditor(type,seed=null){
  state.currentNote=seed||null;state.view='editor';
  const p=state.bundle.patient,a=state.bundle.admission,n=seed||{};
  const daily=type==='Daily Review';
  document.getElementById('main').innerHTML=`
    <div class="toolbar"><button class="btn" onclick="renderPatient()">← Patient timeline</button>${daily&&!seed?'<button class="btn" onclick="copyPreviousDaily()">Copy selected sections from previous</button>':''}<button class="btn" onclick="openOcrAssist('NOTE')">📷 OCR assist</button></div>
    <div class="form"><div class="review-header">${esc(type)} · ${esc(p.Name)} · RN ${esc(p.RN)}</div>
      <div class="form-grid"><div class="field"><label>Date / time</label><input id="noteDateTime" type="datetime-local" value="${seed&&seed.Note_DateTime?toLocalInput(seed.Note_DateTime):todayLocal()}"></div><div class="field"><label>Status / author</label><div style="padding:9px">${seed?esc(seed.Status):'NEW ENTRY'} · ${esc(state.boot.currentUser?.displayName||state.boot.userId)}${state.boot.currentUser?.designation?' · '+esc(state.boot.currentUser.designation):''}</div></div></div>
      ${daily?dailyForm(n):simpleForm(type,n)}
      <div class="sticky-actions"><button class="btn" onclick="saveCurrent(false)">Save draft</button><button class="btn primary" onclick="saveCurrent(true)">Sign & save</button></div>
    </div>`;
}
function dailyForm(n){return `<h3 class="system-title">Clinical summary</h3><div class="form-grid">
  ${ta('hopi','HOPI / Clinical Summary',n.HOPI,true)}${ta('problems','Problems / Issues',n.Problems,true)}
  </div><h3 class="system-title">Review by system</h3><div class="form-grid">
  ${ta('cns','CNS',n.CNS)}${ta('cvs','CVS',n.CVS)}${ta('respiratory','Respiratory',n.Respiratory)}${ta('git','GIT / Nutrition',n.GIT)}${ta('renal','Renal / Fluid',n.Renal)}${ta('haematology','Haematology / Blood Ix',n.Haematology)}${ta('infection','Infection / Infective Parameters',n.Infection)}${ta('indwellingCatheters','Indwelling Catheters / Lines',n.Indwelling_Catheters)}${ta('otherInvestigations','Other Investigations',n.Other_Investigations,true)}
  </div><h3 class="system-title">Assessment and plan</h3><div class="form-grid">${ta('assessment','Assessment',n.Assessment,true)}${ta('plan','Plan',n.Plan,true)}</div>`}
function simpleForm(type,n){return `<div class="form-grid" style="margin-top:12px">${type==='Procedure'?`<div class="field full"><label>Procedure</label><input id="procedureName" value="${esc(n.Procedure_Name||'')}"></div>`:''}<div class="field full"><label>${type==='Family Discussion'?'Family / persons present / reason':'Title / reason'}</label><input id="simpleTitle" value="${esc(n.Simple_Title||'')}"></div><div class="field full"><label>${esc(type)} entry</label><textarea class="tall" id="simpleEntry">${esc(n.Simple_Entry||'')}</textarea></div></div>`}
function ta(id,label,val,tall=false){return `<div class="field ${tall?'full':''}"><label>${esc(label)}</label><textarea class="${tall?'tall':''}" id="${id}">${esc(val||'')}</textarea></div>`}
function toLocalInput(s){const d=new Date(s);if(isNaN(d))return todayLocal();d.setMinutes(d.getMinutes()-d.getTimezoneOffset());return d.toISOString().slice(0,16)}
function val(id){return document.getElementById(id)?.value||''}
function saveCurrent(sign){
  const type=document.querySelector('.review-header').textContent.split(' · ')[0];
  const p={noteId:state.currentNote?.Note_ID||'',admissionId:state.bundle.admission.Admission_ID,noteDateTime:val('noteDateTime'),entryType:type,sign,
    copiedFromNoteId:state.currentNote?.Copied_From_Note_ID||state.currentNote?.copiedFromNoteId||'',hopi:val('hopi'),problems:val('problems'),cns:val('cns'),cvs:val('cvs'),respiratory:val('respiratory'),git:val('git'),renal:val('renal'),haematology:val('haematology'),infection:val('infection'),indwellingCatheters:val('indwellingCatheters'),otherInvestigations:val('otherInvestigations'),assessment:val('assessment'),plan:val('plan'),simpleTitle:val('simpleTitle'),simpleEntry:val('simpleEntry'),procedureName:val('procedureName')};
  run('saveNote',p,n=>{toast(sign?'Note signed.':'Draft saved.');run('getPatientBundle',state.bundle.admission.Admission_ID,b=>{state.bundle=b;renderPatient()})})
}

function copyPreviousDaily(){run('getPreviousDailyReview',state.bundle.admission.Admission_ID,n=>{if(!n)return toast('No previous Daily Review found.',true);const map=[['hopi','HOPI / Clinical summary',true],['problems','Problems / Issues',true],['cns','CNS',true],['cvs','CVS',true],['respiratory','Respiratory',true],['git','GIT / Nutrition',true],['renal','Renal / Fluid',true],['haematology','Haematology',true],['infection','Infection',true],['indwellingCatheters','Indwelling Catheters / Lines',true],['otherInvestigations','Other Investigations',false],['assessment','Assessment',false],['plan','Plan',false]];modal('Copy from previous Daily Review',`<div class="danger-note">Source: ${fmtDate(n.Note_DateTime)}. Review every copied section before signing. Numerical results and today\'s plan should be updated rather than carried forward unchanged.</div><div class="checkgrid" style="margin-top:12px">${map.map(x=>`<label class="check"><input type="checkbox" data-copy="${x[0]}" ${x[2]?'checked':''}> ${x[1]}</label>`).join('')}</div>`,`<button class="btn" onclick="closeModal()">Cancel</button><button class="btn primary" onclick='applyCopy(${JSON.stringify(n).replace(/'/g,"&#39;")})'>Copy selected</button>`,true)})}
function applyCopy(n){document.querySelectorAll('[data-copy]:checked').forEach(ch=>{const id=ch.dataset.copy,key={hopi:'HOPI',problems:'Problems',cns:'CNS',cvs:'CVS',respiratory:'Respiratory',git:'GIT',renal:'Renal',haematology:'Haematology',infection:'Infection',indwellingCatheters:'Indwelling_Catheters',otherInvestigations:'Other_Investigations',assessment:'Assessment',plan:'Plan'}[id];const el=document.getElementById(id);if(el)el.value=n[key]||''});state.currentNote=state.currentNote||{};state.currentNote.copiedFromNoteId=n.Note_ID;closeModal();toast('Selected sections copied. Review and update before signing.')}

function viewNote(noteId){run('getNoteForPrint',noteId,b=>{const n=b.note,p=b.patient,a=b.admission,adds=b.addenda||[];const sections=n.Entry_Type==='Daily Review'?[['HOPI / Clinical Summary',n.HOPI],['Problems / Issues',n.Problems],['CNS',n.CNS],['CVS',n.CVS],['Respiratory',n.Respiratory],['GIT / Nutrition',n.GIT],['Renal / Fluid',n.Renal],['Haematology / Blood Ix',n.Haematology],['Infection',n.Infection],['Indwelling Catheters / Lines',n.Indwelling_Catheters],['Other Investigations',n.Other_Investigations],['Assessment',n.Assessment],['Plan',n.Plan]]:[[n.Procedure_Name?'Procedure':'Title / Reason',n.Procedure_Name||n.Simple_Title],[n.Entry_Type,n.Simple_Entry]];const addHtml=adds.length?`<div style="margin-top:14px"><b>ADDENDA</b>${adds.map(x=>`<div style="margin-top:8px;padding:8px;border-left:3px solid #cad9e8"><div class="meta">${fmtDate(x.Addendum_DateTime)} · ${esc(x.Author_Name||x.Author_UserID)}${x.Author_Designation?' · '+esc(x.Author_Designation):''}</div><div style="white-space:pre-wrap">${esc(x.Addendum_Text)}</div></div>`).join('')}</div>`:'';modal(`${esc(n.Entry_Type)} · ${esc(p.Name)} · RN ${esc(p.RN)}`,`<div class="meta">${fmtDate(n.Note_DateTime)} · ${esc(n.Status)} · ${esc(n.Author_UserID)}</div>${sections.filter(x=>x[0]&&x[1]).map(x=>`<div style="margin-top:12px"><b>${esc(x[0])}</b><div style="white-space:pre-wrap;margin-top:3px">${esc(x[1])}</div></div>`).join('')}${addHtml}`,`<button class="btn" onclick="openExport('${n.Note_ID}')">Export</button><button class="btn primary" onclick="printSavedNote('${n.Note_ID}')">Print / Save PDF</button>${n.Status==='SIGNED'?`<button class="btn" onclick="startAddendum('${n.Note_ID}')">Add addendum</button>`:''}`,true)})}
function startAddendum(noteId){modal('Add addendum',`<div class="danger-note">The original signed note remains unchanged. This addendum is stored separately with your User ID and timestamp.</div><div class="field" style="margin-top:12px"><label>Addendum</label><textarea class="tall" id="addText"></textarea></div>`,`<button class="btn" onclick="closeModal()">Cancel</button><button class="btn primary" onclick="submitAddendum('${noteId}')">Save addendum</button>`)}
function submitAddendum(noteId){run('addNoteAddendum',{noteId,text:val('addText')},b=>{state.bundle=b;closeModal();toast('Addendum saved.');renderPatient()})}
function openExport(noteId){modal('Export clinical note',`<label class="check"><input type="checkbox" id="showUserIdExport"> Show User ID (${esc(state.boot.userId)}) on exported document</label><div class="danger-note" style="margin-top:12px">Google Doc, DOCX and PDF files are created in your My Drive unless the administrator has configured a shared export folder.</div>`,`<button class="btn" onclick="doExport('${noteId}','GOOGLE_DOC')">Google Doc</button><button class="btn" onclick="doExport('${noteId}','DOCX')">DOCX</button><button class="btn primary" onclick="doExport('${noteId}','PDF')">PDF</button>`)}
function doExport(noteId,format){const showUserId=document.getElementById('showUserIdExport')?.checked||false;run('exportNote',{noteId,format,showUserId},r=>{closeModal();toast(format+' created.');window.open(r.url,'_blank')})}
function printSavedNote(noteId){run('getNoteForPrint',noteId,b=>{const n=b.note,p=b.patient,a=b.admission;modal('Print options',`<label class="check"><input type="checkbox" id="showUserIdPrint"> Show User ID (${esc(n.Author_UserID)}) on printed note</label>`,`<button class="btn" onclick="closeModal()">Cancel</button><button class="btn primary" onclick='renderPrint(${JSON.stringify(b).replace(/'/g,"&#39;")})'>Print / Save PDF</button>`)} )}
function renderPrint(b){const show=document.getElementById('showUserIdPrint')?.checked||false;closeModal();const n=b.note,p=b.patient,a=b.admission;let sections=n.Entry_Type==='Daily Review'?[['HOPI / CLINICAL SUMMARY',n.HOPI],['PROBLEMS / ISSUES',n.Problems],['CNS',n.CNS],['CVS',n.CVS],['RESPIRATORY',n.Respiratory],['GIT / NUTRITION',n.GIT],['RENAL / FLUID',n.Renal],['HAEMATOLOGY / BLOOD IX',n.Haematology],['INFECTION',n.Infection],['INDWELLING CATHETERS / LINES',n.Indwelling_Catheters],['OTHER INVESTIGATIONS',n.Other_Investigations],['ASSESSMENT',n.Assessment],['PLAN',n.Plan]]:[[n.Procedure_Name?'PROCEDURE':'TITLE / REASON',n.Procedure_Name||n.Simple_Title],[n.Entry_Type.toUpperCase(),n.Simple_Entry]];const adds=b.addenda||[];document.getElementById('printRoot').innerHTML=`<div class="print-note"><h1>ICU CLINICAL NOTE</h1><div class="print-head"><div><b>NAME:</b> ${esc(p.Name)}</div><div><b>RN:</b> ${esc(p.RN)}</div><div><b>AGE:</b> ${esc(p.Age||'-')}</div><div><b>AREA/BED:</b> ${esc(a.Area)} / ${esc(a.Ward_Bed||'-')}</div><div><b>DATE/TIME:</b> ${fmtDate(n.Note_DateTime)}</div><div><b>ENTRY:</b> ${esc(n.Entry_Type)}</div></div>${sections.filter(x=>x[0]&&x[1]).map(x=>`<section class="print-section"><h4>${esc(x[0])}</h4><pre>${esc(x[1])}</pre></section>`).join('')}${adds.length?`<section class="print-section"><h4>ADDENDA</h4>${adds.map(x=>`<pre><b>${fmtDate(x.Addendum_DateTime)} · ${esc(x.Author_Name||x.Author_UserID)}</b>
${esc(x.Addendum_Text)}</pre>`).join('')}</section>`:''}<div class="print-sign"><b>${esc(n.Author_Name||n.Author_UserID)}${n.Author_Designation?' · '+esc(n.Author_Designation):''}</b><br>Recorded: ${fmtDate(n.Note_DateTime)} · ${esc(n.Status)}<div class="print-userid ${show?'':'hide'}">User ID: ${esc(n.Author_UserID)}</div><br>Signature: _________________________________</div></div>`;setTimeout(()=>window.print(),80)}

function openAddPatient(){
  const opts=state.boot.areas.map(a=>`<option>${esc(a)}</option>`).join('');
  modal('New ICU / critical-area patient',`
    <div class="ocr-toolbar"><span class="ocr-chip">OCR assist</span><span class="meta">Photograph a clerking sheet, referral, patient sticker or previous note and review the extracted text before applying it.</span><button class="btn small" onclick="openOcrAssist('PATIENT_DETAILS')">📷 OCR patient details / HOPI</button></div>
    <div class="form-grid">
      <div class="field"><label>Name *</label><input id="apName"></div>
      <div class="field"><label>RN *</label><input id="apRN"></div>
      <div class="field"><label>Age</label><input id="apAge"></div>
      <div class="field"><label>DOB</label><input id="apDOB" type="date"></div>
      <div class="field"><label>Sex</label><select id="apSex"><option value=""></option><option>Male</option><option>Female</option><option>Other</option></select></div>
      <div class="field"><label>Weight (kg)</label><input id="apWeight" type="number" step="0.1"></div>
      <div class="field"><label>Height (cm)</label><input id="apHeight" type="number" step="0.1"></div>
      <div class="field"><label>Allergies</label><input id="apAllergy"></div>
      <div class="field full"><label>Comorbidities</label><textarea id="apComorb"></textarea></div>
      <div class="field full"><label>Short presenting history (handover / summary cards)</label><textarea id="apHopi" class="tall"></textarea></div>
      <div class="field full"><label>Admission HOPI / clerking</label><textarea id="apAdmissionHopi" class="tall"></textarea></div>
      <div class="field full"><label>Relevant PMH</label><textarea id="apPMH"></textarea></div>
      <div class="field full"><label>Drug history</label><textarea id="apDrug"></textarea></div>
      <div class="field full"><label>Baseline functional status</label><textarea id="apBaseline"></textarea></div>
      <div class="field"><label>Critical area *</label><select id="apArea">${opts}</select></div>
      <div class="field"><label>Ward name</label><input id="apWard" placeholder="Required for Peripheral Ward"></div>
      <div class="field"><label>Bed</label><input id="apBed" placeholder="e.g. 4 / B12"></div>
      <div class="field"><label>Admission date/time</label><input id="apAdm" type="datetime-local" value="${todayLocal()}"></div>
      <div class="field"><label>Source</label><input id="apSource" placeholder="ED / OT / Ward / Other ICU"></div>
      <div class="field"><label>Primary team</label><input id="apTeam"></div>
      <div class="field full"><label>Primary diagnosis</label><input id="apDx"></div>
    </div>`,
    `<button class="btn" onclick="closeModal()">Cancel</button><button class="btn primary" onclick="submitAddPatient()">Create patient/admission</button>`,true)
}
function submitAddPatient(){
  const p={name:val('apName'),rn:val('apRN'),age:val('apAge'),dob:val('apDOB'),sex:val('apSex'),weightKg:val('apWeight'),heightCm:val('apHeight'),allergies:val('apAllergy'),comorbidities:val('apComorb'),shortHopi:val('apHopi'),admissionHopi:val('apAdmissionHopi'),relevantPmh:val('apPMH'),drugHistory:val('apDrug'),baselineFunction:val('apBaseline'),area:val('apArea'),wardName:val('apWard'),bed:val('apBed'),admissionDateTime:val('apAdm'),source:val('apSource'),primaryTeam:val('apTeam'),primaryDiagnosis:val('apDx')};
  run('addPatientAndAdmission',p,b=>{closeModal();toast('Patient/admission created.');state.bundle=b;refreshDashboard(()=>{renderPatient()})})
}

function doSearch(){const q=val('searchInput').trim();if(!q)return;run('searchPatients',q,rows=>{modal('Patient search',rows.length?rows.map(x=>{const p=x.patient,a=x.activeAdmission||x.latestAdmission;return `<div class="note-row"><div><b>${esc(p.Name)}</b><div class="meta">RN ${esc(p.RN)}</div></div><div class="meta">${a?esc(a.Status)+' · '+esc(a.Area||'')+' '+esc(a.Ward_Bed||''):'No admission'}</div><div>${x.activeAdmission?`<button class="btn small" onclick="closeModal();openPatient('${x.activeAdmission.Admission_ID}')">Open</button>`:`<button class="btn small" onclick="openReadmit('${p.Patient_ID}')">Readmit</button>`}</div></div>`}).join(''):'<div class="empty">No matching patient.</div>', '', true)})}
function openReadmit(patientId,name='patient'){
  const opts=state.boot.areas.map(a=>`<option>${esc(a)}</option>`).join('');
  modal('Readmit '+esc(name),`<div class="form-grid">
    <div class="field"><label>Critical area</label><select id="raArea">${opts}</select></div>
    <div class="field"><label>Ward name</label><input id="raWard" placeholder="Required for Peripheral Ward"></div>
    <div class="field"><label>Bed</label><input id="raBed"></div>
    <div class="field"><label>Admission date/time</label><input id="raAdm" type="datetime-local" value="${todayLocal()}"></div>
    <div class="field"><label>Source</label><input id="raSource"></div>
    <div class="field"><label>Primary team</label><input id="raTeam"></div>
    <div class="field full"><label>Primary diagnosis</label><input id="raDx"></div>
    <div class="field full"><label>Short presenting history for this admission</label><textarea id="raHopi"></textarea></div></div>`,
    `<button class="btn" onclick="closeModal()">Cancel</button><button class="btn primary" onclick="submitReadmit('${patientId}')">Create new admission</button>`)
}
function submitReadmit(patientId){
  run('readmitPatient',{patientId,area:val('raArea'),wardName:val('raWard'),bed:val('raBed'),admissionDateTime:val('raAdm'),source:val('raSource'),primaryTeam:val('raTeam'),primaryDiagnosis:val('raDx'),shortHopi:val('raHopi')},b=>{closeModal();toast('Readmission created.');state.bundle=b;refreshDashboard(()=>renderPatient())})
}

function openMovePatient(){
  const a=state.bundle.admission;
  const opts=state.boot.areas.map(x=>`<option ${x===a.Area?'selected':''}>${esc(x)}</option>`).join('');
  modal('Change critical area / ward / bed',`<div class="form-grid">
    <div class="field"><label>Critical area</label><select id="mvArea">${opts}</select></div>
    <div class="field"><label>Ward name</label><input id="mvWard" value="${esc(a.Ward_Name||'')}"></div>
    <div class="field"><label>Bed</label><input id="mvBed" value="${esc(a.Bed||'')}"></div>
    <div class="field"><label>Date / time</label><input id="mvTime" type="datetime-local" value="${todayLocal()}"></div>
    <div class="field full"><label>Reason / transfer note</label><input id="mvReason"></div></div>`,
    `<button class="btn" onclick="closeModal()">Cancel</button><button class="btn primary" onclick="submitMove()">Update</button>`)
}
function submitMove(){
  run('updateAdmissionLocation',{admissionId:state.bundle.admission.Admission_ID,area:val('mvArea'),wardName:val('mvWard'),bed:val('mvBed'),changeDateTime:val('mvTime'),reason:val('mvReason')},b=>{closeModal();state.bundle=b;toast('Location updated.');refreshDashboard(()=>renderPatient())})
}
function openDischarge(){modal('Discharge / remove from active list',`<div class="danger-note">The patient will be removed from the active dashboard. All patient, admission and clinical-note data will remain in the Google Sheet and can be found for future readmission.</div><div class="form-grid" style="margin-top:12px"><div class="field"><label>Discharge date/time</label><input id="dcTime" type="datetime-local" value="${todayLocal()}"></div><div class="field"><label>Outcome / destination</label><input id="dcOutcome" placeholder="Ward / other ICU / home / deceased"></div><div class="field full"><label>Optional transfer / discharge clinical note</label><textarea id="dcNote"></textarea></div></div>`,`<button class="btn" onclick="closeModal()">Cancel</button><button class="btn danger" onclick="submitDischarge()">Confirm discharge</button>`)}
function submitDischarge(){run('dischargeAdmission',{admissionId:state.bundle.admission.Admission_ID,dischargeDateTime:val('dcTime'),outcome:val('dcOutcome'),dischargeNote:val('dcNote')},()=>{closeModal();toast('Patient discharged from active list.');goDashboard()})}

function openAreaHandover(){const defaultArea=state.area==='ALL'?(state.boot.areas[0]||''):state.area;const opts=state.boot.areas.map(a=>`<option ${a===defaultArea?'selected':''}>${esc(a)}</option>`).join('');modal('ICU / critical-area handover list',`<div class="form-grid"><div class="field"><label>Critical area</label><select id="hoArea" onchange="renderHandoverPatients()">${opts}</select></div><div class="field"><label>Output</label><div style="padding:9px">Landscape A4 patient summary table</div></div></div><div id="hoPatients" style="margin-top:12px"></div>`,`<button class="btn" onclick="genHandover('GOOGLE_DOC')">Google Doc</button><button class="btn" onclick="genHandover('DOCX')">DOCX</button><button class="btn primary" onclick="genHandover('PDF')">PDF</button>`,true);setTimeout(renderHandoverPatients,0)}
function renderHandoverPatients(){const area=val('hoArea');const list=state.active.filter(x=>x.admission.Area===area);document.getElementById('hoPatients').innerHTML=list.length?`<label class="check"><input type="checkbox" checked onchange="document.querySelectorAll('[data-ho]').forEach(x=>x.checked=this.checked)"><b>Select all ${list.length}</b></label><div class="checkgrid" style="margin-top:8px">${list.map(x=>`<label class="check"><input type="checkbox" data-ho value="${x.admission.Admission_ID}" checked><span><b>${esc(x.patient.Name)}</b><br><span class="meta">RN ${esc(x.patient.RN)} · ${esc(x.admission.Ward_Bed||'')}</span></span></label>`).join('')}</div>`:'<div class="empty">No active patients in this area.</div>'}
function genHandover(format){const area=val('hoArea');const ids=[...document.querySelectorAll('[data-ho]:checked')].map(x=>x.value);if(!ids.length)return toast('Select at least one patient.',true);run('generateAreaHandover',{area,admissionIds:ids,format},r=>{closeModal();toast(`${r.count} patient(s) included.`);window.open(r.url,'_blank')})}

function openSummaryCards(){const defaultArea=state.area==='ALL'?(state.boot.areas[0]||''):state.area;const opts=state.boot.areas.map(a=>`<option ${a===defaultArea?'selected':''}>${esc(a)}</option>`).join('');modal('ICU / critical-area summary cards',`<div class="form-grid"><div class="field"><label>Critical area</label><select id="cardArea" onchange="renderCardPatients()">${opts}</select></div><div class="field"><label>Card size</label><div style="padding:9px">10 cm × 6 cm · up to 8 cards per A4 page</div></div></div><div id="cardPatients" style="margin-top:12px"></div>`,`<button class="btn" onclick="genCards('GOOGLE_DOC')">Google Doc</button><button class="btn" onclick="genCards('DOCX')">DOCX</button><button class="btn primary" onclick="genCards('PDF')">PDF</button>`,true);setTimeout(renderCardPatients,0)}
function renderCardPatients(){const area=val('cardArea');const list=state.active.filter(x=>x.admission.Area===area);document.getElementById('cardPatients').innerHTML=list.length?`<label class="check"><input type="checkbox" id="cardAll" checked onchange="document.querySelectorAll('[data-card]').forEach(x=>x.checked=this.checked)"><b>Select all ${list.length}</b></label><div class="checkgrid" style="margin-top:8px">${list.map(x=>`<label class="check"><input type="checkbox" data-card value="${x.admission.Admission_ID}" checked><span><b>${esc(x.patient.Name)}</b><br><span class="meta">RN ${esc(x.patient.RN)} · ${esc(x.admission.Ward_Bed||'')}</span></span></label>`).join('')}</div>`:'<div class="empty">No active patients in this area.</div>'}
function genCards(format){const area=val('cardArea');const ids=[...document.querySelectorAll('[data-card]:checked')].map(x=>x.value);if(!ids.length)return toast('Select at least one patient.',true);run('generateAreaSummaryCards',{area,admissionIds:ids,format},r=>{closeModal();toast(`${r.count} summary card(s) created.`);window.open(r.url,'_blank')})}