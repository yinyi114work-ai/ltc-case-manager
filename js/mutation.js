// ===== 異動通報產生器 =====
const mutPersonOptions = {
  '個案本人': ['個案本人'],
  '家屬': ['案配偶','案子','案女','案媳','案婿','案孫','案兄弟姊妹','主要照顧者','其他'],
  '專業人員': ['個管師','照專','社工師','護理師','復能治療師','醫師','出院準備個管師','其他'],
  '機構／單位': ['醫院','護理之家','日照中心','居服單位','個管單位','社福單位','其他'],
  '其他': ['其他']
};
function todayStr(){ const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }
function nowTimeStr(){ const d = new Date(); return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`; }
function rocDate(dateStr){ if(!dateStr) return '○年○月○日'; const [y,m,d] = dateStr.split('-').map(Number); return y&&m&&d ? `${y-1911}年${m}月${d}日` : dateStr; }
function timeText(timeStr){ if(!timeStr) return ''; const [h,m] = timeStr.split(':'); return `${Number(h)}時${m}分`; }
function v(id){ return ($(id)?.value || '').trim(); }
function checkedValues(name){ return Array.from(document.querySelectorAll(`input[name="${name}"]:checked`)).map(x=>x.value); }
function checkboxList(name, items){ return `<div class="checkbox-grid">${items.map((x,i)=>`<label class="check-item"><input type="checkbox" name="${name}" value="${x}" ${i===0?'checked':''}><span>${x}</span></label>`).join('')}</div>`; }
function optionList(items){ return items.map(x=>`<option>${x}</option>`).join(''); }
function commonNoticePrefix(){ return `於${rocDate(v('mutDate'))}${timeText(v('mutTime'))}接獲${getMutPersonText()}${v('mutMethod') === '來電' ? '來電' : v('mutMethod')}通知`; }
function getMutPersonText(){
  const type = v('mutPersonType'), detail = v('mutPersonDetail'), other = v('mutPersonOther');
  if(type === '個案本人') return '個案本人';
  if(detail === '其他' || type === '其他') return other || '其他人員';
  return detail || type;
}
function unitSignature(){
  const unit = v('mutUnitName'), name = v('mutContactName'), title = v('mutContactTitle'), phone = v('mutContactPhone');
  const lines = [];
  if(unit) lines.push(unit);
  if(name || title) lines.push(`聯繫人：${name}${name && title ? ' ' : ''}${title}`.trim());
  if(phone) lines.push(`電話：${phone}`);
  return lines.length ? `\n${lines.join('\n')}` : '';
}
function updateMutPersonDetail(){ const type = v('mutPersonType') || '個案本人'; $('mutPersonDetail').innerHTML = optionList(mutPersonOptions[type] || ['其他']); }
function saveMutSettings(){
  localStorage.setItem('ltcLabMutationSettings', JSON.stringify({unit:v('mutUnitName'), name:v('mutContactName'), title:v('mutContactTitle'), phone:v('mutContactPhone')}));
  showToast('已儲存單位資訊');
}
function loadMutSettings(){
  try{
    const data = JSON.parse(localStorage.getItem('ltcLabMutationSettings') || '{}');
    $('mutUnitName').value = data.unit || '';
    $('mutContactName').value = data.name || '';
    $('mutContactTitle').value = data.title || '';
    $('mutContactPhone').value = data.phone || '';
  }catch(e){}
}

function renderMutationSpecific(){
  const type = v('mutType');
  const form = $('mutationSpecificForm');
  const personCard = $('mutPersonCard');
  if(personCard) personCard.style.display = type === 'quota' ? 'none' : '';
  if(!form) return;

  const reasonPause = ['住院','外宿','出國','家屬自行照顧','個案拒絕服務','人力媒合中','個案死亡','其他'];
  const reasonEnd = ['個案死亡','入住機構','轉換服務單位','搬遷外縣市','不符合資格','拒絕服務','其他'];
  const reasonDelay = ['家屬時間無法配合','個案住院','個案失聯','服務區域無人力','指定居服員','持續媒合中','其他'];
  const reasonAdjust = ['個案需求改變','功能退化','功能改善','家屬需求改變','額度不足','其他'];
  const typeAdjust = ['增加服務','減少服務','更換碼別','調整頻率','調整時間'];
  const incidentSvc = ['送醫事件','照顧意外事件','藥物事件','治安事件','傷害事件','公共意外事件','違反專業倫理','其他'];
  const incidentAny = ['家庭暴力事件','性侵害事件','自殺意圖','自傷事件'];
  const harms = ['無受傷害','輕度','中度','重度','極重度','死亡'];
  const missed = ['個案外出','無人應門','個案拒絕服務','家屬取消','臨時就醫','個案失聯','其他'];

  const html = {
    pause: `<div class="card"><h3 class="card-title">暫停服務</h3><div class="grid-2">
      <label>暫停類型<select id="mutPauseKind"><option value="single">單次服務暫停</option><option value="period">期間暫停服務</option></select></label>
      <label>暫停原因<select id="mutPauseReason">${optionList(reasonPause)}</select></label>
      <label class="pause-single-field">暫停日期<input id="mutPauseDate" type="date"></label>
      <label class="pause-period-field">暫停起始日<input id="mutPauseStart" type="date"></label>
      <label class="pause-period-field">預計恢復日（可不填）<input id="mutPauseEnd" type="date"></label>
      <label>補充說明<input id="mutPauseNote" placeholder="例如：當日回診、住院治療、家屬暫自行照顧"></label>
    </div></div>`,
    end: `<div class="card"><h3 class="card-title">結束服務</h3><div class="grid-2">
      <label>結束原因<select id="mutEndReason">${optionList(reasonEnd)}</select></label>
      <label>結束服務日期<input id="mutEndDate" type="date"></label>
      <label>服務紀錄<select id="mutEndRecord"><option>已完成登打</option><option>尚未完成登打</option><option>無服務紀錄需登打</option></select></label>
      <label>預計完成登打日（尚未完成時填）<input id="mutEndRecordDate" type="date"></label>
    </div><p class="small-note">需要個管協助事項</p>${checkboxList('mutEndHelp',['協助結案流程','協助分配額度','協助轉介'])}</div>`,
    first: `<div class="card"><h3 class="card-title">第一次服務進場</h3><div class="grid-2">
      <label>接獲照會日期<input id="mutFirstReferralDate" type="date"></label>
      <label>聯繫日期<input id="mutFirstContactDate" type="date"></label>
      <label>聯繫時間<input id="mutFirstContactTime" type="time"></label>
      <label>預計第一次服務日期<input id="mutFirstServiceDate" type="date"></label>
      <label>預計第一次服務時間<input id="mutFirstServiceTime" type="time"></label>
      <label>補充說明<input id="mutFirstNote" placeholder="可不填"></label>
    </div></div>`,
    delay: `<div class="card"><h3 class="card-title">未能於時效內進場服務</h3><div class="grid-2">
      <label>接獲照會日期<input id="mutDelayReferralDate" type="date"></label>
      <label>無法時效內進場原因<select id="mutDelayReason">${optionList(reasonDelay)}</select></label>
      <label>預計第一次服務日期<input id="mutDelayServiceDate" type="date"></label>
      <label>預計第一次服務時間<input id="mutDelayServiceTime" type="time"></label>
      <label>補充說明<input id="mutDelayNote" placeholder="例如：持續與案家協調服務時間"></label>
    </div></div>`,
    adjust: `<div class="card"><h3 class="card-title">服務型態調整</h3><div class="grid-2">
      <label>調整原因<select id="mutAdjustReason">${optionList(reasonAdjust)}</select></label>
      <label>調整類型<select id="mutAdjustType">${optionList(typeAdjust)}</select></label>
      <label>調整日期<input id="mutAdjustDate" type="date"></label>
      <label>補充說明<input id="mutAdjustNote" placeholder="例如：沐浴需求增加、陪同外出需求減少"></label>
      <label>原核定碼別及支數<input id="mutAdjustOriginal" placeholder="例如：BA07每月8組"></label>
      <label>調整後碼別及支數<input id="mutAdjustNew" placeholder="例如：BA07每月12組"></label>
    </div></div>`,
    quota: `<div class="card"><h3 class="card-title">額度開立回報</h3>
      <p class="hint-text">彙整個案實際服務使用單位，提供個管師協助開立服務額度，以利後續核銷作業。</p>
      <div class="grid-2">
        <label>適用月份<input id="mutQuotaMonth" type="month"></label>
        <label>補充說明<input id="mutQuotaNote" placeholder="可不填，例如：本期服務使用穩定"></label>
      </div>
      <div class="button-row"><button id="addMutQuotaRow" class="secondary-btn" type="button">＋新增碼別</button></div>
      <div id="mutQuotaRows" class="mut-row-list"></div>
      <p id="mutQuotaCalc" class="small-note"></p></div>`,
    incident: `<div class="card"><h3 class="card-title">異常事件通報</h3><div class="grid-2">
      <label>是否為服務期間發生<select id="mutIncidentDuring"><option>是</option><option>否</option></select></label>
      <label>事件類型<select id="mutIncidentType">${optionList(incidentSvc)}</select></label>
      <label>事件發生／發現日期<input id="mutIncidentDate" type="date"></label>
      <label>事件發生／發現時間<input id="mutIncidentTime" type="time"></label>
      <label>發生地點<select id="mutIncidentPlace">${optionList(['案家','案家附近','醫院','社區','其他'])}</select></label>
      <label>發現人<select id="mutIncidentFinder">${optionList(['居服員','居督','家屬','個案','其他'])}</select></label>
      <label>傷害程度<select id="mutIncidentHarm">${optionList(harms)}</select></label>
      <label>導致結果<input id="mutIncidentResult" placeholder="例如：送醫、輕微擦傷、未造成傷害"></label>
    </div><label>事件發生經過<textarea id="mutIncidentProcess" placeholder="請簡要描述事件發生或發現經過"></textarea></label><p class="small-note">後續處置（可複選）</p>${checkboxList('mutIncidentAction',['已通知家屬','已通知個管','已通知照專','已送醫','已通報警政機關','持續追蹤','其他'])}</div>`,
    missed: `<div class="card"><h3 class="card-title">服務未遇</h3><div class="grid-2">
      <label>預計服務日期<input id="mutMissedDate" type="date"></label>
      <label>預計服務時間<input id="mutMissedTime" type="time"></label>
      <label>服務未遇原因<select id="mutMissedReason">${optionList(missed)}</select></label>
      <label>補充說明<input id="mutMissedNote" placeholder="例如：現場無人應門，電話聯繫未果"></label>
    </div></div>`
  }[type] || '';
  form.innerHTML = html;

  if(type === 'pause'){
    const pauseKind = $('mutPauseKind');
    const updatePauseFields = ()=>{
      const isSingle = pauseKind.value === 'single';
      document.querySelectorAll('.pause-single-field').forEach(el=>el.style.display = isSingle ? '' : 'none');
      document.querySelectorAll('.pause-period-field').forEach(el=>el.style.display = isSingle ? 'none' : '');
    };
    pauseKind.addEventListener('change', updatePauseFields);
    updatePauseFields();
  }
  if(type === 'quota'){
    $('addMutQuotaRow').addEventListener('click',()=>addMutQuotaRow());
    addMutQuotaRow('BA07', 1);
  }
  if(type === 'incident'){
    const during = $('mutIncidentDuring');
    const updateIncidentTypes = ()=>{ $('mutIncidentType').innerHTML = optionList(during.value === '是' ? incidentSvc : incidentAny); };
    during.addEventListener('change', updateIncidentTypes);
    updateIncidentTypes();
  }
}

function addMutQuotaRow(code='BA07', count=1){
  const wrap = document.createElement('div');
  wrap.className = 'mut-row';
  wrap.innerHTML = `<label>碼別<select class="mut-quota-code">${serviceOptionHtml()}</select></label><label>單位數<input class="mut-quota-count" type="number" min="0" step="1" value="${count}"></label><button class="remove-row" type="button">刪除</button>`;
  wrap.querySelector('.mut-quota-code').value = code;
  wrap.querySelector('.mut-quota-code').addEventListener('change', updateMutQuotaCalc);
  wrap.querySelector('.mut-quota-count').addEventListener('input', updateMutQuotaCalc);
  wrap.querySelector('.remove-row').addEventListener('click',()=>{wrap.remove();updateMutQuotaCalc();});
  $('mutQuotaRows').appendChild(wrap);
  updateMutQuotaCalc();
}
function getMutQuotaRows(){
  return Array.from(document.querySelectorAll('#mutQuotaRows .mut-row')).map(row=>{
    const code = row.querySelector('.mut-quota-code').value;
    const count = Number(row.querySelector('.mut-quota-count').value || 0);
    const svc = serviceData.find(s=>s.code===code);
    return {code, count, svc, subtotal: svc ? svc.price * count : 0};
  }).filter(x=>x.svc && x.count>0);
}
function updateMutQuotaCalc(){
  if(!$('mutQuotaCalc')) return;
  const rows = getMutQuotaRows();
  const totalUnits = rows.reduce((sum,x)=>sum+x.count,0);
  const totalAmount = rows.reduce((sum,x)=>sum+x.subtotal,0);
  $('mutQuotaCalc').textContent = `總使用單位：${money(totalUnits)}；預估使用金額：${money(totalAmount)}元。`;
}

function generateMutation(){
  const type = v('mutType');
  const prefix = commonNoticePrefix();
  let text = '';
  if(type === 'pause'){
    const note = v('mutPauseNote') ? `，${v('mutPauseNote')}` : '';
    if(v('mutPauseKind') === 'single'){
      text = `${prefix}，因${v('mutPauseReason')}${note}，故${rocDate(v('mutPauseDate'))}單次服務暫停，以上通報。`;
    }else{
      const end = v('mutPauseEnd') ? `，預計暫停至${rocDate(v('mutPauseEnd'))}` : '';
      text = `${prefix}，因${v('mutPauseReason')}${note}，故自${rocDate(v('mutPauseStart'))}起暫停服務${end}，以上通報。`;
    }
  }else if(type === 'end'){
    const record = v('mutEndRecord') === '尚未完成登打' ? `目前服務紀錄尚未完成登打，預計於${rocDate(v('mutEndRecordDate'))}前完成` : (v('mutEndRecord') === '無服務紀錄需登打' ? '本案無服務紀錄需登打' : '目前服務紀錄已完成登打');
    const help = checkedValues('mutEndHelp');
    text = `${prefix}，因${v('mutEndReason')}，故自${rocDate(v('mutEndDate'))}起結束服務。${record}${help.length ? `，並請個管師${help.join('、')}` : ''}，以上通報。`;
  }else if(type === 'first'){
    const note = v('mutFirstNote') ? `，${v('mutFirstNote')}` : '';
    text = `於${rocDate(v('mutFirstReferralDate'))}接獲照會，並於${rocDate(v('mutFirstContactDate'))}${timeText(v('mutFirstContactTime'))}與${getMutPersonText()}聯繫，預計於${rocDate(v('mutFirstServiceDate'))}${timeText(v('mutFirstServiceTime'))}提供第一次服務${note}，以上通報。`;
  }else if(type === 'delay'){
    const note = v('mutDelayNote') ? `，${v('mutDelayNote')}` : '，目前單位持續協調及媒合服務安排';
    text = `於${rocDate(v('mutDelayReferralDate'))}接獲照會，因${v('mutDelayReason')}，故未能於規定時效內提供第一次服務${note}，預計於${rocDate(v('mutDelayServiceDate'))}${timeText(v('mutDelayServiceTime'))}提供第一次服務，以上通報。`;
  }else if(type === 'adjust'){
    const note = v('mutAdjustNote') ? `，${v('mutAdjustNote')}` : '';
    text = `${prefix}，因${v('mutAdjustReason')}${note}，預計自${rocDate(v('mutAdjustDate'))}起${v('mutAdjustType')}。原核定為${v('mutAdjustOriginal') || '未填寫'}，調整後為${v('mutAdjustNew') || '未填寫'}，請個管師協助確認服務需求並調整照顧計畫，以上通報。`;
  }else if(type === 'quota'){
    const rows = getMutQuotaRows();
    const totalUnits = rows.reduce((sum,x)=>sum+x.count,0);
    const totalAmount = rows.reduce((sum,x)=>sum+x.subtotal,0);
    const details = rows.length ? rows.map(x=>`${x.code}${x.svc.name}，共使用${x.count}單位。`).join('\n') : '未填寫碼別及單位數。';
    const note = v('mutQuotaNote') ? `\n補充說明：${v('mutQuotaNote')}。` : '';
    text = `個案實際服務使用情形如下：

${details}

經統計，本期總使用單位為${money(totalUnits)}，預估使用金額為${money(totalAmount)}元。${note}
敬請協助開立服務額度，以利後續核銷作業，謝謝。`;
  }else if(type === 'incident'){
    const actions = checkedValues('mutIncidentAction');
    const during = v('mutIncidentDuring') === '是';
    const auto = during ? '已完成異常事件通報單並送照管中心備查' : '已於照管平台完成異動通報';
    text = `於${rocDate(v('mutIncidentDate'))}${timeText(v('mutIncidentTime'))}，${v('mutIncidentFinder')}發現個案於${v('mutIncidentPlace')}發生${v('mutIncidentType')}。事件經過：${v('mutIncidentProcess') || '未填寫'}。本事件傷害程度為${v('mutIncidentHarm')}，導致結果為${v('mutIncidentResult') || '未填寫'}。後續處置：${actions.length ? actions.join('、') : '未填寫'}，${auto}，以上通報。`;
  }else if(type === 'missed'){
    const note = v('mutMissedNote') ? `，${v('mutMissedNote')}` : '';
    text = `於${rocDate(v('mutMissedDate'))}${timeText(v('mutMissedTime'))}預計進場提供服務，惟因${v('mutMissedReason')}${note}，現場無法提供服務，服務單位已完成相關紀錄，以上通報。`;
  }
  $('mutationOutput').value = text + unitSignature();
}
function clearMutation(){
  document.querySelectorAll('#mutationTool input').forEach(inp=>{
    if(['mutUnitName','mutContactName','mutContactTitle','mutContactPhone'].includes(inp.id)) return;
    if(['date','time','month','number','text'].includes(inp.type)) inp.value = '';
  });
  document.querySelectorAll('#mutationTool textarea').forEach(t=>t.value='');
  $('mutationOutput').value = '';
  $('mutDate').value = todayStr();
  $('mutTime').value = nowTimeStr();
}
function initMutationTool(){
  if(!$('mutationTool')) return;
  loadMutSettings();
  $('mutDate').value = todayStr();
  $('mutTime').value = nowTimeStr();
  updateMutPersonDetail();
  renderMutationSpecific();
  $('mutPersonType').addEventListener('change', updateMutPersonDetail);
  $('mutType').addEventListener('change', renderMutationSpecific);
  $('saveMutSettings').addEventListener('click', saveMutSettings);
  $('generateMutation').addEventListener('click', generateMutation);
  $('copyMutation').addEventListener('click',()=>{ if(!$('mutationOutput').value.trim()) generateMutation(); copyText($('mutationOutput').value, '異動通報'); });
  $('clearMutation').addEventListener('click', clearMutation);
}


