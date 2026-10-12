// Ergonomie mobile : onglet actif de la barre inférieure, panneaux repliables (≤ 700 px).
const mq = matchMedia('(max-width:700px)');
function syncTabs() { const h = location.hash.slice(2).split(/[/?]/)[0] || 'home'; document.querySelectorAll<HTMLAnchorElement>('#tabbar a').forEach((a) => a.classList.toggle('on', a.dataset.t === h)); }
addEventListener('hashchange', syncTabs); syncTabs();
document.addEventListener('click', (e) => {
  if (!mq.matches) return; const h = (e.target as HTMLElement).closest('.card>h2, .card>h3, .panel h2'); if (!h || (e.target as HTMLElement).closest('button,input,select,a')) return;
  const box = h.parentElement!; box.classList.toggle('collapsed'); if (!box.classList.contains('collapsed')) dispatchEvent(new Event('resize'));
});
