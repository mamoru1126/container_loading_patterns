// 小さな WebGL2 レンダラ（影付きの直方体・円柱・曲面ボックスを描く）
// 外部ライブラリなしで動き、同じコードをローカルの検証でも使えるようにしている。

// ---------- 行列（列優先） ----------
export const M4 = {
  ident() {
    const m = new Float32Array(16);
    m[0] = m[5] = m[10] = m[15] = 1;
    return m;
  },
  mul(a, b) {
    const o = new Float32Array(16);
    for (let c = 0; c < 4; c++) {
      for (let r = 0; r < 4; r++) {
        let s = 0;
        for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k];
        o[c * 4 + r] = s;
      }
    }
    return o;
  },
  perspective(fovy, aspect, near, far) {
    const f = 1 / Math.tan(fovy / 2);
    const m = new Float32Array(16);
    m[0] = f / aspect;
    m[5] = f;
    m[10] = (far + near) / (near - far);
    m[11] = -1;
    m[14] = (2 * far * near) / (near - far);
    return m;
  },
  ortho(l, r, b, t, n, f) {
    const m = new Float32Array(16);
    m[0] = 2 / (r - l);
    m[5] = 2 / (t - b);
    m[10] = -2 / (f - n);
    m[12] = -(r + l) / (r - l);
    m[13] = -(t + b) / (t - b);
    m[14] = -(f + n) / (f - n);
    m[15] = 1;
    return m;
  },
  lookAt(eye, c, up) {
    let zx = eye[0] - c[0];
    let zy = eye[1] - c[1];
    let zz = eye[2] - c[2];
    let l = Math.hypot(zx, zy, zz);
    zx /= l; zy /= l; zz /= l;
    let xx = up[1] * zz - up[2] * zy;
    let xy = up[2] * zx - up[0] * zz;
    let xz = up[0] * zy - up[1] * zx;
    l = Math.hypot(xx, xy, xz) || 1;
    xx /= l; xy /= l; xz /= l;
    const yx = zy * xz - zz * xy;
    const yy = zz * xx - zx * xz;
    const yz = zx * xy - zy * xx;
    const m = new Float32Array(16);
    m[0] = xx; m[1] = yx; m[2] = zx;
    m[4] = xy; m[5] = yy; m[6] = zy;
    m[8] = xz; m[9] = yz; m[10] = zz;
    m[12] = -(xx * eye[0] + xy * eye[1] + xz * eye[2]);
    m[13] = -(yx * eye[0] + yy * eye[1] + yz * eye[2]);
    m[14] = -(zx * eye[0] + zy * eye[1] + zz * eye[2]);
    m[15] = 1;
    return m;
  },
  // 平行移動と Y 軸まわりの回転（90度単位）
  place(tx, ty, tz, rotY = 0) {
    const m = M4.ident();
    const c = Math.cos(rotY);
    const s = Math.sin(rotY);
    m[0] = c; m[2] = -s;
    m[8] = s; m[10] = c;
    m[12] = tx; m[13] = ty; m[14] = tz;
    return m;
  },
  apply(m, v) {
    const x = v[0];
    const y = v[1];
    const z = v[2];
    const w = m[3] * x + m[7] * y + m[11] * z + m[15];
    return [
      (m[0] * x + m[4] * y + m[8] * z + m[12]) / w,
      (m[1] * x + m[5] * y + m[9] * z + m[13]) / w,
      (m[2] * x + m[6] * y + m[10] * z + m[14]) / w,
    ];
  },
};

// sRGB の色を線形に変換
export function lin(hex, k = 1) {
  const h = hex.replace('#', '');
  const v = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
  return v.map((c) => Math.pow(c, 2.2) * k);
}

// ---------- 形状 ----------
// マテリアル番号: 0 塗装 / 1 床板 / 2 波板 / 3 ガラス・画面 / 4 樹脂・ゴム / 5 金属 / 6 縞（固定材の区画）
export class Geo {
  constructor() {
    this.pos = [];
    this.nor = [];
    this.col = [];
    this.mat = [];
    this.idx = [];
  }

  get vcount() {
    return this.pos.length / 3;
  }

  v(p, n, c, m) {
    this.pos.push(p[0], p[1], p[2]);
    this.nor.push(n[0], n[1], n[2]);
    this.col.push(c[0], c[1], c[2]);
    this.mat.push(m);
    return this.vcount - 1;
  }

  quad(a, b, c, d, n, col, mat) {
    const i = this.v(a, n, col, mat);
    this.v(b, n, col, mat);
    this.v(c, n, col, mat);
    this.v(d, n, col, mat);
    this.idx.push(i, i + 1, i + 2, i, i + 2, i + 3);
  }

  box(x0, y0, z0, x1, y1, z1, col, mat = 0) {
    this.quad([x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1], [1, 0, 0], col, mat);
    this.quad([x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [x0, y0, z0], [-1, 0, 0], col, mat);
    this.quad([x0, y1, z0], [x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [0, 1, 0], col, mat);
    this.quad([x0, y0, z1], [x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [0, -1, 0], col, mat);
    this.quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, 1], col, mat);
    this.quad([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [0, 0, -1], col, mat);
  }

  // 角を丸めた箱（家電の外装）
  rbox(x0, y0, z0, x1, y1, z1, r, col, mat = 0, seg = 3) {
    r = Math.max(0.0005, Math.min(r, (x1 - x0) / 2.01, (y1 - y0) / 2.01, (z1 - z0) / 2.01));
    const ticks = (a, b) => {
      const t = [];
      for (let k = 0; k <= seg; k++) t.push(a + r * (1 - Math.cos((k / seg) * (Math.PI / 2))));
      for (let k = seg; k >= 0; k--) t.push(b - r * (1 - Math.cos((k / seg) * (Math.PI / 2))));
      return t;
    };
    const ix0 = x0 + r;
    const iy0 = y0 + r;
    const iz0 = z0 + r;
    const ix1 = x1 - r;
    const iy1 = y1 - r;
    const iz1 = z1 - r;
    const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
    const faces = [
      // [固定軸, 固定値, u軸, v軸, 法線符号]
      [0, x1, 1, 2, 1], [0, x0, 2, 1, -1],
      [1, y1, 2, 0, 1], [1, y0, 0, 2, -1],
      [2, z1, 0, 1, 1], [2, z0, 1, 0, -1],
    ];
    const lo = [x0, y0, z0];
    const hi = [x1, y1, z1];
    for (const [ax, val, ua, va, sgn] of faces) {
      const us = ticks(lo[ua], hi[ua]);
      const vs = ticks(lo[va], hi[va]);
      const base = this.vcount;
      for (const u of us) {
        for (const vv of vs) {
          const p = [0, 0, 0];
          p[ax] = val;
          p[ua] = u;
          p[va] = vv;
          const q = [clamp(p[0], ix0, ix1), clamp(p[1], iy0, iy1), clamp(p[2], iz0, iz1)];
          let d = [p[0] - q[0], p[1] - q[1], p[2] - q[2]];
          let l = Math.hypot(d[0], d[1], d[2]);
          if (l < 1e-9) {
            d = [0, 0, 0];
            d[ax] = sgn;
            l = 1;
          }
          const n = [d[0] / l, d[1] / l, d[2] / l];
          this.v([q[0] + n[0] * r, q[1] + n[1] * r, q[2] + n[2] * r], n, col, mat);
        }
      }
      const nv = vs.length;
      for (let i = 0; i < us.length - 1; i++) {
        for (let j = 0; j < nv - 1; j++) {
          const a = base + i * nv + j;
          this.idx.push(a, a + nv, a + nv + 1, a, a + nv + 1, a + 1);
        }
      }
    }
  }

  // 円柱（axis: 0=x, 1=y, 2=z）。中心 c、半径 r、長さ len（c から +axis 方向へ）
  cyl(c, r, len, axis, col, mat = 0, segs = 24, caps = true) {
    const ua = (axis + 1) % 3;
    const va = (axis + 2) % 3;
    const ring = (t) => {
      const out = [];
      for (let k = 0; k <= segs; k++) {
        const a = (k / segs) * Math.PI * 2;
        const p = [...c];
        p[ua] += Math.cos(a) * r;
        p[va] += Math.sin(a) * r;
        p[axis] += t;
        const n = [0, 0, 0];
        n[ua] = Math.cos(a);
        n[va] = Math.sin(a);
        out.push([p, n]);
      }
      return out;
    };
    const r0 = ring(0);
    const r1 = ring(len);
    const base = this.vcount;
    for (let k = 0; k <= segs; k++) {
      this.v(r0[k][0], r0[k][1], col, mat);
      this.v(r1[k][0], r1[k][1], col, mat);
    }
    for (let k = 0; k < segs; k++) {
      const a = base + k * 2;
      this.idx.push(a, a + 1, a + 3, a, a + 3, a + 2);
    }
    if (caps) {
      for (const [t, sgn] of [[0, -1], [len, 1]]) {
        const n = [0, 0, 0];
        n[axis] = sgn;
        const cc = [...c];
        cc[axis] += t;
        const ci = this.v(cc, n, col, mat);
        const rr = t === 0 ? r0 : r1;
        for (let k = 0; k <= segs; k++) this.v(rr[k][0], n, col, mat);
        for (let k = 0; k < segs; k++) this.idx.push(ci, ci + 1 + k, ci + 2 + k);
      }
    }
  }

  // 平らな輪（axis 方向を向く）
  ring(c, rIn, rOut, axis, sgn, col, mat = 0, segs = 32) {
    const ua = (axis + 1) % 3;
    const va = (axis + 2) % 3;
    const n = [0, 0, 0];
    n[axis] = sgn;
    const base = this.vcount;
    for (let k = 0; k <= segs; k++) {
      const a = (k / segs) * Math.PI * 2;
      for (const rr of [rIn, rOut]) {
        const p = [...c];
        p[ua] += Math.cos(a) * rr;
        p[va] += Math.sin(a) * rr;
        this.v(p, n, col, mat);
      }
    }
    for (let k = 0; k < segs; k++) {
      const a = base + k * 2;
      this.idx.push(a, a + 1, a + 3, a, a + 3, a + 2);
    }
  }

  // 8頂点の六面体（ブラウン管の後部など）
  hexa(pts, col, mat = 0) {
    // pts: 0-3 前面（左下, 右下, 右上, 左上）, 4-7 背面（同じ順）
    const cen = pts.reduce((s, p) => [s[0] + p[0] / 8, s[1] + p[1] / 8, s[2] + p[2] / 8], [0, 0, 0]);
    const faces = [[0, 1, 2, 3], [5, 4, 7, 6], [4, 0, 3, 7], [1, 5, 6, 2], [3, 2, 6, 7], [4, 5, 1, 0]];
    for (const f of faces) {
      const [a, b, c, d] = f.map((i) => pts[i]);
      const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
      const v = [d[0] - a[0], d[1] - a[1], d[2] - a[2]];
      let n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
      const l = Math.hypot(...n) || 1;
      n = n.map((x) => x / l);
      const fc = [(a[0] + c[0]) / 2 - cen[0], (a[1] + c[1]) / 2 - cen[1], (a[2] + c[2]) / 2 - cen[2]];
      if (n[0] * fc[0] + n[1] * fc[1] + n[2] * fc[2] < 0) n = n.map((x) => -x);
      this.quad(a, b, c, d, n, col, mat);
    }
  }
}

// ---------- シェーダ ----------
const VS = `#version 300 es
layout(location=0) in vec3 aPos;
layout(location=1) in vec3 aNor;
layout(location=2) in vec3 aCol;
layout(location=3) in float aMat;
uniform mat4 uModel, uVP, uLightVP;
out vec3 vW; out vec3 vN; out vec3 vC; out float vM; out vec4 vL;
void main(){
  vec4 w = uModel * vec4(aPos, 1.0);
  vW = w.xyz; vN = mat3(uModel) * aNor; vC = aCol; vM = aMat; vL = uLightVP * w;
  gl_Position = uVP * w;
}`;

const FS = `#version 300 es
precision highp float;
precision highp sampler2DShadow;
in vec3 vW; in vec3 vN; in vec3 vC; in float vM; in vec4 vL;
uniform sampler2DShadow uShadow;
uniform vec3 uLightDir, uLightCol, uSky, uGround, uCam, uTint;
uniform float uTintK, uExposure, uFloorScale;
out vec4 outColor;
float h1(float n){ return fract(sin(n) * 43758.5453); }
void main(){
  vec3 n = normalize(vN);
  vec3 base = vC;
  float specK = 0.16, shin = 28.0;
  int m = int(vM + 0.5);
  if (m == 1) {
    float pw = 0.155;
    float row = floor(vW.z / pw);
    float t = fract(vW.z / pw);
    float h = h1(row * 12.9898);
    float seg = floor((vW.x + h * 3.1) / 2.44);
    float h2 = h1(seg * 78.233 + row);
    base = mix(vec3(0.20, 0.11, 0.055), vec3(0.32, 0.19, 0.10), h * 0.7 + h2 * 0.3) * uFloorScale;
    float g = sin(vW.x * 38.0 + h * 17.0 + sin(vW.x * 2.3 + row) * 3.0) * 0.5 + 0.5;
    base *= 0.9 + 0.1 * g;
    if (t < 0.025 || t > 0.975) base *= 0.45;
    if (fract((vW.x + h * 3.1) / 2.44) < 0.0025) base *= 0.5;
    specK = 0.04;
  } else if (m == 2) {
    bool side = abs(n.z) > 0.5;
    float coord = side ? vW.x : vW.z;
    float s = sin(coord / 0.14 * 3.14159);
    vec3 tang = side ? vec3(1.0, 0.0, 0.0) : vec3(0.0, 0.0, 1.0);
    n = normalize(n + tang * s * 0.55);
    specK = 0.22; shin = 34.0;
  } else if (m == 3) {
    specK = 0.75; shin = 110.0;
  } else if (m == 4) {
    specK = 0.03; shin = 8.0;
  } else if (m == 5) {
    specK = 0.5; shin = 60.0;
  } else if (m == 6) {
    float st = fract((vW.x + vW.z) / 0.18);
    base = st < 0.5 ? vec3(0.62, 0.38, 0.05) : vec3(0.05, 0.05, 0.05);
    specK = 0.02;
  }
  vec3 L = normalize(uLightDir);
  float ndl = max(dot(n, L), 0.0);
  vec3 sp = vL.xyz / vL.w * 0.5 + 0.5;
  float sh = 0.0;
  vec2 tx = 1.0 / vec2(textureSize(uShadow, 0));
  for (int i = -1; i <= 1; i++) for (int j = -1; j <= 1; j++)
    sh += texture(uShadow, vec3(sp.xy + vec2(float(i), float(j)) * tx * 1.25, sp.z - 0.0012));
  sh /= 9.0;
  if (sp.x < 0.0 || sp.x > 1.0 || sp.y < 0.0 || sp.y > 1.0 || sp.z > 1.0) sh = 1.0;
  float hemi = n.y * 0.5 + 0.5;
  vec3 amb = mix(uGround, uSky, hemi);
  vec3 V = normalize(uCam - vW);
  vec3 H = normalize(L + V);
  float spec = pow(max(dot(n, H), 0.0), shin) * specK * (0.35 + 0.65 * sh);
  vec3 c = base * (amb + uLightCol * ndl * sh);
  c += base * 0.18 * max(dot(n, normalize(vec3(-0.6, 0.35, -0.5))), 0.0);
  c += vec3(spec);
  c = mix(c, uTint, uTintK);
  c = vec3(1.0) - exp(-c * uExposure);
  outColor = vec4(pow(c, vec3(1.0 / 2.2)), 1.0);
}`;

const VS_DEPTH = `#version 300 es
layout(location=0) in vec3 aPos;
uniform mat4 uModel, uLightVP;
void main(){ gl_Position = uLightVP * uModel * vec4(aPos, 1.0); }`;

const FS_DEPTH = `#version 300 es
precision mediump float;
out vec4 o;
void main(){ o = vec4(1.0); }`;

const VS_LINE = `#version 300 es
layout(location=0) in vec3 aPos;
uniform mat4 uModel, uVP;
void main(){ gl_Position = uVP * uModel * vec4(aPos, 1.0); }`;

const FS_LINE = `#version 300 es
precision mediump float;
uniform vec3 uColor;
out vec4 o;
void main(){ o = vec4(uColor, 1.0); }`;

function compile(gl, vs, fs) {
  const mk = (type, src) => {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  };
  const p = gl.createProgram();
  gl.attachShader(p, mk(gl.VERTEX_SHADER, vs));
  gl.attachShader(p, mk(gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
  const u = {};
  const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < n; i++) {
    const info = gl.getActiveUniform(p, i);
    u[info.name] = gl.getUniformLocation(p, info.name);
  }
  return { p, u };
}

export class Renderer {
  constructor(canvas) {
    const gl = canvas.getContext('webgl2', { antialias: true, preserveDrawingBuffer: true });
    if (!gl) throw new Error('WebGL2 が使えないブラウザです');
    this.gl = gl;
    this.canvas = canvas;
    this.main = compile(gl, VS, FS);
    this.depth = compile(gl, VS_DEPTH, FS_DEPTH);
    this.line = compile(gl, VS_LINE, FS_LINE);
    this.shadowSize = 2048;
    this.shadowTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.shadowTex);
    gl.texStorage2D(gl.TEXTURE_2D, 1, gl.DEPTH_COMPONENT24, this.shadowSize, this.shadowSize);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_MODE, gl.COMPARE_REF_TO_TEXTURE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_FUNC, gl.LEQUAL);
    this.shadowFbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.shadowFbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, this.shadowTex, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  mesh(geo) {
    const gl = this.gl;
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    const bufs = [];
    const attr = (loc, data, size) => {
      const b = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, b);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(data), gl.STATIC_DRAW);
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 0, 0);
      bufs.push(b);
    };
    attr(0, geo.pos, 3);
    attr(1, geo.nor, 3);
    attr(2, geo.col, 3);
    attr(3, geo.mat, 1);
    const ib = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint32Array(geo.idx), gl.STATIC_DRAW);
    bufs.push(ib);
    gl.bindVertexArray(null);
    return { vao, count: geo.idx.length, bufs, lines: false };
  }

  lineMesh(points) {
    const gl = this.gl;
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    const b = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, b);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(points), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);
    return { vao, count: points.length / 3, bufs: [b], lines: true };
  }

  free(mesh) {
    if (!mesh) return;
    const gl = this.gl;
    gl.deleteVertexArray(mesh.vao);
    for (const b of mesh.bufs) gl.deleteBuffer(b);
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(1, Math.round(this.canvas.clientWidth * dpr));
    const h = Math.max(1, Math.round(this.canvas.clientHeight * dpr));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    return [w, h];
  }

  // scene: { objects: [{mesh, model, visible, tint, tintK}], lines: [{mesh, model, color}], env }
  render(scene, cam) {
    const gl = this.gl;
    const [w, h] = this.resize();
    const env = scene.env;

    // 影の視点
    const c = env.center;
    const R = env.radius;
    const ld = env.lightDir;
    const leye = [c[0] + ld[0] * R * 2, c[1] + ld[1] * R * 2, c[2] + ld[2] * R * 2];
    const lview = M4.lookAt(leye, c, [0, 1, 0]);
    const lproj = M4.ortho(-R, R, -R, R, R * 0.2, R * 4);
    const lightVP = M4.mul(lproj, lview);

    gl.enable(gl.DEPTH_TEST);
    gl.disable(gl.CULL_FACE);

    gl.bindFramebuffer(gl.FRAMEBUFFER, this.shadowFbo);
    gl.viewport(0, 0, this.shadowSize, this.shadowSize);
    gl.clear(gl.DEPTH_BUFFER_BIT);
    gl.useProgram(this.depth.p);
    gl.uniformMatrix4fv(this.depth.u.uLightVP, false, lightVP);
    gl.enable(gl.POLYGON_OFFSET_FILL);
    gl.polygonOffset(2, 4);
    for (const o of scene.objects) {
      if (!o.visible || o.noShadow) continue;
      gl.uniformMatrix4fv(this.depth.u.uModel, false, o.model);
      gl.bindVertexArray(o.mesh.vao);
      gl.drawElements(gl.TRIANGLES, o.mesh.count, gl.UNSIGNED_INT, 0);
    }
    gl.disable(gl.POLYGON_OFFSET_FILL);

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, w, h);
    gl.clearColor(env.bg[0], env.bg[1], env.bg[2], 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    const proj = M4.perspective(cam.fov, w / h, 0.05, 200);
    const view = M4.lookAt(cam.eye, cam.target, [0, 1, 0]);
    const vp = M4.mul(proj, view);
    this.lastVP = vp;
    this.lastSize = [w, h];

    gl.useProgram(this.main.p);
    const u = this.main.u;
    gl.uniformMatrix4fv(u.uVP, false, vp);
    gl.uniformMatrix4fv(u.uLightVP, false, lightVP);
    gl.uniform3fv(u.uLightDir, ld);
    gl.uniform3fv(u.uLightCol, env.lightCol);
    gl.uniform3fv(u.uSky, env.sky);
    gl.uniform3fv(u.uGround, env.ground);
    gl.uniform3fv(u.uCam, cam.eye);
    gl.uniform1f(u.uExposure, env.exposure);
    gl.uniform1f(u.uFloorScale, env.floorScale || 1);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.shadowTex);
    gl.uniform1i(u.uShadow, 0);
    for (const o of scene.objects) {
      if (!o.visible) continue;
      gl.uniformMatrix4fv(u.uModel, false, o.model);
      gl.uniform3fv(u.uTint, o.tint || [0, 0, 0]);
      gl.uniform1f(u.uTintK, o.tintK || 0);
      gl.bindVertexArray(o.mesh.vao);
      gl.drawElements(gl.TRIANGLES, o.mesh.count, gl.UNSIGNED_INT, 0);
    }

    if (scene.lines && scene.lines.length) {
      gl.useProgram(this.line.p);
      gl.uniformMatrix4fv(this.line.u.uVP, false, vp);
      for (const l of scene.lines) {
        if (l.visible === false) continue;
        gl.uniformMatrix4fv(this.line.u.uModel, false, l.model || M4.ident());
        gl.uniform3fv(this.line.u.uColor, l.color);
        gl.bindVertexArray(l.mesh.vao);
        gl.drawArrays(gl.LINES, 0, l.mesh.count);
      }
    }
    gl.bindVertexArray(null);
  }

  project(p) {
    if (!this.lastVP) return null;
    const v = this.lastVP;
    const x = v[0] * p[0] + v[4] * p[1] + v[8] * p[2] + v[12];
    const y = v[1] * p[0] + v[5] * p[1] + v[9] * p[2] + v[13];
    const wv = v[3] * p[0] + v[7] * p[1] + v[11] * p[2] + v[15];
    if (wv <= 0) return null;
    const dpr = this.lastSize[0] / this.canvas.clientWidth;
    return [((x / wv + 1) / 2) * this.lastSize[0] / dpr, ((1 - y / wv) / 2) * this.lastSize[1] / dpr];
  }
}

// ---------- 視点操作 ----------
export class OrbitCamera {
  constructor(target, dist, theta, phi) {
    this.target = target;
    this.dist = dist;
    this.theta = theta;
    this.phi = phi;
    this.fov = (38 * Math.PI) / 180;
    this.minDist = 1.5;
    this.maxDist = 60;
  }

  get eye() {
    const sp = Math.sin(this.phi);
    return [
      this.target[0] + this.dist * sp * Math.cos(this.theta),
      this.target[1] + this.dist * Math.cos(this.phi),
      this.target[2] + this.dist * sp * Math.sin(this.theta),
    ];
  }

  rotate(dx, dy) {
    this.theta += dx * 0.008;
    this.phi = Math.max(0.12, Math.min(Math.PI / 2 - 0.02, this.phi - dy * 0.008));
  }

  zoom(f) {
    this.dist = Math.max(this.minDist, Math.min(this.maxDist, this.dist * f));
  }

  pan(dx, dy) {
    const k = this.dist * 0.0012;
    const rx = -Math.sin(this.theta);
    const rz = Math.cos(this.theta);
    this.target = [this.target[0] - (rx * dx) * k, this.target[1] + dy * k, this.target[2] - (rz * dx) * k];
  }

  // 視線（ワールド座標の光線）
  ray(px, py, w, h) {
    const eye = this.eye;
    const f = [this.target[0] - eye[0], this.target[1] - eye[1], this.target[2] - eye[2]];
    const fl = Math.hypot(...f);
    const fz = f.map((v) => v / fl);
    let rx = [fz[1] * 0 - fz[2] * 1, fz[2] * 0 - fz[0] * 0, fz[0] * 1 - fz[1] * 0];
    const rl = Math.hypot(...rx) || 1;
    rx = rx.map((v) => v / rl);
    const up = [rx[1] * fz[2] - rx[2] * fz[1], rx[2] * fz[0] - rx[0] * fz[2], rx[0] * fz[1] - rx[1] * fz[0]];
    const t = Math.tan(this.fov / 2);
    const nx = ((px / w) * 2 - 1) * t * (w / h);
    const ny = (1 - (py / h) * 2) * t;
    const d = [fz[0] + rx[0] * nx + up[0] * ny, fz[1] + rx[1] * nx + up[1] * ny, fz[2] + rx[2] * nx + up[2] * ny];
    const dl = Math.hypot(...d);
    return { o: eye, d: d.map((v) => v / dl) };
  }
}

export function attachOrbit(canvas, cam, onChange) {
  const pointers = new Map();
  let lastPinch = 0;
  let mode = 'rotate';
  let moved = 0;
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  canvas.addEventListener('pointerdown', (e) => {
    canvas.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, [e.clientX, e.clientY]);
    mode = e.button === 2 || e.shiftKey ? 'pan' : 'rotate';
    moved = 0;
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      lastPinch = Math.hypot(a[0] - b[0], a[1] - b[1]);
    }
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!pointers.has(e.pointerId)) return;
    const prev = pointers.get(e.pointerId);
    const dx = e.clientX - prev[0];
    const dy = e.clientY - prev[1];
    pointers.set(e.pointerId, [e.clientX, e.clientY]);
    moved += Math.abs(dx) + Math.abs(dy);
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      const d = Math.hypot(a[0] - b[0], a[1] - b[1]);
      if (lastPinch) cam.zoom(lastPinch / d);
      lastPinch = d;
      cam.pan(dx * 0.5, dy * 0.5);
    } else if (mode === 'pan') cam.pan(dx, dy);
    else cam.rotate(dx, dy);
    onChange();
  });
  const end = (e) => {
    pointers.delete(e.pointerId);
    if (pointers.size < 2) lastPinch = 0;
  };
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);
  canvas.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      cam.zoom(Math.exp(e.deltaY * 0.0012));
      onChange();
    },
    { passive: false },
  );
  return { wasDrag: () => moved > 6 };
}
