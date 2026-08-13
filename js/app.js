window.addEventListener('DOMContentLoaded',()=>{
  const initializers = [
    ['頁籤', typeof initTabs === 'function' ? initTabs : null],
    ['額度', typeof initQuota === 'function' ? initQuota : null],
    ['碼別', typeof initCodeTool === 'function' ? initCodeTool : null],
    ['費用', typeof initFeeTool === 'function' ? initFeeTool : null],
    ['家訪', typeof initVisitTool === 'function' ? initVisitTool : null],
    ['異動', typeof initMutationTool === 'function' ? initMutationTool : null],
    ['換證', typeof initRenewalTool === 'function' ? initRenewalTool : null],
    ['居督工作台', typeof initSupervisorTool === 'function' ? initSupervisorTool : null],
    ['服務確認單', typeof initConfirmationTool === 'function' ? initConfirmationTool : null]
  ];
  initializers.forEach(([name, fn])=>{
    if(!fn) return;
    try{ fn(); }
    catch(err){ console.error(`${name}初始化失敗：`, err); }
  });
});
