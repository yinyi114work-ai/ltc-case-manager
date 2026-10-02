const SUPERVISOR_WEEKDAYS=['週一','週二','週三','週四','週五','週六','週日'];
function normalizeSupervisorWeekSchedule(items){
  const time=value=>/^([01]\d|2[0-3]):[0-5]\d$/.test(String(value||''))?String(value):'';
  return SUPERVISOR_WEEKDAYS.map((label,day)=>{
    const saved=Array.isArray(items)?items.find(x=>x&&Number(x.day)===day):null;
    return {day,checked:!!saved?.checked,start:time(saved?.start),end:time(saved?.end)};
  });
}
function supervisorWeekScheduleText(items,extra=''){
  const lines=normalizeSupervisorWeekSchedule(items).filter(x=>x.checked).map(x=>SUPERVISOR_WEEKDAYS[x.day]+(x.start&&x.end?' '+x.start+'–'+x.end:'（時間待確認）'));
  if(extra.trim())lines.push(extra.trim());
  return lines.join('；');
}
function renderSupervisorWeekSchedule(items=[]){
  $('supervisorWeekSchedule').innerHTML=normalizeSupervisorWeekSchedule(items).map(x=>{
    const label=SUPERVISOR_WEEKDAYS[x.day];
    return `<div class="supervisor-week-row ${x.checked?'is-selected':''}" data-day="${x.day}"><label class="check-item"><input type="checkbox" ${x.checked?'checked':''}>${label}</label><label>開始<input type="time" class="week-start" aria-label="${label}開始時間" value="${x.start}" ${x.checked?'':'disabled'}></label><span aria-hidden="true">～</span><label>結束<input type="time" class="week-end" aria-label="${label}結束時間" value="${x.end}" ${x.checked?'':'disabled'}></label></div>`;
  }).join('');
  document.querySelectorAll('#supervisorWeekSchedule .supervisor-week-row').forEach(row=>{
    row.querySelector('input[type="checkbox"]').addEventListener('change',e=>{
      row.classList.toggle('is-selected',e.target.checked);
      row.querySelectorAll('input[type="time"]').forEach(input=>input.disabled=!e.target.checked);
    });
  });
}
function readSupervisorWeekSchedule(){
  return [...document.querySelectorAll('#supervisorWeekSchedule .supervisor-week-row')].map(row=>({day:Number(row.dataset.day),checked:row.querySelector('input[type="checkbox"]').checked,start:row.querySelector('.week-start').value,end:row.querySelector('.week-end').value}));
}
const SUPERVISOR_HANDOVER_ITEMS = ["溝通與認知", "行走與移位協助", "跌倒風險與輔具", "飲食與吞嚥注意", "如廁與排泄照顧", "沐浴與身體清潔", "皮膚與傷口注意", "備餐與家務細節", "陪同外出", "入家方式與用品位置", "家屬交代與個案習慣", "異常狀況與回報事項"];
function supervisorChecklistText(items){
  return (items||[]).filter(x=>x.checked).map(x=>'☑ '+x.label+(x.note?'：'+x.note:'')).join('\n');
}
function renderSupervisorHandoverChecks(items=[]){
  const saved=new Map(items.map(x=>[x.label,x]));
  const labels=[...new Set([...SUPERVISOR_HANDOVER_ITEMS,...saved.keys()])];
  $('supervisorHandoverChecks').innerHTML=labels.map(label=>{
    const item=saved.get(label)||{};
    return `<div class="handover-check-card" data-label="${supervisorEscape(label)}"><label class="check-item"><input type="checkbox" ${item.checked?'checked':''}>${supervisorEscape(label)}</label><label class="handover-item-note">補充備註<textarea maxlength="1000" rows="2" placeholder="請填寫實際協助方式、注意事項">${supervisorEscape(item.note||'')}</textarea></label></div>`;
  }).join('');
}
function readSupervisorHandoverChecks(){
  return [...document.querySelectorAll('#supervisorHandoverChecks .handover-check-card')].map(el=>({label:el.dataset.label,checked:el.querySelector('input').checked,note:el.querySelector('textarea').value.trim()}));
}
// ===== 居督工作台 v2.0：待辦行事曆 + 個案管理 =====
const SUPERVISOR_STORAGE_KEY = 'longcareSupervisorTasksV1';
const SUPERVISOR_CASE_STORAGE_KEY = 'longcareSupervisorCasesV1';
const SUPERVISOR_TYPE_META = {
  shift: { label: '找代班', icon: '🔄' },
  medical: { label: '陪同就醫人力', icon: '🏥' },
  supervision: { label: '居服員個督', icon: '👥' },
  homevisit: { label: '排定家訪', icon: '🏠' },
  visitrecord: { label: '家訪紀錄', icon: '📝' },
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
let supervisorView = 'cases';
let supervisorTrackingCursor = new Date(new Date().getFullYear(), new Date().getMonth(), 1);

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
function supervisorMonthFromDate(dateStr){ return dateStr ? String(dateStr).slice(0,7) : ''; }
function supervisorAddMonthKey(monthKey, months){
  const [y,m]=String(monthKey||'').split('-').map(Number); if(!y||!m) return '';
  const d=new Date(y,m-1+months,1); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
}
function supervisorRocMonth(monthKey){ const [y,m]=String(monthKey||'').split('-').map(Number); return y&&m ? `${y-1911}年${m}月` : '—'; }
function supervisorTrackingMonth(){ return `${supervisorTrackingCursor.getFullYear()}-${String(supervisorTrackingCursor.getMonth()+1).padStart(2,'0')}`; }
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
function saveSupervisorTasks(){ localStorage.setItem(SUPERVISOR_STORAGE_KEY, JSON.stringify(supervisorTasks)); window.dispatchEvent(new Event('supervisor-data-changed')); }
function loadSupervisorCases(){
  try{
    const raw = JSON.parse(localStorage.getItem(SUPERVISOR_CASE_STORAGE_KEY) || '[]');
    supervisorCases = Array.isArray(raw) ? raw.filter(item=>item && item.id).map(item=>normalizeSupervisorCase(item)) : [];
  }catch(e){ supervisorCases = []; }
}
function saveSupervisorCases(){ localStorage.setItem(SUPERVISOR_CASE_STORAGE_KEY, JSON.stringify(supervisorCases)); window.dispatchEvent(new Event('supervisor-data-changed')); }
function normalizeSupervisorCase(item){
  const lastVisitDate = item.lastVisitDate || '';
  const weekly=normalizeSupervisorWeekSchedule(item.serviceWeekSchedule);
  const extra=Array.isArray(item.serviceWeekSchedule)?String(item.serviceScheduleExtra||'').trim():String(item.serviceSchedule||'').trim();
  return {
    id: item.id || `case_${Date.now()}_${Math.random().toString(36).slice(2,7)}`,
    cms: /^[1-8]$/.test(String(item.cms||''))?String(item.cms):'',
    identity: String(item.identity||'').trim(),
    handoverItems: Array.isArray(item.handoverItems)?item.handoverItems.filter(x=>x&&typeof x.label==='string').map(x=>({label:x.label,checked:!!x.checked,note:String(x.note||'').trim()})):[],
    name: String(item.name || '').trim(),
    startDate: item.startDate || '',
    homeCareWorker: String(item.homeCareWorker || '').trim(),
    serviceWeekSchedule:weekly,
    serviceScheduleExtra:extra,
    serviceSchedule:supervisorWeekScheduleText(weekly,extra),
    lastVisitDate,
    nextVisitDate: lastVisitDate ? supervisorAddMonths(lastVisitDate,3) : (item.nextVisitDate || ''),
    status: item.status === 'closed' ? 'closed' : item.status === 'paused' ? 'paused' : 'active',
    note: String(item.note || '').trim(),
    condition: String(item.condition || '').trim(),
    serviceDetails: String(item.serviceDetails || '').trim(),
    handoverNote: String(item.handoverNote || '').trim(),
    followups: item.followups && typeof item.followups === 'object' ? item.followups : {},
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
  updateSupervisorTaskFields();
  $('supervisorTaskSubject').focus();
  form.scrollIntoView({behavior:'smooth', block:'nearest'});
}
function updateSupervisorTaskFields(){ const type=v('supervisorTaskType'); const row=$('supervisorTaskAsked')?.closest('label'); if(row) row.hidden=['homevisit','visitrecord','phonevisit'].includes(type); }
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
    askedPeople:v('supervisorTaskAsked'), note:v('supervisorTaskNote'), caseId:v('supervisorTaskCaseId'), trackingMonth: existing?.trackingMonth || '',
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
    visitHint.hidden = !(task.type==='visitrecord' && task.caseId);
    visitHint.textContent = task.type==='visitrecord' && task.caseId ? '完成這筆紀錄後，才會將本月家訪計入完成度，並更新下一次家訪月份。' : '';
  }
  modal.hidden=false;
}
function closeSupervisorCompleteModal(){ const modal=$('supervisorCompleteModal'); if(modal) modal.hidden=true; }
function confirmSupervisorComplete(){
  const id=v('supervisorCompleteTaskId');
  const task=supervisorTasks.find(item=>item.id===id);
  if(task?.type==='visitrecord' && task.caseId){
    const target=supervisorCases.find(item=>item.id===task.caseId);
    if(target){
      const month=task.trackingMonth || supervisorMonthFromDate(task.date);
      target.followups=target.followups||{};
      target.followups[month]={...(target.followups[month]||{}),type:'homevisit',completed:true,completedAt:Date.now(),visitDate:task.visitDate||task.date,recordTaskId:task.id};
      target.lastVisitDate=task.visitDate||task.date; target.nextVisitDate=supervisorAddMonths(target.lastVisitDate,3); target.updatedAt=Date.now();
      saveSupervisorCases();
    }
  }
  supervisorTasks=supervisorTasks.map(item=>item.id===id?{...item,status:'done',scheduleCompleted:$('supervisorScheduleCompleted').checked,mutationIncluded:$('supervisorMutationIncluded').checked,completedAt:Date.now(),updatedAt:Date.now()}:item);
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
    card.querySelector('.case-handover')?.addEventListener('click',()=>openSupervisorHandover(id));
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
function ensureSupervisorVisitRecordTasks(){
  const now=new Date(); let changed=false;
  supervisorTasks.filter(t=>t.type==='homevisit' && t.caseId && t.status!=='done').forEach(t=>{
    if(!t.date || !t.startTime) return;
    const when=new Date(`${t.date}T${t.startTime}:00`); if(Number.isNaN(when.getTime()) || when>now) return;
    const month=t.trackingMonth || supervisorMonthFromDate(t.date);
    const exists=supervisorTasks.some(x=>x.type==='visitrecord' && x.caseId===t.caseId && x.trackingMonth===month);
    if(!exists){
      supervisorTasks.push({id:`task_${Date.now()}_${Math.random().toString(36).slice(2,7)}`,type:'visitrecord',subject:t.subject,date:supervisorDateStr(now),startTime:'',endTime:'',priority:'normal',status:'pending',askedPeople:'',note:`${supervisorFormatDate(t.date)} ${t.startTime} 家訪後紀錄`,caseId:t.caseId,trackingMonth:month,visitDate:t.date,createdAt:Date.now(),updatedAt:Date.now()}); changed=true;
    }
    t.status='done'; t.completedAt=Date.now(); t.updatedAt=Date.now(); changed=true;
  });
  if(changed) saveSupervisorTasks();
}
function renderSupervisorDashboard(){ ensureSupervisorVisitRecordTasks(); renderSupervisorStats(); renderSupervisorTasks(); renderSupervisorCalendar(); }

// ===== 個案管理：每月家訪／電訪清單 =====
function supervisorCaseMonthType(item, monthKey){
  if(item.status!=='active') return 'inactive';
  const saved=item.followups?.[monthKey]; if(saved?.type) return saved.type;
  if(!item.lastVisitDate) return 'unset';
  const lastMonth=supervisorMonthFromDate(item.lastVisitDate);
  const dueMonth=supervisorAddMonthKey(lastMonth,3);
  return monthKey===dueMonth ? 'homevisit' : 'phonevisit';
}
function supervisorCaseMonthRecord(item, monthKey){ return item.followups?.[monthKey] || {}; }
function renderSupervisorCaseStats(){
  const month=supervisorTrackingMonth(); const active=supervisorCases.filter(c=>c.status==='active');
  const trackable=active.filter(c=>supervisorCaseMonthType(c,month)!=='unset');
  const completed=trackable.filter(c=>{const r=supervisorCaseMonthRecord(c,month);return !!(r.homeCompleted||r.phoneCompleted||r.completed);}).length;
  const pct=trackable.length?Math.round(completed/trackable.length*100):0;
  $('supervisorCaseStats').innerHTML=`<div class="supervisor-stat"><span>本月個案</span><strong>${trackable.length}</strong></div><div class="supervisor-stat"><span>已完成</span><strong>${completed}</strong></div><div class="supervisor-stat"><span>未完成</span><strong>${Math.max(0,trackable.length-completed)}</strong></div><div class="supervisor-stat"><span>完成度</span><strong>${pct}%</strong></div>`;
  const detail=$('supervisorCaseProgressDetail'); if(detail) detail.textContent='家訪、電訪直接勾選即可；原應電訪個案若臨時家訪，可改勾家訪。';
}
function openSupervisorCaseForm(item){
  const form=$('supervisorCaseForm'); if(!form) return; form.hidden=false;
  $('supervisorCaseFormTitle').textContent=item?'編輯個案':'新增個案'; $('supervisorCaseId').value=item?.id||''; $('supervisorCaseName').value=item?.name||'';
  $('supervisorCaseCms').value=item?.cms||''; $('supervisorCaseIdentity').value=item?.identity||''; renderSupervisorHandoverChecks(item?.handoverItems||[]);
  $('supervisorCaseStartDate').value=item?.startDate||''; $('supervisorCaseWorker').value=item?.homeCareWorker||''; $('supervisorCaseSchedule').value=item?(item.serviceScheduleExtra??item.serviceSchedule??''):''; renderSupervisorWeekSchedule(item?.serviceWeekSchedule||[]);
  $('supervisorCaseLastVisit').value=item?.lastVisitDate||''; $('supervisorCaseStatus').value=item?.status||'active'; $('supervisorCaseNote').value=item?.note||''; ['condition','serviceDetails','handoverNote'].forEach(k=>$(k+'Field').value=item?.[k]||''); $('supervisorCaseName').focus();
}
function closeSupervisorCaseForm(){ $('supervisorCaseForm').hidden=true; $('supervisorCaseId').value=''; }
function saveSupervisorCase(){
  const name=v('supervisorCaseName'); if(!name){showToast('請填寫個案姓名');return;}
  const weekly=readSupervisorWeekSchedule();
  const invalid=weekly.find(x=>x.checked&&((!!x.start!==!!x.end)||(x.start&&x.end&&x.end<=x.start)));
  if(invalid){showToast(SUPERVISOR_WEEKDAYS[invalid.day]+'請填完整時段，結束時間須晚於開始時間');return;}
  const id=v('supervisorCaseId'), existing=supervisorCases.find(c=>c.id===id);
  const item=normalizeSupervisorCase({id:id||`case_${Date.now()}_${Math.random().toString(36).slice(2,7)}`,name,cms:v('supervisorCaseCms'),identity:v('supervisorCaseIdentity'),handoverItems:readSupervisorHandoverChecks(),startDate:v('supervisorCaseStartDate'),homeCareWorker:v('supervisorCaseWorker'),serviceWeekSchedule:weekly,serviceScheduleExtra:v('supervisorCaseSchedule'),lastVisitDate:v('supervisorCaseLastVisit'),status:v('supervisorCaseStatus')||'active',note:v('supervisorCaseNote'),condition:v('conditionField'),serviceDetails:v('serviceDetailsField'),handoverNote:v('handoverNoteField'),followups:existing?.followups||{},createdAt:existing?.createdAt||Date.now(),updatedAt:Date.now()});
  if(existing) supervisorCases=supervisorCases.map(c=>c.id===id?item:c); else supervisorCases.push(item); saveSupervisorCases(); closeSupervisorCaseForm(); renderSupervisorCases(); showToast(existing?'已更新個案':'已新增個案');
}
function deleteSupervisorCase(id){ const item=supervisorCases.find(c=>c.id===id); if(!item||!confirm(`確定刪除「${item.name}」？`))return; supervisorCases=supervisorCases.filter(c=>c.id!==id);saveSupervisorCases();renderSupervisorCases(); }
function completeSupervisorPhoneVisit(id){
  const item=supervisorCases.find(c=>c.id===id); if(!item)return; const month=supervisorTrackingMonth(); item.followups=item.followups||{};
  const old=item.followups[month]||{}; item.followups[month]={...old,type:'phonevisit',completed:!old.completed,completedAt:old.completed?null:Date.now()}; item.updatedAt=Date.now(); saveSupervisorCases();renderSupervisorCases();
}
function completeSupervisorHomeVisit(id){
  const item=supervisorCases.find(c=>c.id===id); if(!item)return;
  const month=supervisorTrackingMonth(); item.followups=item.followups||{};
  const old=item.followups[month]||{};
  if(old.completed){
    item.followups[month]={...old,type:'homevisit',completed:false,completedAt:null};
    item.updatedAt=Date.now(); saveSupervisorCases(); renderSupervisorCases(); return;
  }
  let visitDate=old.scheduledDate||'';
  if(!visitDate){
    visitDate=prompt(`請輸入「${item.name}」本次家訪日期（YYYY-MM-DD）`,`${month}-01`);
    if(visitDate===null){renderSupervisorCases();return;}
    if(!/^\d{4}-\d{2}-\d{2}$/.test(visitDate)||supervisorMonthFromDate(visitDate)!==month){
      showToast(`請輸入 ${supervisorRocMonth(month)} 內的日期`); renderSupervisorCases(); return;
    }
  }
  item.followups[month]={...old,type:'homevisit',completed:true,completedAt:Date.now(),visitDate};
  item.lastVisitDate=visitDate; item.updatedAt=Date.now();
  supervisorTasks.forEach(t=>{
    if(t.caseId===id && t.trackingMonth===month && (t.type==='visitrecord'||t.type==='homevisit') && t.status!=='done'){
      t.status='done'; t.updatedAt=Date.now();
    }
  });
  saveSupervisorTasks(); saveSupervisorCases(); renderSupervisorDashboard(); renderSupervisorCases(); showToast('已完成本月家訪');
}
function toggleSupervisorMonthlyVisit(id, visitType){
  const item=supervisorCases.find(c=>c.id===id); if(!item)return;
  const month=supervisorTrackingMonth(); item.followups=item.followups||{};
  const old=item.followups[month]||{};
  const field=visitType==='homevisit'?'homeCompleted':'phoneCompleted';
  const now=!old[field];
  const next={...old,[field]:now,[field+'At']:now?Date.now():null};
  // 家訪完成即視為本月追蹤完成；應電訪個案臨時家訪也可以直接完成。
  if(visitType==='homevisit' && now){
    let visitDate=old.scheduledDate||`${month}-01`;
    next.visitDate=visitDate;
    item.lastVisitDate=visitDate;
    supervisorTasks.forEach(t=>{
      if(t.caseId===id && t.trackingMonth===month && (t.type==='visitrecord'||t.type==='homevisit') && t.status!=='done'){
        t.status='done'; t.updatedAt=Date.now();
      }
    });
    saveSupervisorTasks();
  }
  next.completed=!!(next.homeCompleted||next.phoneCompleted);
  next.completedAt=next.completed?Date.now():null;
  item.followups[month]=next; item.updatedAt=Date.now();
  saveSupervisorCases(); renderSupervisorDashboard(); renderSupervisorCases();
}
function scheduleSupervisorCaseVisit(id){
  const item=supervisorCases.find(c=>c.id===id); if(!item)return; const month=supervisorTrackingMonth();
  const date=prompt(`請輸入「${item.name}」家訪日期（YYYY-MM-DD）`,`${month}-01`); if(date===null)return;
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||supervisorMonthFromDate(date)!==month){showToast(`請選擇 ${supervisorRocMonth(month)} 內的日期`);return;}
  const time=prompt('請輸入家訪時間（HH:MM）','09:00'); if(time===null)return; if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)){showToast('時間格式不正確');return;}
  const existing=supervisorTasks.find(t=>t.type==='homevisit'&&t.caseId===id&&t.trackingMonth===month&&t.status!=='done');
  if(existing){existing.date=date;existing.startTime=time;existing.updatedAt=Date.now();}
  else supervisorTasks.push({id:`task_${Date.now()}_${Math.random().toString(36).slice(2,7)}`,type:'homevisit',subject:item.name,date,startTime:time,endTime:'',priority:'normal',status:'pending',askedPeople:'',note:'定期家訪',caseId:id,trackingMonth:month,createdAt:Date.now(),updatedAt:Date.now()});
  item.followups=item.followups||{}; item.followups[month]={...(item.followups[month]||{}),type:'homevisit',completed:false,scheduledDate:date,scheduledTime:time}; saveSupervisorTasks();saveSupervisorCases();renderSupervisorCases();showToast(`已排定 ${supervisorFormatDate(date)} ${time} 家訪`);
}
function renderSupervisorCases(){
  if(!$('supervisorCaseList'))return; ensureSupervisorVisitRecordTasks(); renderSupervisorCaseStats(); const month=supervisorTrackingMonth();
  if($('supervisorTrackingMonthLabel')) $('supervisorTrackingMonthLabel').textContent=supervisorRocMonth(month);
  const keyword=(v('supervisorCaseSearch')||'').toLowerCase(), statusFilter=v('supervisorCaseFilter')||'all';
  let list=supervisorCases.filter(item=>(statusFilter==='all'||item.status===statusFilter)&&(!keyword||[item.name,item.homeCareWorker,item.serviceSchedule,item.note].some(x=>String(x||'').toLowerCase().includes(keyword))));
  const rank={homevisit:0,phonevisit:1,unset:2,inactive:3};
  list.sort((a,b)=>{
    const ar=rank[supervisorCaseMonthType(a,month)]??9,br=rank[supervisorCaseMonthType(b,month)]??9;if(ar!==br)return ar-br;
    const A=supervisorCaseMonthRecord(a,month),B=supervisorCaseMonthRecord(b,month);
    const ad=!!(A.homeCompleted||A.phoneCompleted||A.completed),bd=!!(B.homeCompleted||B.phoneCompleted||B.completed);
    if(ad!==bd)return ad-bd; return a.name.localeCompare(b.name,'zh-Hant');
  });
  if(!list.length){$('supervisorCaseList').innerHTML='<div class="supervisor-empty">目前沒有符合條件的個案。</div>';return;}
  $('supervisorCaseList').innerHTML=`<div class="visit-simple-head"><span>個案</span><span>家訪</span><span>電訪</span><span>安排</span><span></span></div>`+list.map(item=>{
    const type=supervisorCaseMonthType(item,month),rec=supervisorCaseMonthRecord(item,month);
    const inactive=type==='inactive', unset=type==='unset';
    const legacyDone=!!rec.completed && !('homeCompleted' in rec) && !('phoneCompleted' in rec);
    const homeDone=!!rec.homeCompleted || (legacyDone && rec.type==='homevisit');
    const phoneDone=!!rec.phoneCompleted || (legacyDone && rec.type==='phonevisit');
    const done=homeDone||phoneDone;
    const sched=rec.scheduledDate?`${supervisorFormatDate(rec.scheduledDate)} ${rec.scheduledTime||''}`:'';
    const due=type==='homevisit'?'應家訪':type==='phonevisit'?'應電訪':unset?'未設定':item.status==='paused'?'暫停':'結案';
    return `<article class="supervisor-case-card visit-simple-row ${done?'is-monthly-done':''}" data-id="${supervisorEscape(item.id)}">
      <div class="visit-simple-name"><strong>${supervisorEscape(item.name)}</strong><small>${due}${sched?`・已排 ${sched}`:''}</small></div>
      <label class="visit-simple-check"><input class="case-home-simple" type="checkbox" ${homeDone?'checked':''} ${inactive||unset?'disabled':''}><span>✓</span></label>
      <label class="visit-simple-check"><input class="case-phone-simple" type="checkbox" ${phoneDone?'checked':''} ${inactive||unset?'disabled':''}><span>✓</span></label>
      <div><button class="secondary-btn case-schedule" type="button" ${inactive||unset?'disabled':''}>${sched?'改期':'排家訪'}</button></div>
      <div><button class="task-action case-edit" type="button">個案資料／交班事項</button><button class="task-action case-handover" type="button">產出交班資訊</button></div>
    </article>`;
  }).join('');
  document.querySelectorAll('#supervisorCaseList .supervisor-case-card').forEach(card=>{
    const id=card.dataset.id;
    card.querySelector('.case-handover')?.addEventListener('click',()=>openSupervisorHandover(id));
    card.querySelector('.case-schedule')?.addEventListener('click',()=>scheduleSupervisorCaseVisit(id));
    card.querySelector('.case-home-simple')?.addEventListener('change',()=>toggleSupervisorMonthlyVisit(id,'homevisit'));
    card.querySelector('.case-phone-simple')?.addEventListener('change',()=>toggleSupervisorMonthlyVisit(id,'phonevisit'));
    card.querySelector('.case-edit')?.addEventListener('click',()=>openSupervisorCaseForm(supervisorCases.find(c=>c.id===id)));
  });
}
function switchSupervisorView(view){
  supervisorView=view==='tasks'?'tasks':'cases';
  document.querySelectorAll('.supervisor-mode-btn').forEach(btn=>btn.classList.toggle('active',btn.dataset.supervisorView===supervisorView));
  $('supervisorTaskView').hidden=supervisorView!=='tasks';
  $('supervisorCaseView').hidden=supervisorView!=='cases';
  $('supervisorShowAll').hidden=supervisorView!=='tasks';
  $('supervisorAddTask').hidden=supervisorView!=='tasks';
  $('supervisorAddCase').hidden=supervisorView!=='cases';
  $('supervisorImportCases').hidden=supervisorView!=='cases';
  $('supervisorDownloadTemplate').hidden=supervisorView!=='cases';
  $('supervisorExportData').hidden=supervisorView!=='cases';
  $('supervisorClearData').hidden=supervisorView!=='cases';
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
    name,cms:read(['CMS','CMS等級','cms']).replace(/CMS\s*/i,''),identity:read(['身分別','identity']),handoverItems:(()=>{try{return JSON.parse(read(['交班勾選資料','handoverItems'])||'[]');}catch{return [];}})(),
    startDate:normalizeImportedDate(read(['開始服務日','服務開始日','開案日','startDate'])),
    homeCareWorker:read(['主責居服員','居服員','服務人員','homeCareWorker']),
    serviceSchedule:read(['服務時間','服務頻率','服務型態','serviceSchedule']),
    ...(()=>{const raw=read(['每週時段資料','serviceWeekSchedule']);try{return raw?{serviceWeekSchedule:JSON.parse(raw),serviceScheduleExtra:read(['排班補充','serviceScheduleExtra'])}:{};}catch{return {};}})(),
    lastVisitDate:normalizeImportedDate(read(['最近家訪日','最近家訪日期','上次家訪日','lastVisitDate'])),
    status,
    note:read(['備註','note']),condition:read(['個案體況','condition']),serviceDetails:read(['服務細節','serviceDetails']),handoverNote:read(['交班備註','handoverNote'])
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
      if(old){
        const source=rows.find(row=>mapSupervisorImportRow(row)?.name===item.name)||{};
        const fields={cms:['CMS','CMS等級','cms'],identity:['身分別','identity'],handoverItems:['交班勾選資料','handoverItems'],condition:['個案體況','condition'],serviceDetails:['服務細節','serviceDetails'],handoverNote:['交班備註','handoverNote']};
        for(const [key,aliases] of Object.entries(fields))if(!Object.keys(source).some(k=>aliases.includes(String(k).trim())))item[key]=old[key]||(key==='handoverItems'?[]:'');
        Object.assign(old,{...item,followups:old.followups||{},id:old.id,createdAt:old.createdAt,updatedAt:Date.now()});
      }
      else { supervisorCases.push(item); byName.set(item.name,item); }
    });
    saveSupervisorCases(); renderSupervisorCases(); showToast(`已匯入 ${imported.length} 筆個案`);
  }catch(err){ console.error(err); showToast('匯入失敗，請確認檔案格式'); }
  finally{ $('supervisorCaseFile').value=''; }
}
function downloadSupervisorTemplate(){
  const headers=['每週時段資料','排班補充','CMS','身分別','交班勾選資料','個案姓名','開始服務日','居服員','服務時間','最近家訪日','狀態','備註','個案體況','服務細節','交班備註'];
  if(typeof XLSX!=='undefined'){
    const ws=XLSX.utils.aoa_to_sheet([headers,headers.map(()=> '')]); const wb=XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb,ws,'居督個案名單'); XLSX.writeFile(wb,'居督個案名單_空白範本.xlsx');
    return;
  }
  const csv='\uFEFF'+headers.join(',')+'\n';
  const blob=new Blob([csv],{type:'text/csv;charset=utf-8'}); const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download='居督個案名單_空白範本.csv'; a.click(); URL.revokeObjectURL(url);
}


function supervisorExportRows(){
  const rows=[];
  supervisorCases.forEach(item=>{
    const months=Object.keys(item.followups||{}).sort();
    if(!months.length){
      rows.push({
        '個案姓名':item.name,'服務狀態':item.status==='active'?'服務中':item.status==='paused'?'暫停服務':'已結案',
        '開始服務日':item.startDate||'','居服員':item.homeCareWorker||'','服務時間':item.serviceSchedule||'','每週時段資料':JSON.stringify(item.serviceWeekSchedule||[]),'排班補充':item.serviceScheduleExtra||'',
        '最近家訪日':item.lastVisitDate||'','月份':'','家訪完成':'','電訪完成':'','排定家訪日期':'','排定家訪時間':'','備註':item.note||'','個案體況':item.condition||'','服務細節':item.serviceDetails||'','交班備註':item.handoverNote||'','CMS':item.cms||'','身分別':item.identity||'','交班勾選資料':JSON.stringify(item.handoverItems||[])
      });
      return;
    }
    months.forEach(month=>{
      const r=item.followups[month]||{};
      const legacyHome=!!r.completed&&r.type==='homevisit'&&!('homeCompleted' in r);
      const legacyPhone=!!r.completed&&r.type==='phonevisit'&&!('phoneCompleted' in r);
      rows.push({
        '個案姓名':item.name,'服務狀態':item.status==='active'?'服務中':item.status==='paused'?'暫停服務':'已結案',
        '開始服務日':item.startDate||'','居服員':item.homeCareWorker||'','服務時間':item.serviceSchedule||'','每週時段資料':JSON.stringify(item.serviceWeekSchedule||[]),'排班補充':item.serviceScheduleExtra||'',
        '最近家訪日':item.lastVisitDate||'','月份':month,
        '家訪完成':(r.homeCompleted||legacyHome)?'V':'','電訪完成':(r.phoneCompleted||legacyPhone)?'V':'',
        '排定家訪日期':r.scheduledDate||'','排定家訪時間':r.scheduledTime||'','備註':item.note||'','個案體況':item.condition||'','服務細節':item.serviceDetails||'','交班備註':item.handoverNote||'','CMS':item.cms||'','身分別':item.identity||'','交班勾選資料':JSON.stringify(item.handoverItems||[])
      });
    });
  });
  return rows;
}
function exportSupervisorData(){
  if(!supervisorCases.length && !supervisorTasks.length){showToast('目前沒有可匯出的居督資料');return;}
  const rows=supervisorExportRows();
  const taskRows=supervisorTasks.map(t=>({
    '日期':t.date||'','開始時間':t.startTime||'','結束時間':t.endTime||'','類型':SUPERVISOR_TYPE_META[t.type]?.label||t.type||'',
    '個案／事項':t.subject||'','狀態':t.status==='done'?'已完成':'待辦','追蹤月份':t.trackingMonth||'','備註':t.note||''
  }));
  const stamp=supervisorDateStr(new Date()).replaceAll('-','');
  if(typeof XLSX!=='undefined'){
    const wb=XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(rows.length?rows:[{'個案姓名':''}]),'個案家電訪');
    XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(taskRows.length?taskRows:[{'日期':''}]),'待辦與家訪排程');
    XLSX.writeFile(wb,`居督工作台備份_${stamp}.xlsx`);
    showToast('已匯出居督工作台資料'); return;
  }
  const backup={version:'supervisor-v3.3',exportedAt:new Date().toISOString(),cases:supervisorCases,tasks:supervisorTasks};
  const blob=new Blob([JSON.stringify(backup,null,2)],{type:'application/json;charset=utf-8'});
  const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`居督工作台備份_${stamp}.json`;a.click();URL.revokeObjectURL(url);
  showToast('已匯出居督工作台備份');
}
function clearSupervisorData(){
  if(!supervisorCases.length && !supervisorTasks.length){showToast('目前沒有居督資料可清除');return;}
  const first=confirm('確定要清除本機所有「居督工作台」資料嗎？\n\n將刪除：個案清冊、家電訪完成紀錄、家訪排程及居督待辦。\n此操作無法復原，建議先按「匯出資料」備份。');
  if(!first)return;
  const verify=prompt('此操作無法復原。\n若確定清除，請輸入：清除');
  if(verify!=='清除'){showToast('已取消清除');return;}
  localStorage.removeItem(SUPERVISOR_STORAGE_KEY);
  localStorage.removeItem(SUPERVISOR_CASE_STORAGE_KEY);
  supervisorTasks=[]; supervisorCases=[]; supervisorSelectedDate=''; window.dispatchEvent(new Event('supervisor-data-changed'));
  renderSupervisorDashboard(); renderSupervisorCases(); showToast('已清除居督工作台本機資料');
}

function initSupervisorTool(){
  if(!$('supervisorTool')) return;
  loadSupervisorTasks(); loadSupervisorCases(); supervisorCalendarCursor=new Date(new Date().getFullYear(),new Date().getMonth(),1); supervisorTrackingCursor=new Date(new Date().getFullYear(),new Date().getMonth(),1); ensureSupervisorVisitRecordTasks();
  document.querySelectorAll('.supervisor-mode-btn').forEach(btn=>btn.addEventListener('click',()=>switchSupervisorView(btn.dataset.supervisorView)));
  $('supervisorAddTask')?.addEventListener('click',()=>openSupervisorForm());
  $('supervisorCloseForm')?.addEventListener('click',closeSupervisorForm);
  $('supervisorCancelTask')?.addEventListener('click',closeSupervisorForm);
  $('supervisorSaveTask')?.addEventListener('click',saveSupervisorTask);
  $('supervisorTaskType')?.addEventListener('change',updateSupervisorTaskFields);
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
  $('supervisorExportData')?.addEventListener('click',exportSupervisorData);
  $('supervisorClearData')?.addEventListener('click',clearSupervisorData);
  $('supervisorTrackingPrev')?.addEventListener('click',()=>{supervisorTrackingCursor.setMonth(supervisorTrackingCursor.getMonth()-1);renderSupervisorCases();});
  $('supervisorTrackingNext')?.addEventListener('click',()=>{supervisorTrackingCursor.setMonth(supervisorTrackingCursor.getMonth()+1);renderSupervisorCases();});
  $('supervisorTrackingToday')?.addEventListener('click',()=>{supervisorTrackingCursor=new Date(new Date().getFullYear(),new Date().getMonth(),1);renderSupervisorCases();});
  switchSupervisorView('cases');
}
