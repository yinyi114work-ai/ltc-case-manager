function serviceOptionHtml(){
  return serviceData.map(s=>`<option value="${s.code}">${s.code} ${s.name}｜${money(s.price)}元/${s.unit}</option>`).join('');
}

function renderServices(filter=''){
  if(!$('serviceList')) return;
  const q = filter.trim().toLowerCase();
  const list = serviceData.filter(s=>[s.code,s.name,s.category,s.desc,s.note,s.tip || ''].join(' ').toLowerCase().includes(q));
  $('serviceList').innerHTML = list.map(s=>`
    <article class="service-card">
      <h3>${s.code}｜${s.name}</h3>
      <div class="tag-row"><span class="tag">${s.category}</span><span class="tag">${money(s.price)}元／${s.unit}</span></div>
      <div class="mini-table">
        <div class="mini-cell"><span>第一類</span><strong>${money(s.selfPayFirst)}</strong></div>
        <div class="mini-cell"><span>第二類</span><strong>${money(s.selfPaySecond)}</strong></div>
        <div class="mini-cell"><span>第三類</span><strong>${money(s.selfPayThird)}</strong></div>
      </div>
      <p><strong>支付基準摘要：</strong>${s.desc}</p>
      <p><strong>注意事項：</strong>${s.note}</p>
      ${s.tip ? `<div class="supervisor-tip"><strong>☕ 居督碎碎唸：</strong><span>${s.tip}</span></div>` : ''}
      <p><strong>服務計畫：</strong>${s.plan}</p>
    </article>
  `).join('') || '<p class="card">查無符合的碼別。</p>';
}

function initCodeTool(){
  renderServices();
  const search = $('serviceSearch');
  if(search) search.addEventListener('input', e=>renderServices(e.target.value));
}

