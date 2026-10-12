import { describe, it, expect } from 'vitest';
import { validatePhotoJSON, analyzePhoto, buildRequest, toProposals, photoPrompt, PHOTO_LABEL } from '../src/core/photo';
import { validateProject, makeProject } from '../src/core/project';
const good = { family: 'industrial', typeId: 'arm', confidence: 0.8, visibleJoints: 5, configuration: 'bras série vertical, poignet à deux axes', observations: ['pince à deux doigts visible'] };
const mockFetch = (status: number, body: any) => (async () => ({ ok: status < 300, status, json: async () => body })) as any;
const img = 'data:image/jpeg;base64,AAAA';
describe('Analyse de photo — validation stricte', () => {
  it('JSON valide accepté (y compris entre balises ```json)', () => { expect(validatePhotoJSON(JSON.stringify(good)).ok).toBe(true); expect(validatePhotoJSON('```json\n' + JSON.stringify(good) + '\n```').ok).toBe(true); });
  it('refus : champs physiques interdits, champs inattendus, manquants', () => {
    const r = validatePhotoJSON(JSON.stringify({ ...good, masse: 12, longueur_bras: 0.5, couleur: 'bleu' })); expect(r.ok).toBe(false); if (!r.ok) { expect(r.errors.filter((e) => /interdit/.test(e)).length).toBe(2); expect(r.errors.some((e) => /inattendu.*couleur/.test(e))).toBe(true); }
    const { visibleJoints, ...m } = good; void visibleJoints; expect(validatePhotoJSON(JSON.stringify(m)).ok).toBe(false);
  });
  it('refus : valeurs hors domaine, incohérences, grandeurs chiffrées dans le texte', () => {
    for (const bad of [{ confidence: 1.4 }, { visibleJoints: 2.5 }, { visibleJoints: -1 }, { family: 'martien' }, { typeId: 'xyz' }, { typeId: 'multirotor' }, { observations: 'texte' }, { configuration: 'bras de 600 mm environ' }, { observations: ['charge de 2 kg'] }])
      expect(validatePhotoJSON(JSON.stringify({ ...good, ...bad })).ok, JSON.stringify(bad)).toBe(false);
    expect(validatePhotoJSON('pas du json').ok).toBe(false); expect(validatePhotoJSON('[1,2]').ok).toBe(false);
    expect(validatePhotoJSON(JSON.stringify({ ...good, family: 'inconnu', typeId: null, visibleJoints: null, configuration: null })).ok).toBe(true);
  });
  it('fournisseur compatible OpenAI (réponse simulée)', async () => {
    const r = await analyzePhoto({ provider: 'openai', apiKey: 'k', model: 'm' }, img, mockFetch(200, { choices: [{ message: { content: JSON.stringify(good) } }] })); expect(r.ok).toBe(true);
    const q = buildRequest({ provider: 'openai', apiKey: 'sk-test', model: 'vis', baseUrl: 'https://exemple.test/v1/' }, img); expect(q.url).toBe('https://exemple.test/v1/chat/completions'); expect((q.init.headers as any).Authorization).toBe('Bearer sk-test');
    const body = JSON.parse(q.init.body as string); expect(body.response_format.type).toBe('json_object'); expect(body.messages[0].content[1].image_url.url).toBe(img);
  });
  it('fournisseur Gemini (réponse simulée)', async () => {
    const r = await analyzePhoto({ provider: 'gemini', apiKey: 'k', model: 'gm' }, img, mockFetch(200, { candidates: [{ content: { parts: [{ text: JSON.stringify(good) }] } }] })); expect(r.ok).toBe(true);
    const q = buildRequest({ provider: 'gemini', apiKey: 'g', model: 'gm' }, img); expect(q.url).toContain('/models/gm:generateContent'); expect((q.init.headers as any)['x-goog-api-key']).toBe('g'); expect(JSON.parse(q.init.body as string).contents[0].parts[1].inline_data.data).toBe('AAAA');
  });
  it('erreurs : sans clé → mode manuel ; HTTP 401 ; réponse vide ; réponse avec masse', async () => {
    expect((await analyzePhoto({ provider: 'openai', apiKey: '', model: 'm' }, img, mockFetch(200, {}))).ok).toBe(false);
    const e = await analyzePhoto({ provider: 'openai', apiKey: 'k', model: 'm' }, img, mockFetch(401, { error: { message: 'Invalid key' } })); expect(e.ok).toBe(false); if (!e.ok) expect(e.errors[0]).toMatch(/401.*Invalid key/);
    expect((await analyzePhoto({ provider: 'gemini', apiKey: 'k', model: 'm' }, img, mockFetch(200, { candidates: [] }))).ok).toBe(false);
    expect((await analyzePhoto({ provider: 'openai', apiKey: 'k', model: 'm' }, img, mockFetch(200, { choices: [{ message: { content: JSON.stringify({ ...good, mass: 3 }) } }] }))).ok).toBe(false);
  });
  it('propositions : provenance « proposé », libellé, routage vers l\'atelier', () => {
    const p = toProposals(good as any); expect(p.route).toBe('#/atelier/arm'); p.items.forEach((x) => { expect(x.src).toBe('proposé'); expect(x.note).toBe(PHOTO_LABEL); });
    expect(toProposals({ ...good, family: 'companion', typeId: 'companion-desk' } as any).route).toBe('#/atelier/companion-desk'); expect(toProposals({ ...good, typeId: null } as any).route).toBe('#/bibliotheque');
    expect(p.items.map((x) => x.label).join(' ')).not.toMatch(/masse|dimension|moteur/i);
  });
  it('consigne envoyée : interdit dimensions/masses/moteurs', () => { expect(photoPrompt()).toMatch(/INTERDIT.*dimension.*masse.*moteur/s); });
  it('projet : provenance « proposé » acceptée', () => { const p: any = makeProject({ name: 'x', arm: null, modules: { gripper: { mass: { value: 1, src: 'proposé' }, mu: { value: null, src: 'manquant' }, n: { value: 2, src: 'démo' }, accel: { value: 2, src: 'démo' }, fmax: { value: null, src: 'manquant' } } }, planner: null, history: [] }); expect(validateProject(p).ok).toBe(true); });
});
