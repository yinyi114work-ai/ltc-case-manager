// ===== 居督工作台 v2.0：待辦行事曆 + 個案管理 =====
const SUPERVISOR_STORAGE_KEY = 'longcareSupervisorTasksV1';
const SUPERVISOR_CASE_STORAGE_KEY = 'longcareSupervisorCasesV1';
const SUPERVISOR_TYPE_META = {
  shift: { label: '找代班', icon: '🔄' },
  medical: { label: '陪同就醫人力', icon: '🏥' },
  supervision: { label: '居服員個督', icon: '👥' },
  homevisit: { label: '家訪', icon: '🏠' },
  phonevisit: { label: '電訪', icon: '☎' },
  mutation: { label: '異動通報', icon: '📄' },
  meeting: { label: '會議紀錄', icon: '📝' },
  discussion: { label: '個案討論', icon: '📋' },
  callback: { label: '回電', icon: '📞' },
  other: { label: '其他', icon: '⭐' }
};
const SUPERVISOR_PRIORITY_META = {
  urgent: { label: '急', rank: 0 },
  normal: { label: '一般', rank: 1 },
  low: { label: '不急', rank: 2 }
};
let supervisorTasks = [];
let supervisorCases = [];
let supervisorSelectedDate = '';
let supervisorCalendarCursor = new Date();
let supervisorView = 'tasks';

function supervisorDateStr(date){
  const d = date instanceof Date ? date : new Date(date);
  if(Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function supervisorEscape(value){
  return String(value || '').replace(/[&<>'"]/g, ch=>({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' }[ch]));
}
function supervisorAddMonths(dateStr, months){
  if(!dateStr) return '';
  const [y,m,d] = dateStr.split('-').map(Number);
  if(!y || !m || !d) return '';
  const targetFirst = new Date(y, (m-1) + months, 1);
  const lastDay = new Date(targetFirst.getFullYear(), targetFirst.getMonth()+1, 0).getDate();
  return supervisorDateStr(new Date(targetFirst.getFullYear(), targetFirst.getMonth(), Math.min(d,lastDay)));
}
function supervisorMonthKey(dateStr){ return String(dateStr || '').slice(0,7); }
function supervisorFormatDate(dateStr){ return dateStr ? dateStr.replaceAll('-','／') : '—'; }
function loadSupervisorTasks(){
  try{
    const raw = JSON.parse(localStorage.getItem(SUPERVISOR_STORAGE_KEY) || '[]');
    supervisorTasks = Array.isArray(raw) ? raw.filter(item=>item && item.id).map(item=>({
      ...item,
      startTime: item.startTime || item.time || '',
      endTime: item.endTime || '',
      askedPeople: item.askedPeople || '',
      status: item.status === 'done' ? 'done' : 'pending'
    })) : [];
  }catch(e){ supervisorTasks = []; }
}
function saveSupervisorTasks(){ localStorage.setItem(SUPERVISOR_STORAGE_KEY, JSON.stringify(supervisorTasks)); }
function loadSupervisorCases(){
  try{
    const raw = JSON.parse(localStorage.getItem(SUPERVISOR_CASE_STORAGE_KEY) || '[]');
    supervisorCases = Array.isArray(raw) ? raw.filter(item=>item && item.id).map(item=>normalizeSupervisorCase(item)) : [];
  }catch(e){ supervisorCases = []; }
}
function saveSupervisorCases(){ localStorage.setItem(SUPERVISOR_CASE_STORAGE_KEY, JSON.stringify(supervisorCases)); }
function normalizeSupervisorCase(item){
  const lastVisitDate = item.lastVisitDate || '';
  return {
    id: item.id || `case_${Date.now()}_${Math.random().toString(36).slice(2,7)}`,
    name: String(item.name || '').trim(),
    startDate: item.startDate || '',
    homeCareWorker: String(item.homeCareWorker || '').trim(),
    serviceSchedule: String(item.serviceSchedule || '').trim(),
    lastVisitDate,
    nextVisitDate: lastVisitDate ? supervisorAddMonths(lastVisitDate,3) : (item.nextVisitDate || ''),
    status: item.status === 'closed' ? 'closed' : item.status === 'paused' ? 'paused' : 'active',
    note: String(item.note || '').trim(),
    createdAt: item.createdAt || Date.now(),
    updatedAt: item.updatedAt || Date.now()
  };
}
function supervisorSort(tasks){
  return [...tasks].sort((a,b)=>{
    const doneCompare = Number(a.status === 'done') - Number(b.status === 'done');
    if(doneCompare) return doneCompare;
    const p = (SUPERVISOR_PRIORITY_META[a.priority]?.rank ?? 1) - (SUPERVISOR_PRIORITY_META[b.priority]?.rank ?? 1);
    if(p) return p;
    const dateA = `${a.date || '9999-12-31'}T${a.startTime || '23:59'}`;
    const dateB = `${b.date || '9999-12-31'}T${b.startTime || '23:59'}`;
    if(dateA !== dateB) return dateA.localeCompare(dateB);
    return Number(a.createdAt || 0) - Number(b.createdAt || 0);
  });
}

// ===== 待辦 =====
function openSupervisorForm(task){
  const form = $('supervisorTaskForm'); if(!form) return;
  form.hidden = false;
  $('supervisorFormTitle').textContent = task ? '編輯待辦' : '新增待辦';
  $('supervisorTaskId').value = task?.id || '';
  $('supervisorTaskType').value = task?.type || 'shift';
  $('supervisorTaskSubject').value = task?.subject || '';
  $('supervisorTaskDate').value = task?.date || supervisorSelectedDate || supervisorDateStr(new Date());
  $('supervisorTaskStartTime').value = task?.startTime || task?.time || '';
  $('supervisorTaskEndTime').value = task?.endTime || '';
  $('supervisorTaskPriority').value = task?.priority || 'normal';
  $('supervisorTaskStatus').value = task?.status === 'done' ? 'done' : 'pending';
  $('supervisorTaskAsked').value = task?.askedPeople || '';
  $('supervisorTaskNote').value = task?.note || '';
  $('supervisorTaskCaseId').value = task?.caseId || '';
  $('supervisorTaskSubject').focus();
  form.scrollIntoView({behavior:'smooth', block:'nearest'});
}
function closeSupervisorForm(){ const form=$('supervisorTaskForm'); if(form) form.hidden=true; if($('supervisorTaskId')) $('supervisorTaskId').value=''; }
function validateTimeRange(start,end){ return !start || !end || start < end; }
function saveSupervisorTask(){
  const subject=v('supervisorTaskSubject'), date=v('supervisorTaskDate');
  const startTime=v('supervisorTaskStartTime'), endTime=v('supervisorTaskEndTime');
  if(!subject){ showToast('請填寫個案或事項名稱'); $('supervisorTaskSubject').focus(); return; }
  if(!date){ showToast('請選擇日期'); $('supervisorTaskDate').focus(); return; }
  if(!validateTimeRange(startTime,endTime)){ showToast('結束時間需晚於開始時間'); $('supervisorTaskEndTime').focus(); return; }
  const id=v('supervisorTaskId'); const existing=supervisorTasks.find(task=>task.id===id);
  const item={
    id:id || `task_${Date.now()}_${Math.random().toString(36).slice(2,7)}`,
    type:v('supervisorTaskType') || 'other', subject, date, startTime, endTime,
    priority:v('supervisorTaskPriority') || 'normal', status:v('supervisorTaskStatus')==='done'?'done':'pending',
    askedPeople:v('supervisorTaskAsked'), note:v('supervisorTaskNote'), caseId:v('supervisorTaskCaseId'),
    scheduleCompleted: existing?.scheduleCompleted || false,
    mutationIncluded: existing?.mutationIncluded || false,
    createdAt:existing?.createdAt || Date.now(), updatedAt:Date.now()
  };
  if(existing) supervisorTasks=supervisorTasks.map(task=>task.id===id?item:task); else supervisorTasks.push(item);
  saveSupervisorTasks(); closeSupervisorForm(); renderSupervisorDashboard(); showToast(existing?'已更新待辦':'已新增待辦');
}
function openSupervisorCompleteModal(id){
  const task=supervisorTasks.find(item=>item.id===id); if(!task) return;
  const modal=$('supervisorCompleteModal');
  $('supervisorCompleteTaskId').value=id;
  $('supervisorCompleteSubject').textContent=`${SUPERVISOR_TYPE_META[task.type]?.label || '待辦'}｜${task.subject}`;
  $('supervisorScheduleCompleted').checked=!!task.scheduleCompleted;
  $('supervisorMutationIncluded').checked=!!task.mutationIncluded;
  const staffingTask=['shift','medical'].includes(task.type);
  $('supervisorScheduleCompleted').closest('label').hidden=!staffingTask;
  $('supervisorMutationIncluded').closest('label').hidden=!staffingTask;
  const visitHint = $('supervisorVisitCompleteHint');
  if(visitHint){
    visitHint.hidden = !(task.type==='homevisit' && task.caseId);
    visitHint.textContent = task.type==='homevisit' && task.caseId ? '完成後會同步更新此個案的最近家訪日，並自動計算下一次家訪期限。' : '';
  }
  modal.hidden=false;
}
function closeSupervisorCompleteModal(){ const modal=$('supervisorCompleteModal'); if(modal) modal.hidden=true; }
function confirmSupervisorComplete(){
  const id=v('supervisorCompleteTaskId');
  const task = supervisorTasks.find(item=>item.id===id);
  if(task?.type==='homevisit' && task.caseId){
    const target = supervisorCases.find(item=>item.id===task.caseId);
    if(target){
      target.lastVisitDate = task.date;
      target.nextVisitDate = supervisorAddMonths(task.date,3);
      target.updatedAt = Date.now();
      saveSupervisorCases();
    }
  }
  supervisorTasks=supervisorTasks.map(item=>item.id===id?{
    ...item,status:'done',
    scheduleCompleted:$('supervisorScheduleCompleted').checked,
    mutationIncluded:$('supervisorMutationIncluded').checked,
    completedAt:Date.now(),updatedAt:Date.now()
  }:item);
  saveSupervisorTasks(); closeSupervisorCompleteModal(); renderSupervisorDashboard(); renderSupervisorCases(); showToast('已標記完成');
}
function toggleSupervisorTask(id,checked){
  if(checked){ openSupervisorCompleteModal(id); return; }
  supervisorTasks=supervisorTasks.map(task=>task.id===id?{...task,status:'pending',updatedAt:Date.now()}:task);
  saveSupervisorTasks(); renderSupervisorDashboard();
}
function deleteSupervisorTask(id){
  const task=supervisorTasks.find(item=>item.id===id);
  if(!task || !window.confirm(`確定刪除「${task.subject}」？`)) return;
  supervisorTasks=supervisorTasks.filter(item=>item.id!==id); saveSupervisorTasks(); renderSupervisorDashboard(); showToast('已刪除待辦');
}
function isSupervisorOverdue(task){ return task.status!=='done' && task.date && task.date<supervisorDateStr(new Date()); }
function renderSupervisorStats(){
  const today=supervisorDateStr(new Date()); const pending=supervisorTasks.filter(t=>t.status!=='done');
  const urgent=pending.filter(t=>t.priority==='urgent').length, todayCount=pending.filter(t=>t.date===today).length, overdue=pending.filter(isSupervisorOverdue).length;
  $('supervisorStats').innerHTML=`<div class="supervisor-stat"><span>急件</span><strong>${urgent}</strong></div><div class="supervisor-stat"><span>今日待辦</span><strong>${todayCount}</strong></div><div class="supervisor-stat"><span>已逾期</span><strong>${overdue}</strong></div>`;
}
function renderSupervisorTasks(){
  const showCompleted=$('supervisorShowCompleted')?.checked;
  let tasks=supervisorTasks.filter(task=>showCompleted || task.status!=='done');
  if(supervisorSelectedDate) tasks=tasks.filter(task=>task.date===supervisorSelectedDate);
  tasks=supervisorSort(tasks);
  $('supervisorListTitle').textContent=supervisorSelectedDate?'當日待辦':'全部待辦';
  $('supervisorSelectedDateLabel').textContent=supervisorSelectedDate?supervisorSelectedDate.replaceAll('-','／'):'依急迫程度與日期排序';
  if(!tasks.length){ $('supervisorTaskList').innerHTML=`<div class="supervisor-empty">${supervisorSelectedDate?'這一天目前沒有待辦事項。':'目前沒有待辦事項，按「新增待辦」開始使用。'}</div>`; return; }
  $('supervisorTaskList').innerHTML=tasks.map(task=>{
    const type=SUPERVISOR_TYPE_META[task.type] || SUPERVISOR_TYPE_META.other;
    const overdue=isSupervisorOverdue(task);
    const timeText=task.startTime ? `${task.startTime}${task.endTime?`–${task.endTime}`:''}` : '';
    const completionNotes=task.status==='done' && ['shift','medical'].includes(task.type)
      ? `<div class="task-completion-note"><span>${task.scheduleCompleted?'✓':'○'} 已完成人力／排班</span><span>${task.mutationIncluded?'✓':'○'} 已列入異動通報</span></div>`:'';
    return `<article class="supervisor-task priority-${task.priority} ${overdue?'is-overdue':''} ${task.status==='done'?'is-done':''}" data-id="${supervisorEscape(task.id)}">
      <input class="task-check" type="checkbox" ${task.status==='done'?'checked':''} aria-label="標記完成">
      <div class="task-main">
        <div class="task-title-row"><span class="task-title">${supervisorEscape(task.subject)}</span><span class="task-type-badge">${type.icon} ${type.label}</span><span class="task-status-badge ${task.status}">${task.status==='done'?'已完成':'待處理'}</span></div>
        <div class="task-meta"><span>📅 ${supervisorEscape(task.date)}</span>${timeText?`<span>🕒 ${supervisorEscape(timeText)}</span>`:''}<span>${overdue?'⚠ 已逾期':`優先：${SUPERVISOR_PRIORITY_META[task.priority]?.label || '一般'}`}</span></div>
        ${task.askedPeople?`<div class="task-asked"><strong>已詢問：</strong>${supervisorEscape(task.askedPeople).replace(/\n/g,'<br>')}</div>`:''}
        ${task.note?`<p class="task-note">${supervisorEscape(task.note)}</p>`:''}${completionNotes}
      </div>
      <div class="task-actions"><button class="task-action edit" type="button">編輯</button><button class="task-action delete" type="button">刪除</button></div>
    </article>`;
  }).join('');
  document.querySelectorAll('#supervisorTaskList .supervisor-task').forEach(card=>{
    const id=card.dataset.id;
    card.querySelector('.task-check').addEventListener('change',e=>toggleSupervisorTask(id,e.target.checked));
    card.querySelector('.edit').addEventListener('click',()=>openSupervisorForm(supervisorTasks.find(task=>task.id===id)));
    card.querySelector('.delete').addEventListener('click',()=>deleteSupervisorTask(id));
  });
}
function renderSupervisorCalendar(){
  const title=$('calendarTitle'), calendar=$('supervisorCalendar'); if(!title || !calendar) return;
  const year=supervisorCalendarCursor.getFullYear(), month=supervisorCalendarCursor.getMonth();
  title.textContent=`${year} 年 ${month+1} 月`;
  const first=new Date(year,month,1), start=new Date(year,month,1-first.getDay()), today=supervisorDateStr(new Date()), cells=[];
  for(let i=0;i<42;i++){
    const d=new Date(start); d.setDate(start.getDate()+i); const ds=supervisorDateStr(d);
    const dayTasks=supervisorTasks.filter(t=>t.date===ds && t.status!=='done');
    const priorities=['urgent','normal','low'].filter(p=>dayTasks.some(t=>t.priority===p));
    cells.push(`<button class="calendar-day ${d.getMonth()!==month?'other-month':''} ${ds===today?'today':''} ${ds===supervisorSelectedDate?'selected':''}" type="button" data-date="${ds}"><span class="calendar-day-number">${d.getDate()}</span><span class="calendar-dots">${priorities.map(p=>`<i class="calendar-dot ${p}"></i>`).join('')}</span></button>`);
  }
  calendar.innerHTML=cells.join('');
  calendar.querySelectorAll('.calendar-day').forEach(btn=>btn.addEventListener('click',()=>{
    supervisorSelectedDate=btn.dataset.date; const selected=new Date(`${supervisorSelectedDate}T00:00:00`);
    supervisorCalendarCursor=new Date(selected.getFullYear(),selected.getMonth(),1); renderSupervisorDashboard();
  }));
}
function renderSupervisorDashboard(){ renderSupervisorStats(); renderSupervisorTasks(); renderSupervisorCalendar(); }

// ===== 個案管理 =====
function supervisorCaseVisitState(item){
  if(item.status!=='active') return {key:'inactive',label:item.status==='paused'?'暫停服務':'已結案'};
  if(!item.lastVisitDate) return {key:'missing',label:'尚未登錄家訪'};
  const next = item.nextVisitDate || supervisorAddMonths(item.lastVisitDate,3);
  const today = supervisorDateStr(new Date());
  const currentMonth = supervisorMonthKey(today);
  const nextMonthDate = new Date(new Date(`${today}T00:00:00`).getFullYear(), new Date(`${today}T00:00:00`).getMonth()+1, 1);
  const nextMonth = `${nextMonthDate.getFullYear()}-${String(nextMonthDate.getMonth()+1).padStart(2,'0')}`;
  if(next < today) return {key:'overdue',label:'已逾期'};
  if(supervisorMonthKey(next)===currentMonth) return {key:'due',label:'本月應訪'};
  if(supervisorMonthKey(next)===nextMonth) return {key:'soon',label:'下月應訪'};
  return {key:'ok',label:'追蹤中'};
}
function renderSupervisorCaseStats(){
  const active=supervisorCases.filter(c=>c.status==='active');
  const overdue=active.filter(c=>supervisorCaseVisitState(c).key==='overdue').length;
  const due=active.filter(c=>supervisorCaseVisitState(c).key==='due').length;
  const missing=active.filter(c=>supervisorCaseVisitState(c).key==='missing').length;
  $('supervisorCaseStats').innerHTML=`<div class="supervisor-stat"><span>服務中個案</span><strong>${active.length}</strong></div><div class="supervisor-stat"><span>本月應家訪</span><strong>${due}</strong></div><div class="supervisor-stat"><span>已逾期</span><strong>${overdue}</strong></div><div class="supervisor-stat"><span>尚未登錄</span><strong>${missing}</strong></div>`;
}
function openSupervisorCaseForm(item){
  const form=$('supervisorCaseForm'); if(!form) return;
  form.hidden=false;
  $('supervisorCaseFormTitle').textContent=item?'編輯個案':'新增個案';
  $('supervisorCaseId').value=item?.id || '';
  $('supervisorCaseName').value=item?.name || '';
  $('supervisorCaseStartDate').value=item?.startDate || '';
  $('supervisorCaseWorker').value=item?.homeCareWorker || '';
  $('supervisorCaseSchedule').value=item?.serviceSchedule || '';
  $('supervisorCaseLastVisit').value=item?.lastVisitDate || '';
  $('supervisorCaseStatus').value=item?.status || 'active';
  $('supervisorCaseNote').value=item?.note || '';
  $('supervisorCaseName').focus();
  form.scrollIntoView({behavior:'smooth', block:'nearest'});
}
function closeSupervisorCaseForm(){ $('supervisorCaseForm').hidden=true; $('supervisorCaseId').value=''; }
function saveSupervisorCase(){
  const name=v('supervisorCaseName');
  if(!name){ showToast('請填寫個案姓名'); $('supervisorCaseName').focus(); return; }
  const id=v('supervisorCaseId'); const existing=supervisorCases.find(c=>c.id===id);
  const lastVisitDate=v('supervisorCaseLastVisit');
  const item=normalizeSupervisorCase({
    id:id || `case_${Date.now()}_${Math.random().toString(36).slice(2,7)}`,
    name,
    startDate:v('supervisorCaseStartDate'),
    homeCareWorker:v('supervisorCaseWorker'),
    serviceSchedule:v('supervisorCaseSchedule'),
    lastVisitDate,
    status:v('supervisorCaseStatus') || 'active',
    note:v('supervisorCaseNote'),
    createdAt:existing?.createdAt || Date.now(),
    updatedAt:Date.now()
  });
  if(existing) supervisorCases=supervisorCases.map(c=>c.id===id?item:c); else supervisorCases.push(item);
  saveSupervisorCases(); closeSupervisorCaseForm(); renderSupervisorCases(); showToast(existing?'已更新個案':'已新增個案');
}
function deleteSupervisorCase(id){
  const item=supervisorCases.find(c=>c.id===id); if(!item) return;
  if(!window.confirm(`確定刪除「${item.name}」？相關待辦不會自動刪除。`)) return;
  supervisorCases=supervisorCases.filter(c=>c.id!==id); saveSupervisorCases(); renderSupervisorCases(); showToast('已刪除個案');
}
function completeSupervisorCaseVisit(id){
  const item=supervisorCases.find(c=>c.id===id); if(!item) return;
  const date = window.prompt(`請輸入「${item.name}」本次家訪日期（YYYY-MM-DD）`, supervisorDateStr(new Date()));
  if(date===null) return;
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date) || !supervisorDateStr(new Date(`${date}T00:00:00`))){ showToast('日期格式不正確'); return; }
  item.lastVisitDate=date; item.nextVisitDate=supervisorAddMonths(date,3); item.updatedAt=Date.now();
  saveSupervisorCases(); renderSupervisorCases(); showToast(`已完成家訪，下次期限 ${item.nextVisitDate}`);
}
function scheduleSupervisorCaseVisit(id){
  const item=supervisorCases.find(c=>c.id===id); if(!item) return;
  switchSupervisorView('tasks');
  openSupervisorForm({
    type:'homevisit', subject:item.name,
    date:item.nextVisitDate || supervisorDateStr(new Date()),
    priority:supervisorCaseVisitState(item).key==='overdue'?'urgent':'normal',
    caseId:item.id,
    note:'定期家訪'
  });
  $('supervisorTaskStartTime').focus();
}
function renderSupervisorCases(){
  if(!$('supervisorCaseList')) return;
  renderSupervisorCaseStats();
  const keyword=(v('supervisorCaseSearch') || '').toLowerCase();
  const statusFilter=v('supervisorCaseFilter') || 'all';
  let list=supervisorCases.filter(item=>{
    if(statusFilter!=='all' && item.status!==statusFilter) return false;
    if(!keyword) return true;
    return [item.name,item.homeCareWorker,item.serviceSchedule,item.note].some(x=>String(x||'').toLowerCase().includes(keyword));
  });
  const rank={overdue:0,due:1,missing:2,soon:3,ok:4,inactive:5};
  list.sort((a,b)=>{
    const ar=rank[supervisorCaseVisitState(a).key]??9, br=rank[supervisorCaseVisitState(b).key]??9;
    if(ar!==br) return ar-br;
    return (a.nextVisitDate||'9999-12-31').localeCompare(b.nextVisitDate||'9999-12-31') || a.name.localeCompare(b.name,'zh-Hant');
  });
  if(!list.length){
    $('supervisorCaseList').innerHTML='<div class="supervisor-empty">目前沒有符合條件的個案。可按「新增個案」或匯入既有名單。</div>';
    return;
  }
  $('supervisorCaseList').innerHTML=list.map(item=>{
    const state=supervisorCaseVisitState(item);
    return `<article class="supervisor-case-card state-${state.key}" data-id="${supervisorEscape(item.id)}">
      <div class="case-card-main">
        <div class="case-title-row"><strong>${supervisorEscape(item.name)}</strong><span class="case-visit-badge ${state.key}">${state.label}</span><span class="case-status-label">${item.status==='active'?'服務中':item.status==='paused'?'暫停':'結案'}</span></div>
        <div class="case-meta">
          ${item.homeCareWorker?`<span>居服員：${supervisorEscape(item.homeCareWorker)}</span>`:''}
          ${item.serviceSchedule?`<span>服務：${supervisorEscape(item.serviceSchedule)}</span>`:''}
        </div>
        <div class="case-visit-dates"><span>最近家訪：<b>${supervisorFormatDate(item.lastVisitDate)}</b></span><span>下次期限：<b>${supervisorFormatDate(item.nextVisitDate)}</b></span></div>
        ${item.note?`<p class="case-note">${supervisorEscape(item.note)}</p>`:''}
      </div>
      <div class="case-card-actions">
        <button class="secondary-btn case-schedule" type="button">安排家訪</button>
        <button class="primary-btn case-complete" type="button">完成家訪</button>
        <button class="task-action case-edit" type="button">編輯</button>
        <button class="task-action delete case-delete" type="button">刪除</button>
      </div>
    </article>`;
  }).join('');
  document.querySelectorAll('#supervisorCaseList .supervisor-case-card').forEach(card=>{
    const id=card.dataset.id;
    card.querySelector('.case-schedule').addEventListener('click',()=>scheduleSupervisorCaseVisit(id));
    card.querySelector('.case-complete').addEventListener('click',()=>completeSupervisorCaseVisit(id));
    card.querySelector('.case-edit').addEventListener('click',()=>openSupervisorCaseForm(supervisorCases.find(c=>c.id===id)));
    card.querySelector('.case-delete').addEventListener('click',()=>deleteSupervisorCase(id));
  });
}
function switchSupervisorView(view){
  supervisorView=view==='cases'?'cases':'tasks';
  document.querySelectorAll('.supervisor-mode-btn').forEach(btn=>btn.classList.toggle('active',btn.dataset.supervisorView===supervisorView));
  $('supervisorTaskView').hidden=supervisorView!=='tasks';
  $('supervisorCaseView').hidden=supervisorView!=='cases';
  $('supervisorShowAll').hidden=supervisorView!=='tasks';
  $('supervisorAddTask').hidden=supervisorView!=='tasks';
  $('supervisorAddCase').hidden=supervisorView!=='cases';
  $('supervisorImportCases').hidden=supervisorView!=='cases';
  $('supervisorDownloadTemplate').hidden=supervisorView!=='cases';
  if(supervisorView==='cases') renderSupervisorCases(); else renderSupervisorDashboard();
}
function mapSupervisorImportRow(row){
  const keys=Object.keys(row||{});
  const read=(names)=>{
    const key=keys.find(k=>names.some(n=>String(k).trim().toLowerCase()===n.toLowerCase()));
    return key ? String(row[key]??'').trim() : '';
  };
  const name=read(['個案姓名','姓名','name']);
  if(!name) return null;
  const rawStatus=read(['狀態','服務狀態','status']);
  let status='active'; if(/暫停|pause/i.test(rawStatus)) status='paused'; else if(/結案|closed|close/i.test(rawStatus)) status='closed';
  return normalizeSupervisorCase({
    name,
    startDate:normalizeImportedDate(read(['開始服務日','服務開始日','開案日','startDate'])),
    homeCareWorker:read(['居服員','服務人員','homeCareWorker']),
    serviceSchedule:read(['服務時間','服務頻率','服務型態','serviceSchedule']),
    lastVisitDate:normalizeImportedDate(read(['最近家訪日','最近家訪日期','上次家訪日','lastVisitDate'])),
    status,
    note:read(['備註','note'])
  });
}
function normalizeImportedDate(value){
  if(!value) return '';
  const s=String(value).trim().replaceAll('/','-').replaceAll('.','-');
  if(/^\d{4}-\d{1,2}-\d{1,2}$/.test(s)){
    const [y,m,d]=s.split('-').map(Number); return supervisorDateStr(new Date(y,m-1,d));
  }
  if(/^\d{3}-\d{1,2}-\d{1,2}$/.test(s)){
    const [y,m,d]=s.split('-').map(Number); return supervisorDateStr(new Date(y+1911,m-1,d));
  }
  return '';
}
async function importSupervisorCases(file){
  if(!file) return;
  try{
    let rows=[];
    if(typeof XLSX!=='undefined'){
      const buffer=await file.arrayBuffer();
      const workbook=XLSX.read(buffer,{type:'array'}); const sheet=workbook.Sheets[workbook.SheetNames[0]];
      rows=XLSX.utils.sheet_to_json(sheet,{defval:'',raw:false});
    }else{
      const text=await file.text();
      const lines=text.replace(/^\uFEFF/,'').split(/\r?\n/).filter(Boolean);
      const headers=(lines.shift()||'').split(',').map(x=>x.trim());
      rows=lines.map(line=>Object.fromEntries(line.split(',').map((x,i)=>[headers[i]||i,x.trim()])));
    }
    const imported=rows.map(mapSupervisorImportRow).filter(Boolean);
    if(!imported.length){ showToast('找不到可匯入的個案資料'); return; }
    const byName=new Map(supervisorCases.map(item=>[item.name,item]));
    imported.forEach(item=>{
      const old=byName.get(item.name);
      if(old){ Object.assign(old,{...item,id:old.id,createdAt:old.createdAt,updatedAt:Date.now()}); }
      else { supervisorCases.push(item); byName.set(item.name,item); }
    });
    saveSupervisorCases(); renderSupervisorCases(); showToast(`已匯入 ${imported.length} 筆個案`);
  }catch(err){ console.error(err); showToast('匯入失敗，請確認檔案格式'); }
  finally{ $('supervisorCaseFile').value=''; }
}
function downloadSupervisorTemplate(){
  const headers=['個案姓名','開始服務日','居服員','服務時間','最近家訪日','狀態','備註'];
  if(typeof XLSX!=='undefined'){
    const ws=XLSX.utils.aoa_to_sheet([headers,['','','','','','','']]); const wb=XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb,ws,'居督個案名單'); XLSX.writeFile(wb,'居督個案名單_空白範本.xlsx');
    return;
  }
  const csv='\uFEFF個案姓名,開始服務日,居服員,服務時間,最近家訪日,狀態,備註\n';
  const blob=new Blob([csv],{type:'text/csv;charset=utf-8'}); const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download='居督個案名單_空白範本.csv'; a.click(); URL.revokeObjectURL(url);
}

function initSupervisorTool(){
  if(!$('supervisorTool')) return;
  loadSupervisorTasks(); loadSupervisorCases(); supervisorCalendarCursor=new Date(new Date().getFullYear(),new Date().getMonth(),1);
  document.querySelectorAll('.supervisor-mode-btn').forEach(btn=>btn.addEventListener('click',()=>switchSupervisorView(btn.dataset.supervisorView)));
  $('supervisorAddTask')?.addEventListener('click',()=>openSupervisorForm());
  $('supervisorCloseForm')?.addEventListener('click',closeSupervisorForm);
  $('supervisorCancelTask')?.addEventListener('click',closeSupervisorForm);
  $('supervisorSaveTask')?.addEventListener('click',saveSupervisorTask);
  $('supervisorShowCompleted')?.addEventListener('change',renderSupervisorTasks);
  $('supervisorShowAll')?.addEventListener('click',()=>{supervisorSelectedDate='';renderSupervisorDashboard();});
  $('calendarPrev')?.addEventListener('click',()=>{supervisorCalendarCursor.setMonth(supervisorCalendarCursor.getMonth()-1);renderSupervisorCalendar();});
  $('calendarNext')?.addEventListener('click',()=>{supervisorCalendarCursor.setMonth(supervisorCalendarCursor.getMonth()+1);renderSupervisorCalendar();});
  $('supervisorConfirmComplete')?.addEventListener('click',confirmSupervisorComplete);
  $('supervisorCancelComplete')?.addEventListener('click',closeSupervisorCompleteModal);
  document.querySelectorAll('[data-close-complete-modal]').forEach(el=>el.addEventListener('click',closeSupervisorCompleteModal));

  $('supervisorAddCase')?.addEventListener('click',()=>openSupervisorCaseForm());
  $('supervisorCloseCaseForm')?.addEventListener('click',closeSupervisorCaseForm);
  $('supervisorCancelCase')?.addEventListener('click',closeSupervisorCaseForm);
  $('supervisorSaveCase')?.addEventListener('click',saveSupervisorCase);
  $('supervisorCaseSearch')?.addEventListener('input',renderSupervisorCases);
  $('supervisorCaseFilter')?.addEventListener('change',renderSupervisorCases);
  $('supervisorImportCases')?.addEventListener('click',()=>$('supervisorCaseFile').click());
  $('supervisorCaseFile')?.addEventListener('change',e=>importSupervisorCases(e.target.files?.[0]));
  $('supervisorDownloadTemplate')?.addEventListener('click',downloadSupervisorTemplate);
  switchSupervisorView('tasks');
}
