import { chromium } from 'playwright-core';
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport: { width: 1600, height: 1000 }, acceptDownloads: true });
p.on('pageerror', e => console.log('ERR', e.message)); p.on('dialog', d => { console.log('DIALOG', d.message().slice(0,300)); d.accept(); });
const D='/workspace/robotics-ai-lab/', U='http://localhost:4173/';
await p.goto(U+'#/'); await p.waitForTimeout(800);
await p.fill('#nl','Compare un drone de 1,2 kg et un drone de deux kilogrammes'); await p.check('#nldemo'); await p.click('#nlgo'); await p.waitForTimeout(300);
console.log('CMP:', (await p.textContent('#nlout')).replace(/\s+/g,' ').slice(0,600));
await p.screenshot({ path: D+'screenshot-assistant-compare.png', fullPage: true });
await p.goto(U+'#/atelier/arm?modele=cobot'); await p.waitForTimeout(1200);
await p.fill('#cobv','0.5'); await p.dispatchEvent('#cobv','change'); await p.fill('#cobf','100'); await p.dispatchEvent('#cobf','change');
const run = await p.$('#run'); if (run) { await run.click(); await p.waitForTimeout(1200); }
console.log('COBOT:', (await p.textContent('body')).match(/(Vitesse TCP[^.]*\.|Effort transmissible[^.]*\.)/g));
await p.screenshot({ path: D+'screenshot-cobot.png' });
await p.goto(U+'#/atelier/arm?modele=scara'); await p.waitForTimeout(1000); await p.screenshot({ path: D+'screenshot-scara.png' });
await p.goto(U+'#/atelier/gripper'); await p.waitForTimeout(600);
for (const [k,v] of [['mu',0.5],['fmax',20]]) { await p.fill(`[data-k=${k}]`, String(v)); await p.dispatchEvent(`[data-k=${k}]`,'change'); }
await p.click('#mgrip'); await p.waitForTimeout(4000); console.log('GRIP:', (await p.textContent('#mgripres')).replace(/\s+/g,' '));
await p.screenshot({ path: D+'screenshot-gripper-rapier.png' });
await p.goto(U+'#/atelier/swarm'); await p.waitForTimeout(600); await p.selectOption('#msel','swarm-mission'); await p.click('#mrun'); await p.waitForTimeout(2000);
console.log('SWARM:', (await p.textContent('#mres')).replace(/\s+/g,' ').slice(0,500)); await p.screenshot({ path: D+'screenshot-swarm-mission.png' });
const [dl] = await Promise.all([p.waitForEvent('download'), p.click('text=Enregistrer le projet')]); await dl.saveAs('/tmp/projet.json');
await p.setInputFiles('header input[type=file]', '/tmp/projet.json'); await p.waitForTimeout(800);
await b.close();
