const $ = id => document.getElementById(id);
const money = n => (Math.floor(Number(n) || 0)).toLocaleString('zh-TW');
let currentCodeCat = 'care';

function rateFor(service, identity){
  if(identity === 'first') return 0;
  const r = RATES[service.rateGroup] || RATES.care;
  return identity === 'second' ? r.second : r.third;
}
function selfPay(service, identity){ return Math.floor(service.price * rateFor(service, identity)); }
function val(id){ return ($(id)?.value || '').trim(); }
function num(id){ return Number($(id)?.value) || 0; }
function roc(s){ if(!s) return '○年○月○日'; const [y,m,d]=s.split('-').map(Number); return `${y-1911}年${m}月${d}日`; }
function checkItem(x, checked=false){ return `<label class="check-item"><input type="checkbox" value="${x}" ${checked?'checked':''}><span>${x}</span></label>`; }
function checkedVals(id){ return Array.from(document.querySelectorAll(`#${id} input:checked`)).map(x=>x.value); }

function initTabs(){
  document.querySelectorAll('.tab').forEach(btn=>btn.addEventListener('click',()=>{
    document.querySelectorAll('.tab').forEach(x=>x.classList.remove('active'));
    document.querySelectorAll('.panel').forEach(x=>x.classList.remove('active'));
    btn.classList.add('active'); $(btn.dataset.target).classList.add('active');
  }));
  document.querySelectorAll('.subtab').forEach(btn=>btn.addEventListener('click',()=>{
    document.querySelectorAll('.subtab').forEach(x=>x.classList.remove('active'));
    btn.classList.add('active'); currentCodeCat = btn.dataset.cat; renderCodes();
  }));
}

function prorate(amount, dateStr){
  if(!dateStr) return {amount, days:null, total:null};
  const d = new Date(dateStr + 'T00:00:00');
  const y = d.getFullYear(), m = d.getMonth() + 1, day = d.getDate();
  const total = new Date(y, m, 0).getDate();
  const days = total - day + 1;
  return { amount: Math.round(amount * days / total), days, total };
}
function initQuota(){
  $('qLevel').innerHTML = Object.entries(CMS).map(([k,v])=>`<option value="${k}">第${k}級｜${money(v)}元/月</option>`).join('');
  ['qLevel','qDate','qForeign'].forEach(id=>$(id).addEventListener('change', calcQuota));
  calcQuota();
}
function calcQuota(){
  const level = $('qLevel').value || 2;
  const foreign = $('qForeign').value === 'yes';
  const date = $('qDate').value;
  const monthly = CMS[level];
  const careMonthly = foreign ? Math.floor(monthly * 0.7) : monthly;
  const careP = prorate(careMonthly, date);
  const transportCards = Object.entries(TRANSPORT_QUOTA).map(([zone, amount])=>{
    const p = prorate(amount, date);
    return `<div class="quota-card"><span>交通接送｜第${zone}區</span><b>${money(amount)}元/月</b><small>${date ? `首月約 ${money(p.amount)} 元（${p.days}/${p.total}天）` : '輸入開案日期可計算首月比例'}</small></div>`;
  }).join('');
  const respite = Number(level) >= 7 ? 48510 : 32340;
  const shortStay = Number(level) >= 7 ? 71610 : 87780;
  $('quotaOut').innerHTML = `
    <div class="quota-card"><span>照顧及專業服務</span><b>${money(careMonthly)}元/月</b><small>${foreign ? '已套用外看70%額度。' : ''}${date ? `首月約 ${money(careP.amount)} 元（${careP.days}/${careP.total}天）` : '輸入開案日期可計算首月比例'}</small></div>
    ${transportCards}
    <div class="quota-card"><span>輔具及居家無障礙</span><b>40,000元</b><small>三年額度，依評估與補助規定辦理</small></div>
    <div class="quota-card"><span>喘息服務</span><b>${money(respite)}元/年</b><small>${Number(level)>=7?'第7–8級':'第2–6級'}</small></div>
    ${foreign ? `<div class="quota-card"><span>外看短照服務</span><b>${money(shortStay)}元/年</b><small>${Number(level)>=7?'第7–8級':'第2–6級'}，聘有外籍看護工者適用</small></div>` : ''}`;
}

function initCodes(){ $('codeSearch').addEventListener('input', renderCodes); renderCodes(); }
function renderAidVisual(s){
  if(s.cat !== 'assistive') return '';
  const cls = s.visualClass || 'aid-generic';
  return `<div class="aid-photo ${cls}"><div class="aid-title">${s.name}</div><div class="aid-object"></div><div class="aid-caption">${s.visualText || '輔具示意圖'}</div></div>`;
}
function renderCodes(){
  const q = ($('codeSearch').value || '').trim().toLowerCase();
  const list = SERVICE_DATA.filter(s => s.cat === currentCodeCat && [s.code,s.name,s.group,s.desc,s.note,s.talk,s.visualText].join(' ').toLowerCase().includes(q));
  $('codeList').innerHTML = list.map(s=>`
    <article class="service-card ${s.cat==='assistive'?'assist-card':''}">
      ${renderAidVisual(s)}
      <h3>${s.code}｜${s.name}</h3>
      <p><span class="tag">${s.group}</span><span class="tag">${money(s.price)}元／${s.unit}</span></p>
      <div class="price-grid"><div><span>支付價格</span><b>${money(s.price)}</b></div><div><span>第二類自付</span><b>${money(selfPay(s,'second'))}</b></div><div><span>第三類自付</span><b>${money(selfPay(s,'third'))}</b></div></div>
      <p><b>內容：</b>${s.desc}</p>
      ${s.talk ? `<div class="talk"><b>個管翻譯機：</b>${s.talk}</div>` : ''}
      <p><b>注意：</b>${s.note || '依支付基準及實際評估結果辦理。'}</p>
    </article>`).join('') || '<div class="card">查無符合項目。</div>';
}

function serviceOptions(){ return SERVICE_DATA.filter(s => s.cat === 'care' && s.rateGroup !== 'professional' || s.cat === 'care' && s.rateGroup === 'professional').map(s=>`<option value="${s.code}">${s.code} ${s.name}｜${money(s.price)}元/${s.unit}</option>`).join(''); }
function initCopay(){
  $('cpLevel').innerHTML = Object.entries(CMS).map(([k,v])=>`<option value="${k}">CMS ${k}｜${money(v)}元</option>`).join('');
  ['cpLevel','cpIdentity'].forEach(id=>$(id).addEventListener('change', calcCopay));
  addCopayRow('BA07', 4);
}
function addCopayRow(code='BA20', count=1){
  const div = document.createElement('div'); div.className = 'fee-row';
  div.innerHTML = `<label>碼別<select class="cpCode">${serviceOptions()}</select></label><label>每月次數<input class="cpCount" type="number" min="0" step="1" value="${count}"></label><button class="remove" type="button">刪除</button>`;
  div.querySelector('.cpCode').value = code;
  div.querySelector('.cpCode').addEventListener('change', calcCopay);
  div.querySelector('.cpCount').addEventListener('input', calcCopay);
  div.querySelector('.remove').addEventListener('click',()=>{div.remove(); calcCopay();});
  $('copayRows').appendChild(div); calcCopay();
}
function calcCopay(){
  const identity = $('cpIdentity').value;
  let quota = CMS[$('cpLevel').value] || 0;
  let remain = quota, total = 0, covered = 0, self = 0, over = 0;
  const lines = [];
  document.querySelectorAll('#copayRows .fee-row').forEach(row=>{
    const code = row.querySelector('.cpCode').value;
    const count = Number(row.querySelector('.cpCount').value) || 0;
    const s = SERVICE_DATA.find(x=>x.code===code); if(!s) return;
    for(let i=1;i<=count;i++){
      total += s.price;
      if(remain >= s.price){
        remain -= s.price; covered += s.price;
        const sp = selfPay(s, identity); self += sp;
        lines.push(`${s.code} ${s.name} 第${i}支：額度內，支付${money(s.price)}元，自付${money(sp)}元。`);
      }else{
        over += s.price; self += s.price;
        lines.push(`${s.code} ${s.name} 第${i}支：剩餘額度${money(remain)}元不足以支應一支服務，整支自費${money(s.price)}元。`);
      }
    }
  });
  $('cpTotal').textContent = money(total); $('cpQuotaShow').textContent = money(quota); $('cpSelfPay').textContent = money(self - over); $('cpOverage').textContent = money(over); $('cpClientTotal').textContent = money(self); $('cpRemain').textContent = money(remain);
  const notice = $('copayNotice');
  if(over > 0){ notice.className = 'notice-card danger'; notice.textContent = `⚠️ 已超出 CMS 額度，超額自費 ${money(over)} 元；預估自付總額 ${money(self)} 元。`; }
  else { notice.className = 'notice-card success'; notice.textContent = `✅ 目前尚未超出 CMS 額度，剩餘額度 ${money(remain)} 元；預估自付總額 ${money(self)} 元。`; }
  $('copayDetail').value = lines.join('\n') || '尚未加入服務。';
}

function initCarePlan(){
  const today = new Date(); $('cpVisitDate').value = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;
  const probs = ['行走問題','移位問題','上下樓梯問題','身體清潔或沐浴問題','進食／備餐問題','如廁與排泄問題','就醫或外出問題','居家環境安全問題','輔具或無障礙需求','主要照顧者負荷','營養／吞嚥／護理需求','社會參與不足','喘息或短照需求'];
  $('problemList').innerHTML = probs.map(x=>checkItem(x)).join('');
  const plans = ['照顧及專業服務','交通接送服務','輔具及居家無障礙改善服務','喘息服務／短照服務','轉介其他資源','AA08／AA09原因說明'];
  $('planItems').innerHTML = plans.map(x=>checkItem(x)).join('');
}
function generateCarePlan(){
  const problems = checkedVals('problemList').slice(0,5);
  const planItems = checkedVals('planItems');
  const intro = `本案於${roc(val('cpVisitDate'))}家訪，與${val('cpParticipants') || '個案及家屬'}討論照顧計畫。`;
  const summary = `1. 個案狀況：個案主要疾病／失能原因為${val('cpDisease')}，${val('cpRecent')}，目前${val('cpWalk')}，${val('cpADL')}。案家期待為${val('cpExpectation')}。${val('cpBodyNote') ? '補充說明：' + val('cpBodyNote') : ''}${val('cpExpectationNote') ? '案家期待補充：' + val('cpExpectationNote') : ''}\n2. 主要照顧者評估：個案目前${val('cpLive')}，主要照顧者為${val('cpCaregiver')}，${val('cpBurden')}，${val('cpSupport')}。${val('cpFamilyNote') ? '補充說明：' + val('cpFamilyNote') : ''}\n3. 環境與輔具評估：${val('cpEnv')}，${val('cpAid')}。${val('cpEnvNote') ? '補充說明：' + val('cpEnvNote') : ''}`;
  const probText = problems.length ? problems.map((p,i)=>`${i+1}. ${p}：${i===0 && val('cpProblemNote') ? val('cpProblemNote') : '依本次訪視評估，需納入照顧計畫追蹤。'}`).join('\n') : `1. 請依實際評估補充前5項照顧問題。${val('cpProblemNote') ? '\n補充：' + val('cpProblemNote') : ''}`;
  const exec = [];
  if(planItems.includes('照顧及專業服務')) exec.push(`一、照顧及專業服務：${val('cpCareServiceNote') || '依個案問題清單及照顧需求，核定合適之照顧及專業服務，並敘明服務頻率、內容與目標。'}`);
  if(planItems.includes('交通接送服務')) exec.push('二、交通接送服務：依個案就醫、復健或洗腎等固定外出需求，說明交通接送使用目的、地點及預約方式。');
  if(planItems.includes('輔具及居家無障礙改善服務')) exec.push('三、輔具及居家無障礙環境改善服務：依個案行動、移位、沐浴、如廁及居家動線安全需求，評估輔具或無障礙改善；如轉介輔具中心或二手輔具資源，應同時敘明。');
  if(planItems.includes('喘息服務／短照服務')) exec.push('四、喘息服務／短照服務：依主要照顧者負荷與家庭照顧安排，評估居家、社區、機構喘息或外看短照服務，並追蹤額度與使用情形。');
  if(planItems.includes('轉介其他資源')) exec.push('五、轉介其他資源：視需求連結家庭照顧者支持、失智社區服務據點、巷弄長照站、餐飲服務、緊急救援、社福中心或其他正式與非正式資源，並追蹤轉介結果。');
  if(planItems.includes('AA08／AA09原因說明')) exec.push('六、AA08／AA09原因說明：如需核定，請敘明訪談時間、提出對象及原因，並說明符合相關原則或評估量表項目。');
  if(val('cpOtherServiceNote')) exec.push('補充說明：' + val('cpOtherServiceNote'));
  $('carePlanOutput').value = `【${val('cpType')} 照顧計畫草稿】\n一、${intro}\n\n二、個案摘述：\n${summary}\n\n三、照顧問題：\n${probText}\n\n四、照顧計畫目標：\n1. 短期目標（1個月）：依個案主要照顧問題，先穩定基本生活照顧與居家安全，降低跌倒、照顧中斷或身體功能惡化風險。\n2. 中期目標（3個月）：透過服務穩定介入與資源連結，提升個案日常生活支持、服務適切性及主要照顧者照顧能力。\n3. 長期目標（6個月）：建立穩定照顧支持系統，維持個案在熟悉環境中安全生活，並定期追蹤服務效益與目標達成情形。\n\n五、照顧計畫執行規劃：\n${exec.join('\n') || '請勾選服務安排並補充服務頻率、內容及轉介資源。'}\n\n註：若案家訴求與照專評估不一致，請於計畫中補充差異原因；家務服務應敘明範圍，交通接送應描述就醫習慣，喘息服務應追蹤剩餘額度。`;
}

function addDays(date, days){ const d=new Date(date+'T00:00:00'); d.setDate(d.getDate()+days); return d.toLocaleDateString('zh-TW'); }
function checkRenewal(){
  const total=num('rTotal'), q=num('rQuality'), e=num('rEthics'), l=num('rLaw'), f=num('rFire'), em=num('rEmergency'), inf=num('rInfection'), g=num('rGender'), online=num('rOnline');
  const qel=q+e+l, safety=f+em+inf+g; let issues=[];
  if(total<120) issues.push(`六年總積分不足120點，目前${total}點。`);
  if(qel<24 || q===0 || e===0 || l===0) issues.push(`專業品質／倫理／法規需合計至少24點且各項不得為0，目前合計${qel}點。`);
  if(safety<10 || f===0 || em===0 || inf===0 || g===0) issues.push(`消防／緊急／感染／性別需合計至少10點且各項不得為0，目前合計${safety}點。`);
  if(online>80) issues.push('115/07/01起網路課程最高採認80點，請留意超過部分可能不採計。');
  if($('rCulture').value==='no') issues.push('原民／多元課程尚未完成，最快換證時間原則為到期後隔天且補足積分後辦理。');
  const end=val('rEnd'); const startApply=end?addDays(end,-183):'到期日前6個月';
  $('renewalOut').value = `【長照小卡換證初步檢核】\n小卡效期：${val('rStart')||'未填'} 至 ${val('rEnd')||'未填'}\n最早可申請時間：約 ${startApply}\n\n總積分：${total}點\n專業品質／倫理／法規：${qel}點\n消防／緊急／感染／性別：${safety}點\n網路課程：${online}點\n原民／多元：${$('rCulture').value==='yes'?'已完成':'未完成'}\n\n檢核結果：${issues.length?'尚需補強':'初步符合主要檢核條件'}${issues.length?'\n\n需注意：\n- '+issues.join('\n- '):'\n\n提醒：仍需依主管機關及實際積分審認結果為準。'}`;
}

function initPhone(){
  const scenarios = ['月例行追蹤','新開案一個月追蹤','出院後追蹤','服務異動追蹤','暫停服務追蹤','高風險個案追蹤','申訴案件追蹤','半年計畫評值前追蹤'];
  $('phoneScenario').innerHTML = scenarios.map((x,i)=>`<label class="check-item"><input type="radio" name="scenario" value="${x}" ${i===0?'checked':''}><span>${x}</span></label>`).join('');
  const topics = {
    '個案體況': ['近期身體狀況是否穩定？','是否有跌倒、急診或住院？','食慾、睡眠、排泄是否有變化？','疼痛、情緒或認知是否需追蹤？','是否有新診斷、新用藥或回診結果？'],
    '照顧及專業服務': ['居家服務是否穩定提供？','服務內容是否符合目前需求？','是否有請假、缺班、遲到或服務未遇？','專業服務是否已進場？目標是否有進展？','是否需增加、減少或調整服務？'],
    '交通接送': ['交通車是否預約順利？','是否有連續預約不到或臨時取消？','就醫地點或頻率是否改變？','是否需協助提供預約方式或增加照會單位？'],
    '輔具及居家無障礙': ['已核定輔具是否購置或領用？','輔具使用是否順利？','居家動線、浴室或門檻是否有新增風險？','是否需再轉介輔具中心或二手輔具？'],
    '喘息／短照／家照': ['照顧者近期照顧壓力如何？','喘息服務是否預約順利？','短照或外看請假需求是否出現？','家照據點或支持服務是否願意使用？'],
    '滿意度與後續處置': ['對服務單位與服務人員是否滿意？','是否有希望改善或申訴事項？','是否需調整照顧計畫？','是否有搬家、電話更換、家庭關係或照顧安排改變？']
  };
  $('phoneTopics').innerHTML = Object.entries(topics).map(([k,qs])=>`<div class="topic-box"><label class="check-item"><input type="checkbox" value="${k}" checked><span>${k}</span></label><ul>${qs.map(q=>`<li>${q}</li>`).join('')}</ul></div>`).join('');
  const d = new Date(); $('phDate').value = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; $('phTime').value = `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
}
function generatePhoneRecord(){
  const topics = Array.from(document.querySelectorAll('#phoneTopics input:checked')).map(x=>x.value);
  const scenario = document.querySelector('input[name="scenario"]:checked')?.value || '月例行追蹤';
  const base = `一、電訪日期：${roc(val('phDate'))}${val('phTime') ? ' ' + val('phTime') : ''}\n二、電訪對象：${val('phTarget')}\n三、訪談內容：本次以${val('phMethod')}進行${scenario}。`;
  const interview = [];
  if(topics.includes('個案體況')) interview.push(val('phHealthNote') || '聯繫對象表示案主近期體況尚穩定，無明顯跌倒、急診或住院情形，食慾、睡眠及排泄情形後續持續追蹤。');
  if(topics.includes('照顧及專業服務')) interview.push(val('phCareServiceNote') || '目前照顧及專業服務大致依照顧計畫穩定提供，暫無明顯服務異常或立即調整需求。');
  if(topics.includes('交通接送') || topics.includes('輔具及居家無障礙') || topics.includes('喘息／短照／家照')) interview.push(val('phOtherServiceNote') || '已關心交通接送、輔具使用、居家環境安全、喘息或家照支持等服務使用情形，暫無新增需求，後續持續追蹤。');
  if(topics.includes('滿意度與後續處置')) interview.push(val('phFollowNote') || '聯繫對象表示對目前服務尚可，後續由個管持續追蹤個案體況、服務使用情形及家庭需求。');
  const follow = [];
  follow.push(`一、照顧及專業服務：${val('phCareServiceNote') || '服務穩定，暫無須異動。'}`);
  follow.push(`二、交通接送服務：${topics.includes('交通接送') ? '已追蹤交通接送預約與使用情形，必要時協助增加照會或提供預約方式。' : '本次未反映新增交通接送需求。'}`);
  follow.push(`三、輔具及居家無障礙環境改善：${topics.includes('輔具及居家無障礙') ? '已追蹤輔具購置、使用情形及居家安全，必要時再評估轉介輔具或環改資源。' : '無新增需求。'}`);
  follow.push(`四、喘息服務／短照服務：${topics.includes('喘息／短照／家照') ? '已關心主要照顧者負荷及喘息、短照或家照支持需求，後續持續追蹤使用情形。' : '本次未反映新增喘息或短照需求。'}`);
  follow.push(`五、轉介其他資源：${val('phFollowNote') || '目前暫無新增轉介資源，後續依個案及家庭需求連結相關資源。'}`);
  $('phoneOut').value = `${base}\n${interview.join('')}\n\n【服務追蹤】\n${follow.join('\n')}\n\n註：每月電訪應避免重複複製貼上，需追蹤計畫措施、服務適應情形、滿意度、計畫效益及是否需調整服務內容。`;
}

async function copyById(id){
  const el = $(id); const text = el.value || el.innerText;
  try{ await navigator.clipboard.writeText(text); alert('已複製'); }
  catch(e){ if(el.select) el.select(); document.execCommand('copy'); alert('已複製'); }
}

document.addEventListener('DOMContentLoaded',()=>{ initTabs(); initQuota(); initCodes(); initCopay(); initCarePlan(); initPhone(); });
