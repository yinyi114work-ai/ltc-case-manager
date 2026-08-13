(() => {
  'use strict';

  const DB_NAME = 'LongcareNotesCaseManagerDB';
  const DB_VERSION = 1;
  const STORE = 'workspace';
  const STATE_KEY = 'main';
  const DISCLAIMER_KEY = 'longcareNotes.caseDashboard.disclaimer.v1';
  const pad = n => String(n).padStart(2, '0');
  const now = new Date();
  const todayISO = `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}`;
  const currentMonth = todayISO.slice(0, 7);

  let state = defaultState();
  let db = null;
  let selectedMonth = currentMonth;
  let visitFilter = 'all';

  // GA4 only receives anonymous feature-use events. No case names, notes or visit content.
  function cmTrack(name, params={}){
    try{
      if(typeof gtag==='function') gtag('event', name, Object.assign({feature_area:'casework'}, params));
    }catch(e){}
  }

  function defaultState(){
    return {version:2,cases:[],visits:[],todos:[],homeVisits:[],settings:{notificationEnabled:false}};
  }
  function uid(prefix){return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2,9)}`;}
  function esc(v=''){return String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));}
  function monthLabel(m){if(!m)return '';const [y,mo]=m.split('-').map(Number);return `${y-1911}年${mo}月`;}
  function addMonths(m,n){if(!m)return '';const [y,mo]=m.split('-').map(Number);const d=new Date(y,mo-1+n,1);return `${d.getFullYear()}-${pad(d.getMonth()+1)}`;}
  function monthStart(m){return `${m}-01`;}
  function monthEnd(m){const [y,mo]=m.split('-').map(Number);return `${y}-${pad(mo)}-${pad(new Date(y,mo,0).getDate())}`;}
  function inMonth(date,m){return !!date && date.slice(0,7)===m;}
  function caseActiveDuringMonth(c,m){const start=monthStart(m),end=monthEnd(m);return c.openDate<=end && (!c.closedDate || c.closedDate>=start);}
  function caseActiveAtEnd(c,m){return c.openDate<=monthEnd(m) && (!c.closedDate || c.closedDate>monthEnd(m));}
  function activeNow(c){return c.status!=='closed';}
  function getVisit(caseId,m){return state.visits.find(v=>v.caseId===caseId&&v.month===m)||null;}
  function visitsForCase(caseId){return state.visits.filter(v=>v.caseId===caseId);}
  function homeVisitsForDate(date){return (state.homeVisits||[]).filter(v=>v.date===date);}
  function isHomeDue(c,m){return caseActiveDuringMonth(c,m)&&expectedType(c,m)==='home';}
  function activeCasesSortedForVisit(){return state.cases.filter(c=>c.status==='active').sort((a,b)=>(isHomeDue(a,selectedMonth)?0:1)-(isHomeDue(b,selectedMonth)?0:1)||a.name.localeCompare(b.name,'zh-Hant'));}
  function latestHomeMonth(c, throughMonth='9999-12'){
    const months=[];
    if(c.prevHomeMonth && c.prevHomeMonth<=throughMonth) months.push(c.prevHomeMonth);
    visitsForCase(c.id).filter(v=>v.type==='home'&&v.done&&v.month<=throughMonth).forEach(v=>months.push(v.month));
    return months.sort().pop()||'';
  }
  function nextHomeMonth(c, beforeMonth=null){
    let through='9999-12';
    if(beforeMonth) through=addMonths(beforeMonth,-1);
    const last=latestHomeMonth(c,through);
    return last?addMonths(last,6):c.openDate?.slice(0,7)||'';
  }
  function expectedVisitType(c,m){
    const existing=getVisit(c.id,m);
    if(existing?.done) return existing.type;
    const due=nextHomeMonth(c,m);
    return due && m>=due ? 'home':'phone';
  }
  function completion(c,m){const v=getVisit(c.id,m);return !!(v&&v.done);}

  function openDB(){
    return new Promise((resolve,reject)=>{
      const req=indexedDB.open(DB_NAME,DB_VERSION);
      req.onupgradeneeded=()=>{const d=req.result;if(!d.objectStoreNames.contains(STORE))d.createObjectStore(STORE);};
      req.onsuccess=()=>{db=req.result;resolve(db)};
      req.onerror=()=>reject(req.error);
    });
  }
  function dbGet(){return new Promise((resolve,reject)=>{const tx=db.transaction(STORE,'readonly');const r=tx.objectStore(STORE).get(STATE_KEY);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}
  function dbPut(){return new Promise((resolve,reject)=>{const tx=db.transaction(STORE,'readwrite');tx.objectStore(STORE).put(state,STATE_KEY);tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);});}
  async function save(){await dbPut();renderAll();}

  function showDisclaimer(){
    if(localStorage.getItem(DISCLAIMER_KEY)==='accepted')return;
    document.getElementById('cmDisclaimer')?.classList.add('show');
  }
  function hideDisclaimer(){document.getElementById('cmDisclaimer')?.classList.remove('show');}

  function renderStats(){
    const active=state.cases.filter(activeNow).length;
    const opens=state.cases.filter(c=>inMonth(c.openDate,selectedMonth)).length;
    const closes=state.cases.filter(c=>inMonth(c.closedDate,selectedMonth)).length;
    const monthCases=state.cases.filter(c=>caseActiveDuringMonth(c,selectedMonth));
    const done=monthCases.filter(c=>completion(c,selectedMonth)).length;
    const pending=monthCases.length-done;
    const homeDue=monthCases.filter(c=>expectedVisitType(c,selectedMonth)==='home').length;
    document.getElementById('cmStats').innerHTML=`
      <div class="cm-stat"><span>目前在案</span><b>${active}</b><small>案</small></div>
      <div class="cm-stat"><span>${monthLabel(selectedMonth)}新案</span><b>${opens}</b><small>結案 ${closes}｜淨 ${opens-closes>=0?'+':''}${opens-closes}</small></div>
      <div class="cm-stat"><span>本月應家訪</span><b>${homeDue}</b><small>應電訪 ${monthCases.length-homeDue}</small></div>
      <div class="cm-stat ${pending?'attention':''}"><span>尚未完成</span><b>${pending}</b><small>已完成 ${done}｜${monthCases.length?Math.round(done/monthCases.length*100):0}%</small></div>`;
  }

  function renderCaseList(){
    const el=document.getElementById('cmCaseList');
    const q=(document.getElementById('cmCaseSearch')?.value||'').trim().toLowerCase();
    const showClosed=document.getElementById('cmShowClosed')?.checked;
    let list=state.cases.filter(c=>(showClosed||activeNow(c))&&(!q||c.name.toLowerCase().includes(q)));
    // 個案名單排序：本月應家訪且尚未完成 → 其他尚未完成 → 已完成 → 已結案。
    // 「本月應訪」在這裡專指依家訪週期，本月應安排家訪的個案。
    const rankCase=c=>{
      if(!caseActiveDuringMonth(c,selectedMonth)) return activeNow(c)?3:4;
      const done=completion(c,selectedMonth);
      const homeDue=expectedVisitType(c,selectedMonth)==='home';
      if(homeDue&&!done) return 0;
      if(!done) return 1;
      return 2;
    };
    list.sort((a,b)=>rankCase(a)-rankCase(b)||a.name.localeCompare(b.name,'zh-Hant'));
    if(!list.length){el.innerHTML='<div class="cm-empty">尚無符合的個案。</div>';return;}
    el.innerHTML=`<div class="cm-table-wrap"><table class="cm-table"><thead><tr><th>個案名</th><th>開案日</th><th>前次家訪</th><th>下次應家訪</th><th>狀態</th><th>操作</th></tr></thead><tbody>${list.map(c=>{
      const last=latestHomeMonth(c);
      const next=last?addMonths(last,6):(c.openDate?.slice(0,7)||'');
      const activeInMonth=caseActiveDuringMonth(c,selectedMonth);
      const homeDue=activeInMonth&&expectedVisitType(c,selectedMonth)==='home';
      const done=activeInMonth&&completion(c,selectedMonth);
      const dueBadge=homeDue?` <span class="cm-badge home">本月應訪${done?'・已完成':''}</span>`:'';
      return `<tr data-case="${c.id}" class="${activeNow(c)?'':'cm-closed'}"><td><strong>${esc(c.name)}</strong>${dueBadge}</td><td>${esc(c.openDate)}</td><td>${last?monthLabel(last):'—'}</td><td>${next?monthLabel(next):'—'}</td><td>${activeNow(c)?'<span class="cm-badge active">在案</span>':`<span class="cm-badge closed">已結案</span><div class="cm-small">${esc(c.closedDate||'')}</div>`}</td><td class="cm-actions">${activeNow(c)?`<button class="secondary cm-small-btn" data-action="closeCase">結案</button>`:`<button class="secondary cm-small-btn" data-action="restoreCase">恢復在案</button>`}<button class="cm-link danger" data-action="deleteCase">刪除</button></td></tr>`;
    }).join('')}</tbody></table></div>`;
  }

  function renderVisits(){
    const cases=state.cases.filter(c=>caseActiveDuringMonth(c,selectedMonth));
    const rows=cases.map(c=>{
      const v=getVisit(c.id,selectedMonth);
      const expected=expectedVisitType(c,selectedMonth);
      const done=!!v?.done;
      return {c,v,expected,done};
    }).filter(x=>visitFilter==='all'||(visitFilter==='pending'&&!x.done)||(visitFilter==='home'&&x.expected==='home')||(visitFilter==='phone'&&x.expected==='phone')||(visitFilter==='done'&&x.done))
      .sort((a,b)=>{
        // 本月應家訪且未完成最優先，其次其他未完成；已完成自動往後。
        const rank=x=>!x.done&&x.expected==='home'?0:!x.done?1:2;
        return rank(a)-rank(b)||a.c.name.localeCompare(b.c.name,'zh-Hant');
      });
    const total=cases.length,doneCount=cases.filter(c=>completion(c,selectedMonth)).length;
    document.getElementById('cmVisitSummary').innerHTML=`<b>${monthLabel(selectedMonth)}</b>　應訪 <strong>${total}</strong>　已完成 <strong>${doneCount}</strong>　未完成 <strong class="${total-doneCount?'cm-warn-text':''}">${total-doneCount}</strong>　完成率 <strong>${total?Math.round(doneCount/total*100):0}%</strong>`;
    const el=document.getElementById('cmVisitTable');
    if(!rows.length){el.innerHTML='<div class="cm-empty">這個篩選條件下沒有個案。</div>';return;}
    el.innerHTML=`<div class="cm-table-wrap"><table class="cm-table cm-visit-table"><thead><tr><th>個案名</th><th>本月應訪</th><th>家訪</th><th>電訪</th><th>前次家訪</th><th>下次應家訪</th></tr></thead><tbody>${rows.map(({c,v,expected})=>{
      const lastBefore=latestHomeMonth(c,addMonths(selectedMonth,-1));
      const next=nextHomeMonth(c,selectedMonth);
      return `<tr data-case="${c.id}"><td><strong>${esc(c.name)}</strong>${c.status==='closed'?'<div class="cm-small">本月後已結案</div>':''}</td><td><span class="cm-badge ${expected}">${expected==='home'?'應家訪':'應電訪'}</span></td><td class="cm-check-cell"><label class="cm-check-label"><input type="checkbox" data-visit="home" ${v?.done&&v.type==='home'?'checked':''}><span>✓</span></label></td><td class="cm-check-cell"><label class="cm-check-label"><input type="checkbox" data-visit="phone" ${v?.done&&v.type==='phone'?'checked':''}><span>✓</span></label></td><td>${lastBefore?monthLabel(lastBefore):'—'}</td><td>${next?monthLabel(next):'—'}</td></tr>`;
    }).join('')}</tbody></table></div>`;
  }

  function renderTodos(){
    const el=document.getElementById('cmTodoList');
    const list=state.todos.filter(t=>t.date.slice(0,7)===selectedMonth).sort((a,b)=>Number(a.done)-Number(b.done)||a.date.localeCompare(b.date));
    if(!list.length){el.innerHTML='<div class="cm-empty">這個月還沒有待辦事項。</div>';return;}
    const p={high:'重要',normal:'一般',low:'稍後'};
    el.innerHTML=list.map(t=>`<div class="cm-todo ${t.done?'done':''}" data-todo="${t.id}"><label class="cm-todo-check"><input type="checkbox" data-action="toggleTodo" ${t.done?'checked':''}><span></span></label><div class="cm-todo-main"><strong>${esc(t.title)}</strong><div class="cm-small">${esc(t.date)}　<span class="cm-priority ${t.priority}">${p[t.priority]||'一般'}</span>${t.note?`　${esc(t.note)}`:''}</div></div><button class="cm-link danger" data-action="deleteTodo">刪除</button></div>`).join('');
  }

  function calendarCells(m){const [y,mo]=m.split('-').map(Number);const first=new Date(y,mo-1,1);const start=new Date(first);start.setDate(1-first.getDay());return Array.from({length:42},(_,i)=>{const d=new Date(start);d.setDate(start.getDate()+i);return d;});}
  function dateISO(d){return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;}
  function renderCalendar(){
    const heads=['日','一','二','三','四','五','六'].map(x=>`<div class="cm-cal-head">${x}</div>`).join('');
    const cells=calendarCells(selectedMonth).map(d=>{
      const iso=dateISO(d),same=iso.slice(0,7)===selectedMonth;
      const todos=state.todos.filter(t=>t.date===iso),homes=homeVisitsForDate(iso).sort((a,b)=>(a.time||'99:99').localeCompare(b.time||'99:99'));
      const events=[...homes.map(v=>{const c=state.cases.find(x=>x.id===v.caseId);return `<button type="button" class="cm-cal-event homevisit" data-homevisit="${v.id}">⌂ ${v.time?esc(v.time)+' ':''}${esc(c?.name||'個案')}｜家訪</button>`}),...todos.map(t=>`<div class="cm-cal-event ${t.done?'done':''}">${t.done?'✓':'•'} ${esc(t.title)}</div>`)];
      const ev=events.slice(0,4).join('');return `<div class="cm-cal-day ${same?'':'other'} ${iso===todayISO?'today':''}"><b>${d.getDate()}</b>${ev}${events.length>4?`<small>+${events.length-4}</small>`:''}</div>`;
    }).join('');
    document.getElementById('cmCalendar').innerHTML=`<div class="cm-calendar">${heads}${cells}</div>`;
  }

  function renderReminder(){
    const todayTodos=state.todos.filter(t=>!t.done&&t.date===todayISO);
    const overdue=state.todos.filter(t=>!t.done&&t.date<todayISO);
    const currentCases=state.cases.filter(c=>caseActiveDuringMonth(c,currentMonth));
    const visitPending=currentCases.filter(c=>!completion(c,currentMonth)).length;
    const todayHome=(state.homeVisits||[]).filter(v=>v.date===todayISO),overdueHome=(state.homeVisits||[]).filter(v=>v.date<todayISO&&!completion(state.cases.find(c=>c.id===v.caseId)||{},v.date.slice(0,7)));
    const parts=[];
    if(todayTodos.length)parts.push(`今天 ${todayTodos.length} 件待辦`);
    if(todayHome.length)parts.push(`今天 ${todayHome.length} 案家訪`);
    if(overdueHome.length)parts.push(`家訪逾期未完成 ${overdueHome.length} 案`);
    if(overdue.length)parts.push(`逾期 ${overdue.length} 件`);
    if(visitPending)parts.push(`本月尚有 ${visitPending} 案未訪`);
    const el=document.getElementById('cmReminder');
    if(parts.length){el.innerHTML=`<strong>今日提醒：</strong>${parts.join('｜')}`;el.classList.add('show');}else{el.classList.remove('show');}
  }

  function renderAll(){
    document.getElementById('cmMonth').value=selectedMonth;
    renderStats();renderCaseList();renderVisits();renderTodos();renderCalendar();renderReminder();
  }

  function downloadCaseTemplate(){
    if(typeof XLSX==='undefined')return alert('Excel 元件尚未載入，請重新整理後再試。');
    const ws=XLSX.utils.aoa_to_sheet([['個案姓名','開案日期','前次家訪月份'],['王小明','2026-08-01','2026-02']]);
    ws['!cols']=[{wch:18},{wch:16},{wch:18}];
    const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,ws,'個案名單');
    XLSX.writeFile(wb,'個管工作台_個案名單範本.xlsx');cmTrack('excel_template_downloaded');
  }
  function normalizeExcelDate(v,monthOnly=false){
    if(v===null||v===undefined||v==='')return '';
    if(v instanceof Date&&!isNaN(v))return monthOnly?`${v.getFullYear()}-${pad(v.getMonth()+1)}`:dateISO(v);
    if(typeof v==='number'&&typeof XLSX!=='undefined'){const p=XLSX.SSF.parse_date_code(v);if(p)return monthOnly?`${p.y}-${pad(p.m)}`:`${p.y}-${pad(p.m)}-${pad(p.d)}`;}
    const s=String(v).trim().replace(/[./]/g,'-'),m=s.match(/^(\d{4})-(\d{1,2})(?:-(\d{1,2}))?$/);if(!m)return '';
    return monthOnly?`${m[1]}-${pad(m[2])}`:`${m[1]}-${pad(m[2])}-${pad(m[3]||1)}`;
  }
  async function previewExcelImport(file){
    if(typeof XLSX==='undefined')return alert('Excel 元件尚未載入，請重新整理後再試。');
    try{
      const wb=XLSX.read(await file.arrayBuffer(),{type:'array',cellDates:true}),ws=wb.Sheets[wb.SheetNames[0]],rows=XLSX.utils.sheet_to_json(ws,{defval:''});
      const ok=[],errors=[],dupes=[];
      rows.forEach((r,i)=>{const name=String(r['個案姓名']||'').trim(),openDate=normalizeExcelDate(r['開案日期']),prevHomeMonth=normalizeExcelDate(r['前次家訪月份'],true);
        if(!name){errors.push(`第 ${i+2} 列：缺少個案姓名`);return}if(!openDate){errors.push(`第 ${i+2} 列：開案日期格式錯誤`);return}
        if(r['前次家訪月份']&&!prevHomeMonth){errors.push(`第 ${i+2} 列：前次家訪月份格式錯誤`);return}
        if(state.cases.some(c=>c.status==='active'&&c.name.trim()===name)){dupes.push(name);return}ok.push({name,openDate,prevHomeMonth});
      });
      window.cmPendingExcel=ok;
      document.getElementById('cmExcelPreview').innerHTML=`<div class="cm-import-summary"><strong>讀取 ${rows.length} 筆</strong><span>可匯入 ${ok.length} 筆</span><span>疑似重複 ${dupes.length} 筆</span><span>格式錯誤 ${errors.length} 筆</span></div>${dupes.length?`<div class="cm-small">疑似重複：${dupes.slice(0,8).map(esc).join('、')}</div>`:''}${errors.length?`<div class="cm-import-errors">${errors.slice(0,8).map(esc).join('<br>')}</div>`:''}<div class="cm-modal-actions"><button id="cmCancelExcel" class="secondary">取消</button><button id="cmConfirmExcel" class="primary" ${ok.length?'':'disabled'}>確認匯入 ${ok.length} 筆</button></div>`;
      document.getElementById('cmExcelModal').classList.add('show');document.getElementById('cmCancelExcel').onclick=()=>document.getElementById('cmExcelModal').classList.remove('show');document.getElementById('cmConfirmExcel').onclick=confirmExcelImport;
    }catch(e){alert('無法讀取 Excel。請使用工作台下載的範本，並確認檔案為 .xlsx 格式。');}
  }
  async function confirmExcelImport(){const items=window.cmPendingExcel||[];items.forEach(x=>state.cases.push({id:uid('case'),...x,status:'active',closedDate:'',closeReason:'',createdAt:new Date().toISOString()}));cmTrack('excel_cases_imported',{import_count:items.length});document.getElementById('cmExcelModal').classList.remove('show');document.getElementById('cmExcelFile').value='';await save();}
  function openHomeVisitForm(v=null){
    const sel=document.getElementById('cmHomeVisitCase'),cases=activeCasesSortedForVisit();sel.innerHTML=cases.map(c=>`<option value="${c.id}">${esc(c.name)}${isHomeDue(c,selectedMonth)?'｜本月應訪':''}</option>`).join('');
    document.getElementById('cmHomeVisitId').value=v?.id||'';if(v)sel.value=v.caseId;document.getElementById('cmHomeVisitDate').value=v?.date||todayISO;document.getElementById('cmHomeVisitTime').value=v?.time||'';document.getElementById('cmHomeVisitNote').value=v?.note||'';document.getElementById('cmHomeVisitDelete').style.display=v?'':'none';document.getElementById('cmHomeVisitModal').classList.add('show');
  }
  async function saveHomeVisit(){const id=document.getElementById('cmHomeVisitId').value,caseId=document.getElementById('cmHomeVisitCase').value,date=document.getElementById('cmHomeVisitDate').value,time=document.getElementById('cmHomeVisitTime').value,note=document.getElementById('cmHomeVisitNote').value.trim();if(!caseId||!date)return alert('請選擇個案與家訪日期。');if(id){const v=state.homeVisits.find(x=>x.id===id);if(v)Object.assign(v,{caseId,date,time,note});cmTrack('home_visit_schedule_edited')}else{state.homeVisits.push({id:uid('homevisit'),caseId,date,time,note,createdAt:new Date().toISOString()});cmTrack('home_visit_scheduled')}document.getElementById('cmHomeVisitModal').classList.remove('show');await save();}
  async function deleteHomeVisit(id){if(!confirm('確定取消這筆家訪安排嗎？'))return;state.homeVisits=state.homeVisits.filter(x=>x.id!==id);cmTrack('home_visit_schedule_cancelled');document.getElementById('cmHomeVisitModal').classList.remove('show');await save();}

  async function addCase(){
    const name=document.getElementById('cmCaseName').value.trim();
    const openDate=document.getElementById('cmOpenDate').value;
    const prevHomeMonth=document.getElementById('cmPrevHomeMonth').value;
    if(!name||!openDate)return alert('請至少填寫個案名與開案日期。');
    state.cases.push({id:uid('case'),name,openDate,prevHomeMonth,status:'active',closedDate:'',closeReason:'',createdAt:new Date().toISOString()});cmTrack('case_added');
    document.getElementById('cmCaseName').value='';document.getElementById('cmPrevHomeMonth').value='';
    await save();
  }
  async function closeCase(c){
    document.getElementById('cmCloseCaseName').textContent=c.name;
    document.getElementById('cmCloseDate').value=todayISO;
    document.getElementById('cmCloseReason').value='';
    document.getElementById('cmCloseConfirm').dataset.case=c.id;
    document.getElementById('cmCloseModal').classList.add('show');
  }
  async function confirmClose(){
    const id=document.getElementById('cmCloseConfirm').dataset.case;
    const c=state.cases.find(x=>x.id===id);if(!c)return;
    const date=document.getElementById('cmCloseDate').value;if(!date)return alert('請填寫結案日期。');
    c.status='closed';c.closedDate=date;c.closeReason=document.getElementById('cmCloseReason').value;cmTrack('case_closed');
    document.getElementById('cmCloseModal').classList.remove('show');await save();
  }
  async function setVisit(caseId,type,checked){
    state.visits=state.visits.filter(v=>!(v.caseId===caseId&&v.month===selectedMonth));
    if(checked){state.visits.push({id:uid('visit'),caseId,month:selectedMonth,type,done:true,updatedAt:new Date().toISOString()});cmTrack(type==='home'?'home_visit_completed':'phone_visit_completed');}
    await save();
  }
  async function addTodo(){
    const title=document.getElementById('cmTodoTitle').value.trim();if(!title)return alert('請輸入待辦事項。');
    state.todos.push({id:uid('todo'),title,date:document.getElementById('cmTodoDate').value||todayISO,priority:document.getElementById('cmTodoPriority').value,note:document.getElementById('cmTodoNote').value.trim(),done:false});cmTrack('todo_added');
    document.getElementById('cmTodoTitle').value='';document.getElementById('cmTodoNote').value='';await save();
  }

  function exportBackup(){
    cmTrack('backup_exported');
    const payload={app:'Longcare.Notes 個管工作台',exportedAt:new Date().toISOString(),schemaVersion:1,data:state};
    const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`LongcareNotes_個管工作台備份_${todayISO}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);
  }
  async function importBackup(file){
    try{const raw=JSON.parse(await file.text());const incoming=raw?.data||raw;if(!incoming||!Array.isArray(incoming.cases)||!Array.isArray(incoming.visits)||!Array.isArray(incoming.todos))throw new Error('format');if(!Array.isArray(incoming.homeVisits))incoming.homeVisits=[];if(!confirm('匯入會以備份檔內容取代目前工作台資料，確定要繼續嗎？'))return;state=Object.assign(defaultState(),incoming);cmTrack('backup_imported');await save();alert('資料已成功匯入。');}catch(e){alert('無法匯入：備份檔格式不正確。');}
  }
  async function clearData(){if(!confirm('這會清除目前瀏覽器中的所有個管工作台資料。建議先匯出備份。確定清除嗎？'))return;if(!confirm('再次確認：清除後若沒有備份將無法復原。'))return;state=defaultState();await save();}

  async function enableNotifications(){
    if(!('Notification'in window))return alert('此瀏覽器不支援系統通知，仍可使用工作台內的提醒。');
    const p=await Notification.requestPermission();state.settings.notificationEnabled=p==='granted';await save();if(p==='granted'){new Notification('Longcare.Notes 個管工作台',{body:'提醒已開啟。開啟工作台時會檢查今日待辦。'});}else alert('未取得通知權限，工作台內提醒仍會正常顯示。');
  }
  function maybeNotify(){
    if(!state.settings.notificationEnabled||!('Notification'in window)||Notification.permission!=='granted')return;
    const due=state.todos.filter(t=>!t.done&&t.date<=todayISO);if(!due.length)return;
    const key=`cmNotify_${todayISO}`;if(sessionStorage.getItem(key))return;sessionStorage.setItem(key,'1');new Notification('Longcare.Notes 今日提醒',{body:`你有 ${due.length} 件今日或逾期待辦。`});
  }

  function bind(){
    const tab=document.querySelector('.tab[data-target="casework"]');
    tab?.addEventListener('click',()=>{cmTrack('casework_open');showDisclaimer();setTimeout(()=>{renderAll();maybeNotify();},0);});
    document.getElementById('cmDisclaimerAccept').onclick=()=>{localStorage.setItem(DISCLAIMER_KEY,'accepted');hideDisclaimer();};
    document.getElementById('cmDisclaimerClose').onclick=hideDisclaimer;
    document.getElementById('cmPrivacyOpen').onclick=()=>document.getElementById('cmDisclaimer').classList.add('show');
    document.getElementById('cmMonth').onchange=e=>{selectedMonth=e.target.value||currentMonth;renderAll();};
    document.getElementById('cmMonthToday').onclick=()=>{selectedMonth=currentMonth;renderAll();};
    document.getElementById('cmAddCase').onclick=addCase;
    document.getElementById('cmCaseSearch').oninput=renderCaseList;
    document.getElementById('cmShowClosed').onchange=renderCaseList;
    document.getElementById('cmCaseList').onclick=async e=>{const tr=e.target.closest('[data-case]');if(!tr)return;const c=state.cases.find(x=>x.id===tr.dataset.case);if(!c)return;const action=e.target.dataset.action;if(action==='closeCase')closeCase(c);if(action==='restoreCase'){c.status='active';c.closedDate='';c.closeReason='';await save();}if(action==='deleteCase'&&confirm(`確定永久刪除「${c.name}」及其訪視紀錄嗎？`)){state.cases=state.cases.filter(x=>x.id!==c.id);state.visits=state.visits.filter(v=>v.caseId!==c.id);state.homeVisits=(state.homeVisits||[]).filter(v=>v.caseId!==c.id);await save();}};
    document.getElementById('cmCloseConfirm').onclick=confirmClose;
    document.getElementById('cmCloseCancel').onclick=()=>document.getElementById('cmCloseModal').classList.remove('show');
    document.getElementById('cmVisitFilters').onclick=e=>{if(!e.target.dataset.filter)return;visitFilter=e.target.dataset.filter;document.querySelectorAll('#cmVisitFilters button').forEach(b=>b.classList.toggle('active',b===e.target));renderVisits();};
    document.getElementById('cmVisitTable').onchange=e=>{if(!e.target.dataset.visit)return;const tr=e.target.closest('[data-case]');setVisit(tr.dataset.case,e.target.dataset.visit,e.target.checked);};
    document.getElementById('cmDownloadExcel').onclick=downloadCaseTemplate;
    document.getElementById('cmExcelFile').onchange=e=>{const f=e.target.files?.[0];if(f)previewExcelImport(f);};
    document.getElementById('cmScheduleHomeVisit').onclick=()=>openHomeVisitForm();
    document.getElementById('cmHomeVisitCancel').onclick=()=>document.getElementById('cmHomeVisitModal').classList.remove('show');
    document.getElementById('cmHomeVisitSave').onclick=saveHomeVisit;
    document.getElementById('cmHomeVisitDelete').onclick=()=>{const id=document.getElementById('cmHomeVisitId').value;if(id)deleteHomeVisit(id)};
    document.getElementById('cmCalendar').onclick=e=>{const b=e.target.closest('[data-homevisit]');if(!b)return;const v=(state.homeVisits||[]).find(x=>x.id===b.dataset.homevisit);if(v)openHomeVisitForm(v);};
    document.getElementById('cmAddTodo').onclick=addTodo;
    document.getElementById('cmTodoList').onclick=async e=>{const row=e.target.closest('[data-todo]');if(!row)return;const t=state.todos.find(x=>x.id===row.dataset.todo);if(!t)return;if(e.target.dataset.action==='deleteTodo'){state.todos=state.todos.filter(x=>x.id!==t.id);await save();}};
    document.getElementById('cmTodoList').onchange=async e=>{if(e.target.dataset.action!=='toggleTodo')return;const row=e.target.closest('[data-todo]');const t=state.todos.find(x=>x.id===row.dataset.todo);if(t){t.done=e.target.checked;await save();}};
    document.getElementById('cmExport').onclick=exportBackup;
    document.getElementById('cmImport').onchange=e=>{const f=e.target.files?.[0];if(f)importBackup(f);e.target.value='';};
    document.getElementById('cmClear').onclick=clearData;
    document.getElementById('cmNotify').onclick=enableNotifications;
  }

  async function init(){
    try{await openDB();const stored=await dbGet();if(stored)state=Object.assign(defaultState(),stored);bind();document.getElementById('cmOpenDate').value=todayISO;document.getElementById('cmTodoDate').value=todayISO;renderAll();}catch(e){console.error(e);document.getElementById('cmStorageError').classList.add('show');}
  }
  window.addEventListener('DOMContentLoaded',init);
})();
