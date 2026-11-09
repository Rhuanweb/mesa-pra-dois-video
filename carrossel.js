// Mesa pra Dois — carrossel do dia (1080×1350, até 10 slides).
// Uso: node carrossel.js   (pega o tema do dia na função mesa-video, fotografa o site, monta os slides, sobe e marca como pronto)
// Variáveis: MESA_VIDEO_TOKEN, SITE_URL, FN_URL, DIA, TEMA (forçar um tema), REFAZER=1, PAUSADO=1, NAO_SUBIR=1,
//            SPEC_FILE (teste local sem rede), MOCK_DIR (dados do site em arquivos)
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const SITE = process.env.SITE_URL || 'https://mesapradois.vercel.app/';
const FN = process.env.FN_URL || 'https://fccqvzpuisiyfumhgtbj.supabase.co/functions/v1/mesa-video';
const TOKEN = process.env.MESA_VIDEO_TOKEN || '';
const OUT = path.join(__dirname, 'saida', 'carrossel');
const W = 540, H = 675; // ×2 = 1080×1350

async function fn(acao, extra = {}) {
  const r = await fetch(FN, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-video-token': TOKEN },
    body: JSON.stringify({ acao, ...(process.env.DIA ? { dia: process.env.DIA } : {}), ...extra }) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.ok === false) throw new Error(`${acao}: ${r.status} ${JSON.stringify(j).slice(0, 400)}`);
  return j;
}

const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])).replace(/\n/g, '<br>');
const fonte = f => 'data:font/woff2;base64,' + fs.readFileSync(path.join(__dirname, 'fontes', f)).toString('base64');

const CSS = `
@font-face{font-family:Gloock;src:url(${fonte('gloock-latin-400-normal.woff2')})}
@font-face{font-family:Figtree;font-weight:400;src:url(${fonte('figtree-latin-400-normal.woff2')})}
@font-face{font-family:Figtree;font-weight:700;src:url(${fonte('figtree-latin-700-normal.woff2')})}
@font-face{font-family:Pinyon;src:url(${fonte('pinyon-script-latin-400-normal.woff2')})}
*{box-sizing:border-box;margin:0;padding:0}
html,body{width:${W}px;height:${H}px;overflow:hidden}
body{font-family:Figtree,"Noto Color Emoji",sans-serif;color:#fbeadb;position:relative;
  background:radial-gradient(120% 80% at 80% 0%,#ff9a76 0%,rgba(255,154,118,0) 55%),
             radial-gradient(90% 70% at 0% 100%,#7b2f63 0%,rgba(123,47,99,0) 60%),
             linear-gradient(170deg,#3a1440 0%,#2a0f33 45%,#1b0a24 100%)}
.bg{position:absolute;inset:0;background-size:cover;background-position:center}
.sombra{position:absolute;inset:0;background:linear-gradient(180deg,rgba(27,10,36,.55) 0%,rgba(27,10,36,0) 28%,rgba(27,10,36,0) 45%,rgba(27,10,36,.92) 82%)}
.sombra.topo{background:linear-gradient(180deg,rgba(27,10,36,.85) 0%,rgba(27,10,36,.2) 40%,rgba(27,10,36,0) 60%,rgba(27,10,36,.6) 100%)}
.wrap{position:absolute;inset:0;padding:44px 40px 70px;display:flex;flex-direction:column}
.kicker{display:inline-block;align-self:flex-start;font-weight:700;font-size:12px;letter-spacing:.18em;padding:7px 12px;border-radius:99px;
  background:rgba(255,216,138,.16);color:#ffd88a;border:1px solid rgba(255,216,138,.35)}
h1{font-family:Gloock,serif;font-weight:400;font-size:46px;line-height:1.04;margin-top:14px;text-shadow:0 2px 18px rgba(20,8,24,.55)}
h1.g{font-size:58px}
.sub{font-size:19px;margin-top:12px;opacity:.92;font-weight:700}
.fim{margin-top:auto}
.itens{margin-top:26px;display:flex;flex-direction:column;gap:14px}
.it{display:flex;gap:14px;align-items:center;background:rgba(251,234,219,.07);border:1px solid rgba(251,234,219,.13);border-radius:18px;padding:14px 16px}
.ic{flex:none;width:50px;height:50px;border-radius:14px;display:grid;place-items:center;font-size:26px;background:rgba(255,216,138,.14)}
.it b{display:block;font-size:19px;line-height:1.2}
.it span{display:block;font-size:15px;opacity:.82;margin-top:3px;line-height:1.3}
.nums{margin-top:30px;display:grid;gap:14px}
.num{border-radius:20px;padding:16px 20px;background:rgba(251,234,219,.07);border:1px solid rgba(251,234,219,.13)}
.num b{font-family:Gloock,serif;font-weight:400;font-size:56px;line-height:1;color:#ffd88a;display:block}
.num span{font-size:16px;font-weight:700;letter-spacing:.04em;opacity:.9}
.selo{font-size:64px;line-height:1;margin-bottom:6px}
.marca{position:absolute;left:0;right:0;bottom:20px;display:flex;justify-content:space-between;align-items:center;padding:0 40px}
.marca .n{font-family:Pinyon,cursive;font-size:30px;color:#ffd88a;text-shadow:0 0 10px rgba(255,140,120,.6)}
.marca .h{font-size:12px;letter-spacing:.16em;font-weight:700;opacity:.85}
.pag{position:absolute;top:44px;right:40px;font-size:12px;font-weight:700;letter-spacing:.12em;opacity:.7}
.seta{position:absolute;right:28px;top:50%;font-size:28px;opacity:.55}
`;

function html(s, i, n, foto) {
  const marca = `<div class="marca"><span class="n">Mesa pra Dois</span><span class="h">@MESAPRADOIS.3D</span></div>`;
  const pag = `<div class="pag">${i + 1}/${n}</div>`;
  const seta = i < n - 1 ? `<div class="seta">›</div>` : '';
  let corpo = '';
  if (s.tipo === 'capa' || s.tipo === 'cta') {
    corpo = `<div class="bg" style="background-image:url(${foto})"></div><div class="sombra"></div>
      <div class="wrap">${s.kicker ? `<span class="kicker">${esc(s.kicker)}</span>` : ''}
      <div class="fim"><h1 class="g">${esc(s.titulo)}</h1>${s.sub ? `<div class="sub">${esc(s.sub)}</div>` : ''}</div></div>`;
  } else if (s.tipo === 'foto') {
    corpo = `<div class="bg" style="background-image:url(${foto})"></div><div class="sombra"></div>
      <div class="wrap"><span class="kicker">${esc(s.kicker)}</span>
      <div class="fim">${s.selo ? `<div class="selo">${s.selo}</div>` : ''}<h1>${esc(s.titulo)}</h1>${s.texto ? `<div class="sub">${esc(s.texto)}</div>` : ''}</div></div>`;
  } else if (s.tipo === 'lista') {
    corpo = `<div class="wrap"><span class="kicker">${esc(s.kicker)}</span><h1>${esc(s.titulo)}</h1>
      <div class="itens">${s.itens.map(x => `<div class="it"><div class="ic">${x.icone}</div><div><b>${esc(x.titulo)}</b>${x.texto ? `<span>${esc(x.texto)}</span>` : ''}</div></div>`).join('')}</div></div>`;
  } else if (s.tipo === 'numeros') {
    corpo = `<div class="wrap"><span class="kicker">${esc(s.kicker)}</span><h1>${esc(s.titulo)}</h1>
      <div class="nums">${s.itens.map(x => `<div class="num"><b>${esc(x.valor)}</b><span>${esc(x.label)}</span></div>`).join('')}</div></div>`;
  }
  return `<!doctype html><html><head><meta charset="utf-8"><style>${CSS}</style></head><body>${corpo}${pag}${seta}${marca}</body></html>`;
}

/* posições de câmera para as fotos do site (vista padrão do site com um giro, ou perto da mesa do casal) */
async function fotografar(p, fundo, arq) {
  const v = fundo.view === 'mesa' ? 'andar' : fundo.view;
  await p.evaluate(async ({ v, a }) => { await goTo(v, v === 'andar' ? a : null, { instant: true }); }, { v, a: fundo.andar || 2 });
  if (fundo.view === 'mesa') {
    let achou = await p.evaluate(id => tableIndex.has(id), fundo.casal);
    const nA = await p.evaluate(() => (resumo && resumo.andares) || 4);
    for (let a = 1; !achou && a <= nA; a++) {
      await p.evaluate(async a => { await goTo('andar', a, { instant: true }); }, a);
      for (let i = 0; i < 6; i++) { await p.evaluate(t => window.__step(t), 5000 + i * 200); await p.waitForTimeout(150); }
      achou = await p.evaluate(id => tableIndex.has(id), fundo.casal);
    }
    if (!achou) { await p.evaluate(async () => { await goTo('terraco', null, { instant: true }); }); achou = await p.evaluate(id => tableIndex.has(id), fundo.casal); }
    if (achou) await p.evaluate(id => { const x = tableIndex.get(id).pos; controls.target.set(x.x, x.y + 1, x.z); camera.position.set(x.x + 3.2, x.y + 2.8, x.z + 4.2); }, fundo.casal);
  } else {
    const giro = { predio: 0, terraco: 18, andar: -22 }[v] ?? 0, zoom = { predio: 1, terraco: .5, andar: .85 }[v] ?? 1;
    await p.evaluate(({ giro, zoom }) => {
      const T = controls.target, P = camera.position, ang = giro * Math.PI / 180;
      const dx = P.x - T.x, dy = P.y - T.y, dz = P.z - T.z;
      camera.position.set(T.x + (dx * Math.cos(ang) - dz * Math.sin(ang)) * zoom, T.y + dy * zoom, T.z + (dx * Math.sin(ang) + dz * Math.cos(ang)) * zoom);
    }, { giro, zoom });
  }
  await p.evaluate(() => document.getElementById('labels').classList.add('limpo'));
  for (let i = 0; i < 10; i++) { await p.evaluate(t => window.__step(t), 20000 + i * 120); await p.waitForTimeout(120); }
  await p.screenshot({ path: arq, type: 'jpeg', quality: 90, timeout: 120000 });
}

(async () => {
  fs.rmSync(OUT, { recursive: true, force: true }); fs.mkdirSync(OUT, { recursive: true });
  const spec = process.env.SPEC_FILE ? JSON.parse(fs.readFileSync(process.env.SPEC_FILE, 'utf8'))
    : await fn('carrossel_roteiro', { ...(process.env.REFAZER ? { refazer: true } : {}), ...(process.env.TEMA ? { tema: process.env.TEMA, refazer: true } : {}) });
  const slides = spec.slides.slice(0, 10);
  console.log(`Carrossel ${spec.dia} · tema ${spec.tema} · ${slides.length} slides`);

  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });

  /* 1. fotos do site para os slides que têm fundo */
  const fotos = {};
  if (slides.some(s => s.fundo)) {
    const p = await b.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 2 });
    p.on('pageerror', e => console.log('ERRO na página:', e.message));
    await p.addInitScript(() => {
      let vt = 0; const q = [];
      performance.now = () => vt;
      window.requestAnimationFrame = cb => { q.push(cb); return q.length; };
      window.__step = t => { vt = t; q.splice(0).forEach(cb => cb(t)); };
      Math.random = (() => { let s = 7; return () => (s = (s * 16807) % 2147483647) / 2147483647; })();
    });
    if (process.env.MOCK_DIR) {
      const M = process.env.MOCK_DIR;
      await p.route(/\/api\/resumo/, r => r.fulfill({ contentType: 'application/json', body: fs.readFileSync(M + '/resumo.json', 'utf8') }));
      await p.route(/\/api\/andar/, r => { const n = new URL(r.request().url()).searchParams.get('n');
        r.fulfill({ contentType: 'application/json', body: fs.existsSync(`${M}/a${n}.json`) ? fs.readFileSync(`${M}/a${n}.json`, 'utf8') : '[]' }); });
      await p.route(u => !u.href.startsWith('http://localhost'), r => r.abort());
    }
    await p.goto(SITE, { waitUntil: 'domcontentloaded', timeout: 90000 });
    for (let i = 0; i < 40; i++) { await p.evaluate(t => window.__step(t), i * 250); await p.waitForTimeout(250); }
    await p.waitForFunction(() => typeof goTo === 'function' && typeof controls !== 'undefined' && typeof resumo !== 'undefined' && resumo, null, { timeout: 60000 });
    await p.addStyleTag({ content: `.top,.elev,.panel,.demo,.loading,.fpbar,.modal,.sheet,#sheet,.gr-fab,#gr-fab,.sheet-toggle,.toast,#toast{display:none!important}#labels.limpo .tag{visibility:hidden}` });
    await p.evaluate(() => {
      controls.enableDamping = false;
      const free = () => { controls.minPolarAngle = 0; controls.maxPolarAngle = Math.PI; controls.minAzimuthAngle = -Infinity; controls.maxAzimuthAngle = Infinity; controls.minDistance = 0; controls.maxDistance = 1e5; };
      free(); const _goTo = goTo; window.goTo = async (...a) => { await _goTo(...a); free(); };
    });
    for (let i = 0; i < slides.length; i++) {
      const f = slides[i].fundo; if (!f) continue;
      const arq = path.join(OUT, `foto${i}.jpg`);
      await fotografar(p, f, arq);
      fotos[i] = 'data:image/jpeg;base64,' + fs.readFileSync(arq).toString('base64');
    }
    await p.close();
  }

  /* 2. monta cada slide */
  const pg = await b.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 2 });
  const arquivos = [];
  for (let i = 0; i < slides.length; i++) {
    await pg.setContent(html(slides[i], i, slides.length, fotos[i]), { waitUntil: 'load' });
    await pg.evaluate(() => document.fonts.ready);
    const arq = path.join(OUT, `${String(i + 1).padStart(2, '0')}.jpg`);
    await pg.screenshot({ path: arq, type: 'jpeg', quality: 92 });
    arquivos.push(arq);
  }
  await b.close();
  fs.writeFileSync(path.join(OUT, 'legenda.txt'), spec.legenda);
  console.log('slides prontos:', arquivos.length);
  if (process.env.NAO_SUBIR) return;

  /* 3. sobe e marca como pronto */
  const up = await fn('carrossel_upload', { n: arquivos.length });
  for (let i = 0; i < arquivos.length; i++) {
    const r = await fetch(up.urls[i], { method: 'PUT', headers: { 'Content-Type': 'image/jpeg', 'x-upsert': 'true' }, body: fs.readFileSync(arquivos[i]) });
    if (!r.ok) throw new Error(`upload ${i + 1} falhou: ${r.status} ${(await r.text()).slice(0, 200)}`);
  }
  const ok = await fn('carrossel_pronto', { n: arquivos.length, ...(process.env.PAUSADO ? { status: 'pausado' } : {}) });
  console.log('pronto:', ok.imagens?.length, 'imagens');
})().catch(e => { console.error(e); process.exit(1); });
