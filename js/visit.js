function makeSelect(label, options, id){
  return `<label>${label}<select id="${id}">${options.map(o=>`<option>${o}</option>`).join('')}</select></label>`;
}
function checkHtml(label,id,value=''){
  return `<label class="check-item"><input type="checkbox" id="${id}" value="${value || label}"><span>${label}</span></label>`;
}
function initVisitFields(){
  Object.entries(visitFieldGroups).forEach(([container,fields])=>{
    const el = $(container);
    if(el) el.innerHTML = fields.map(([label,options],idx)=>makeSelect(label,options,`${container}_${idx}`)).join('');
  });
  $('environmentChecks').innerHTML = environmentOptions.map((x,i)=>checkHtml(x,`env_${i}`)).join('');
  $('incidentChecks').innerHTML = incidentOptions.map((x,i)=>checkHtml(x,`inc_${i}`)).join('');
  $('needChecks').innerHTML = needOptions.map((x,i)=>checkHtml(x,`need_${i}`)).join('');
  $('visitServiceChecks').innerHTML = serviceData.map(s=>checkHtml(`${s.code} ${s.name}`,`svc_${s.code}`,s.code)).join('');
  ['BA01','BA07','BA15'].forEach(code=>{ const el = $(`svc_${code}`); if(el) el.checked = true; });
}
function selectedChecks(containerId){
  const el = $(containerId);
  return el ? Array.from(el.querySelectorAll('input:checked')).map(i=>i.value || i.nextElementSibling.textContent.trim()) : [];
}
function getFieldTexts(containerId){
  const el = $(containerId);
  if(!el) return [];
  return Array.from(el.querySelectorAll('label')).map(label=>{
    const name = label.childNodes[0].textContent.trim();
    const value = label.querySelector('select').value;
    return {name,value};
  });
}
function sentenceFromFields(containerId){
  const fields = getFieldTexts(containerId);
  return fields.length ? fields.map(f=>`${f.name}為${f.value}`).join('，') + '。' : '';
}

function makeVisitRecord(){
  const selectedCodes = selectedChecks('visitServiceChecks');
  const services = selectedCodes.map(code=>serviceData.find(s=>s.code===code)).filter(Boolean);
  const env = selectedChecks('environmentChecks');
  const inc = selectedChecks('incidentChecks');
  const needs = selectedChecks('needChecks');

  const healthNote = $('healthNote').value.trim();
  const environmentNote = $('environmentNote').value.trim();
  const extraNote = $('extraNote').value.trim();

  const serviceNames = services.map(s=>`${s.code}${s.name}`).join('、') || '目前未勾選特定服務碼別';
  const goals = [...new Set(services.map(s=>s.goal))];
  const plans = services.map(s=>`${s.code}：${s.plan}`);
  const followups = services.map(s=>s.followup);

  const purpose = $('visitPurpose').value;
  const adjust = $('needAdjust').value;

  const sections = [];
  sections.push(`一、個案狀況評估
本次家訪重點為${purpose}。個案狀況評估如下：${sentenceFromFields('physicalFields')}${healthNote ? '補充說明：' + healthNote + '。' : ''}`);
  sections.push(`二、居住環境與主要照顧者評估
本次訪視評估居住環境：${env.length ? env.join('、') : '未勾選環境項目'}。${environmentNote ? '補充說明：' + environmentNote + '。' : '後續持續留意居家動線及照顧安全。'}
主要照顧者評估：${sentenceFromFields('caregiverFields')}後續持續關注照顧者負荷及照顧資源使用情形。`);
  sections.push(`三、服務使用及執行情形
個案目前使用服務包含：${serviceNames}。${sentenceFromFields('serviceUseFields')}
${followups.join('')}`);
  sections.push(`四、居家服務目標
${goals.length ? goals.map((g,i)=>`${i+1}. ${g}`).join('\n') : '目前未勾選服務碼別，故未自動產生服務目標。'}`);
  sections.push(`五、服務計畫
${plans.length ? plans.map((p,i)=>`${i+1}. ${p}`).join('\n') : '目前未勾選服務碼別，故未自動產生服務計畫。'}`);
  const incidentText = inc.includes('無特殊異常事件') ? '近期無特殊異常事件。' : (inc.length ? `近期需追蹤異常事件包含：${inc.join('、')}。` : '未勾選異常事件。');
  const needText = needs.includes('暫無新增需求') ? '目前暫無新增需求。' : (needs.length ? `目前需求變化包含：${needs.join('、')}。` : '未勾選需求變化。');
  sections.push(`六、異常事件與需求變化
${incidentText}${needText}${adjust !== '暫無調整需求' ? '服務調整評估：' + adjust + '。' : '目前服務安排暫無調整需求。'}`);
  sections.push(`七、家訪結論及後續建議
本次家訪評估個案服務使用情形大致穩定，居服員服務執行狀況將持續依照顧計畫追蹤。後續將持續關注個案身心狀況、居住環境安全、主要照顧者負荷及服務需求變化，必要時再與相關單位討論服務調整。${extraNote ? '\n補充紀錄：' + extraNote : ''}`);

  lastVisitSections = {
    full: sections.join('\n\n'),
    assessment: sections.slice(0,3).join('\n\n'),
    plan: sections.slice(3,5).join('\n\n'),
    conclusion: sections.slice(5,7).join('\n\n')
  };
  $('visitOutput').value = lastVisitSections.full;
}

async function copyText(text, label='內容'){
  if(!text || !text.trim()){
    makeVisitRecord();
    text = lastVisitSections.full || $('visitOutput').value;
  }
  try{
    await navigator.clipboard.writeText(text);
    showToast(`已複製${label}`);
  }catch(err){
    const output = $('visitOutput') || $('mutationOutput');
    if(output){ output.focus(); output.select(); document.execCommand('copy'); }
    showToast(`已複製${label}`);
  }
}
function showToast(message){
  const oldToast = document.querySelector('.copy-toast');
  if(oldToast) oldToast.remove();
  const toast = document.createElement('div');
  toast.className = 'copy-toast';
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(()=>toast.remove(),1800);
}
function initVisitAccordion(){
  const blocks = Array.from(document.querySelectorAll('#visitTool .visit-block'));
  blocks.forEach(block=>{
    block.addEventListener('toggle',()=>{
      if(block.open) blocks.forEach(other=>{ if(other !== block) other.open = false; });
    });
  });
}
function initVisitTool(){
  if(!$('visitTool')) return;
  initVisitFields();
  initVisitAccordion();
  $('generateVisit').addEventListener('click',makeVisitRecord);
  $('copyVisit').addEventListener('click',()=>{ if(!$('visitOutput').value.trim()) makeVisitRecord(); copyText(lastVisitSections.full || $('visitOutput').value, '完整紀錄'); });
  $('copyPlan').addEventListener('click',()=>{ if(!$('visitOutput').value.trim()) makeVisitRecord(); copyText(lastVisitSections.plan, '服務計畫'); });
  $('copyConclusion').addEventListener('click',()=>{ if(!$('visitOutput').value.trim()) makeVisitRecord(); copyText(lastVisitSections.conclusion, '家訪結論'); });
  $('clearVisit').addEventListener('click',()=>{
    document.querySelectorAll('#visitTool textarea').forEach(t=>t.value='');
    document.querySelectorAll('#visitTool input[type="checkbox"]').forEach(c=>c.checked=false);
    $('visitOutput').value='';
    lastVisitSections = {};
  });
}

