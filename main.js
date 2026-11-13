// ПОЛОСА — сцена «ночная дорога → рассвет». Вид от первого лица: скролл = газ.
import * as THREE from 'three';

const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const isSmall = matchMedia('(max-width: 860px)').matches;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const sstep = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

/* ------------------------------------------------------------------ */
/* Маршрут: ключевые отметки в метрах вдоль дороги                     */
/* ------------------------------------------------------------------ */
const ROUTE = {
  signs: [300, 335, 370, 405, 440],
  cones: { from: 505, step: 18, count: 9 },
  city: [640, 1120],
  stop: 880,
  dawn: [870, 1235],
};

/* ------------------------------------------------------------------ */
/* DOM: появление текста, HUD, навигация, форма — работает и без WebGL */
/* ------------------------------------------------------------------ */
const sections = [...document.querySelectorAll('.sec')].map((el) => ({
  el, id: el.id, from: +el.dataset.from, to: +el.dataset.to, stage: el.dataset.stage, top: 0, height: 1,
}));
const exam = sections.find((s) => s.id === 'exam');
const routeLinks = [...document.querySelectorAll('.route a')];
const hudStage = document.getElementById('hudStage');
const hudKm = document.getElementById('hudKm');
const hudSpeed = document.getElementById('hudSpeed');

const io = new IntersectionObserver((entries) => {
  for (const e of entries) if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
}, { rootMargin: '0px 0px -12% 0px', threshold: 0.1 });
document.querySelectorAll('.reveal, .display').forEach((el) => {
  if (!el.closest('.sec--hero')) io.observe(el);
});

function measure() {
  const y = scrollY;
  for (const s of sections) {
    const r = s.el.getBoundingClientRect();
    s.top = r.top + y; s.height = r.height;
  }
}

const state = { dist: sections[0].from, target: sections[0].from, light: 'red', examT: 0, section: sections[0] };

function readScroll() {
  const docH = document.documentElement.scrollHeight;
  const max = Math.max(1, docH - innerHeight);
  const p = clamp(scrollY / max, 0, 1);
  const probe = p * docH;
  let cur = sections[0];
  for (const s of sections) if (probe >= s.top) cur = s;
  const t = clamp((probe - cur.top) / cur.height, 0, 1);
  state.target = lerp(cur.from, cur.to, t);
  state.section = cur;

  // светофор: красный → красный+жёлтый → зелёный
  let light = 'red';
  if (cur === exam) { state.examT = t; light = t < 0.5 ? 'red' : t < 0.58 ? 'ready' : 'green'; }
  else if (probe > exam.top) light = 'green';
  if (light !== state.light) { state.light = light; exam.el.dataset.light = light; }

  if (hudStage.textContent !== cur.stage) hudStage.textContent = cur.stage;
  const idx = routeLinks.findIndex((a) => a.dataset.target === cur.id || (cur.id === 'manifest' && a.dataset.target === 'hero'));
  routeLinks.forEach((a, i) => {
    a.classList.toggle('is-active', i === idx);
    a.classList.toggle('is-done', i < idx);
    if (i === idx) a.setAttribute('aria-current', 'step'); else a.removeAttribute('aria-current');
  });
}

addEventListener('scroll', readScroll, { passive: true });
addEventListener('resize', () => { measure(); readScroll(); });

document.querySelectorAll('a[href^="#"]').forEach((a) => {
  a.addEventListener('click', (e) => {
    const target = document.querySelector(a.getAttribute('href'));
    if (!target) return;
    e.preventDefault();
    if (a.dataset.plan) document.getElementById('fPlan').value = a.dataset.plan;
    let y = target.getBoundingClientRect().top + scrollY;
    if (target.id === 'enroll') y = document.documentElement.scrollHeight; // финал читается в конце пути
    scrollTo({ top: y, behavior: reduceMotion ? 'auto' : 'smooth' });
    history.replaceState(null, '', a.getAttribute('href'));
    if (target.id === 'enroll') setTimeout(() => document.getElementById('fName').focus({ preventScroll: true }), reduceMotion ? 0 : 1400);
  });
});

// Форма: бэкенд не подключён — честно сообщаем об этом
const form = document.getElementById('enrollForm');
const statusEl = document.getElementById('formStatus');
form.addEventListener('submit', (e) => {
  e.preventDefault();
  const name = form.elements.name, phone = form.elements.phone;
  const okName = name.value.trim().length > 1;
  const okPhone = phone.value.replace(/\D/g, '').length >= 10;
  name.setAttribute('aria-invalid', String(!okName));
  phone.setAttribute('aria-invalid', String(!okPhone));
  statusEl.classList.toggle('is-error', !(okName && okPhone));
  if (!okName) { statusEl.textContent = 'Напишите, как к вам обращаться.'; name.focus(); return; }
  if (!okPhone) { statusEl.textContent = 'Проверьте номер — нужно минимум 10 цифр.'; phone.focus(); return; }
  statusEl.textContent = `${name.value.trim()}, заявка собрана. Демо-версия: отправка в CRM ещё не подключена.`;
});

function startIntro() {
  performance.mark('intro');
  document.body.classList.remove('is-loading');
  setTimeout(() => {
    document.querySelectorAll('.sec--hero .display, .sec--hero .reveal').forEach((el) => el.classList.add('in'));
  }, reduceMotion ? 0 : 650);
}

const foot = document.querySelector('.foot');
new IntersectionObserver(([e]) => document.body.classList.toggle('at-end', e.isIntersecting)).observe(foot);

measure(); readScroll();

/* ------------------------------------------------------------------ */
/* 3D                                                                  */
/* ------------------------------------------------------------------ */
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas: document.getElementById('scene'), antialias: true, powerPreference: 'high-performance' });
} catch (err) {
  document.documentElement.classList.add('no-webgl');
  startIntro();
}

if (renderer) initScene();

function initScene() {
  const maxDpr = isSmall ? 1.5 : 2;
  renderer.setPixelRatio(Math.min(devicePixelRatio, maxDpr));
  renderer.setSize(innerWidth, innerHeight, false);
  renderer.outputColorSpace = THREE.LinearSRGBColorSpace; // цвета в шейдерах заданы сразу «на экран»

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(58, innerWidth / innerHeight, 0.1, 4000);

  /* ---------- кривая дороги ---------- */
  const curve = new THREE.CatmullRomCurve3([
    [0, 0], [0, -120], [22, -250], [64, -370], [44, -490], [-18, -610], [-62, -730],
    [-34, -850], [0, -960], [0, -1100], [0, -1300], [0, -1500], [0, -1750],
  ].map(([x, z]) => new THREE.Vector3(x, 0, z)), false, 'centripetal');
  curve.arcLengthDivisions = 3000;
  const LENGTH = curve.getLength();
  const _t = new THREE.Vector3();
  // точка на дороге: d — метры вдоль оси, lat — смещение вправо
  function roadPoint(d, lat, out, right) {
    const u = clamp(d / LENGTH, 0, 1);
    curve.getPointAt(u, out);
    curve.getTangentAt(u, _t);
    const rx = -_t.z, rz = _t.x;
    const n = Math.hypot(rx, rz) || 1;
    out.x += (rx / n) * lat; out.z += (rz / n) * lat;
    if (right) right.set(rx / n, 0, rz / n);
    return _t;
  }

  /* ---------- общие uniform'ы света ---------- */
  const U = {
    uCam: { value: new THREE.Vector3() },
    uFwd: { value: new THREE.Vector2(0, -1) },
    uHead: { value: 0 },
    uDawn: { value: 0 },
    uFog: { value: new THREE.Color() },
    uFogD: { value: 0.012 },
    uTime: { value: 0 },
  };

  const LIGHT_GLSL = /* glsl */`
    uniform vec3 uCam; uniform vec2 uFwd; uniform float uHead; uniform float uDawn;
    uniform vec3 uFog; uniform float uFogD; uniform float uTime;
    float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    float noise(vec2 p){
      vec2 i = floor(p), f = fract(p); f = f*f*(3.-2.*f);
      return mix(mix(hash(i), hash(i+vec2(1,0)), f.x), mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), f.x), f.y);
    }
    // фары: конус ближнего света + рассеянный свет неба
    void lightAt(vec3 wp, out vec3 amb, out vec3 head, out float fogF){
      vec2 to = wp.xz - uCam.xz; float d = length(to);
      float ang = dot(to / max(d, 1e-3), uFwd);
      float cone = pow(smoothstep(0.76, 0.996, ang), 1.7);
      float fall = 1. / (1. + d*d*0.0038);
      float cut = smoothstep(120., 30., d) * smoothstep(0.8, 4.5, d);
      head = vec3(1.0, 0.93, 0.80) * (uHead * cone * fall * cut * 7.5);
      amb = mix(vec3(0.055, 0.075, 0.12), vec3(0.95, 0.66, 0.50), uDawn);
      fogF = 1. - exp(-d*d*uFogD*uFogD);
    }
    vec3 finish(vec3 c, float fogF){
      c = 1. - exp(-c * 1.5);
      c = mix(c, uFog, fogF);
      return c + (hash(gl_FragCoord.xy + uTime) - .5) / 255.;
    }
  `;

  /* ---------- дорога ---------- */
  {
    const N = 1500, W = 46;
    const pos = new Float32Array((N + 1) * 6), road = new Float32Array((N + 1) * 4), idx = [];
    const p = new THREE.Vector3(), r = new THREE.Vector3();
    for (let i = 0; i <= N; i++) {
      const d = (i / N) * LENGTH;
      roadPoint(d, 0, p, r);
      pos.set([p.x - r.x * W, 0, p.z - r.z * W, p.x + r.x * W, 0, p.z + r.z * W], i * 6);
      road.set([-W, d, W, d], i * 4);
      if (i < N) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aRoad', new THREE.BufferAttribute(road, 2));
    g.setIndex(idx);
    U.uSignal = { value: new THREE.Color(0, 0, 0) };
    const m = new THREE.ShaderMaterial({
      side: THREE.DoubleSide,
      uniforms: {
        ...U,
        uCity: { value: new THREE.Vector2(...ROUTE.city) },
        uAuto: { value: new THREE.Vector2(ROUTE.cones.from - 20, ROUTE.cones.from + ROUTE.cones.step * ROUTE.cones.count + 10) },
        uStop: { value: ROUTE.stop },
      },
      vertexShader: /* glsl */`
        attribute vec2 aRoad; varying vec2 vRoad; varying vec3 vW;
        void main(){ vRoad = aRoad; vW = position; gl_Position = projectionMatrix * viewMatrix * vec4(position, 1.); }`,
      fragmentShader: /* glsl */`
        ${LIGHT_GLSL}
        uniform vec2 uCity; uniform vec2 uAuto; uniform float uStop; uniform vec3 uSignal;
        varying vec2 vRoad; varying vec3 vW;
        float band(float v, float w, float aa){ return 1. - smoothstep(w, w + aa, abs(v)); }
        void main(){
          float x = vRoad.x, y = vRoad.y, ax = abs(x);
          vec2 w = vW.xz;
          mat2 rot = mat2(0.8, -0.6, 0.6, 0.8);
          float g = noise(w*41.)*.34 + noise(rot*w*97.)*.33 + noise(rot*rot*w*173.)*.33;
          vec3 asphalt = vec3(0.070, 0.073, 0.082) * (0.72 + 0.56*g) * (0.8 + 0.4*noise(rot*w*0.37));
          // колея: чуть светлее, накатанная
          asphalt *= 1. + 0.18 * (band(ax - 1.75, 0.35, 0.5));
          vec3 gravel = vec3(0.115, 0.105, 0.095) * (0.55 + 0.9*noise(w*26.));
          vec3 grass = vec3(0.030, 0.046, 0.034) * (0.45 + noise(w*7.) + 0.6*noise(w*38.));
          vec3 col = mix(asphalt, gravel, smoothstep(3.72, 3.95, ax));
          col = mix(col, grass, smoothstep(4.8, 6.4, ax + noise(w*0.7)*1.3));

          float aa = fwidth(x) * 1.3 + 0.004;
          float edge = band(ax - 3.5, 0.06, aa);
          float inAuto = smoothstep(uAuto.x, uAuto.x + 8., y) * (1. - smoothstep(uAuto.y, uAuto.y + 8., y));
          float solid = step(uStop - 70., y) * step(y, uStop);
          float dash = mix(step(fract(y / 12.), 0.34), 1., solid) * (1. - inAuto);
          float centre = band(x, 0.06, aa) * dash;
          float aay = fwidth(y) * 1.3 + 0.004;
          float stopLine = band(y - uStop, 0.22, aay) * step(0.1, x) * step(x, 3.44);
          float zebra = step(uStop + 2., y) * step(y, uStop + 6.) * step(ax, 3.3) * step(fract(x * 1. + .25), .5);
          float mark = max(max(edge, centre), max(stopLine, zebra));
          mark *= 0.62 + 0.38 * smoothstep(0.25, 0.6, noise(w*5.) + 0.25*noise(w*40.));
          col = mix(col, vec3(0.80, 0.79, 0.74), mark * 0.92);

          vec3 amb, head; float fogF; lightAt(vW, amb, head, fogF);
          // фонари: тёплые пятна на асфальте в городской зоне
          float inCity = step(uCity.x, y) * step(y, uCity.y);
          float k = floor(y / 36.);
          float ly = (fract(y / 36.) - .5) * 36.;
          float side = mod(k, 2.) * 2. - 1.;
          float lx = x - side * 4.1;
          vec3 lamp = vec3(1.0, 0.60, 0.24) * exp(-(ly*ly + lx*lx) / 70.) * inCity * 5.5 * (1. - uDawn);
          // светофор красит асфальт
          float sd = (y - uStop)*(y - uStop) + (x - 3.4)*(x - 3.4);
          vec3 sig = uSignal * (exp(-sd / 40.) * 5.0 + exp(-sd / 600.) * 0.9);
          // мокрый блик разметки под фарами
          vec3 lit = col * (amb + head * (1. + mark * 0.9) + lamp + sig);
          // рассвет отражается в мокром асфальте
          vec3 V = normalize(vW - uCam);
          float sheen = pow(max(dot(normalize(vec3(V.x, -V.y, V.z)), normalize(vec3(0., 0.035, -1.))), 0.), 26.);
          lit += uDawn * vec3(1.0, 0.58, 0.30) * sheen * (0.35 + 0.65 * g) * (1. - smoothstep(3.6, 4.2, ax)) * 0.55;
          gl_FragColor = vec4(finish(lit, fogF), 1.);
        }`,
    });
    const mesh = new THREE.Mesh(g, m);
    mesh.frustumCulled = false;
    scene.add(mesh);
  }

  /* ---------- небо: градиент, звёзды, горы, рассвет ---------- */
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(2500, 48, 24),
    new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, depthTest: false,
      uniforms: { uDawn: U.uDawn, uFog: U.uFog, uTime: U.uTime, uSun: { value: new THREE.Vector3(0, 0.035, -1).normalize() } },
      vertexShader: /* glsl */`varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }`,
      fragmentShader: /* glsl */`
        uniform float uDawn; uniform vec3 uFog; uniform float uTime; uniform vec3 uSun; varying vec3 vDir;
        float h1(float n){ return fract(sin(n * 91.3458) * 47453.5453); }
        float h2(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float n1(float x){ float i = floor(x), f = fract(x); f = f*f*(3.-2.*f); return mix(h1(i), h1(i+1.), f); }
        float ridge(float a){ return n1(a)*.5 + n1(a*2.3 + 7.)*.27 + n1(a*5.1 + 3.)*.14 + n1(a*11.7)*.09; }
        void main(){
          vec3 d = normalize(vDir); float h = d.y;
          vec3 top = mix(vec3(0.010, 0.016, 0.034), vec3(0.060, 0.095, 0.230), uDawn);
          vec3 col = mix(uFog, top, pow(smoothstep(0.0, 0.5, h), 0.65));
          float sd = max(dot(d, uSun), 0.);
          col += uDawn * (vec3(1.0, 0.50, 0.22) * pow(sd, 5.) * 0.50 + vec3(1.0, 0.80, 0.55) * pow(sd, 40.) * 0.55 + vec3(1.0, 0.95, 0.85) * pow(sd, 900.) * 1.2);
          // звёзды
          vec2 sp = vec2(atan(d.x, -d.z) * 70., h * 110.);
          vec2 cell = floor(sp); vec2 f = fract(sp) - .5;
          float rnd = h2(cell);
          float star = step(0.978, rnd) * smoothstep(0.18, 0.0, length(f + (vec2(h2(cell + 3.), h2(cell + 9.)) - .5) * .6));
          star *= 0.55 + 0.45 * sin(uTime * (1. + rnd * 3.) + rnd * 40.);
          col += vec3(0.85, 0.9, 1.0) * star * smoothstep(0.04, 0.3, h) * (1. - uDawn) * (1. - uDawn);
          // горы — два плана
          float a = atan(d.x, -d.z);
          float r1 = 0.028 + 0.085 * ridge(a * 3.2 + 12.);
          float r2 = 0.010 + 0.052 * ridge(a * 6.0 + 4.);
          vec3 m1 = mix(uFog * 0.62, mix(uFog, vec3(0.20, 0.15, 0.30), 0.62), uDawn);
          vec3 m2 = mix(uFog * 0.36, vec3(0.055, 0.050, 0.105), uDawn);
          col = mix(col, m1, 1. - smoothstep(r1, r1 + 0.0025, h));
          col = mix(col, m2, 1. - smoothstep(r2, r2 + 0.0020, h));
          col = mix(col, uFog, 1. - smoothstep(-0.004, 0.006, h));
          col += (h2(gl_FragCoord.xy) - .5) / 255.;
          gl_FragColor = vec4(col, 1.);
        }`,
    }),
  );
  sky.renderOrder = -1; sky.frustumCulled = false;
  scene.add(sky);

  /* ---------- материал реквизита: тот же свет фар ---------- */
  function propMat({ color = 0xffffff, map = null, retro = 1, stripe = false, decal = false, glow = 0 } = {}) {
    return new THREE.ShaderMaterial({
      transparent: !!map, depthWrite: !decal, side: map ? THREE.DoubleSide : THREE.FrontSide,
      polygonOffset: decal, polygonOffsetFactor: -4, polygonOffsetUnits: -4,
      uniforms: {
        ...U, uColor: { value: new THREE.Color(color) }, uMap: { value: map },
        uUseMap: { value: map ? 1 : 0 }, uRetro: { value: retro }, uStripe: { value: stripe ? 1 : 0 },
        uDecal: { value: decal ? 1 : 0 }, uGlow: { value: glow },
      },
      vertexShader: /* glsl */`
        varying vec3 vW; varying vec3 vN; varying vec2 vUv; varying float vY;
        void main(){
          vec4 p = vec4(position, 1.); vec3 n = normal;
          #ifdef USE_INSTANCING
            p = instanceMatrix * p; n = mat3(instanceMatrix) * n;
          #endif
          vec4 wp = modelMatrix * p;
          vW = wp.xyz; vN = normalize(mat3(modelMatrix) * n); vUv = uv; vY = position.y;
          gl_Position = projectionMatrix * viewMatrix * wp;
        }`,
      fragmentShader: /* glsl */`
        ${LIGHT_GLSL}
        uniform vec3 uColor; uniform sampler2D uMap; uniform float uUseMap, uRetro, uStripe, uDecal, uGlow;
        varying vec3 vW; varying vec3 vN; varying vec2 vUv; varying float vY;
        void main(){
          vec4 base = vec4(uColor, 1.);
          if (uUseMap > .5) { base *= texture2D(uMap, vUv); }
          if (uStripe > .5) { base.rgb = mix(base.rgb, vec3(.9), step(0.02, vY) * step(vY, 0.13)); }
          if (uDecal > .5) { base.a *= 0.55 + 0.45 * smoothstep(.25, .6, noise(vW.xz * 5.) + .25 * noise(vW.xz * 40.)); }
          if (base.a < 0.04) discard;
          vec3 amb, head; float fogF; lightAt(vW, amb, head, fogF);
          float nl = uDecal > .5 ? 1. : 0.45 + 0.55 * abs(dot(normalize(vN), normalize(uCam - vW)));
          vec3 lit = base.rgb * (amb + head * nl * uRetro) + base.rgb * uGlow;
          gl_FragColor = vec4(finish(lit, fogF), base.a);
        }`,
    });
  }

  const dummy = new THREE.Object3D();
  const P = new THREE.Vector3(), R = new THREE.Vector3();
  function instanced(geo, mat, places) {
    const mesh = new THREE.InstancedMesh(geo, mat, places.length);
    places.forEach((pl, i) => {
      const t = roadPoint(pl.d, pl.lat, P);
      dummy.position.set(P.x, pl.y || 0, P.z);
      dummy.rotation.set(0, Math.atan2(-t.x, -t.z) + (pl.rot || 0), 0);
      dummy.scale.setScalar(pl.s || 1);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    });
    mesh.frustumCulled = false;
    scene.add(mesh);
    return mesh;
  }

  /* ---------- сигнальные столбики вдоль всей дороги ---------- */
  {
    const places = [];
    for (let d = 12; d < LENGTH - 10; d += 24) for (const s of [-1, 1]) places.push({ d, lat: s * 4.45, y: 0.45 });
    instanced(new THREE.BoxGeometry(0.1, 0.9, 0.05), propMat({ color: 0xd9d6cc, retro: 1.5 }), places);
    instanced(new THREE.BoxGeometry(0.105, 0.14, 0.055), propMat({ color: 0xff7a1a, retro: 3.5 }), places.map((p) => ({ ...p, y: 0.72 })));
  }

  /* ---------- свечение (спрайт) ---------- */
  const glowTex = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const x = c.getContext('2d'); const g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.12, 'rgba(255,255,255,.75)');
    g.addColorStop(0.35, 'rgba(255,255,255,.16)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g; x.fillRect(0, 0, 128, 128);
    return new THREE.CanvasTexture(c);
  })();
  function halo(color, size) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, transparent: true }));
    s.scale.setScalar(size);
    scene.add(s);
    return s;
  }

  /* ---------- дорожные знаки (зона «Теория») ---------- */
  {
    const draw = [
      (x) => { // предупреждающий
        x.beginPath(); x.moveTo(128, 18); x.lineTo(244, 226); x.lineTo(12, 226); x.closePath();
        x.fillStyle = '#e02a1f'; x.fill();
        x.beginPath(); x.moveTo(128, 62); x.lineTo(206, 204); x.lineTo(50, 204); x.closePath();
        x.fillStyle = '#f4f1e8'; x.fill();
        x.fillStyle = '#111'; x.fillRect(120, 104, 16, 58); x.fillRect(120, 172, 16, 16);
      },
      (x) => { // ограничение 40
        x.beginPath(); x.arc(128, 128, 116, 0, 7); x.fillStyle = '#e02a1f'; x.fill();
        x.beginPath(); x.arc(128, 128, 88, 0, 7); x.fillStyle = '#f4f1e8'; x.fill();
        x.fillStyle = '#111'; x.font = '800 104px "Sofia Sans Extra Condensed", Arial Narrow, sans-serif';
        x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('40', 128, 136);
      },
      (x) => { // движение прямо
        x.beginPath(); x.arc(128, 128, 116, 0, 7); x.fillStyle = '#1657c9'; x.fill();
        x.fillStyle = '#f4f1e8'; x.fillRect(114, 110, 28, 96);
        x.beginPath(); x.moveTo(128, 40); x.lineTo(184, 118); x.lineTo(72, 118); x.closePath(); x.fill();
      },
      (x) => { // главная дорога
        x.translate(128, 128); x.rotate(Math.PI / 4);
        x.fillStyle = '#f4f1e8'; x.fillRect(-84, -84, 168, 168);
        x.fillStyle = '#ffb400'; x.fillRect(-58, -58, 116, 116);
      },
      (x) => { // уступите дорогу
        x.beginPath(); x.moveTo(12, 30); x.lineTo(244, 30); x.lineTo(128, 238); x.closePath();
        x.fillStyle = '#e02a1f'; x.fill();
        x.beginPath(); x.moveTo(62, 58); x.lineTo(194, 58); x.lineTo(128, 180); x.closePath();
        x.fillStyle = '#f4f1e8'; x.fill();
      },
    ];
    const plate = new THREE.PlaneGeometry(1.35, 1.35);
    const pole = new THREE.CylinderGeometry(0.035, 0.035, 2.9, 8);
    const poleMat = propMat({ color: 0x8a8d92 });
    const build = () => ROUTE.signs.forEach((d, i) => {
      const c = document.createElement('canvas'); c.width = c.height = 256;
      draw[i % draw.length](c.getContext('2d'));
      const tex = new THREE.CanvasTexture(c); tex.anisotropy = 4;
      const t = roadPoint(d, 4.75, P);
      const sign = new THREE.Mesh(plate, propMat({ map: tex, retro: 2.6 }));
      sign.position.set(P.x, 2.55, P.z);
      sign.rotation.y = Math.atan2(-t.x, -t.z) + 0.12; // слегка довёрнут к полосе
      const pm = new THREE.Mesh(pole, poleMat);
      pm.position.set(P.x + t.x * 0.04, 1.45, P.z + t.z * 0.04);
      scene.add(sign, pm);
    });
    // цифры на знаке рисуем после загрузки шрифта
    (document.fonts ? document.fonts.load('800 104px "Sofia Sans Extra Condensed"') : Promise.resolve()).then(build, build);
  }

  /* ---------- надписи краской на асфальте ---------- */
  {
    const paint = (text, d, lat, w, len) => {
      const c = document.createElement('canvas'); c.width = 256; c.height = 1024;
      const x = c.getContext('2d');
      x.fillStyle = '#e9e6dc'; x.textAlign = 'center'; x.textBaseline = 'middle';
      x.font = '900 200px "Sofia Sans Extra Condensed", Arial Narrow, sans-serif';
      x.translate(128, 512); x.scale(1, 4.6); // вытянуто под взгляд водителя
      x.fillText(text, 0, 8, 240);
      const tex = new THREE.CanvasTexture(c); tex.anisotropy = 8;
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, len), propMat({ map: tex, decal: true, retro: 1.7 }));
      const t = roadPoint(d, lat, P);
      const grp = new THREE.Group();
      m.rotation.x = -Math.PI / 2;
      grp.add(m);
      grp.position.set(P.x, 0.012, P.z);
      grp.rotation.y = Math.atan2(-t.x, -t.z);
      scene.add(grp);
    };
    const build = () => {
      paint('01', 282, 1.75, 2.2, 9);
      paint('02', 486, 1.75, 2.2, 9);
      paint('03', 700, 1.75, 2.2, 9);
      paint('СТОП', ROUTE.stop - 9, 1.75, 2.5, 8);
      paint('04', 905, 1.75, 2.2, 9);
    };
    (document.fonts ? document.fonts.load('900 200px "Sofia Sans Extra Condensed"') : Promise.resolve()).then(build, build);
  }

  /* ---------- конусы (зона «Площадка») ---------- */
  {
    const { from, step, count } = ROUTE.cones;
    const slalom = [], gate = [];
    for (let i = 0; i < count; i++) slalom.push({ d: from + i * step, lat: 0, y: 0.25 });
    for (let d = from - 14; d <= from + step * count + 4; d += 9) for (const s of [-1, 1]) gate.push({ d, lat: s * 3.15, y: 0.25, s: 0.8 });
    const all = [...slalom, ...gate];
    instanced(new THREE.ConeGeometry(0.17, 0.5, 14, 1, true), propMat({ color: 0xff5a14, stripe: true, retro: 1.6 }), all);
    instanced(new THREE.BoxGeometry(0.4, 0.035, 0.4), propMat({ color: 0xd2480f, retro: 1.2 }), all.map((p) => ({ ...p, y: 0.018 })));
  }

  /* ---------- фонари (зона «Город») ---------- */
  const lampHalos = [];
  {
    const poles = [], arms = [], heads = [];
    for (let k = Math.ceil(ROUTE.city[0] / 36); (k + 0.5) * 36 < ROUTE.city[1]; k++) {
      const d = (k + 0.5) * 36, side = (((k % 2) + 2) % 2) * 2 - 1;
      poles.push({ d, lat: side * 5.5, y: 3.8 });
      arms.push({ d, lat: side * 4.75, y: 7.55 });
      heads.push({ d, lat: side * 4.1, y: 7.5 });
      roadPoint(d, side * 4.1, P);
      const h = halo(0xffa040, 5.5); h.position.set(P.x, 7.4, P.z); lampHalos.push(h);
    }
    const steel = propMat({ color: 0x3c4046 });
    instanced(new THREE.CylinderGeometry(0.06, 0.09, 7.6, 8), steel, poles);
    instanced(new THREE.BoxGeometry(1.6, 0.07, 0.09), steel, arms);
    const headMesh = instanced(new THREE.BoxGeometry(0.55, 0.09, 0.2), propMat({ color: 0xffb060, glow: 2.2 }), heads);
    lampHalos.headMat = headMesh.material;
  }

  /* ---------- светофор ---------- */
  const signal = (() => {
    const t = roadPoint(ROUTE.stop + 1, 4.7, P, R).clone();
    const yaw = Math.atan2(-t.x, -t.z);
    const grp = new THREE.Group();
    grp.position.set(P.x, 0, P.z); grp.rotation.y = yaw + 0.1;
    const body = propMat({ color: 0x17191c });
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.07, 3.0, 8), propMat({ color: 0x3c4046 }));
    pole.position.y = 1.5;
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.4, 1.12, 0.26), body);
    box.position.y = 3.35;
    grp.add(pole, box);
    const lens = new THREE.CircleGeometry(0.125, 24);
    const defs = [['red', 0xff2a1c, 3.7], ['yellow', 0xffb000, 3.35], ['green', 0x22ff96, 3.0]];
    const lights = {};
    for (const [name, color, y] of defs) {
      const mat = new THREE.MeshBasicMaterial({ color, fog: false });
      const mesh = new THREE.Mesh(lens, mat);
      mesh.position.set(0, y, 0.135); // +Z группы смотрит на водителя
      grp.add(mesh);
      const h = halo(color, 2.6);
      lights[name] = { mat, halo: h, base: new THREE.Color(color), k: 0, y };
    }
    scene.add(grp);
    grp.updateMatrixWorld(true);
    for (const name in lights) {
      const l = lights[name];
      l.halo.position.set(0, l.y, 0.2).applyMatrix4(grp.matrixWorld);
    }
    return lights;
  })();
  const SIGNAL_ON = { red: ['red'], ready: ['red', 'yellow'], green: ['green'] };
  const SIGNAL_ROAD = { red: new THREE.Color(1, 0.13, 0.08), ready: new THREE.Color(1, 0.42, 0.08), green: new THREE.Color(0.1, 1, 0.5) };

  /* ---------- пыль в свете фар ---------- */
  const dust = (() => {
    const n = isSmall ? 220 : 520, seeds = new Float32Array(n * 3);
    for (let i = 0; i < seeds.length; i++) seeds[i] = Math.random();
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(seeds, 3));
    const pts = new THREE.Points(g, new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { uCam: U.uCam, uFwd: U.uFwd, uHead: U.uHead, uTime: U.uTime, uPx: { value: renderer.getPixelRatio() } },
      vertexShader: /* glsl */`
        uniform vec3 uCam; uniform vec2 uFwd; uniform float uHead, uTime, uPx; varying float vA;
        void main(){
          vec3 box = vec3(44., 4.2, 70.);
          vec3 p = position * box;
          p.x += sin(uTime * .25 + position.y * 30.) * .5; p.z += uTime * .35;
          p.xz = mod(p.xz - uCam.xz, box.xz) - box.xz * .5 + uCam.xz;
          p.y = fract(position.y + uTime * .008) * box.y + .1;
          vec2 to = p.xz - uCam.xz; float d = length(to);
          float cone = smoothstep(.8, .99, dot(to / max(d, 1e-3), uFwd));
          vA = uHead * cone * smoothstep(42., 6., d) * smoothstep(1.5, 4., d) * (1. - p.y / 4.6);
          vec4 mv = viewMatrix * vec4(p, 1.);
          gl_PointSize = clamp(34. * uPx / -mv.z, 1., 5. * uPx);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */`
        varying float vA;
        void main(){ float r = length(gl_PointCoord - .5); gl_FragColor = vec4(1., .93, .8, smoothstep(.5, .1, r) * vA * .42); }`,
    }));
    pts.frustumCulled = false;
    scene.add(pts);
    return pts;
  })();

  /* ---------- курсор: водитель осматривается ---------- */
  const mouse = { x: 0, y: 0, sx: 0, sy: 0 };
  if (matchMedia('(pointer: fine)').matches) {
    addEventListener('pointermove', (e) => { mouse.x = (e.clientX / innerWidth) * 2 - 1; mouse.y = (e.clientY / innerHeight) * 2 - 1; }, { passive: true });
  }

  /* ---------- размер ---------- */
  function resize() {
    renderer.setPixelRatio(Math.min(devicePixelRatio, maxDpr));
    renderer.setSize(innerWidth, innerHeight, false);
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
  }
  addEventListener('resize', resize);

  /* ---------- кадр ---------- */
  const camPos = new THREE.Vector3(), look = new THREE.Vector3();
  const fogNight = new THREE.Color(0.030, 0.043, 0.072), fogDawn = new THREE.Color(0.80, 0.47, 0.33);
  const tmpCol = new THREE.Color();
  const clock = new THREE.Clock();
  let introT = reduceMotion ? 1 : 0, started = false, speed = 0, lastKm = '', lastSpeed = '';
  state.dist = state.target;

  function laneAt(d) {
    const { from, step, count } = ROUTE.cones;
    const w = sstep(from - 28, from - 6, d) * (1 - sstep(from + step * (count - 1) + 6, from + step * (count - 1) + 30, d));
    let lat = lerp(1.75, 1.45 * Math.sin((Math.PI * (d - (from - step / 2))) / step), w);
    return lerp(lat, 0, sstep(1070, 1210, d));
  }

  function frame() {
    requestAnimationFrame(frame);
    if (document.hidden) { clock.getDelta(); return; }
    const dt = Math.min(clock.getDelta(), 0.1);
    const time = clock.elapsedTime;
    U.uTime.value = reduceMotion ? 0 : time;

    // зажигание: фары вспыхивают, моргают и выходят на рабочий свет
    if (started && introT < 1) introT = Math.min(1, introT + dt / 2.4);
    const flick = introT < 0.12 ? 0 : introT < 0.18 ? 0.7 : introT < 0.26 ? 0.08 : sstep(0.26, 1, introT);

    // сглаживание скролла → плавный ход
    const prev = state.dist;
    state.dist = reduceMotion ? state.target : lerp(state.dist, state.target, 1 - Math.exp(-dt * 3.6));
    if (Math.abs(state.target - state.dist) < 0.002) state.dist = state.target;
    const v = dt > 0 ? Math.abs(state.dist - prev) / dt : 0;
    speed = lerp(speed, v, 1 - Math.exp(-dt * 5));
    const d = state.dist;

    const dawn = sstep(ROUTE.dawn[0], ROUTE.dawn[1], d);
    const fin = sstep(1070, 1235, d);
    U.uDawn.value = dawn;
    U.uHead.value = flick * (1 - 0.8 * dawn);
    U.uFog.value.copy(fogNight).lerp(fogDawn, dawn);
    U.uFogD.value = lerp(0.0125, 0.0042, dawn);

    // камера — глаза водителя
    const lat = laneAt(d);
    const height = 1.18 + fin * 1.9 + (reduceMotion ? 0 : Math.sin(time * 9) * 0.0025 + Math.sin(time * 1.3) * 0.006);
    roadPoint(d, lat, camPos);
    camPos.y = height;
    const ahead = 20 + fin * 30;
    roadPoint(d + ahead, laneAt(d + ahead) * 0.7, look);
    look.y = 0.85 + fin * 4.2;
    camera.position.copy(camPos);
    camera.lookAt(look);
    mouse.sx = lerp(mouse.sx, mouse.x, 1 - Math.exp(-dt * 3));
    mouse.sy = lerp(mouse.sy, mouse.y, 1 - Math.exp(-dt * 3));
    if (!reduceMotion) { camera.rotateY(-mouse.sx * 0.075); camera.rotateX(-mouse.sy * 0.04); }
    const fov = 58 + Math.min(speed, 70) * 0.11 - fin * 6 + (camera.aspect < 0.8 ? 12 : 0);
    if (Math.abs(fov - camera.fov) > 0.01) { camera.fov = fov; camera.updateProjectionMatrix(); }

    U.uCam.value.copy(camPos);
    const fx = look.x - camPos.x, fz = look.z - camPos.z, fl = Math.hypot(fx, fz) || 1;
    U.uFwd.value.set(fx / fl, fz / fl);
    sky.position.copy(camPos);

    // фонари гаснут к рассвету
    const lampK = 1 - sstep(0.25, 0.8, dawn);
    for (const h of lampHalos) h.material.opacity = lampK;
    lampHalos.headMat.uniforms.uGlow.value = 2.2 * lampK;

    // светофор
    const on = SIGNAL_ON[state.light];
    for (const name in signal) {
      const l = signal[name], target = on.includes(name) ? 1 : 0;
      l.k = lerp(l.k, target, 1 - Math.exp(-dt * 14));
      l.mat.color.copy(l.base).multiplyScalar(0.07 + 0.93 * l.k);
      l.halo.material.opacity = l.k;
    }
    tmpCol.copy(SIGNAL_ROAD[state.light]).multiplyScalar(1 - 0.6 * dawn);
    U.uSignal.value.lerp(tmpCol, 1 - Math.exp(-dt * 10));

    // HUD
    const km = (d / 1000).toFixed(2);
    if (km !== lastKm) { hudKm.textContent = km; lastKm = km; }
    const kmh = String(Math.round(Math.min(90, speed * 3.6 * 0.42)));
    if (kmh !== lastSpeed) { hudSpeed.textContent = kmh; lastSpeed = kmh; }

    renderer.render(scene, camera);
    if (!started) { started = true; startIntro(); }
  }
  frame();
}
