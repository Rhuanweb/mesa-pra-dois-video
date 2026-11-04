// Mesa pra Dois — renderiza o Reels do dia a partir do roteiro gerado no Supabase.
// Uso: node render.js            (pega o roteiro na função mesa-video, renderiza, sobe e marca como pronto)
// Variáveis: MESA_VIDEO_TOKEN (obrigatória), SITE_URL, FN_URL, DIA (AAAA-MM-DD), SO_QUADROS (ex: "0,100,300" pra teste),
//            ROTEIRO_FILE / MP3_FILE (teste local sem rede), NAO_SUBIR=1, PAUSADO=1 (sobe mas não publica)
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const SITE = process.env.SITE_URL || 'https://mesapradois.vercel.app/';
const FN = process.env.FN_URL || 'https://fccqvzpuisiyfumhgtbj.supabase.co/functions/v1/mesa-video';
const TOKEN = process.env.MESA_VIDEO_TOKEN || '';
const FPS = 24;
const OUT = path.join(__dirname, 'saida');
const FR = path.join(OUT, 'quadros');
const so = process.env.SO_QUADROS ? process.env.SO_QUADROS.split(',').map(Number) : null;

async function fn(acao, extra = {}) {
  const r = await fetch(FN, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-video-token': TOKEN },
    body: JSON.stringify({ acao, ...(process.env.DIA ? { dia: process.env.DIA } : {}), ...extra }) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.ok === false) throw new Error(`${acao}: ${r.status} ${JSON.stringify(j).slice(0, 400)}`);
  return j;
}

/* câmeras por tipo de cena: [alvo, posição] no início e no fim (relativas à mesa quando há casal) */
const CAM = {
  abertura: { view: 'predio', a: [[0, -8, 0], [-34, 12, -84]], b: [[0, -7, 0], [-24, 8, -66]] },
  total:    { view: 'predio', a: [[0, -9, 0], [30, 4, -60]],   b: [[0, -7, 0], [52, 14, -54]] },
  andar:    { view: 'andar', orbita: [-28, 22], zoom: [.9, .7] },
  mesa:     { view: 'andar',  a: [[0, 1, 0], [3.6, 3.2, 4.8]],  b: [[0, 1, 0], [-2.6, 2.2, 3.2]] },
  mesa2:    { view: 'andar',  a: [[0, 1, 0], [-3.4, 2.8, 4.2]], b: [[0, 1, 0], [2.4, 1.9, 2.8]] },
  terraco:  { view: 'terraco', orbita: [24, -20], zoom: [.55, .42] },
  caixas:   { view: 'andar',  a: [[0, 1, 0], [-3.2, 2.6, 3.6]], b: [[0, 1, 0], [2.6, 2.0, 3.0]] },
  caixas0:  { view: 'andar', orbita: [20, -20], zoom: [.9, .75] },
  cta:      { view: 'predio', a: [[0, -6, 0], [-20, 5, -60]],  b: [[0, -8, 0], [-40, 16, -95]] },
};
const ease = k => k < .5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
const lerp = (x, y, k) => x.map((v, i) => v + (y[i] - v) * k);

(async () => {
  fs.rmSync(OUT, { recursive: true, force: true }); fs.mkdirSync(FR, { recursive: true });

  /* 1. roteiro + narração */
  const rot = process.env.ROTEIRO_FILE ? JSON.parse(fs.readFileSync(process.env.ROTEIRO_FILE, 'utf8')) : await fn('roteiro', process.env.REFAZER ? { refazer: true } : {});
  console.log(`Dia ${rot.numero} (${rot.dia}) · ${rot.cenas.length} cenas · ${rot.duracao.toFixed(1)}s`);
  const mp3 = path.join(OUT, 'narracao.mp3');
  if (process.env.MP3_FILE) fs.copyFileSync(process.env.MP3_FILE, mp3);
  else fs.writeFileSync(mp3, Buffer.from(await (await fetch(rot.mp3_url)).arrayBuffer()));

  /* 2. tempos das cenas: cada cena começa um pouco antes da fala; a última segura 1,2s depois do fim */
  const DUR = rot.duracao + 1.2;
  let nMesa = 0;
  const cenas = rot.cenas.map((c, i) => {
    const from = i === 0 ? 0 : Math.max(0, c.inicio - .12);
    const next = rot.cenas[i + 1];
    const to = next ? Math.max(from + .5, next.inicio - .12) : DUR;
    let tipo = c.tipo;
    if (tipo === 'mesa') tipo = (nMesa++ % 2) ? 'mesa2' : 'mesa';
    if (tipo === 'caixas' && !c.casal) tipo = 'caixas0';
    return { ...c, cam: CAM[tipo] || CAM.total, from, to, capFim: next ? to : DUR - .1 };
  });

  /* 3. navegador com tempo virtual */
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: 540, height: 960 }, deviceScaleFactor: 2 });
  p.on('pageerror', e => console.log('ERRO na página:', e.message));
  await p.addInitScript(() => {
    let vt = 0; const q = [];
    performance.now = () => vt;
    window.requestAnimationFrame = cb => { q.push(cb); return q.length; };
    window.__step = t => { vt = t; q.splice(0).forEach(cb => cb(t)); };
    Math.random = (() => { let s = 42; return () => (s = (s * 16807) % 2147483647) / 2147483647; })();
  });
  if (process.env.MOCK_DIR) { /* teste local: dados do banco salvos em arquivos */
    const M = process.env.MOCK_DIR;
    await p.route(/\/api\/resumo/, r => r.fulfill({ contentType: 'application/json', body: fs.readFileSync(M + '/resumo.json', 'utf8') }));
    await p.route(/\/api\/andar/, r => { const n = new URL(r.request().url()).searchParams.get('n');
      r.fulfill({ contentType: 'application/json', body: fs.existsSync(`${M}/a${n}.json`) ? fs.readFileSync(`${M}/a${n}.json`, 'utf8') : '[]' }); });
    await p.route(u => !u.href.startsWith('http://localhost'), r => r.abort());
  }
  await p.goto(SITE, { waitUntil: 'domcontentloaded', timeout: 90000 });
  /* o loop do site só anda quando damos __step: avançamos o relógio até tudo carregar */
  for (let i = 0; i < 40; i++) { await p.evaluate(t => window.__step(t), i * 250); await p.waitForTimeout(250); }
  await p.waitForFunction(() => typeof goTo === 'function' && typeof controls !== 'undefined' && typeof resumo !== 'undefined' && resumo, null, { timeout: 60000 });

  await p.addStyleTag({ content: `
    .top,.elev,.panel,.demo,.loading,.fpbar,.modal,.sheet,#sheet,.gr-fab,#gr-fab,.sheet-toggle,.toast,#toast{display:none!important}
    #cap{position:fixed;left:0;right:0;top:13%;z-index:99;display:grid;justify-items:center;gap:6px;text-align:center;padding:0 24px;
      color:#fbeadb;text-shadow:0 3px 18px rgba(20,8,24,.75),0 1px 2px rgba(20,8,24,.6)}
    #cap b{font-family:"Gloock",serif;font-weight:400;font-size:64px;line-height:1;letter-spacing:.5px}
    #cap b.s{font-size:40px;line-height:1.1;word-break:break-word}
    #cap span{font-family:"Figtree",sans-serif;font-weight:700;font-size:19px;letter-spacing:.06em;text-transform:uppercase}
    #brand{position:fixed;left:0;right:0;bottom:6%;z-index:99;text-align:center;font-family:"Pinyon Script",cursive;font-size:44px;color:#ffd88a;
      text-shadow:0 0 12px rgba(255,140,120,.8),0 2px 10px rgba(20,8,24,.7)}
    #brand small{display:block;font-family:"Figtree",sans-serif;font-size:15px;letter-spacing:.2em;color:#fbeadb;text-transform:uppercase;margin-top:2px}
    #labels.limpo .tag{visibility:hidden}
    #flash{position:fixed;inset:0;z-index:98;background:radial-gradient(circle at 50% 55%,rgba(255,216,138,.85),rgba(255,184,119,0) 60%);opacity:0;pointer-events:none}
  `});
  await p.evaluate(() => {
    document.body.insertAdjacentHTML('beforeend', '<div id="flash"></div><div id="cap"></div><div id="brand">Mesa pra Dois<small>@mesapradois.3d</small></div>');
    controls.enableDamping = false;
    const free = () => { controls.minPolarAngle = 0; controls.maxPolarAngle = Math.PI; controls.minAzimuthAngle = -Infinity; controls.maxAzimuthAngle = Infinity; controls.minDistance = 0; controls.maxDistance = 1e5; };
    free(); const _goTo = goTo; window.goTo = async (...a) => { await _goTo(...a); free(); };
  });
  await p.evaluate(() => document.fonts.ready);

  /* 4. acha em que andar (ou no terraço) está cada casal das cenas de mesa */
  const andares = rot.andares || 4;
  const casais = [...new Set(cenas.filter(c => c.casal).map(c => c.casal))];
  const onde = {};
  for (const a of [...Array(andares)].map((_, i) => i + 1)) {
    await p.evaluate(async a => { await goTo('andar', a, { instant: true }); }, a);
    for (let i = 0; i < 12; i++) { await p.evaluate(t => window.__step(t), 10000 + i * 200); await p.waitForTimeout(200); }
    for (const id of casais) if (!onde[id] && await p.evaluate(id => tableIndex.has(id), id)) onde[id] = { view: 'andar', andar: a };
  }
  await p.evaluate(async () => { await goTo('terraco', null, { instant: true }); });
  for (const id of casais) if (!onde[id] && await p.evaluate(id => tableIndex.has(id), id)) onde[id] = { view: 'terraco' };
  console.log('mesas:', JSON.stringify(onde));
  for (const c of cenas) {
    if (c.casal && onde[c.casal]) { c.view = onde[c.casal].view; c.andar = onde[c.casal].andar; }
    else if (c.casal) { c.casal = null; c.view = 'andar'; c.andar = c.andar || 2; c.cam = CAM.caixas0; }
    else { c.view = c.cam.view; c.andar = c.andar || 2; }
  }

  /* 5. quadros */
  const N = Math.round(FPS * DUR);
  let atual = -1, base = null;
  for (let f = 0; f < N; f++) {
    if (so && !so.includes(f)) continue;
    const t = f / FPS;
    const ci = Math.max(0, cenas.findIndex(c => t >= c.from && t < c.to + 1e-6));
    const c = cenas[ci];
    if (ci !== atual) {
      atual = ci;
      base = await p.evaluate(async ({ v, a }) => { await goTo(v, v === 'andar' ? a : null, { instant: true });
        return [controls.target.toArray(), camera.position.toArray()]; }, { v: c.view, a: c.andar });
      if (so) for (let i = 0; i < 8; i++) { await p.evaluate(tt => window.__step(tt), 1000 + t * 1000 - (8 - i) * 120); await p.waitForTimeout(150); }
    }
    const k = ease(Math.max(0, Math.min(1, (t - c.from) / (c.to - c.from))));
    let tgt, pos;
    if (c.cam.orbita) { /* gira em volta da vista padrão do site */
      const [T, P] = base, ang = (c.cam.orbita[0] + (c.cam.orbita[1] - c.cam.orbita[0]) * k) * Math.PI / 180;
      const z = c.cam.zoom[0] + (c.cam.zoom[1] - c.cam.zoom[0]) * k;
      const dx = P[0] - T[0], dy = P[1] - T[1], dz = P[2] - T[2];
      tgt = T; pos = [T[0] + (dx * Math.cos(ang) - dz * Math.sin(ang)) * z, T[1] + dy * z, T[2] + (dx * Math.sin(ang) + dz * Math.cos(ang)) * z];
    } else { tgt = lerp(c.cam.a[0], c.cam.b[0], k); pos = lerp(c.cam.a[1], c.cam.b[1], k); }
    if (c.casal) {
      const P = await p.evaluate(id => { const x = tableIndex.get(id); return x ? [x.pos.x, x.pos.y, x.pos.z] : null; }, c.casal);
      if (P) { tgt = tgt.map((v, i) => v + P[i]); pos = pos.map((v, i) => v + P[i]); }
    }
    const capOp = Math.max(0, Math.min(1, (t - c.from) / .3, (c.capFim - t) / .25));
    const terr = cenas.find(x => x.tipo === 'terraco');
    await p.evaluate(({ tgt, pos, t, html, op, limpo, fl }) => {
      controls.target.set(...tgt); camera.position.set(...pos);
      const el = document.getElementById('cap');
      if (el.dataset.h !== html) { el.innerHTML = html; el.dataset.h = html; }
      el.style.opacity = op; el.style.transform = `translateY(${(1 - op) * 14}px)`;
      document.getElementById('flash').style.opacity = fl;
      document.getElementById('labels').classList.toggle('limpo', limpo);
      window.__step(1000 + t * 1000);
    }, { tgt, pos, t, html: c.legenda, op: capOp, limpo: !!c.casal,
         fl: terr && t >= terr.from && t <= terr.from + .8 ? Math.sin((t - terr.from) / .8 * Math.PI) * .8 : 0 });
    await p.screenshot({ path: `${FR}/f${String(f).padStart(4, '0')}.jpg`, type: 'jpeg', quality: 92, timeout: 120000 });
    if (f % 96 === 0) console.log('quadro', f, '/', N, new Date().toISOString().slice(11, 19));
  }
  await b.close();
  if (so) { console.log('teste de quadros pronto em', FR); return; }

  /* 6. junta vídeo + narração + música de fundo */
  const mp4 = path.join(OUT, 'reels.mp4');
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(FPS), '-i', `${FR}/f%04d.jpg`, '-i', mp3,
    '-stream_loop', '-1', '-i', path.join(__dirname, 'bed.wav'),
    '-filter_complex', `[1:a]apad,atrim=0:${DUR.toFixed(2)}[n];[2:a]volume=0.12,atrim=0:${DUR.toFixed(2)},afade=t=out:st=${(DUR - 1.5).toFixed(2)}:d=1.5[m];[n][m]amix=inputs=2:duration=first:normalize=0[a]`,
    '-map', '0:v', '-map', '[a]', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-pix_fmt', 'yuv420p', '-r', String(FPS),
    '-c:a', 'aac', '-b:a', '160k', '-ar', '48000', '-t', DUR.toFixed(2), '-movflags', '+faststart', mp4], { stdio: 'inherit' });
  fs.writeFileSync(path.join(OUT, 'legenda.txt'), rot.legenda);
  console.log('vídeo:', mp4, (fs.statSync(mp4).size / 1e6).toFixed(1) + ' MB');
  if (process.env.NAO_SUBIR) return;

  /* 7. sobe pro Storage e avisa que está pronto */
  const up = await fn('upload');
  const r = await fetch(up.url, { method: 'PUT', headers: { 'Content-Type': 'video/mp4', 'x-upsert': 'true' }, body: fs.readFileSync(mp4) });
  if (!r.ok) throw new Error('upload do mp4 falhou: ' + r.status + ' ' + (await r.text()).slice(0, 300));
  const ok = await fn('pronto', process.env.PAUSADO ? { status: 'pausado' } : {});
  console.log('pronto:', ok.video_url);
})().catch(e => { console.error(e); process.exit(1); });
