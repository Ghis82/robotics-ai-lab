// Guide de première visite (fermable, mémorisé dans localStorage).
const KEY = 'ral-guide-vu';
export function showGuide(force = false) {
  if (!force && localStorage.getItem(KEY)) return; if (document.querySelector('.guide-bg')) return;
  const bg = document.createElement('div'); bg.className = 'guide-bg'; bg.setAttribute('role', 'dialog'); bg.setAttribute('aria-label', 'Guide de démarrage');
  bg.innerHTML = `<div class="guide"><h2>Bienvenue dans Robotics AI Lab</h2>
  <p>Un laboratoire virtuel pour <b>concevoir, simuler et analyser</b> des robots avant toute fabrication : cinématique, couples, collisions, stabilité, autonomie…</p>
  <ol><li><b>Décrivez votre besoin</b> dans l'assistant de l'accueil (ex. « Simule un bras qui déplace un objet de deux kilogrammes »).</li>
  <li>Ou parcourez la <b>Bibliothèque de robots</b> (7 familles) et ouvrez l'atelier d'un type.</li>
  <li>Renseignez vos <b>données réelles</b> : les champs « manquant » sont obligatoires, les « valeurs de démo » ne sont que des exemples.</li>
  <li>Lancez la simulation, lisez l'<b>analyse</b> (calculé / estimé / à valider) et exportez le <b>rapport</b> ou enregistrez le <b>projet</b>.</li></ol>
  <div class="warnbox">⚠️ Prototype : aucun résultat n'est inventé, mais rien ici ne certifie qu'un robot peut être fabriqué ou utilisé en toute sécurité. Les modèles 3D génériques ne sont pas validés.</div>
  <div class="acts"><button id="gLib">Voir la bibliothèque</button><button id="gOk" class="primary-s">Commencer</button></div></div>`;
  document.body.appendChild(bg);
  const close = () => { localStorage.setItem(KEY, '1'); bg.remove(); };
  bg.querySelector<HTMLButtonElement>('#gOk')!.onclick = close; bg.querySelector<HTMLButtonElement>('#gLib')!.onclick = () => { close(); location.hash = '#/bibliotheque'; };
  bg.onclick = (e) => { if (e.target === bg) close(); }; addEventListener('keydown', function k(e) { if (e.key === 'Escape') { close(); removeEventListener('keydown', k); } });
}
(window as any).__ralGuide = () => showGuide(true);
