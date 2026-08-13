function initQuota(){
  const cms = $('cmsSelect');
  if(!cms) return;
  cms.innerHTML = Object.entries(cmsLevels).map(([level,amount])=>`<option value="${level}">CMS ${level}｜${money(amount)}元</option>`).join('');
  const identities = Object.entries(identityRates).map(([key,obj])=>`<option value="${key}">${obj.label}</option>`).join('');
  $('identitySelect').innerHTML = identities;
  $('feeIdentity').innerHTML = identities;
  $('feeCms').innerHTML = Object.entries(cmsLevels).map(([level,amount])=>`<option value="${level}">CMS ${level}｜${money(amount)}元</option>`).join('');
  cms.addEventListener('change', updateQuota);
  $('identitySelect').addEventListener('change', updateQuota);
  updateQuota();
}

function updateQuota(){
  const quota = cmsLevels[$('cmsSelect').value] || 0;
  const rate = identityRates[$('identitySelect').value].rate;
  const selfPay = Math.floor(quota * rate);
  $('quotaAmount').textContent = money(quota);
  $('selfPayAmount').textContent = money(selfPay);
  $('subsidyAmount').textContent = money(quota - selfPay);
}

