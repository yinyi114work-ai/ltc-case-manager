// 居督專用：與個管版使用不同儲存鍵、Worker 及 Notion 授權。
let supervisorHandoverCase=null;
function renderHandoverServices(selected=[]){
  $('handoverServiceChecks').innerHTML=[...new Set([...SUPERVISOR_SERVICE_ITEMS,...selected])].map(label=>`<label class="check-item"><input type="checkbox" value="${supervisorEscape(label)}" ${selected.includes(label)?'checked':''}>${supervisorEscape(label)}</label>`).join('');
}
function refreshHandoverSlots(){
  const c=supervisorHandoverCase;if(!c)return;
  const date=v('handoverDate');const day=date?(new Date(date+'T12:00:00').getDay()+6)%7:null;
  $('handoverSlot').innerHTML='<option value="">自行設定本次時段</option>'+c.serviceWeekSchedule.map((x,i)=>({x,i})).filter(({x})=>x.checked&&(day===null||x.day===day)).map(({x,i})=>`<option value="${i}">${supervisorEscape(SUPERVISOR_WEEKDAYS[x.day]+' '+(x.start||'未填')+'–'+(x.end||'未填')+' '+(x.worker||c.homeCareWorker||''))}</option>`).join('');
  $('handoverStart').value='';$('handoverEnd').value='';$('handoverAssigned').value=c.homeCareWorker||'';$('handoverSlotNote').value='';$('handoverServices').value='';renderHandoverServices();previewSupervisorHandover();
}
function chooseHandoverSlot(){
  const index=v('handoverSlot'),x=index!==''?supervisorHandoverCase?.serviceWeekSchedule[Number(index)]:null;
  $('handoverStart').value=x?.start||'';$('handoverEnd').value=x?.end||'';$('handoverAssigned').value=x?.worker||supervisorHandoverCase?.homeCareWorker||'';$('handoverSlotNote').value=x?.note||'';$('handoverServices').value='';renderHandoverServices(x?.services||[]);previewSupervisorHandover();
}
function openSupervisorHandover(id){
  const c=supervisorCases.find(c=>c.id===id);if(!c)return;
  supervisorHandoverCase=normalizeSupervisorCase(c);
  $('supervisorHandover').hidden=false;
  $('handoverUpdated').textContent='個案資料最後更新：'+new Date(c.updatedAt).toLocaleString('zh-TW');
  const values={Name:c.name,Cms:c.cms?'CMS '+c.cms:'',Identity:c.identity,Worker:c.homeCareWorker,Checklist:supervisorChecklistText(c.handoverItems),Care:supervisorCareText(c),SlotNote:'',Assigned:c.homeCareWorker,Start:'',End:'',Date:supervisorDateStr(new Date()),Time:'',Services:'',Condition:c.condition,Details:c.serviceDetails,Notes:c.handoverNote,Temporary:'',Output:''};
  Object.entries(values).forEach(([key,value])=>$('handover'+key).value=value||'');
  refreshHandoverSlots();$('supervisorHandover').scrollIntoView({behavior:'smooth',block:'start'});
}
function previewSupervisorHandover(){
  const start=v('handoverStart'),end=v('handoverEnd');
  $('handoverTime').value=start||end?(start||'未填')+'–'+(end||'未填'):'';
  const services=[...document.querySelectorAll('#handoverServiceChecks input:checked')].map(x=>x.value);if(v('handoverServices'))services.push(v('handoverServices'));
  const entries=[['個案',v('handoverName')],['CMS',v('handoverCms')],['身分別',v('handoverIdentity')],['主責居服員',v('handoverWorker')],['交班事項',v('handoverChecklist')],['服務日期',v('handoverDate')],['服務時段',v('handoverTime')],['本次服務人員',v('handoverAssigned')],['服務項目',services.join('、')],['身高、體重與照顧資訊',v('handoverCare')],['時段備註',v('handoverSlotNote')],['個案體況',v('handoverCondition')],['服務細節',v('handoverDetails')],['交班備註',v('handoverNotes')],['本次臨時交代',v('handoverTemporary')]];
  $('handoverOutput').value='📋 個案交班\n'+entries.filter(([,val])=>val).map(([label,val])=>label+'：'+val).join('\n');
}
(()=>{
  const SESSION='ltcSupervisorNotionSessionV1';
  let session=localStorage.getItem(SESSION)||'', revision=null, ready=false, busy=false, dirty=false;
  const incoming=new URLSearchParams(location.hash.slice(1));
  if(incoming.has('supervisor_notion_session')){
    session=incoming.get('supervisor_notion_session');localStorage.setItem(SESSION,session);
    history.replaceState(null,'',location.pathname+location.search);dirty=true;
  }
  function status(text){$('supervisorSyncStatus').textContent=text;}
  function state(){return {version:1,app:'ltc-supervisor',cases:supervisorCases,todos:supervisorTasks,visits:[],homeVisits:[]};}
  function backup(){const blob=new Blob([JSON.stringify({...state(),exportedAt:new Date().toISOString()},null,2)],{type:'application/json'});const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='居督完整備份_'+supervisorDateStr(new Date())+'.json';a.click();URL.revokeObjectURL(url);}
  function valid(data){return data?.app==='ltc-supervisor'&&Array.isArray(data.cases)&&Array.isArray(data.todos)&&[...data.cases,...data.todos].every(x=>x&&typeof x.id==='string')&&new Set(data.cases.map(x=>x.id)).size===data.cases.length&&new Set(data.todos.map(x=>x.id)).size===data.todos.length;}
  function apply(data){if(!valid(data))throw new Error('資料格式不正確，已保留本機資料');supervisorCases=data.cases.map(normalizeSupervisorCase);supervisorTasks=data.todos;saveSupervisorCases();saveSupervisorTasks();renderSupervisorCases();renderSupervisorDashboard();}
  function base(){const raw=(window.SUPERVISOR_NOTION_WORKER||'').trim();if(!raw)throw new Error('請先在 js/notion-config.js 設定居督專用 Worker 網址');const u=new URL(raw);if(u.protocol!=='https:')throw new Error('Worker 網址必須使用 HTTPS');return u.origin;}
  async function api(path,options={}){
    if(!session)throw new Error('請先連結 Notion');
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),120000);
    try{const response=await fetch(base()+path,{...options,signal:controller.signal,headers:{'Content-Type':'application/json',Authorization:'Bearer '+session},cache:'no-store'});const data=await response.json();if(!response.ok){if(response.status===401){ready=false;throw new Error('連線已失效，請重新授權');}if(data.error==='sync_conflict'){ready=false;throw new Error('其他裝置已更新資料。請先備份本機，再讀取雲端，整合後儲存');}throw new Error(data.error==='sync_busy'?'同步正在處理，請稍後再試':data.message||data.error||'同步失敗');}return data;}
    finally{clearTimeout(timer);}
  }
  async function run(action){if(busy)return;busy=true;document.querySelectorAll('#supervisorSyncPanel button').forEach(b=>b.disabled=true);try{await action();}catch(e){status(e.name==='AbortError'?'連線逾時，本機資料已保留；請先讀取雲端確認上次是否完成':e.message);}finally{busy=false;document.querySelectorAll('#supervisorSyncPanel button').forEach(b=>b.disabled=false);}}
  $('handoverClose').onclick=()=>$('supervisorHandover').hidden=true;
  $('handoverPreview').onclick=previewSupervisorHandover;
  $('handoverSlot').onchange=chooseHandoverSlot;
  $('handoverDate').onchange=refreshHandoverSlots;
  $('handoverServiceChecks').onchange=previewSupervisorHandover;
  $('handoverCopy').onclick=()=>{const start=v('handoverStart'),end=v('handoverEnd');if(!start||!end||end<=start){showToast('請填寫完整本次時段，結束須晚於開始');return;}if(!v('handoverOutput'))previewSupervisorHandover();copyText(v('handoverOutput'),'交班資訊');};
  document.querySelectorAll('#supervisorHandover input, #supervisorHandover textarea:not(#handoverOutput)').forEach(el=>el.addEventListener('input',previewSupervisorHandover));
  window.addEventListener('supervisor-data-changed',()=>{dirty=true;status(session?'本機資料已變更，尚未儲存至 Notion':'本機資料已儲存，尚未連結 Notion');});
  $('supervisorJsonBackup').onclick=backup;
  $('supervisorJsonRestore').onclick=()=>$('supervisorJsonFile').click();
  $('supervisorJsonFile').onchange=async e=>{const file=e.target.files[0];if(!file)return;try{const data=JSON.parse(await file.text());if(!valid(data))throw new Error('請選擇居督完整 JSON 備份');if(!confirm('還原將取代本機個案與待辦，是否先備份並繼續？'))return;backup();apply(data);ready=false;status('已還原本機資料；請先讀取並確認雲端版本再上傳');}catch(error){showToast(error.message);}finally{e.target.value='';}};
  $('supervisorConnect').onclick=()=>{try{location.href=base()+'/auth/notion/start';}catch(e){status(e.message);}};
  $('supervisorPull').onclick=()=>run(async()=>{
    if((dirty||supervisorCases.length||supervisorTasks.length)&&!confirm('讀取會取代本機資料。若本機有未上傳內容，請先按完整備份 JSON；繼續時也會下載一份本機備份。是否繼續？'))return;
    status('正在讀取 Notion…');const before=JSON.stringify(state());const remote=await api('/api/notion/state');
    if(before!==JSON.stringify(state()))throw new Error('讀取期間本機已修改，已停止套用；請重新讀取');
    if(remote.exists){if(!valid(remote.state))throw new Error('雲端資料不屬於居督版');backup();apply(remote.state);dirty=false;}
    revision=remote.revision||null;ready=true;status(remote.exists?'已讀取雲端資料；編輯後請儲存至 Notion':'雲端尚無資料，可儲存目前本機資料至 Notion');
  });
  $('supervisorPush').onclick=()=>run(async()=>{
    if(!ready)throw new Error('請先按「讀取雲端資料」確認版本，再儲存');
    const snapshot=JSON.stringify(state());status('正在儲存至 Notion…');const result=await api('/api/notion/state',{method:'PUT',body:JSON.stringify({baseRevision:revision,state:JSON.parse(snapshot)})});revision=result.revision;
    dirty=snapshot!==JSON.stringify(state());status(dirty?'上一份資料已同步，但仍有新修改待儲存':'已儲存至 Notion：'+new Date(result.savedAt).toLocaleString('zh-TW'));
  });
  $('supervisorDisconnect').onclick=()=>run(async()=>{if(!confirm('解除此裝置連線？本機資料與 Notion 留存資料會保留。'))return;await api('/api/notion/disconnect',{method:'POST'});session='';localStorage.removeItem(SESSION);ready=false;revision=null;status('已解除此裝置連線');});
  status(session?'已連結；請先讀取雲端資料確認版本':'尚未連結；目前資料存於本機');
})();
