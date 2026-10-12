// Page « Analyse de photo » + photo de référence dans les ateliers + verrou de confirmation avant tout verdict.
import { topbar } from './platform';
import { FAMILIES, ROBOT_TYPES } from '../core/registry';
import { analyzePhoto, toProposals, PHOTO_LABEL, type PhotoAnalysis, type VisionSettings } from '../core/photo';
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
const KS = 'ral-vision'; // réglages (clé incluse seulement si l'utilisateur choisit de la mémoriser)
export const photoState: { dataUrl: string | null; analysis: PhotoAnalysis | null; typeId: string | null; confirmed: boolean; mode: 'ia' | 'manuel' | null } = { dataUrl: null, analysis: null, typeId: null, confirmed: false, mode: null };
export function loadSettings(): VisionSettings & { remember: boolean } { const raw = localStorage.getItem(KS) ?? sessionStorage.getItem(KS); const s = raw ? JSON.parse(raw) : {}; return { provider: s.provider ?? 'openai', apiKey: s.apiKey ?? '', model: s.model ?? '', baseUrl: s.baseUrl ?? '', remember: !!localStorage.getItem(KS) }; }
function saveSettings(s: VisionSettings & { remember: boolean }) { const j = JSON.stringify(s); localStorage.removeItem(KS); sessionStorage.removeItem(KS); (s.remember ? localStorage : sessionStorage).setItem(KS, j); }
async function shrink(f: File): Promise<string> { const url = URL.createObjectURL(f); const img = new Image(); await new Promise((r, j) => { img.onload = r; img.onerror = j; img.src = url; });
  const k = Math.min(1, 1024 / Math.max(img.width, img.height)); const c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k); c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url); return c.toDataURL('image/jpeg', 0.85); }
/** true si un verdict peut être produit ; sinon affiche la demande de confirmation. */
export function photoGate(): boolean {
  if (!photoState.dataUrl || photoState.confirmed) return true;
  alert('Ce projet part d\'une photo. Avant tout calcul de faisabilité, confirmez dans le panneau « Photo de référence » que les dimensions, masses et moteurs saisis proviennent de vos données (la photo ne fournit aucune de ces valeurs).'); return false;
}
export function photoPanel(): string {
  if (!photoState.dataUrl) return ''; const p = photoState.analysis ? toProposals(photoState.analysis) : null;
  return `<div class="card photoref"><h3>Photo de référence <span class="prov p-proposé">proposé</span></h3><img src="${photoState.dataUrl}" alt="Photo de référence du robot" style="max-width:100%;max-height:260px;border-radius:8px;display:block">
  ${p ? `<table>${p.items.map((x) => `<tr><td>${x.label}</td><td>${esc(x.value)} <span class="prov p-proposé" title="${PHOTO_LABEL}">proposé</span></td></tr>`).join('')}</table><p class="note">Tous ces éléments sont <b>${PHOTO_LABEL}</b>. Aucune dimension, masse ni motorisation n'est déduite de la photo.</p>`
    : '<p class="note">Mode manuel : photo affichée comme simple référence visuelle.</p>'}
  <label class="note" style="display:block"><input type="checkbox" class="photoconf" ${photoState.confirmed ? 'checked' : ''} style="width:auto"> Je confirme avoir saisi ou vérifié <b>moi-même</b> les dimensions, masses et moteurs (aucune valeur ne provient de la photo). Les verdicts de faisabilité ne sont produits qu'après cette confirmation, et uniquement à partir des calculs.</label>
  <button class="photoclear">Retirer la photo</button></div>`;
}
document.addEventListener('change', (e) => { const t = e.target as HTMLInputElement; if (t.classList?.contains('photoconf')) { photoState.confirmed = t.checked; document.querySelectorAll<HTMLInputElement>('.photoconf').forEach((x) => (x.checked = t.checked)); } });
document.addEventListener('click', (e) => { if ((e.target as HTMLElement).classList?.contains('photoclear')) { Object.assign(photoState, { dataUrl: null, analysis: null, typeId: null, confirmed: false, mode: null }); document.querySelectorAll('.photoref').forEach((x) => x.remove()); document.getElementById('armphoto')?.replaceChildren(); } });
export function renderPhoto() {
  const root = document.getElementById('platform')!; const s = loadSettings();
  root.innerHTML = topbar('photo') + `<div class="page"><h1>Analyse de photo de robot</h1>
  <p class="note">Une photo permet au mieux de <b>proposer</b> une famille, un type, un nombre d'articulations visibles et une configuration — tous marqués <span class="prov p-proposé">proposé</span> « ${PHOTO_LABEL} ». Elle ne permet pas de connaître dimensions, masses, moteurs ou matériaux : ces données restent obligatoires et à saisir par vous.</p>
  <div class="wsgrid" style="grid-template-columns:1fr 1fr"><div class="card"><h3>1. Photo</h3><label class="btn">Choisir / prendre une photo<input type="file" id="phfile" accept="image/*" capture="environment" hidden></label><div id="phprev"></div></div>
  <div class="card"><h3>2. Analyse</h3>
   <details ${s.apiKey ? '' : ''}><summary>Réglages du modèle de vision (optionnel)</summary>
   <div class="row"><label>Fournisseur</label><select id="phprov"><option value="openai" ${s.provider === 'openai' ? 'selected' : ''}>Compatible OpenAI (chat/completions)</option><option value="gemini" ${s.provider === 'gemini' ? 'selected' : ''}>Google Gemini</option></select></div>
   <div class="row"><label>URL de base (OpenAI-compatible)</label><input id="phbase" value="${esc(s.baseUrl ?? '')}" placeholder="https://api.openai.com/v1"></div>
   <div class="row"><label>Modèle (vision)</label><input id="phmodel" value="${esc(s.model)}" placeholder="nom du modèle chez votre fournisseur"></div>
   <div class="row"><label>Clé API</label><input id="phkey" type="password" autocomplete="off" value="${esc(s.apiKey)}" placeholder="votre clé personnelle"></div>
   <label class="note"><input type="checkbox" id="phrem" ${s.remember ? 'checked' : ''} style="width:auto"> Mémoriser sur cet appareil (localStorage). Sinon : oubliée à la fermeture de l'onglet.</label>
   <p class="note">La clé et la photo sont envoyées <b>directement</b> de votre navigateur au fournisseur choisi (coûts et confidentialité selon ses conditions). Cette application n'a pas de serveur et ne les reçoit jamais.</p><button id="phsave">Enregistrer les réglages</button> <button id="phforget">Effacer la clé</button></details>
   <button id="phrun" class="primary-s">Analyser avec le modèle de vision</button><div id="phres"></div>
   <h3>Ou mode manuel (sans clé)</h3><div class="row"><label>Famille</label><select id="phfam"><option value="">—</option>${FAMILIES.map((f) => `<option value="${f.id}">${f.name}</option>`).join('')}</select></div><div class="row"><label>Type</label><select id="phtype"><option value="">—</option></select></div><button id="phman">Ouvrir l'atelier avec la photo en référence</button></div></div></div>`;
  const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
  const prev = () => { $('phprev').innerHTML = photoState.dataUrl ? `<img src="${photoState.dataUrl}" style="max-width:100%;max-height:320px;border-radius:8px">` : '<p class="note">Aucune photo.</p>'; }; prev();
  $<HTMLInputElement>('phfile').onchange = async (e) => { const f = (e.target as HTMLInputElement).files?.[0]; if (!f) return; photoState.dataUrl = await shrink(f); photoState.analysis = null; photoState.confirmed = false; prev(); };
  const cur = () => ({ provider: $<HTMLSelectElement>('phprov').value as any, baseUrl: $<HTMLInputElement>('phbase').value.trim(), model: $<HTMLInputElement>('phmodel').value.trim(), apiKey: $<HTMLInputElement>('phkey').value.trim(), remember: $<HTMLInputElement>('phrem').checked });
  $('phsave').onclick = () => { saveSettings(cur()); $('phres').innerHTML = '<p class="note">Réglages enregistrés.</p>'; };
  $('phforget').onclick = () => { $<HTMLInputElement>('phkey').value = ''; saveSettings(cur()); $('phres').innerHTML = '<p class="note">Clé effacée.</p>'; };
  $<HTMLSelectElement>('phfam').onchange = (e) => { const f = (e.target as HTMLSelectElement).value; $('phtype').innerHTML = '<option value="">—</option>' + ROBOT_TYPES.filter((t) => t.family === f).map((t) => `<option value="${t.id}">${t.name}</option>`).join(''); };
  $('phman').onclick = () => { if (!photoState.dataUrl) { $('phres').innerHTML = '<p class="warn">Choisissez d\'abord une photo.</p>'; return; } const t = $<HTMLSelectElement>('phtype').value; if (!t) { $('phres').innerHTML = '<p class="warn">Choisissez un type.</p>'; return; }
    photoState.mode = 'manuel'; photoState.analysis = null; photoState.typeId = t; location.hash = toProposals({ family: ROBOT_TYPES.find((r) => r.id === t)!.family, typeId: t, confidence: 1, visibleJoints: null, configuration: null, observations: [] }).route; };
  $('phrun').onclick = async () => {
    if (!photoState.dataUrl) { $('phres').innerHTML = '<p class="warn">Choisissez d\'abord une photo.</p>'; return; } const st = cur(); saveSettings(st); $('phres').innerHTML = '<p class="note">Analyse en cours…</p>';
    const v = await analyzePhoto(st, photoState.dataUrl);
    if (!v.ok) { $('phres').innerHTML = `<div class="warn">Analyse refusée ou impossible :<ul>${v.errors.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>Utilisez le mode manuel ci-dessous.</div>`; return; }
    photoState.analysis = v.value; photoState.mode = 'ia'; photoState.typeId = v.value.typeId; photoState.confirmed = false; const p = toProposals(v.value);
    $('phres').innerHTML = `<table>${p.items.map((x) => `<tr><td>${x.label}</td><td>${esc(x.value)} <span class="prov p-proposé">proposé</span></td></tr>`).join('')}</table>${v.value.observations.length ? `<ul>${v.value.observations.map((o) => `<li class="note">${esc(o)}</li>`).join('')}</ul>` : ''}<p class="note">${PHOTO_LABEL}</p><a class="btn primary-s" href="${p.route}">Ouvrir l'atelier proposé</a>`;
  };
}
