/* Пять замков — игра на двоих в стиле «Мятной долины».
 * Весь код игры в одном файле, по разделам: 00 математика · 01 геометрия · 02 рендер · 03 палитра · 04 поле · 05 природа ·
 * 06 лагеря · 07 замки и башни · 08 воины · 09 эффекты · 10 правила и бот · 11 бой на поле · 12b онлайн · 12 интерфейс · 13 запуск.
 * Нужны three.js r128 (с постобработкой) и, для онлайна, MQTT.js — они подключены в index.html из папки lib/.
 */
(function(){ 'use strict';
var DEV = /[?&]dev\b/.test(location.search);
var TAU = Math.PI * 2, V3 = THREE.Vector3, UP = new V3(0, 1, 0);

function makeRng(seed){ var s = Math.floor(seed) % 2147483647; if (s <= 0) s += 2147483646; return function(){ s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; }; }
var rnd = makeRng(1);
function reseed(s){ rnd = makeRng(s); }
function rr(a, b){ return a + (b - a) * rnd(); }
function ri(a, b){ return Math.floor(a + (b - a + 1) * rnd()); }
function pick(a){ return a[Math.floor(rnd() * a.length) % a.length]; }
function chance(p){ return rnd() < p; }
function clamp(v, a, b){ return v < a ? a : v > b ? b : v; }
function lerp(a, b, t){ return a + (b - a) * t; }
function smooth(a, b, x){ var t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); }
function hyp(x, z){ return Math.sqrt(x * x + z * z); }
function angDiff(a, b){ var d = (b - a) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; return d; }
function easeOutBack(t){ var c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); }
function easeInOut(t){ return t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; }
function easeOut(t){ return 1 - (1 - t) * (1 - t); }
function easeIn(t){ return t * t; }
// 0..1 sawtooth phase helpers for looping animations
function cyc(t, period, off){ var p = ((t + (off || 0)) / period) % 1; return p < 0 ? p + 1 : p; }
function seg(p, a, b){ return clamp((p - a) / (b - a), 0, 1); }
function hash2(x, z, s){ var h = (Math.imul(x | 0, 374761393) + Math.imul(z | 0, 668265263) + Math.imul(s | 0, 1442695041)) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16; return (h >>> 0) / 4294967296; }
function hash3(x, y, z){ return hash2(x * 7 + y * 131, z * 3 - y * 17, y * 911 + 7); }
function vnoise(x, z, s){
  var xi = Math.floor(x), zi = Math.floor(z), xf = x - xi, zf = z - zi, u = xf * xf * (3 - 2 * xf), v = zf * zf * (3 - 2 * zf);
  var a = hash2(xi, zi, s), b = hash2(xi + 1, zi, s), c = hash2(xi, zi + 1, s), d = hash2(xi + 1, zi + 1, s);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function fbm(x, z, s){ return vnoise(x, z, s) * 0.6 + vnoise(x * 2.1, z * 2.1, s + 5) * 0.28 + vnoise(x * 4.3, z * 4.3, s + 9) * 0.12; }
function fbm5(x, z, s){ var a = 0, amp = 0.5, f = 1, n = 0; for (var i = 0; i < 5; i++){ a += vnoise(x * f, z * f, s + i * 7) * amp; n += amp; amp *= 0.5; f *= 2.03; } return a / n; }
function noise3(x, y, z, s){ return (vnoise(x + y * 0.71, z - y * 0.53, s) + vnoise(y + z * 0.37, x - z * 0.29, s + 3)) * 0.5; }
function segDist(px, pz, ax, az, bx, bz){
  var dx = bx - ax, dz = bz - az, L = dx * dx + dz * dz, t = L > 0 ? clamp(((px - ax) * dx + (pz - az) * dz) / L, 0, 1) : 0;
  return hyp(px - (ax + dx * t), pz - (az + dz * t));
}
function polyDistT(px, pz, pts){
  var m = 1e9, at = 0, acc = 0, total = 0, i, SL = pts._sl;
  if (!SL){ SL = pts._sl = []; for (i = 0; i < pts.length - 1; i++){ var sl = hyp(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]); SL.push(sl); total += sl; } pts._tl = total; }
  total = pts._tl;
  for (i = 0; i < pts.length - 1; i++){
    var ax = pts[i][0], az = pts[i][1], L = SL[i];
    // cheap reject: this segment cannot beat the best distance so far
    if (Math.abs(px - ax) - L > m || Math.abs(pz - az) - L > m){ acc += L; continue; }
    var dx = pts[i + 1][0] - ax, dz = pts[i + 1][1] - az, L2 = L * L;
    var t = L2 > 0 ? clamp(((px - ax) * dx + (pz - az) * dz) / L2, 0, 1) : 0, d = hyp(px - (ax + dx * t), pz - (az + dz * t));
    if (d < m){ m = d; at = (acc + t * L) / total; }
    acc += L;
  }
  return [m, at];
}
function polyDist(px, pz, pts){ return polyDistT(px, pz, pts)[0]; }
function chaikin(pts, it){
  for (var k = 0; k < it; k++){
    var o = [pts[0]];
    for (var i = 0; i < pts.length - 1; i++){ var a = pts[i], b = pts[i + 1]; o.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25], [a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75]); }
    o.push(pts[pts.length - 1]); pts = o;
  }
  return pts;
}
// point along a polyline at parameter t (0..1), with the tangent
function polyAt(pts, t){
  var total = 0, i, L = [];
  for (i = 0; i < pts.length - 1; i++){ var l = hyp(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]); L.push(l); total += l; }
  var d = clamp(t, 0, 1) * total;
  for (i = 0; i < L.length; i++){
    if (d <= L[i] || i === L.length - 1){ var u = L[i] > 0 ? d / L[i] : 0, a = pts[i], b = pts[i + 1]; return { x: a[0] + (b[0] - a[0]) * u, z: a[1] + (b[1] - a[1]) * u, dx: (b[0] - a[0]) / (L[i] || 1), dz: (b[1] - a[1]) / (L[i] || 1) }; }
    d -= L[i];
  }
}
function esc(s){ return String(s).replace(/[&<>"']/g, function(c){ return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
/* ===================== 01 · geometry: palette, primitives, kit, merge, voxels ===================== */
var PAL = {};                                    // current style palette (sRGB hex, arrays = random pick, strings = alias)
var SHAPE = { round: 1, segK: 1, facet: true, flatAll: false };
var _c = new THREE.Color(), _c2 = new THREE.Color();
function palHex(c){
  if (typeof c !== 'string') return '#FF00FF';
  if (c[0] === '#') return c;
  var v = PAL[c];
  if (v === undefined){ if (DEV) console.warn('palette key missing: ' + c); return '#FF00FF'; }
  if (Array.isArray(v)) v = v[Math.floor(rnd() * v.length) % v.length];
  return palHex(v);
}
function linC(c){ return new THREE.Color(palHex(c)).convertSRGBToLinear(); }
function mixHex(a, b, t){ _c.set(palHex(a)); _c2.set(palHex(b)); _c.lerp(_c2, t); return '#' + _c.getHexString(); }
function shadeHex(a, k){ _c.set(palHex(a)); var hsl = {}; _c.getHSL(hsl); _c.setHSL(hsl.h, hsl.s, clamp(hsl.l + k, 0, 1)); return '#' + _c.getHexString(); }
function satHex(a, k){ _c.set(palHex(a)); var hsl = {}; _c.getHSL(hsl); _c.setHSL(hsl.h, clamp(hsl.s * k, 0, 1), hsl.l); return '#' + _c.getHexString(); }

/* ---------- primitives (no uv) ---------- */
function noUV(g){ if (g.attributes.uv) g.deleteAttribute('uv'); if (g.attributes.uv2) g.deleteAttribute('uv2'); return g; }
function gRoundBox(w, h, d, r, seg){
  if (!(r > 0.004)) return noUV(new THREE.BoxGeometry(w, h, d));
  var s = seg * 2 + 1;
  r = Math.max(0.002, Math.min(r, w / 2 - 0.001, h / 2 - 0.001, d / 2 - 0.001));
  var g = new THREE.BoxGeometry(1, 1, 1, s, s, s), pos = g.attributes.position, nor = g.attributes.normal;
  var bx = w / 2 - r, by = h / 2 - r, bz = d / 2 - r, half = 0.5 / s, v = new V3(), n = new V3();
  for (var i = 0; i < pos.count; i++){
    v.fromBufferAttribute(pos, i);
    n.set(v.x - Math.sign(v.x) * half, v.y - Math.sign(v.y) * half, v.z - Math.sign(v.z) * half).normalize();
    pos.setXYZ(i, bx * Math.sign(v.x) + n.x * r, by * Math.sign(v.y) + n.y * r, bz * Math.sign(v.z) + n.z * r);
    nor.setXYZ(i, n.x, n.y, n.z);
  }
  return noUV(g);
}
function gRoundCyl(rt, rb, h, b, n){
  b = Math.max(0.002, Math.min(b, Math.max(rt, 0.004) * 0.95, Math.max(rb, 0.004) * 0.95, h / 2 * 0.95));
  var pts = [new THREE.Vector2(0, -h / 2)], k = 3, i, a;
  for (i = 0; i <= k; i++){ a = -Math.PI / 2 + (i / k) * (Math.PI / 2); pts.push(new THREE.Vector2(Math.max(0.001, rb - b + Math.cos(a) * b), -h / 2 + b + Math.sin(a) * b)); }
  for (i = 0; i <= k; i++){ a = (i / k) * (Math.PI / 2); pts.push(new THREE.Vector2(Math.max(0.001, rt - b + Math.cos(a) * b), h / 2 - b + Math.sin(a) * b)); }
  pts.push(new THREE.Vector2(0, h / 2));
  return noUV(new THREE.LatheGeometry(pts, n));
}
// profile: [[r, y], ...] bottom to top
function gLathe(profile, n){ return noUV(new THREE.LatheGeometry(profile.map(function(p){ return new THREE.Vector2(Math.max(0.0005, p[0]), p[1]); }), n)); }
function gBlob(r, detail, amt, freq, seed, flatBottom){
  var g = new THREE.IcosahedronGeometry(r, detail), p = g.attributes.position, v = new V3(), map = {};
  for (var i = 0; i < p.count; i++){
    v.fromBufferAttribute(p, i);
    var key = v.x.toFixed(3) + ',' + v.y.toFixed(3) + ',' + v.z.toFixed(3), m = map[key];
    if (m === undefined){
      var n = (vnoise(v.x * freq + seed, v.z * freq - seed, seed) - 0.5) * 0.7 + (vnoise(v.y * freq * 1.7 + seed * 2, v.x * freq * 1.3, seed + 3) - 0.5) * 0.5 + (vnoise(v.z * freq * 3.1, v.y * freq * 3.1, seed + 9) - 0.5) * 0.25;
      m = map[key] = 1 + n * amt;
    }
    v.multiplyScalar(m);
    if (flatBottom && v.y < -r * flatBottom) v.y = -r * flatBottom + (v.y + r * flatBottom) * 0.15;
    p.setXYZ(i, v.x, v.y, v.z);
  }
  noUV(g);
  if (g.index) g = g.toNonIndexed();
  g.computeVertexNormals();
  return g;
}
// tapered tube along a smooth curve through points (array of V3); r0 at start, r1 at end
function gTube(points, r0, r1, tseg, rseg, capEnd){
  var curve = new THREE.CatmullRomCurve3(points), P = [], N = [], I = [], frames = curve.computeFrenetFrames(tseg, false), i, j;
  for (i = 0; i <= tseg; i++){
    var t = i / tseg, c = curve.getPointAt(t), rad = lerp(r0, r1, t), nn = frames.normals[i], bb = frames.binormals[i];
    for (j = 0; j <= rseg; j++){
      var a = j / rseg * TAU, cx = Math.cos(a), sy = Math.sin(a);
      var nx = cx * nn.x + sy * bb.x, ny = cx * nn.y + sy * bb.y, nz = cx * nn.z + sy * bb.z;
      P.push(c.x + nx * rad, c.y + ny * rad, c.z + nz * rad); N.push(nx, ny, nz);
    }
  }
  for (i = 0; i < tseg; i++) for (j = 0; j < rseg; j++){
    var a0 = i * (rseg + 1) + j, b0 = a0 + rseg + 1;
    I.push(a0, b0, a0 + 1, b0, b0 + 1, a0 + 1);
  }
  if (capEnd){
    var ce = curve.getPointAt(1), tg = curve.getTangentAt(1), ci = P.length / 3;
    P.push(ce.x + tg.x * r1 * 0.5, ce.y + tg.y * r1 * 0.5, ce.z + tg.z * r1 * 0.5); N.push(tg.x, tg.y, tg.z);
    var base = tseg * (rseg + 1);
    for (j = 0; j < rseg; j++) I.push(base + j, ci, base + j + 1);
  }
  var g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
  g.setIndex(I);
  return g;
}
function gExtrude(shape, depth, bevel){
  var g = new THREE.ExtrudeGeometry(shape, { depth: depth, bevelEnabled: !!bevel, bevelThickness: bevel || 0, bevelSize: bevel || 0, bevelSegments: 1, curveSegments: 10 });
  g.translate(0, 0, -depth / 2);
  return noUV(g);
}
function gBanner(w, h, d, tail){
  var s = new THREE.Shape(); s.moveTo(-w / 2, 0); s.lineTo(w / 2, 0); s.lineTo(w / 2, -h);
  if (tail === 'swallow'){ s.lineTo(0, -h * 0.78); s.lineTo(-w / 2, -h); }
  else if (tail === 'point'){ s.lineTo(0, -h * 1.15); s.lineTo(-w / 2, -h); }
  else s.lineTo(-w / 2, -h);
  s.lineTo(-w / 2, 0);
  return gExtrude(s, d);
}
// subdivided plane strip for cloth that bends in the wind (wind weight from the pole)
function gCloth(w, h, sx, sy){ var g = new THREE.PlaneGeometry(w, h, sx, sy); g.translate(w / 2, -h / 2, 0); return noUV(g); }
// a flag hanging from a pole at x = 0 (horizontal) or from a crossbar at y = 0 (vertical banner); wind grows away from the attachment
function clothGeo(w, h, tail, vertical){
  var g = gCloth(w, h, vertical ? 4 : 6, vertical ? 8 : 5), p = g.attributes.position, W = new Float32Array(p.count);
  for (var i = 0; i < p.count; i++){
    var x = p.getX(i), y = p.getY(i), u = x / w, v = -y / h;
    if (tail === 'notch' && v > 0.99){ p.setY(i, y + h * 0.22 * Math.max(0, 1 - Math.abs(u - 0.5) * 3)); }
    if (tail === 'swallow' && u > 0.99 && !vertical){ p.setX(i, x - w * 0.25 * Math.max(0, 1 - Math.abs(v - 0.5) * 2.5)); }
    if (tail === 'point' && v > 0.99){ p.setY(i, y - h * 0.18 * Math.max(0, 1 - Math.abs(u - 0.5) * 2)); }
    W[i] = vertical ? v * v * 0.9 + 0.05 : u * 0.9 + v * 0.15;
  }
  g.setAttribute('wind', new THREE.BufferAttribute(W, 1));
  return g;
}

/* ---------- normals ---------- */
function flatGeo(g){ if (g.index) g = g.toNonIndexed(); g.computeVertexNormals(); return g; }
function smoothGeo(g){
  if (g.index) g = g.toNonIndexed();
  var p = g.attributes.position, n = p.count, acc = {}, i, k, a = new V3(), b = new V3(), c = new V3(), fn = new V3(), keys = new Array(n);
  for (i = 0; i < n; i++) keys[i] = Math.round(p.getX(i) * 2000) + ',' + Math.round(p.getY(i) * 2000) + ',' + Math.round(p.getZ(i) * 2000);
  for (i = 0; i < n; i += 3){
    a.fromBufferAttribute(p, i); b.fromBufferAttribute(p, i + 1); c.fromBufferAttribute(p, i + 2);
    fn.subVectors(c, b).cross(a.clone().sub(b));
    for (k = 0; k < 3; k++){ var q = acc[keys[i + k]] || (acc[keys[i + k]] = [0, 0, 0]); q[0] += fn.x; q[1] += fn.y; q[2] += fn.z; }
  }
  var N = new Float32Array(n * 3);
  for (i = 0; i < n; i++){ var s = acc[keys[i]], L = Math.sqrt(s[0] * s[0] + s[1] * s[1] + s[2] * s[2]) || 1; N[i * 3] = s[0] / L; N[i * 3 + 1] = s[1] / L; N[i * 3 + 2] = s[2] / L; }
  g.setAttribute('normal', new THREE.BufferAttribute(N, 3));
  return g;
}
function jitterGeo(g, amt){
  if (!amt) return g;
  var p = g.attributes.position, map = {};
  for (var i = 0; i < p.count; i++){
    var key = p.getX(i).toFixed(3) + ',' + p.getY(i).toFixed(3) + ',' + p.getZ(i).toFixed(3);
    var o = map[key] || (map[key] = [(rnd() * 2 - 1) * amt, (rnd() * 2 - 1) * amt, (rnd() * 2 - 1) * amt]);
    p.setXYZ(i, p.getX(i) + o[0], p.getY(i) + o[1], p.getZ(i) + o[2]);
  }
  return g;
}

/* ---------- kit: many small parts merged into a few meshes ---------- */
var _m4 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s3 = new V3(), _p3 = new V3();
// in this light the plain surfaces read the same, so they share one material (fewer draw calls)
var MAT_ALIAS = { stone: 'matte', wood: 'matte', skin: 'matte', roof: 'matte' };
function mtx(o){
  var s = o.s || 1;
  _e.set(o.rx || 0, o.ry || 0, o.rz || 0, o.ord || 'XYZ'); _q.setFromEuler(_e);
  _p3.set(o.x || 0, o.y || 0, o.z || 0); _s3.set((o.sx || 1) * s, (o.sy || 1) * s, (o.sz || 1) * s);
  return new THREE.Matrix4().compose(_p3, _q, _s3);
}
function Kit(){ this.parts = {}; this.stack = [new THREE.Matrix4()]; }
Kit.prototype.top = function(){ return this.stack[this.stack.length - 1]; };
Kit.prototype.push = function(o){ this.stack.push(this.top().clone().multiply(mtx(o || {}))); return this; };
Kit.prototype.pop = function(){ if (this.stack.length > 1) this.stack.pop(); return this; };
/* o: x y z rx ry rz s sx sy sz | mat | j (lightness jitter) h (hue jitter) fj (per-face jitter)
      c2 (top colour, vertical gradient) ao (darken bottom) e (glow multiplier) | flat smooth org (organic: follows the style)
      wind (sway weight, number) windY (weight grows with height inside the part) | bone | ns (casts no shadow) | cfn(r,g,b,x,y,z,nx,ny,nz) */
Kit.prototype.put = function(geo, color, o){
  o = o || {};
  var wantFlat = o.flat || (o.org && SHAPE.facet && !o.smooth) || (SHAPE.flatAll && !o.smooth && !o.keepN);
  var wantSmooth = !wantFlat && (o.smooth || (o.org && !SHAPE.facet));
  if (wantFlat) geo = flatGeo(geo);
  else if (wantSmooth && o.org) geo = smoothGeo(geo);
  var M = this.top().clone().multiply(mtx(o));
  geo.applyMatrix4(M);
  var c = linC(color), j = o.j === undefined ? 0.022 : o.j;
  if (j || o.h){ var hsl = {}; c.getHSL(hsl); c.setHSL(hsl.h + (o.h ? (rnd() * 2 - 1) * o.h : 0), hsl.s, clamp(hsl.l + (rnd() * 2 - 1) * j * Math.max(0.35, hsl.l * 1.6), 0, 1)); }
  var c2 = o.c2 ? linC(o.c2) : null, e = o.e || 1, ao = o.ao || 0, fj = o.fj || 0, wind = o.wind || 0, windY = o.windY || 0;
  var pos = geo.attributes.position, nor = geo.attributes.normal, n = pos.count, arr = new Float32Array(n * 3), y0 = 1e9, y1 = -1e9, i;
  if (c2 || ao || windY){ for (i = 0; i < n; i++){ var yy = pos.getY(i); if (yy < y0) y0 = yy; if (yy > y1) y1 = yy; } }
  var faceK = 1;
  for (i = 0; i < n; i++){
    var r = c.r, g = c.g, b = c.b, t = 1;
    if (c2 || ao || windY) t = y1 > y0 ? (pos.getY(i) - y0) / (y1 - y0) : 1;
    if (c2){ r = c.r + (c2.r - c.r) * t; g = c.g + (c2.g - c.g) * t; b = c.b + (c2.b - c.b) * t; }
    if (ao){ var f = 1 - ao * (1 - t) * (1 - t); r *= f; g *= f; b *= f; }
    if (fj && !geo.index){ if (i % 3 === 0) faceK = 1 + (rnd() * 2 - 1) * fj; r *= faceK; g *= faceK; b *= faceK; }
    if (o.cfn){ var res = o.cfn(r, g, b, pos.getX(i), pos.getY(i), pos.getZ(i), nor ? nor.getX(i) : 0, nor ? nor.getY(i) : 1, nor ? nor.getZ(i) : 0, t); r = res[0]; g = res[1]; b = res[2]; }
    arr[i * 3] = r * e; arr[i * 3 + 1] = g * e; arr[i * 3 + 2] = b * e;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  if (wind || windY){ var wa = new Float32Array(n); for (i = 0; i < n; i++) wa[i] = wind + (windY ? windY * (y1 > y0 ? (pos.getY(i) - y0) / (y1 - y0) : 1) : 0); geo.setAttribute('wind', new THREE.BufferAttribute(wa, 1)); }
  if (o.bone !== undefined || this.bone !== undefined){ var bn = new Float32Array(n); bn.fill(o.bone !== undefined ? o.bone : this.bone); geo.setAttribute('bone', new THREE.BufferAttribute(bn, 1)); }
  var key = (MAT_ALIAS[o.mat] || o.mat || 'matte') + (o.ns ? '|ns' : '');
  (this.parts[key] || (this.parts[key] = [])).push(geo);
  return this;
};
Kit.prototype.box = function(w, h, d, color, o){
  o = o || {};
  var r = (o.r !== undefined ? o.r : Math.min(w, h, d) * 0.12) * SHAPE.round;
  return this.put(gRoundBox(w, h, d, r, o.seg !== undefined ? o.seg : 1), color, o);
};
Kit.prototype.cyl = function(rt, rb, h, color, o){
  o = o || {};
  var n = Math.max(3, Math.round((o.n || 12) * (o.nfix ? 1 : SHAPE.segK))), g;
  var b = (o.b !== undefined ? o.b : Math.min(Math.max(rt, rb), h) * 0.16) * SHAPE.round;
  if (o.sharp || b < 0.004 || Math.min(rt, rb) < 0.01) g = noUV(new THREE.CylinderGeometry(rt, rb, h, n, o.hs || 1, !!o.open));
  else g = gRoundCyl(rt, rb, h, b, n);
  return this.put(g, color, o);
};
Kit.prototype.cone = function(r, h, color, o){ o = o || {}; var n = Math.max(3, Math.round((o.n || 10) * (o.nfix ? 1 : SHAPE.segK))); return this.put(noUV(new THREE.CylinderGeometry(o.tip || 0, r, h, n, o.hs || 1, !!o.open)), color, o); };
Kit.prototype.ball = function(r, color, o){ o = o || {}; var k = o.nfix ? 1 : SHAPE.segK; return this.put(noUV(new THREE.SphereGeometry(r, Math.max(4, Math.round((o.n || 12) * k)), Math.max(3, Math.round((o.m || 9) * k)), 0, TAU, o.t0 || 0, o.tl || Math.PI)), color, o); };
Kit.prototype.ico = function(r, color, o){ o = o || {}; var g = jitterGeo(noUV(new THREE.IcosahedronGeometry(r, o.d || 0)), o.jit || 0); if (o.org === undefined) o.flat = !o.smooth; return this.put(g, color, o); };
Kit.prototype.blob = function(r, color, o){ o = o || {}; var g = gBlob(r, o.d === undefined ? 1 : o.d, o.amt === undefined ? 0.35 : o.amt, o.freq || 1.2, o.seed || 1, o.fb); if (o.org === undefined) o.org = true; return this.put(g, color, o); };
Kit.prototype.torus = function(r, t, color, o){ o = o || {}; var g = noUV(new THREE.TorusGeometry(r, t, o.rs || 6, Math.max(6, Math.round((o.ts || 20) * SHAPE.segK)), o.arc || TAU)); return this.put(g, color, o); };
Kit.prototype.lathe = function(profile, color, o){ o = o || {}; return this.put(gLathe(profile, Math.max(4, Math.round((o.n || 12) * (o.nfix ? 1 : SHAPE.segK)))), color, o); };
Kit.prototype.tube = function(points, r0, r1, color, o){ o = o || {}; return this.put(gTube(points, r0, r1, o.ts || 8, Math.max(3, Math.round((o.rs || 6) * SHAPE.segK)), o.cap), color, o); };
Kit.prototype.geo = function(g, color, o){ return this.put(noUV(g), color, o); };
Kit.prototype.isEmpty = function(){ for (var k in this.parts) if (this.parts[k].length) return false; return true; };
Kit.prototype.take = function(){ var p = this.parts; this.parts = {}; return p; };
// merge every bucket into a mesh using the style materials
Kit.prototype.build = function(opt){
  opt = opt || {};
  var grp = new THREE.Group(), parts = this.take();
  for (var key in parts){
    if (!parts[key].length) continue;
    var mk = key.split('|')[0], ns = key.indexOf('|ns') > 0;
    var geo = mergeGeos(parts[key]);
    if (opt.post) opt.post(geo, mk);
    var mesh = new THREE.Mesh(geo, matFor(mk, geo));
    mesh.castShadow = opt.cast !== false && !ns && mk !== 'glow';
    mesh.receiveShadow = opt.receive !== false && mk !== 'glow';
    mesh.userData.matKey = mk;
    if (mk === 'glow') mesh.layers.set(1);
    grp.add(mesh);
  }
  return grp;
};
function mergeGeos(list){
  var names = {}, nv = 0, ni = 0, i, g, k;
  for (i = 0; i < list.length; i++){
    g = list[i]; nv += g.attributes.position.count; ni += g.index ? g.index.count : g.attributes.position.count;
    for (k in g.attributes) if (!names[k]) names[k] = g.attributes[k].itemSize;
  }
  var out = {}, I = nv > 65535 ? new Uint32Array(ni) : new Uint16Array(ni), vo = 0, io = 0;
  for (k in names) out[k] = new Float32Array(nv * names[k]);
  for (i = 0; i < list.length; i++){
    g = list[i]; var n = g.attributes.position.count;
    for (k in names){
      var sz = names[k], dst = out[k], src = g.attributes[k];
      if (src){ var a = src.array; if (src.isInterleavedBufferAttribute){ for (var q = 0; q < n; q++) for (var w = 0; w < sz; w++) dst[(vo + q) * sz + w] = src.getComponent ? src.getComponent(q, w) : [src.getX(q), src.getY(q), src.getZ(q), src.getW(q)][w]; } else dst.set(a.subarray(0, n * sz), vo * sz); }
      else if (k === 'color'){ for (var q2 = 0; q2 < n * sz; q2++) dst[vo * sz + q2] = 1; }
    }
    if (g.index){ var ia = g.index.array; for (var t = 0; t < ia.length; t++) I[io + t] = ia[t] + vo; io += ia.length; }
    else { for (var t2 = 0; t2 < n; t2++) I[io + t2] = vo + t2; io += n; }
    vo += n;
    g.dispose();
  }
  var res = new THREE.BufferGeometry();
  for (k in names) res.setAttribute(k, new THREE.BufferAttribute(out[k], names[k]));
  res.setIndex(new THREE.BufferAttribute(I, 1));
  res.computeBoundingSphere();
  return res;
}
function geoOf(fn){ var k = new Kit(); fn(k); var p = k.take(), list = []; for (var key in p) list = list.concat(p[key]); return list.length ? mergeGeos(list) : null; }
/* ===================== 02 · render: renderer, sky, lights, materials, post ===================== */
var renderer, scene, camera;
var U = { time: { value: 0 }, wind: { value: 1 } };
var L = {};                    // lights
var SKY = { mesh: null, env: null, uni: null };
var MATS = {}, MAT_LIST = [];
var POST = {};
var STYLE = null;
var LOWQ = false;              // phones and small screens: smaller shadow map, lower pixel ratio

function lin3(hex){ return new THREE.Color(palHex(hex)).convertSRGBToLinear(); }

function initRenderer(){
  LOWQ = Math.min(screen.width || innerWidth, screen.height || innerHeight) < 700 || /Mobi|Android/i.test(navigator.userAgent || '');
  renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: DEV });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, LOWQ ? 1.25 : 1.5));
  renderer.setSize(innerWidth, innerHeight);
  renderer.outputEncoding = THREE.LinearEncoding;
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  document.getElementById('view').appendChild(renderer.domElement);
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(36, innerWidth / innerHeight, 0.5, 1400);
  camera.layers.enable(1);
  // lights
  L.hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 1); scene.add(L.hemi);
  L.sun = new THREE.DirectionalLight(0xffffff, 2.5); L.sun.castShadow = true;
  var sm = LOWQ ? 2048 : 4096, sc = L.sun.shadow; sc.mapSize.set(sm, sm); sc.camera.left = -44; sc.camera.right = 44; sc.camera.top = 44; sc.camera.bottom = -44; sc.camera.near = 1; sc.camera.far = 180; sc.bias = -0.0004; sc.normalBias = 0.035;
  scene.add(L.sun); scene.add(L.sun.target);
  L.fill = new THREE.DirectionalLight(0xffffff, 0.3); scene.add(L.fill); scene.add(L.fill.target);
  L.amb = new THREE.AmbientLight(0xffffff, 0); scene.add(L.amb);
  // sky dome (follows the camera)
  SKY.uni = {
    top: { value: new THREE.Color() }, mid: { value: new THREE.Color() }, bot: { value: new THREE.Color() },
    sunDir: { value: new V3(0, 1, 0) }, sunCol: { value: new THREE.Color() }, sunAmt: { value: 0.5 }, sunExp: { value: 64 }, disc: { value: 0 },
    cloud: { value: 0 }, cloudCol: { value: new THREE.Color(1, 1, 1) }, cloudShade: { value: new THREE.Color(0.7, 0.7, 0.8) }, cloudY: { value: 0.12 },
    stars: { value: 0 }, curve: { value: new THREE.Vector2(0.6, 0.8) }, time: U.time
  };
  var skyMat = new THREE.ShaderMaterial({
    uniforms: SKY.uni, side: THREE.BackSide, depthWrite: false, fog: false,
    vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: [
      'uniform vec3 top, mid, bot, sunCol, cloudCol, cloudShade; uniform vec3 sunDir; uniform float sunAmt, sunExp, disc, cloud, cloudY, stars, time; uniform vec2 curve; varying vec3 vDir;',
      'float h2(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }',
      'float n2(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(h2(i), h2(i + vec2(1, 0)), f.x), mix(h2(i + vec2(0, 1)), h2(i + vec2(1, 1)), f.x), f.y); }',
      'float fb(vec2 p){ float a = 0.0, m = 0.5; for (int i = 0; i < 5; i++){ a += n2(p) * m; p *= 2.03; m *= 0.5; } return a; }',
      'void main(){',
      '  vec3 d = normalize(vDir); float y = d.y;',
      '  vec3 c = y > 0.0 ? mix(mid, top, pow(clamp(y, 0.0, 1.0), curve.x)) : mix(mid, bot, pow(clamp(-y, 0.0, 1.0), curve.y));',
      '  float sd = max(dot(d, normalize(sunDir)), 0.0);',
      '  c += sunCol * (pow(sd, sunExp) * sunAmt + pow(sd, 6.0) * sunAmt * 0.18);',
      '  if (disc > 0.0) c = mix(c, sunCol * 1.6, smoothstep(0.9990, 0.9994, sd) * disc);',
      '  if (cloud > 0.0){',
      '    float yy = y - cloudY; vec2 p = d.xz / max(abs(yy) + 0.18, 0.18) * 1.4 + vec2(time * 0.006, 0.0);',
      '    float f = fb(p * 1.3); float m = smoothstep(0.52 - cloud * 0.25, 0.78 - cloud * 0.2, f) * smoothstep(0.0, 0.25, abs(yy) + 0.02);',
      '    float lit = clamp(fb(p * 1.3 + normalize(sunDir).xz * 0.08) - f + 0.6, 0.0, 1.0);',
      '    c = mix(c, mix(cloudShade, cloudCol, lit), m * 0.92);',
      '  }',
      '  gl_FragColor = linearToOutputTexel(vec4(c, 1.0));',
      '}'
    ].join('\n')
  });
  SKY.mat = skyMat;
  SKY.mesh = new THREE.Mesh(new THREE.SphereGeometry(900, 48, 24), skyMat);
  SKY.mesh.renderOrder = -10; SKY.mesh.frustumCulled = false; SKY.mesh.layers.set(1);
  scene.add(SKY.mesh);
  initPost();
}
function sunVec(az, el){ var a = az * Math.PI / 180, e = el * Math.PI / 180; return new V3(Math.sin(a) * Math.cos(e), Math.sin(e), Math.cos(a) * Math.cos(e)); }
function applyLighting(S){
  var Lt = S.light;
  var sv = sunVec(Lt.az, Lt.el);
  L.sun.position.copy(sv).multiplyScalar(80); L.sun.target.position.set(0, 0, 0);
  if (Lt.shade){
    // stylised two-tone light: flat ground in full sun shows its exact paint colour, shade multiplies it by a soft lilac
    var sh = lin3(Lt.shade), k = Math.sin(Lt.el * Math.PI / 180) || 1;
    var sr = Math.max(0, 1 - sh.r) / k, sg = Math.max(0, 1 - sh.g) / k, sb = Math.max(0, 1 - sh.b) / k, mx = Math.max(sr, sg, sb, 0.001);
    L.sun.color.setRGB(sr / mx, sg / mx, sb / mx); L.sun.intensity = mx * (Lt.sunK || 1);
    L.hemi.color.copy(sh); L.hemi.groundColor.copy(lin3(Lt.gnd || Lt.shade)); L.hemi.intensity = 1;
  } else {
    L.sun.color.copy(lin3(Lt.sun)); L.sun.intensity = Lt.sunI;
    L.hemi.color.copy(lin3(Lt.sky)); L.hemi.groundColor.copy(lin3(Lt.gnd)); L.hemi.intensity = Lt.hemiI;
  }
  L.sun.shadow.radius = Lt.shadowR || 1;
  var ssz = Lt.shadowSize || 36, sc = L.sun.shadow.camera; sc.left = -ssz; sc.right = ssz; sc.top = ssz; sc.bottom = -ssz; sc.updateProjectionMatrix();
  var fv = sunVec(Lt.fillAz === undefined ? Lt.az + 160 : Lt.fillAz, Lt.fillEl || 25);
  L.fill.position.copy(fv).multiplyScalar(60); L.fill.color.copy(lin3(Lt.fill || '#BFD8FF')); L.fill.intensity = Lt.fillI || 0;
  L.amb.color.copy(lin3(Lt.amb || '#FFFFFF')); L.amb.intensity = Lt.ambI || 0;
  var stype = Lt.vsm ? THREE.VSMShadowMap : Lt.pcf ? THREE.PCFShadowMap : THREE.PCFSoftShadowMap;
  if (renderer.shadowMap.type !== stype){ renderer.shadowMap.type = stype; }
  if (L.sun.shadow.map){ L.sun.shadow.map.dispose(); L.sun.shadow.map = null; }
  if (Lt.vsm){ L.sun.shadow.radius = Lt.shadowR || 6; L.sun.shadow.bias = -0.002; } else { L.sun.shadow.bias = -0.0004; }
  if (Lt.pcf) L.sun.shadow.radius = Lt.pcf;
  // sky
  var K = S.sky;
  SKY.uni.top.value.copy(lin3(K.top)); SKY.uni.mid.value.copy(lin3(K.mid)); SKY.uni.bot.value.copy(lin3(K.bot));
  SKY.uni.sunDir.value.copy(sunVec(K.sunAz !== undefined ? K.sunAz : Lt.az, K.sunEl !== undefined ? K.sunEl : Lt.el));
  SKY.uni.sunCol.value.copy(lin3(K.sunCol || Lt.sun)); SKY.uni.sunAmt.value = K.sunAmt === undefined ? 0.4 : K.sunAmt; SKY.uni.sunExp.value = K.sunExp || 48; SKY.uni.disc.value = K.disc || 0;
  SKY.uni.cloud.value = K.cloud || 0; SKY.uni.cloudCol.value.copy(lin3(K.cloudCol || '#FFFFFF')); SKY.uni.cloudShade.value.copy(lin3(K.cloudShade || '#B9C2D6')); SKY.uni.cloudY.value = K.cloudY === undefined ? 0.05 : K.cloudY;
  SKY.uni.stars.value = K.stars || 0; SKY.uni.curve.value.set(K.cx || 0.6, K.cy || 0.8);
  // fog
  var F = S.fog;
  if (!F) scene.fog = null;
  else if (F.exp) scene.fog = new THREE.FogExp2(lin3(F.col).getHex(), F.exp);
  else scene.fog = new THREE.Fog(lin3(F.col).getHex(), F.near, F.far);
  // environment for physically based materials
  if (SKY.env){ SKY.env.dispose(); SKY.env = null; }
  if ((S.mat.type || 'std') === 'std' && !S.mat.noEnv){ SKY.env = SKY.pmrem.fromScene(SKY.envScene, 0.04).texture; }
}
var WIND_VS = [
  '#include <begin_vertex>',
  '#ifdef USE_INSTANCING',
  '  vec3 wbase = vec3(instanceMatrix[3][0], 0.0, instanceMatrix[3][2]);',
  '  float wk = wind * uWind;',
  '#else',
  '  vec3 wbase = (modelMatrix * vec4(transformed, 1.0)).xyz;',
  '  float wk = wind * uWind;',
  '#endif',
  '  float wph = uTime * 1.7 + wbase.x * 0.31 + wbase.z * 0.23;',
  '  float gust = 0.65 + 0.35 * sin(uTime * 0.53 + wbase.x * 0.05);',
  '  transformed.x += (sin(wph) + 0.35 * sin(wph * 2.7 + 1.3)) * wk * gust;',
  '  transformed.z += (cos(wph * 0.83 + 0.7)) * wk * gust * 0.55;',
  '  transformed.y -= abs(sin(wph)) * wk * 0.12;'
].join('\n');
function addWind(m, amp, tag){
  var prev = m.onBeforeCompile;
  m.onBeforeCompile = function(sh, r){
    if (prev) prev(sh, r);
    sh.uniforms.uTime = U.time; sh.uniforms.uWind = { value: amp };
    sh.vertexShader = 'attribute float wind;\nuniform float uTime;\nuniform float uWind;\n' + sh.vertexShader.replace('#include <begin_vertex>', WIND_VS);
  };
  var pk = m.customProgramCacheKey ? m.customProgramCacheKey.bind(m) : function(){ return ''; };
  m.customProgramCacheKey = function(){ return pk() + '|wind' + (tag || '') + amp; };
  return m;
}
var STAMP = { tex: { value: null }, amt: { value: 1 }, scale: { value: 1 / 9.0 } };
function stampTexture(){
  var S = 1024, TILE = 9, ppm = S / TILE, R = makeRng(4711), i, j;
  function rr2(a, b){ return a + (b - a) * R(); }
  function layer(sz, bg){ var cv = document.createElement('canvas'); cv.width = cv.height = sz; var g = cv.getContext('2d', { willReadFrequently: true }); g.fillStyle = bg; g.fillRect(0, 0, sz, sz); return g; }
  function wrapOn(sz, x, y, r, fn){ for (var ox = -1; ox <= 1; ox++) for (var oy = -1; oy <= 1; oy++){ var px = x + ox * sz, py = y + oy * sz; if (px + r < 0 || px - r > sz || py + r < 0 || py - r > sz) continue; fn(px, py); } }
  // soft blotches painted small and scaled up: cheap blur that still tiles
  function softLayer(n, rMin, rMax, vDark, vLight, pDark, alpha){
    var sz = 128, g = layer(sz, 'rgb(128,128,128)'), k = sz / S;
    for (var q = 0; q < n; q++){
      var x = R() * sz, y = R() * sz, r = rr2(rMin, rMax) * k, v = R() < pDark ? vDark : vLight;
      wrapOn(sz, x, y, r * 2, function(px, py){ g.fillStyle = 'rgba(' + v + ',' + v + ',' + v + ',' + alpha + ')'; for (var c = 0; c < 3; c++){ var ca = R() * TAU, cd = r * rr2(0, 0.6); g.beginPath(); g.arc(px + Math.cos(ca) * cd, py + Math.sin(ca) * cd * 0.8, r * rr2(0.5, 0.8), 0, TAU); g.fill(); } });
    }
    // pad by one wrapped pixel so the bilinear upscale wraps at the edges too
    var pad = layer(sz + 2, 'rgb(128,128,128)');
    for (var ox = -1; ox <= 1; ox++) for (var oy = -1; oy <= 1; oy++) pad.drawImage(g.canvas, 1 + ox * sz, 1 + oy * sz);
    var big = layer(S, 'rgb(128,128,128)'), sc = S / sz; big.imageSmoothingEnabled = true; big.imageSmoothingQuality = 'high';
    big.drawImage(pad.canvas, -sc, -sc, (sz + 2) * sc, (sz + 2) * sc);
    return big;
  }
  // a row of rounded "fingers" (the painted grass tuft); v = grey value 0..255
  function fingers(g, x, y, n, w, h, v, vTop, ang){
    wrapOn(S, x, y, h * 1.6 + n * w, function(px, py){
      g.save(); g.translate(px, py); g.rotate(ang);
      for (var f = 0; f < n; f++){
        var u = n > 1 ? f / (n - 1) - 0.5 : 0, fx = u * w * n * 1.02 + rr2(-0.12, 0.12) * w, fh = h * rr2(0.7, 1.05) * (1 - Math.abs(u) * 0.45), fw = w * rr2(0.85, 1.12);
        g.save(); g.translate(fx, rr2(-0.1, 0.1) * h); g.rotate(u * 0.55 + rr2(-0.1, 0.1));
        var gr = g.createLinearGradient(0, 0, 0, -fh); gr.addColorStop(0, 'rgb(' + v + ',' + v + ',' + v + ')'); gr.addColorStop(1, 'rgb(' + vTop + ',' + vTop + ',' + vTop + ')');
        g.fillStyle = gr;
        g.beginPath(); g.moveTo(-fw / 2, 0); g.lineTo(-fw / 2, -fh + fw / 2); g.arc(0, -fh + fw / 2, fw / 2, Math.PI, 0); g.lineTo(fw / 2, 0); g.closePath(); g.fill();
        g.restore();
      }
      g.restore();
    });
  }
  // R: grass — soft mottles, then clusters of dark finger stamps and a few lighter ones
  var gR = softLayer(70, 30, 80, 104, 148, 0.55, 0.5);
  for (i = 0; i < 82; i++){
    var cx = R() * S, cy = R() * S, nn = 1 + Math.floor(R() * 4);
    for (j = 0; j < nn; j++){
      var lt = R() < 0.16;
      fingers(gR, cx + rr2(-0.55, 0.55) * ppm, cy + rr2(-0.38, 0.38) * ppm, 3 + Math.floor(R() * 4), rr2(0.07, 0.105) * ppm, rr2(0.2, 0.34) * ppm, lt ? 150 : 88, lt ? 166 : 106, rr2(-0.25, 0.25));
    }
  }
  // G: dirt — big soft dabs, then pebble dots
  var gG = softLayer(150, 0.12 * ppm, 0.4 * ppm, 96, 156, 0.6, 0.55);
  for (i = 0; i < 520; i++){ var pv = R() < 0.6 ? 84 : 176, pr = rr2(1.5, 3.6); (function(x, y, v, r){ wrapOn(S, x, y, 6, function(px, py){ gG.fillStyle = 'rgb(' + v + ',' + v + ',' + v + ')'; gG.beginPath(); gG.ellipse(px, py, r, r * 0.75, 0, 0, TAU); gG.fill(); }); })(R() * S, R() * S, pv, pr); }
  // A: golden painted tufts
  var gA = layer(S, 'rgb(0,0,0)');
  for (i = 0; i < 26; i++){ var gx = R() * S, gy = R() * S, gn = 2 + Math.floor(R() * 4); for (j = 0; j < gn; j++) fingers(gA, gx + rr2(-0.5, 0.5) * ppm, gy + rr2(-0.35, 0.35) * ppm, 3 + Math.floor(R() * 4), rr2(0.06, 0.085) * ppm, rr2(0.16, 0.26) * ppm, 200, 255, rr2(-0.2, 0.2)); }
  var dR = gR.getImageData(0, 0, S, S).data, dG = gG.getImageData(0, 0, S, S).data, dA = gA.getImageData(0, 0, S, S).data;
  var out = new Uint8Array(S * S * 4);
  for (i = 0; i < S * S; i++){ out[i * 4] = dR[i * 4]; out[i * 4 + 1] = dG[i * 4]; out[i * 4 + 2] = 0; out[i * 4 + 3] = dA[i * 4]; }
  // B: specks, written straight into the pixels (tiny soft dots)
  for (i = 0; i < 2600; i++){
    var sx = R() * S, sy = R() * S, sr = rr2(0.9, 2.1), sv = rr2(150, 255), r2 = Math.ceil(sr + 1);
    for (var yy = -r2; yy <= r2; yy++) for (var xx = -r2; xx <= r2; xx++){
      var d = Math.sqrt(xx * xx + yy * yy), a = clamp(sr + 0.5 - d, 0, 1); if (a <= 0) continue;
      var X = ((Math.floor(sx) + xx) % S + S) % S, Y = ((Math.floor(sy) + yy) % S + S) % S, o = (Y * S + X) * 4 + 2;
      out[o] = Math.max(out[o], Math.round(sv * a));
    }
  }
  var t = new THREE.DataTexture(out, S, S, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true;
  t.anisotropy = renderer.capabilities.getMaxAnisotropy(); t.needsUpdate = true;
  STAMP.size = TILE;
  return t;
}
/* ---------- territory: the ground around each castle turns to blight or bright meadow with its owner ---------- */
// zone = (x, z, radius, state): state -1 = the Blight owns it, +1 = the Valley, 0 = nobody
var TERR = {
  zone: { value: [] },
  bl0: { value: new THREE.Color() }, bl1: { value: new THREE.Color() }, bl2: { value: new THREE.Color() }, blRim: { value: new THREE.Color() }, blPath: { value: new THREE.Color() },
  lush: { value: new THREE.Color() }, lushSpeck: { value: new THREE.Color() }, tVio: { value: new THREE.Color() }, tLush: { value: new THREE.Color() }
};
for (var _zi = 0; _zi < 9; _zi++) TERR.zone.value.push(new THREE.Vector4(0, 0, 0, 0));
function initTerrColors(){
  TERR.bl0.value.copy(lin3('blight')); TERR.bl1.value.copy(lin3('blightL')); TERR.bl2.value.copy(lin3('blightD'));
  TERR.blRim.value.copy(lin3('blightRim')); TERR.blPath.value.copy(lin3('blightPath'));
  // the Valley's meadows: a cooler, bluer green, white-blue flower specks
  TERR.lush.value.setRGB(0.8, 1.07, 1.3); TERR.lushSpeck.value.copy(lin3('#A9C4FF'));
  TERR.tVio.value.copy(lin3('#8C5AC8')); TERR.tLush.value.copy(lin3('#5B90DA'));
}
var TERR_GLSL = [
  'uniform vec4 uZone[9];',
  'float tHash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }',
  'float tNoise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(tHash(i), tHash(i + vec2(1.0, 0.0)), f.x), mix(tHash(i + vec2(0.0, 1.0)), tHash(i + vec2(1.0, 1.0)), f.x), f.y); }',
  // x = blight amount, y = meadow amount
  'vec2 terrAmt(vec2 wp){',
  '  float bl = 0.0, lu = 0.0;',
  '  float n = tNoise(wp * 0.31) * 0.62 + tNoise(wp * 0.93 + 3.7) * 0.38;',
  '  for (int i = 0; i < 9; i++){',
  '    vec4 z = uZone[i];',
  '    float d = length(wp - z.xy) + (n - 0.5) * z.z * 0.5;',
  '    float w = 1.0 - smoothstep(z.z * 0.6, z.z, d);',
  '    bl = max(bl, w * clamp(-z.w, 0.0, 1.0));',
  '    lu = max(lu, w * clamp(z.w, 0.0, 1.0));',
  '  }',
  '  return vec2(bl, lu);',
  '}'
].join('\n');

/* ---------- the painted ground: stamp texture + territory ---------- */
function addStampTex(m){
  if (!STAMP.tex.value) STAMP.tex.value = stampTexture();
  m.onBeforeCompile = function(sh){
    sh.uniforms.uSTex = STAMP.tex; sh.uniforms.uSAmt = STAMP.amt; sh.uniforms.uSScale = STAMP.scale;
    sh.uniforms.uZone = TERR.zone; sh.uniforms.uBl0 = TERR.bl0; sh.uniforms.uBl1 = TERR.bl1; sh.uniforms.uBl2 = TERR.bl2; sh.uniforms.uBlRim = TERR.blRim; sh.uniforms.uBlPath = TERR.blPath;
    sh.uniforms.uLush = TERR.lush; sh.uniforms.uLushSpeck = TERR.lushSpeck;
    sh.vertexShader = 'attribute vec4 gpaint;\nattribute float aRoad;\nvarying vec4 vGP;\nvarying vec2 vSW;\nvarying float vRoad;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvGP = gpaint;\nvRoad = aRoad;\nvSW = (modelMatrix * vec4(transformed, 1.0)).xz;');
    sh.fragmentShader = 'uniform sampler2D uSTex;\nuniform float uSAmt;\nuniform float uSScale;\nuniform vec3 uBl0, uBl1, uBl2, uBlRim, uBlPath, uLush, uLushSpeck;\nvarying vec4 vGP;\nvarying vec2 vSW;\nvarying float vRoad;\n' + TERR_GLSL + '\n' + sh.fragmentShader.replace('#include <color_fragment>', [
      '#include <color_fragment>',
      'vec2 ta = terrAmt(vSW);',
      'float ba = smoothstep(0.36, 0.6, ta.x), la = smoothstep(0.36, 0.6, ta.y);',
      'if (ta.x > 0.001){',
      '  vec3 bc = mix(uBl0, uBl1, smoothstep(0.3, 0.72, tNoise(vSW * 0.33 + 5.0)));',
      '  bc = mix(bc, uBl2, smoothstep(0.55, 0.8, tNoise(vSW * 0.63 + 11.0)) * 0.75);',
      '  bc = mix(bc, uBlRim, (1.0 - smoothstep(0.36, 0.9, ta.x)) * 0.45 * smoothstep(0.35, 0.6, tNoise(vSW * 1.05)));',
      '  bc = mix(bc, uBlPath, clamp(vRoad, 0.0, 1.0) * 0.9);',
      '  diffuseColor.rgb = mix(diffuseColor.rgb * (1.0 - 0.15 * smoothstep(0.02, 0.36, ta.x)), bc, ba * vGP.z);',
      '}',
      'diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * uLush, la * vGP.z * (1.0 - clamp(vRoad, 0.0, 1.0) * 0.85));',
      'if (vGP.z > 0.5 && uSAmt > 0.0){',
      '  vec2 suv = vSW * uSScale;',
      '  vec4 t1 = texture2D(uSTex, suv);',
      '  vec4 t2 = texture2D(uSTex, mat2(0.8, -0.6, 0.6, 0.8) * suv * 1.31 + vec2(0.37, 0.71));',
      '  vec4 t = mix(t1, t2, clamp(vGP.w, 0.0, 1.0));',
      '  float g = clamp(vGP.x, 0.0, 1.0), b = max(clamp(vGP.y, 0.0, 1.0), ba);',
      '  float m = mix(t.g * 2.0, t.r * 2.0, g);',
      '  vec3 c = diffuseColor.rgb * mix(1.0, m, uSAmt);',
      '  c = mix(c, c * vec3(2.1, 1.25, 0.42), t.a * g * (1.0 - b) * (1.0 - la) * uSAmt * 0.62);',
      '  c = mix(c, vec3(0.74, 0.68, 0.88), t.b * b * uSAmt * 0.32);',
      '  c = mix(c, uLushSpeck, clamp(t.b * 1.6, 0.0, 1.0) * la * g * uSAmt * 0.8);',
      '  c *= 1.0 + t.b * (1.0 - b) * (1.0 - la) * g * 0.14 * uSAmt;',
      '  diffuseColor.rgb = c;',
      '}'
    ].join('\n'));
  };
  m.customProgramCacheKey = function(){ return 'stamp+terr'; };
  return m;
}
/* ---------- finger tufts: flat cards that turn to face the camera, sway, and take the colour of the land ---------- */
function tuftMat(){
  var m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0, side: THREE.DoubleSide });
  m.onBeforeCompile = function(sh){
    sh.uniforms.uTime = U.time; sh.uniforms.uWind = U.wind; sh.uniforms.uZone = TERR.zone; sh.uniforms.uVio = TERR.tVio; sh.uniforms.uLushT = TERR.tLush;
    sh.vertexShader = 'attribute float wind;\nuniform float uTime;\nuniform float uWind;\nvarying vec2 vTP;\nvarying float vShade;\n' + sh.vertexShader.replace('#include <begin_vertex>', [
      '#include <begin_vertex>',
      '#ifdef USE_INSTANCING',
      '  vec3 tp = (modelMatrix * vec4(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2], 1.0)).xyz;',
      '#else',
      '  vec3 tp = (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;',
      '#endif',
      '  vTP = tp.xz; vShade = color.r;',
      '  float tj = (fract(sin(dot(tp.xz, vec2(12.9898, 78.233))) * 43758.5453) - 0.5) * 0.9;',
      '  float ta = atan(cameraPosition.x - tp.x, cameraPosition.z - tp.z) + tj;',
      '  float tc = cos(ta), ts = sin(ta);',
      '  transformed = vec3(transformed.x * tc + transformed.z * ts, transformed.y, -transformed.x * ts + transformed.z * tc);',
      '  float twp = uTime * 1.5 + tp.x * 0.37 + tp.z * 0.23;',
      '  transformed.x += (sin(twp) + 0.3 * sin(twp * 2.3)) * wind * 0.045 * uWind; transformed.z += cos(twp * 0.8) * wind * 0.03 * uWind;'
    ].join('\n'));
    sh.fragmentShader = 'uniform vec3 uVio, uLushT;\nvarying vec2 vTP;\nvarying float vShade;\n' + TERR_GLSL + '\n' + sh.fragmentShader.replace('#include <color_fragment>', [
      '#include <color_fragment>',
      'vec2 ta = terrAmt(vTP);',
      'float jj = 0.9 + 0.2 * tHash(floor(vTP * 3.0));',
      'diffuseColor.rgb = mix(diffuseColor.rgb, uVio * vShade * jj, smoothstep(0.3, 0.6, ta.x));',
      'diffuseColor.rgb = mix(diffuseColor.rgb, uLushT * vShade * jj, smoothstep(0.3, 0.6, ta.y) * 0.85);'
    ].join('\n'));
  };
  m.customProgramCacheKey = function(){ return 'tuft+terr'; };
  return regMat(m);
}
function regMat(m){ MAT_LIST.push(m); return m; }
function makeMaterials(S){
  var M = S.mat;
  function mk(key, o){
    o = o || {};
    var m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: o.r === undefined ? 0.85 : o.r, metalness: o.m || 0 });
    if (o.side) m.side = o.side;
    m.userData.key = key;
    return regMat(m);
  }
  MATS.matte = mk('matte', { r: 0.86 });
  MATS.stone = mk('stone', { r: 0.92 });
  MATS.wood = mk('wood', { r: 0.82 });
  MATS.cloth = addWind(mk('cloth', { r: 0.95, side: THREE.DoubleSide }), M.clothWind === undefined ? 0.16 : M.clothWind, 'c');
  MATS.skin = mk('skin', { r: 0.7 });
  MATS.leaf = addWind(mk('leaf', { r: 0.85, side: M.leafDouble ? THREE.DoubleSide : THREE.FrontSide }), M.leafWind === undefined ? 0.05 : M.leafWind, 'l');
  MATS.metal = mk('metal', { r: M.metalR === undefined ? 0.38 : M.metalR, m: M.metalM === undefined ? 0.7 : M.metalM });
  MATS.gold = mk('gold', { r: 0.45, m: M.goldM !== undefined ? M.goldM : 0.85 });
  MATS.ground = addStampTex(mk('ground', { r: 1 }));
  MATS.roof = mk('roof', { r: 0.8 });
  MATS.glass = mk('glass', { r: 0.12 });
  MATS.glow = regMat(new THREE.MeshBasicMaterial({ vertexColors: true, fog: false }));
  MATS.flame = regMat(new THREE.MeshBasicMaterial({ vertexColors: true, fog: false, transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending }));
  return MATS;
}
function matFor(key){ return MATS[key] || MATS.matte; }
// a waving cloth whose colour is set on the material (flags that change owner)
function clothMat(hex){
  var m = addWind(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, side: THREE.DoubleSide }), STYLE.mat.clothWind === undefined ? 0.16 : STYLE.mat.clothWind, 'c');
  m.color.copy(lin3(hex)); m.userData.key = 'cloth';
  return regMat(m);
}

/* ---------- water ---------- */
function waterMaterial(opts){
  opts = opts || {};
  var m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: STYLE.mat.waterR || 0.12, metalness: 0.0, transparent: true, opacity: 1, depthWrite: false });
  var foam = lin3('foam'), sh = lin3('waterShallow'), dp = lin3('waterDeep'), wa = lin3('water');
  m.onBeforeCompile = function(s){
    s.uniforms.uTime = U.time; s.uniforms.cFoam = { value: foam }; s.uniforms.cSh = { value: sh }; s.uniforms.cDp = { value: dp }; s.uniforms.cWa = { value: wa };
    s.uniforms.uFoamW = { value: opts.foamW || STYLE.mat.foamW || 0.12 }; s.uniforms.uRip = { value: opts.rip === undefined ? 1 : opts.rip }; s.uniforms.uLines = { value: STYLE.mat.waterLines === undefined ? 0.6 : STYLE.mat.waterLines };
    s.vertexShader = 'attribute float depth;\nvarying float vDepth;\nvarying vec3 vWp;\n' + s.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvDepth = depth;\nvWp = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    s.fragmentShader = 'uniform float uTime, uFoamW, uRip, uLines;\nuniform vec3 cFoam, cSh, cDp, cWa;\nvarying float vDepth;\nvarying vec3 vWp;\n' + s.fragmentShader
      .replace('#include <color_fragment>', [
        '#include <color_fragment>',
        'float dd = clamp(vDepth, 0.0, 2.0);',
        'vec3 wc = mix(cSh, cWa, smoothstep(0.0, 0.35, dd)); wc = mix(wc, cDp, smoothstep(0.35, 1.2, dd));',
        'float wv = sin(vWp.x * 2.1 + uTime * 1.3) * sin(vWp.z * 1.7 - uTime * 1.1) + sin((vWp.x + vWp.z) * 3.3 + uTime * 2.0) * 0.5;',
        'float fl = smoothstep(uFoamW + 0.05 * sin(uTime * 1.6 + vWp.x * 1.3 + vWp.z), 0.0, dd);',
        'float lines = smoothstep(0.82, 0.98, sin(dd * 26.0 - uTime * 2.2 + wv)) * smoothstep(0.5, 0.1, dd) * uLines;',
        'float cr = sin(vWp.x * 0.55 + vWp.z * 1.35 + uTime * 1.2 + sin(vWp.x * 0.31 - uTime * 0.4) * 2.2) * sin(vWp.x * 1.1 - vWp.z * 0.42 - uTime * 0.8 + sin(vWp.z * 0.27) * 1.7);',
        'float rip = smoothstep(0.82, 0.98, cr) * 0.14 * uRip * smoothstep(0.1, 0.5, dd);',
        'diffuseColor.rgb = mix(wc, cFoam, clamp(fl + lines + rip, 0.0, 1.0));',
        'diffuseColor.a = mix(0.55, 0.93, smoothstep(0.0, 0.6, dd)) + fl * 0.4;'
      ].join('\n'))
      .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\nnormal = normalize(normal + vec3(cos(vWp.x * 2.3 + uTime * 1.4), 0.0, sin(vWp.z * 2.0 - uTime * 1.2)) * 0.08 * uRip);')
      .replace('#include <lights_fragment_end>', '#include <lights_fragment_end>\nreflectedLight.directSpecular *= ' + (STYLE.mat.waterSpec === undefined ? '1.0' : STYLE.mat.waterSpec.toFixed(3)) + ';');
  };
  m.customProgramCacheKey = function(){ return 'water' + (opts.foamW || 0.12); };
  return regMat(m);
}
var FINAL_SHADER = {
  uniforms: {
    tDiffuse: { value: null }, res: { value: new THREE.Vector2(1, 1) }, time: U.time,
    exposure: { value: 1 }, tone: { value: 0 }, con: { value: 1 }, sat: { value: 1 }, bright: { value: 0 },
    lift: { value: new V3(0, 0, 0) }, gam: { value: new V3(1, 1, 1) }, gain: { value: new V3(1, 1, 1) },
    shTint: { value: new V3(0, 0, 0) }, hiTint: { value: new V3(0, 0, 0) },
    vig: { value: 0.3 }, vigCol: { value: new V3(0, 0, 0) }, vigR: { value: new THREE.Vector2(0.45, 1.05) },
    tilt: { value: 0 }, tiltC: { value: 0.5 }, tiltB: { value: 0.2 },
    edge: { value: 0 }, edgeCol: { value: new V3(1, 0.6, 0.3) },
    post: { value: 0 }, dith: { value: 0 }, grain: { value: 0 }, srgb: { value: 1 }
  },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: [
    'uniform sampler2D tDiffuse; uniform vec2 res, vigR; uniform float time, exposure, tone, con, sat, bright, vig, tilt, tiltC, tiltB, edge, post, dith, grain, srgb;',
    'uniform vec3 lift, gam, gain, shTint, hiTint, vigCol, edgeCol; varying vec2 vUv;',
    'vec3 aces(vec3 x){ return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0); }',
    'vec3 soft(vec3 x){ return 1.0 - exp(-x * 1.15); }',
    'vec3 toS(vec3 c){ c = max(c, 0.0); return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }',
    'float bayer(vec2 p){ vec2 q = mod(floor(p), 4.0); float i = q.x + q.y * 4.0;',
    '  return (i == 0.0 ? 0.0 : i == 1.0 ? 8.0 : i == 2.0 ? 2.0 : i == 3.0 ? 10.0 : i == 4.0 ? 12.0 : i == 5.0 ? 4.0 : i == 6.0 ? 14.0 : i == 7.0 ? 6.0 : i == 8.0 ? 3.0 : i == 9.0 ? 11.0 : i == 10.0 ? 1.0 : i == 11.0 ? 9.0 : i == 12.0 ? 15.0 : i == 13.0 ? 7.0 : i == 14.0 ? 13.0 : 5.0) / 16.0 - 0.47; }',
    'void main(){',
    '  vec2 uv = vUv; vec3 c = texture2D(tDiffuse, uv).rgb;',
    '  float b = tilt * smoothstep(tiltB, tiltB + 0.32, abs(uv.y - tiltC));',
    '  if (b > 0.05){',
    '    vec3 acc = c; float w = 1.0; vec2 px = b / res;',
    '    for (int i = 0; i < 16; i++){ float a = float(i) * 2.39996; float r = sqrt(float(i) + 0.5) / 4.0; vec2 o = vec2(cos(a), sin(a)) * r; acc += texture2D(tDiffuse, uv + o * px * 3.0).rgb; w += 1.0; }',
    '    c = acc / w;',
    '  }',
    '  c *= exposure;',
    '  c = tone < 0.5 ? aces(c) : tone < 1.5 ? soft(c) : clamp(c, 0.0, 1.0);',
    '  if (srgb > 0.5) c = toS(c);',
    '  float Lm = dot(c, vec3(0.2126, 0.7152, 0.0722));',
    '  c = mix(vec3(Lm), c, sat);',
    '  c = (c - 0.5) * con + 0.5 + bright;',
    '  c = c * gain + lift * (1.0 - c);',
    '  c = pow(max(c, 0.0), 1.0 / gam);',
    '  c += shTint * pow(1.0 - Lm, 2.0) + hiTint * Lm * Lm;',
    '  vec2 q = (uv - 0.5) * vec2(res.x / res.y, 1.0);',
    '  float v = smoothstep(vigR.x, vigR.y, length(q));',
    '  c = mix(c, vigCol, v * vig);',
    '  if (edge > 0.0){ float e = smoothstep(0.25, 0.95, length((uv - 0.5) * vec2(1.25, 1.6))); c = mix(c, c * 0.55 + edgeCol * 0.6, e * edge); }',
    '  { float g = fract(sin(dot(uv * res + time * 60.0, vec2(12.9898, 78.233))) * 43758.5453); c += (g - 0.5) * max(grain, 0.006); }',
    '  if (post > 0.0){ c = floor(c * post + 0.5 + bayer(gl_FragCoord.xy) * dith) / post; }',
    '  gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);',
    '}'
  ].join('\n')
};
function initPost(){
  var w = innerWidth, h = innerHeight;
  var opt = { type: THREE.HalfFloatType, format: THREE.RGBAFormat, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter }, rt;
  if (renderer.capabilities.isWebGL2 && THREE.WebGLMultisampleRenderTarget){ rt = new THREE.WebGLMultisampleRenderTarget(w, h, opt); rt.samples = LOWQ ? 2 : 4; }
  else rt = new THREE.WebGLRenderTarget(w, h, opt);
  POST.composer = new THREE.EffectComposer(renderer, rt);
  POST.render = new THREE.RenderPass(scene, camera);
  POST.bloom = new THREE.UnrealBloomPass(new THREE.Vector2(w, h), 0.4, 0.6, 0.9);
  POST.final = new THREE.ShaderPass(FINAL_SHADER);
  POST.composer.addPass(POST.render);
  POST.composer.addPass(POST.bloom);
  POST.composer.addPass(POST.final);
}
function applyPost(S){
  var P = S.post;
  POST.bloom.enabled = !!P.bloom;
  if (P.bloom){ POST.bloom.strength = P.bloom[0]; POST.bloom.radius = P.bloom[1]; POST.bloom.threshold = P.bloom[2]; }
  var F = POST.final.uniforms;
  F.exposure.value = P.exposure || 1; F.tone.value = P.tone || 0; F.con.value = P.con || 1; F.sat.value = P.sat === undefined ? 1 : P.sat; F.bright.value = P.bright || 0;
  F.lift.value.fromArray(P.lift || [0, 0, 0]); F.gam.value.fromArray(P.gamma || [1, 1, 1]); F.gain.value.fromArray(P.gain || [1, 1, 1]);
  F.shTint.value.fromArray(P.shTint || [0, 0, 0]); F.hiTint.value.fromArray(P.hiTint || [0, 0, 0]);
  F.vig.value = P.vig === undefined ? 0.3 : P.vig; var vc = new THREE.Color(P.vigCol || '#000000'); F.vigCol.value.set(vc.r, vc.g, vc.b); F.vigR.value.fromArray(P.vigR || [0.45, 1.1]);
  F.tilt.value = 0; F.edge.value = 0;
  F.post.value = 0; F.dith.value = 0; F.grain.value = P.grain || 0;
  resizeRender();
}
var VIEW = { w: 1, h: 1, off: 0, offT: 0 };   // off: pixels of screen covered by the bottom panel; the scene centres above it
function resizeRender(){
  var w = innerWidth, h = innerHeight, pr = Math.min(window.devicePixelRatio || 1, LOWQ ? 1.25 : 1.5);
  VIEW.w = w; VIEW.h = h;
  renderer.setPixelRatio(pr);
  renderer.setSize(w, h);
  POST.composer.setPixelRatio(pr);
  POST.composer.setSize(w, h);
  POST.final.uniforms.res.value.set(Math.floor(w * pr), Math.floor(h * pr));
  applyViewOffset();
}
function applyViewOffset(){
  var w = VIEW.w, h = VIEW.h, p = Math.max(0, Math.round(VIEW.off));
  if (p > 0){ camera.aspect = w / (h + p); camera.setViewOffset(w, h + p, 0, p, w, h); }
  else { camera.aspect = w / h; camera.clearViewOffset(); }
  camera.updateProjectionMatrix();
}
function renderFrame(){
  SKY.mesh.position.copy(camera.position);
  POST.composer.render();
}
/* ===================== 03 · the mint look ===================== */
var BASE_PAL = {
  // ground
  grass: '#5E8A3D', grass2: '#6C9444', grassDry: '#94965A', grassTip: '#A7BE66', grassBase: '#3F6430', forest: '#4B6833',
  soil: '#7E5C3C', dirt2: '#6E5036', path: '#AE8C62', pathEdge: '#8E7350', mud: '#5E4A33', sand: '#CDB585',
  rock: '#8A867D', rockD: '#64615A', rockL: '#ABA698', moss: '#5E7E38', cliff: '#857A6C', cliffD: '#5F574E', cliffL: '#A19484',
  water: '#3A7A88', waterDeep: '#1D4656', waterShallow: '#6E9E98', foam: '#EEF6F0',
  side1: '#4A3826', side2: '#6E5238', side3: '#8D7155', side4: '#6F6860', side5: '#8A8378', base: '#3A3129', roots: '#5A4330',
  tile: '#BFB5A2', tileD: '#958B78',
  // flora
  trunk: '#6B4A32', trunkD: '#46301F', bark2: '#E4DED2', barkMark: '#3A3633',
  pine: '#2F603C', pineD: '#22472E', pineL: '#4A7C4A',
  leaf: '#55803A', leafD: '#3A6030', leafL: '#7EA24B', leaf2: '#6B9140', leaf3: '#4D7A36',
  bush: '#4C7635', bushD: '#33552B', berry: '#B8332F',
  flowers: ['#F4ECD8', '#EBC94D', '#D0596E', '#9581CE', '#F09A5B', '#F4ECD8'], stem: '#5E8A3A',
  mush: '#B9402E', mushDot: '#F2E9DA', mushStem: '#E8DFCC', reed: '#7E8F4A', reedTop: '#6A4A2E', lily: '#4E8A45', lilyFlower: '#F2D3DF',
  fallen: ['#C9632A', '#E09A3A', '#A8432A', '#D8B04A'],
  // architecture
  stone: '#CDC2A8', stoneD: '#A0947C', stoneL: '#E0D7C2', stone2: '#BFB295', trim: '#9B8F78', mortar: '#8A7F6C',
  roof: '#2A5C66', roofD: '#1C434B', roofL: '#3A707A', roof2: '#8A3A2C', roof2D: '#6A2A21',
  wood: '#7A5536', woodD: '#4F3622', woodL: '#9C7450', plank: '#8B6644', plankD: '#6A4C32', plaster: '#E9DFC8', beam: '#4A3322',
  metal: '#5D6166', metalD: '#36393D', metalL: '#8D9298', gold: '#D6A640', rope: '#B79B6B', canvas: '#D8C9A8', canvasD: '#B9A784',
  cloth: '#8E2626', clothD: '#6A1C1F', cloth2: '#E2C46B', glass: '#FFC66E', windowD: '#2A211B',
  fire: '#FF7A22', fireHot: '#FFD27A', ember: '#FF9A3A', smoke: '#D9D4CC', crystal: '#7FD8FF', crystal2: '#C9A2FF', ore: '#D9A54A',
  // the war tortoise
  tSkin: '#5B7656', tSkinD: '#3F553D', tSkinL: '#7A9274', tBelly: '#BBA272', tBellyD: '#8E7A52',
  tShell: '#7E4A24', tShellD: '#4A2A14', tScute: '#9C5E2C', tScuteL: '#BC8044', tSeam: '#3A2010', tClaw: '#E9DFC6', tBeak: '#3B3830', tEye: '#16140F', tArmor: '#8C6A3B', tArmorL: '#B48A4E',
  // people
  skinT: ['#E6B894', '#D29E78', '#B57F5B', '#8E5C40'], hair: ['#3B2A1E', '#6A4A2C', '#A9773E', '#2A2522', '#7E7A75'], beardGrey: '#BDB6AA',
  team: '#2C548E', teamD: '#1C3A63', teamL: '#5C82B8', enemy: '#8E2A22', enemyD: '#561812',
  leather: '#7A5335', leatherD: '#4E3522', leatherL: '#9A7050', steel: '#A9AEB3', steelD: '#6B7075', steelL: '#D2D6DA',
  linen: '#D9CCB0', wool: '#8B6A4E', wool2: '#6E7A52', wool3: '#8E4E3A', robe: '#4B3F8F', robeD: '#2E275C', robeL: '#7A6CC0', boots: '#3E2C20',
  // creatures
  wolf: '#6E6A66', wolfD: '#45413E', wolfL: '#B7AFA4', wolfEye: '#FFC23A', ogre: '#7D8656', ogreD: '#56603B', ogreL: '#A0A877', ogreCloth: '#5A4632', tusk: '#E8DEC4', crow: '#26262A',
  // fx
  magic: '#A47CFF', magic2: '#6AD6FF', spark: '#FFD27A', arrow: '#8A6A44', fletch: '#E8E0D0', dust: '#C8B08A'
};
function pal(o){ return Object.assign({}, BASE_PAL, o || {}); }
var STYLES = [
  /* the mint valley: soft stylised light, painted ground, purple blight (after the five reference shots) */
  {
    id: 'mint', short: 'Мятная долина', name: 'Мятная долина',
    desc: 'Графика по пяти скринам: мятная трава с нарисованными пучками, лососевые тропы, фиолетовая порча на стороне врага, мягкий ровный свет и сиреневые тени. Контент — наш: черепаха-крепость, экипаж, волки, огр, лагерь, шахта.',
    ref: 'по 5 скринам',
    pal: pal({
      grass: '#30A07A', grass2: '#37A982', grassDry: '#4EAE80', grassTip: '#5CC08E', grassBase: '#24745C', forest: '#2B8C6C',
      soil: '#A97E6E', dirt2: '#9F7A6F', path: '#C8A08A', pathEdge: '#B08A7A', mud: '#7A6270', sand: '#D0AE96',
      rock: '#9F99B0', rockD: '#736A86', rockL: '#B8B3C8', moss: '#3F9E78', cliff: '#9A8AA4', cliffD: '#6E5E7C', cliffL: '#B8AEC4',
      water: '#36ACB0', waterDeep: '#217A96', waterShallow: '#5EC6B8', foam: '#D8F4EC',
      tile: '#CAC7D6', tileD: '#A6A2B6',
      blight: '#45204F', blightD: '#361644', blightL: '#552A64', blightRim: '#7A5A78', blightPath: '#6A4A64', rockBig: '#857790', rockBigL: '#A496AE',
      trunk: '#7C6C84', trunkD: '#5A4A64', bark2: '#DCD6E4', barkMark: '#5A4A64',
      pine: '#2A7C66', pineD: '#1F6052', pineL: '#44A486',
      leaf: '#2C8A6C', leafD: '#1E6652', leafL: '#4CAE86', leaf2: '#349476', leaf3: '#287E6A',
      bush: '#309072', bushD: '#22725C', berry: '#E85A72',
      flowers: ['#F4F0F8', '#F2C850', '#EE7A96'], stem: '#3E9A74',
      mush: '#EE7E3E', mushDot: '#FFE2C2', mushStem: '#F2E6DE', reed: '#4FA486', reedTop: '#9A5E4E', lily: '#3EA07E', lilyFlower: '#F8D8EA',
      stone: '#D4D2E0', stoneD: '#A8A4BC', stoneL: '#EAE8F2', stone2: '#C4C0D4', trim: '#9894B0', mortar: '#8C88A2',
      roof: '#3A8EA6', roofD: '#2B6E88', roofL: '#58AAC0', roof2: '#E2694E', roof2D: '#B84A3A',
      wood: '#AA6C50', woodD: '#7C4C40', woodL: '#CC8E66', plank: '#BA7C58', plankD: '#905C48', plaster: '#F2EAE4', beam: '#6C4238',
      metal: '#62587A', metalD: '#443A54', metalL: '#948CA8', gold: '#F2C04A', rope: '#D6B88E', canvas: '#F2E8DA', canvasD: '#D6C6B2',
      cloth: '#EC7A3C', clothD: '#BA542C', cloth2: '#F6CC4C', glass: '#FFD47C', windowD: '#3E2C44',
      fire: '#FF7C2C', fireHot: '#FFD67C', ember: '#FF9C4C', smoke: '#ECE8F2', crystal: '#7CEBFF', crystal2: '#D88CFF', ore: '#F2B84A',
      tSkin: '#ACA26C', tSkinD: '#807A4C', tSkinL: '#CAC088', tBelly: '#E4CA9C', tBellyD: '#BAA074',
      tShell: '#CA6A3E', tShellD: '#8C402C', tScute: '#E08C50', tScuteL: '#F4B06C', tSeam: '#6C3024', tClaw: '#F2E8DA', tBeak: '#5C4C44', tEye: '#1E1622', tArmor: '#62587A', tArmorL: '#948CA8',
      skinT: ['#F2C8A8', '#E2AE8A', '#C88E6C', '#9C664A'], hair: ['#4C3628', '#7C5434', '#CA8A4C', '#30282E', '#E8DACA'], beardGrey: '#E2DCE6',
      team: '#3A78DA', teamD: '#2A58AA', teamL: '#6C9CEC', enemy: '#9A40B4', enemyD: '#62267A',
      leather: '#9C6C4C', leatherD: '#6C4838', leatherL: '#BA8C66', steel: '#CACCDA', steelD: '#9092A8', steelL: '#ECEEF6',
      linen: '#F2E8DA', wool: '#B27C5C', wool2: '#4E9C7E', wool3: '#CA623E', robe: '#5C4CBA', robeD: '#3C3088', robeL: '#8C7CE2', boots: '#4C3C44',
      wolf: '#62567A', wolfD: '#40364F', wolfL: '#AEA0C6', wolfEye: '#FF4AD2', ogre: '#7E6CA2', ogreD: '#56466E', ogreL: '#A090C0', ogreCloth: '#4C3C56', tusk: '#F4EADC', crow: '#30283A',
      magic: '#C66CFF', magic2: '#6CF2FF', spark: '#FFD67C', arrow: '#AA6C50', fletch: '#F2E8E2', dust: '#DABAA6',
      btrunk: '#4E3E5A', btrunkD: '#382A44', bleaf: '#56307A', bleafD: '#3C2056', bleafL: '#8058AA',
      swordA: '#3A9E84', swordB: '#9AE2C6', spikeA: '#C8407C', spikeB: '#F489B6', spikeGA: '#B09A36', spikeGB: '#E8D660', broadA: '#8A50C0', broadB: '#C49AEC', puff: '#F6F4FA', mushTop: '#FFA866',
      tuftTeal: ['#2C9670', '#319C76', '#2A8E6C'], tuftGold: ['#D6B04A', '#E0C25C', '#C9A242', '#D2B052'], tuftViolet: ['#8C5AC8', '#7E4CB8', '#9868D2', '#7448AE'], tuftMauve: ['#B27CAA', '#A46EA0', '#BE8AB4']
    }),
    shape: { round: 1.25, segK: 1.15, facet: false, tree: ['mint', 'mintTall', 'mint'], rock: 'mint', grass: null, human: 'hero', ground: 'open', flowers: 0, mush: 0, leaves: 0, pebbles: 140, bushes: 40, mint: true, stamps: true, spores: 70, treeK: 0.68, noCrows: true },
    mat: { type: 'std', env: 0, noEnv: true, glowK: 1.6, leafWind: 0.035, leafDouble: true, metalM: 0.12, metalR: 0.6, goldM: 0.2, aoK: 0.26, waterR: 0.4, waterLines: 0.22, foamW: 0.08, waterSpec: 0.3 },
    light: { az: -128, el: 50, shade: '#DAB5D7', gnd: '#C2A8C6', sunK: 0.94, points: 0.6, pcf: 2.5, shadowSize: 40 },
    sky: { top: '#86BCE6', mid: '#E4ECF0', bot: '#CCD6DE', sunAmt: 0.2, cloud: 0.25, cloudCol: '#FFFFFF', cloudShade: '#D6DCEC', cloudY: -0.02 },
    fog: { col: '#CFE2DC', near: 120, far: 300 },
    post: { exposure: 1.0, tone: 2, con: 0.97, sat: 1.0, bloom: [0.22, 0.5, 0.97], vig: 0.14, vigCol: '#2A1838', grain: 0.008, lift: [0.01, 0.012, 0.02] },
    cam: { fov: 36, pitch: 0.98, dist: 74, yaw: 0.0 }
  },
];
/* ===================== 04 · the battlefield: layout, heights, ground paint, water ===================== */
var WL = -0.55;                 // brook and pond level
var FIELD_DX = 4.6;             // each castle has its battle meadow just east of it
var FIELD_R = 2.9;
// the five castles, west to east; the camera looks from the Valley's side (south, +z)
var CASTLES = [
  { id: 0, key: 'watch',   name: 'Сторожка', value: 1, x: -24.0, z: 0, padY: 0.35, padR: 2.8 },
  { id: 1, key: 'mill',    name: 'Мельница', value: 2, x: -13.5, z: 0, padY: 0.22, padR: 3.0 },
  { id: 2, key: 'citadel', name: 'Цитадель', value: 3, x: -2.25, z: 0, padY: 0.7,  padR: 3.5 },
  { id: 3, key: 'mine',    name: 'Рудник',   value: 2, x: 9.0,   z: 0, padY: 0.3,  padR: 3.0 },
  { id: 4, key: 'outpost', name: 'Застава',  value: 1, x: 20.25, z: 0, padY: 0.22, padR: 2.9 }
];
CASTLES.forEach(function(c){ c.fx = c.x + FIELD_DX; c.fz = c.z; c.zx = c.x + FIELD_DX * 0.5; c.zz = c.z; c.zr = 6.7; });
// player 1 = the Valley (south), player 2 = the Blight (north)
function sideOf(p){ return p === 1 ? 1 : -1; }
var CAMP = [null, { x: 0, z: 19.6 }, { x: 0, z: -19.6 }];
var MUSTER = [null, { x: 0, z: 15.6, hw: 12.6, hd: 2.7 }, { x: 0, z: -15.6, hw: 12.6, hd: 2.7 }];
function squadSpot(p, i){ return { x: -10 + 5 * i, z: 13.0 * sideOf(p) }; }
function reserveSpot(p){ return { x: 0, z: 16.6 * sideOf(p) }; }

/* ---------- roads: from each camp's squad spot to each castle's meadow ---------- */
var ROADS = { 1: [], 2: [] };
var BROOK = chaikin([[-47, -38], [-42, -27], [-38.2, -16], [-35.8, -7], [-34.6, 1.5], [-33.0, 7.6], [-31.4, 11.0]], 3);
var POND = { x: -30.2, z: 13.4, rx: 4.3, rz: 2.8 };
function buildRoads(){
  [1, 2].forEach(function(p){
    var s = sideOf(p);
    ROADS[p] = CASTLES.map(function(c, i){
      var a = squadSpot(p, i), fx = c.fx, fz = c.fz;
      var pts = [[a.x, a.z + s * 0.6], [a.x + (fx - a.x) * 0.1, a.z - s * 2.4], [a.x + (fx - a.x) * 0.62, fz + s * 6.4], [fx, fz + s * 3.8], [fx, fz + s * 0.6]];
      var out = chaikin(pts, 3);
      out[out.length - 1] = [fx, fz + s * 0.6];
      return out;
    });
  });
}
// road distance field on a grid: cheap lookups for heights, paint and placement
var RDF = { x0: -44, z0: -36, res: 0.25, nx: 0, nz: 0, d: null };
function buildRoadField(){
  var R = RDF; R.nx = Math.round(88 / R.res) + 1; R.nz = Math.round(72 / R.res) + 1;
  R.d = new Float32Array(R.nx * R.nz).fill(99);
  var lists = ROADS[1].concat(ROADS[2]);
  lists.forEach(function(pts){
    for (var s = 0; s < pts.length - 1; s++){
      var ax = pts[s][0], az = pts[s][1], bx = pts[s + 1][0], bz = pts[s + 1][1], m = 4.5;
      var i0 = Math.max(0, Math.floor((Math.min(ax, bx) - m - R.x0) / R.res)), i1 = Math.min(R.nx - 1, Math.ceil((Math.max(ax, bx) + m - R.x0) / R.res));
      var j0 = Math.max(0, Math.floor((Math.min(az, bz) - m - R.z0) / R.res)), j1 = Math.min(R.nz - 1, Math.ceil((Math.max(az, bz) + m - R.z0) / R.res));
      for (var j = j0; j <= j1; j++) for (var i = i0; i <= i1; i++){
        var d = segDist(R.x0 + i * R.res, R.z0 + j * R.res, ax, az, bx, bz), k = j * R.nx + i;
        if (d < R.d[k]) R.d[k] = d;
      }
    }
  });
}
function pathD(x, z){
  var R = RDF, fx = (x - R.x0) / R.res, fz = (z - R.z0) / R.res;
  if (fx < 0 || fz < 0 || fx > R.nx - 1 || fz > R.nz - 1) return 99;
  var i = Math.min(R.nx - 2, Math.floor(fx)), j = Math.min(R.nz - 2, Math.floor(fz)), u = fx - i, v = fz - j, a = R.d[j * R.nx + i], b = R.d[j * R.nx + i + 1], c = R.d[(j + 1) * R.nx + i], d = R.d[(j + 1) * R.nx + i + 1];
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function brookD(x, z){ return polyDistT(x, z, BROOK)[0]; }

/* ---------- masks ---------- */
function sdRoundRect(x, z, hw, hd, r){ var qx = Math.abs(x) - hw + r, qz = Math.abs(z) - hd + r; return Math.min(Math.max(qx, qz), 0) + hyp(Math.max(qx, 0), Math.max(qz, 0)) - r; }
function musterSD(x, z, p){ var M = MUSTER[p]; return sdRoundRect(x - M.x, z - M.z, M.hw, M.hd, 2.2); }
function campSD(x, z, p){ var C = CAMP[p]; return sdRoundRect(x - C.x, z - (C.z + sideOf(p) * 2.0), 14.5, 4.6, 2.5); }
// trampled ground: the musters in the camps and the battle meadows
function trampleK(x, z){
  var n = (vnoise(x * 0.7, z * 0.7, 211) - 0.5) * 0.9, k = 0;
  for (var p = 1; p <= 2; p++){ var d = musterSD(x, z, p) + n; if (d < 1.2) k = Math.max(k, 1 - smooth(-0.6, 1.2, d)); }
  for (var i = 0; i < CASTLES.length; i++){ var c = CASTLES[i], df = hyp(x - c.fx, z - c.fz) + n; if (df < FIELD_R + 1.2) k = Math.max(k, (1 - smooth(FIELD_R - 0.8, FIELD_R + 1.0, df)) * 0.85); }
  return k;
}
function forestK(x, z){
  var k = smooth(-27.5, -33, x) + smooth(27.5, 33, x);
  k += smooth(16, 22, Math.abs(x)) * smooth(18, 23, Math.abs(z)) * 0.8;
  return clamp(k, 0, 1);
}
function openOut(x, z){ return sdRoundRect(x, z, 36, 27.5, 7); }
function openHills(x, z){
  var od = openOut(x, z); if (od <= 0) return 0;
  var rise = smooth(0, 34, od), lump = fbm(x * 0.035 + 11, z * 0.035 - 7, 161);
  var h = rise * (2.4 + lump * 8.0) + (fbm(x * 0.09, z * 0.09, 163) - 0.5) * 1.4 * smooth(0, 8, od);
  var brook = 1 - smooth(3, 14, brookD(x, z));
  var south = smooth(20, 44, z);
  return h * (1 - brook * 0.92) * (1 - south * 0.55);
}
function outerForestK(x, z){
  var od = openOut(x, z); if (od <= 0) return 0;
  return smooth(0, 6, od) * smooth(0.36, 0.55, fbm(x * 0.045 + 3, z * 0.045 + 8, 151)) * (1 - smooth(26, 44, z) * 0.6);
}
// the fixed blight around the Blight's own camp (trees and plants there are corrupted)
function staticBlight(x, z){
  var n = (fbm(x * 0.2, z * 0.2, 131) - 0.5) * 3, d = Math.min(hyp(x + 7.5, z - CAMP[2].z + 1.2), hyp(x - 7.5, z - CAMP[2].z + 1.2)) + n;
  return smooth(10.5, 6.8, d);
}

/* ---------- height field ---------- */
var TER = { x0: -46, z0: -38, res: 0.28, nx: 0, nz: 0, h: null, occ: [] };
function rawHeight(x, z){
  var h = (fbm(x * 0.05 + 3.1, z * 0.05 - 1.7, 11) - 0.5) * 1.5 + (fbm(x * 0.19, z * 0.19, 17) - 0.5) * 0.26;
  // soft knolls in the meadows between the roads
  h += 0.85 * Math.exp(-((x + 15.5) * (x + 15.5) + (z - 8.2) * (z - 8.2)) / 9);
  h += 0.85 * Math.exp(-((x - 15.5) * (x - 15.5) + (z + 8.2) * (z + 8.2)) / 9);
  h += 0.6 * Math.exp(-((x - 21) * (x - 21) + (z - 9.5) * (z - 9.5)) / 8);
  h += 0.6 * Math.exp(-((x + 21) * (x + 21) + (z + 9.5) * (z + 9.5)) / 8);
  h -= 0.3 * Math.exp(-((x - 6) * (x - 6) + (z - 7) * (z - 7)) / 20);
  return h;
}
function shapeHeight(x, z){
  var h = rawHeight(x, z), i;
  var pd = pathD(x, z);
  h = lerp(h, h * 0.35, 1 - smooth(1.0, 3.0, pd)) - 0.06 * (1 - smooth(0.7, 1.5, pd));
  for (i = 0; i < CASTLES.length; i++){
    var c = CASTLES[i];
    var d = hyp(x - c.x, z - c.z); if (d < c.padR + 3) h = lerp(h, c.padY, 1 - smooth(c.padR, c.padR + 2.6, d));
    var df = hyp(x - c.fx, z - c.fz); if (df < 5) h = lerp(h, 0.12, 1 - smooth(2.7, 4.4, df));
  }
  for (var p = 1; p <= 2; p++){ var cs = campSD(x, z, p); if (cs < 3) h = lerp(h, 0.12, 1 - smooth(0, 3, cs)); }
  // brook and pond
  var bd = polyDistT(x, z, BROOK), bed = WL - 0.5 - 0.25 * (1 - bd[1]);
  h = Math.min(h, lerp(bed, h + 0.2, smooth(0.5, 2.3, bd[0])));
  var e = Math.sqrt(Math.pow((x - POND.x) / POND.rx, 2) + Math.pow((z - POND.z) / POND.rz, 2)) + (fbm(x * 0.4, z * 0.4, 33) - 0.5) * 0.18;
  h = Math.min(h, lerp(WL - 1.0, h + 0.1, smooth(0.62, 1.18, e)));
  h += openHills(x, z);
  return h;
}
function buildHeights(){
  var r = TER.res;
  TER.nx = Math.round(92 / r) + 1; TER.nz = Math.round(76 / r) + 1;
  TER.h = new Float32Array(TER.nx * TER.nz);
  for (var j = 0; j < TER.nz; j++) for (var i = 0; i < TER.nx; i++) TER.h[j * TER.nx + i] = shapeHeight(TER.x0 + i * r, TER.z0 + j * r);
}
function groundY(x, z){
  var fx = (x - TER.x0) / TER.res, fz = (z - TER.z0) / TER.res;
  if (fx < 0 || fz < 0 || fx > TER.nx - 1 || fz > TER.nz - 1) return shapeHeight(x, z);
  var i = Math.min(TER.nx - 2, Math.floor(fx)), j = Math.min(TER.nz - 2, Math.floor(fz)), u = fx - i, v = fz - j;
  var a = TER.h[j * TER.nx + i], b = TER.h[j * TER.nx + i + 1], c = TER.h[(j + 1) * TER.nx + i], d = TER.h[(j + 1) * TER.nx + i + 1];
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function groundN(x, z){ var e = 0.3, hx = groundY(x + e, z) - groundY(x - e, z), hz = groundY(x, z + e) - groundY(x, z - e); return new V3(-hx, 2 * e, -hz).normalize(); }
function slopeAt(x, z){ return 1 - groundN(x, z).y; }
function inWater(x, z, m){ return groundY(x, z) < WL + (m || 0); }

/* ---------- ground paint ---------- */
function addOcc(x, z, r, k){ TER.occ.push([x, z, r, k]); }
var OCCG = null;  // occlusion splats binned on a coarse grid
function occAt(x, z){
  if (!OCCG) return 1;
  var gi = Math.floor((x + 120) / 6), gj = Math.floor((z + 120) / 6), cell = OCCG[gi + ',' + gj]; if (!cell) return 1;
  var f = 1;
  for (var i = 0; i < cell.length; i++){ var o = cell[i], dx = x - o[0], dz = z - o[1]; if (Math.abs(dx) > o[2] * 1.3 || Math.abs(dz) > o[2] * 1.3) continue; var d = Math.sqrt(dx * dx + dz * dz); if (d < o[2] * 1.3) f *= 1 - o[3] * (1 - smooth(o[2] * 0.25, o[2] * 1.3, d)); }
  return f;
}
function binOcc(){
  OCCG = {};
  TER.occ.forEach(function(o){
    var r = o[2] * 1.3, i0 = Math.floor((o[0] - r + 120) / 6), i1 = Math.floor((o[0] + r + 120) / 6), j0 = Math.floor((o[1] - r + 120) / 6), j1 = Math.floor((o[1] + r + 120) / 6);
    for (var i = i0; i <= i1; i++) for (var j = j0; j <= j1; j++){ var key = i + ',' + j; (OCCG[key] || (OCCG[key] = [])).push(o); }
  });
}
var _GP = [1, 0, 1, 0], _ROAD = 0;
function terrainColor(x, z, y, ny){
  var n1 = fbm(x * 0.085, z * 0.085, 5), n2 = vnoise(x * 0.5, z * 0.5, 7), n3 = fbm(x * 0.05 + 9, z * 0.05, 3);
  var c = linC('grass').lerp(linC('grass2'), smooth(0.32, 0.7, n1));
  c.lerp(linC('grassDry'), smooth(0.64, 0.84, n3) * 0.5);
  c.lerp(linC('forest'), Math.max(forestK(x, z), outerForestK(x, z)) * 0.6);
  c.multiplyScalar(1 + (n2 - 0.5) * 0.1);
  var g = 1, road = 0;
  // trampled musters and battle meadows
  var tr = trampleK(x, z);
  if (tr > 0.001){
    var tc = linC('path').lerp(linC('pathEdge'), 0.45 + (vnoise(x * 1.3, z * 1.3, 67) - 0.5) * 0.7);
    c.lerp(tc, tr * 0.72); g *= 1 - tr * 0.8; road = Math.max(road, tr * 0.75);
  }
  // roads: salmon dirt with a soft painted edge
  var pd = pathD(x, z), edge = 0.95 + (vnoise(x * 0.9, z * 0.9, 61) - 0.5) * 0.45 + (fbm(x * 0.25, z * 0.25, 63) - 0.5) * 0.5;
  if (pd < edge + 0.9){
    var pc = linC('path').lerp(linC('pathEdge'), smooth(0.2, edge + 0.2, pd) * 0.6);
    var rk = 1 - smooth(edge - 0.5, edge + 0.6, pd);
    c.lerp(pc, rk); road = Math.max(road, rk);
  }
  g *= smooth(edge - 0.6, edge + 0.4, pd);
  // banks and the brook bed
  if (y < WL + 0.5){ var bkk = smooth(WL + 0.5, WL + 0.08, y); c.lerp(linC(y < WL - 0.05 ? 'mud' : 'sand'), bkk * 0.9); g *= 1 - bkk; }
  // steep faces: lilac rock with soft strata
  var sl = 1 - ny;
  if (sl > 0.16){
    var band = (Math.sin(y * 4.2 + fbm(x * 0.35, z * 0.35, 81) * 4) + 1) * 0.5, rkk = smooth(0.16, 0.4, sl);
    c.lerp(linC('cliff').lerp(band > 0.5 ? linC('cliffL') : linC('cliffD'), Math.abs(band - 0.5) * 0.9), rkk);
    g *= 1 - rkk;
  }
  c.multiplyScalar(lerp(1, occAt(x, z), 0.8));
  _GP[0] = g; _GP[1] = 0; _GP[2] = 1; _GP[3] = smooth(0.4, 0.6, fbm(x * 0.06 + 7, z * 0.06 - 3, 171));
  _ROAD = road;
  return c;
}
function grassMaskAt(x, z){ var y = groundY(x, z); terrainColor(x, z, y, groundN(x, z).y); return _GP[0]; }

/* ---------- the ground mesh: a fine grid over the play area inside a coarse one out to the hills ---------- */
function buildTerrain(){
  var grp = new THREE.Group();
  var core = terrainGrid(-44, 44, -36, 36, LOWQ ? 0.36 : 0.28, null); core.castShadow = true; grp.add(core);
  grp.add(terrainGrid(-120, 120, -120, 76, 2.0, [-44, 44, -36, 36]));
  return grp;
}
function terrainGrid(x0, x1, z0, z1, res, hole){
  var nx = Math.round((x1 - x0) / res) + 1, nz = Math.round((z1 - z0) / res) + 1, n = nx * nz, i, j, e = 0.5;
  res = (x1 - x0) / (nx - 1); var resZ = (z1 - z0) / (nz - 1);
  var P = new Float32Array(n * 3), N = new Float32Array(n * 3), C = new Float32Array(n * 3), G = new Float32Array(n * 4), RD = new Float32Array(n), I = [];
  for (j = 0; j < nz; j++) for (i = 0; i < nx; i++){
    var x = x0 + i * res, z = z0 + j * resZ, v = j * nx + i, y;
    if (!hole && (i === 0 || j === 0 || i === nx - 1 || j === nz - 1)){
      // the rim of the fine grid follows the straight edges of the coarse grid around it (no cracks)
      if (i === 0 || i === nx - 1){ var za = Math.floor((z + 120) / 2 + 1e-6) * 2 - 120; y = lerp(groundY(x, za), groundY(x, za + 2), (z - za) / 2); }
      else { var xa = Math.floor((x + 120) / 2 + 1e-6) * 2 - 120; y = lerp(groundY(xa, z), groundY(xa + 2, z), (x - xa) / 2); }
    } else y = groundY(x, z);
    var hx = groundY(x + e, z) - groundY(x - e, z), hz = groundY(x, z + e) - groundY(x, z - e), nl = Math.sqrt(hx * hx + 4 * e * e + hz * hz);
    P[v * 3] = x; P[v * 3 + 1] = y; P[v * 3 + 2] = z;
    N[v * 3] = -hx / nl; N[v * 3 + 1] = 2 * e / nl; N[v * 3 + 2] = -hz / nl;
    var c = terrainColor(x, z, y, 2 * e / nl);
    C[v * 3] = c.r; C[v * 3 + 1] = c.g; C[v * 3 + 2] = c.b;
    G[v * 4] = _GP[0]; G[v * 4 + 1] = _GP[1]; G[v * 4 + 2] = 1; G[v * 4 + 3] = _GP[3];
    RD[v] = _ROAD;
  }
  for (j = 0; j < nz - 1; j++) for (i = 0; i < nx - 1; i++){
    if (hole){ var cx = x0 + (i + 0.5) * res, cz = z0 + (j + 0.5) * resZ; if (cx > hole[0] && cx < hole[1] && cz > hole[2] && cz < hole[3]) continue; }
    var a = j * nx + i, b = a + 1, c2 = a + nx, d = c2 + 1;
    I.push(a, c2, b, b, c2, d);
  }
  var geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(P, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(N, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(C, 3));
  geo.setAttribute('gpaint', new THREE.BufferAttribute(G, 4));
  geo.setAttribute('aRoad', new THREE.BufferAttribute(RD, 1));
  geo.setIndex(n > 65535 ? new THREE.Uint32BufferAttribute(I, 1) : new THREE.Uint16BufferAttribute(I, 1));
  geo.computeBoundingSphere();
  var mesh = new THREE.Mesh(geo, MATS.ground); mesh.receiveShadow = true; mesh.castShadow = false; mesh.name = hole ? 'terrainOuter' : 'terrain';
  return mesh;
}

/* ---------- water: the brook down the west side and its pond ---------- */
function buildWater(){
  var res = 0.35, x0 = -50, x1 = -24, z0 = -44, z1 = 18, nx = Math.ceil((x1 - x0) / res), nz = Math.ceil((z1 - z0) / res), P = [], D = [], I = [], idx = {}, i, j;
  function vid(i, j){ var k = i + ',' + j; if (idx[k] !== undefined) return idx[k]; var x = x0 + i * res, z = z0 + j * res; idx[k] = P.length / 3; P.push(x, WL, z); D.push(WL - groundY(x, z)); return idx[k]; }
  for (j = 0; j < nz; j++) for (i = 0; i < nx; i++){
    var xa = x0 + i * res, za = z0 + j * res;
    var wet = Math.min(groundY(xa, za), groundY(xa + res, za), groundY(xa, za + res), groundY(xa + res, za + res)) < WL + 0.02;
    if (!wet) continue;
    var a = vid(i, j), b = vid(i + 1, j), c = vid(i, j + 1), d = vid(i + 1, j + 1);
    I.push(a, c, b, b, c, d);
  }
  var geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  geo.setAttribute('depth', new THREE.Float32BufferAttribute(D, 1));
  geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(P.length).fill(1), 3));
  var nrm = new Float32Array(P.length); for (i = 0; i < nrm.length; i += 3) nrm[i + 1] = 1; geo.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  geo.setIndex(I);
  var mesh = new THREE.Mesh(geo, waterMaterial()); mesh.renderOrder = 2; mesh.receiveShadow = true; mesh.name = 'water';
  return mesh;
}
/* ===================== 05 · nature: mint trees, blight trees, rocks, accent plants, finger tufts ===================== */
function F(){ return SHAPE.facet; }
function lw(){ return STYLE.mat.leafWind === undefined ? 0.05 : STYLE.mat.leafWind; }
function lean(){ return (rnd() - 0.5) * 0.08; }
var BLOCK = [];  // circles where ground cover should not grow: [x, z, r]
function blocked(x, z){ for (var i = 0; i < BLOCK.length; i++){ var b = BLOCK[i]; if (Math.abs(x - b[0]) < b[2] && Math.abs(z - b[1]) < b[2] && hyp(x - b[0], z - b[1]) < b[2]) return true; } return false; }
function mossCfn(amt){
  var moss = linC('moss');
  return function(r, g, b, x, y, z, nx, ny, nz){
    var m = smooth(0.45, 0.8, ny + (vnoise(x * 3, z * 3, 3) - 0.5) * 0.5) * amt;
    return [r + (moss.r - r) * m, g + (moss.g - g) * m, b + (moss.b - b) * m];
  };
}
function treeMint(k, x, z, s, o){
  o = o || {};
  var y = groundY(x, z), lod = !!o.lod, H = rr(2.6, 3.4), R = rr(1.7, 2.1), bx = rr(-0.3, 0.3), bz = rr(-0.3, 0.3);
  k.push({ x: x, y: y, z: z, ry: rnd() * TAU, s: s });
  // a softly bent lilac trunk with a flared foot
  k.tube([new V3(0, -0.15, 0), new V3(bx * 0.35, H * 0.5, bz * 0.35), new V3(bx, H + 0.25, bz)], 0.3, 0.16, 'trunkD', { ts: lod ? 4 : 7, rs: lod ? 6 : 9, mat: 'wood', c2: 'trunk' });
  if (!lod) for (var q = 0; q < 4; q++){ var ra = q / 4 * TAU + rnd() * 0.6; k.tube([new V3(0, 0.42, 0), new V3(Math.cos(ra) * 0.36, 0.12, Math.sin(ra) * 0.36), new V3(Math.cos(ra) * 0.62, -0.06, Math.sin(ra) * 0.62)], 0.14, 0.05, 'trunkD', { ts: 3, rs: 5, mat: 'wood' }); }
  // the crown: a dome of soft lumps, darker underneath, sunlit on top
  var cx = bx, cy = H + R * 0.42, cz = bz, n = lod ? 4 : ri(6, 8), a0 = rnd() * TAU, base = pick(['leaf', 'leaf', 'leaf2', 'leaf3']);
  var lumps = [[0, R * 0.32, 0, R * 0.64]];
  for (var i = 1; i < n; i++){ var a = a0 + i / (n - 1) * TAU + rr(-0.25, 0.25), d = R * rr(0.56, 0.7); lumps.push([Math.cos(a) * d, rr(-0.12, 0.12) * R, Math.sin(a) * d, R * rr(0.46, 0.6)]); }
  if (!lod) for (var u = 0; u < 2; u++){ var a2 = rnd() * TAU; lumps.push([Math.cos(a2) * R * 0.3, R * rr(0.5, 0.62), Math.sin(a2) * R * 0.3, R * rr(0.36, 0.46)]); }
  lumps.forEach(function(l, i){
    var hk = clamp((l[1] + R * 0.2) / (R * 0.85), 0, 1);
    if (!lod && i > 0 && i < n) k.tube([new V3(bx * 0.9, H * 0.92, bz * 0.9), new V3(cx + l[0] * 0.55, cy + l[1] - l[3] * 0.4, cz + l[2] * 0.55)], 0.08, 0.05, 'trunk', { ts: 2, rs: 5, mat: 'wood' });
    k.blob(l[3], mixHex('leafD', base, 0.45 + hk * 0.5), { x: cx + l[0], y: cy + l[1], z: cz + l[2], d: lod ? 1 : 2, amt: 0.1, freq: 1.2, seed: rr(0, 80), sy: 0.9, mat: 'leaf', org: true, c2: hk > 0.45 ? 'leafL' : base, wind: lw() * 0.6 });
  });
  k.pop();
  addOcc(x, z, R * 1.3 * s, 0.34);
  return (H + R * 1.6) * s;
}
function treeMintTall(k, x, z, s, o){
  o = o || {};
  var y = groundY(x, z), lod = !!o.lod;
  k.push({ x: x, y: y, z: z, ry: rnd() * TAU, s: s, rx: lean() * 0.5, rz: lean() * 0.5 });
  k.lathe([[0.32, -0.1], [0.22, 0.2], [0.16, 1.2], [0.001, 1.5]], 'trunkD', { n: 8, mat: 'wood', c2: 'trunk' });
  var parts = [[1.15, 1.75], [0.98, 2.95], [0.72, 3.95], [0.42, 4.65]];
  parts.forEach(function(p, i){
    k.blob(p[0], mixHex('pineD', 'pine', rr(0.4, 0.9)), { y: p[1], sy: 1.25, d: lod ? 1 : 2, amt: 0.14, freq: 1.6, seed: rr(0, 90), mat: 'leaf', org: true, c2: 'pineL', wind: lw() * (0.4 + i * 0.25) });
  });
  k.pop();
  addOcc(x, z, 1.5 * s, 0.32);
  return 5.2 * s;
}
// corrupted tree in the blight: a dead, twisted lilac-black tree with clawing boughs, a few withered violet tufts and glowing drips
function treeBlight(k, x, z, s, o){
  o = o || {};
  var y = groundY(x, z), H = rr(2.6, 3.6), lod = !!o.lod, tw = rr(0.5, 0.9) * (chance(0.5) ? 1 : -1), pts = [], leafy = chance(0.35);
  k.push({ x: x, y: y, z: z, ry: rnd() * TAU, s: s });
  for (var i = 0; i <= 4; i++){ var f = i / 4; pts.push(new V3(Math.sin(f * 2.6 * tw) * 0.5 * f, f * H - 0.1, Math.cos(f * 2.6 * tw) * 0.32 * f - 0.18 * f)); }
  k.tube(pts, 0.32, 0.09, 'btrunk', { ts: lod ? 5 : 9, rs: 7, mat: 'wood', c2: 'btrunkD' });
  if (!lod) for (var q = 0; q < 4; q++){ var ra = q / 4 * TAU + 0.4; k.tube([new V3(0, 0.42, 0), new V3(Math.cos(ra) * 0.48, 0.08, Math.sin(ra) * 0.48), new V3(Math.cos(ra) * 0.92, -0.05, Math.sin(ra) * 0.92)], 0.15, 0.04, 'btrunkD', { ts: 4, rs: 5, mat: 'wood' }); }
  var tips = [];
  function bough(p, dir, len, r, d){
    var e = p.clone().add(dir.clone().multiplyScalar(len)), m = p.clone().lerp(e, 0.5).add(new V3(rr(-0.15, 0.15), rr(0.0, 0.18), rr(-0.15, 0.15)));
    k.tube([p, m, e], r, r * 0.5, 'btrunk', { ts: lod ? 2 : 4, rs: 5, mat: 'wood' });
    if (d >= (lod ? 1 : 2) || len < 0.35){ tips.push(e); return; }
    for (var c = 0; c < 2; c++){ var nd = dir.clone().add(new V3(rr(-0.8, 0.8), rr(-0.1, 0.45), rr(-0.8, 0.8))).normalize(); bough(e, nd, len * 0.62, r * 0.55, d + 1); }
  }
  var nb = ri(3, 4);
  for (var b = 0; b < nb; b++){ var a = b / nb * TAU + rnd() * 0.7, by = H * rr(0.55, 0.95), st = pts[Math.min(4, Math.round(by / H * 4))]; bough(new V3(st.x, by, st.z), new V3(Math.cos(a), rr(0.25, 0.7), Math.sin(a)).normalize(), rr(1.0, 1.5), 0.1, 0); }
  tips.forEach(function(t, i){
    if (leafy && i % 2 === 0){ var r = rr(0.32, 0.5); k.blob(r, mixHex('bleafD', 'bleaf', rr(0.4, 1)), { x: t.x, y: t.y + r * 0.2, z: t.z, sy: 0.7, d: 1, amt: 0.22, freq: 1.6, seed: rr(0, 90), mat: 'leaf', org: true, c2: 'bleafL', wind: lw() * 0.6 }); }
    else if (!lod && i % 3 === 0) k.cone(0.06, rr(0.22, 0.38), 'crystal2', { x: t.x, y: t.y + 0.12, z: t.z, rx: rr(-0.4, 0.4), rz: rr(-0.4, 0.4), n: 5, nfix: true, flat: true, mat: 'glow', e: 1.5 });
  });
  if (!lod) for (var t2 = 0; t2 < 4; t2++){ var tp = tips[(t2 * 3) % tips.length], hx = tp.x, hz = tp.z, hy = tp.y - 0.05, L2 = rr(0.4, 0.9); k.tube([new V3(hx, hy, hz), new V3(hx + rr(-0.08, 0.08), hy - L2 * 0.5, hz + rr(-0.08, 0.08)), new V3(hx + rr(-0.12, 0.12), hy - L2, hz + rr(-0.12, 0.12))], 0.025, 0.012, 'bleafD', { ts: 4, rs: 4, mat: 'leaf', wind: lw() }); k.ball(0.055, 'crystal2', { x: hx, y: hy - L2 - 0.03, z: hz, n: 6, m: 5, mat: 'glow', e: 1.6 }); }
  k.pop();
  addOcc(x, z, 1.6 * s, 0.3);
}
/* ---------- rocks: chunky low-poly lilac boulders and flat slabs ---------- */
function rockMint(k, x, z, s, o){
  o = o || {};
  var y = groundY(x, z) - 0.12 * s, slab = o.slab !== undefined ? o.slab : chance(0.3), big = !slab && s > 0.85;
  k.push({ x: x, y: y, z: z, ry: rnd() * TAU, s: s });
  k.blob(1, o.col || (big ? mixHex('rockBig', 'rockD', rr(0, 0.35)) : chance(0.3) ? mixHex('rockD', 'rock', 0.5) : 'rock'), { y: slab ? 0.1 : 0.3, d: 1, amt: 0.2, freq: 0.75, seed: rr(0, 99), sx: rr(1.0, 1.5), sy: slab ? rr(0.26, 0.38) : rr(0.62, 0.86), sz: rr(0.9, 1.2), fb: 0.3, mat: 'stone', flat: true, fj: 0.025, c2: big ? 'rockBigL' : 'rockL', j: 0.02 });
  k.pop();
  addOcc(x, z, 1.2 * s, 0.3);
}
function leafGeo(len, wid, bend, round){
  var s = new THREE.Shape();
  s.moveTo(-wid * 0.22, 0);
  if (round){ s.quadraticCurveTo(-wid * 1.1, len * 0.45, -wid * 0.45, len * 0.9); s.quadraticCurveTo(0, len * 1.08, wid * 0.45, len * 0.9); s.quadraticCurveTo(wid * 1.1, len * 0.45, wid * 0.22, 0); }
  else { s.quadraticCurveTo(-wid, len * 0.42, 0, len); s.quadraticCurveTo(wid, len * 0.42, wid * 0.22, 0); }
  s.lineTo(-wid * 0.22, 0);
  var g = new THREE.ShapeGeometry(s, 5), p = g.attributes.position;
  for (var i = 0; i < p.count; i++){ var t = p.getY(i) / len; p.setZ(i, bend * t * t * len); }
  g.computeVertexNormals();
  return noUV(g);
}
function fanPlant(k, x, z, s, n, lenR, widR, tiltR, bendR, col, tip, round){
  var y = groundY(x, z) - 0.02;
  k.push({ x: x, y: y, z: z, s: s, ry: rnd() * TAU });
  for (var i = 0; i < n; i++){
    var a = i / n * TAU + rr(-0.35, 0.35), len = rr(lenR[0], lenR[1]);
    k.put(leafGeo(len, rr(widR[0], widR[1]), rr(bendR[0], bendR[1]), round), col, { ry: a, rx: rr(tiltR[0], tiltR[1]), ord: 'YXZ', mat: 'leaf', c2: tip, j: 0.03, windY: lw() * 1.6 });
  }
  k.pop();
  BLOCK.push([x, z, 0.45 * s]);
}
function swordPlant(k, x, z, s){ fanPlant(k, x, z, s, ri(4, 6), [0.75, 1.25], [0.07, 0.1], [0.12, 0.42], [0.1, 0.3], 'swordA', 'swordB', false); }
function spikePlant(k, x, z, s, gold){ fanPlant(k, x, z, s, ri(11, 16), [0.55, 1.05], [0.035, 0.052], [0.15, 0.8], [0.15, 0.45], gold ? 'spikeGA' : 'spikeA', gold ? 'spikeGB' : 'spikeB', false); }
function broadPlant(k, x, z, s){ fanPlant(k, x, z, s, ri(5, 7), [0.45, 0.68], [0.15, 0.22], [0.45, 0.95], [0.05, 0.2], 'broadA', 'broadB', true); }
function puffFlower(k, x, z, s){
  var y = groundY(x, z), H = rr(1.0, 1.35), lx = rr(-0.12, 0.12), lz = rr(-0.12, 0.12);
  k.push({ x: x, y: y, z: z, s: s, ry: rnd() * TAU });
  k.tube([new V3(0, 0, 0), new V3(lx * 0.4, H * 0.5, lz * 0.4), new V3(lx, H, lz)], 0.04, 0.028, 'stem', { ts: 5, rs: 6, mat: 'leaf', windY: lw() });
  for (var l = 0; l < 2; l++) k.put(leafGeo(rr(0.25, 0.35), 0.07, 0.12, false), 'stem', { ry: l * Math.PI + rnd(), rx: 0.6, ord: 'YXZ', y: H * rr(0.15, 0.35), mat: 'leaf', c2: 'swordB' });
  var n = ri(4, 6);
  for (var i = 0; i < n; i++){ var a = i / n * TAU + rnd() * 0.5, d = i === 0 ? 0 : rr(0.1, 0.16); k.ball(rr(0.1, 0.14), 'puff', { x: lx + Math.cos(a) * d, y: H + 0.06 + (i === 0 ? 0.12 : rr(-0.04, 0.06)), z: lz + Math.sin(a) * d, n: 10, m: 8, mat: 'matte', j: 0.01 }); }
  k.pop();
  BLOCK.push([x, z, 0.4 * s]);
}
function orangeMush(k, x, z, s){
  var y = groundY(x, z), n = ri(2, 4);
  k.push({ x: x, y: y, z: z, s: s, ry: rnd() * TAU });
  for (var i = 0; i < n; i++){
    var a = rnd() * TAU, d = i ? rr(0.08, 0.22) : 0, h = rr(0.28, 0.6) * (i ? 0.8 : 1), bx = Math.cos(a) * d, bz = Math.sin(a) * d, tx = bx + rr(-0.08, 0.08), tz = bz + rr(-0.08, 0.08), r = rr(0.11, 0.18) * (i ? 0.85 : 1);
    k.tube([new V3(bx, 0, bz), new V3((bx + tx) / 2, h * 0.5, (bz + tz) / 2), new V3(tx, h, tz)], 0.03, 0.022, 'mushStem', { ts: 4, rs: 5 });
    k.ball(r, 'mush', { x: tx, y: h, z: tz, sy: 0.62, n: 12, m: 7, t0: 0, tl: Math.PI * 0.55, c2: 'mushTop' });
    k.cyl(r * 0.94, r * 0.94, 0.02, 'mushDot', { x: tx, y: h + 0.005, z: tz, n: 12, sharp: true });
  }
  k.pop();
}
function fingerTuftGeo(n, h, w){
  var P = [], C = [], W = [], N = [], I = [];
  for (var b = 0; b < n; b++){
    var u = n > 1 ? b / (n - 1) - 0.5 : 0, ox = u * w * n * 0.92 + rr(-0.15, 0.15) * w, oz = rr(-0.6, 0.6) * w;
    var hh = h * rr(0.72, 1.08) * (1 - Math.abs(u) * 0.38), ww = w * rr(0.85, 1.15), tilt = -u * 0.55 + rr(-0.1, 0.1), back = rr(0.08, 0.32);
    var ct = Math.cos(tilt), st = Math.sin(tilt), cb = Math.cos(back), sb = Math.sin(back), base = P.length / 3, r = ww / 2, yc = hh - r;
    var pts = [[-r, 0], [r, 0], [-r, yc * 0.5], [r, yc * 0.5], [-r, yc], [r, yc], [0, yc]];
    for (var q = 1; q < 6; q++){ var a = Math.PI - q / 6 * Math.PI; pts.push([Math.cos(a) * r, yc + Math.sin(a) * r]); }
    pts.forEach(function(p){
      var x = p[0] * ct - p[1] * st, y = p[0] * st + p[1] * ct, z = -y * sb; y = y * cb;
      P.push(ox + x, y, oz + z);
      var f = clamp(p[1] / hh, 0, 1), sh = lerp(0.5, 1.0, Math.pow(f, 0.8));
      C.push(sh, sh, sh); W.push(f * f); N.push(0, 1, 0);
    });
    I.push(base, base + 1, base + 2, base + 1, base + 3, base + 2, base + 2, base + 3, base + 4, base + 3, base + 5, base + 4);
    var arc = [base + 4]; for (var k2 = 0; k2 < 5; k2++) arc.push(base + 7 + k2); arc.push(base + 5);
    for (var t = 0; t < arc.length - 1; t++) I.push(base + 6, arc[t], arc[t + 1]);
  }
  var g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
  g.setAttribute('wind', new THREE.Float32BufferAttribute(W, 1));
  g.setIndex(I);
  g.computeBoundingSphere();
  return g;
}
var TUFT_FAM = {
  teal:   { pal: 'tuftTeal', h: 0.34, w: 0.07, n: [3, 5] },
  gold:   { pal: 'tuftGold', h: 0.42, w: 0.078, n: [4, 6] },
  violet: { pal: 'tuftViolet', h: 0.46, w: 0.082, n: [4, 6] },
  mauve:  { pal: 'tuftMauve', h: 0.4, w: 0.078, n: [3, 5] }
};
/* ===================== 06 · props: crates, barrels, tents, fires, fences, banners ===================== */
function stoneBlock(k, w, h, d, o){
  o.r = o.r !== undefined ? o.r : Math.min(w, h, d) * 0.14;
  var c = o.col || mixHex('stoneD', 'stoneL', rr(0.2, 0.75));
  k.box(w * rr(0.96, 1.02), h * rr(0.95, 1.02), d * rr(0.97, 1.02), c, Object.assign({ mat: 'stone', j: 0.03, ry: (o.ry || 0) + rr(-0.03, 0.03), cfn: o.moss ? mossCfn(o.moss) : undefined }, o, { col: undefined }));
}
function crate(k, x, y, z, s, ry){ k.push({ x: x, y: y, z: z, ry: ry || 0, s: s }); k.box(0.8, 0.8, 0.8, 'plank', { y: 0.4, mat: 'wood', r: 0.04 }); [-1, 1].forEach(function(e){ k.box(0.84, 0.1, 0.1, 'woodD', { y: 0.4 + e * 0.32, z: 0.4, mat: 'wood', r: 0.02 }); k.box(0.84, 0.1, 0.1, 'woodD', { y: 0.4 + e * 0.32, z: -0.4, mat: 'wood', r: 0.02 }); k.box(0.1, 0.84, 0.1, 'woodD', { x: e * 0.4, y: 0.4, z: 0.4, mat: 'wood', r: 0.02 }); }); k.box(0.08, 1.05, 0.06, 'woodD', { y: 0.4, z: 0.42, rz: 0.78, mat: 'wood', r: 0.02 }); k.pop(); }
function barrel(k, x, y, z, s, lying){
  k.push({ x: x, y: y, z: z, s: s, rz: lying ? Math.PI / 2 : 0, ry: rnd() * TAU });
  k.lathe([[0.34, 0], [0.4, 0.2], [0.43, 0.45], [0.4, 0.7], [0.34, 0.9], [0.001, 0.9]], 'wood', { y: lying ? -0.45 : 0, n: 12, mat: 'wood', j: 0.04 });
  [0.12, 0.78].forEach(function(h){ k.torus(lerp(0.37, 0.4, 0.6), 0.025, 'metalD', { y: (lying ? -0.45 : 0) + h, rx: Math.PI / 2, ts: 16, mat: 'metal' }); });
  k.pop();
}
function sack(k, x, y, z, s){ k.blob(0.35, 'canvas', { x: x, y: y + 0.25 * s, z: z, s: s, sy: 0.75, d: 1, amt: 0.15, mat: 'cloth', org: true }); k.cyl(0.08, 0.12, 0.15, 'canvasD', { x: x, y: y + 0.5 * s, z: z, n: 6, mat: 'cloth' }); }
function logPiece(k, x, y, z, len, r, ry, o){
  o = o || {};
  k.push({ x: x, y: y + r, z: z, ry: ry, rz: Math.PI / 2 });
  k.cyl(r, r * 0.95, len, 'trunk', { n: 9, mat: 'wood', b: 0.02 });
  [-1, 1].forEach(function(e){ k.cyl(r * 0.88, r * 0.88, 0.02, 'woodL', { y: e * (len / 2 + 0.005), n: 9, sharp: true, mat: 'wood' }); k.torus(r * 0.5, 0.012, 'trunkD', { y: e * (len / 2 + 0.012), rx: Math.PI / 2, ts: 10, mat: 'wood' }); });
  k.pop();
}
function tent(k, x, z, ry, cA, cB, sc){
  cA = cA || 'canvas'; cB = cB || 'canvasD'; sc = sc || 1;
  var y = groundY(x, z), L = 3.0, W = 2.6, H = 2.2;
  k.push({ x: x, y: y, z: z, ry: ry, s: sc });
  [-1, 1].forEach(function(sd){ var ang = Math.atan2(H, W / 2); k.box(L, 0.05, Math.hypot(W / 2, H) + 0.1, sd < 0 ? cA : cB, { x: 0, y: H / 2, z: sd * W / 4, rx: sd * (Math.PI / 2 - ang), mat: 'cloth', r: 0.02 }); });
  k.cyl(0.04, 0.04, L + 0.4, 'woodD', { y: H + 0.02, rz: Math.PI / 2, n: 5, mat: 'wood' });
  [-1, 1].forEach(function(e){ k.cyl(0.045, 0.05, H + 0.15, 'woodD', { x: e * L / 2, y: H / 2, n: 5, mat: 'wood' }); });
  // back wall and an open front flap
  var tri = new THREE.Shape(); tri.moveTo(-W / 2, 0); tri.lineTo(W / 2, 0); tri.lineTo(0, H); tri.lineTo(-W / 2, 0);
  k.geo(gExtrude(tri, 0.04), cB, { x: -L / 2, ry: Math.PI / 2, mat: 'cloth' });
  k.box(0.04, H * 0.85, W * 0.36, cA, { x: L / 2 + 0.25, y: H * 0.45, z: -W * 0.3, ry: 0.7, rx: 0.35, mat: 'cloth', r: 0.01 });
  k.box(0.02, H * 0.8, W * 0.9, '#1A1410', { x: L / 2 - 0.12, y: H * 0.38, mat: 'matte', r: 0.0 });
  // guy ropes and pegs
  [[1, 1], [1, -1], [-1, 1], [-1, -1]].forEach(function(c){ var px = c[0] * (L / 2 + 0.2), pz = c[1] * (W / 2 + 1.0); k.tube([new V3(c[0] * L / 2, H * 0.9, 0), new V3(px, 0.05, pz)], 0.015, 0.015, 'rope', { ts: 1, rs: 3 }); k.cyl(0.03, 0.02, 0.3, 'woodD', { x: px, y: 0.1, z: pz, n: 4, mat: 'wood' }); });
  k.pop();
  BLOCK.push([x, z, 2.4 * sc]); addOcc(x, z, 2.6 * sc, 0.45);
}
function campfireBase(k, x, z){
  var y = groundY(x, z);
  for (var i = 0; i < 9; i++){ var a = i / 9 * TAU; k.ico(0.22, mixHex('rockD', 'rock', rnd()), { x: x + Math.cos(a) * 0.62, y: y + 0.1, z: z + Math.sin(a) * 0.62, jit: 0.05, sy: 0.7, mat: 'stone' }); }
  for (var j = 0; j < 4; j++){ var a2 = j / 4 * TAU + 0.4; k.cyl(0.07, 0.09, 0.95, 'trunk', { x: x + Math.cos(a2) * 0.18, y: y + 0.22, z: z + Math.sin(a2) * 0.18, rz: Math.cos(a2) * 1.2, rx: -Math.sin(a2) * 1.2, n: 6, mat: 'wood' }); }
  k.cyl(0.4, 0.42, 0.05, '#2A1A12', { x: x, y: y + 0.02, z: z, n: 10, sharp: true });
  k.ico(0.18, 'ember', { x: x, y: y + 0.1, z: z, sy: 0.4, mat: 'glow', e: 2.2 });
  // tripod and pot
  for (var t = 0; t < 3; t++){ var a3 = t / 3 * TAU; k.cyl(0.03, 0.03, 1.8, 'woodD', { x: x + Math.cos(a3) * 0.42, y: y + 0.85, z: z + Math.sin(a3) * 0.42, rz: Math.cos(a3) * 0.42, rx: -Math.sin(a3) * 0.42, n: 4, mat: 'wood' }); }
  k.cyl(0.012, 0.012, 0.5, 'metalD', { x: x, y: y + 1.3, z: z, n: 3, mat: 'metal' });
  k.lathe([[0.18, 0], [0.26, 0.08], [0.27, 0.22], [0.22, 0.3], [0.24, 0.33]], 'metalD', { x: x, y: y + 0.82, z: z, n: 10, mat: 'metal' });
  BLOCK.push([x, z, 1.0]);
}
function fence(k, x0, z0, x1, z1, broken){
  var L = hyp(x1 - x0, z1 - z0), n = Math.max(1, Math.round(L / 1.6)), ang = Math.atan2(-(z1 - z0), x1 - x0);
  for (var i = 0; i <= n; i++){
    var t = i / n, x = lerp(x0, x1, t), z = lerp(z0, z1, t), y = groundY(x, z), fell = broken && chance(0.5);
    if (fell){ k.cyl(0.07, 0.08, 1.15, 'woodD', { x: x, y: y + 0.08, z: z, rz: Math.PI / 2, ry: rnd() * TAU, n: 6, mat: 'wood' }); continue; }
    k.cyl(0.07, 0.08, 1.15, 'woodD', { x: x, y: y + 0.5, z: z, n: 6, mat: 'wood', rx: broken ? rr(-0.4, 0.4) : 0, rz: broken ? rr(-0.4, 0.4) : 0 });
    k.cone(0.08, 0.14, 'woodD', { x: x, y: y + 1.12, z: z, n: 6, mat: 'wood' });
    if (i < n){
      var xm = lerp(x0, x1, t + 0.5 / n), zm = lerp(z0, z1, t + 0.5 / n), ym = groundY(xm, zm);
      [0.45, 0.85].forEach(function(h, j){ if (broken && chance(0.5)){ k.box(L / n * 0.9, 0.08, 0.06, 'wood', { x: xm + rr(-0.4, 0.4), y: ym + 0.05, z: zm + rr(-0.4, 0.4), ry: ang + rr(-0.6, 0.6), mat: 'wood', r: 0.02 }); return; } k.box(L / n + 0.1, 0.09, 0.06, 'wood', { x: xm, y: ym + h, z: zm, ry: ang, rz: (rnd() - 0.5) * 0.04, mat: 'wood', r: 0.02, j: 0.05 }); });
    }
  }
}
function signpost(k, x, z, ry){
  var y = groundY(x, z);
  k.push({ x: x, y: y, z: z, ry: ry });
  k.cyl(0.07, 0.09, 2.4, 'woodD', { y: 1.2, n: 6, mat: 'wood' });
  [[1.9, 0.25, 1], [1.5, -0.6, -1]].forEach(function(b){ k.push({ y: b[0], ry: b[1] }); var s = new THREE.Shape(); s.moveTo(0, -0.17); s.lineTo(0.95 * b[2], -0.17); s.lineTo(1.15 * b[2], 0); s.lineTo(0.95 * b[2], 0.17); s.lineTo(0, 0.17); s.lineTo(0, -0.17); k.geo(gExtrude(s, 0.06), 'plank', { mat: 'wood' }); k.pop(); });
  k.pop();
}
function warBanner(k, x, z, col){
  var y = groundY(x, z);
  k.push({ x: x, y: y, z: z, ry: rr(-0.5, 0.5) });
  k.cyl(0.06, 0.08, 4.2, 'woodD', { y: 2.1, n: 6, mat: 'wood' });
  k.cyl(0.04, 0.04, 1.5, 'woodD', { y: 3.9, rz: Math.PI / 2, x: 0.7, n: 5, mat: 'wood' });
  k.put(clothGeo(1.3, 2.1, 'notch'), col || 'enemy', { x: 0.05, y: 3.85, mat: 'cloth' });
  k.ball(0.18, 'tusk', { x: 0.05, y: 4.32, n: 8, m: 6 });
  k.pop();
}
/* ---------- bushes, pebbles ---------- */
function bush(k, x, z, s, o){
  o = o || {};
  var y = groundY(x, z), n = ri(3, 6), bl = staticBlight(x, z) > 0.45;
  k.push({ x: x, y: y, z: z, ry: rnd() * TAU, s: s });
  for (var i = 0; i < n; i++){
    var a = rnd() * TAU, d = i === 0 ? 0 : rr(0.35, 0.7), r = i === 0 ? rr(0.6, 0.8) : rr(0.38, 0.6);
    var c = bl ? mixHex('bleafD', 'bleaf', rr(0.3, 1)) : mixHex(o.dark || 'bushD', o.light || 'bush', rr(0.3, 1));
    k.blob(r, c, { x: Math.cos(a) * d, y: r * 0.65, z: Math.sin(a) * d, d: 2, amt: 0.3, seed: rr(0, 99), mat: 'leaf', sy: 0.8, wind: lw() * 0.5, c2: shadeHex(c, 0.05) });
  }
  if (o.berries) for (var b = 0; b < 7; b++){ var a2 = rnd() * TAU; k.ball(0.06, o.berries, { x: Math.cos(a2) * 0.65, y: rr(0.4, 0.9), z: Math.sin(a2) * 0.65, n: 5, m: 4 }); }
  k.pop();
  addOcc(x, z, 1.1 * s, 0.25);
}
var _dm = new THREE.Object3D();

/* ---------- where things may stand ---------- */
function castleKeep(x, z, m){
  for (var i = 0; i < CASTLES.length; i++){ var c = CASTLES[i]; if (hyp(x - c.zx, (z - c.zz) * 1.15) < c.zr + 0.7 + (m || 0)) return true; }
  return false;
}
function placeFree(x, z, m){
  m = m || 0;
  if (brookD(x, z) < 1.9 + m * 0.5) return false;
  if (hyp((x - POND.x) / POND.rx, (z - POND.z) / POND.rz) < 1.35) return false;
  if (inWater(x, z, 0.3)) return false;
  if (pathD(x, z) < 2.4 + m) return false;
  if (trampleK(x, z) > 0.04) return false;
  if (castleKeep(x, z, m)) return false;
  if (campSD(x, z, 1) < 1.2 + m || campSD(x, z, 2) < 1.2 + m) return false;
  if (blocked(x, z)) return false;
  if (slopeAt(x, z) > 0.32) return false;
  return true;
}
function sampleZone(n, x0, x1, z0, z1, minD, test, list, all){
  var tries = 0, out = [];
  while (out.length < n && tries++ < n * 400){
    var x = rr(x0, x1), z = rr(z0, z1);
    if (!test(x, z)) continue;
    var ok = true; for (var i = 0; i < all.length; i++){ var a = all[i]; if (Math.abs(a.x - x) < minD && Math.abs(a.z - z) < minD && hyp(a.x - x, a.z - z) < Math.max(minD, a.r || 0)){ ok = false; break; } }
    if (!ok) continue;
    var it = { x: x, z: z, s: rr(0.85, 1.2), r: minD }; out.push(it); all.push(it);
  }
  out.forEach(function(it){ list.push(it); });
  return out;
}
function nearRocks(x, z, PL){ var best = 99; PL.rocks.forEach(function(r){ var d = hyp(x - r.x, z - r.z) - r.s * 1.2; if (d < best) best = d; }); return best; }
function nearTrees(x, z, PL){ var best = 99; for (var i = 0; i < PL.trees.length; i++){ var t = PL.trees[i], d = hyp(x - t.x, z - t.z); if (d < best) best = d; } return best; }
function placeSpots(n, x0, x1, z0, z1, minD, weight, list){
  var out = [], tries = 0;
  while (out.length < n && tries++ < n * 300){
    var x = rr(x0, x1), z = rr(z0, z1);
    var w = weight(x, z); if (w <= 0 || rnd() > w) continue;
    if (!placeFree(x, z, -0.4)) continue;
    var ok = true; for (var i = 0; i < list.length; i++){ var q = list[i]; if (Math.abs(q[0] - x) < minD && Math.abs(q[1] - z) < minD && hyp(q[0] - x, q[1] - z) < minD){ ok = false; break; } }
    if (!ok) continue;
    out.push([x, z]); list.push([x, z]);
  }
  return out;
}

/* ---------- the plan: woods along the edges, a few lone trees in the meadows, rocks ---------- */
function planLayout(){
  var PL = { trees: [], bushes: [], rocks: [] }, all = [];
  function free(x, z){ return placeFree(x, z, 0.2); }
  sampleZone(20, -38, -28, -27, 26, 2.6, free, PL.trees, all);
  sampleZone(22, 28, 38, -27, 26, 2.6, free, PL.trees, all);
  sampleZone(9, -28, -16, 15, 27, 2.8, free, PL.trees, all);
  sampleZone(9, 16, 28, 15, 27, 2.8, free, PL.trees, all);
  sampleZone(10, -28, -16, -27, -15, 2.6, free, PL.trees, all);
  sampleZone(10, 16, 28, -27, -15, 2.6, free, PL.trees, all);
  sampleZone(5, -26, 26, -11.5, -4.5, 4.5, free, PL.trees, all);
  sampleZone(9, -16, 16, -30, -24, 3.0, free, PL.trees, all);
  sampleZone(6, -16, 16, 25, 30, 3.2, free, PL.trees, all);
  // outer forests on the hills
  var n = 0, tries = 0;
  while (n < (LOWQ ? 120 : 190) && tries++ < 40000){
    var x = rr(-95, 95), z = rr(-95, 50), f = outerForestK(x, z);
    if (f < 0.05 || rnd() > f) continue;
    if (brookD(x, z) < 3.2) continue;
    var ok = true; for (var i = 0; i < all.length; i++){ var a = all[i]; if (Math.abs(a.x - x) < 3.1 && Math.abs(a.z - z) < 3.1 && hyp(a.x - x, a.z - z) < 3.1){ ok = false; break; } }
    if (!ok) continue;
    var it = { x: x, z: z, s: rr(1.0, 1.4), zone: 'outer', r: 3.1 }; PL.trees.push(it); all.push(it); n++;
  }
  // bushes along wood edges and road sides
  sampleZone(34, -36, 36, -27, 27, 1.8, function(x, z){ if (!placeFree(x, z, -0.6)) return false; var f = forestK(x, z); return (f > 0.1 && f < 0.85) || pathD(x, z) < 3.8 || rnd() < 0.2; }, PL.bushes, all);
  // rock groups
  [[-30.5, -5.5, 1.2, 3], [-26.5, 7.5, 0.9, 2], [-19.2, -7.6, 0.8, 2], [-8.4, 7.6, 0.7, 2], [4.2, -7.8, 0.75, 2], [14.6, 6.8, 0.8, 2], [25.6, -7.2, 1.0, 3], [31.5, 5.6, 1.2, 3], [-22.5, 21.5, 0.9, 2], [22.8, -21.5, 1.1, 3], [-33.5, 18.5, 1.1, 2], [34.2, -16.5, 1.3, 3]].forEach(function(r){ if (placeFree(r[0], r[1], -1.0)) PL.rocks.push({ x: r[0], z: r[1], s: r[2], n: r[3] }); });
  sampleZone(14, -36, 36, -26, 26, 2.2, function(x, z){ return placeFree(x, z, -0.4) && rnd() < 0.6; }, PL.rocks, all).forEach(function(r){ r.s = rr(0.35, 0.65); r.n = 1; });
  // a few rocks out on the hills
  for (var q = 0, t3 = 0; q < 22 && t3 < 4000; t3++){ var x3 = rr(-75, 75), z3 = rr(-75, 40); if (openOut(x3, z3) < 1) continue; PL.rocks.push({ x: x3, z: z3, s: rr(0.8, 1.7), n: ri(1, 3) }); q++; }
  return PL;
}
function rockCluster(k, x, z, s, n){
  rockMint(k, x, z, s);
  for (var i = 1; i < n; i++){ var a = rnd() * TAU, d = s * rr(0.9, 1.5); rockMint(k, x + Math.cos(a) * d, z + Math.sin(a) * d, s * rr(0.35, 0.6)); }
}
function treeTypeAt(t, i){
  if (staticBlight(t.x, t.z) > 0.35) return 'blight';
  if (t.zone === 'outer') return i % 4 === 1 ? 'mintTall' : 'mint';
  return i % 4 === 2 ? 'mintTall' : 'mint';
}
function plantTree(k, type, x, z, s, o){
  if (type === 'blight') return treeBlight(k, x, z, s, o);
  if (type === 'mintTall') return treeMintTall(k, x, z, s, o);
  return treeMint(k, x, z, s, o);
}

/* ---------- accent plants ---------- */
function buildExtras(k, PL){
  var used = [];
  PL.trees.forEach(function(t){ used.push([t.x, t.z]); });
  var X0 = -36, X1 = 36, Z0 = -27, Z1 = 27;
  placeSpots(30, X0, X1, Z0, Z1, 1.6, function(x, z){ return 0.12 + (nearRocks(x, z, PL) < 1.4 ? 0.8 : 0) + (pathD(x, z) < 3.6 ? 0.2 : 0); }, used).forEach(function(p){ swordPlant(k, p[0], p[1], rr(0.85, 1.25)); });
  placeSpots(16, X0, X1, Z0, Z1, 2.0, function(x, z){ return staticBlight(x, z) > 0.3 ? 0.8 : 0; }, used).forEach(function(p){ spikePlant(k, p[0], p[1], rr(0.85, 1.2), false); });
  placeSpots(10, X0, X1, Z0, Z1, 2.2, function(x, z){ return (1 - staticBlight(x, z)) * smooth(0.6, 0.7, fbm(x * 0.11 + 20, z * 0.11 - 5, 181)); }, used).forEach(function(p){ spikePlant(k, p[0], p[1], rr(0.8, 1.1), true); });
  placeSpots(10, X0, X1, Z0, Z1, 2.2, function(x, z){ var b = staticBlight(x, z); return b > 0.05 && b < 0.6 ? 0.8 : 0.04; }, used).forEach(function(p){ broadPlant(k, p[0], p[1], rr(0.85, 1.2)); });
  placeSpots(14, X0, X1, Z0, Z1, 2.6, function(x, z){ return (1 - staticBlight(x, z)) * (1 - forestK(x, z)) * 0.6; }, used).forEach(function(p){ puffFlower(k, p[0], p[1], rr(0.85, 1.15)); });
  placeSpots(14, X0, X1, Z0, Z1, 1.4, function(x, z){ var d = nearTrees(x, z, PL); return d > 1.0 && d < 2.6 ? 0.8 : 0.02; }, used).forEach(function(p){ orangeMush(k, p[0], p[1], rr(0.8, 1.25)); });
}

/* ---------- finger tufts: instanced cards in four colour families ---------- */
function tuftBase(x, z){
  if (blocked(x, z)) return 0;
  if (groundY(x, z) < WL + 0.1 || brookD(x, z) < 1.2) return 0;
  var pd = pathD(x, z); if (pd < 1.25) return 0;
  if (trampleK(x, z) > 0.25) return 0;
  for (var i = 0; i < CASTLES.length; i++){ var c = CASTLES[i]; if (hyp(x - c.x, z - c.z) < c.padR + 0.4) return 0; }
  if (campSD(x, z, 1) < 0.2 || campSD(x, z, 2) < 0.2) return 0.25;
  if (slopeAt(x, z) > 0.3) return 0;
  return smooth(1.25, 2.2, pd);
}
function tuftWeight(fam, x, z, PL){
  var ba = staticBlight(x, z), gold = smooth(0.6, 0.7, fbm(x * 0.11 + 20, z * 0.11 - 5, 181)), m;
  if (fam === 'violet') m = smooth(0.4, 0.9, ba) * 0.9;
  else if (fam === 'mauve') m = (ba > 0.05 && ba < 0.6 ? 0.7 : 0) + ba * 0.05;
  else if (fam === 'gold') m = (1 - ba) * Math.min(1, gold + (pathD(x, z) < 3.4 ? 0.12 : 0) + (PL && nearRocks(x, z, PL) < 1.2 ? 0.25 : 0));
  else m = (1 - ba) * (0.25 + 0.35 * smooth(0.15, 0.6, Math.max(forestK(x, z), outerForestK(x, z))) + (PL && nearRocks(x, z, PL) < 1.5 ? 0.45 : 0)) * (1 - gold * 0.8);
  if (m <= 0.002 || rnd() > m) return 0;
  return tuftBase(x, z);
}
function buildTufts(PL){
  var grp = new THREE.Group(), mat = tuftMat(), c = new THREE.Color(), K = LOWQ ? 0.6 : 1;
  var plan = [
    ['violet', 520, -36, 36, -32, -6], ['mauve', 200, -36, 36, -32, -2], ['gold', 520, -36, 36, -28, 28], ['teal', 640, -36, 36, -28, 28],
    ['gold', 240, -70, 70, -60, 40], ['teal', 360, -70, 70, -60, 40]
  ];
  var lists = { teal: [], gold: [], violet: [], mauve: [] };
  plan.forEach(function(p){
    var fam = p[0], n = Math.round(p[1] * K), got = 0, tries = 0, outer = p[2] < -40;
    while (got < n && tries++ < n * 60){
      var x = rr(p[2], p[3]), z = rr(p[4], p[5]);
      if (outer && openOut(x, z) < 0.5) continue;
      if (!outer && openOut(x, z) > 0.5) continue;
      var w = tuftWeight(fam, x, z, outer ? null : PL); if (w <= 0 || rnd() > w) continue;
      lists[fam].push([x, z]); got++;
    }
  });
  Object.keys(lists).forEach(function(fam){
    var F2 = TUFT_FAM[fam], pts = lists[fam], cols = PAL[F2.pal], nv = 3, per = Math.ceil(pts.length / nv);
    for (var v = 0; v < nv; v++){
      var chunk = pts.slice(v * per, (v + 1) * per); if (!chunk.length) continue;
      var geo = fingerTuftGeo(F2.n[0] + v * Math.max(1, Math.round((F2.n[1] - F2.n[0]) / 2)), F2.h, F2.w);
      var mesh = new THREE.InstancedMesh(geo, mat, chunk.length);
      chunk.forEach(function(q, i){
        var x = q[0], z = q[1], sc = rr(0.82, 1.22);
        _dm.position.set(x, groundY(x, z) - 0.03, z); _dm.rotation.set(0, 0, 0); _dm.scale.set(sc, sc * rr(0.85, 1.15), sc); _dm.updateMatrix();
        mesh.setMatrixAt(i, _dm.matrix);
        mesh.setColorAt(i, c.set(cols[Math.floor(rnd() * cols.length)]).convertSRGBToLinear().multiplyScalar(rr(0.92, 1.06)));
      });
      mesh.instanceMatrix.needsUpdate = true; if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.castShadow = false; mesh.receiveShadow = true; mesh.layers.set(1);
      grp.add(mesh);
    }
  });
  return grp;
}
function buildPebbles(){
  var n = LOWQ ? 120 : 200;
  var geo = geoOf(function(k){ k.ico(0.12, '#FFFFFF', { d: 0, jit: 0.03, sy: 0.6, j: 0 }); });
  var pts = [], tries = 0;
  while (pts.length < n && tries++ < n * 30){
    var x = rr(-36, 36), z = rr(-27, 27);
    if (blocked(x, z) || inWater(x, z, 0.05)) continue;
    var pd = pathD(x, z), w = (pd > 0.8 && pd < 2.3 ? 0.9 : 0.06) + (trampleK(x, z) > 0.4 ? 0.2 : 0) + (brookD(x, z) < 2.4 ? 0.6 : 0);
    if (rnd() < w) pts.push([x, z]);
  }
  var mesh = new THREE.InstancedMesh(geo, regMat(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 })), pts.length), c = new THREE.Color();
  for (var i = 0; i < pts.length; i++){
    var px = pts[i][0], pz = pts[i][1], sc = rr(0.5, 1.6);
    _dm.position.set(px, groundY(px, pz), pz); _dm.rotation.set(rnd(), rnd() * TAU, rnd()); _dm.scale.set(sc, sc, sc); _dm.updateMatrix();
    mesh.setMatrixAt(i, _dm.matrix); mesh.setColorAt(i, linC(pick(['rock', 'rockL', 'rockD'])).multiplyScalar(rr(0.85, 1.1)));
  }
  mesh.instanceMatrix.needsUpdate = true; if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.receiveShadow = true; mesh.castShadow = true; mesh.layers.set(1);
  return mesh;
}
function groundAO(geo){
  var p = geo.attributes.position, c = geo.attributes.color; if (!c) return;
  for (var i = 0; i < p.count; i++){
    var x = p.getX(i), y = p.getY(i), z = p.getZ(i), d = y - groundY(x, z);
    if (d < 1.4){ var f = 1 - (STYLE.mat.aoK || 0.38) * (1 - smooth(-0.1, 1.4, d)); c.setXYZ(i, c.getX(i) * f, c.getY(i) * f, c.getZ(i) * f); }
  }
}
/* ---------- the two camps: the Valley's in the south, the Blight's in the north ---------- */
var CAMP_FIRES = [];   // [x, y, z, scale, magic]
function standard(k, x, z, h, col, top, o){
  o = o || {};
  var y = groundY(x, z);
  k.push({ x: x, y: y, z: z, ry: o.ry || 0 });
  k.cyl(0.06, 0.08, h, 'woodD', { y: h / 2, n: 6, mat: 'wood' });
  k.cyl(0.035, 0.035, 1.4, 'woodD', { y: h - 0.2, rz: Math.PI / 2, x: 0.62, n: 5, mat: 'wood' });
  k.put(clothGeo(1.2, o.long || 1.9, 'notch'), col, { x: 0.02, y: h - 0.25, mat: 'cloth', c2: o.c2 });
  if (top === 'tusk'){ k.cone(0.12, 0.5, 'tusk', { y: h + 0.22, n: 6 }); k.ball(0.14, 'enemyD', { y: h + 0.02, n: 8, m: 6 }); }
  else { k.ball(0.14, 'gold', { y: h + 0.1, n: 8, m: 6, mat: 'gold' }); k.cone(0.07, 0.3, 'gold', { y: h + 0.35, n: 6, mat: 'gold' }); }
  k.pop();
  BLOCK.push([x, z, 0.5]);
}
function spearRack(k, x, z, ry, tip){
  var y = groundY(x, z);
  k.push({ x: x, y: y, z: z, ry: ry });
  [-0.6, 0.6].forEach(function(e){ k.cyl(0.05, 0.06, 1.3, 'woodD', { x: e, y: 0.65, n: 5, mat: 'wood' }); });
  k.box(1.4, 0.08, 0.1, 'wood', { y: 1.1, mat: 'wood' });
  for (var s = 0; s < 4; s++){ k.cyl(0.025, 0.025, 2.2, 'wood', { x: -0.45 + s * 0.3, y: 1.0, z: 0.08, rx: 0.12, n: 4, mat: 'wood' }); k.cone(0.06, 0.25, tip || 'steel', { x: -0.45 + s * 0.3, y: 2.2, z: 0.2, rx: 0.12, n: 4, mat: 'metal' }); }
  k.pop();
  BLOCK.push([x, z, 1.0]);
}
function crystalCluster(k, x, z, s, col){
  var y = groundY(x, z);
  for (var i = 0; i < 6; i++){
    var a = rnd() * TAU, d = i ? rr(0.2, 0.6) * s : 0, h = rr(0.6, 1.5) * s * (i ? 0.75 : 1);
    k.push({ x: x + Math.cos(a) * d, y: y - 0.05, z: z + Math.sin(a) * d, rx: rr(-0.4, 0.4) * (i ? 1 : 0.3), rz: rr(-0.4, 0.4) * (i ? 1 : 0.3) });
    k.cyl(0.12 * s, 0.15 * s, h, col || 'crystal2', { y: h / 2, n: 6, nfix: true, sharp: true, flat: true, mat: 'glow', e: 1.35 });
    k.cone(0.12 * s, 0.3 * s, col || 'crystal2', { y: h + 0.15 * s, n: 6, nfix: true, flat: true, mat: 'glow', e: 1.5 });
    k.pop();
  }
  rockMint(k, x + 0.5 * s, z + 0.3 * s, 0.45 * s, { slab: true });
  BLOCK.push([x, z, 0.9 * s]);
}
function buildCamp(k, p){
  var s = sideOf(p), C = CAMP[p], blight = p === 2, tz = C.z + s * 2.6;
  var cA = blight ? '#6A4A7C' : 'canvas', cB = blight ? '#4C3460' : 'canvasD', flag = blight ? 'enemy' : 'team';
  var ry = blight ? -Math.PI / 2 : Math.PI / 2;        // tent openings face the muster ground
  [-9.2, -3.4, 3.4, 9.2].forEach(function(x, i){ tent(k, x + rr(-0.3, 0.3), tz + rr(-0.4, 0.4) + (i % 3 ? 0.4 * s : 0), ry + rr(-0.12, 0.12), cA, cB, i === 1 || i === 2 ? 1.05 : 0.95); });
  // the command tent with the faction's tall standards
  tent(k, 0, C.z + s * 5.4, ry, cA, cB, 1.35);
  standard(k, -2.6, C.z + s * 3.9, 4.6, flag, blight ? 'tusk' : 'gold', { long: 2.2 });
  standard(k, 2.6, C.z + s * 3.9, 4.6, flag, blight ? 'tusk' : 'gold', { long: 2.2 });
  // standards along the muster ground
  [-13.6, 13.6].forEach(function(x){ standard(k, x, C.z - s * 3.4, 3.8, flag, blight ? 'tusk' : 'gold', { ry: rr(-0.4, 0.4) }); });
  // campfires with logs
  [[-12.4, C.z + s * 0.6], [12.6, C.z + s * 1.0]].forEach(function(f){
    campfireBase(k, f[0], f[1]);
    logPiece(k, f[0] - 1.5, groundY(f[0] - 1.5, f[1] + 0.2), f[1] + 0.2, 1.6, 0.2, 1.3);
    logPiece(k, f[0] + 0.6, groundY(f[0] + 0.6, f[1] + 1.4 * s), f[1] + 1.4 * s, 1.5, 0.19, -0.2);
    CAMP_FIRES.push([f[0], groundY(f[0], f[1]) + 0.05, f[1], 1.0, blight]);
  });
  // supplies
  var sx = -6.4, sz = C.z + s * 5.6;
  crate(k, sx, groundY(sx, sz), sz, 0.9, 0.3); crate(k, sx + 0.4, groundY(sx, sz) + 0.72, sz - 0.1 * s, 0.65, 0.9);
  barrel(k, sx + 1.1, groundY(sx + 1.1, sz + 0.9 * s), sz + 0.9 * s, 0.9); barrel(k, 6.6, groundY(6.6, sz), sz, 0.9); barrel(k, 7.4, groundY(7.4, sz - 0.5 * s), sz - 0.5 * s, 0.85, true);
  sack(k, 5.6, groundY(5.6, sz + 0.8 * s), sz + 0.8 * s, 1); sack(k, 6.1, groundY(6.1, sz + 1.3 * s), sz + 1.3 * s, 0.85);
  BLOCK.push([sx, sz, 1.6], [6.8, sz, 1.6]);
  spearRack(k, -13.2, C.z + s * 3.4, 0.2 * s, blight ? 'metalD' : 'steel');
  spearRack(k, 13.4, C.z + s * 3.8, -0.3 * s, blight ? 'metalD' : 'steel');
  // a fence along the back of the camp
  fence(k, -15.5, C.z + s * 7.6, -5.5, C.z + s * 8.0); fence(k, 5.5, C.z + s * 8.0, 15.5, C.z + s * 7.4);
  if (blight){
    crystalCluster(k, -15.6, C.z + s * 1.4, 1.1); crystalCluster(k, 16.2, C.z - s * 1.2, 0.9); crystalCluster(k, 1.5, C.z + s * 8.6, 0.8);
  } else {
    signpost(k, -15.2, C.z - s * 1.6, 0.4);
  }
}
/* ===================== 07 · architecture helpers ===================== */
function shingleCone(k, x, y, z, R, H, col, o){
  o = o || {};
  var n = o.rings || 7, seg = o.n || 12, dark = shadeHex(col, -0.06);
  for (var i = 0; i < n; i++){
    var t0 = i / n, t1 = (i + 1) / n, r0 = R * (1 - t0) + 0.001, r1 = R * (1 - t1) + 0.001, y0 = y + H * t0, y1 = y + H * t1;
    var g = noUV(new THREE.CylinderGeometry(Math.max(0.001, r1 * 0.98), r0 * 1.07, (y1 - y0) * 1.32, Math.max(4, Math.round(seg * SHAPE.segK)), 1, false));
    k.put(g, i % 2 ? col : mixHex(col, dark, 0.6), { x: x, y: y0 + (y1 - y0) * 0.62, z: z, ry: o.ry || (i * 0.13), mat: 'roof', j: 0.025, flat: SHAPE.facet && seg < 9 });
  }
  k.cyl(0.05, 0.08, 0.5, 'gold', { x: x, y: y + H + 0.2, z: z, n: 6, mat: 'gold' });
  k.ball(0.11, 'gold', { x: x, y: y + H + 0.42, z: z, n: 8, m: 6, mat: 'gold' });
}
function hipRoof(k, x, y, z, w, d, H, col){
  var n = 6;
  for (var i = 0; i < n; i++){
    var t0 = i / n, t1 = (i + 1) / n, s0 = 1 - t0, s1 = 1 - t1;
    var g = noUV(new THREE.CylinderGeometry(Math.SQRT1_2 * Math.max(0.02, s1) * 0.98, Math.SQRT1_2 * s0 * 1.06, H / n * 1.3, 4, 1));
    k.put(g, i % 2 ? col : shadeHex(col, -0.04), { x: x, y: y + H * t0 + H / n * 0.62, z: z, sx: w, sz: d, ry: Math.PI / 4, mat: 'roof', flat: true, j: 0.02 });
  }
}
function gableRoof(k, x, y, z, L, W, H, col, ry){
  // rows of shingles on two slopes plus a ridge beam
  var slope = Math.hypot(W / 2, H), ang = Math.atan2(H, W / 2), rows = 6;
  k.push({ x: x, y: y, z: z, ry: ry || 0 });
  [-1, 1].forEach(function(sd){
    for (var r = 0; r < rows; r++){
      var t = (r + 0.5) / rows, px = 0, pz = sd * (W / 2) * (1 - t) + sd * 0.12, py = H * t;
      k.box(L + 0.34, 0.09, slope / rows * 1.25, r % 2 ? col : shadeHex(col, -0.05), { x: px, y: py + 0.03, z: pz, rx: sd * ang, mat: 'roof', r: 0.025, j: 0.03 });
    }
    k.box(L + 0.3, 0.06, slope + 0.25, shadeHex(col, -0.15), { y: H / 2 - 0.05, z: sd * W / 4, rx: sd * ang, mat: 'roof', r: 0.01 });
  });
  k.box(L + 0.5, 0.16, 0.18, 'woodD', { y: H + 0.08, mat: 'wood', r: 0.04 });
  k.pop();
}
function crenels(k, cx, y, cz, r, n, col, rz){
  rz = rz || r;
  for (var i = 0; i < n; i++){ var a = (i + 0.5) / n * TAU; k.box(0.3, 0.38, 0.24, col || 'stone', { x: cx + Math.cos(a) * r, y: y + 0.19, z: cz + Math.sin(a) * rz, ry: -a + Math.PI / 2, mat: 'stone', r: 0.04, j: 0.04 }); }
}
function archWindow(k, x, y, z, ry, w, h, o){
  o = o || {};
  k.push({ x: x, y: y, z: z, ry: ry });
  k.box(w + 0.16, h + 0.16, 0.08, 'stoneD', { z: -0.01, mat: 'stone', r: 0.03 });
  k.box(w, h * 0.78, 0.12, 'windowD', { y: -h * 0.11, mat: 'matte', r: 0.01 });
  k.cyl(w / 2, w / 2, 0.12, 'windowD', { y: h * 0.28, rx: Math.PI / 2, n: 10, sharp: true, mat: 'matte' });
  if (o.lit !== false){ k.box(w * 0.78, h * 0.68, 0.06, 'glass', { y: -h * 0.12, z: 0.04, mat: 'glow', e: 1.5 * GK() * (o.e || 1) }); k.cyl(w * 0.39, w * 0.39, 0.06, 'glass', { y: h * 0.22, z: 0.04, rx: Math.PI / 2, n: 10, sharp: true, mat: 'glow', e: 1.5 * GK() * (o.e || 1) }); }
  k.box(0.04, h * 0.8, 0.08, 'woodD', { z: 0.06, y: -h * 0.08, mat: 'wood', r: 0.0 });
  k.box(w + 0.24, 0.08, 0.2, 'stoneL', { y: -h * 0.52, z: 0.05, mat: 'stone', r: 0.02 });
  k.pop();
}
function slit(k, x, y, z, ry){ k.box(0.08, 0.42, 0.08, 'windowD', { x: x, y: y, z: z, ry: ry, mat: 'matte', r: 0.0 }); }
function stoneTexture(k, cx, cz, r, y0, y1, n, rz){
  rz = rz || r;
  for (var i = 0; i < n; i++){ var a = rnd() * TAU, yy = rr(y0, y1); k.box(rr(0.22, 0.42), rr(0.14, 0.22), 0.08, rnd() < 0.5 ? 'stoneD' : 'stoneL', { x: cx + Math.cos(a) * r, y: yy, z: cz + Math.sin(a) * rz, ry: -a + Math.PI / 2, mat: 'stone', r: 0.03, j: 0.04 }); }
}
function courses(k, cx, cz, r, y0, y1, step, rz){
  for (var y = y0 + step; y < y1 - 0.1; y += step) k.cyl(r + 0.025, r + 0.025, 0.05, 'stoneD', { x: cx, y: y, z: cz, sz: (rz || r) / r, n: 14, sharp: true, mat: 'stone', j: 0.01 });
}
function flagPole(k, x, y, z, h, w, fh, col, ry){
  k.cyl(0.035, 0.05, h, 'woodD', { x: x, y: y + h / 2, z: z, n: 6, mat: 'wood' });
  k.ball(0.08, 'gold', { x: x, y: y + h + 0.05, z: z, n: 8, m: 6, mat: 'gold' });
  k.put(clothGeo(w, fh, 'swallow'), col || 'cloth', { x: x + 0.03, y: y + h - 0.08, z: z, ry: ry || 0, mat: 'cloth' });
}
function halfTimber(k, x, y, z, w, h, d, ry){
  k.push({ x: x, y: y, z: z, ry: ry || 0 });
  k.box(w, h, d, 'plaster', { y: h / 2, mat: 'matte', r: 0.03, j: 0.02 });
  [[0, 1], [0, -1], [1, 0], [-1, 0]].forEach(function(f){
    var len = f[0] ? d : w, ox = f[0] * (w / 2 + 0.02), oz = f[1] * (d / 2 + 0.02), ry2 = f[0] ? Math.PI / 2 : 0;
    k.push({ x: ox, z: oz, ry: ry2 });
    var nPost = Math.max(2, Math.round(len / 0.65));
    for (var i = 0; i <= nPost; i++) k.box(0.1, h, 0.06, 'beam', { x: -len / 2 + i * len / nPost, y: h / 2, mat: 'wood', r: 0.01 });
    k.box(len + 0.08, 0.1, 0.07, 'beam', { y: 0.05, mat: 'wood', r: 0.01 }); k.box(len + 0.08, 0.1, 0.07, 'beam', { y: h - 0.05, mat: 'wood', r: 0.01 }); k.box(len, 0.08, 0.06, 'beam', { y: h * 0.48, mat: 'wood', r: 0.01 });
    for (var j = 0; j < nPost; j += 2){ var cx = -len / 2 + (j + 0.5) * len / nPost, dl = Math.hypot(len / nPost, h * 0.46); k.box(0.07, dl, 0.05, 'beam', { x: cx, y: h * 0.25, rz: Math.atan2(len / nPost, h * 0.46) * (j % 4 ? 1 : -1), mat: 'wood', r: 0.0 }); }
    k.pop();
  });
  k.pop();
}
/* ===================== 07b · the five castles and their upgrades ===================== */
function GK(){ return STYLE.mat.glowK || 1; }
var OWNER_COL = ['#E6E0D6', '#3A78DA', '#9A40B4'];   // nobody, the Valley, the Blight
var CVIS = [];
// local helpers (castle space: origin on the pad, +x towards the battle meadow, +z towards the Valley)
function ownerFlag(k, ok, x, y, z, h, w, fh, ry){
  k.cyl(0.035, 0.05, h, 'woodD', { x: x, y: y + h / 2, z: z, n: 6, mat: 'wood' });
  k.ball(0.08, 'gold', { x: x, y: y + h + 0.05, z: z, n: 8, m: 6, mat: 'gold' });
  ok.put(clothGeo(w, fh, 'swallow'), '#FFFFFF', { x: x + 0.03, y: y + h - 0.08, z: z, ry: ry || 0, mat: 'cloth', j: 0 });
}
function ownerBanner(ok, x, y, z, ry, w, h){
  ok.push({ x: x, y: y, z: z, ry: ry || 0 });
  ok.put(clothGeo(w, h, 'point', true), '#FFFFFF', { x: -w / 2, mat: 'cloth', j: 0 });
  ok.pop();
}
function plinthRound(k, r, h, n){
  k.cyl(r, r * 1.07, h + 0.7, 'stoneD', { y: (h - 0.7) / 2, n: n || 20, mat: 'stone' });
  k.cyl(r * 0.985, r * 0.985, 0.08, 'stoneL', { y: h + 0.005, n: n || 20, sharp: true, mat: 'stone' });
  for (var i = 0; i < (n || 20); i++){ var a = (i + 0.5) / (n || 20) * TAU; k.box(0.5, 0.42, 0.22, mixHex('stoneD', 'stone', rnd() * 0.5), { x: Math.cos(a) * (r + 0.06), y: h * 0.45, z: Math.sin(a) * (r + 0.06), ry: -a + Math.PI / 2, rx: 0.2, mat: 'stone', r: 0.05, j: 0.04 }); }
}
function plinthBox(k, w, d, h){
  k.box(w, h + 0.7, d, 'stoneD', { y: (h - 0.7) / 2, mat: 'stone', r: 0.14 });
  k.box(w - 0.12, 0.08, d - 0.12, 'stoneL', { y: h + 0.02, mat: 'stone', r: 0.03 });
  var per = 2 * (w + d), n = Math.round(per / 0.62);
  for (var i = 0; i < n; i++){
    var u = (i + 0.5) / n * per, x, z, ry;
    if (u < w){ x = -w / 2 + u; z = d / 2 + 0.06; ry = 0; } else if (u < w + d){ x = w / 2 + 0.06; z = d / 2 - (u - w); ry = Math.PI / 2; } else if (u < 2 * w + d){ x = w / 2 - (u - w - d); z = -d / 2 - 0.06; ry = 0; } else { x = -w / 2 - 0.06; z = -d / 2 + (u - 2 * w - d); ry = Math.PI / 2; }
    k.box(0.52, 0.36, 0.16, mixHex('stoneD', 'stone', rnd() * 0.5), { x: x, y: h * 0.45, z: z, ry: ry, mat: 'stone', r: 0.05, j: 0.04 });
  }
}
// a crenellated wall from a to b
function wallSeg(k, ax, az, bx, bz, y0, h, th, o){
  o = o || {};
  var L = hyp(bx - ax, bz - az), ang = Math.atan2(-(bz - az), bx - ax), cx = (ax + bx) / 2, cz = (az + bz) / 2;
  k.push({ x: cx, y: y0, z: cz, ry: ang });
  k.box(L, h, th, 'stone', { y: h / 2, mat: 'stone', r: 0.05, j: 0.02 });
  for (var c = 1; c * 0.48 < h - 0.2; c++) k.box(L + 0.02, 0.045, th + 0.02, 'stoneD', { y: c * 0.48, mat: 'stone', r: 0.0 });
  for (var b = 0; b < Math.round(L * 1.6); b++){ var sd = rnd() < 0.5 ? 1 : -1; k.box(rr(0.22, 0.38), rr(0.13, 0.19), 0.05, rnd() < 0.5 ? 'stoneD' : 'stoneL', { x: rr(-L / 2 + 0.2, L / 2 - 0.2), y: rr(0.18, h - 0.18), z: sd * th / 2, mat: 'stone', r: 0.02 }); }
  k.box(L + 0.08, 0.1, th + 0.14, 'stoneL', { y: h + 0.02, mat: 'stone', r: 0.03 });
  var nm = Math.max(2, Math.round(L / 0.5));
  for (var m = 0; m < nm; m++){ if (m % 2) continue; k.box(L / nm * 0.9, 0.34, th * 0.86, 'stone', { x: -L / 2 + (m + 0.5) * L / nm, y: h + 0.24, mat: 'stone', r: 0.04, j: 0.04 }); }
  if (o.slits) for (var s = 0; s < Math.floor(L / 1.1); s++) slit(k, -L / 2 + (s + 0.75) * 1.1, h * 0.55, th / 2, 0);
  k.pop();
}
function towerRound(k, x, z, r, h, o){
  o = o || {};
  var y0 = o.y0 || 0, col = o.col || 'stone';
  k.cyl(r * 1.13, r * 1.2, 0.45, 'stoneD', { x: x, y: y0 + 0.2, z: z, n: 14, mat: 'stone' });
  k.cyl(r, r * 1.04, h, col, { x: x, y: y0 + h / 2, z: z, n: 14, mat: 'stone', b: 0.03 });
  courses(k, x, z, r, y0, y0 + h, 0.6);
  stoneTexture(k, x, z, r, y0 + 0.3, y0 + h - 0.35, Math.round(r * h * 3));
  var top = y0 + h;
  for (var i = 0; i < 12; i++){ var a = i / 12 * TAU; k.box(0.16, 0.28, 0.2, 'stoneD', { x: x + Math.cos(a) * (r + 0.07), y: top - 0.1, z: z + Math.sin(a) * (r + 0.07), ry: -a + Math.PI / 2, mat: 'stone', r: 0.03 }); }
  k.cyl(r + 0.2, r + 0.16, 0.44, col, { x: x, y: top + 0.18, z: z, n: 14, mat: 'stone' });
  k.cyl(r + 0.24, r + 0.24, 0.07, 'stoneL', { x: x, y: top + 0.42, z: z, n: 14, sharp: true, mat: 'stone' });
  var face = o.face !== undefined ? o.face : Math.atan2(x, z);
  if (o.windows !== false){
    archWindow(k, x + Math.sin(face) * (r + 0.02), y0 + h * 0.62, z + Math.cos(face) * (r + 0.02), face, 0.3, 0.5, { e: 0.7 });
    slit(k, x + Math.sin(face + 1.2) * (r + 0.01), y0 + h * 0.32, z + Math.cos(face + 1.2) * (r + 0.01), face + 1.2);
  }
  if (o.roof){ shingleCone(k, x, top + 0.4, z, r + 0.4, o.roof, o.roofCol || 'roof', { n: 14, rings: 6 }); return top + 0.4 + o.roof; }
  crenels(k, x, top + 0.42, z, r + 0.1, Math.round(r * 9), col);
  k.cyl(r + 0.04, r + 0.04, 0.05, 'plank', { x: x, y: top + 0.41, z: z, n: 14, sharp: true, mat: 'wood' });
  return top + 0.42;
}
function quoins(k, x, z, w, y0, h){
  for (var q = 0; q < 4; q++){ var qx = (q < 2 ? 1 : -1), qz = (q % 2 ? 1 : -1); for (var lv = 0; lv * 0.46 < h - 0.3; lv++) k.box(lv % 2 ? 0.36 : 0.52, 0.38, lv % 2 ? 0.52 : 0.36, mixHex('stoneD', 'stoneL', rnd() * 0.5 + 0.25), { x: x + qx * (w / 2 - 0.1 + (lv % 2 ? 0 : 0.05)), y: y0 + 0.3 + lv * 0.46, z: z + qz * (w / 2 - 0.1 + (lv % 2 ? 0.05 : 0)), mat: 'stone', r: 0.03 }); }
}
function gateArch(k, x, z, ry, w, h){
  k.push({ x: x, z: z, ry: ry });
  k.box(w, h * 0.72, 0.5, 'windowD', { y: h * 0.36, mat: 'matte', r: 0.02 });
  k.cyl(w / 2, w / 2, 0.5, 'windowD', { y: h * 0.72, rx: Math.PI / 2, n: 12, sharp: true, mat: 'matte' });
  for (var g = 0; g < 4; g++) k.box(0.045, h * 0.75, 0.045, 'metalD', { x: -w * 0.36 + g * w * 0.24, y: h * 0.48, z: 0.27, mat: 'metal', r: 0 });
  for (var g2 = 0; g2 < 3; g2++) k.box(w * 0.86, 0.045, 0.045, 'metalD', { y: h * 0.25 + g2 * h * 0.22, z: 0.27, mat: 'metal', r: 0 });
  k.box(w + 0.3, 0.16, 0.56, 'stoneL', { y: h * 0.72 + w / 2 + 0.04, mat: 'stone', r: 0.03 });
  k.pop();
}
function localRock(k, x, y, z, r, o){
  o = o || {};
  k.blob(r, o.col || mixHex('rockBig', 'rockD', rr(0, 0.35)), { x: x, y: y, z: z, d: 1, amt: 0.22, freq: 0.75, seed: rr(0, 99), sx: o.sx || rr(1.0, 1.35), sy: o.sy || rr(0.6, 0.85), sz: o.sz || rr(0.9, 1.2), ry: rnd() * TAU, fb: 0.3, mat: 'stone', flat: true, fj: 0.025, c2: 'rockBigL', j: 0.02 });
}
function localCrystals(k, x, y, z, s, col){
  for (var i = 0; i < 6; i++){
    var a = rnd() * TAU, d = i ? rr(0.15, 0.5) * s : 0, h = rr(0.5, 1.3) * s * (i ? 0.75 : 1);
    k.push({ x: x + Math.cos(a) * d, y: y, z: z + Math.sin(a) * d, rx: rr(-0.45, 0.45) * (i ? 1 : 0.3), rz: rr(-0.45, 0.45) * (i ? 1 : 0.3) });
    k.cyl(0.1 * s, 0.13 * s, h, col || 'crystal', { y: h / 2, n: 6, nfix: true, sharp: true, flat: true, mat: 'glow', e: 1.3 });
    k.cone(0.1 * s, 0.26 * s, col || 'crystal', { y: h + 0.13 * s, n: 6, nfix: true, flat: true, mat: 'glow', e: 1.45 });
    k.pop();
  }
}
function keepBlock(k, x, z, w, h, y0, o){
  o = o || {};
  k.box(w + 0.3, 0.45, w + 0.3, 'stoneD', { x: x, y: y0 + 0.22, z: z, mat: 'stone', r: 0.05 });
  k.box(w, h, w, 'stone', { x: x, y: y0 + h / 2, z: z, mat: 'stone', r: 0.04, j: 0.015 });
  quoins(k, x, z, w, y0, h);
  for (var b = 1; b * 1.05 < h - 0.4; b++) k.box(w + 0.05, 0.06, w + 0.05, 'stoneD', { x: x, y: y0 + b * 1.05, z: z, mat: 'stone', r: 0 });
  [[0, 1], [1, 0], [-1, 0], [0, -1]].forEach(function(d){
    var ox = d[0] * (w / 2 + 0.01), oz = d[1] * (w / 2 + 0.01), ry = Math.atan2(d[0], d[1]);
    archWindow(k, x + ox, y0 + h * 0.62, z + oz, ry, 0.36, 0.62, { e: 0.8 });
    if (o.twin){ archWindow(k, x + ox + d[1] * 0.55, y0 + h * 0.86, z + oz - d[0] * 0.55, ry, 0.28, 0.48, { e: 0.8 }); archWindow(k, x + ox - d[1] * 0.55, y0 + h * 0.86, z + oz + d[0] * 0.55, ry, 0.28, 0.48, { e: 0.8 }); }
    for (var t = 0; t < 5; t++) k.box(rr(0.22, 0.4), 0.15, 0.06, rnd() < 0.5 ? 'stoneD' : 'stoneL', { x: x + ox + d[1] * rr(-w * 0.38, w * 0.38) + d[0] * 0.02, y: y0 + rr(0.6, h - 0.4), z: z + oz - d[0] * rr(-w * 0.38, w * 0.38) + d[1] * 0.02, ry: ry, mat: 'stone', r: 0.02 });
  });
  return y0 + h;
}

/* ---------- the five ---------- */
var BUILDERS = {};
BUILDERS.watch = function(k, ok, V){
  var y0 = 0.3;
  plinthRound(k, 2.55, y0, 18);
  // a palisade ring, open to the east
  for (var a = 0.6; a < TAU - 0.6; a += 0.23){
    var px = Math.cos(a) * 2.3, pz = Math.sin(a) * 2.3, hh = rr(1.2, 1.45);
    k.cyl(0.085, 0.1, hh, mixHex('woodD', 'wood', rnd()), { x: px, y: y0 + hh / 2, z: pz, n: 6, mat: 'wood', rx: rr(-0.05, 0.05), rz: rr(-0.05, 0.05) });
    k.cone(0.1, 0.24, 'woodD', { x: px, y: y0 + hh + 0.11, z: pz, n: 6, mat: 'wood' });
    var a2 = a + 0.115; k.box(0.1, 0.08, 0.55, 'wood', { x: Math.cos(a2) * 2.25, y: y0 + 0.75, z: Math.sin(a2) * 2.25, ry: -a2, mat: 'wood', r: 0.02 });
  }
  [-1, 1].forEach(function(e){ k.box(0.24, 2.1, 0.24, 'woodD', { x: 2.3, y: y0 + 1.05, z: e * 0.66, mat: 'wood', r: 0.04 }); });
  k.box(0.28, 0.24, 1.62, 'wood', { x: 2.3, y: y0 + 2.0, mat: 'wood', r: 0.04 });
  ownerBanner(ok, 2.44, y0 + 1.86, 0, Math.PI / 2, 0.5, 0.8);
  // the watchtower: stone below, a timber storey above, a hip roof
  var tx = -0.35, tz = -0.25, tw = 1.7, th = 2.9;
  keepBlock(k, tx, tz, tw, th, y0, {});
  gateArch(k, tx, tz + tw / 2 + 0.05, 0, 0.6, 1.1);
  var uy = y0 + th;
  k.box(tw + 0.5, 0.14, tw + 0.5, 'beam', { x: tx, y: uy + 0.07, z: tz, mat: 'wood', r: 0.02 });
  for (var c = 0; c < 4; c++){ var cx = tx + (c < 2 ? 1 : -1) * (tw / 2 + 0.05), cz = tz + (c % 2 ? 1 : -1) * (tw / 2 + 0.05); k.box(0.1, 0.5, 0.1, 'beam', { x: cx, y: uy - 0.2, z: cz, rx: (c % 2 ? -0.5 : 0.5), mat: 'wood', r: 0.01 }); }
  halfTimber(k, tx, uy + 0.14, tz, tw + 0.32, 1.15, tw + 0.32);
  [[0, 1], [1, 0]].forEach(function(d){ var wx = tx + d[0] * ((tw + 0.32) / 2 + 0.03), wz = tz + d[1] * ((tw + 0.32) / 2 + 0.03); k.box(d[0] ? 0.05 : 0.36, 0.38, d[0] ? 0.36 : 0.05, 'windowD', { x: wx, y: uy + 0.75, z: wz, mat: 'matte', r: 0.01 }); k.box(d[0] ? 0.06 : 0.26, 0.28, d[0] ? 0.26 : 0.06, 'glass', { x: wx, y: uy + 0.75, z: wz, mat: 'glow', e: 1.2 * GK() }); });
  hipRoof(k, tx, uy + 1.29, tz, tw + 0.75, tw + 0.75, 1.45, 'roof');
  ownerFlag(k, ok, tx, uy + 2.62, tz, 1.4, 1.0, 0.58, 0.4);
  // a shed and supplies in the yard
  halfTimber(k, 0.95, y0, 1.05, 1.15, 0.78, 0.9, 0.35);
  gableRoof(k, 0.95, y0 + 0.78, 1.05, 1.15, 1.15, 0.55, 'roof2', 0.35);
  barrel(k, 1.15, y0, -0.9, 0.7); barrel(k, 1.55, y0, -0.55, 0.65); crate(k, 0.6, y0, -1.35, 0.55, 0.4);
  V.slots = [[1.6, 1.8], [1.6, -1.8], [-2.6, 0.7]];
  V.top = uy + 4.1; V.gate = [2.3, 0];
};
BUILDERS.mill = function(k, ok, V){
  var y0 = 0.28;
  plinthBox(k, 5.2, 4.6, y0);
  var W = 2.35, D = 2.05;
  wallSeg(k, -W, D, W, D, y0, 1.05, 0.36, { slits: true });
  wallSeg(k, -W, -D, W, -D, y0, 1.05, 0.36);
  wallSeg(k, -W, -D, -W, D, y0, 1.05, 0.36);
  wallSeg(k, W, -D, W, -0.72, y0, 1.05, 0.36); wallSeg(k, W, 0.72, W, D, y0, 1.05, 0.36);
  [-1, 1].forEach(function(e){ k.box(0.5, 1.6, 0.5, 'stone', { x: W, y: y0 + 0.8, z: e * 0.78, mat: 'stone', r: 0.05 }); k.box(0.62, 0.14, 0.62, 'stoneL', { x: W, y: y0 + 1.66, z: e * 0.78, mat: 'stone', r: 0.03 }); k.ball(0.16, 'stoneL', { x: W, y: y0 + 1.84, z: e * 0.78, n: 8, m: 6, mat: 'stone' }); });
  ownerBanner(ok, -1.0, y0 + 1.25, D + 0.2, 0, 0.42, 0.75); ownerBanner(ok, 1.0, y0 + 1.25, D + 0.2, 0, 0.42, 0.75);
  // the windmill
  var mx = -1.05, mz = -0.45, mr = 0.98, mh = 3.4;
  towerRound(k, mx, mz, mr, mh, { y0: y0, roof: 1.7, roofCol: 'roof2', face: 0 });
  k.box(0.5, 0.4, 0.5, 'woodD', { x: mx, y: y0 + mh + 0.55, z: mz + mr + 0.05, mat: 'wood', r: 0.04 });
  var sk = new Kit();
  sk.cyl(0.13, 0.13, 0.34, 'woodD', { rx: Math.PI / 2, n: 10, mat: 'wood' });
  sk.ball(0.12, 'gold', { z: 0.2, n: 8, m: 6, mat: 'gold' });
  for (var b = 0; b < 4; b++){
    sk.push({ rz: b * Math.PI / 2 + 0.3 });
    sk.box(0.08, 2.15, 0.07, 'wood', { y: 1.12, mat: 'wood', r: 0.02 });
    sk.box(0.46, 1.55, 0.025, 'canvas', { x: 0.27, y: 1.32, mat: 'cloth', r: 0.01 });
    for (var r2 = 0; r2 < 5; r2++) sk.box(0.52, 0.035, 0.04, 'woodD', { x: 0.25, y: 0.6 + r2 * 0.36, z: 0.02, mat: 'wood', r: 0 });
    sk.box(0.035, 1.6, 0.04, 'woodD', { x: 0.5, y: 1.32, z: 0.02, mat: 'wood', r: 0 });
    sk.pop();
  }
  V.sails = sk.build(); V.sails.position.set(mx, y0 + mh + 0.6, mz + mr + 0.32);
  // the miller's house and flour
  halfTimber(k, 1.0, y0, 0.85, 1.85, 1.05, 1.3);
  gableRoof(k, 1.0, y0 + 1.05, 0.85, 1.85, 1.5, 0.78, 'roof', 0);
  k.box(0.3, 1.0, 0.3, 'stoneD', { x: 1.6, y: y0 + 1.7, z: 0.55, mat: 'stone', r: 0.03 }); k.box(0.38, 0.1, 0.38, 'stone', { x: 1.6, y: y0 + 2.22, z: 0.55, mat: 'stone', r: 0.02 });
  V.smoke = [new V3(1.6, y0 + 2.35, 0.55)];
  sack(k, 0.15, y0, 1.6, 0.75); sack(k, 0.55, y0, 1.7, 0.65); sack(k, -0.05, y0 + 0.32, 1.55, 0.6); barrel(k, 1.85, y0, -1.35, 0.7);
  ownerFlag(k, ok, 0.2, y0 + 1.86, 0.85, 1.25, 0.85, 0.5, 0.3);
  V.slots = [[2.15, 1.85], [2.15, -1.85], [-2.95, 1.35]];
  V.top = y0 + mh + 2.7; V.gate = [W + 0.1, 0];
};
BUILDERS.citadel = function(k, ok, V){
  var y0 = 0.42;
  k.cyl(3.12, 3.42, y0 + 0.9, 'stoneD', { y: (y0 - 0.9) / 2, n: 8, mat: 'stone' });
  k.cyl(3.06, 3.06, 0.08, 'stoneL', { y: y0 + 0.005, n: 8, sharp: true, mat: 'stone' });
  for (var i = 0; i < 16; i++){ var a = (i + 0.5) / 16 * TAU; k.box(0.62, 0.5, 0.22, mixHex('stoneD', 'stone', rnd() * 0.5), { x: Math.cos(a) * 3.3, y: -0.05, z: Math.sin(a) * 3.3, ry: -a + Math.PI / 2, rx: 0.3, mat: 'stone', r: 0.05, j: 0.04 }); }
  var C = 2.2, wh = 1.85;
  wallSeg(k, -C, C, C, C, y0, wh, 0.42, { slits: true });
  wallSeg(k, -C, -C, C, -C, y0, wh, 0.42);
  wallSeg(k, -C, -C, -C, C, y0, wh, 0.42, { slits: true });
  wallSeg(k, C, -C, C, -0.78, y0, wh, 0.42); wallSeg(k, C, 0.78, C, C, y0, wh, 0.42);
  // gatehouse
  k.box(1.0, 2.6, 1.75, 'stone', { x: C, y: y0 + 1.3, mat: 'stone', r: 0.05 });
  gateArch(k, C + 0.3, 0, Math.PI / 2, 0.8, 1.6);
  for (var m = 0; m < 4; m++) k.box(0.34, 0.36, 0.3, 'stone', { x: C + 0.3, y: y0 + 2.78, z: -0.66 + m * 0.44, mat: 'stone', r: 0.04 });
  for (var m2 = 0; m2 < 4; m2++) k.box(0.34, 0.36, 0.3, 'stone', { x: C - 0.3, y: y0 + 2.78, z: -0.66 + m2 * 0.44, mat: 'stone', r: 0.04 });
  ownerBanner(ok, C + 0.53, y0 + 2.45, -0.62, Math.PI / 2, 0.42, 0.85); ownerBanner(ok, C + 0.53, y0 + 2.45, 0.62, Math.PI / 2, 0.42, 0.85);
  // corner towers with conical roofs
  [[C, C], [-C, C], [C, -C], [-C, -C]].forEach(function(p){ towerRound(k, p[0], p[1], 0.64, 2.75, { y0: y0, roof: 1.35, roofCol: 'roof' }); });
  // the keep
  var kx = -0.35, kz = -0.25, kw = 2.3, kh = 4.4;
  var kt = keepBlock(k, kx, kz, kw, kh, y0, { twin: true });
  for (var mc = 0; mc < 4; mc++) for (var cb = 0; cb < 5; cb++){ var u = -kw / 2 + 0.25 + cb * (kw - 0.5) / 4, px2 = mc === 0 ? u : mc === 1 ? kw / 2 + 0.08 : mc === 2 ? u : -kw / 2 - 0.08, pz2 = mc === 0 ? kw / 2 + 0.08 : mc === 1 ? u : mc === 2 ? -kw / 2 - 0.08 : u; k.box(0.18, 0.28, 0.18, 'stoneD', { x: kx + px2, y: kt - 0.12, z: kz + pz2, mat: 'stone', r: 0.03 }); }
  k.box(kw + 0.4, 0.28, kw + 0.4, 'stone', { x: kx, y: kt + 0.11, z: kz, mat: 'stone', r: 0.04 });
  hipRoof(k, kx, kt + 0.24, kz, kw + 0.45, kw + 0.45, 2.3, 'roof');
  [[1, 1], [-1, 1], [1, -1], [-1, -1]].forEach(function(c){ var bx = kx + c[0] * (kw / 2 + 0.1), bz = kz + c[1] * (kw / 2 + 0.1); k.cyl(0.32, 0.27, 0.8, 'stone', { x: bx, y: kt + 0.1, z: bz, n: 10, mat: 'stone' }); k.cone(0.13, 0.36, 'stoneD', { x: bx, y: kt - 0.45, z: bz, rx: Math.PI, n: 10, mat: 'stone' }); shingleCone(k, bx, kt + 0.5, bz, 0.42, 0.9, 'roof', { n: 10, rings: 4 }); });
  k.box(0.42, 1.6, 0.42, 'stoneD', { x: kx - 0.6, y: kt + 1.0, z: kz - 0.55, mat: 'stone', r: 0.04 }); k.box(0.52, 0.12, 0.52, 'stone', { x: kx - 0.6, y: kt + 1.84, z: kz - 0.55, mat: 'stone', r: 0.03 });
  V.smoke = [new V3(kx - 0.6, kt + 2.0, kz - 0.55)];
  ownerFlag(k, ok, kx, kt + 2.45, kz, 1.9, 1.45, 0.82, 0.3);
  ownerBanner(ok, kx, kt - 0.35, kz + kw / 2 + 0.06, 0, 0.6, 1.3);
  // braziers by the gate
  [-1, 1].forEach(function(e){ k.cyl(0.07, 0.09, 0.62, 'metalD', { x: C + 0.75, y: y0 + 0.31, z: e * 1.15, n: 6, mat: 'metal' }); k.cyl(0.24, 0.13, 0.2, 'metalD', { x: C + 0.75, y: y0 + 0.7, z: e * 1.15, n: 8, mat: 'metal' }); });
  V.fires = [new V3(C + 0.75, y0 + 0.8, -1.15), new V3(C + 0.75, y0 + 0.8, 1.15)];
  V.slots = [[3.15, 2.55], [3.15, -2.55], [-3.5, 0.6]];
  V.top = kt + 4.5; V.gate = [C + 0.7, 0];
};
BUILDERS.mine = function(k, ok, V){
  var y0 = 0.28;
  plinthBox(k, 5.0, 4.8, y0);
  // the rocky outcrop with a mine entrance and glowing crystals
  localRock(k, -1.55, y0 + 0.55, -1.55, 1.45, { sy: 0.85 });
  localRock(k, -0.35, y0 + 0.3, -1.95, 1.05, { sy: 0.7 });
  localRock(k, -2.0, y0 + 0.25, 0.1, 0.95, { sy: 0.75 });
  localRock(k, 0.75, y0 + 0.15, -2.0, 0.7, { sy: 0.6 });
  k.box(1.0, 1.2, 0.9, '#100C0A', { x: -1.15, y: y0 + 0.6, z: -0.55, r: 0.02 });
  [-1, 1].forEach(function(e){ k.box(0.18, 1.45, 0.18, 'woodD', { x: -1.15 + e * 0.6, y: y0 + 0.72, z: -0.1, mat: 'wood', r: 0.03 }); });
  k.box(1.5, 0.2, 0.26, 'wood', { x: -1.15, y: y0 + 1.48, z: -0.1, mat: 'wood', r: 0.04 });
  localCrystals(k, -2.05, y0 + 1.1, -1.55, 1.0, 'crystal');
  localCrystals(k, -0.2, y0 + 0.75, -2.05, 0.65, 'crystal');
  // rails and a cart heaped with ore
  for (var zz = -0.1; zz < 1.7; zz += 0.42) k.box(0.95, 0.06, 0.16, 'woodD', { x: -1.15 + zz * 0.35, y: y0 + 0.04, z: zz, ry: -0.35, mat: 'wood', r: 0.02 });
  k.push({ x: -0.62, y: y0 + 0.12, z: 1.35, ry: -0.35, s: 0.75 });
  k.box(1.1, 0.62, 1.3, 'plankD', { y: 0.4, mat: 'wood', r: 0.05 });
  [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(function(c){ k.cyl(0.18, 0.18, 0.08, 'metalD', { x: c[0] * 0.45, y: 0.1, z: c[1] * 0.42, rz: Math.PI / 2, n: 10, mat: 'metal' }); });
  for (var o = 0; o < 7; o++) k.ico(rr(0.14, 0.22), chance(0.5) ? 'ore' : 'rockD', { x: rr(-0.35, 0.35), y: 0.76 + rr(0, 0.12), z: rr(-0.42, 0.42), jit: 0.04, mat: chance(0.5) ? 'gold' : 'stone' });
  k.pop();
  // walls and the gate
  wallSeg(k, -2.3, 2.15, 2.3, 2.15, y0, 1.0, 0.36, { slits: true });
  wallSeg(k, 2.3, 0.72, 2.3, 2.15, y0, 1.0, 0.36); wallSeg(k, 2.3, -2.15, 2.3, -0.72, y0, 1.0, 0.36);
  wallSeg(k, 0.6, -2.15, 2.3, -2.15, y0, 1.0, 0.36);
  [-1, 1].forEach(function(e){ k.box(0.48, 1.55, 0.48, 'stone', { x: 2.3, y: y0 + 0.78, z: e * 0.78, mat: 'stone', r: 0.05 }); k.box(0.6, 0.14, 0.6, 'stoneL', { x: 2.3, y: y0 + 1.62, z: e * 0.78, mat: 'stone', r: 0.03 }); });
  ownerBanner(ok, 0.0, y0 + 1.2, 2.35, 0, 0.42, 0.72);
  // the miners' hall
  halfTimber(k, 0.95, y0, 0.7, 1.7, 1.0, 1.3);
  gableRoof(k, 0.95, y0 + 1.0, 0.7, 1.7, 1.5, 0.75, 'roof2', 0);
  k.box(0.3, 0.9, 0.3, 'stoneD', { x: 1.5, y: y0 + 1.6, z: 0.4, mat: 'stone', r: 0.03 });
  V.smoke = [new V3(1.5, y0 + 2.15, 0.4)];
  barrel(k, 1.95, y0, -1.5, 0.65); crate(k, 1.3, y0, -1.6, 0.55, 0.3);
  ownerFlag(k, ok, -1.55, y0 + 1.55, -1.45, 1.7, 0.95, 0.55, 0.3);
  V.slots = [[2.15, 1.95], [2.15, -1.95], [-2.65, 1.75]];
  V.top = y0 + 4.2; V.gate = [2.4, 0];
};
BUILDERS.outpost = function(k, ok, V){
  var y0 = 0.26;
  plinthBox(k, 4.8, 4.8, y0);
  var C = 2.0, wh = 1.6;
  wallSeg(k, -C, C, C, C, y0, wh, 0.38, { slits: true });
  wallSeg(k, -C, -C, C, -C, y0, wh, 0.38);
  wallSeg(k, -C, -C, -C, C, y0, wh, 0.38, { slits: true });
  wallSeg(k, C, -C, C, -0.72, y0, wh, 0.38); wallSeg(k, C, 0.72, C, C, y0, wh, 0.38);
  [[-C, C], [-C, -C]].forEach(function(p){ towerRound(k, p[0], p[1], 0.56, 2.35, { y0: y0, roof: 1.2, roofCol: 'roof' }); });
  // the gatehouse
  k.box(0.95, 2.45, 1.7, 'stone', { x: C, y: y0 + 1.22, mat: 'stone', r: 0.05 });
  gateArch(k, C + 0.28, 0, Math.PI / 2, 0.76, 1.5);
  for (var m = 0; m < 4; m++){ k.box(0.3, 0.34, 0.28, 'stone', { x: C + 0.3, y: y0 + 2.62, z: -0.66 + m * 0.44, mat: 'stone', r: 0.04 }); k.box(0.3, 0.34, 0.28, 'stone', { x: C - 0.3, y: y0 + 2.62, z: -0.66 + m * 0.44, mat: 'stone', r: 0.04 }); }
  ownerFlag(k, ok, C, y0 + 2.45, 0.55, 1.6, 1.0, 0.6, 0.2);
  ownerBanner(ok, C + 0.5, y0 + 2.3, -0.6, Math.PI / 2, 0.4, 0.8);
  // barracks
  halfTimber(k, -0.45, y0, -0.35, 2.0, 1.0, 1.25);
  gableRoof(k, -0.45, y0 + 1.0, -0.35, 2.0, 1.45, 0.72, 'roof', 0);
  k.box(0.28, 0.85, 0.28, 'stoneD', { x: -1.15, y: y0 + 1.55, z: -0.6, mat: 'stone', r: 0.03 });
  V.smoke = [new V3(-1.15, y0 + 2.05, -0.6)];
  crate(k, 0.6, y0, 1.25, 0.55, 0.3); barrel(k, 1.1, y0, 1.35, 0.65); barrel(k, -1.3, y0, 1.3, 0.65, true);
  // a weapon rack in the yard
  k.push({ x: 0.5, y: y0, z: -1.45 });
  [-0.45, 0.45].forEach(function(e){ k.cyl(0.04, 0.05, 1.0, 'woodD', { x: e, y: 0.5, n: 5, mat: 'wood' }); });
  k.box(1.05, 0.06, 0.08, 'wood', { y: 0.85, mat: 'wood' });
  for (var s = 0; s < 3; s++){ k.cyl(0.02, 0.02, 1.6, 'wood', { x: -0.3 + s * 0.3, y: 0.75, z: 0.06, rx: 0.12, n: 4, mat: 'wood' }); k.cone(0.05, 0.2, 'steel', { x: -0.3 + s * 0.3, y: 1.62, z: 0.16, rx: 0.12, n: 4, mat: 'metal' }); }
  k.pop();
  V.slots = [[2.1, 2.1], [2.1, -2.1], [-2.85, 0.2]];
  V.top = y0 + 4.6; V.gate = [C + 0.6, 0];
};

/* ---------- upgrades: an archers' tower, a ballista tower, a cannon bastion ---------- */
var FIRE = [0, 4, 9, 15];          // attackers the towers shoot down before the clash, by level
var UPG_COST = [3, 5, 8];          // gold to reach level 1, 2, 3
var ADDON_NAMES = ['Лучники', 'Баллиста', 'Пушка'];
function addonArcher(k, ok, G){
  var r = 0.7, h = 2.9;
  k.cyl(r * 1.18, r * 1.26, 1.6, 'stoneD', { y: -0.55, n: 12, mat: 'stone' });
  k.cyl(r, r * 1.06, h, 'stone', { y: h / 2, n: 12, mat: 'stone', b: 0.03 });
  courses(k, 0, 0, r, 0, h, 0.58);
  stoneTexture(k, 0, 0, r, 0.3, h - 0.4, 9);
  for (var i = 0; i < 10; i++){ var a = i / 10 * TAU; k.box(0.16, 0.28, 0.2, 'stoneD', { x: Math.cos(a) * (r + 0.07), y: h - 0.1, z: Math.sin(a) * (r + 0.07), ry: -a + Math.PI / 2, mat: 'stone', r: 0.03 }); }
  k.cyl(r + 0.2, r + 0.16, 0.42, 'stone', { y: h + 0.18, n: 12, mat: 'stone' });
  k.cyl(r + 0.08, r + 0.08, 0.05, 'plank', { y: h + 0.4, n: 12, sharp: true, mat: 'wood' });
  crenels(k, 0, h + 0.39, 0, r + 0.12, 8);
  slit(k, 0, h * 0.45, r + 0.01, 0); slit(k, r + 0.01, h * 0.62, 0, Math.PI / 2);
  [[-0.22, 0.18, 1.2], [0.25, -0.15, 1.75]].forEach(function(p){ k.push({ x: p[0], y: h + 0.43, z: p[1], ry: p[2], s: 0.95 }); ok.push({ x: p[0], y: h + 0.43, z: p[1], ry: p[2], s: 0.95 }); miniFigure(k, { team: 0, bow: true }, ok); k.pop(); ok.pop(); });
  ownerFlag(k, ok, -0.42, h + 0.42, -0.42, 1.25, 0.55, 0.32, 0.5);
  G.muzzle = new V3(0, h + 1.25, 0); G.h = h + 2.0;
}
function ballistaGeo(k){
  k.box(0.42, 0.26, 0.42, 'woodD', { y: 0.13, mat: 'wood', r: 0.04 });
}
function addonBallista(k, ok, G){
  var w = 1.4, h = 3.0;
  k.box(w + 0.36, 1.7, w + 0.36, 'stoneD', { y: -0.55, mat: 'stone', r: 0.08 });
  k.box(w, h, w, 'stone', { y: h / 2, mat: 'stone', r: 0.05, j: 0.015 });
  quoins(k, 0, 0, w, 0, h - 0.2);
  for (var b = 1; b < 3; b++) k.box(w + 0.05, 0.06, w + 0.05, 'stoneD', { y: b * 1.0, mat: 'stone', r: 0 });
  slit(k, 0, h * 0.55, w / 2 + 0.01, 0); slit(k, w / 2 + 0.01, h * 0.55, 0, Math.PI / 2);
  for (var s = 0; s < 4; s++){ var a = s / 4 * TAU + Math.PI / 4; k.box(0.12, 0.7, 0.12, 'woodD', { x: Math.cos(a) * w * 0.62, y: h - 0.32, z: Math.sin(a) * w * 0.62, rz: Math.cos(a) * 0.6, rx: -Math.sin(a) * 0.6, mat: 'wood', r: 0.02 }); }
  k.box(w + 0.6, 0.16, w + 0.6, 'plank', { y: h + 0.08, mat: 'wood', r: 0.03 });
  [[1, 1], [1, -1], [-1, 1], [-1, -1]].forEach(function(c){ k.box(0.1, 0.62, 0.1, 'woodD', { x: c[0] * (w / 2 + 0.24), y: h + 0.46, z: c[1] * (w / 2 + 0.24), mat: 'wood', r: 0.02 }); });
  [[0, 1], [0, -1], [1, 0], [-1, 0]].forEach(function(d){ k.box(d[0] ? 0.08 : w + 0.55, 0.07, d[0] ? w + 0.55 : 0.08, 'wood', { x: d[0] * (w / 2 + 0.24), y: h + 0.72, z: d[1] * (w / 2 + 0.24), mat: 'wood', r: 0.02 }); });
  ok.cyl(0.26, 0.26, 0.05, '#FFFFFF', { y: h * 0.62, z: w / 2 + 0.03, rx: Math.PI / 2, n: 14, mat: 'cloth', j: 0 });
  k.torus(0.26, 0.03, 'metalD', { y: h * 0.62, z: w / 2 + 0.05, ts: 16, mat: 'metal' });
  ownerFlag(k, ok, -(w / 2 + 0.24), h + 0.16, -(w / 2 + 0.24), 1.3, 0.6, 0.34, 0.4);
  // the weapon turns on its base
  k.box(0.46, 0.3, 0.46, 'woodD', { y: h + 0.31, mat: 'wood', r: 0.04 });
  var aim = new Kit();
  aim.box(0.26, 0.15, 1.5, 'wood', { y: 0.12, z: 0.15, mat: 'wood', r: 0.03 });
  aim.box(1.7, 0.11, 0.11, 'woodD', { y: 0.17, z: 0.65, mat: 'wood', r: 0.03 });
  [-1, 1].forEach(function(s){ aim.box(0.1, 0.2, 0.2, 'metalD', { x: s * 0.78, y: 0.17, z: 0.65, mat: 'metal', r: 0.02 }); aim.cyl(0.005, 0.005, 0.9, 'linen', { x: s * 0.4, y: 0.2, z: 0.35, rx: Math.PI / 2, rz: s * 0.95, n: 3 }); });
  aim.cyl(0.025, 0.025, 1.35, 'arrow', { y: 0.24, z: 0.28, rx: Math.PI / 2, n: 4, mat: 'wood' }); aim.cone(0.055, 0.18, 'steel', { y: 0.24, z: 1.0, rx: Math.PI / 2, n: 4, mat: 'metal' });
  aim.cyl(0.1, 0.1, 0.4, 'woodD', { y: 0.12, z: -0.5, rz: Math.PI / 2, n: 8, mat: 'wood' });
  var AG = aim.build(); var A = new THREE.Group(); A.add(AG); A.position.set(0, h + 0.46, 0);
  G.aim = A; G.muzzleLocal = new V3(0, 0.24, 1.0); G.h = h + 1.8;
}
function addonCannon(k, ok, G){
  var r = 1.05, h = 1.5;
  k.cyl(r * 1.06, r * 1.3, h + 1.2, 'stone', { y: (h - 1.2) / 2, n: 14, mat: 'stone' });
  k.cyl(r * 1.1, r * 1.12, 0.12, 'stoneD', { y: h * 0.35, n: 14, sharp: true, mat: 'stone' });
  stoneTexture(k, 0, 0, r * 1.12, 0.1, h * 0.9, 12);
  k.cyl(r + 0.08, r + 0.08, 0.1, 'stoneL', { y: h + 0.02, n: 14, sharp: true, mat: 'stone' });
  crenels(k, 0, h + 0.06, 0, r - 0.02, 9);
  k.cyl(r - 0.12, r - 0.12, 0.06, 'plank', { y: h + 0.05, n: 14, sharp: true, mat: 'wood' });
  for (var b = 0; b < 3; b++) k.ball(0.11, 'metalD', { x: -0.55 + b * 0.22, y: h + 0.18, z: -0.55, n: 8, m: 6, mat: 'metal' });
  k.ball(0.11, 'metalD', { x: -0.44, y: h + 0.36, z: -0.55, n: 8, m: 6, mat: 'metal' });
  barrel(k, 0.45, h + 0.08, -0.55, 0.5);
  ok.put(clothGeo(0.42, 0.8, 'point', true), '#FFFFFF', { x: -0.21, y: h - 0.05, z: r * 1.12 + 0.02, mat: 'cloth', j: 0 });
  ownerFlag(k, ok, -0.7, h + 0.08, 0.5, 1.2, 0.55, 0.32, 0.4);
  var ck = new Kit();
  ck.box(0.62, 0.24, 0.85, 'woodD', { y: 0.16, mat: 'wood', r: 0.04 });
  [-1, 1].forEach(function(s){ [-1, 1].forEach(function(e){ ck.cyl(0.16, 0.16, 0.07, 'woodD', { x: s * 0.35, y: 0.15, z: e * 0.27, rz: Math.PI / 2, n: 10, mat: 'wood' }); }); });
  var bk = new Kit();
  bk.lathe([[0.17, -0.45], [0.2, -0.38], [0.18, -0.22], [0.15, 0.45], [0.18, 0.51], [0.18, 0.58], [0.12, 0.58]], 'metalD', { rx: Math.PI / 2, n: 14, mat: 'metal' });
  bk.torus(0.19, 0.03, 'gold', { z: -0.18, ts: 14, mat: 'gold' });
  var A = new THREE.Group(); A.add(ck.build()); var BR = new THREE.Group(); BR.add(bk.build()); BR.position.y = 0.4; BR.rotation.x = -0.3; A.add(BR);
  A.position.set(0, h + 0.08, 0.1);
  G.aim = A; G.barrel = BR; G.muzzleLocal = new V3(0, 0, 0.6); G.h = h + 1.4;
}
function buildAddon(kind, V, slot){
  var k = new Kit(), ok = new Kit(), G = { kind: kind };
  reseed(700 + V.c.id * 13 + kind.length);
  if (kind === 'archer') addonArcher(k, ok, G); else if (kind === 'ballista') addonBallista(k, ok, G); else addonCannon(k, ok, G);
  var g = new THREE.Group(), inner = new THREE.Group(); g.add(inner);
  inner.add(k.build());
  var om = ok.build(); om.traverse(function(o){ if (o.isMesh) o.material = V.ownerMat; }); inner.add(om);
  if (G.aim) inner.add(G.aim);
  var wx = V.c.x + slot[0], wz = V.c.z + slot[1];
  g.position.set(slot[0], groundY(wx, wz) - V.group.position.y - 0.04, slot[1]);
  g.userData = G; G.group = g; G.inner = inner; G.show = 0; G.showT = 0;
  inner.scale.set(1, 0.001, 1); g.visible = false;
  return g;
}
function buildCastleVis(c, root){
  var g = new THREE.Group(); g.position.set(c.x, groundY(c.x, c.z) - 0.02, c.z);
  var V = { c: c, group: g, addons: [], owner: 0, level: 0, ownerCol: new THREE.Color(), ownerColT: new THREE.Color() };
  V.ownerMat = clothMat(OWNER_COL[0]);
  V.ownerCol.copy(V.ownerMat.color); V.ownerColT.copy(V.ownerMat.color);
  reseed(500 + c.id * 31);
  var k = new Kit(), ok = new Kit();
  BUILDERS[c.key](k, ok, V);
  g.add(k.build());
  var om = ok.build(); om.traverse(function(o){ if (o.isMesh) o.material = V.ownerMat; }); g.add(om);
  if (V.sails) g.add(V.sails);
  root.add(g);
  ['archer', 'ballista', 'cannon'].forEach(function(kind, i){ var a = buildAddon(kind, V, V.slots[i]); g.add(a); V.addons.push(a.userData); });
  (V.smoke || []).forEach(function(p){ addSmoker(g, p, 0.8); });
  (V.fires || []).forEach(function(p){ addFire(g, p.x, p.y, p.z, 0.42, { smoke: false }); });
  BLOCK.push([c.x, c.z, c.padR + 0.2]);
  addOcc(c.x, c.z, c.padR + 1.6, 0.4);
  return V;
}
// owner and level changes, animated
function setCastleOwner(V, owner, instant){
  V.owner = owner;
  V.ownerColT.copy(lin3(OWNER_COL[owner]));
  if (instant){ V.ownerCol.copy(V.ownerColT); V.ownerMat.color.copy(V.ownerCol); }
}
function setCastleLevel(V, level, instant){
  var prev = V.level; V.level = level;
  V.addons.forEach(function(A, i){
    var on = level > i;
    A.showT = on ? 1 : 0;
    if (instant){ A.show = A.showT; A.group.visible = on; A.inner.scale.y = on ? 1 : 0.001; }
    else if (on && i >= prev){ A.group.visible = true; A.rise = 0; }
    else if (!on && i < prev){ A.fallT = 0; }
  });
}
var _cw = new V3();
function updateCastles(t, dt){
  CVIS.forEach(function(V){
    V.ownerCol.lerp(V.ownerColT, Math.min(1, dt * 3)); V.ownerMat.color.copy(V.ownerCol);
    if (V.sails) V.sails.rotation.z = -t * 0.9;
    V.addons.forEach(function(A){
      if (A.showT > 0.5 && A.show < 1){
        A.show = Math.min(1, A.show + dt / 0.9);
        A.inner.scale.y = Math.max(0.001, easeOutBack(A.show));
        if (rnd() < dt * 30){ A.group.getWorldPosition(_cw); emitDust(_cw.x + rr(-1, 1), _cw.y, _cw.z + rr(-1, 1), 2, 1.4); }
      } else if (A.showT < 0.5 && A.show > 0){
        A.show = Math.max(0, A.show - dt / 0.7);
        A.inner.scale.y = Math.max(0.001, A.show);
        if (rnd() < dt * 40){ A.group.getWorldPosition(_cw); emitBurst(_cw.x + rr(-0.6, 0.6), _cw.y + A.show * 2.5, _cw.z + rr(-0.6, 0.6), 2, 'stoneD', 'stone', 3, 0.8, 0.3, false); }
        if (A.show <= 0) A.group.visible = false;
      }
    });
  });
}
function castleTopWorld(V){ return new V3(V.c.x, V.group.position.y + V.top, V.c.z); }
function gateWorld(V){ return [V.c.x + V.gate[0], V.c.z + V.gate[1]]; }
// where a tower shoots from, in world space
function muzzleWorld(A){
  var p = new V3();
  if (A.aim){ A.aim.updateMatrixWorld(true); p.copy(A.muzzleLocal); (A.barrel || A.aim).localToWorld(p); }
  else { A.group.updateMatrixWorld(true); p.copy(A.muzzle); A.inner.localToWorld(p); }
  return p;
}
function aimAt(A, x, z){
  if (!A.aim) return;
  A.group.updateMatrixWorld(true);
  var p = new V3(x, 0, z); A.aim.parent.worldToLocal(p);
  A.aim.rotation.y = Math.atan2(p.x - A.aim.position.x, p.z - A.aim.position.z);
}
/* ===================== 08 · the warriors: chunky tabletop miniatures, instanced, animated in the vertex shader ===================== */
// limbs (the 'bone' attribute): 0 body, 1 left leg, 2 right leg, 3 weapon arm (right), 4 shield arm (left)
var MINI = { hip: 0.4, sho: 0.7, scale: 1.0 };
function miniFigure(k, o, ok){
  o = o || {};
  var team = o.team || 1, v = o.variant || 0, L = !!o.limbs;
  var tk = ok || k, own = !!ok;
  var tun = own ? '#FFFFFF' : (team === 1 ? 'team' : 'enemy'), tunD = own ? '#B9B9C0' : (team === 1 ? 'teamD' : 'enemyD');
  var skin = o.skin || (team === 2 ? pick(['#C9A07E', '#B48C78', '#A3889A']) : pick(['#F2C8A8', '#E2AE8A', '#C88E6C']));
  function B(id){ if (L) k.bone = id; }
  // legs
  [[1, 0.088], [2, -0.088]].forEach(function(l){
    B(l[0]);
    k.cyl(0.066, 0.072, 0.24, team === 2 ? '#4C3C44' : 'leatherD', { x: l[1], y: 0.29, n: 8, mat: 'cloth' });
    k.cyl(0.074, 0.07, 0.12, 'boots', { x: l[1], y: 0.13, n: 8, mat: 'cloth' });
    k.box(0.12, 0.09, 0.2, 'boots', { x: l[1], y: 0.045, z: 0.03, mat: 'cloth', r: 0.035 });
  });
  B(0);
  // hips, belt and tunic
  k.box(0.3, 0.13, 0.22, 'leatherD', { y: 0.43, mat: 'cloth', r: 0.05 });
  tk.box(0.34, 0.3, 0.24, tun, { y: 0.6, mat: 'cloth', r: 0.08 });
  tk.box(0.3, 0.16, 0.035, tunD, { y: 0.38, z: 0.1, mat: 'cloth', r: 0.012 });
  tk.box(0.3, 0.16, 0.035, tunD, { y: 0.38, z: -0.1, mat: 'cloth', r: 0.012 });
  k.box(0.36, 0.05, 0.26, 'leatherD', { y: 0.47, mat: 'cloth', r: 0.02 });
  k.box(0.06, 0.05, 0.03, 'gold', { y: 0.47, z: 0.13, mat: 'gold', r: 0.01 });
  if (team === 1){ k.box(0.05, 0.16, 0.02, 'cloth2', { y: 0.62, z: 0.125, mat: 'cloth', r: 0 }); k.box(0.14, 0.045, 0.02, 'cloth2', { y: 0.65, z: 0.125, mat: 'cloth', r: 0 }); }
  else if (team === 2) { for (var f = 0; f < 9; f++){ var a = f / 9 * TAU; k.cone(0.05, 0.16, 'wolfL', { x: Math.cos(a) * 0.17, y: 0.75, z: Math.sin(a) * 0.12, rz: Math.cos(a) * 1.2, rx: -Math.sin(a) * 1.2, n: 4, mat: 'cloth' }); } }
  // head with a tiny face
  k.cyl(0.05, 0.06, 0.08, skin, { y: 0.76, n: 8, mat: 'skin' });
  k.box(0.28, 0.26, 0.26, skin, { y: 0.9, mat: 'skin', r: 0.085, seg: 2 });
  [-1, 1].forEach(function(s){ k.box(0.04, 0.05, 0.02, '#1E1712', { x: s * 0.062, y: 0.9, z: 0.131, mat: 'matte', r: 0.008 }); });
  if (team === 0 || (team === 2 && v === 1)){
    // a deep hood with a shadowed face
    tk.box(0.33, 0.17, 0.31, tunD, { y: 1.02, z: -0.01, mat: 'cloth', r: 0.07, seg: 2 });
    tk.box(0.33, 0.3, 0.14, tunD, { y: 0.92, z: -0.1, mat: 'cloth', r: 0.06 });
    [-1, 1].forEach(function(s){ tk.box(0.05, 0.28, 0.27, tunD, { x: s * 0.155, y: 0.92, mat: 'cloth', r: 0.02 }); });
    tk.cone(0.09, 0.18, tunD, { y: 1.04, z: -0.19, rx: -2.3, n: 6, mat: 'cloth' });
    if (team === 2) k.box(0.22, 0.16, 0.02, '#1A1220', { y: 0.89, z: 0.135, mat: 'matte', r: 0.02 });
  } else if (team === 1 && v === 0){
    // kettle hat with a crest
    k.ball(0.17, 'steel', { y: 0.99, sy: 0.82, n: 12, m: 6, tl: Math.PI * 0.5, mat: 'metal' });
    k.cyl(0.25, 0.25, 0.03, 'steel', { y: 0.99, n: 14, sharp: true, mat: 'metal' });
    tk.box(0.035, 0.1, 0.22, tun, { y: 1.15, mat: 'cloth', r: 0.015 });
  } else if (team === 1){
    // closed helm with a plume
    k.box(0.32, 0.3, 0.31, 'steel', { y: 0.93, mat: 'metal', r: 0.09, seg: 2 });
    k.box(0.22, 0.03, 0.02, '#141414', { y: 0.93, z: 0.158, mat: 'matte', r: 0.005 });
    k.box(0.03, 0.12, 0.03, 'gold', { y: 0.86, z: 0.158, mat: 'gold', r: 0.008 });
    for (var p = 0; p < 4; p++) tk.ball(0.06, tun, { y: 1.12 + Math.sin(p * 0.7) * 0.03, z: 0.08 - p * 0.07, sy: 1.25, n: 6, m: 5, mat: 'cloth' });
  } else {
    // horned helm
    k.ball(0.17, 'steelD', { y: 0.98, sy: 0.9, n: 12, m: 7, tl: Math.PI * 0.55, mat: 'metal' });
    k.box(0.03, 0.14, 0.04, 'steelD', { y: 0.9, z: 0.14, mat: 'metal', r: 0.01 });
    [-1, 1].forEach(function(s){ k.tube([new V3(s * 0.13, 1.0, 0), new V3(s * 0.25, 1.06, 0.02), new V3(s * 0.28, 1.2, 0.05)], 0.035, 0.008, 'tusk', { ts: 5, rs: 5, cap: true }); });
  }
  // weapon arm (right side is -x)
  B(3);
  tk.ball(0.075, tun, { x: -0.2, y: 0.7, n: 8, m: 6, mat: 'cloth' });
  tk.cyl(0.055, 0.062, 0.22, tun, { x: -0.21, y: 0.58, n: 8, mat: 'cloth' });
  k.box(0.075, 0.08, 0.07, team === 2 ? skin : 'leather', { x: -0.215, y: 0.44, mat: 'skin', r: 0.025 });
  if (o.bow){
    // archers keep the bow in this hand
    var pts = []; for (var i = 0; i <= 8; i++){ var t = i / 8 - 0.5; pts.push(new V3(-0.22, 0.46 + t * 0.78, 0.08 - Math.cos(t * Math.PI) * 0.12 + 0.12 * 0.7)); }
    k.tube(pts, 0.018, 0.018, 'woodD', { ts: 10, rs: 5, mat: 'wood' });
    k.cyl(0.004, 0.004, 0.76, 'linen', { x: -0.22, y: 0.46, z: 0.04, n: 3 });
  } else if (team === 1 && v === 0){
    k.cyl(0.018, 0.02, 1.25, 'wood', { x: -0.215, y: 0.78, z: 0.02, n: 5, mat: 'wood' });
    k.cone(0.045, 0.2, 'steelL', { x: -0.215, y: 1.5, z: 0.02, n: 4, mat: 'metal' });
  } else if (team === 1){
    k.box(0.055, 0.5, 0.016, 'steelL', { x: -0.215, y: 0.74, z: 0.02, mat: 'metal', r: 0.008 });
    k.cone(0.028, 0.08, 'steelL', { x: -0.215, y: 1.03, z: 0.02, sz: 0.3, n: 4, mat: 'metal' });
    k.box(0.18, 0.035, 0.05, 'gold', { x: -0.215, y: 0.49, z: 0.02, mat: 'gold', r: 0.01 });
  } else if (v === 0){
    k.cyl(0.02, 0.022, 0.62, 'wood', { x: -0.215, y: 0.62, z: 0.02, n: 5, mat: 'wood' });
    var s2 = new THREE.Shape(); s2.moveTo(0, 0.06); s2.quadraticCurveTo(0.12, 0.12, 0.17, 0.15); s2.lineTo(0.17, -0.11); s2.quadraticCurveTo(0.12, -0.07, 0, -0.06); s2.lineTo(0, 0.06);
    k.geo(gExtrude(s2, 0.03), 'steelL', { x: -0.215, y: 0.86, z: 0.04, ry: -Math.PI / 2, mat: 'metal' });
  } else {
    k.cyl(0.03, 0.07, 0.62, 'trunk', { x: -0.215, y: 0.66, z: 0.02, n: 7, mat: 'wood' });
    for (var sp = 0; sp < 5; sp++){ var a2 = sp / 5 * TAU; k.cone(0.025, 0.09, 'metalD', { x: -0.215 + Math.cos(a2) * 0.07, y: 0.86 + (sp % 2) * 0.06, z: 0.02 + Math.sin(a2) * 0.07, rz: -Math.cos(a2) * 1.4, rx: Math.sin(a2) * 1.4, n: 4, mat: 'metal' }); }
  }
  // shield arm
  B(4);
  tk.ball(0.075, tun, { x: 0.2, y: 0.7, n: 8, m: 6, mat: 'cloth' });
  tk.cyl(0.055, 0.062, 0.22, tun, { x: 0.21, y: 0.58, n: 8, mat: 'cloth' });
  k.box(0.075, 0.08, 0.07, team === 2 ? skin : 'leather', { x: 0.215, y: 0.44, mat: 'skin', r: 0.025 });
  if (!o.bow){
    if (team === 1){
      var ks = new THREE.Shape(); ks.moveTo(-0.15, 0.16); ks.lineTo(0.15, 0.16); ks.quadraticCurveTo(0.16, -0.08, 0, -0.25); ks.quadraticCurveTo(-0.16, -0.08, -0.15, 0.16);
      k.geo(gExtrude(ks, 0.035, 0.01), 'team', { x: 0.29, y: 0.56, z: 0.04, ry: Math.PI / 2, mat: 'wood' });
      k.box(0.02, 0.3, 0.045, 'cloth2', { x: 0.314, y: 0.54, z: 0.04, mat: 'cloth', r: 0 });
      k.box(0.02, 0.045, 0.22, 'cloth2', { x: 0.314, y: 0.6, z: 0.04, mat: 'cloth', r: 0 });
    } else {
      k.cyl(0.17, 0.17, 0.035, 'enemy', { x: 0.29, y: 0.56, z: 0.03, rz: Math.PI / 2, n: 14, mat: 'wood' });
      k.torus(0.17, 0.016, 'metalD', { x: 0.295, y: 0.56, z: 0.03, ry: Math.PI / 2, ts: 16, mat: 'metal' });
      k.ball(0.045, 'metalL', { x: 0.31, y: 0.56, z: 0.03, sx: 0.6, n: 8, m: 5, mat: 'metal' });
    }
  }
  if (L) k.bone = 0;
}
// the instanced material: legs and arms swing around the hip and the shoulder
var MINI_GLSL_FN = [
  'attribute float bone;',
  'attribute vec4 aAnim;',
  'float sAng(float b, vec4 an){',
  '  float ph = an.x, wk = an.y, at = an.z, s = sin(ph);',
  '  if (b > 0.5 && b < 1.5) return s * 0.75 * wk;',
  '  if (b > 1.5 && b < 2.5) return -s * 0.75 * wk;',
  '  if (b > 2.5 && b < 3.5){ float raise = pow(0.5 + 0.5 * sin(an.w), 0.55); return mix(-s * 0.5 * wk, -0.25 - raise * 2.1, at); }',
  '  if (b > 3.5) return mix(s * 0.38 * wk, -0.6, at);',
  '  return 0.0;',
  '}'
].join('\n');
function miniMat(){
  var m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.78, metalness: 0.06 });
  m.onBeforeCompile = function(sh){
    sh.vertexShader = MINI_GLSL_FN + '\n' + sh.vertexShader
      .replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>\nfloat sA = sAng(bone, aAnim); float sC = cos(sA), sS = sin(sA);\nobjectNormal = vec3(objectNormal.x, objectNormal.y * sC - objectNormal.z * sS, objectNormal.y * sS + objectNormal.z * sC);')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nif (bone > 0.5){ float pivY = bone > 2.5 ? ' + MINI.sho.toFixed(3) + ' : ' + MINI.hip.toFixed(3) + '; vec3 q = transformed - vec3(0.0, pivY, 0.0); transformed = vec3(q.x, q.y * sC - q.z * sS, q.y * sS + q.z * sC) + vec3(0.0, pivY, 0.0); }\ntransformed.y += abs(cos(aAnim.x)) * 0.05 * aAnim.y;');
  };
  m.customProgramCacheKey = function(){ return 'mini'; };
  return regMat(m);
}

/* ---------- the two armies ---------- */
var ARMY = { 1: [], 2: [], meshes: [], mat: null };
var ARMY_N = 50;
var _sq = new THREE.Quaternion(), _se = new THREE.Euler(), _sp = new V3(), _ss = new V3(), _sm = new THREE.Matrix4();
function buildArmies(root){
  ARMY.mat = miniMat();
  [1, 2].forEach(function(team){
    var meshes = [];
    for (var v = 0; v < 2; v++){
      reseed(900 + team * 10 + v);
      var geo = geoOf(function(k){ k.bone = 0; miniFigure(k, { team: team, variant: v, limbs: true }); });
      var cap = Math.ceil(ARMY_N / 2);
      geo.setAttribute('aAnim', new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4).setUsage(THREE.DynamicDrawUsage));
      var mesh = new THREE.InstancedMesh(geo, ARMY.mat, cap);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.castShadow = true; mesh.receiveShadow = true; mesh.frustumCulled = false;
      var c = new THREE.Color();
      for (var i = 0; i < cap; i++){ mesh.setColorAt(i, c.setScalar(rr(0.9, 1.06))); }
      mesh.instanceColor.needsUpdate = true;
      root.add(mesh); meshes.push(mesh); ARMY.meshes.push(mesh);
    }
    for (var j = 0; j < ARMY_N; j++){
      var s = { team: team, id: j, mesh: meshes[j % 2], idx: Math.floor(j / 2), x: 0, z: 0, y: 0, ry: team === 1 ? Math.PI : 0, ryT: null,
        vis: 0, visT: 0, ph: rnd() * TAU, chop: rnd() * TAU, walk: 0, atk: 0, atkT: 0, fall: 0, hop: 0, cheer: 0,
        route: null, ri: 0, speed: rr(4.9, 5.4), delay: 0, state: 'off', alive: true, dieT: 0, task: null, onArrive: null, sz: rr(0.96, 1.05) };
      ARMY[team].push(s);
    }
  });
}
function soldierGo(s, route, delay, onArrive){
  s.route = route; s.ri = 0; s.delay = delay || 0; s.state = 'move'; s.onArrive = onArrive || null;
}
function soldierPlace(s, x, z, ry){ s.x = x; s.z = z; s.ry = ry; s.ryT = ry; s.route = null; s.state = 'stand'; s.vis = s.visT = 1; s.alive = true; s.fall = 0; s.atk = s.atkT = 0; s.cheer = 0; }
function soldierKill(s, delay){
  if (!s.alive) return;
  s.alive = false; s.route = null; s.state = 'die'; s.dieT = -(delay || 0); s.atkT = 0;
}
function soldierHide(s){ s.state = 'off'; s.vis = s.visT = 0; s.route = null; s.alive = true; s.fall = 0; s.cheer = 0; s.atk = s.atkT = 0; }
function updateSoldiers(dt, t){
  [1, 2].forEach(function(team){
    ARMY[team].forEach(function(s){
      if (s.state === 'off' && s.vis <= 0.001){ writeSoldier(s); return; }
      var moving = false;
      if (s.state === 'move' && s.route){
        if (s.delay > 0) s.delay -= dt;
        else {
          var tgt = s.route[s.ri], dx = tgt[0] - s.x, dz = tgt[1] - s.z, d = Math.sqrt(dx * dx + dz * dz), step = s.speed * dt;
          if (d <= step){
            s.x = tgt[0]; s.z = tgt[1]; s.ri++;
            if (s.ri >= s.route.length){ s.route = null; s.state = 'stand'; if (s.onArrive){ var fn = s.onArrive; s.onArrive = null; fn(s); } }
          } else { s.x += dx / d * step; s.z += dz / d * step; s.ryT = Math.atan2(dx, dz); moving = true; }
        }
      }
      if (s.state === 'die'){
        s.dieT += dt;
        if (s.dieT > 0){ s.fall = Math.min(1, s.fall + dt * 2.6); if (s.dieT > 1.1) s.visT = 0; if (s.dieT > 1.6) s.state = 'off'; }
      }
      s.walk += ((moving ? 1 : 0) - s.walk) * Math.min(1, dt * 8);
      s.atk += (s.atkT - s.atk) * Math.min(1, dt * 7);
      if (moving) s.ph += dt * s.speed * 2.5;
      if (s.atk > 0.02) s.chop += dt * (6.5 + (s.id % 5) * 0.4);
      s.vis += (s.visT - s.vis) * Math.min(1, dt * 7);
      if (s.ryT !== null) s.ry += angDiff(s.ry, s.ryT) * Math.min(1, dt * 9);
      s.hop = s.cheer > 0 ? Math.abs(Math.sin(t * 8.5 + s.id * 1.7)) * 0.22 * s.cheer : 0;
      writeSoldier(s);
    });
  });
  ARMY.meshes.forEach(function(m){ m.instanceMatrix.needsUpdate = true; m.geometry.attributes.aAnim.needsUpdate = true; });
}
function writeSoldier(s){
  var sc = s.vis * s.sz * MINI.scale;
  if (sc < 0.002){ _sm.makeScale(0, 0, 0); s.mesh.setMatrixAt(s.idx, _sm); return; }
  s.y = groundY(s.x, s.z);
  _se.set(-s.fall * 1.42, s.ry, 0, 'YXZ'); _sq.setFromEuler(_se);
  _sp.set(s.x, s.y + s.hop - s.fall * Math.max(0, s.dieT - 0.6) * 0.25, s.z); _ss.set(sc, sc, sc);
  _sm.compose(_sp, _sq, _ss);
  s.mesh.setMatrixAt(s.idx, _sm);
  var a = s.mesh.geometry.attributes.aAnim.array, o = s.idx * 4;
  a[o] = s.ph; a[o + 1] = s.walk; a[o + 2] = Math.max(s.atk, s.cheer * 0.6); a[o + 3] = s.chop;
}

/* ---------- formations ---------- */
// a block of n slots centred on (cx, cz), facing direction ang (atan2(dx, dz)); rows go backwards
function blockSlots(n, cx, cz, ang, cols, gap){
  gap = gap || 0.52; cols = Math.max(1, Math.min(cols || 6, n));
  var out = [], fx = Math.sin(ang), fz = Math.cos(ang), rx = Math.cos(ang), rz = -Math.sin(ang), rows = Math.ceil(n / cols);
  for (var i = 0; i < n; i++){
    var r = Math.floor(i / cols), c = i % cols, inRow = Math.min(cols, n - r * cols), off = (c - (inRow - 1) / 2) * gap + (r % 2 ? gap * 0.25 : 0), back = r * gap * 0.92;
    out.push([cx + rx * off - fx * back, cz + rz * off - fz * back, r]);
  }
  return out;
}
// a march route along a road with a lateral offset; ends at the given slot
function roadRoute(pts, lateral, endX, endZ, from){
  var out = [], N = pts.length;
  for (var i = 0; i < N; i++){
    var a = pts[Math.max(0, i - 1)], b = pts[Math.min(N - 1, i + 1)], dx = b[0] - a[0], dz = b[1] - a[1], L = Math.sqrt(dx * dx + dz * dz) || 1;
    var nx = -dz / L, nz = dx / L, fade = Math.min(1, i / 3);
    if (i % 2 && i < N - 2) out.push([pts[i][0] + nx * lateral * fade, pts[i][1] + nz * lateral * fade]);
  }
  out.push([endX, endZ]);
  if (from) out.unshift(from);
  return out;
}
function routeLen(r, sx, sz){ var L = 0, px = sx, pz = sz; r.forEach(function(p){ L += hyp(p[0] - px, p[1] - pz); px = p[0]; pz = p[1]; }); return L; }
/* ===================== 09 · effects: particles, fire, smoke, projectiles ===================== */
var FX = { sys: [], fires: [], proj: [], smokers: [] };
var FXROOT = null;
function puffTexture(){
  var cv = document.createElement('canvas'); cv.width = cv.height = 64; var g = cv.getContext('2d');
  var gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.45, 'rgba(255,255,255,0.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  var t = new THREE.CanvasTexture(cv); return t;
}
var PUFF_TEX = null;
function PSys(max, additive){
  this.max = max; this.n = 0;
  this.p = new Float32Array(max * 3); this.v = new Float32Array(max * 3); this.c = new Float32Array(max * 3); this.sz = new Float32Array(max); this.al = new Float32Array(max);
  this.life = new Float32Array(max); this.age = new Float32Array(max); this.s0 = new Float32Array(max); this.s1 = new Float32Array(max); this.a0 = new Float32Array(max); this.gr = new Float32Array(max); this.dr = new Float32Array(max); this.fl = new Float32Array(max);
  var g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(this.p, 3).setUsage(THREE.DynamicDrawUsage));
  g.setAttribute('color', new THREE.BufferAttribute(this.c, 3).setUsage(THREE.DynamicDrawUsage));
  g.setAttribute('size', new THREE.BufferAttribute(this.sz, 1).setUsage(THREE.DynamicDrawUsage));
  g.setAttribute('alpha', new THREE.BufferAttribute(this.al, 1).setUsage(THREE.DynamicDrawUsage));
  g.setDrawRange(0, 0);
  if (!PUFF_TEX) PUFF_TEX = puffTexture();
  var m = new THREE.ShaderMaterial({
    uniforms: { scale: { value: 600 }, tex: { value: PUFF_TEX } },
    vertexShader: 'uniform float scale; attribute float size; attribute float alpha; varying vec3 vC; varying float vA; void main(){ vC = color; vA = alpha; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = size * scale / max(-mv.z, 0.1); gl_Position = projectionMatrix * mv; }',
    fragmentShader: 'uniform sampler2D tex; varying vec3 vC; varying float vA; void main(){ float a = texture2D(tex, gl_PointCoord).a * vA; if (a < 0.01) discard; gl_FragColor = vec4(vC, a); }',
    vertexColors: true, transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending
  });
  this.mat = m;
  this.points = new THREE.Points(g, m); this.points.frustumCulled = false; this.points.layers.set(1); this.points.renderOrder = additive ? 5 : 4;
  this.geo = g;
}
PSys.prototype.emit = function(x, y, z, vx, vy, vz, life, s0, s1, col, a0, grav, drag, flick){
  if (this.n >= this.max) return;
  var i = this.n++;
  this.p[i * 3] = x; this.p[i * 3 + 1] = y; this.p[i * 3 + 2] = z; this.v[i * 3] = vx; this.v[i * 3 + 1] = vy; this.v[i * 3 + 2] = vz;
  this.c[i * 3] = col.r; this.c[i * 3 + 1] = col.g; this.c[i * 3 + 2] = col.b;
  this.life[i] = life; this.age[i] = 0; this.s0[i] = s0; this.s1[i] = s1; this.a0[i] = a0; this.gr[i] = grav || 0; this.dr[i] = drag || 0; this.fl[i] = flick || 0;
};
PSys.prototype.update = function(dt){
  var n = this.n, i = 0;
  while (i < n){
    this.age[i] += dt;
    if (this.age[i] >= this.life[i]){ n--; this.copy(n, i); continue; }
    var k = 1 - this.dr[i] * dt;
    this.v[i * 3] *= k; this.v[i * 3 + 1] = this.v[i * 3 + 1] * k - this.gr[i] * dt; this.v[i * 3 + 2] *= k;
    this.p[i * 3] += this.v[i * 3] * dt; this.p[i * 3 + 1] += this.v[i * 3 + 1] * dt; this.p[i * 3 + 2] += this.v[i * 3 + 2] * dt;
    var t = this.age[i] / this.life[i];
    this.sz[i] = lerp(this.s0[i], this.s1[i], t);
    var a = this.a0[i] * Math.min(1, t * 8) * (1 - t * t);
    if (this.fl[i]) a *= 0.5 + 0.5 * Math.sin(this.age[i] * this.fl[i] + i);
    this.al[i] = a;
    i++;
  }
  this.n = n;
  this.geo.setDrawRange(0, n);
  this.geo.attributes.position.needsUpdate = true; this.geo.attributes.color.needsUpdate = true; this.geo.attributes.size.needsUpdate = true; this.geo.attributes.alpha.needsUpdate = true;
  this.mat.uniforms.scale.value = renderer.domElement.height / (2 * Math.tan(camera.fov * Math.PI / 360));
};
PSys.prototype.copy = function(from, to){
  var a = [this.p, this.v, this.c];
  for (var q = 0; q < 3; q++) for (var j = 0; j < 3; j++) a[q][to * 3 + j] = a[q][from * 3 + j];
  [this.sz, this.al, this.life, this.age, this.s0, this.s1, this.a0, this.gr, this.dr, this.fl].forEach(function(arr){ arr[to] = arr[from]; });
};
function initFX(root){
  FXROOT = root;
  FX.sys.forEach(function(s){ s.geo.dispose(); s.mat.dispose(); });
  FX.glow = new PSys(2600, true); FX.soft = new PSys(1800, false);
  FX.sys = [FX.glow, FX.soft];
  root.add(FX.glow.points); root.add(FX.soft.points);
  FX.fires = []; FX.lights = []; FX.proj = []; FX.ambient = []; FX.smokers = [];
}
var _fc = new THREE.Color();
function col3(c, k){ _fc.copy(linC(c)); if (k) _fc.multiplyScalar(k); return _fc; }
function emitDust(x, y, z, n, r){
  var c = linC('dust').lerp(linC('path'), 0.4);
  for (var i = 0; i < n; i++){ var a = rnd() * TAU, sp = rr(0.6, 1.6) * (r || 1); FX.soft.emit(x + Math.cos(a) * 0.4, y + 0.1, z + Math.sin(a) * 0.4, Math.cos(a) * sp, rr(0.3, 1.2), Math.sin(a) * sp, rr(0.9, 1.6), rr(0.5, 0.8), rr(1.3, 2.2), c, 0.45, -0.1, 1.6); }
}
function emitBurst(x, y, z, n, colA, colB, speed, life, size, add){
  var S = add === false ? FX.soft : FX.glow;
  for (var i = 0; i < n; i++){ var a = rnd() * TAU, b = rr(-0.4, 1.2), sp = rr(0.4, 1) * speed; S.emit(x, y, z, Math.cos(a) * Math.cos(b) * sp, Math.sin(b) * sp, Math.sin(a) * Math.cos(b) * sp, life * rr(0.6, 1.2), size, size * 0.3, (rnd() < 0.5 ? linC(colA) : linC(colB)).multiplyScalar(add === false ? 1 : 1.8), 1, add === false ? 6 : 2.5, 1.2); }
}
function addFire(parent, x, y, z, s, o){
  o = o || {};
  var g = new THREE.Group(); g.position.set(x, y, z); g.scale.setScalar(s); parent.add(g);
  var k = new Kit(), mg = !!o.magic, cols = mg ? [['#B05CFF', 1.0, 0.36, 0.9], ['#E0A8FF', 1.0, 0.22, 0.72], ['#F8ECFF', 1, 0.1, 0.42]] : [['fire', 1.0, 0.36, 0.9], ['fireHot', 1.0, 0.22, 0.72], ['#FFF4D0', 1, 0.1, 0.42]];
  var flames = [];
  cols.forEach(function(c, i){
    var fk = new Kit(); fk.cone(c[2], c[3], c[0], { y: c[3] / 2, n: 7, mat: 'glow', e: 5.0 * c[1], j: 0 });
    var m = fk.build({ cast: false }); m.children.forEach(function(ch){ ch.material = MATS.flame; ch.layers.set(1); });
    g.add(m); flames.push(m);
  });
  for (var j = 0; j < 3; j++){ var fk2 = new Kit(); var a = j / 3 * TAU; fk2.cone(0.16, 0.55, mg ? '#B05CFF' : 'fire', { x: Math.cos(a) * 0.18, y: 0.27, z: Math.sin(a) * 0.18, n: 6, mat: 'glow', e: 4, j: 0 }); var m2 = fk2.build({ cast: false }); m2.children.forEach(function(ch){ ch.material = MATS.flame; ch.layers.set(1); }); g.add(m2); flames.push(m2); }
  var F2 = { g: g, flames: flames, s: s, wp: new V3(), smoke: o.smoke !== false, seed: rnd() * 10, t: 0, magic: mg };
  FX.fires.push(F2);
  return F2;
}
function updateFires(t, dt){
  FX.fires.forEach(function(F2){
    var i;
    for (i = 0; i < F2.flames.length; i++){
      var f = F2.flames[i], ph = t * (7 + i * 1.3) + F2.seed + i;
      f.scale.set(1 + Math.sin(ph * 1.3) * 0.08, 0.85 + Math.sin(ph) * 0.18 + Math.sin(ph * 2.7) * 0.08, 1 + Math.cos(ph * 1.1) * 0.08);
      f.rotation.y = ph * 0.2;
    }
    F2.g.getWorldPosition(F2.wp);
    F2.t += dt;
    if (rnd() < dt * 14) FX.glow.emit(F2.wp.x + rr(-0.15, 0.15) * F2.s, F2.wp.y + 0.6 * F2.s, F2.wp.z + rr(-0.15, 0.15) * F2.s, rr(-0.3, 0.3), rr(1.2, 2.4), rr(-0.3, 0.3), rr(0.8, 1.6), 0.09 * F2.s + 0.04, 0.02, col3(F2.magic ? 'crystal2' : 'ember', 2.2), 1, -0.2, 0.6, 18);
    if (F2.smoke && rnd() < dt * 5) FX.soft.emit(F2.wp.x, F2.wp.y + 1.0 * F2.s, F2.wp.z, rr(-0.15, 0.15), rr(0.8, 1.3), rr(-0.15, 0.15) + 0.2, rr(2.5, 4), 0.5 * F2.s + 0.3, 2.2 * F2.s + 1, col3(F2.magic ? '#D8C8EC' : 'smoke', 0.8), 0.32, -0.08, 0.3);
  });
}
function addSmoker(parent, p, k){ FX.smokers.push({ parent: parent, p: p.clone(), k: k || 1, wp: new V3() }); }
function updateSmokers(dt){
  FX.smokers.forEach(function(S){
    if (rnd() > dt * 4 * S.k) return;
    S.wp.copy(S.p); S.parent.localToWorld(S.wp);
    FX.soft.emit(S.wp.x, S.wp.y, S.wp.z, rr(-0.1, 0.1) + 0.25, rr(0.7, 1.1), rr(-0.1, 0.1) + 0.1, rr(3.5, 5.5), 0.45, 2.6, col3('smoke', 0.9), 0.38, -0.05, 0.2);
  });
}
function arrowMesh(big){
  var k = new Kit(), L = big ? 1.8 : 0.9, r = big ? 0.035 : 0.014;
  k.cyl(r, r, L, 'arrow', { rx: Math.PI / 2, n: 4, mat: 'wood' });
  k.cone(r * 3, L * 0.14, 'steelL', { z: L / 2 + L * 0.06, rx: Math.PI / 2, n: 4, mat: 'metal' });
  k.box(0.01, r * 6, L * 0.14, 'fletch', { z: -L / 2 + L * 0.08, r: 0 }); k.box(r * 6, 0.01, L * 0.14, 'fletch', { z: -L / 2 + L * 0.08, r: 0 });
  return k.build();
}
function orbMesh(col, r){ var k = new Kit(); k.ico(r, col, { mat: 'glow', e: 5, d: 1 }); var m = k.build({ cast: false }); return m; }
function ballMesh(){ var k = new Kit(); k.ball(0.22, 'metalD', { mat: 'metal', n: 10, m: 8 }); return k.build(); }
// fly from a to b in a ballistic arc; onHit fires at the end
var PROJ_T = {};
function launch(type, a, b, dur, arc, onHit){
  var T = PROJ_T[type] || (PROJ_T[type] = type === 'arrow' ? arrowMesh(false) : type === 'bolt' ? arrowMesh(true) : type === 'ball' ? ballMesh() : orbMesh(type === 'magic' ? 'magic' : 'magic2', 0.22));
  var m = T.clone(); m.position.copy(a);
  FXROOT.add(m);
  FX.proj.push({ m: m, a: a.clone(), b: b.clone(), t: 0, dur: dur, arc: arc, hit: onHit, type: type, stick: type === 'arrow' || type === 'bolt' ? 1.4 : 0, prev: a.clone() });
}
function updateProjectiles(dt){
  for (var i = FX.proj.length - 1; i >= 0; i--){
    var P = FX.proj[i];
    if (P.t >= P.dur){
      P.stick -= dt;
      if (P.stick <= 0){ FXROOT.remove(P.m); FX.proj.splice(i, 1); }
      continue;
    }
    P.t = Math.min(P.dur, P.t + dt);
    var u = P.t / P.dur, x = lerp(P.a.x, P.b.x, u), z = lerp(P.a.z, P.b.z, u), y = lerp(P.a.y, P.b.y, u) + Math.sin(u * Math.PI) * P.arc;
    P.m.position.set(x, y, z);
    var d = new V3(x - P.prev.x, y - P.prev.y, z - P.prev.z);
    if (d.lengthSq() > 1e-6){ P.m.lookAt(x + d.x, y + d.y, z + d.z); }
    P.prev.set(x, y, z);
    if (P.type === 'magic' || P.type === 'magic2'){ FX.glow.emit(x, y, z, rr(-0.3, 0.3), rr(-0.3, 0.3), rr(-0.3, 0.3), 0.5, 0.35, 0.05, col3(rnd() < 0.5 ? 'magic' : 'magic2', 2), 1, 0, 1); P.m.rotation.x += dt * 9; }
    if (P.type === 'ball' && rnd() < 0.5) FX.soft.emit(x, y, z, 0, 0.2, 0, 0.8, 0.25, 0.6, col3('smoke', 0.8), 0.3, 0, 1);
    if (P.t >= P.dur){
      if (P.hit) P.hit(P);
      if (P.type === 'magic' || P.type === 'magic2' || P.type === 'ball'){ P.stick = 0; }
    }
  }
}

/* ---------- ambient life: spores rise out of the blight, motes over the Valley's meadows ---------- */
function updateAmbient(t, dt){
  var zs = TERR.zone.value, ns = dt * (LOWQ ? 40 : 70);
  while (ns > 0){
    if (rnd() < ns){
      var z = zs[Math.floor(rnd() * zs.length)];
      if (z.z > 0 && Math.abs(z.w) > 0.5){
        var a = rnd() * TAU, d = Math.sqrt(rnd()) * z.z * 0.62, x = z.x + Math.cos(a) * d, zz = z.y + Math.sin(a) * d;
        if (z.w < 0) FX.glow.emit(x, groundY(x, zz) + rr(0.05, 1.4), zz, rr(-0.12, 0.12), rr(0.12, 0.38), rr(-0.12, 0.12), rr(4, 7.5), rr(0.05, 0.085), 0.03, col3('#F4EEFF', 1.15), 0.85, -0.01, 0.15, rnd() < 0.3 ? 4 : 0);
        else if (rnd() < 0.35) FX.glow.emit(x, groundY(x, zz) + rr(0.2, 1.8), zz, rr(-0.1, 0.1), rr(0.08, 0.25), rr(-0.1, 0.1), rr(3, 6), rr(0.05, 0.08), 0.03, col3('#FFF2B8', 1.3), 0.8, -0.01, 0.2, 3);
      }
    }
    ns -= 1;
  }
}
function updateFX(t, dt){
  updateFires(t, dt); updateSmokers(dt); updateProjectiles(dt); updateAmbient(t, dt);
  FX.sys.forEach(function(s){ s.update(dt); });
}
/* ===================== 10 · rules: rounds, battles, gold and glory ===================== */
var TROOPS = 50;
var G = null;
var NAMES = [null, 'Долина', 'Порча'];
function newMatch(opts){
  G = {
    mode: opts.mode || 'bot', diff: opts.diff || 'hard', rounds: opts.rounds || 7, round: 1,
    castles: CASTLES.map(function(){ return { owner: 0, level: 0 }; }),
    pl: [null, { gold: 0, glory: 0 }, { gold: 0, glory: 0 }],
    plans: { 1: null, 2: null }, last: { 1: null, 2: null },
    hist: { 1: [], 2: [] }, results: [], phase: 'plan'
  };
  return G;
}
function emptyPlan(){ return { alloc: [0, 0, 0, 0, 0], upg: [false, false, false, false, false] }; }
function planUsed(plan){ return plan.alloc.reduce(function(a, b){ return a + b; }, 0); }
function upgCost(i){ var c = G.castles[i]; return c.level < 3 ? UPG_COST[c.level] : Infinity; }
function planGold(plan){ var s = 0; plan.upg.forEach(function(u, i){ if (u) s += upgCost(i); }); return s; }
function canUpgrade(p, i, plan){
  var c = G.castles[i];
  if (c.owner !== p || c.level >= 3) return false;
  return plan.upg[i] || G.pl[p].gold - planGold(plan) >= upgCost(i);
}
// one castle, pure: who holds it after this round
function fight(owner, level, a1, a2){
  var B = { owner: owner, level: level, a1: a1, a2: a2, fire: FIRE[level], killed: 0, winner: owner, captured: false, surv: 0, lost: [0, 0, 0], levelAfter: level };
  if (owner === 0){
    if (a1 > a2){ B.winner = 1; B.surv = a1 - a2; }
    else if (a2 > a1){ B.winner = 2; B.surv = a2 - a1; }
    else B.winner = 0;
    B.lost[1] = a1 - (B.winner === 1 ? B.surv : 0); B.lost[2] = a2 - (B.winner === 2 ? B.surv : 0);
    B.captured = B.winner > 0;
  } else {
    var o = owner, e = 3 - o, a = [0, a1, a2], att = a[e], def = a[o];
    B.killed = Math.min(att, B.fire);
    var left = att - B.killed;
    if (left > def){ B.winner = e; B.surv = left - def; B.captured = true; B.levelAfter = Math.max(0, level - 1); B.lost[o] = def; B.lost[e] = B.killed + def; }
    else { B.winner = o; B.surv = def - left; B.lost[e] = att; B.lost[o] = left; }
  }
  return B;
}
function resolveRound(){
  var p1 = G.plans[1], p2 = G.plans[2], R = { round: G.round, plans: { 1: p1, 2: p2 }, upgrades: [], battles: [], income: [0, 0, 0] };
  // upgrades are built before the armies arrive
  [1, 2].forEach(function(p){
    var plan = G.plans[p];
    plan.upg.forEach(function(u, i){
      if (!u) return; var c = G.castles[i];
      if (c.owner !== p || c.level >= 3) return;
      var cost = UPG_COST[c.level]; if (G.pl[p].gold < cost) return;
      G.pl[p].gold -= cost; c.level++;
      R.upgrades.push({ i: i, p: p, level: c.level, cost: cost });
    });
  });
  CASTLES.forEach(function(cd, i){
    var c = G.castles[i], B = fight(c.owner, c.level, p1.alloc[i], p2.alloc[i]);
    B.i = i; B.ownerBefore = c.owner; B.levelBefore = c.level;
    c.owner = B.winner; c.level = B.levelAfter;
    R.battles.push(B);
  });
  // income: every castle pays its holder in gold and glory
  CASTLES.forEach(function(cd, i){ var o = G.castles[i].owner; if (o){ R.income[o] += cd.value; G.pl[o].gold += cd.value; G.pl[o].glory += cd.value; } });
  G.hist[1].push(p1.alloc.slice()); G.hist[2].push(p2.alloc.slice());
  G.last[1] = { alloc: p1.alloc.slice(), upg: [false, false, false, false, false] }; G.last[2] = { alloc: p2.alloc.slice(), upg: [false, false, false, false, false] };
  G.results.push(R);
  return R;
}
function matchOver(){ return G.round >= G.rounds; }
function winnerOf(){
  var a = G.pl[1], b = G.pl[2];
  if (a.glory !== b.glory) return a.glory > b.glory ? 1 : 2;
  if (a.gold !== b.gold) return a.gold > b.gold ? 1 : 2;
  return 0;
}

/* ---------- the bot: reads your habits, then answers them ---------- */
function gaussR(){ var u = 1 - rnd(), v = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(TAU * v); }
function intAlloc(w, total){
  var s = w.reduce(function(a, b){ return a + Math.max(0, b); }, 0) || 1, raw = w.map(function(x){ return Math.max(0, x) / s * total; }), out = raw.map(Math.floor), left = total - out.reduce(function(a, b){ return a + b; }, 0);
  var order = raw.map(function(x, i){ return [x - Math.floor(x), i]; }).sort(function(a, b){ return b[0] - a[0]; });
  for (var k = 0; k < left; k++) out[order[k % order.length][1]]++;
  return out;
}
function predictOpp(opp){
  var prior = CASTLES.map(function(cd, i){ var c = G.castles[i]; return cd.value + 1 + (c.owner === opp ? 1.2 : 0) + (c.owner === 3 - opp ? 0.6 * cd.value : 0); });
  prior = intAlloc(prior, TROOPS);
  var H = G.hist[opp]; if (!H.length) return prior;
  var avg = [0, 0, 0, 0, 0], wsum = 0;
  H.forEach(function(a, k){ var w = Math.pow(0.6, H.length - 1 - k); for (var i = 0; i < 5; i++) avg[i] += a[i] * w; wsum += w; });
  avg = avg.map(function(x){ return x / wsum; });
  var al = H.length / (H.length + 1.5);
  return prior.map(function(p, i){ return p * (1 - al) + avg[i] * al; });
}
function sampleOpp(pred, opp, levels){
  var w;
  if (rnd() < 0.18){
    // an all-in on one or two castles
    w = [0.3, 0.3, 0.3, 0.3, 0.3]; var a = pickByValue(), b = pickByValue();
    w[a] += 6; w[b] += 3;
  } else w = pred.map(function(p){ return Math.max(0.2, p) * Math.exp(gaussR() * 0.55); });
  var lv = levels.slice(), gold = G.pl[opp].gold;
  if (rnd() < 0.55) for (var i = 0; i < 5; i++){ var c = G.castles[i]; if (c.owner === opp && lv[i] < 3 && gold >= UPG_COST[lv[i]] && rnd() < 0.5){ gold -= UPG_COST[lv[i]]; lv[i]++; } }
  return { a: intAlloc(w, TROOPS), lv: lv };
}
function pickByValue(){ var t = rnd() * 9, acc = 0; for (var i = 0; i < 5; i++){ acc += CASTLES[i].value; if (t < acc) return i; } return 2; }
function scoreVs(me, mine, S){
  var opp = 3 - me, sc = 0;
  for (var i = 0; i < 5; i++){
    var c = G.castles[i], a1 = me === 1 ? mine[i] : S.a[i], a2 = me === 1 ? S.a[i] : mine[i];
    var lvl = c.owner === opp ? S.lv[i] : S.myLv[i];
    var B = fight(c.owner, lvl, a1, a2), v = CASTLES[i].value;
    if (B.winner === me) sc += v + (c.owner !== me ? 0.25 : 0); else if (B.winner === opp) sc -= v;
  }
  return sc;
}
function botPlan(me, diff){
  reseed(Math.floor(Math.random() * 1e9) + 1);
  var opp = 3 - me, hard = diff !== 'easy', plan = emptyPlan();
  var pred = predictOpp(opp);
  // upgrades first: guard the castles that pay most and draw the most attention
  var gold = G.pl[me].gold, levels = G.castles.map(function(c){ return c.level; });
  var mine = []; for (var i = 0; i < 5; i++) if (G.castles[i].owner === me && levels[i] < 3) mine.push(i);
  mine.sort(function(a, b){ return (CASTLES[b].value * (1 + pred[b] / 8)) - (CASTLES[a].value * (1 + pred[a] / 8)) + (rnd() - 0.5) * 0.6; });
  var keep = hard ? 0 : 2;
  mine.forEach(function(i){ var cost = UPG_COST[levels[i]]; if (gold - cost >= keep && rnd() < (hard ? 0.9 : 0.45)){ plan.upg[i] = true; gold -= cost; levels[i]++; } });
  // sample what the opponent might do
  var S = [], NS = hard ? 180 : 50;
  for (var s = 0; s < NS; s++){ var smp = sampleOpp(pred, opp, G.castles.map(function(c){ return c.level; })); smp.myLv = levels; S.push(smp); }
  // candidate orders: win a chosen set of castles with a margin, or a random spread
  var cands = [];
  for (var mask = 1; mask < 32; mask++){
    for (var rep = 0; rep < (hard ? 3 : 1); rep++){
      var need = [0, 0, 0, 0, 0], tot = 0;
      for (i = 0; i < 5; i++){
        if (!(mask & (1 << i))) continue;
        var c = G.castles[i], o = pred[i] * Math.exp(gaussR() * 0.25), m = ri(1, 4);
        need[i] = c.owner === me ? Math.max(0, Math.ceil(o) - FIRE[levels[i]]) + m : c.owner === opp ? Math.ceil(o) + FIRE[c.level] + 1 + m : Math.ceil(o) + m;
        tot += need[i];
      }
      if (tot > TROOPS || tot === 0) continue;
      var left = TROOPS - tot, w = need.map(function(x, j){ return (mask & (1 << j)) ? x + CASTLES[j].value : 0; }), add = intAlloc(w, left);
      cands.push(need.map(function(x, j){ return x + add[j]; }));
    }
  }
  for (var r = 0; r < (hard ? 40 : 20); r++) cands.push(intAlloc([0, 0, 0, 0, 0].map(function(){ return -Math.log(1 - rnd() * 0.999); }), TROOPS));
  var scored = cands.map(function(a){ var t = 0; for (var q = 0; q < S.length; q++) t += scoreVs(me, a, S[q]); return { a: a, s: t / S.length }; });
  scored.sort(function(x, y){ return y.s - x.s; });
  var pickI = 0;
  if (hard){ pickI = rnd() < 0.7 ? 0 : ri(0, Math.min(3, scored.length - 1)); }
  else { pickI = rnd() < 0.3 ? ri(0, scored.length - 1) : ri(0, Math.min(8, scored.length - 1)); }
  plan.alloc = scored[pickI].a.slice();
  return plan;
}
/* ===================== 11 · the armies on the board: camps, squads, the battle playback ===================== */
var SQUAD = { 1: null, 2: null };
var ZONE_T = [];          // target state of each territory zone
var TIMESCALE = 1;
function faceTo(ang){ return function(s){ s.ryT = ang; }; }
function campAng(p){ return sideOf(p) > 0 ? Math.PI : 0; }
// everyone back in camp, in the reserve block (soldiers that were away fade back in)
function campReset(p, instant){
  var list = ARMY[p], R = reserveSpot(p), ang = campAng(p), slots = blockSlots(TROOPS, R.x, R.z, ang, 10, 0.56);
  SQUAD[p] = { sq: [[], [], [], [], []], res: list.map(function(x){ return x.id; }) };
  list.forEach(function(sd, j){
    var sl = slots[j];
    if (instant || sd.state === 'off' || sd.state === 'die'){ soldierPlace(sd, sl[0], sl[1], ang); if (!instant){ sd.vis = 0; sd.visT = 1; } }
    else moveTo(sd, sl[0], sl[1], ang);
  });
}
function moveTo(sd, x, z, ang){
  if (sd.state !== 'move' && hyp(sd.x - x, sd.z - z) < 0.05){ sd.ryT = ang; return; }
  soldierGo(sd, [[x, z]], rr(0, 0.12), faceTo(ang));
}
function assignSquads(p, alloc){
  var S = SQUAD[p], list = ARMY[p], i;
  for (i = 0; i < 5; i++){ var cur = S.sq[i]; while (cur.length > alloc[i]) S.res.push(cur.pop()); }
  for (i = 0; i < 5; i++){
    var cur2 = S.sq[i], spot = squadSpot(p, i);
    while (cur2.length < alloc[i] && S.res.length){
      var bi = 0, bd = 1e9;
      S.res.forEach(function(id, k){ var sd = list[id], d = hyp(sd.x - spot.x, sd.z - spot.z); if (d < bd){ bd = d; bi = k; } });
      cur2.push(S.res.splice(bi, 1)[0]);
    }
  }
}
function squadAng(p, i){ var r = ROADS[p][i], a = r[0], b = r[Math.min(6, r.length - 1)]; return Math.atan2(b[0] - a[0], b[1] - a[1]); }
function layoutCamp(p){
  var S = SQUAD[p], list = ARMY[p], s = sideOf(p);
  for (var i = 0; i < 5; i++){
    var spot = squadSpot(p, i), ang = squadAng(p, i), n = S.sq[i].length;
    var slots = blockSlots(n, spot.x, spot.z + s * 0.1, ang, n > 25 ? 6 : 5, 0.5);
    S.sq[i].forEach(function(id, j){ moveTo(list[id], slots[j][0], slots[j][1], ang); });
  }
  var R = reserveSpot(p), rang = campAng(p), rs = blockSlots(S.res.length, R.x, R.z, rang, 10, 0.56);
  S.res.forEach(function(id, j){ moveTo(list[id], rs[j][0], rs[j][1], rang); });
}
function arrangeSquads(p, alloc){ assignSquads(p, alloc); layoutCamp(p); }
function setZone(i, owner, instant){
  ZONE_T[i] = owner === 1 ? 1 : owner === 2 ? -1 : 0;
  if (instant) TERR.zone.value[i].w = ZONE_T[i];
}
function initZones(){
  CASTLES.forEach(function(c, i){ TERR.zone.value[i].set(c.zx, c.zz, c.zr, 0); ZONE_T[i] = 0; });
  // the camps: the Valley's meadow and the Blight's own ground never change hands
  TERR.zone.value[5].set(-7.5, CAMP[1].z + 1.2, 10.5, 1); TERR.zone.value[6].set(7.5, CAMP[1].z + 1.2, 10.5, 1);
  TERR.zone.value[7].set(-7.5, CAMP[2].z - 1.2, 10.5, -1); TERR.zone.value[8].set(7.5, CAMP[2].z - 1.2, 10.5, -1);
  ZONE_T[5] = 1; ZONE_T[6] = 1; ZONE_T[7] = -1; ZONE_T[8] = -1;
}
function updateZones(dt){
  var Z = TERR.zone.value;
  for (var i = 0; i < ZONE_T.length; i++){ var d = ZONE_T[i] - Z[i].w; Z[i].w += Math.sign(d) * Math.min(Math.abs(d), dt * 0.9); }
}

/* ---------- battle playback: a timeline of events, built from the resolved round ---------- */
var BAT = null;
function at(t, fn){ BAT.ev.push({ t: t, fn: fn }); }
function fieldSlots(p, i, n){
  var c = CASTLES[i], s = sideOf(p);
  return blockSlots(n, c.fx, c.fz + s * 0.85, campAng(p), n > 32 ? 9 : 8, 0.47);
}
function startBattle(R){
  BAT = { t: 0, ev: [], end: 3, R: R, sq: [], arr: [0, 0, 0, 0, 0], done: false, seq: isNarrow(), seqT: 0 };
  R.upgrades.forEach(function(u, k){ at(0.15 + k * 0.35, function(){ setCastleLevel(CVIS[u.i], u.level); uiFloat(castleTopWorld(CVIS[u.i]), ADDON_NAMES[u.level - 1], u.p, 'up'); }); });
  var T0 = R.upgrades.length ? 1.3 : 0.5;
  for (var i = 0; i < 5; i++) BAT.sq.push({ 1: [], 2: [] });
  [1, 2].forEach(function(p){
    var plan = R.plans[p];
    assignSquads(p, plan.alloc);
    for (var i = 0; i < 5; i++){
      var mem = SQUAD[p].sq[i].map(function(id){ return ARMY[p][id]; }), n = mem.length; if (!n) continue;
      var road = ROADS[p][i], st = road[0];
      mem.sort(function(a, b){ return hyp(a.x - st[0], a.z - st[1]) - hyp(b.x - st[0], b.z - st[1]); });
      var slots = fieldSlots(p, i, n), cols = Math.min(5, n), fang = campAng(p);
      mem.forEach(function(sd, j){
        var lat = (j % cols - (cols - 1) / 2) * 0.55, row = Math.floor(j / cols);
        var route = roadRoute(road, lat, slots[j][0], slots[j][1], null);
        var delay = T0 + row * 0.2 + i * 0.08 + rr(0, 0.08);
        sd.doomed = false; sd.atkT = 0; sd.cheer = 0;
        soldierGo(sd, route, delay, faceTo(fang));
        BAT.arr[i] = Math.max(BAT.arr[i], delay + routeLen(route, sd.x, sd.z) / sd.speed);
        BAT.sq[i][p].push(sd);
      });
    }
  });
  R.battles.forEach(function(B){ scriptCastle(B, T0); });
  BAT.ev.sort(function(a, b){ return a.t - b.t; });
}
function scriptCastle(B, T0){
  var i = B.i, V = CVIS[i];
  if (B.a1 + B.a2 === 0) return;
  var t0 = BAT.arr[i];
  // on a phone the battles take turns, west to east, and the camera walks along with them
  if (BAT.seq){ t0 = Math.max(t0, BAT.seqT); var cx = CASTLES[i].x + FIELD_DX * 0.5; at(Math.max(0.2, t0 - 1.0), function(){ CAMC.tgtT.x = cx; }); }
  var t = t0 + 0.2, owner = B.ownerBefore, att = owner ? 3 - owner : 0;
  at(Math.max(T0 + 0.4, t0 - 0.7), function(){ uiFight(i, B.a1, B.a2); });
  // the towers shoot first
  if (att && B.killed > 0){
    var remaining = B.killed;
    for (var l = 1; l <= B.levelBefore && remaining > 0; l++){
      var k = Math.min(remaining, FIRE[l] - FIRE[l - 1]); remaining -= k;
      (function(l, k, tt){ at(tt, function(){ towerShot(V, l, i, att, k); }); })(l, k, t + (l - 1) * 0.45);
    }
    t += 0.45 * B.levelBefore + 1.25;
  }
  // then the clash
  var left1 = B.a1 - (att === 1 ? B.killed : 0), left2 = B.a2 - (att === 2 ? B.killed : 0);
  var l1 = B.lost[1] - (att === 1 ? B.killed : 0), l2 = B.lost[2] - (att === 2 ? B.killed : 0);
  if (left1 > 0 && left2 > 0){
    at(t, function(){ clashStart(i); });
    var n = l1 + l2, dur = clamp(0.8 + n * 0.035, 1.0, 1.9), k1 = 0, k2 = 0;
    for (var q = 0; q < n; q++){
      // interleave the fallen so both lines thin out together
      var side = (k1 / Math.max(1, l1) <= k2 / Math.max(1, l2) && k1 < l1) || k2 >= l2 ? 1 : 2;
      if (side === 1) k1++; else k2++;
      (function(side, tt){ at(tt, function(){ clashKill(i, side); }); })(side, t + 0.5 + (q / n) * dur);
    }
    t += 0.5 + dur + 0.3;
    at(t - 0.15, function(){ clashEnd(i); });
  }
  at(t, function(){ castleResult(B); });
  at(t + 0.9, function(){ survivorsEnter(i, B.winner); });
  if (BAT.seq) BAT.seqT = t + 0.9;
  BAT.end = Math.max(BAT.end, t + 2.1);
}
function aliveOf(i, p){ return BAT.sq[i][p].filter(function(s){ return s.alive && !s.doomed; }); }
function centroid(list){ var x = 0, z = 0; list.forEach(function(s){ x += s.x; z += s.z; }); return { x: x / Math.max(1, list.length), z: z / Math.max(1, list.length) }; }
function towerShot(V, l, i, att, k){
  var A = V.addons[l - 1], targets = aliveOf(i, att); if (!targets.length) return;
  shuffleArr(targets);
  var victims = targets.slice(0, k); victims.forEach(function(v){ v.doomed = true; });
  var c = centroid(victims), gy = groundY(c.x, c.z);
  aimAt(A, c.x, c.z);
  var from = muzzleWorld(A);
  uiFloat(new V3(c.x, gy + 2.2, c.z), '−' + k, att, 'hit');
  if (l === 1){
    victims.forEach(function(v, j){
      at(BAT.t + j * 0.1, function(){
        var f = from.clone().add(new V3(rr(-0.3, 0.3), 0, rr(-0.3, 0.3))), to = new V3(v.x, groundY(v.x, v.z) + 0.55, v.z);
        launch('arrow', f, to, 0.7, 2.0, function(){ soldierKill(v); emitBurst(to.x, to.y, to.z, 4, 'dust', 'path', 1.5, 0.5, 0.25, false); });
      });
    });
  } else if (l === 2){
    var to = new V3(c.x, gy + 0.4, c.z);
    launch('bolt', from, to, 0.55, 0.9, function(){ victims.forEach(function(v, j){ v.dieT = -j * 0.05; soldierKill(v, j * 0.05); }); emitDust(to.x, gy, to.z, 18, 1.6); });
  } else {
    emitBurst(from.x, from.y, from.z, 18, 'fireHot', 'fire', 4, 0.35, 0.5);
    for (var sm = 0; sm < 10; sm++) FX.soft.emit(from.x, from.y, from.z, rr(-1, 1), rr(0.2, 1.2), rr(-1, 1), rr(1.5, 2.6), 0.5, 2.0, col3('smoke', 0.95), 0.5, -0.1, 1.2);
    var to2 = new V3(c.x, gy + 0.2, c.z);
    launch('ball', from, to2, 1.0, 3.4, function(){ victims.forEach(function(v, j){ soldierKill(v, j * 0.04); }); emitDust(to2.x, gy, to2.z, 34, 2.6); emitBurst(to2.x, gy + 0.3, to2.z, 16, 'fireHot', 'ember', 5, 0.5, 0.35); });
  }
}
function shuffleArr(a){ for (var i = a.length - 1; i > 0; i--){ var j = Math.floor(Math.random() * (i + 1)), t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
function clashStart(i){
  var c = CASTLES[i];
  [1, 2].forEach(function(p){
    var s = sideOf(p), alive = aliveOf(i, p);
    alive.sort(function(a, b){ return Math.abs(a.z - c.fz) - Math.abs(b.z - c.fz); });
    var slots = blockSlots(alive.length, c.fx, c.fz + s * 0.3, campAng(p), alive.length > 32 ? 9 : 8, 0.45);
    alive.forEach(function(sd, j){ soldierGo(sd, [[slots[j][0], slots[j][1]]], rr(0, 0.12), faceTo(campAng(p))); sd.atkT = 1; sd.speed = rr(2.6, 3.2); });
  });
  for (var d = 0; d < 6; d++) at(BAT.t + d * 0.32, function(){ emitDust(c.fx + rr(-1.4, 1.4), groundY(c.fx, c.fz), c.fz + rr(-0.4, 0.4), 6, 1.2); });
}
function clashKill(i, p){
  var c = CASTLES[i], alive = aliveOf(i, p); if (!alive.length) return;
  alive.sort(function(a, b){ return Math.abs(a.z - c.fz) - Math.abs(b.z - c.fz); });
  var v = alive[Math.min(alive.length - 1, Math.floor(Math.random() * Math.min(3, alive.length)))];
  soldierKill(v);
  emitBurst(v.x, groundY(v.x, v.z) + 0.6, v.z, 5, p === 1 ? 'teamL' : 'enemy', 'spark', 2.2, 0.45, 0.22);
}
function clashEnd(i){ [1, 2].forEach(function(p){ BAT.sq[i][p].forEach(function(s){ s.atkT = 0; s.speed = rr(4.9, 5.4); }); }); }
function castleResult(B){
  var V = CVIS[B.i];
  if (B.captured){
    setCastleOwner(V, B.winner); setZone(B.i, B.winner);
    if (B.levelAfter < B.levelBefore) setCastleLevel(V, B.levelAfter);
    var top = castleTopWorld(V);
    emitBurst(top.x, top.y - 1.0, top.z, 46, B.winner === 1 ? 'teamL' : 'crystal2', 'spark', 5, 1.1, 0.5);
  }
  uiFightResult(B);
}
function survivorsEnter(i, winner){
  var V = CVIS[i], g = gateWorld(V);
  [1, 2].forEach(function(p){
    BAT.sq[i][p].forEach(function(s, j){
      if (!s.alive) return;
      if (p !== winner){ soldierKill(s, j * 0.05); return; }
      s.cheer = 1;
      (function(s, j){ at(BAT.t + 0.7 + j * 0.05, function(){ s.cheer = 0; soldierGo(s, [[g[0] + 1.0 + rr(-0.3, 0.3), g[1] + rr(-0.4, 0.4)], [g[0], g[1]]], 0, function(x){ x.visT = 0; x.state = 'off'; }); }); })(s, j);
    });
  });
}
function updateBattle(dt){
  if (!BAT || BAT.done) return;
  BAT.t += dt;
  while (BAT.ev.length && BAT.ev[0].t <= BAT.t){ var e = BAT.ev.shift(); e.fn(); BAT.ev.sort(function(a, b){ return a.t - b.t; }); }
  if (BAT.t >= BAT.end && !BAT.ev.length) finishBattle(false);
}
// jump to the end: everything lands where the rules put it
function skipBattle(){
  if (!BAT || BAT.done) return;
  BAT.ev = [];
  FX.proj.forEach(function(P){ FXROOT.remove(P.m); }); FX.proj = [];
  [1, 2].forEach(function(p){ ARMY[p].forEach(function(s){ if (s.state !== 'stand' || !inCamp(s)) soldierHide(s); }); });
  syncCastles(true);
  uiClearFights();
  BAT.R.battles.forEach(function(B){ uiFightResult(B, true); });
  finishBattle(true);
}
function inCamp(s){ return Math.abs(s.z) > 12.0; }
function finishBattle(skipped){
  BAT.done = true;
  syncCastles(skipped);
  uiAfterBattle(BAT.R, skipped);
}
function syncCastles(instant){
  CVIS.forEach(function(V, i){
    var c = G.castles[i];
    if (V.owner !== c.owner) setCastleOwner(V, c.owner, instant);
    if (V.level !== c.level || instant) setCastleLevel(V, c.level, instant);
    setZone(i, c.owner, instant);
  });
}
/* ===================== 12b · online with a friend: two devices, a relay over public MQTT brokers, sealed orders ===================== */
// GitHub Pages has no server of its own, so both players talk through free public MQTT brokers (three at once, in case one
// is down or blocked). Each order is sealed first (a SHA-256 hash) and opened only after both are sealed, so nobody can peek.
// The match itself is never sent: both devices rebuild it from the two players' records, which also survive a page reload.
var PROTO = 1;

/* ---------- SHA-256 and HMAC ---------- */
var SHA_K = [], SHA_H0 = [];
(function(){
  var pr = [], n = 2;
  while (pr.length < 64){ var ok = true; for (var i = 0; i < pr.length && pr[i] * pr[i] <= n; i++) if (n % pr[i] === 0){ ok = false; break; } if (ok) pr.push(n); n++; }
  function frac(x){ return ((x - Math.floor(x)) * 4294967296) | 0; }
  for (var j = 0; j < 64; j++){ SHA_K.push(frac(Math.cbrt(pr[j]))); if (j < 8) SHA_H0.push(frac(Math.sqrt(pr[j]))); }
})();
function strBytes(s){
  if (typeof TextEncoder !== 'undefined') return Array.prototype.slice.call(new TextEncoder().encode(s));
  s = unescape(encodeURIComponent(s)); var b = []; for (var i = 0; i < s.length; i++) b.push(s.charCodeAt(i)); return b;
}
function rotr(x, n){ return (x >>> n) | (x << (32 - n)); }
function sha256b(bytes){
  var b = bytes.slice(), bitLen = bytes.length * 8, i, j, W = new Array(64), H = SHA_H0.slice();
  b.push(0x80); while (b.length % 64 !== 56) b.push(0);
  var hi = Math.floor(bitLen / 4294967296), lo = bitLen >>> 0;
  b.push((hi >>> 24) & 255, (hi >>> 16) & 255, (hi >>> 8) & 255, hi & 255, (lo >>> 24) & 255, (lo >>> 16) & 255, (lo >>> 8) & 255, lo & 255);
  for (i = 0; i < b.length; i += 64){
    for (j = 0; j < 16; j++) W[j] = (b[i + 4 * j] << 24) | (b[i + 4 * j + 1] << 16) | (b[i + 4 * j + 2] << 8) | b[i + 4 * j + 3];
    for (j = 16; j < 64; j++){
      var x = W[j - 15], y = W[j - 2];
      var s0 = rotr(x, 7) ^ rotr(x, 18) ^ (x >>> 3), s1 = rotr(y, 17) ^ rotr(y, 19) ^ (y >>> 10);
      W[j] = (W[j - 16] + s0 + W[j - 7] + s1) | 0;
    }
    var a = H[0], bb = H[1], c = H[2], d = H[3], e = H[4], f = H[5], g = H[6], h = H[7];
    for (j = 0; j < 64; j++){
      var S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25), ch = (e & f) ^ (~e & g), t1 = (h + S1 + ch + SHA_K[j] + W[j]) | 0;
      var S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22), mj = (a & bb) ^ (a & c) ^ (bb & c), t2 = (S0 + mj) | 0;
      h = g; g = f; f = e; e = (d + t1) | 0; d = c; c = bb; bb = a; a = (t1 + t2) | 0;
    }
    H[0] = (H[0] + a) | 0; H[1] = (H[1] + bb) | 0; H[2] = (H[2] + c) | 0; H[3] = (H[3] + d) | 0;
    H[4] = (H[4] + e) | 0; H[5] = (H[5] + f) | 0; H[6] = (H[6] + g) | 0; H[7] = (H[7] + h) | 0;
  }
  var out = [];
  H.forEach(function(w){ out.push((w >>> 24) & 255, (w >>> 16) & 255, (w >>> 8) & 255, w & 255); });
  return out;
}
function toHex(bytes){ return bytes.map(function(x){ return (x < 16 ? '0' : '') + x.toString(16); }).join(''); }
function sha256(s){ return toHex(sha256b(strBytes(s))); }
function hmacHex(key, msg){
  var k = strBytes(key); if (k.length > 64) k = sha256b(k); while (k.length < 64) k.push(0);
  var ip = k.map(function(x){ return x ^ 0x36; }), op = k.map(function(x){ return x ^ 0x5c; });
  return toHex(sha256b(op.concat(sha256b(ip.concat(strBytes(msg))))));
}
function randHex(n){
  var a = new Uint8Array(n), i;
  try { crypto.getRandomValues(a); } catch (e){ for (i = 0; i < n; i++) a[i] = Math.floor(Math.random() * 256); }
  return toHex(Array.prototype.slice.call(a));
}

/* ---------- room codes ---------- */
var CODE_ABC = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';     // no I, O, 0, 1
function genCode(){
  var a = new Uint8Array(6), s = '', i;
  try { crypto.getRandomValues(a); } catch (e){ for (i = 0; i < 6; i++) a[i] = Math.floor(Math.random() * 256); }
  for (i = 0; i < 6; i++) s += CODE_ABC[a[i] % 32];
  return s;
}
// what people type: lower case, a dash, Cyrillic letters that look Latin
var CYR = { 'А': 'A', 'В': 'B', 'С': 'C', 'Е': 'E', 'Н': 'H', 'К': 'K', 'М': 'M', 'О': 'O', 'Р': 'P', 'Т': 'T', 'Х': 'X', 'У': 'Y' };
function normCode(s){
  s = String(s || '').toUpperCase().replace(/[АВСЕНКМОРТХУ]/g, function(ch){ return CYR[ch]; }).replace(/[^A-Z0-9]/g, '');
  return s;
}
function codeProblem(s){
  if (!s) return 'Введите код комнаты.';
  if (/[IO01]/.test(s)) return 'В кодах комнат нет букв I и O и цифр 0 и 1. Проверьте код.';
  if (s.length !== 6) return 'Код комнаты — это 6 букв и цифр, сейчас ' + s.length + '.';
  return '';
}
function fmtCode(c){ return c ? c.slice(0, 3) + '-' + c.slice(3) : ''; }
function roomLink(code){ return location.href.split('#')[0].split('?')[0] + '?room=' + code; }
function urlRoom(){ var m = /[?&]room=([^&#]+)/.exec(location.search); return m ? normCode(decodeURIComponent(m[1])) : ''; }
function setUrlRoom(code){
  try {
    var p = new URLSearchParams(location.search);
    if (code) p.set('room', code); else p.delete('room');
    var q = p.toString();
    history.replaceState(null, '', location.pathname + (q ? '?' + q : '') + location.hash);
  } catch (e){}
}

/* ---------- the relay: the same messages go through every broker that answers ---------- */
var NET = {
  clients: [], topic: '', key: '', onReady: null,
  brokers: [
    { name: 'HiveMQ', url: 'wss://broker.hivemq.com:8884/mqtt' },
    { name: 'EMQX', url: 'wss://broker.emqx.io:8084/mqtt' },
    { name: 'Mosquitto', url: 'wss://test.mosquitto.org:8081/mqtt' }
  ]
};
function netAvailable(){ return typeof mqtt !== 'undefined' && !!mqtt.connect && typeof WebSocket !== 'undefined'; }
function netBrokers(){
  if (DEV){ var m = /[?&]broker=([^&]+)/.exec(location.search); if (m) return decodeURIComponent(m[1]).split(',').map(function(u, i){ return { name: 'test' + i, url: u }; }); }
  return NET.brokers;
}
function netStart(code){
  netStop();
  NET.topic = 'fivecastles/v1/' + sha256('room|' + code).slice(0, 24) + '/';
  NET.key = sha256('key|' + code);
  NET.clients = netBrokers().map(function(b){
    var C = { name: b.name, url: b.url, ready: false, c: null, fails: 0, trying: true };
    try { C.c = mqtt.connect(b.url, { clientId: 'fc_' + randHex(6), clean: true, keepalive: 30, reconnectPeriod: 3000, connectTimeout: 10000, protocolVersion: 4, resubscribe: false }); }
    catch (e){ return C; }
    C.c.on('reconnect', function(){ C.trying = true; });
    C.c.on('connect', function(){
      C.ready = false; C.trying = false; C.fails = 0; C.c.options.reconnectPeriod = 3000;
      C.c.subscribe(NET.topic + '#', { qos: 1 }, function(err){ if (err) return; C.ready = true; onNetChanged(); if (NET.onReady) NET.onReady(C); });
    });
    C.c.on('message', function(topic, payload, packet){ netIn(topic, payload, !!(packet && packet.retain)); });
    ['close', 'offline', 'end'].forEach(function(ev){ C.c.on(ev, function(){ if (C.ready){ C.ready = false; onNetChanged(); } }); });
    // a broker that keeps failing (down or blocked on this network) is retried less and less often
    C.c.on('close', function(){ C.trying = false; if (!C.ready){ C.fails++; C.c.options.reconnectPeriod = Math.min(30000, Math.round(3000 * Math.pow(1.5, C.fails))); } });
    C.c.on('error', function(){ C.ready = false; onNetChanged(); });
    return C;
  });
  onNetChanged();
}
function netStop(){ var cl = NET.clients; NET.clients = []; cl.forEach(function(C){ try { if (C.c) C.c.end(true); } catch (e){} }); }
function netReady(){ var n = 0; NET.clients.forEach(function(C){ if (C.ready) n++; }); return n; }
function netIn(topic, payload, retained){
  if (!NET.topic || topic.indexOf(NET.topic) !== 0) return;
  var sub = topic.slice(NET.topic.length), s = payload && payload.length ? payload.toString() : '';
  if (!s) return;
  var o, d; try { o = JSON.parse(s); } catch (e){ return; }
  if (!o || typeof o.d !== 'string' || o.h !== hmacHex(NET.key, o.d).slice(0, 32)) return;
  try { d = JSON.parse(o.d); } catch (e){ return; }
  onlineMsg(sub, d, retained);
}
// data === null clears a retained message off the brokers
function netPub(sub, data, retain, only){
  if (ON.lost) return;                                     // another tab of this browser has this seat now
  var msg = '';
  if (data !== null){ var d = JSON.stringify(data); msg = JSON.stringify({ d: d, h: hmacHex(NET.key, d).slice(0, 32) }); }
  NET.clients.forEach(function(C){
    if (only && C !== only) return;
    if (!C.c || !C.c.connected) return;
    try { C.c.publish(NET.topic + sub, msg, { qos: retain ? 1 : 0, retain: !!retain }); } catch (e){}
  });
}

/* ---------- the session ---------- */
// The browser keeps its seat in localStorage, one record per room. A second tab of the same browser that takes the other seat
// of the same room (someone trying the game alone) plays under a name of its own, kept in that tab's sessionStorage.
var ON = { active: false };
var ON_KEY = 'five.castles.online.v2', CID_KEY = 'five.castles.cid';
function myCid(){
  var c = null; try { c = localStorage.getItem(CID_KEY); } catch (e){}
  if (!c || !/^[0-9a-f]{16}$/.test(c)){ c = randHex(8); try { localStorage.setItem(CID_KEY, c); } catch (e){} }
  return c;
}
function stoArea(tab){ try { return tab ? window.sessionStorage : window.localStorage; } catch (e){ return null; } }
function stoGet(tab, code){
  var S = stoArea(tab); if (!S) return null;
  try {
    code = code || S.getItem(ON_KEY + ':last') || '';
    var s = code ? JSON.parse(S.getItem(ON_KEY + ':' + code) || 'null') : null;
    return s && s.code === code && s.cid && s.side && s.me ? s : null;
  } catch (e){ return null; }
}
function onlineNew(code){
  ON = { active: true, code: code, cid: '', tab: false, side: 0, host: false, room: null, recs: { 1: null, 2: null }, me: null, pend: null, seen: 0, oc: '',
         oppSeen: 0, oppPh: '', lastOn: null, phase: 'joining', firstReady: 0, decided: false, netDownT: 0, sealedToast: {}, leftShown: false, broken: false, yielded: false };
}
function onlineSave(){
  if (!ON.active || !ON.side || !ON.cid || ownerLost()) return;
  var S = stoArea(ON.tab); if (!S) return;
  // the friend's record is kept too, so that after a reload the match is back at once, before any broker answers
  try {
    S.setItem(ON_KEY + ':' + ON.code, JSON.stringify({ code: ON.code, cid: ON.cid, side: ON.side, host: ON.host, me: ON.me, opp: ON.recs[3 - ON.side], room: ON.room, pend: ON.pend, seen: ON.seen, oc: ON.oc, t: Date.now() }));
    S.setItem(ON_KEY + ':last', ON.code);
  } catch (e){}
}
// the unfinished match for a room, or (no code) the latest one, this tab's own first
function onlineStored(code){ return stoGet(true, code) || stoGet(false, code); }
function onlineForget(code, tab){
  if (code === undefined){ code = ON.code; tab = ON.tab; }
  var S = stoArea(tab); if (!S || !code) return;
  try { S.removeItem(ON_KEY + ':' + code); if (S.getItem(ON_KEY + ':last') === code) S.removeItem(ON_KEY + ':last'); } catch (e){}
}
// rooms nobody came back to are dropped after three weeks
(function(){
  var S = stoArea(false); if (!S) return;
  try {
    var kill = [];
    for (var i = 0; i < S.length; i++){
      var k = S.key(i); if (!k || k.indexOf(ON_KEY + ':') !== 0 || k === ON_KEY + ':last') continue;
      var o = null; try { o = JSON.parse(S.getItem(k)); } catch (e){}
      if (!o || !o.t || Date.now() - o.t > 21 * 864e5) kill.push(k);
    }
    kill.forEach(function(k){ S.removeItem(k); });
  } catch (e){}
})();

/* ---------- other tabs of this browser: is the room already open in one of them, and under which name ---------- */
var TABS = { bc: null, asks: {} };
try {
  if (typeof BroadcastChannel !== 'undefined' && netAvailable()){
    TABS.bc = new BroadcastChannel('five-castles');
    TABS.bc.onmessage = function(e){
      var d = e.data || {};
      if (d.q === 'who'){ if (ON.active && ON.code === d.code && ON.cid) TABS.bc.postMessage({ q: 'here', n: d.n, cid: ON.cid }); }
      else if (d.q === 'here' && TABS.asks[d.n]) TABS.asks[d.n][d.cid] = 1;
    };
  }
} catch (e){ TABS.bc = null; }
function askTabs(code, cb){
  if (!TABS.bc){ cb({}); return; }
  var n = randHex(6); TABS.asks[n] = {};
  try { TABS.bc.postMessage({ q: 'who', code: code, n: n }); } catch (e){}
  setTimeout(function(){ var busy = TABS.asks[n] || {}; delete TABS.asks[n]; cb(busy); }, 350);
}
// the name this tab plays the room under: its own (it already sits there), the browser's, or none (that one is busy in another tab)
function pickSeat(code, busy){
  var t = stoGet(true, code);
  if (t && !busy[t.cid]) return { tab: true, cid: t.cid, st: t };
  var s = stoGet(false, code), L = s ? s.cid : myCid();
  if (!busy[L]) return { tab: false, cid: L, st: s };
  return null;
}
// The browser's seat in a room belongs to one page at a time. A tab that was asleep (a phone keeps background tabs frozen)
// cannot answer the question above, so the page that takes the seat also writes its id down; a page that finds a different
// id there has been replaced, and goes quiet without sending anything.
var PAGE_ID = randHex(8);
function ownKey(code){ return 'five.castles.owner:' + code; }
function claimOwner(){ if (ON.tab) return; try { localStorage.setItem(ownKey(ON.code), PAGE_ID); } catch (e){} }
// once lost, nothing more is saved or sent; the page steps back on the next tick, so no caller finds ON reset under it
function ownerLost(){
  if (!ON.active || ON.tab || !ON.cid || !ON.code) return false;
  if (ON.lost) return true;
  var o = null; try { o = localStorage.getItem(ownKey(ON.code)); } catch (e){ return false; }
  if (!o || o === PAGE_ID) return false;
  ON.lost = true;
  var was = ON; setTimeout(function(){ if (ON === was) onlineSuperseded(); }, 0);
  return true;
}
function onlineSuperseded(){
  var code = ON.code;
  if (ON.joinTimer) clearInterval(ON.joinTimer);
  netStop(); ON = { active: false };
  if (BAT && !BAT.done){ BAT.ev = []; BAT.done = true; }
  hideWait(); showNetToast(false); refreshOnlineUI();
  openSheet('<div><span class="kick">Онлайн с другом</span><h3>Партия открыта в другой вкладке</h3></div><p>Эту комнату открыли в другой вкладке этого браузера, и партия продолжается там.</p>' +
    '<div class="btns"><button class="sec" id="osMenu">В меню</button><button class="go" id="osHere" data-focus>Играть здесь</button></div>', { locked: true });
  $('osMenu').addEventListener('click', function(){ setUrlRoom(null); toMenu(); });
  $('osHere').addEventListener('click', function(){ onlineJoin(code); });
}
function freshRec(side, m){ return { k: 'pl', side: side, cid: ON.cid, v: 1, t0: Date.now(), m: m || 1, c: {}, r: {}, x: {}, rm: 0, left: false }; }
function oppSide(){ return 3 - ON.side; }
function oppRec(){ return ON.side ? ON.recs[oppSide()] : null; }
// yielded: two guests took the friend's seat at once and the host has not chosen yet; the later one stays off the brokers
function pubMe(only){ if (!ON.me || ON.yielded || ownerLost()) return; netPub('s' + ON.side, ON.me, true, only); }
function pubRoom(only){ if (ON.host && ON.room) netPub('room', ON.room, true, only); }
function touchMe(){ ON.me.v++; onlineSave(); pubMe(); }
function heartbeat(only){ if (ON.active && ON.side) netPub('live', { k: 'hb', side: ON.side, cid: ON.cid, ph: G && G.mode === 'online' ? G.phase : ON.phase, n: G && G.results ? G.results.length : 0 }, false, only); }
function oppOnline(){ return ON.active && Date.now() - ON.oppSeen < 11000; }

/* ---------- sealed orders ---------- */
function sealHash(code, m, r, side, a, u, s){ return sha256('fc' + PROTO + '|' + code + '|' + m + '|' + r + '|' + side + '|' + a.join(',') + '|' + u + '|' + s); }
// an order that came over the wire, made safe: five whole numbers, 50 at most in all, five yes/no upgrades
function sanePlan(o){
  var a = (o && Array.isArray(o.a) ? o.a : []).slice(0, 5), u = String(o && o.u || '');
  while (a.length < 5) a.push(0);
  a = a.map(function(x){ x = Math.floor(+x || 0); return x < 0 ? 0 : x > TROOPS ? TROOPS : x; });
  if (a.reduce(function(s, x){ return s + x; }, 0) > TROOPS) a = [0, 0, 0, 0, 0];
  var up = []; for (var i = 0; i < 5; i++) up.push(u.charAt(i) === '1');
  return { alloc: a, upg: up };
}
function openedPlan(rec, side, r, expect){
  var R = rec && rec.r && rec.r[r]; if (!R || !expect) return null;
  var a = Array.isArray(R.a) ? R.a : [];
  return sealHash(ON.code, rec.m, r, side, a, String(R.u || ''), String(R.s || '')) === expect ? sanePlan(R) : false;
}
// both orders of round r, checked against their seals (null: not yet; 'bad': a seal does not match)
function roundPlans(r){
  var me = ON.me, opp = oppRec(); if (!me || !opp || opp.m !== me.m) return null;
  var mine = openedPlan(me, ON.side, r, me.c[r]), theirs = openedPlan(opp, oppSide(), r, me.x[r]);
  if (mine === null || theirs === null) return null;
  if (mine === false || theirs === false) return 'bad';
  var P = { 1: null, 2: null }; P[ON.side] = mine; P[oppSide()] = theirs;
  return P;
}
function onlineSeal(plan){
  var nr = G.results.length + 1, m = ON.me.m, s = randHex(8), u = plan.upg.map(function(b){ return b ? 1 : 0; }).join('');
  ON.pend = { m: m, r: nr, a: plan.alloc.slice(), u: u, s: s };
  ON.me.c[nr] = sealHash(ON.code, m, nr, ON.side, plan.alloc, u, s);
  touchMe();
  G.phase = 'wait';
  showWait();
  onlineSync();
}

/* ---------- messages in ---------- */
// whose records count for the other seat: the host's seat is the room maker's, the guest's seat belongs to the guest the
// host let in (room.g), and once a match is under way only the friend it was played with (oc) counts
function seatOk(s, cid){
  var R = ON.room;
  if (ON.side && cid === ON.cid) return false;                   // the other seat under this browser's own name is not a friend
  if (R && s === R.hs && cid !== R.cid) return false;
  if (R && R.g && s !== R.hs && cid !== R.g) return false;
  if (ON.oc && cid !== ON.oc) return false;
  return true;
}
function onlineMsg(sub, d, retained){
  if (!ON.active || ON.lost || !d) return;
  if (sub === 'room'){
    if (d.k !== 'room') return;
    if (ON.host){ if (d.cid === ON.cid && ON.room && d.v > ON.room.v) ON.room = d; }
    else if (!ON.room || d.cid !== ON.room.cid || d.v >= ON.room.v) ON.room = d;
  } else if (sub === 's1' || sub === 's2'){
    var s = +sub.charAt(1);
    if (d.k !== 'pl' || d.side !== s) return;
    if (ON.me && s === ON.side){
      if (d.cid === ON.cid){ if (d.v > ON.me.v){ ON.me = d; onlineSave(); } }
      else if (!d.left && ON.phase === 'game'){
        // two people took the same seat. The host's choice (room.g) decides; until it comes, the earlier claim stays on
        // the brokers and the later one keeps quiet, so the two do not keep overwriting each other
        var g = !ON.host && ON.room && ON.room.g;
        if (g && g !== ON.cid){ onlineBroken('Это место в комнате уже занял другой игрок.', true); return; }
        if (!ON.host && !g && (d.t0 < ON.me.t0 || (d.t0 === ON.me.t0 && d.cid < ON.cid))){ ON.yielded = true; return; }
        pubMe();
      }
      // the guest we made way for gave up before the host chose: the seat is ours to show again
      else if (d.left && ON.yielded && !(ON.room && ON.room.g)){ ON.yielded = false; pubMe(); }
      return;
    }
    if (!seatOk(s, d.cid)) return;
    var cur = ON.recs[s];
    if (!cur || cur.cid !== d.cid || d.v >= cur.v) ON.recs[s] = d;
    // a record sent just now (not one the broker kept) means the friend is here
    if (!retained && s !== ON.side && !d.left){ var w0 = oppOnline(); ON.oppSeen = Date.now(); if (!w0) presenceTick(); }
  } else if (sub === 'live'){
    if (d.k !== 'hb' || d.side === ON.side || !seatOk(d.side, d.cid)) return;
    var was = oppOnline();
    ON.oppSeen = Date.now(); ON.oppPh = d.ph;
    if (!was) presenceTick();
    return;
  } else return;
  onlineSync();
}

/* ---------- the state machine: what both records say we should do now ---------- */
function onlineSync(){
  if (!ON.active || ON.lost) return;
  if (ON.phase === 'joining'){ joinDecide(); return; }
  if (ON.phase === 'hosting'){
    var o0 = oppRec();
    renderRoomSheet();
    // the first guest the host sees gets the seat, and the room record says so: anyone else who took it at the same moment
    // learns from there that they are out
    if (o0 && !o0.left && o0.cid !== ON.cid){ ON.oc = o0.cid; ON.room.g = o0.cid; ON.room.v++; pubRoom(); ON.phase = 'game'; onlineSave(); startOnline(true); }
    return;
  }
  if (ON.phase !== 'game' || ON.broken || !G || G.mode !== 'online') return;
  if (!ON.host && ON.room && ON.room.g){
    if (ON.room.g !== ON.cid){ onlineBroken('Это место в комнате уже занял другой игрок.', true); return; }
    if (ON.yielded){ ON.yielded = false; pubMe(); }
  }
  var me = ON.me, opp = oppRec(), m = me.m;
  refreshOnlineUI();
  // the friend left in the middle of the match (after the last battle it is just goodbye: the final score still shows)
  if (opp && opp.left && G.results.length < G.rounds){ if (!ON.leftShown){ ON.leftShown = true; showFriendLeft(); } return; }
  // a rematch both asked for
  if (me.rm === m + 1 && opp && (opp.rm === m + 1 || opp.m === m + 1)){ startRematch(); return; }
  var oin = opp && opp.m === m ? opp : null, nr = G.results.length + 1;
  // after a reload the friend's record can come late: catch up on rounds both have opened
  var can = 0, pp;
  while (can < G.rounds && (pp = roundPlans(can + 1)) && pp !== 'bad') can++;
  if (can > G.results.length + (G.phase === 'wait' ? 1 : 0) && G.phase !== 'battle'){ onlineRebuild(); return; }
  if (nr > G.rounds){ if (G.phase === 'end') renderEndOnline(); return; }
  // open our order once both are sealed
  if (me.c[nr] && oin && oin.c[nr] && !me.r[nr]){
    var P = ON.pend;
    if (!P || P.m !== m || P.r !== nr){ onlineBroken('Ваш приказ на этот раунд хранился в другом браузере или был стёрт, поэтому его не получается открыть. Партию придётся начать заново в новой комнате.'); return; }
    me.x[nr] = oin.c[nr]; me.r[nr] = { a: P.a, u: P.u, s: P.s };
    touchMe();
  }
  // both orders are open: to battle
  if (G.phase === 'wait' && me.r[nr] && oin && oin.r[nr]){
    var plans = roundPlans(nr);
    if (plans === 'bad'){ onlineBroken('Приказ друга не совпал со своей печатью. Скорее всего, у вас разные версии игры: обновите страницу у обоих и начните новую комнату.'); return; }
    if (plans){ G.plans = plans; ON.pend = null; onlineSave(); hideWait(); reveal(); return; }
  }
  if (oin && oin.c[nr] && G.phase === 'plan' && !ON.sealedToast[m + ':' + nr]){ ON.sealedToast[m + ':' + nr] = 1; toast('Друг уже отдал приказ', 'ok'); }
  if (G.phase === 'wait') renderWait();
  if (G.phase === 'plan') renderHint();
}
// the match from scratch: replay every round both sides have opened, then pick up where it stands
function onlineRebuild(){
  if (BAT && !BAT.done){ BAT.ev = []; BAT.done = true; }
  resetBoard();
  newMatch({ mode: 'online', rounds: ON.room.rounds }); G.me = ON.side;
  for (var r = 1; r <= G.rounds; r++){ var P = roundPlans(r); if (!P || P === 'bad') break; G.round = r; G.plans = P; resolveRound(); }
  var done = G.results.length;
  syncCastles(true); refreshCastleLabels(); renderHud(true);
  campReset(1, true); campReset(2, true);
  $('battleBar').hidden = true; hideWait(); closeSheet();
  if (done > ON.seen){ G.round = done; G.phase = 'summary'; setCam(battlePreset()); showSummary(G.results[done - 1]); return; }
  if (done >= G.rounds){ G.round = G.rounds; showEnd(); return; }
  G.round = done + 1;
  startRound();
}
function startOnline(first){
  closeSheet(); hideCover();
  ON.quietUntil = Date.now() + 7000;
  if (first && !ON.oppSeen) ON.oppSeen = Date.now() - 5000;
  onlineRebuild();
  var o = oppRec(), back = G && G.results.length > 0;
  if (first && o && !o.left) toast((back ? 'Партия продолжается. ' : 'Друг в игре. ') + 'Вы за ' + (ON.side === 1 ? 'Долину (синие)' : 'Порчу (фиолетовые)') + '.', 'ok');
  // someone who came by a link has not seen the title screen: show the rules once
  var seen = false; try { seen = localStorage.getItem('five.castles.rules') === '1'; } catch (e){}
  if (first && !ON.host && !seen && G && G.phase === 'plan') showRules();
  onlineSync();
}
function startRematch(){
  var m = ON.me.m + 1, v = ON.me.v + 1, t0 = ON.me.t0;
  ON.me = freshRec(ON.side, m); ON.me.v = v; ON.me.t0 = t0;
  ON.pend = null; ON.seen = 0; ON.sealedToast = {};
  onlineSave(); pubMe();
  closeSheet();
  onlineRebuild();
  toast('Реванш! Раунд 1.', 'ok');
}
function onlineWantRematch(){
  if (!ON.active || !ON.me) return;
  ON.me.rm = ON.me.m + 1; touchMe();
  onlineSync(); renderEndOnline();
}

/* ---------- joining: wait for the room's records, then take the free seat ---------- */
function onlineJoin(code, own){
  // trying the same room again keeps this device's seat and sealed order
  if (ON.active && ON.code === code){ if (ON.joinTimer) clearInterval(ON.joinTimer); netStop(); ON = { active: false }; }
  else if (ON.active) onlineQuit();
  onlineNew(code);
  var mine = ON;
  showJoinSheet('Подключаемся к серверу связи…');
  askTabs(code, function(busy){
    if (ON !== mine) return;                                   // cancelled meanwhile
    // own: this tab asked to take the free seat under a name of its own
    var who = own ? { tab: true, cid: randHex(8), st: null } : pickSeat(code, busy);
    if (!who){ showOtherTab(code); return; }
    ON.cid = who.cid; ON.tab = who.tab;
    claimOwner();
    var st = who.st;
    if (st){
      ON.side = st.side; ON.host = !!st.host; ON.me = st.me; ON.room = st.room; ON.pend = st.pend || null; ON.seen = st.seen || 0; ON.oc = st.oc || '';
      var so = st.opp; if (so && so.k === 'pl' && so.side === 3 - st.side && (!ON.oc || so.cid === ON.oc)) ON.recs[so.side] = so;
    }
    NET.onReady = onClientReady;
    netStart(code);
    ON.joinTimer = setInterval(joinDecide, 500);
  });
}
function showOtherTab(code){
  openSheet('<div><span class="kick">Онлайн с другом</span><h3>Эта комната уже открыта</h3></div>' +
    '<p>Комната <b>' + fmtCode(code) + '</b> открыта в другой вкладке этого браузера. Вернитесь в ту вкладку.</p>' +
    '<p class="note">Хотите проверить игру сами? Займите здесь место второго игрока и сыграйте за обе стороны. Друг в эту комнату тогда уже не войдёт.</p>' +
    '<div class="btns"><button class="sec" id="otHere">Играть здесь вторым</button><button class="go" id="otMenu" data-focus>В меню</button></div>', { locked: true });
  $('otMenu').addEventListener('click', function(){ onlineQuit(); toMenu(); });
  $('otHere').addEventListener('click', function(){ onlineJoin(code, true); });
}
function onlineHost(rounds, side){
  if (ON.active) onlineQuit();
  onlineNew(genCode());
  ON.cid = myCid(); ON.tab = false; claimOwner();
  ON.host = true; ON.side = side; ON.phase = 'hosting';
  ON.room = { k: 'room', v: 1, cid: ON.cid, hs: side, rounds: rounds, pv: PROTO, t: Date.now() };
  ON.me = freshRec(side, 1);
  NET.onReady = onClientReady;
  netStart(ON.code);
  onlineSave(); setUrlRoom(ON.code);
  showRoomSheet();
}
function onClientReady(C){
  if (!ON.active) return;
  if (!ON.firstReady) ON.firstReady = Date.now();
  if (ON.host) pubRoom(C);
  if (ON.phase !== 'joining') pubMe(C);
  heartbeat(C);
  onlineSync();
}
function joinDecide(){
  if (!ON.active || ON.phase !== 'joining' || ON.decided) return;
  var now = Date.now();
  if (!ON.firstReady){
    if (!ON.t0) ON.t0 = now;
    if (now - ON.t0 > 15000) joinFail('Не получается связаться с сервером. Проверьте интернет. Некоторые школьные и офисные сети закрывают такие соединения: тогда помогает мобильный интернет.', true);
    else showJoinSheet('Подключаемся к серверу связи…');
    return;
  }
  var waited = now - ON.firstReady;
  if (ON.host && ON.room) pubRoom();
  if (!ON.room){ if (waited < 7000){ showJoinSheet('Ищем комнату ' + fmtCode(ON.code) + '…'); return; } joinFail('Комната ' + fmtCode(ON.code) + ' не найдена. Проверьте код или попросите друга прислать ссылку ещё раз.', true); return; }
  if (ON.room.pv !== PROTO){ joinFail('У друга другая версия игры. Обновите страницу у обоих и создайте новую комнату.', false); return; }
  if (waited < 1200){ showJoinSheet('Комната нашлась, занимаем место…'); return; }
  ON.decided = true; clearInterval(ON.joinTimer);
  if (ON.room.closed && !(ON.me && ON.host)){ joinFail('Хозяин закрыл эту комнату.', false); onlineForget(); return; }
  if (!(ON.me && ON.side)){
    var side = 3 - ON.room.hs, seat = ON.recs[side], g = ON.room.g;
    if (g && g !== ON.cid){ joinFail(seat && seat.left ? 'Эта партия уже закончилась: игрок вышел из комнаты. Создайте новую комнату.' : 'В этой комнате уже играют двое.', false); return; }
    if (seat && seat.cid !== ON.cid && !seat.left){ joinFail('В этой комнате уже играют двое.', false); return; }
    if (g && seat && seat.left){ joinFail('Эта партия уже закончилась: вы вышли из комнаты. Создайте новую комнату.', false); return; }
    ON.side = side;
    ON.me = seat && seat.cid === ON.cid ? seat : freshRec(side, (ON.recs[ON.room.hs] || {}).m || 1);
    if (ON.me.left){ ON.me.left = false; ON.me.v++; }
  }
  var o = oppRec();
  if (o && !ON.oc && o.cid !== ON.cid){
    ON.oc = o.cid;
    // a host coming back to a guest who arrived meanwhile lets that guest in, as the hosting sheet would have
    if (ON.host && !ON.room.g){ ON.room.g = o.cid; ON.room.v++; pubRoom(); }
  }
  if (ON.host && !ON.oc && ON.room.g) ON.oc = ON.room.g;
  onlineSave(); setUrlRoom(ON.code);
  pubMe(); heartbeat();
  // only a host still waiting for the first friend shows the sharing sheet; a match under way goes straight back on,
  // even if the friend's record has not come yet (when it comes, the match catches up)
  if (ON.host && !ON.oc){ ON.phase = 'hosting'; showRoomSheet(); return; }
  ON.phase = 'game';
  startOnline(true);
}
function joinFail(msg, retry){
  if (ON.joinTimer) clearInterval(ON.joinTimer);
  var code = ON.code;
  ON.decided = true;
  var s = openSheet('<div><span class="kick">Онлайн с другом</span><h3>Не получилось войти</h3></div><p>' + esc(msg) + '</p>' +
    '<div class="btns"><button class="sec" id="jfMenu">В меню</button>' + (retry ? '<button class="go" id="jfRetry" data-focus>Попробовать ещё</button>' : '') + '</div>', { locked: true });
  $('jfMenu').addEventListener('click', function(){ onlineQuit(); toMenu(); });
  if (retry) $('jfRetry').addEventListener('click', function(){ onlineJoin(code); });
}
// a battle still playing under a sheet that ends the match would open the round summary over it a moment later
function stopBattle(){ if (BAT && !BAT.done){ BAT.ev = []; BAT.done = true; } $('battleBar').hidden = true; }
function onlineBroken(msg, seatLost){
  ON.broken = true;
  hideWait(); stopBattle();
  UI.plan = null; document.body.classList.remove('planning'); $('plan').hidden = true; VIEW.offT = 0; refreshPlanLabels();
  openSheet('<div><span class="kick">Онлайн с другом</span><h3>Партию не продолжить</h3></div><p>' + esc(msg) + '</p><div class="btns"><button class="go" id="obMenu" data-focus>В меню</button></div>', { locked: true });
  $('obMenu').addEventListener('click', function(){ if (seatLost){ var c = ON.code, t = ON.tab; netStop(); ON = { active: false }; onlineForget(c, t); setUrlRoom(null); } else onlineQuit(); toMenu(); });
}
// leaving: mark the seat as free, and the last one out sweeps the room off the brokers
function onlineQuit(){
  if (!ON.active) return;
  if (ON.joinTimer) clearInterval(ON.joinTimer);
  // a page whose seat another tab has taken over leaves without a word: the goodbye would end that tab's match
  if (ownerLost()){ netStop(); ON = { active: false }; setUrlRoom(null); hideWait(); showNetToast(false); refreshOnlineUI(); return; }
  if (ON.me && ON.side && ON.phase !== 'joining'){ ON.me.left = true; ON.me.v++; pubMe(); }
  if (ON.host && ON.room && ON.phase !== 'joining'){ ON.room.closed = true; ON.room.v++; pubRoom(); }
  // only a seated player may sweep: someone who failed to get in must not wipe the room
  var o = oppRec(), seated = !!(ON.me && ON.side && ON.phase !== 'joining');
  if (seated && (ON.phase === 'hosting' || !o || o.left)){ netPub('room', null, true); netPub('s1', null, true); netPub('s2', null, true); }
  var cl = NET.clients; NET.clients = []; NET.topic = '';
  // connected clients get a moment to deliver the goodbye; the rest are dropped at once
  cl.forEach(function(C){ if (C.c && !C.c.connected){ try { C.c.end(true); } catch (e){} } });
  setTimeout(function(){ cl.forEach(function(C){ try { if (C.c && C.c.connected) C.c.end(false); else if (C.c) C.c.end(true); } catch (e){} }); }, 900);
  var resuming = ON.phase === 'joining', code = ON.code, tab = ON.tab;
  ON = { active: false };
  if (!resuming) onlineForget(code, tab);   // a cancelled reconnect keeps the unfinished match for later
  setUrlRoom(null);
  hideWait(); showNetToast(false); refreshOnlineUI();
}

/* ---------- presence: heartbeats every 4 s, a friend counts as gone after 11 s of silence ---------- */
// the beat comes from a worker: in a tab that has been hidden for a while the page's own timers slow down to once a minute
(function(){
  if (!netAvailable()) return;                             // no online mode on this page (the artifact has none)
  var ok = false, fb = false;
  function fallback(){ if (!fb && !ok){ fb = true; setInterval(function(){ heartbeat(); }, 4000); } }
  try {
    var w = new Worker(URL.createObjectURL(new Blob(['postMessage(0); setInterval(function(){ postMessage(0); }, 4000);'], { type: 'text/javascript' })));
    w.onmessage = function(){ ok = true; heartbeat(); };
    w.onerror = function(){ ok = false; fallback(); };
    setTimeout(fallback, 5000);
  } catch (e){ fallback(); }
})();
setInterval(presenceTick, 1000);
function presenceTick(){
  if (!ON.active || ownerLost()) return;
  var r = netReady(), now = Date.now();
  // while we ourselves are cut off we learn nothing about the friend: keep what we knew, and once we are back give
  // their next heartbeat a few seconds to arrive before calling them gone
  if (!r && NET.clients.length){ presenceGrace(); }
  var on = oppOnline();
  if (on !== ON.lastOn){
    if (ON.phase === 'game' && ON.lastOn !== null && now > (ON.quietUntil || 0) && !(oppRec() || {}).left) toast(on ? 'Друг снова в сети' : 'Друг пропал со связи. Ждём его…', on ? 'ok' : 'warn');
    ON.lastOn = on; refreshOnlineUI();
    if (G && G.phase === 'wait') renderWait();
    if (G && G.phase === 'plan') renderHint();
  }
  if (!r && NET.clients.length){ if (!ON.netDownT) ON.netDownT = now; if (now - ON.netDownT > 3000) showNetToast(true); }
  else { ON.netDownT = 0; showNetToast(false); }
}
function presenceGrace(){
  var now = Date.now();
  if (ON.lastOn) ON.oppSeen = Math.max(ON.oppSeen, now - 5000);
  ON.quietUntil = Math.max(ON.quietUntil || 0, now + 7000);
}
function onNetChanged(){
  if (typeof document === 'undefined') return;
  if (ON.active && ON.phase === 'hosting') renderRoomSheet();
}
// back on the page, or back online: brokers that are down are tried again at once instead of waiting out their back-off
function netKick(){
  NET.clients.forEach(function(C){
    if (!C.c || C.c.connected || C.trying) return;
    C.fails = 0; C.c.options.reconnectPeriod = 3000; C.trying = true;
    try { C.c.reconnect(); } catch (e){ C.trying = false; }
  });
}
document.addEventListener('visibilitychange', function(){
  if (document.hidden || !ON.active || ownerLost()) return;
  presenceGrace();       // a phone that slept has old news about the friend: wait for fresh heartbeats before judging
  netKick(); heartbeat();
});
window.addEventListener('online', function(){ if (ON.active) netKick(); });

/* ---------- the online sheets and bars ---------- */
function showRoomSheet(){
  var link = roomLink(ON.code), local = location.protocol === 'file:';
  var s = openSheet('<div><span class="kick">Онлайн с другом</span><h3>Комната <span class="codeBig">' + fmtCode(ON.code) + '</span></h3></div>' +
    '<p>Отправьте другу ссылку. Как только он её откроет, партия начнётся. Вы играете за ' + (ON.side === 1 ? 'Долину (синие)' : 'Порчу (фиолетовые)') + ', друг за ' + (ON.side === 1 ? 'Порчу' : 'Долину') + '. Раундов: ' + ON.room.rounds + '.</p>' +
    '<div class="share"><input id="roomLink" readonly value="' + esc(link) + '" aria-label="Ссылка на комнату"><button class="sec" id="rCopy">Копировать</button>' + (navigator.share ? '<button class="sec" id="rShare">Поделиться</button>' : '') + '</div>' +
    (local ? '<p class="note">Игра открыта как файл с этого компьютера, поэтому ссылка сработает только здесь. Чтобы позвать друга, выложите игру на GitHub Pages (как это сделать, написано в README). Друг может войти и по коду комнаты, если откроет ту же игру у себя.</p>' : '<p class="note">Друг может и сам ввести код <b>' + fmtCode(ON.code) + '</b> в меню: «Онлайн с другом» → «Войти по коду».</p>') +
    '<p class="netline"><span class="spin" id="roomSpin"></span><span id="roomStatus"></span></p>' +
    '<div class="btns"><button class="sec" id="rCancel">Закрыть комнату</button></div>', { wide: true, locked: true });
  $('rCopy').addEventListener('click', function(){ copyText(link, $('roomLink'), $('rCopy')); });
  if ($('rShare')) $('rShare').addEventListener('click', function(){ try { navigator.share({ title: 'Пять замков', text: 'Сыграем в «Пять замков»? Комната ' + fmtCode(ON.code), url: link }).catch(function(){}); } catch (e){} });
  $('roomLink').addEventListener('focus', function(){ this.select(); });
  $('rCancel').addEventListener('click', function(){ onlineQuit(); toMenu(); });
  renderRoomSheet();
}
function renderRoomSheet(){
  var st = $('roomStatus'); if (!st) return;
  var r = netReady();
  st.textContent = !r ? 'Подключаемся к серверу связи…' : 'Комната открыта. Ждём друга…';
}
function showJoinSheet(text){
  if (!$('joinStatus')){
    openSheet('<div><span class="kick">Онлайн с другом</span><h3>Комната <span class="codeBig">' + fmtCode(ON.code) + '</span></h3></div><p class="netline"><span class="spin"></span><span id="joinStatus"></span></p><div class="btns"><button class="sec" id="jCancel">Отменить</button></div>', { locked: true });
    $('jCancel').addEventListener('click', function(){ onlineQuit(); toMenu(); });
  }
  $('joinStatus').textContent = text;
}
function showCodeSheet(prefill, err){
  var s = openSheet('<div><span class="kick">Онлайн с другом</span><h3>Войти по коду</h3></div><p>Код комнаты — 6 букв и цифр, его видно у друга на экране и в конце ссылки.</p>' +
    '<input id="joinCode" class="codeIn" maxlength="9" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="ABC-DEF" aria-label="Код комнаты" value="' + esc(prefill || '') + '" data-focus>' +
    '<p class="err" id="joinErr"' + (err ? '' : ' hidden') + '>' + esc(err || '') + '</p>' +
    '<div class="btns"><button class="sec" id="jBack">Назад</button><button class="go" id="jGo">Войти</button></div>', { locked: true });
  function go(){
    var c = normCode($('joinCode').value), p = codeProblem(c);
    if (p){ $('joinErr').hidden = false; $('joinErr').textContent = p; return; }
    onlineJoin(c);
  }
  $('jGo').addEventListener('click', go);
  $('joinCode').addEventListener('keydown', function(e){ if (e.key === 'Enter'){ e.preventDefault(); go(); } });
  $('jBack').addEventListener('click', function(){ showMenu(true); });
}
function copyText(text, input, btn){
  function done(){ if (btn){ var t = btn.textContent; btn.textContent = 'Скопировано'; setTimeout(function(){ btn.textContent = t; }, 1600); } }
  function fallback(){ try { input.focus(); input.select(); document.execCommand('copy'); done(); } catch (e){ input.select(); } }
  try { navigator.clipboard.writeText(text).then(done, fallback); } catch (e){ fallback(); }
}
function showFriendLeft(){
  hideWait(); stopBattle();
  UI.plan = null; document.body.classList.remove('planning'); $('plan').hidden = true; VIEW.offT = 0; refreshPlanLabels();
  openSheet('<div><span class="kick">Онлайн с другом</span><h3>Друг вышел из комнаты</h3></div><p>Партия окончена. Можно создать новую комнату и позвать его снова.</p><div class="btns"><button class="go" id="flMenu" data-focus>В меню</button></div>', { locked: true });
  $('flMenu').addEventListener('click', function(){ onlineQuit(); toMenu(); });
}
function friendStatus(){
  var o = oppRec(), nr = G ? G.results.length + 1 : 1;
  if (!o) return 'away';
  if (o.left) return 'left';
  if (!oppOnline()) return 'away';
  return o.m === ON.me.m && o.c[nr] ? 'ready' : 'think';
}
function showWait(){ $('waitBar').hidden = false; $('battleBar').hidden = true; renderWait(); setCam(planPreset(ON.side)); }
function hideWait(){ var w = $('waitBar'); if (w) w.hidden = true; }
function renderWait(){
  if ($('waitBar').hidden) return;
  var st = friendStatus(), t;
  if (st === 'ready') t = '<b>Оба приказа готовы.</b> Вскрываем…';
  else if (st === 'left') t = '<b>Друг вышел из комнаты.</b>';
  else if (st === 'away') t = '<b>Приказ запечатан.</b> Друг не в сети: бой начнётся, когда он вернётся.';
  else t = '<b>Приказ запечатан.</b> Ждём, пока друг отдаст свой…';
  $('waitText').innerHTML = t;
}
function refreshOnlineUI(){ renderPresence(); }
function renderPresence(){
  [1, 2].forEach(function(p){
    var d = $('pres' + p); if (!d) return;
    var show = !!(G && G.mode === 'online' && ON.active && ON.side && p !== ON.side);
    d.hidden = !show;
    if (show){ var on = oppOnline(); d.className = 'pres ' + (on ? 'on' : 'off'); d.title = on ? 'Друг в сети' : 'Друг не в сети'; }
  });
}
function renderEndOnline(){
  var b = $('eRematch'), st = $('eStatus'); if (!b || !st || !ON.me) return;
  var o = oppRec(), m = ON.me.m, mine = ON.me.rm === m + 1, theirs = o && (o.rm === m + 1 || o.m === m + 1);
  b.disabled = mine || !o || o.left;
  b.innerHTML = svg('swords') + (mine ? 'Ждём друга…' : 'Реванш');
  st.textContent = !o || o.left ? 'Друг вышел из комнаты.' : theirs ? 'Друг хочет реванш.' : mine ? 'Реванш начнётся, когда друг тоже согласится.' : (oppOnline() ? 'Друг в сети.' : 'Друг не в сети.');
}

/* ---------- toasts ---------- */
function toast(text, kind, ms){
  var box = $('toasts'); if (!box) return;
  var t = document.createElement('div'); t.className = 'toast panel ' + (kind || ''); t.innerHTML = '<i></i><span></span>'; t.lastChild.textContent = text;
  box.appendChild(t);
  while (box.children.length > 3) box.removeChild(box.firstChild);
  setTimeout(function(){ t.classList.add('out'); setTimeout(function(){ if (t.parentNode) t.parentNode.removeChild(t); }, 300); }, ms || 3200);
}
function showNetToast(on){
  var el = $('netToast'); if (!el) return;
  el.hidden = !on;
}
/* ===================== 12 · interface: labels, camera, orders, sheets, the round flow ===================== */
function $(id){ return document.getElementById(id); }
function svg(id){ return '<svg class="ic"><use href="#i-' + id + '"/></svg>'; }
var TEAMCSS = ['var(--neutral)', 'var(--valley-deep)', 'var(--blight-deep)'];
var TEAMTXT = ['var(--neutral)', 'var(--valley)', 'var(--blight)'];
var SETTINGS = { mode: 'bot', diff: 'hard', rounds: 7, side: 1 };
try { var _st = JSON.parse(localStorage.getItem('five.castles.settings') || 'null'); if (_st && typeof _st === 'object'){ if (['bot', 'hot', 'online'].indexOf(_st.mode) >= 0) SETTINGS.mode = _st.mode; if (_st.diff === 'easy' || _st.diff === 'hard') SETTINGS.diff = _st.diff; if ([5, 7, 9].indexOf(_st.rounds) >= 0) SETTINGS.rounds = _st.rounds; if (_st.side === 1 || _st.side === 2) SETTINGS.side = _st.side; } } catch (e){}
function saveSettings(){ try { localStorage.setItem('five.castles.settings', JSON.stringify(SETTINGS)); } catch (e){} }
function playerName(p){ return NAMES[p]; }
function playerTag(p){
  if (!G) return '';
  if (G.mode === 'bot') return p === 1 ? 'Синие · вы' : 'Фиолетовые · бот';
  if (G.mode === 'online') return (p === 1 ? 'Синие' : 'Фиолетовые') + ' · ' + (p === G.me ? 'вы' : 'друг');
  return p === 1 ? 'Синие · игрок 1' : 'Фиолетовые · игрок 2';
}
function planPreset(p){ return p === 2 && G && G.mode !== 'bot' ? 'plan2' : 'plan1'; }
function battlePreset(){ return G && G.mode === 'online' && ON.side === 2 ? 'battle2' : 'battle'; }
function plural(n, a, b, c){ var m = Math.abs(n) % 100, k = m % 10; if (m > 10 && m < 20) return c; if (k > 1 && k < 5) return b; if (k === 1) return a; return c; }

/* ---------- labels over the board ---------- */
var LBL = { castle: [], squad: { 1: [], 2: [] }, res: { 1: null, 2: null }, fight: [], floats: [], camp: null };
var _pv = new V3();
function mkLabel(inner){ var d = document.createElement('div'); d.className = 'lbl'; d.innerHTML = inner; $('labels').appendChild(d); return d; }
function placeLabel(el, x, y, z){
  _pv.set(x, y, z).project(camera);
  if (_pv.z > 1 || _pv.z < -1 || Math.abs(_pv.x) > 1.3 || Math.abs(_pv.y) > 1.3){ if (el.style.visibility !== 'hidden') el.style.visibility = 'hidden'; return; }
  if (el.style.visibility === 'hidden') el.style.visibility = '';
  var sx = (_pv.x + 1) / 2 * VIEW.w, sy = (1 - _pv.y) / 2 * VIEW.h;
  el.style.transform = 'translate3d(' + sx.toFixed(1) + 'px,' + sy.toFixed(1) + 'px,0)';
}
function buildLabels(){
  CASTLES.forEach(function(c, i){
    var el = mkLabel('<div class="cl"><span class="clName"><i></i><span class="n">' + esc(c.name) + '</span><span class="v">+' + c.value + '</span><span class="tw"><u></u><u></u><u></u></span></span><span class="order" hidden></span><span class="order rchip" hidden></span></div>');
    el.dataset.i = i;
    LBL.castle.push({ el: el, ord: el.querySelector('.order'), rc: el.querySelector('.rchip'), dot: el.querySelector('.clName'), tw: el.querySelectorAll('.tw u') });
  });
  [1, 2].forEach(function(p){
    for (var i = 0; i < 5; i++){ var el = mkLabel('<div class="sq' + (p === 2 ? ' p2' : '') + '"></div>'); el.hidden = true; LBL.squad[p].push({ el: el, t: el.firstChild }); }
    var r = mkLabel('<div class="sq res"></div>'); r.hidden = true; LBL.res[p] = { el: r, t: r.firstChild };
  });
  var cp = mkLabel('<div class="sq camp"><i class="pres"></i><span></span></div>'); cp.hidden = true; LBL.camp = { el: cp, t: cp.querySelector('span'), dot: cp.querySelector('i') };
  for (var f = 0; f < 5; f++){ var fe = mkLabel('<div class="fight"><div class="row"><b class="v1">0</b><span class="vs">:</span><b class="v2">0</b></div></div>'); fe.hidden = true; LBL.fight.push({ el: fe, a: fe.querySelector('.v1'), b: fe.querySelector('.v2'), row: fe.querySelector('.row') }); }
}
function refreshCastleLabels(){
  CVIS.forEach(function(V, i){
    var L = LBL.castle[i], c = G ? G.castles[i] : { owner: V.owner, level: V.level };
    L.dot.style.setProperty('--own', TEAMCSS[V.owner]);
    for (var k = 0; k < 3; k++) L.tw[k].classList.toggle('on', V.level > k);
    L.dot.title = (V.owner ? 'Владеет ' + playerName(V.owner) : 'Ничей') + (V.level ? ' · башни бьют ' + FIRE[V.level] : '');
  });
}
function updateLabels(){
  CVIS.forEach(function(V, i){ var p = castleTopWorld(V); placeLabel(LBL.castle[i].el, p.x, p.y + 0.4, p.z); });
  var pl = UI.plan;
  [1, 2].forEach(function(p){
    var show = pl && pl.p === p;
    for (var i = 0; i < 5; i++){
      var L = LBL.squad[p][i], n = show ? pl.plan.alloc[i] : 0;
      if (!n){ if (!L.el.hidden) L.el.hidden = true; continue; }
      if (L.el.hidden) L.el.hidden = false;
      if (L.t.textContent !== String(n)) L.t.textContent = n;
      var sp = squadSpot(p, i); placeLabel(L.el, sp.x, groundY(sp.x, sp.z) + 1.7, sp.z + sideOf(p) * 0.7);
    }
    var R = LBL.res[p], left = show ? TROOPS - planUsed(pl.plan) : 0;
    if (!left){ if (!R.el.hidden) R.el.hidden = true; }
    else { if (R.el.hidden) R.el.hidden = false; var tx = 'резерв ' + left; if (R.t.textContent !== tx) R.t.textContent = tx; var rs = reserveSpot(p); placeLabel(R.el, rs.x, groundY(rs.x, rs.z) + 1.9, rs.z + sideOf(p) * 1.4); }
  });
  var C = LBL.camp, showC = G && G.mode === 'online' && ON.active && ON.side && (G.phase === 'plan' || G.phase === 'wait') && !isNarrow();
  if (!showC){ if (!C.el.hidden) C.el.hidden = true; }
  else {
    var fs = friendStatus(), tx = fs === 'ready' ? 'Друг: приказ готов' : fs === 'away' ? 'Друг не в сети' : fs === 'left' ? 'Друг вышел' : 'Друг думает…', os = oppSide(), rp = squadSpot(os, 2);
    if (C.el.hidden) C.el.hidden = false;
    if (C.t.textContent !== tx){ C.t.textContent = tx; C.el.firstChild.className = 'sq camp p' + os + (fs === 'ready' ? ' ready' : ''); C.dot.className = 'pres ' + (fs === 'away' || fs === 'left' ? 'off' : 'on'); }
    placeLabel(C.el, rp.x, groundY(rp.x, rp.z) + 1.2, rp.z - sideOf(os) * 1.6);
  }
  LBL.fight.forEach(function(F, i){
    if (F.el.hidden) return;
    var c = CASTLES[i]; placeLabel(F.el, c.fx, groundY(c.fx, c.fz) + 3.4, c.fz - 1.2);
    if (BAT && !BAT.done && !F.fixed){ var a = 0, b = 0; BAT.sq[i][1].forEach(function(s){ if (s.alive) a++; }); BAT.sq[i][2].forEach(function(s){ if (s.alive) b++; }); if (F.a.textContent !== String(a)) F.a.textContent = a; if (F.b.textContent !== String(b)) F.b.textContent = b; }
  });
  for (var q = LBL.floats.length - 1; q >= 0; q--){ var fl = LBL.floats[q]; fl.life -= 1 / 60; if (fl.life <= 0){ fl.el.remove(); LBL.floats.splice(q, 1); continue; } placeLabel(fl.el, fl.p.x, fl.p.y, fl.p.z); }
}
function uiFloat(p, text, player, kind){
  var el = mkLabel('<div class="float ' + (kind || '') + '"' + (player && kind !== 'gold' && kind !== 'up' ? ' style="color:' + TEAMTXT[player] + '"' : '') + '>' + text + '</div>');
  LBL.floats.push({ el: el, p: p.clone ? p.clone() : p, life: 1.7 });
  placeLabel(el, p.x, p.y, p.z);
}
function uiFight(i, a1, a2){ var F = LBL.fight[i]; F.el.hidden = false; F.fixed = false; F.a.textContent = a1; F.b.textContent = a2; }
function resultText(B){
  var n = B.winner ? playerName(B.winner) : '';
  if (B.captured) return B.ownerBefore ? n + ' отбила замок' : n + ' заняла замок';
  if (B.ownerBefore){ if (B.a1 + B.a2 === 0) return 'Без боя'; return (B.a1 && B.a2) || B.killed ? n + ' удержала' : 'Гарнизон усилен'; }
  return B.a1 + B.a2 ? 'Ничья, замок ничей' : 'Без боя';
}
function resultShort(B){
  if (B.captured) return B.ownerBefore ? 'Отбит' : 'Занят';
  if (B.ownerBefore) return (B.a1 && B.a2) || B.killed ? 'Удержан' : (B.a1 + B.a2 ? 'Усилен' : '');
  return B.a1 + B.a2 ? 'Ничья' : '';
}
function uiFightResult(B, instant){
  if (B.a1 + B.a2 === 0) return;
  var F = LBL.fight[B.i]; F.el.hidden = false; F.fixed = true;
  F.a.textContent = B.winner === 1 ? B.surv : 0; F.b.textContent = B.winner === 2 ? B.surv : 0;
  var L = LBL.castle[B.i], t = resultShort(B);
  if (t){ L.rc.hidden = false; L.rc.textContent = t; L.rc.className = 'order rchip ' + (B.winner ? 'p' + B.winner : 'nb'); }
  refreshCastleLabels();
}
function uiClearFights(){ LBL.fight.forEach(function(F){ F.el.hidden = true; F.fixed = false; }); LBL.castle.forEach(function(L){ L.rc.hidden = true; }); }

/* ---------- camera ---------- */
var CAMC = { yaw: 0, pitch: 1.0, dist: 70, tgt: new V3(1, 0.4, 1.5), yawT: 0, pitchT: 1.0, distT: 70, tgtT: new V3(1, 0.4, 1.5), preset: 'battle' };
function isNarrow(){ return VIEW.w < 700 || VIEW.w / Math.max(1, VIEW.h - VIEW.offT) < 1.0; }
// frame the points that matter for this moment inside the part of the screen the panels leave free
function camPoints(name){
  var pts = [];
  CVIS.forEach(function(V){ var p = castleTopWorld(V); pts.push(new V3(p.x, p.y + 2.3, p.z)); });
  if (name === 'plan1' || name === 'plan2'){
    var p = name === 'plan1' ? 1 : 2;
    for (var i = 0; i < 5; i++){ var s = squadSpot(p, i); pts.push(new V3(s.x, 0, s.z + sideOf(p) * 2.4)); }
    var r = reserveSpot(p); pts.push(new V3(r.x, 0, r.z + sideOf(p) * 0.8));
  } else {
    CASTLES.forEach(function(c){ pts.push(new V3(c.fx, 0, c.fz + 3.6)); pts.push(new V3(c.fx, 0, c.fz - 3.6)); });
    pts.push(new V3(-10, 0, 13.5), new V3(10, 0, 13.5), new V3(-10, 1.5, -13.5), new V3(10, 1.5, -13.5));
  }
  return pts;
}
var _fq = new V3();
function camPlace(tgt, yaw, pitch, dist){
  var cp = Math.cos(pitch), sp = Math.sin(pitch);
  camera.position.set(tgt.x + Math.sin(yaw) * cp * dist, tgt.y + sp * dist, tgt.z + Math.cos(yaw) * cp * dist);
  camera.lookAt(tgt); camera.updateMatrixWorld(true);
}
function projBox(pts, tgt, yaw, pitch, dist){
  camPlace(tgt, yaw, pitch, dist);
  var b = { x0: 9, x1: -9, y0: 9, y1: -9 };
  pts.forEach(function(p){ _fq.copy(p).project(camera); b.x0 = Math.min(b.x0, _fq.x); b.x1 = Math.max(b.x1, _fq.x); b.y0 = Math.min(b.y0, _fq.y); b.y1 = Math.max(b.y1, _fq.y); });
  return b;
}
function camPreset(name, fx){
  var narrow = isNarrow(), back = name === 'plan2' || name === 'battle2', yaw = back ? Math.PI : 0, isB = name.indexOf('battle') === 0, pitch = isB ? 0.96 : 1.02;
  var pts = camPoints(name), tgt = new V3(), saved = { off: VIEW.off, pos: camera.position.clone(), q: camera.quaternion.clone() };
  pts.forEach(function(p){ tgt.add(p); }); tgt.divideScalar(pts.length); tgt.y = 0.4;
  if (narrow) tgt.x = fx !== undefined ? fx : 0;
  // project with the panel the frame will end up with
  VIEW.off = VIEW.offT; applyViewOffset();
  var hudPx = (VIEW.w < 520 ? 74 : 92) + (isB ? 0 : 24), yTop = 1 - 2 * hudPx / VIEW.h, yBot = -1 + 2 * (VIEW.offT + (VIEW.offT ? 6 : 64)) / VIEW.h, xLim = narrow ? 99 : 1 - 2 * 80 / VIEW.w, dist = 60;
  for (var it = 0; it < 4; it++){
    var lo = 14, hi = 170;
    for (var k = 0; k < 20; k++){ var mid = (lo + hi) / 2, b = projBox(pts, tgt, yaw, pitch, mid); if (b.x0 >= -xLim && b.x1 <= xLim && b.y0 >= yBot && b.y1 <= yTop) hi = mid; else lo = mid; }
    dist = hi;
    var b0 = projBox(pts, tgt, yaw, pitch, dist), want = (yBot + yTop) / 2, m0 = (b0.y0 + b0.y1) / 2;
    var t2 = tgt.clone(); t2.z += 1; var b1 = projBox(pts, t2, yaw, pitch, dist), m1 = (b1.y0 + b1.y1) / 2;
    if (Math.abs(m1 - m0) > 1e-4) tgt.z = clamp(tgt.z + (want - m0) / (m1 - m0), -20, 20);
    if (!narrow){ var mx = (b0.x0 + b0.x1) / 2; t2 = tgt.clone(); t2.x += 1; var bx = projBox(pts, t2, yaw, pitch, dist), mx1 = (bx.x0 + bx.x1) / 2; if (Math.abs(mx1 - mx) > 1e-4) tgt.x = clamp(tgt.x + (0 - mx) / (mx1 - mx), -10, 10); }
  }
  VIEW.off = saved.off; applyViewOffset();
  camera.position.copy(saved.pos); camera.quaternion.copy(saved.q); camera.updateMatrixWorld(true);
  return { tgt: tgt, yaw: yaw, pitch: pitch, dist: clamp(dist, 20, narrow ? 125 : 130) };
}
function setCam(name, instant, fx){
  CAMC.preset = name;
  var P = camPreset(name, fx);
  CAMC.tgtT.copy(P.tgt); CAMC.yawT = P.yaw; CAMC.pitchT = P.pitch; CAMC.distT = P.dist;
  if (instant){ CAMC.tgt.copy(P.tgt); CAMC.yaw = P.yaw; CAMC.pitch = P.pitch; CAMC.dist = P.dist; }
}
function focusCastle(i){ if (!isNarrow()) return; var c = CASTLES[i]; CAMC.tgtT.x = c.x + FIELD_DX * 0.5; }
function updateCam(dt){
  VIEW.off += (VIEW.offT - VIEW.off) * Math.min(1, dt * 7); if (Math.abs(VIEW.offT - VIEW.off) < 0.5) VIEW.off = VIEW.offT;
  var k = 1 - Math.exp(-dt * 4.2);
  CAMC.yaw += angDiff(CAMC.yaw, CAMC.yawT) * k; CAMC.pitch += (CAMC.pitchT - CAMC.pitch) * k; CAMC.dist += (CAMC.distT - CAMC.dist) * k; CAMC.tgt.lerp(CAMC.tgtT, k);
  var cp = Math.cos(CAMC.pitch), sp = Math.sin(CAMC.pitch);
  camera.position.set(CAMC.tgt.x + Math.sin(CAMC.yaw) * cp * CAMC.dist, CAMC.tgt.y + sp * CAMC.dist, CAMC.tgt.z + Math.cos(CAMC.yaw) * cp * CAMC.dist);
  camera.lookAt(CAMC.tgt);
  camera.near = Math.max(0.5, CAMC.dist * 0.05); camera.far = 1400;
  applyViewOffset();
}
function initControls(){
  var el = renderer.domElement, ptrs = {}, drag = null, pinch = null;
  el.addEventListener('contextmenu', function(e){ e.preventDefault(); });
  el.addEventListener('pointerdown', function(e){
    ptrs[e.pointerId] = { x: e.clientX, y: e.clientY, type: e.pointerType };
    try { el.setPointerCapture(e.pointerId); } catch (x){}
    var ids = Object.keys(ptrs);
    if (ids.length === 2){ var a = ptrs[ids[0]], b = ptrs[ids[1]]; pinch = { d: hyp(a.x - b.x, a.y - b.y), ang: Math.atan2(b.y - a.y, b.x - a.x), cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2 }; drag = null; }
    else drag = { x: e.clientX, y: e.clientY, mode: e.pointerType === 'touch' ? 'pan' : (e.button === 2 || e.shiftKey ? 'pan' : 'rot'), moved: 0 };
  });
  el.addEventListener('pointermove', function(e){
    var P = ptrs[e.pointerId]; if (!P) return;
    P.x = e.clientX; P.y = e.clientY;
    var ids = Object.keys(ptrs);
    if (pinch && ids.length >= 2){
      var a = ptrs[ids[0]], b = ptrs[ids[1]], d = hyp(a.x - b.x, a.y - b.y), ang = Math.atan2(b.y - a.y, b.x - a.x), cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2;
      CAMC.distT = clamp(CAMC.distT * pinch.d / Math.max(10, d), 14, 150);
      CAMC.yawT += angDiff(pinch.ang, ang);
      panBy(cx - pinch.cx, cy - pinch.cy);
      pinch.d = d; pinch.ang = ang; pinch.cx = cx; pinch.cy = cy;
      return;
    }
    if (!drag) return;
    var dx = e.clientX - drag.x, dy = e.clientY - drag.y; drag.x = e.clientX; drag.y = e.clientY; drag.moved += Math.abs(dx) + Math.abs(dy);
    if (drag.mode === 'rot'){ CAMC.yawT -= dx * 0.005; CAMC.pitchT = clamp(CAMC.pitchT + dy * 0.004, 0.32, 1.45); }
    else panBy(dx, dy);
  });
  function up(e){ delete ptrs[e.pointerId]; if (Object.keys(ptrs).length < 2) pinch = null; if (!Object.keys(ptrs).length) drag = null; }
  el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
  el.addEventListener('wheel', function(e){ e.preventDefault(); CAMC.distT = clamp(CAMC.distT * Math.pow(1.0012, e.deltaY), 14, 150); }, { passive: false });
}
function panBy(dx, dy){
  var s = CAMC.dist * 0.0017, cy = Math.cos(CAMC.yaw), sy = Math.sin(CAMC.yaw);
  CAMC.tgtT.x -= (dx * cy + dy * sy) * s; CAMC.tgtT.z -= (-dx * sy + dy * cy) * s;
  CAMC.tgtT.x = clamp(CAMC.tgtT.x, -36, 36); CAMC.tgtT.z = clamp(CAMC.tgtT.z, -28, 28);
}

/* ---------- the orders panel ---------- */
var UI = { plan: null, sel: 0, busy: false };
function buildCards(){
  var box = $('cards'); box.innerHTML = '';
  CASTLES.forEach(function(c, i){
    var d = document.createElement('div'); d.className = 'card'; d.dataset.i = i;
    d.innerHTML = '<div class="cHead"><div class="cTop"><span class="cName">' + esc(c.name) + '</span><span class="cVal" title="Каждый раунд: +' + c.value + ' золота и +' + c.value + ' славы хозяину">' + svg('crown') + '+' + c.value + '</span></div><div class="cInfo"><span class="own"><i></i><span class="ot"></span></span><span class="def" hidden></span></div></div>' +
      '<div class="step"><button class="sb minus" aria-label="Убрать воина из отряда ' + esc(c.name) + '">−</button><output class="num" id="num' + i + '">0</output><button class="sb plus" aria-label="Добавить воина в отряд ' + esc(c.name) + '">+</button></div>' +
      '<button class="upg" title="Укрепить замок"></button>';
    box.appendChild(d);
    hold(d.querySelector('.minus'), function(n){ changeAlloc(i, -n); });
    hold(d.querySelector('.plus'), function(n){ changeAlloc(i, n); });
    d.querySelector('.upg').addEventListener('click', function(){ toggleUpg(i); });
    d.addEventListener('pointerdown', function(){ selectCard(i, true); });
  });
}
// press and hold repeats, faster the longer you hold
function hold(btn, fn){
  var tm = null, n = 0;
  function stop(){ clearTimeout(tm); tm = null; }
  btn.addEventListener('pointerdown', function(e){ e.preventDefault(); n = 0; fn(1); var step = function(){ n++; fn(n > 12 ? 3 : 1); tm = setTimeout(step, n > 6 ? 55 : 95); }; tm = setTimeout(step, 380); });
  ['pointerup', 'pointerleave', 'pointercancel'].forEach(function(ev){ btn.addEventListener(ev, stop); });
  btn.addEventListener('keydown', function(e){ if (e.key === 'Enter' || e.key === ' '){ e.preventDefault(); fn(e.shiftKey ? 5 : 1); } });
}
function selectCard(i, focus){
  UI.sel = i;
  document.querySelectorAll('.card').forEach(function(c){ c.classList.toggle('sel', +c.dataset.i === i); });
  if (focus) focusCastle(i);
  renderHint();
}
function changeAlloc(i, d){
  var P = UI.plan; if (!P) return;
  var a = P.plan.alloc, left = TROOPS - planUsed(P.plan);
  if (d > 0) d = Math.min(d, left); else d = Math.max(d, -a[i]);
  if (!d) return;
  a[i] += d;
  arrangeSquads(P.p, a);
  renderCards();
}
function setAlloc(arr){
  var P = UI.plan; if (!P) return;
  P.plan.alloc = arr.slice(); arrangeSquads(P.p, P.plan.alloc); renderCards();
}
function toggleUpg(i){
  var P = UI.plan; if (!P) return;
  if (P.plan.upg[i]) P.plan.upg[i] = false;
  else if (canUpgrade(P.p, i, P.plan)) P.plan.upg[i] = true;
  renderCards();
}
function renderCards(){
  var P = UI.plan; if (!P) return;
  var p = P.p, opp = 3 - p, plan = P.plan, left = TROOPS - planUsed(plan), goldLeft = G.pl[p].gold - planGold(plan);
  document.querySelectorAll('.card').forEach(function(card){
    var i = +card.dataset.i, c = G.castles[i], n = plan.alloc[i];
    card.style.setProperty('--own', TEAMCSS[c.owner]);
    card.querySelector('.own i').style.background = TEAMCSS[c.owner];
    card.querySelector('.ot').textContent = c.owner === p ? 'Ваш' : c.owner ? playerName(c.owner) : 'Ничей';
    var def = card.querySelector('.def'), lvl = c.level + (plan.upg[i] ? 1 : 0);
    if (c.owner && lvl > 0){ def.hidden = false; def.classList.toggle('mine', c.owner === p); def.innerHTML = svg('tower') + (c.owner === p ? '+' : '−') + FIRE[lvl]; def.title = c.owner === p ? 'Ваши башни убьют ' + FIRE[lvl] + ' нападающих' : 'Башни убьют ' + FIRE[lvl] + ' ваших воинов до схватки'; }
    else def.hidden = true;
    var num = card.querySelector('.num'); num.textContent = n; num.classList.toggle('zero', !n);
    card.querySelector('.minus').disabled = !n; card.querySelector('.plus').disabled = !left;
    var u = card.querySelector('.upg');
    if (c.owner !== p){ u.disabled = true; u.classList.remove('on'); u.innerHTML = svg('hammer') + '<span class="ul">Только свой замок</span>'; u.title = 'Укреплять можно только свои замки'; }
    else if (c.level >= 3){ u.disabled = true; u.classList.remove('on'); u.innerHTML = svg('tower') + '<span class="ul">Укреплён полностью</span>'; u.title = 'Все три башни уже построены'; }
    else {
      var cost = UPG_COST[c.level], on = plan.upg[i];
      u.disabled = !on && goldLeft < cost; u.classList.toggle('on', on);
      u.innerHTML = svg('hammer') + '<span class="ul">' + (on ? ADDON_NAMES[c.level] + ': строим' : ADDON_NAMES[c.level]) + '</span>' + ' · ' + cost + svg('coin');
      u.title = on ? 'Отменить постройку' : 'Построить: ' + ADDON_NAMES[c.level].toLowerCase() + ' (башни будут бить ' + FIRE[c.level + 1] + ')';
    }
  });
  $('poolLeft').textContent = left; $('pool').classList.toggle('empty', !left);
  $('goText').textContent = left ? 'В бой · ' + left + ' в резерве' : 'В бой';
  $('qRepeat').disabled = !G.last[p];
  renderHint();
  refreshPlanLabels();
}
function renderHint(){
  var P = UI.plan; if (!P) return;
  var p = P.p, i = UI.sel, c = G.castles[i], cd = CASTLES[i], h;
  var lvl = c.level + (P.plan.upg[i] ? 1 : 0);
  if (c.owner && c.owner !== p && c.level) h = '<b>' + cd.name + '</b>: башни ' + playerName(c.owner) + ' убьют ' + FIRE[c.level] + ' ' + plural(FIRE[c.level], 'вашего воина', 'ваших воинов', 'ваших воинов') + ' до схватки. Чтобы взять замок, пошлите больше, чем пошлёт защитник, плюс эти ' + FIRE[c.level] + '.';
  else if (c.owner === p && lvl) h = '<b>' + cd.name + '</b>: ваши башни собьют ' + FIRE[lvl] + ' нападающих. Ничья остаётся за вами.';
  else if (c.owner === p) h = '<b>' + cd.name + '</b> — ваш замок. Ничья остаётся за вами, а золото можно вложить в башни.';
  else h = 'Где воинов больше, тот и забрал замок. <b>' + cd.name + '</b> приносит хозяину +' + cd.value + ' золота и славы за раунд.';
  if (G.mode === 'bot') h += ' <span class="v2">Порча уже отдала тайный приказ.</span>';
  renderFriendChip();
  if (G.mode === 'online' && ON.active){ var fs = friendStatus(); h += ' <span class="v' + oppSide() + '">' + (fs === 'ready' ? 'Друг уже отдал приказ.' : fs === 'away' ? 'Друг сейчас не в сети.' : fs === 'left' ? 'Друг вышел.' : 'Друг ещё думает.') + '</span>'; }
  $('planHint').innerHTML = h;
}
// the friend's state in the orders panel (on a phone the hint line is hidden)
function renderFriendChip(){
  var c = $('fchip'), on = G && G.mode === 'online' && ON.active && ON.side;
  c.hidden = !on; if (!on) return;
  var fs = friendStatus(), t = fs === 'ready' ? 'Друг готов' : fs === 'away' ? 'Друг не в сети' : fs === 'left' ? 'Друг вышел' : 'Друг думает…';
  if (c.lastChild.textContent !== t) c.lastChild.textContent = t;
  c.firstChild.className = 'pres ' + (fs === 'away' || fs === 'left' ? 'off' : 'on');
}
function refreshPlanLabels(){
  var P = UI.plan;
  LBL.castle.forEach(function(L, i){
    if (!P){ L.ord.hidden = true; return; }
    var n = P.plan.alloc[i], up = P.plan.upg[i];
    if (!n && !up){ L.ord.hidden = true; return; }
    L.ord.hidden = false; L.ord.className = 'order ' + (up && !n ? 'up' : 'p' + P.p);
    L.ord.textContent = (n ? '→ ' + n : '') + (up ? (n ? ' · ' : '') + 'башня' : '');
  });
}
function evenSplit(){
  var P = UI.plan; if (!P) return;
  setAlloc([10, 10, 10, 10, 10]);
}

/* ---------- top bar ---------- */
var HUDV = { g1: 0, g2: 0, c1: 0, c2: 0 };
function renderHud(instant){
  if (!G) return;
  $('roundN').textContent = Math.min(G.round, G.rounds); $('roundsN').textContent = G.rounds;
  $('nm1').textContent = playerName(1); $('nm2').textContent = playerName(2);
  $('tag1').textContent = playerTag(1); $('tag2').textContent = playerTag(2);
  var t = { g1: G.pl[1].glory, g2: G.pl[2].glory, c1: G.pl[1].gold, c2: G.pl[2].gold };
  if (instant) HUDV = Object.assign({}, t);
  HUD_T = t;
  $('side1').classList.toggle('turn', !!(UI.plan && UI.plan.p === 1)); $('side2').classList.toggle('turn', !!(UI.plan && UI.plan.p === 2));
  renderPresence();
  drawHud();
}
var HUD_T = { g1: 0, g2: 0, c1: 0, c2: 0 };
function drawHud(){ $('glory1').textContent = Math.round(HUDV.g1); $('glory2').textContent = Math.round(HUDV.g2); $('gold1').textContent = Math.round(HUDV.c1); $('gold2').textContent = Math.round(HUDV.c2); }
function tickHud(dt){
  var ch = false;
  ['g1', 'g2', 'c1', 'c2'].forEach(function(k){ var d = HUD_T[k] - HUDV[k]; if (Math.abs(d) > 0.01){ HUDV[k] += Math.sign(d) * Math.max(Math.min(Math.abs(d), dt * 8), Math.min(Math.abs(d), dt * Math.abs(d) * 3)); ch = true; } else HUDV[k] = HUD_T[k]; });
  if (ch) drawHud();
}

/* ---------- sheets ---------- */
function openSheet(html, o){
  o = o || {};
  var m = $('modal'), s = $('sheet');
  s.className = 'sheet panel' + (o.wide ? ' wide' : '');
  s.innerHTML = html; m.hidden = false; m.classList.toggle('clear', !!o.clear);
  s.dataset.locked = o.locked ? '1' : '';
  var f = s.querySelector('[data-focus]') || s.querySelector('button'); if (f) setTimeout(function(){ try { f.focus({ preventScroll: true }); } catch (e){} }, 30);
  return s;
}
function closeSheet(){ $('modal').hidden = true; $('sheet').innerHTML = ''; $('sheet').dataset.locked = ''; UI.menuOpen = false; }
// The round summary leaves the ? and ☰ buttons usable. A sheet opened from them replaces it, so closing that sheet puts
// the summary (or the final score) back: otherwise the round would have no button to go on with.
function closeOverlay(){
  closeSheet();
  if (!G) return;
  if (G.phase === 'summary' && G.results.length) showSummary(G.results[G.results.length - 1]);
  else if (G.phase === 'end') showEnd();
}
function rulesHtml(){
  return '<ul class="rules">' +
    '<li>' + svg('swords') + '<span>Каждый раунд у каждой стороны <b>50 воинов</b>. Тайно раздели их между пятью замками. Где воинов больше, тот и забрал замок; при ничьей замок остаётся у хозяина.</span></li>' +
    '<li>' + svg('crown') + '<span>Замки стоят <b>1, 2, 3, 2, 1</b>. В конце раунда каждый замок приносит хозяину столько же <b>золота</b> и <b>славы</b>.</span></li>' +
    '<li>' + svg('hammer') + '<span>Золото тратится на башни в своих замках. Башни стреляют по нападающим <b>до схватки</b>, поэтому на укреплённый замок нужно больше войск. Захваченный замок теряет одну башню.</span></li>' +
    '<li>' + svg('shield') + '<span>Побеждает тот, у кого <b>больше славы</b> после последнего раунда. При равенстве считают золото.</span></li>' +
    '</ul><div class="towers"><div><b>Лучники</b>' + UPG_COST[0] + ' золота · бьют <em>' + FIRE[1] + '</em></div><div><b>Баллиста</b>+' + UPG_COST[1] + ' золота · всего <em>' + FIRE[2] + '</em></div><div><b>Пушка</b>+' + UPG_COST[2] + ' золота · всего <em>' + FIRE[3] + '</em></div></div>';
}
function showMenu(first){
  UI.menuOpen = true;
  var online = netAvailable(), st = online && !ON.active ? onlineStored() : null;
  if (!online && SETTINGS.mode === 'online') SETTINGS.mode = 'bot';
  var s = openSheet(
    '<div><span class="kick">Мятная долина · игра на двоих</span><h1>Пять <em>замков</em></h1></div>' +
    (st ? '<div class="resume"><span>Незаконченная онлайн-партия в комнате <b>' + fmtCode(st.code) + '</b></span><button class="go" id="mResume">Вернуться</button></div>' : '') +
    '<p>Долина и Порча делят пять замков. Ход тайный: оба отдают приказ одновременно, а потом смотрят, кто кого перехитрил.</p>' + rulesHtml() +
    '<div class="opt"><span class="lab">Соперник</span><div class="seg" id="segMode"><button data-v="bot">Против бота<small>вы за Долину, бот за Порчу</small></button><button data-v="hot">Вдвоём<small>на одном экране, с передачей хода</small></button>' +
    (online ? '<button data-v="online">Онлайн с другом<small>по ссылке, на разных устройствах</small></button>' : '') + '</div></div>' +
    '<div class="opt" id="optDiff"><span class="lab">Бот</span><div class="seg inline" id="segDiff"><button data-v="easy">Новобранец</button><button data-v="hard">Полководец</button></div></div>' +
    '<div class="opt" id="optSide"><span class="lab">Ваша сторона</span><div class="seg inline" id="segSide"><button data-v="1">Долина (синие)</button><button data-v="2">Порча (фиолетовые)</button></div></div>' +
    '<div class="opt"><span class="lab">Раундов</span><div class="seg inline" id="segRounds"><button data-v="5">5</button><button data-v="7">7</button><button data-v="9">9</button></div></div>' +
    '<div class="btns">' + (G && !first && G.mode !== 'online' ? '<button class="sec" id="mBack">Вернуться к партии</button>' : '') + '<button class="sec" id="mCode">Войти по коду</button><button class="go" id="mStart" data-focus></button></div>', { wide: true, locked: !G || first });
  function sync(){
    s.querySelectorAll('#segMode button').forEach(function(b){ b.classList.toggle('on', b.dataset.v === SETTINGS.mode); });
    s.querySelectorAll('#segDiff button').forEach(function(b){ b.classList.toggle('on', b.dataset.v === SETTINGS.diff); });
    s.querySelectorAll('#segSide button').forEach(function(b){ b.classList.toggle('on', +b.dataset.v === SETTINGS.side); });
    s.querySelectorAll('#segRounds button').forEach(function(b){ b.classList.toggle('on', +b.dataset.v === SETTINGS.rounds); });
    var on = SETTINGS.mode === 'online';
    $('optDiff').style.display = SETTINGS.mode === 'bot' ? '' : 'none';
    $('optSide').style.display = on ? '' : 'none';
    $('mCode').style.display = on ? '' : 'none';
    $('mStart').innerHTML = svg('swords') + (on ? 'Создать комнату' : 'Начать партию');
  }
  s.querySelectorAll('#segMode button').forEach(function(b){ b.addEventListener('click', function(){ SETTINGS.mode = b.dataset.v; sync(); saveSettings(); }); });
  s.querySelectorAll('#segDiff button').forEach(function(b){ b.addEventListener('click', function(){ SETTINGS.diff = b.dataset.v; sync(); saveSettings(); }); });
  s.querySelectorAll('#segSide button').forEach(function(b){ b.addEventListener('click', function(){ SETTINGS.side = +b.dataset.v; sync(); saveSettings(); }); });
  s.querySelectorAll('#segRounds button').forEach(function(b){ b.addEventListener('click', function(){ SETTINGS.rounds = +b.dataset.v; sync(); saveSettings(); }); });
  sync();
  try { localStorage.setItem('five.castles.rules', '1'); } catch (e){}
  $('mStart').addEventListener('click', function(){
    UI.menuOpen = false;
    if (SETTINGS.mode === 'online'){ onlineHost(SETTINGS.rounds, SETTINGS.side); return; }
    closeSheet(); startMatch();
  });
  $('mCode').addEventListener('click', function(){ showCodeSheet(''); });
  if ($('mResume')) $('mResume').addEventListener('click', function(){ onlineJoin(st.code); });
  if ($('mBack')) $('mBack').addEventListener('click', function(){ UI.menuOpen = false; closeOverlay(); });
}
function showRules(){
  try { localStorage.setItem('five.castles.rules', '1'); } catch (e){}
  openSheet('<div><span class="kick">Правила</span><h3>Как играть в «Пять замков»</h3></div>' + rulesHtml() + '<p>Управление: тяните поле, чтобы повернуть камеру (на телефоне: сдвинуть), колесо или щипок — приблизить. Клавиши 1–5 выбирают замок, стрелки меняют отряд, Enter отправляет приказ.</p><div class="btns"><button class="go" id="rOk" data-focus>Понятно</button></div>', { wide: true });
  $('rOk').addEventListener('click', closeOverlay);
}
function showGameMenu(){
  if (G.mode === 'online' && ON.active){
    var sh = openSheet('<div><span class="kick">Онлайн · комната ' + fmtCode(ON.code) + '</span><h3>Раунд ' + G.round + ' из ' + G.rounds + '</h3></div><p>Вы за ' + (ON.side === 1 ? 'Долину' : 'Порчу') + '. Счёт: ' + playerName(1) + ' ' + G.pl[1].glory + ', ' + playerName(2) + ' ' + G.pl[2].glory + ' славы. ' + (oppOnline() ? 'Друг в сети.' : 'Друг сейчас не в сети.') + '</p>' +
      '<div class="share"><input id="roomLink" readonly value="' + esc(roomLink(ON.code)) + '" aria-label="Ссылка на комнату"><button class="sec" id="gmCopy">Копировать ссылку</button></div>' +
      '<div class="btns"><button class="sec" id="gmRules">Правила</button><button class="sec" id="gmLeave">Выйти из комнаты</button><button class="go" id="gmBack" data-focus>Продолжить</button></div>');
    $('gmBack').addEventListener('click', closeOverlay);
    $('gmRules').addEventListener('click', showRules);
    $('gmCopy').addEventListener('click', function(){ copyText(roomLink(ON.code), $('roomLink'), $('gmCopy')); });
    $('gmLeave').addEventListener('click', function(){
      var b = $('gmLeave');
      if (b.dataset.sure){ onlineQuit(); toMenu(); return; }
      b.dataset.sure = '1'; b.textContent = 'Точно выйти? Партия закончится у обоих';
    });
    return;
  }
  openSheet('<div><span class="kick">Пауза</span><h3>Раунд ' + G.round + ' из ' + G.rounds + '</h3></div><p>Счёт: ' + playerName(1) + ' ' + G.pl[1].glory + ', ' + playerName(2) + ' ' + G.pl[2].glory + ' славы.</p><div class="btns"><button class="sec" id="gmRules">Правила</button><button class="sec" id="gmNew">Новая партия</button><button class="go" id="gmBack" data-focus>Продолжить</button></div>');
  $('gmBack').addEventListener('click', closeOverlay);
  $('gmRules').addEventListener('click', showRules);
  $('gmNew').addEventListener('click', function(){ showMenu(false); });
}
/* ---------- the round flow ---------- */
function resetBoard(){
  if (BAT && !BAT.done){ BAT.ev = []; BAT.done = true; }
  FX.proj.forEach(function(P){ FXROOT.remove(P.m); }); FX.proj = [];
  uiClearFights();
  LBL.floats.forEach(function(f){ f.el.remove(); }); LBL.floats = [];
  UI.plan = null; document.body.classList.remove('planning');
  $('plan').hidden = true; $('battleBar').hidden = true; VIEW.offT = 0;
  $('hud').hidden = false; $('tools').hidden = false;
  [1, 2].forEach(function(p){ ARMY[p].forEach(soldierHide); });
}
function startMatch(){
  if (ON.active) onlineQuit();
  resetBoard();
  newMatch(SETTINGS);
  syncCastles(true); refreshCastleLabels();
  renderHud(true);
  startRound();
}
// back to the title: the board stays, the game panels go
function toMenu(){
  resetBoard();
  G = null;
  $('hud').hidden = true; $('tools').hidden = true; hideWait(); hideCover();
  CVIS.forEach(function(V){ setCastleOwner(V, 0, true); setCastleLevel(V, 0, true); });
  CASTLES.forEach(function(c, i){ setZone(i, 0, true); });
  refreshCastleLabels(); refreshPlanLabels();
  campReset(1, true); campReset(2, true);
  setCam('battle');
  showMenu(true);
}
function hideCover(){ $('cover').hidden = true; }
function restoreMatch(g){
  G = g; UI.plan = null;
  uiClearFights(); syncCastles(true); refreshCastleLabels();
  $('hud').hidden = false; $('tools').hidden = false; renderHud(true);
  if (G.phase === 'end') { showEnd(); return; }
  if (G.phase === 'battle' || G.phase === 'summary'){ if (matchOver()){ showEnd(); return; } G.round++; }
  startRound();
}
function startRound(){
  G.plans = { 1: null, 2: null }; G.phase = 'plan';
  uiClearFights();
  campReset(1); campReset(2);
  renderHud(false);
  if (G.mode === 'online'){
    var nr = G.results.length + 1;
    if (ON.me.c[nr]){ G.phase = 'wait'; if (ON.pend) arrangeSquads(ON.side, ON.pend.a); showWait(); onlineSync(); }
    else beginPlan(ON.side);
    return;
  }
  if (G.mode === 'bot'){ G.plans[2] = botPlan(2, G.diff); beginPlan(1); }
  else showCover(1, function(){ beginPlan(1); });
}
function showCover(p, cb){
  var c = $('cover');
  $('coverCrest').style.background = p === 1 ? 'linear-gradient(180deg, #6C9CEC, #3A78DA)' : 'linear-gradient(180deg, #C27BE0, #9A40B4)';
  $('coverTitle').textContent = 'Ход: ' + playerName(p);
  $('coverText').textContent = (G.round === 1 && p === 1 ? 'Раунд 1. ' : 'Раунд ' + G.round + '. ') + 'Передайте устройство игроку за ' + (p === 1 ? 'Долину (синие)' : 'Порчу (фиолетовые)') + '. Сопернику лучше отвернуться: приказ тайный.';
  $('coverGo').textContent = 'Я за ' + (p === 1 ? 'Долину' : 'Порчу') + ', показать';
  c.hidden = false;
  $('coverGo').onclick = function(){ c.hidden = true; cb(); };
  setTimeout(function(){ try { $('coverGo').focus(); } catch (e){} }, 30);
}
function beginPlan(p){
  UI.plan = { p: p, plan: emptyPlan() };
  // the Blight looks from the north, so the cards run east to west for them
  UI.rev = G.mode !== 'bot' && p === 2;
  document.querySelectorAll('.card').forEach(function(c){ c.style.order = UI.rev ? 4 - +c.dataset.i : ''; });
  document.body.classList.add('planning');
  $('planKick').textContent = 'Тайный приказ · ' + playerName(p);
  $('planKick').className = 'kick ' + (p === 1 ? 'v1' : 'v2');
  $('planTitle').textContent = 'Раздели ' + TROOPS + ' воинов между замками';
  $('plan').hidden = false; $('battleBar').hidden = true;
  if (p === 2) campReset(1); else campReset(2);
  arrangeSquads(p, UI.plan.plan.alloc);
  renderCards(); selectCard(UI.sel || 0, false); renderHud(false);
  VIEW.offT = $('plan').getBoundingClientRect().height + 12; setCam(planPreset(p));
  UI.planT = Date.now(); UI.emptyT = 0;
}
function submitPlan(){
  var P = UI.plan; if (!P || UI.busy) return;
  // an order with nobody in it is nearly always a slip (Enter pressed twice): it goes only on a second press
  if (!P.plan.alloc.some(function(n){ return n > 0; }) && !(UI.emptyT && Date.now() - UI.emptyT < 5000)){
    UI.emptyT = Date.now();
    toast('В приказе нет ни одного воина. Нажмите «В бой» ещё раз, если так и задумано.', 'warn', 4200);
    return;
  }
  G.plans[P.p] = P.plan;
  UI.plan = null; document.body.classList.remove('planning');
  refreshPlanLabels();
  $('plan').hidden = true; VIEW.offT = 0;
  if (G.mode === 'hot' && P.p === 1){ campReset(1); showCover(2, function(){ beginPlan(2); }); return; }
  if (G.mode === 'online'){ onlineSeal(P.plan); return; }
  reveal();
}
function reveal(){
  G.phase = 'battle';
  renderHud(false);
  if (G.mode === 'hot'){ campReset(1); campReset(2); }
  var R = resolveRound();
  HUD_T = { g1: G.pl[1].glory - R.income[1], g2: G.pl[2].glory - R.income[2], c1: G.pl[1].gold - R.income[1], c2: G.pl[2].gold - R.income[2] };
  setCam(battlePreset()); hideWait();
  $('battleBar').hidden = false; $('battleText').innerHTML = '<b>Раунд ' + G.round + '.</b> Войска выступили'; TIMESCALE = 1; $('btnFast').classList.remove('on');
  startBattle(R);
}
function uiAfterBattle(R, skipped){
  G.phase = 'summary';
  $('battleBar').hidden = true; TIMESCALE = 1;
  CASTLES.forEach(function(cd, i){ var o = G.castles[i].owner; if (!o) return; var V = CVIS[i], p = castleTopWorld(V); setTimeout(function(){ uiFloat(new V3(p.x, p.y + 3.3, p.z), '+' + cd.value + svg('coin'), o, 'gold'); }, skipped ? 0 : i * 120); });
  renderHud(false); refreshCastleLabels();
  setTimeout(function(){ showSummary(R); }, skipped ? 350 : 1300);
}
function showSummary(R){
  if (!G) return;                                          // left for the menu while the battle was ending
  if (G.mode === 'online'){
    if (!ON.active || ON.broken) return;                   // the sheet saying why the match stopped stays up
    var fo = oppRec();
    if (fo && fo.left && G.results.length < G.rounds){ showFriendLeft(); return; }
  }
  var rows = R.battles.map(function(B){
    var cd = CASTLES[B.i], att = B.ownerBefore ? 3 - B.ownerBefore : 0;
    var res = resultText(B), col = TEAMCSS[B.winner];
    return '<tr><td>' + esc(cd.name) + ' <span style="color:var(--accent)">+' + cd.value + '</span></td><td class="n v1">' + B.a1 + '</td><td class="n v2">' + B.a2 + '</td><td class="t">' + (B.killed ? '−' + B.killed : '') + '</td><td><span class="rs"><i style="background:' + col + '"></i><span class="lg">' + esc(res) + '</span><span class="sm">' + esc(resultShort(B) || 'Без боя') + '</span></span></td></tr>';
  }).join('');
  var ups = R.upgrades.map(function(u){ return playerName(u.p) + ': ' + ADDON_NAMES[u.level - 1].toLowerCase() + ' в замке «' + CASTLES[u.i].name + '»'; });
  var last = matchOver();
  var s = openSheet('<div><span class="kick">Итоги раунда ' + R.round + ' из ' + G.rounds + '</span><h3>' + roundHeadline(R) + '</h3></div>' +
    '<div class="tblWrap"><table class="tbl"><thead><tr><th>Замок</th><th style="text-align:center">Долина</th><th style="text-align:center">Порча</th><th style="text-align:center" title="Сколько нападающих убили башни">Башни</th><th>Итог</th></tr></thead><tbody>' + rows + '</tbody></table></div>' +
    (ups.length ? '<p>Построено: ' + esc(ups.join('; ')) + '.</p>' : '') +
    '<div class="inc">' + [1, 2].map(function(p){ return '<div><span class="sw" style="background:' + TEAMCSS[p] + '"></span><span>' + playerName(p) + '<br>+' + R.income[p] + ' золота и славы</span><b style="margin-left:auto;display:inline-flex;gap:4px;align-items:center;color:var(--accent)">' + svg('crown') + G.pl[p].glory + '</b></div>'; }).join('') + '</div>' +
    '<div class="btns"><button class="go" id="sNext" data-focus>' + (last ? 'Итоги партии' : 'Раунд ' + (G.round + 1) + ' →') + '</button></div>', { wide: true, clear: true, locked: true });
  $('sNext').addEventListener('click', function(){
    closeSheet();
    if (G.mode === 'online' && ON.active){ ON.seen = Math.max(ON.seen, R.round); onlineSave(); }
    if (last) showEnd(); else { G.round++; startRound(); }
  });
}
function roundHeadline(R){
  var cap = R.battles.filter(function(B){ return B.captured; });
  if (!cap.length) return 'Ни один замок не сменил хозяина';
  var by = [0, 0, 0]; cap.forEach(function(B){ by[B.winner]++; });
  if (by[1] && by[2]) return 'Обмен ударами: Долина взяла ' + by[1] + ', Порча ' + by[2];
  var w = by[1] ? 1 : 2; return playerName(w) + ' ' + (by[w] > 1 ? 'захватила ' + by[w] + ' ' + plural(by[w], 'замок', 'замка', 'замков') : 'захватила замок «' + CASTLES[cap[0].i].name + '»');
}
function showEnd(){
  G.phase = 'end';
  var w = winnerOf(), a = G.pl[1], b = G.pl[2];
  var held = [0, 0, 0]; G.castles.forEach(function(c){ held[c.owner]++; });
  var title = w ? (G.mode === 'bot' ? (w === 1 ? 'Победа! Долина свободна' : 'Порча победила') : G.mode === 'online' ? (w === G.me ? 'Победа! ' + playerName(w) + ' ваша' : 'Поражение. ' + playerName(w) + ' сильнее') : playerName(w) + ' победила') : 'Ничья';
  openSheet('<div><span class="kick">Партия окончена · ' + G.rounds + ' раундов</span><h1>' + esc(title) + '</h1></div>' +
    '<div class="big"><div><b class="v1">' + a.glory + '</b><span>слава Долины</span></div><div><b class="v2">' + b.glory + '</b><span>слава Порчи</span></div></div>' +
    '<p>В конце у Долины ' + held[1] + ' ' + plural(held[1], 'замок', 'замка', 'замков') + ' и ' + a.gold + ' золота, у Порчи ' + held[2] + ' ' + plural(held[2], 'замок', 'замка', 'замков') + ' и ' + b.gold + ' золота.' + (!w ? ' Слава и золото поровну.' : (a.glory === b.glory ? ' Слава поровну, победу решило золото.' : '')) + '</p>' +
    (G.mode === 'online' && ON.active ? '<p class="netline" id="eStatus"></p><div class="btns"><button class="sec" id="eLeave">Выйти</button><button class="go" id="eRematch" data-focus></button></div>' :
    '<div class="btns"><button class="sec" id="eMenu">Настройки</button><button class="go" id="eAgain" data-focus>' + svg('swords') + 'Ещё партию</button></div>'), { wide: true, locked: true });
  if ($('eRematch')){
    $('eRematch').addEventListener('click', onlineWantRematch);
    $('eLeave').addEventListener('click', function(){ onlineQuit(); toMenu(); });
    renderEndOnline(); onlineSync();
    return;
  }
  $('eAgain').addEventListener('click', function(){ closeSheet(); startMatch(); });
  $('eMenu').addEventListener('click', function(){ showMenu(true); });
}
function initUI(){
  buildLabels(); buildCards();
  if (window.ResizeObserver){
    var ro = new ResizeObserver(function(){ if (!UI.plan || $('plan').hidden) return; var hgt = $('plan').getBoundingClientRect().height + 12; if (Math.abs(hgt - VIEW.offT) > 4){ VIEW.offT = hgt; setCam(CAMC.preset); } });
    ro.observe($('plan'));
  }
  $('qEven').addEventListener('click', evenSplit);
  $('qClear').addEventListener('click', function(){ if (UI.plan){ UI.plan.plan.upg = [false, false, false, false, false]; setAlloc([0, 0, 0, 0, 0]); } });
  $('qRepeat').addEventListener('click', function(){ var P = UI.plan; if (P && G.last[P.p]) setAlloc(G.last[P.p].alloc); });
  $('btnGo').addEventListener('click', submitPlan);
  $('btnSkip').addEventListener('click', skipBattle);
  $('btnFast').addEventListener('click', function(){ TIMESCALE = TIMESCALE > 1 ? 1 : 2.2; $('btnFast').classList.toggle('on', TIMESCALE > 1); $('btnFast').textContent = TIMESCALE > 1 ? '×1' : '×2'; });
  $('btnRules').addEventListener('click', showRules);
  $('btnCam').addEventListener('click', function(){ setCam(UI.plan ? planPreset(UI.plan.p) : G && G.phase === 'wait' ? planPreset(ON.side) : battlePreset()); });
  $('btnMenu').addEventListener('click', function(){ if (G) showGameMenu(); else showMenu(true); });
  window.addEventListener('keydown', function(e){
    if (!$('cover').hidden){ if (e.key === 'Enter'){ e.preventDefault(); $('coverGo').click(); } return; }
    if (!$('modal').hidden){ if (e.key === 'Escape' && G && !$('sheet').dataset.locked) closeOverlay(); return; }
    var k = e.key;
    if (k === 'c' || k === 'C' || k === 'с' || k === 'С'){ $('btnCam').click(); return; }
    if (BAT && !BAT.done && (k === ' ' || k === 'Escape')){ e.preventDefault(); skipBattle(); return; }
    if (!UI.plan) return;
    if (k >= '1' && k <= '5'){ selectCard(UI.rev ? 5 - +k : +k - 1, true); return; }
    if (k === 'ArrowUp' || k === '+' || k === '='){ e.preventDefault(); changeAlloc(UI.sel, e.shiftKey ? 5 : 1); return; }
    if (k === 'ArrowDown' || k === '-' || k === '_'){ e.preventDefault(); changeAlloc(UI.sel, e.shiftKey ? -5 : -1); return; }
    if (k === 'ArrowRight'){ e.preventDefault(); selectCard((UI.sel + (UI.rev ? 4 : 1)) % 5, true); return; }
    if (k === 'ArrowLeft'){ e.preventDefault(); selectCard((UI.sel + (UI.rev ? 1 : 4)) % 5, true); return; }
    if (k === 'u' || k === 'U' || k === 'г' || k === 'Г'){ toggleUpg(UI.sel); return; }
    // Enter that closed the summary (or the cover) and is still held, or pressed again at once, must not send an empty order
    if (k === 'Enter' && e.target === document.body){ e.preventDefault(); if (e.repeat || Date.now() - (UI.planT || 0) < 700) return; submitPlan(); }
  });
  window.addEventListener('resize', function(){ resizeRender(); if (UI.plan) VIEW.offT = $('plan').getBoundingClientRect().height + 12; setCam(CAMC.preset); });
}
/* ===================== 13 · boot and the loop ===================== */
var WORLD = { root: null, t: 0, buildMs: 0 };
function buildWorld(){
  var t0 = performance.now();
  STYLE = STYLES[0]; PAL = STYLE.pal; SHAPE = Object.assign({ round: 1, segK: 1, facet: true, flatAll: false }, STYLE.shape);
  applyLighting(STYLE);
  makeMaterials(STYLE);
  initTerrColors();
  applyPost(STYLE);
  buildRoads(); buildRoadField();
  buildHeights();
  var root = new THREE.Group(); WORLD.root = root; scene.add(root);
  initFX(root);
  TER.occ = []; BLOCK = []; CAMP_FIRES = [];
  CASTLES.forEach(function(c){ BLOCK.push([c.x, c.z, c.padR + 0.4]); });
  // the castles claim their ground first
  CVIS = CASTLES.map(function(c){ return buildCastleVis(c, root); });
  reseed(777); var PL = planLayout();
  reseed(4242);
  var KS = new Kit();
  PL.trees.forEach(function(t, i){ plantTree(KS, treeTypeAt(t, i), t.x, t.z, t.s, { lod: t.zone === 'outer' && hyp(t.x, t.z) > 48 }); });
  PL.bushes.forEach(function(b){ bush(KS, b.x, b.z, b.s * 0.9, { berries: chance(0.2) ? 'berry' : null }); });
  PL.rocks.forEach(function(r){ if ((r.n || 1) > 1) rockCluster(KS, r.x, r.z, r.s, r.n); else rockMint(KS, r.x, r.z, r.s); });
  buildCamp(KS, 1); buildCamp(KS, 2);
  buildExtras(KS, PL);
  binOcc();
  root.add(buildTerrain());
  root.add(buildWater());
  root.add(KS.build({ post: function(geo){ groundAO(geo); } }));
  root.add(buildTufts(PL));
  root.add(buildPebbles());
  CAMP_FIRES.forEach(function(f){ addFire(root, f[0], f[1], f[2], f[3], { magic: f[4] }); });
  buildArmies(root);
  initZones();
  root.traverse(function(o){ if (o.isMesh && o.material && o.material.userData && o.material.userData.key === 'glow') o.castShadow = false; });
  WORLD.buildMs = Math.round(performance.now() - t0);
}
var last = performance.now();
function frame(dt){
  var sdt = dt * (BAT && !BAT.done ? TIMESCALE : 1);
  WORLD.t += sdt; U.time.value += dt;
  updateBattle(sdt);
  updateSoldiers(sdt, WORLD.t);
  updateCastles(WORLD.t, sdt);
  updateZones(sdt);
  updateFX(WORLD.t, sdt);
  updateCam(dt);
  tickHud(dt);
  renderFrame();
  updateLabels();
}
function loop(now){
  requestAnimationFrame(loop);
  var dt = Math.min(0.05, Math.max(0, (now - last) / 1000)); last = now;
  frame(dt);
}
function fail(msg){
  var l = document.getElementById('loading'); if (l) l.hidden = true;
  var d = document.createElement('div'); d.id = 'err'; d.className = 'panel';
  d.innerHTML = '<b style="color:var(--text);font-family:var(--font-display);font-size:17px">Не удалось запустить долину</b><br>' + esc(msg) + '<br>Игре нужен браузер с WebGL. Попробуйте обновить страницу или открыть её в другом браузере.';
  document.body.appendChild(d);
}
function boot(){
  if (typeof THREE === 'undefined' || !THREE.EffectComposer){ fail('Не загрузилась библиотека 3D-графики.'); return; }
  try {
    initRenderer();
    buildWorld();
  } catch (e){ console.error(e); fail(e && e.message ? e.message : String(e)); return; }
  initControls(); initUI();
  resizeRender();
  setCam('battle', true);
  campReset(1, true); campReset(2, true);
  refreshCastleLabels();
  document.getElementById('loading').hidden = true;
  if (DEV) initDev();
  // keep a match going across page updates
  var HOT = window.claude && window.claude.hot;
  if (HOT && HOT.snapshot) HOT.snapshot(function(){ return { settings: SETTINGS, G: G ? JSON.parse(JSON.stringify(G)) : null }; });
  function startFrom(data){
    data = data || {};
    if (data.settings) Object.assign(SETTINGS, data.settings);
    // a friend's link: straight into the room
    var rc = netAvailable() ? urlRoom() : '';
    if (rc){ if (codeProblem(rc)) showCodeSheet(rc, codeProblem(rc)); else onlineJoin(rc); return; }
    if (data.G && data.G.castles && data.G.pl && data.G.mode !== 'online'){ restoreMatch(data.G); return; }
    if (!(DEV && /nomenu/.test(location.search))) showMenu(true);
  }
  if (HOT && HOT.ready) HOT.ready(startFrom); else startFrom(HOT && HOT.data || {});
  if (!(DEV && /noloop/.test(location.search))) requestAnimationFrame(loop);
}
function initDev(){
  window.__dev = {
    G: function(){ return G; }, BAT: function(){ return BAT; }, UI: function(){ return UI; },
    start: function(mode, diff, rounds){ SETTINGS.mode = mode || 'bot'; SETTINGS.diff = diff || 'hard'; SETTINGS.rounds = rounds || 7; closeSheet(); startMatch(); return true; },
    alloc: function(a){ setAlloc(a); return UI.plan && UI.plan.plan.alloc; },
    upg: function(i){ toggleUpg(i); return UI.plan && UI.plan.plan.upg; },
    go: function(){ submitPlan(); return true; },
    run: function(sec, step){ step = step || 1 / 30; var n = Math.round(sec / step); for (var i = 0; i < n; i++){ var sdt = step * (BAT && !BAT.done ? TIMESCALE : 1); WORLD.t += sdt; U.time.value += step; updateBattle(sdt); updateSoldiers(sdt, WORLD.t); updateCastles(WORLD.t, sdt); updateZones(sdt); updateFX(WORLD.t, sdt); updateCam(step); tickHud(step); } renderFrame(); updateLabels(); return WORLD.t; },
    shot: function(){ renderFrame(); updateLabels(); return true; },
    cam: function(name, yaw, pitch, dist, tx, tz){ setCam(name || 'battle', true); if (yaw !== undefined) CAMC.yaw = CAMC.yawT = yaw; if (pitch !== undefined) CAMC.pitch = CAMC.pitchT = pitch; if (dist !== undefined) CAMC.dist = CAMC.distT = dist; if (tx !== undefined){ CAMC.tgt.x = CAMC.tgtT.x = tx; } if (tz !== undefined){ CAMC.tgt.z = CAMC.tgtT.z = tz; } VIEW.off = VIEW.offT; updateCam(0.016); renderFrame(); updateLabels(); return true; },
    own: function(i, owner, level){ G.castles[i].owner = owner; G.castles[i].level = level || 0; syncCastles(true); refreshCastleLabels(); return true; },
    stats: function(){ var t0 = performance.now(); renderer.info.autoReset = true; renderFrame(); return { calls: renderer.info.render.calls, tris: renderer.info.render.triangles, geo: renderer.info.memory.geometries, prog: renderer.info.programs.length, ms: Math.round(performance.now() - t0), build: WORLD.buildMs }; },
    skip: function(){ skipBattle(); return true; },
    host: function(rounds, side){ onlineHost(rounds || 5, side || 1); return ON.code; },
    join: function(code){ onlineJoin(code); return true; },
    on: function(){ var o = ON.active ? oppRec() : null; return { active: ON.active, phase: ON.phase, code: ON.code, side: ON.side, ready: netReady(), me: ON.me, opp: o, oppOnline: ON.active ? oppOnline() : false, g: G ? { mode: G.mode, phase: G.phase, round: G.round, results: G.results.length } : null, sheet: $('modal').hidden ? '' : $('sheet').textContent.slice(0, 160), wait: $('waitBar').hidden ? '' : $('waitText').textContent }; },
    state: function(){ return G ? JSON.stringify({ c: G.castles, p: G.pl, n: G.results.length, r: G.results.map(function(R){ return R.battles.map(function(B){ return [B.a1, B.a2, B.winner]; }); }) }) : ''; },
    click: function(id){ var b = document.getElementById(id); if (!b) return false; b.click(); return true; },
    eval: function(code){ return eval(code); }
  };
}
setTimeout(boot, 20);
})();
