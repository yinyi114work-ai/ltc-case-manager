function initTabs(){
  document.querySelectorAll('.tab-btn').forEach(btn=>{
    btn.addEventListener('click',()=>{
      document.querySelectorAll('.tab-btn').forEach(b=>b.classList.remove('active'));
      document.querySelectorAll('.tool-section').forEach(s=>s.classList.remove('active'));
      btn.classList.add('active');
      const target = $(btn.dataset.target);
      if(target) target.classList.add('active');
    });
  });
}

