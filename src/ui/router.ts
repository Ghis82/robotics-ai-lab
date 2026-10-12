import { renderHome, renderLibrary, renderDetail, renderWorkspace } from './platform';
import { renderComparator } from './comparator';
import { renderPlanner } from './planner';
import { renderStrength, renderValidation } from './engPages';
import { renderPhoto } from './photo';
import { typeById } from '../core/registry';
const app = document.getElementById('app')!, plat = document.getElementById('platform')!;
/** Routes : #/ · #/bibliotheque · #/robot/:id · #/atelier/arm (atelier bras complet) · #/atelier/:id[/modules] */
export function route() {
  const [path, qs] = (location.hash.slice(1) || '/').split('?'); const p = path.split('/').filter(Boolean);
  const isArm = p[0] === 'atelier' && (p[1] === 'arm' || p[1] === 'arm-full') && p[2] !== 'modules';
  app.style.display = isArm ? '' : 'none'; plat.style.display = isArm ? 'none' : '';
  if (isArm) { window.dispatchEvent(new Event('resize')); return; }
  plat.innerHTML = ''; window.scrollTo(0, 0);
  if (!p.length) renderHome();
  else if (p[0] === 'planificateur') renderPlanner();
  else if (p[0] === 'resistance') renderStrength();
  else if (p[0] === 'validation') renderValidation();
  else if (p[0] === 'photo') renderPhoto();
  else if (p[0] === 'comparateur') renderComparator(new URLSearchParams(qs));
  else if (p[0] === 'bibliotheque') renderLibrary(new URLSearchParams(qs));
  else if (p[0] === 'robot' && typeById(p[1])) renderDetail(p[1]);
  else if (p[0] === 'atelier' && typeById(p[1])?.modules.length) renderWorkspace(p[1]);
  else renderHome();
}
window.addEventListener('hashchange', route);
