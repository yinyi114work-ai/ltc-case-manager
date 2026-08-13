function addFeeRow(code='BA07', count=1){
  const wrap = document.createElement('div');
  wrap.className = 'fee-row';
  wrap.innerHTML = `
    <label>碼別<select class="fee-code">${serviceOptionHtml()}</select></label>
    <label>每月次數<input class="fee-count" type="number" min="0" step="1" value="${count}"></label>
    <button class="remove-row" type="button">刪除</button>
  `;
  wrap.querySelector('.fee-code').value = code;
  wrap.querySelector('.fee-code').addEventListener('change', ()=>{ updateFee(); if(typeof refreshScheduleServiceOptions === 'function') refreshScheduleServiceOptions(); });
  wrap.querySelector('.fee-count').addEventListener('input', ()=>{ updateFee(); if(typeof refreshScheduleServiceOptions === 'function') refreshScheduleServiceOptions(); });
  wrap.querySelector('.remove-row').addEventListener('click',()=>{wrap.remove();updateFee();if(typeof refreshScheduleServiceOptions === 'function') refreshScheduleServiceOptions();});
  $('feeRows').prepend(wrap);
  wrap.querySelector('.fee-code').focus();
  updateFee();
  if(typeof refreshScheduleServiceOptions === 'function') refreshScheduleServiceOptions();
}

function updateFee(){
  const rate = identityRates[$('feeIdentity').value].rate;
  const quota = cmsLevels[$('feeCms').value] || 0;
  let total = 0;
  document.querySelectorAll('.fee-row').forEach(row=>{
    const code = row.querySelector('.fee-code').value;
    const count = Number(row.querySelector('.fee-count').value || 0);
    const service = serviceData.find(s=>s.code===code);
    if(service) total += service.price * count;
  });

  const withinQuota = Math.min(total, quota);
  const overage = Math.max(total - quota, 0);
  const selfPay = Math.floor(withinQuota * rate);
  const clientTotal = selfPay + overage;
  const remain = Math.max(quota - total, 0);

  $('feeTotal').textContent = money(total);
  $('feeQuota').textContent = money(quota);
  $('feeSelfPay').textContent = money(selfPay);
  $('feeOverage').textContent = money(overage);
  $('feeClientTotal').textContent = money(clientTotal);
  $('feeRemain').textContent = money(remain);

  const notice = $('feeNotice');
  $('feeOverage').closest('.result-card').classList.toggle('overage-alert', overage > 0);
  $('feeClientTotal').closest('.result-card').classList.toggle('overage-alert', overage > 0);
  if(overage > 0){
    notice.className = 'notice-card danger';
    notice.textContent = `⚠️ 已超出 CMS 額度 ${money(overage)} 元，超額部分需全額自費；預估自付總額為 ${money(clientTotal)} 元。`;
  }else{
    notice.className = 'notice-card success';
    notice.textContent = `✅ 目前尚未超出 CMS 額度，剩餘額度 ${money(remain)} 元；預估自付總額為 ${money(clientTotal)} 元。`;
  }
}

function initFeeTool(){
  if(!$('addFeeRow')) return;
  $('addFeeRow').addEventListener('click',()=>addFeeRow());
  $('feeIdentity').addEventListener('change',updateFee);
  $('feeCms').addEventListener('change',updateFee);
  addFeeRow('BA07',4);
}

