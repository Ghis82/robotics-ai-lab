// Analyse de photo de robot par un modèle de vision OPTIONNEL (clé API fournie par l'utilisateur, stockée localement).
// Sortie : JSON strict validé ; tout champ est « à vérifier (issu de la photo) » ; jamais de dimensions, masses ni moteurs.
import { FAMILIES, ROBOT_TYPES } from './registry';
export type Provider = 'openai' | 'gemini';
export interface VisionSettings { provider: Provider; apiKey: string; model: string; baseUrl?: string }
export interface PhotoAnalysis { family: string; typeId: string | null; confidence: number; visibleJoints: number | null; configuration: string | null; observations: string[] }
export const PHOTO_LABEL = 'à vérifier (issu de la photo)';
const ALLOWED = ['family', 'typeId', 'confidence', 'visibleJoints', 'configuration', 'observations'];
const FORBIDDEN = /dimension|longueur|length|taille|size|masse|mass|poids|weight|moteur|motor|couple|torque|vitesse|speed|puissance|power|mat[ée]riau|material/i;
export function photoPrompt(): string {
  const fam = FAMILIES.map((f) => `${f.id} (${f.name})`).join(', '); const types = ROBOT_TYPES.map((t) => `${t.id} [${t.family}] ${t.name}`).join('; ');
  return `Tu analyses la photo d'un robot pour un outil d'ingénierie. Réponds UNIQUEMENT par un objet JSON avec exactement ces clés :
{"family": string, "typeId": string|null, "confidence": nombre entre 0 et 1, "visibleJoints": entier|null, "configuration": string|null, "observations": tableau de chaînes (max 10)}.
family ∈ {${fam}, inconnu}. typeId ∈ {${types}} ou null, cohérent avec family.
visibleJoints = nombre d'articulations VISIBLES sur la photo (null si incertain). configuration = description courte en français de l'agencement visible (ex. « bras série vertical, poignet à 2 axes »).
INTERDIT : ne donne AUCUNE dimension, masse, poids, moteur, couple, vitesse, puissance ni matériau, même estimés — ces grandeurs ne peuvent pas être déduites d'une photo. N'ajoute aucune autre clé.`;
}
export type Validation = { ok: true; value: PhotoAnalysis } | { ok: false; errors: string[] };
/** Validation STRICTE du JSON renvoyé (clés exactes, types, bornes, cohérence famille/type, aucune grandeur physique). */
export function validatePhotoJSON(text: string): Validation {
  const errors: string[] = []; let o: any; const t = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  try { o = JSON.parse(t); } catch { return { ok: false, errors: ['Réponse non JSON.'] }; }
  if (!o || typeof o !== 'object' || Array.isArray(o)) return { ok: false, errors: ['La réponse doit être un objet JSON.'] };
  for (const k of Object.keys(o)) { if (!ALLOWED.includes(k)) errors.push(FORBIDDEN.test(k) ? `Champ interdit (grandeur physique non déductible d'une photo) : « ${k} ».` : `Champ inattendu : « ${k} ».`); }
  for (const k of ALLOWED) if (!(k in o)) errors.push(`Champ manquant : « ${k} ».`);
  if (typeof o.family !== 'string' || !(o.family === 'inconnu' || FAMILIES.some((f) => f.id === o.family))) errors.push('« family » invalide.');
  if (o.typeId !== null && (typeof o.typeId !== 'string' || !ROBOT_TYPES.some((r) => r.id === o.typeId))) errors.push('« typeId » inconnu.');
  else if (o.typeId && ROBOT_TYPES.find((r) => r.id === o.typeId)!.family !== o.family) errors.push('« typeId » incohérent avec « family ».');
  if (typeof o.confidence !== 'number' || !(o.confidence >= 0 && o.confidence <= 1)) errors.push('« confidence » doit être un nombre entre 0 et 1.');
  if (o.visibleJoints !== null && !(Number.isInteger(o.visibleJoints) && o.visibleJoints >= 0 && o.visibleJoints <= 50)) errors.push('« visibleJoints » doit être un entier entre 0 et 50 ou null.');
  if (o.configuration !== null && (typeof o.configuration !== 'string' || o.configuration.length > 400)) errors.push('« configuration » doit être une chaîne (≤ 400 caractères) ou null.');
  if (!Array.isArray(o.observations) || o.observations.length > 10 || !o.observations.every((s: unknown) => typeof s === 'string' && s.length <= 300)) errors.push('« observations » doit être un tableau de ≤ 10 chaînes.');
  const txt = [o.configuration ?? '', ...(Array.isArray(o.observations) ? o.observations : [])].join(' ');
  if (/\d+([.,]\d+)?\s*(mm|cm|m|kg|g|n·?m|nm|w|v|tr\/min|rpm)\b/i.test(txt)) errors.push('Le texte contient une grandeur chiffrée (dimension/masse/moteur) : refusé, ces valeurs ne peuvent pas provenir d\'une photo.');
  return errors.length ? { ok: false, errors } : { ok: true, value: o as PhotoAnalysis };
}
export function buildRequest(s: VisionSettings, dataUrl: string): { url: string; init: RequestInit } {
  const [meta, b64] = dataUrl.split(','); const mime = /data:([^;]+)/.exec(meta)?.[1] ?? 'image/jpeg';
  if (s.provider === 'gemini') return { url: `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(s.model)}:generateContent`, init: { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': s.apiKey },
    body: JSON.stringify({ contents: [{ parts: [{ text: photoPrompt() }, { inline_data: { mime_type: mime, data: b64 } }] }], generationConfig: { responseMimeType: 'application/json', temperature: 0 } }) } };
  const base = (s.baseUrl || 'https://api.openai.com/v1').replace(/\/$/, '');
  return { url: `${base}/chat/completions`, init: { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${s.apiKey}` },
    body: JSON.stringify({ model: s.model, temperature: 0, response_format: { type: 'json_object' }, messages: [{ role: 'user', content: [{ type: 'text', text: photoPrompt() }, { type: 'image_url', image_url: { url: dataUrl } }] }] }) } };
}
export function extractText(p: Provider, r: any): string {
  if (p === 'gemini') { const t = r?.candidates?.[0]?.content?.parts?.map((x: any) => x.text ?? '').join(''); if (!t) throw new Error('Réponse Gemini vide ou bloquée.'); return t; }
  const t = r?.choices?.[0]?.message?.content; if (typeof t !== 'string') throw new Error('Réponse du fournisseur sans contenu texte.'); return t;
}
export async function analyzePhoto(s: VisionSettings, dataUrl: string, fetchImpl: typeof fetch = fetch): Promise<Validation> {
  if (!s.apiKey || !s.model) return { ok: false, errors: ['Aucune clé API ou aucun modèle configuré : utilisez le mode manuel.'] };
  const { url, init } = buildRequest(s, dataUrl); let res: Response; try { res = await fetchImpl(url, init); } catch (e) { return { ok: false, errors: [`Requête impossible : ${(e as Error).message}`] }; }
  if (!res.ok) { let msg = ''; try { msg = (await res.json())?.error?.message ?? ''; } catch { /* */ } return { ok: false, errors: [`Erreur du fournisseur (HTTP ${res.status})${msg ? ' : ' + msg : ''}.`] }; }
  let txt: string; try { txt = extractText(s.provider, await res.json()); } catch (e) { return { ok: false, errors: [(e as Error).message] }; }
  return validatePhotoJSON(txt);
}
/** Propositions affichées dans l'atelier : toutes en provenance « proposé », libellé « à vérifier (issu de la photo) ». */
export function toProposals(a: PhotoAnalysis) {
  const t = a.typeId ? ROBOT_TYPES.find((r) => r.id === a.typeId)! : null;
  return { route: t ? (t.armWorkspace ? `#/atelier/arm${t.armModel ? '?modele=' + t.armModel : ''}` : t.modules.length ? `#/atelier/${t.id}` : `#/robot/${t.id}`) : '#/bibliotheque',
    items: [{ label: 'Famille', value: FAMILIES.find((f) => f.id === a.family)?.name ?? 'inconnue' }, { label: 'Type', value: t?.name ?? 'non déterminé' }, { label: 'Articulations visibles', value: a.visibleJoints == null ? 'incertain' : String(a.visibleJoints) }, { label: 'Configuration', value: a.configuration ?? '—' }, { label: 'Confiance déclarée par le modèle', value: `${Math.round(a.confidence * 100)} %` }]
      .map((x) => ({ ...x, src: 'proposé' as const, note: PHOTO_LABEL })) };
}
