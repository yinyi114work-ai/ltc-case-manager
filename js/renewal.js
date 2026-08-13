// ===== 長照小卡換證檢核器 =====
let lastRenewalText = '';
const CULTURE_CUTOFF_OLD_END = new Date(2024, 5, 2);  // 113/06/02
const CULTURE_CUTOFF_NEW_START = new Date(2024, 5, 3); // 113/06/03
const ONLINE_LIMIT_START = new Date(2026, 6, 1); // 115/07/01

function n(id){ return Number(($(id)?.value || 0)); }
function parseDateInput(id){
  const value = v(id);
  if(!value) return null;
  const [y,m,d] = value.split('-').map(Number);
  if(!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}
function formatDateTW(date){
  if(!(date instanceof Date) || isNaN(date)) return '未填寫';
  return `${date.getFullYear() - 1911}年${date.getMonth() + 1}月${date.getDate()}日`;
}
function addYears(date, years){
  const d = new Date(date.getTime());
  d.setFullYear(d.getFullYear() + years);
  return d;
}
function addMonths(date, months){
  const d = new Date(date.getTime());
  d.setMonth(d.getMonth() + months);
  return d;
}
function addDays(date, days){
  const d = new Date(date.getTime());
  d.setDate(d.getDate() + days);
  return d;
}
function cultureCourseRowHtml(){
  return `<div class="renew-course-row">
    <label>上課日期<input class="culture-date" type="date"></label>
    <label>課程類別<select class="culture-type"><option value="old">舊制／多元文化族群</option><option value="indigenous">原住民族文化敏感度及能力</option><option value="multicultural">多元族群文化敏感度及能力</option></select></label>
    <label>積分<input class="culture-points" type="number" min="0" step="0.5" value="1"></label>
    <button class="remove-row" type="button">刪除</button>
  </div>`;
}
function addCultureCourseRow(){
  const wrap = document.createElement('div');
  wrap.innerHTML = cultureCourseRowHtml();
  const row = wrap.firstElementChild;
  row.querySelector('.remove-row').addEventListener('click',()=>row.remove());
  $('cultureCourseRows').appendChild(row);
}
function getCultureCourses(){
  return Array.from(document.querySelectorAll('#cultureCourseRows .renew-course-row')).map(row=>{
    const dateStr = row.querySelector('.culture-date').value;
    const [y,m,d] = dateStr ? dateStr.split('-').map(Number) : [];
    const date = y && m && d ? new Date(y, m - 1, d) : null;
    return {
      date,
      dateStr,
      type: row.querySelector('.culture-type').value,
      points: Number(row.querySelector('.culture-points').value || 0)
    };
  }).filter(x=>x.date && !isNaN(x.date) && x.points > 0);
}
function buildCardYears(start, end){
  const years = [];
  if(!start || !end || end < start) return years;
  for(let i=0; i<6; i++){
    const yStart = addYears(start, i);
    let yEnd = addDays(addYears(start, i + 1), -1);
    if(yStart > end) break;
    if(yEnd > end) yEnd = new Date(end.getTime());
    years.push({index:i+1, start:yStart, end:yEnd});
  }
  return years;
}
function courseInRange(course, start, end){
  return course.date >= start && course.date <= end;
}
function checkRenewal(){
  const issues = [];
  const okItems = [];
  const cultureIssues = [];
  const start = parseDateInput('renewStart');
  const end = parseDateInput('renewEnd');

  const total = n('renewTotalPoints');
  const online = n('renewOnlinePoints');
  const onlineLimitApplies = !!(end && end >= ONLINE_LIMIT_START);
  const onlineExcess = onlineLimitApplies ? Math.max(online - 80, 0) : 0;
  const countedTotal = Math.max(total - onlineExcess, 0);

  const quality = n('renewQuality');
  const ethics = n('renewEthics');
  const law = n('renewLaw');
  const qelTotal = quality + ethics + law;
  const qelCounted = Math.min(qelTotal, 36);
  const fire = n('renewFire');
  const emergency = n('renewEmergency');
  const infection = n('renewInfection');
  const gender = n('renewGender');
  const requiredTotal = fire + emergency + infection + gender;

  if(!start) issues.push('未填寫小卡生效日。');
  if(!end) issues.push('未填寫小卡到期日。');
  if(start && end && end < start) issues.push('小卡到期日不可早於生效日。');

  if(onlineLimitApplies){
    if(online > 80){
      issues.push(`115/07/01 起網路課程最高採認 80 點；目前填寫 ${online} 點，超過 ${onlineExcess} 點不列計，採計後總積分為 ${countedTotal} 點。`);
    }else{
      okItems.push(`網路課程 ${online} 點，未超過 80 點採認上限。`);
    }
  }

  if(countedTotal >= 120) okItems.push(`六年總積分採計 ${countedTotal} 點，已達 120 點。`);
  else issues.push(`六年總積分採計目前 ${countedTotal} 點，尚缺 ${Math.max(120-countedTotal,0)} 點。`);

  if(quality > 0 && ethics > 0 && law > 0 && qelTotal >= 24){
    okItems.push(`專業品質／倫理／法規合計 ${qelTotal} 點，採計 ${qelCounted} 點，符合至少 24 點且各項不為 0。`);
  }else{
    const missing = [];
    if(quality <= 0) missing.push('專業品質');
    if(ethics <= 0) missing.push('專業倫理');
    if(law <= 0) missing.push('專業法規');
    if(qelTotal < 24) issues.push(`專業品質／倫理／法規合計目前 ${qelTotal} 點，尚缺 ${24-qelTotal} 點。`);
    if(missing.length) issues.push(`${missing.join('、')}目前為 0 點，需至少有積分。`);
  }

  if(fire > 0 && emergency > 0 && infection > 0 && gender > 0 && requiredTotal >= 10){
    okItems.push(`消防／緊急／感染／性別合計 ${requiredTotal} 點，符合至少 10 點且各項不為 0。`);
  }else{
    const missing = [];
    if(fire <= 0) missing.push('消防安全');
    if(emergency <= 0) missing.push('緊急應變');
    if(infection <= 0) missing.push('感染管制');
    if(gender <= 0) missing.push('性別敏感度');
    if(requiredTotal < 10) issues.push(`消防／緊急／感染／性別合計目前 ${requiredTotal} 點，尚缺 ${10-requiredTotal} 點。`);
    if(missing.length) issues.push(`${missing.join('、')}目前為 0 點，需至少完成一堂／有積分。`);
  }

  const courses = getCultureCourses();
  const oldCultureTotal = courses
    .filter(c=>c.type === 'old' && c.date <= CULTURE_CUTOFF_OLD_END)
    .reduce((sum,c)=>sum+c.points,0);
  if(oldCultureTotal >= 2) okItems.push(`113/06/02 以前舊制／多元文化族群課程合計 ${oldCultureTotal} 點，已達 2 點。`);
  else cultureIssues.push(`113/06/02 以前舊制／多元文化族群課程合計 ${oldCultureTotal} 點，尚缺 ${Math.max(2-oldCultureTotal,0)} 點。`);

  const yearLines = [];
  if(start && end && end >= CULTURE_CUTOFF_NEW_START){
    const years = buildCardYears(start, end).filter(y=>y.end >= CULTURE_CUTOFF_NEW_START);
    years.forEach(y=>{
      const checkStart = y.start < CULTURE_CUTOFF_NEW_START ? CULTURE_CUTOFF_NEW_START : y.start;
      const indigenous = courses.filter(c=>c.type === 'indigenous' && courseInRange(c, checkStart, y.end)).reduce((sum,c)=>sum+c.points,0);
      const multicultural = courses.filter(c=>c.type === 'multicultural' && courseInRange(c, checkStart, y.end)).reduce((sum,c)=>sum+c.points,0);
      const line = `第${y.index}年度（${formatDateTW(checkStart)}～${formatDateTW(y.end)}）：原民 ${indigenous} 點／多元 ${multicultural} 點`;
      yearLines.push(`${indigenous >= 1 && multicultural >= 1 ? '✅' : '❌'} ${line}`);
      if(indigenous < 1) cultureIssues.push(`第${y.index}年度缺原住民族文化敏感度及能力 ${1-indigenous} 點。`);
      if(multicultural < 1) cultureIssues.push(`第${y.index}年度缺多元族群文化敏感度及能力 ${1-multicultural} 點。`);
    });
    if(years.length && yearLines.every(line=>line.startsWith('✅'))) okItems.push('113/06/03 以後各小卡年度之原民／多元課程皆已達標。');
  }

  issues.push(...cultureIssues);
  const hasCultureIssue = cultureIssues.length > 0;
  let canApplyDate = '請先填寫小卡到期日';
  if(end){
    canApplyDate = hasCultureIssue ? formatDateTW(addDays(end, 1)) : formatDateTW(addMonths(end, -6));
  }
  const finalOk = issues.length === 0;
  const resultTitle = finalOk ? '✅ 初步符合換證條件' : '⚠️ 尚未符合換證條件';
  const summary = $('renewalSummary');
  summary.className = `renewal-summary ${finalOk ? 'success' : 'danger'}`;
  summary.textContent = `${resultTitle}｜${hasCultureIssue ? '原民／多元未完成者，最快為到期後隔天且補足積分後辦理' : '最早可於 ' + canApplyDate + ' 申請換證'}`;

  const text = `${resultTitle}

一、小卡資料
生效日：${start ? formatDateTW(start) : '未填寫'}
到期日：${end ? formatDateTW(end) : '未填寫'}
${hasCultureIssue ? '最快可辦理時間：' + canApplyDate + '（需補足原民／多元積分後）' : '最早可申請換證日：' + canApplyDate}

二、積分檢核
六年總積分：${total} 點
網路課程積分：${online} 點${onlineLimitApplies ? `（115/07/01 起最高採認 80 點；採計後總積分 ${countedTotal} 點）` : '（未適用115/07/01後80點上限）'}

三、已符合項目
${okItems.length ? okItems.map(x=>'✅ '+x).join('\n') : '尚無完全符合項目。'}

四、待補足／需確認項目
${issues.length ? issues.map(x=>'❌ '+x).join('\n') : '無。'}

五、原民／多元年度檢核
113/06/02以前舊制合計：${oldCultureTotal} 點
${yearLines.length ? yearLines.join('\n') : '此小卡效期未涵蓋 113/06/03 以後，或尚未填寫小卡效期。'}

提醒：本工具僅依輸入資料進行初步檢核，實際積分採認、課程類別歸屬及換證資格，仍以衛福部系統資料及地方主管機關審查結果為準。`;
  lastRenewalText = text;
  $('renewalOutput').value = text;
}
function clearRenewal(){
  document.querySelectorAll('#renewalTool input').forEach(inp=>inp.value='');
  $('cultureCourseRows').innerHTML = '';
  $('renewalOutput').value = '';
  lastRenewalText = '';
  $('renewalSummary').className = 'renewal-summary';
  $('renewalSummary').textContent = '請輸入資料後按下「檢核換證資格」。';
  addCultureCourseRow();
}
async function copyRenewalResult(){
  if(!$('renewalOutput').value.trim()) checkRenewal();
  try{
    await navigator.clipboard.writeText($('renewalOutput').value);
    showToast('已複製檢核結果');
  }catch(err){
    $('renewalOutput').focus();
    $('renewalOutput').select();
    document.execCommand('copy');
    showToast('已複製檢核結果');
  }
}
function initRenewalTool(){
  if(!$('renewalTool')) return;
  $('addCultureCourse').addEventListener('click', addCultureCourseRow);
  $('checkRenewal').addEventListener('click', checkRenewal);
  $('copyRenewal').addEventListener('click', copyRenewalResult);
  $('clearRenewal').addEventListener('click', clearRenewal);
  addCultureCourseRow();
}

