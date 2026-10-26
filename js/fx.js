/* インテグラ・レイヤー  画面の仕上げ（光と影・光のにじみ・周辺の暗さ）
   ゲームの計算には一切さわらない。#view に描いた絵を WebGL で仕上げて、上に重ねて見せるだけ。
   WebGL が使えない・「演出：少なめ」のときは何もしない（元の絵がそのまま見える）。 */
(function () {
'use strict';
const FX = { on: false };
let gl, cv, prog = {}, tex, fbA, fbB, texA, texB, quad, bw = 0, bh = 0, W = 0, H = 0, slow = 0, last = 0;

const VS = 'attribute vec2 p;varying vec2 v;void main(){v=p*0.5+0.5;gl_Position=vec4(p,0.,1.);}';
const BRIGHT = `precision mediump float;varying vec2 v;uniform sampler2D t;uniform float th;
void main(){vec3 c=texture2D(t,v).rgb;float l=max(max(c.r,c.g),c.b);gl_FragColor=vec4(c*smoothstep(th,th+0.25,l),1.);}`;
const BLUR = `precision mediump float;varying vec2 v;uniform sampler2D t;uniform vec2 d;
void main(){vec3 s=texture2D(t,v).rgb*0.227;
s+=(texture2D(t,v+d*1.38).rgb+texture2D(t,v-d*1.38).rgb)*0.316;
s+=(texture2D(t,v+d*3.23).rgb+texture2D(t,v-d*3.23).rgb)*0.07;gl_FragColor=vec4(s,1.);}`;
const COMP = `precision mediump float;varying vec2 v;uniform sampler2D t,b;uniform vec2 res;uniform float px,bump,bloom,vig,tm;uniform vec2 lp;uniform vec3 tint;
float L(vec2 o){vec3 c=texture2D(t,v+o/res).rgb;return dot(c,vec3(.299,.587,.114));}
void main(){
  vec3 c=texture2D(t,v).rgb;
  if(bump>0.){
    float dx=L(vec2(px,0.))-L(vec2(-px,0.)),dy=L(vec2(0.,px))-L(vec2(0.,-px));
    vec3 n=normalize(vec3(-dx*4.,-dy*4.,1.));
    vec2 fp=v*res;vec3 ld=normalize(vec3(lp-fp,px*26.));
    float sh=1.+(dot(n,ld)-ld.z)*bump;
    float dist=length(lp-fp)/(px*16.);
    float spec=pow(max(dot(reflect(-ld,n),vec3(0.,0.,1.)),0.),18.)*0.7*smoothstep(7.,1.5,dist)*step(0.02,abs(dx)+abs(dy));
    c=c*sh+spec*vec3(1.,.8,.55);
    float fall=smoothstep(9.,1.,dist);
    c*=mix(vec3(.62,.7,.95),vec3(1.18,1.04,.86),fall);
  }
  c+=texture2D(b,v).rgb*bloom;
  float g=dot(c,vec3(.299,.587,.114));c=mix(vec3(g),c,1.12);c=(c-.5)*1.06+.5;c*=tint;
  vec2 q=v-.5;c*=1.-vig*smoothstep(.35,.8,length(q*vec2(res.x/res.y,1.)*.85));
  gl_FragColor=vec4(c,1.);
}`;

function sh(type, src) { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; }
function mk(fs) { const p = gl.createProgram(); gl.attachShader(p, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fs)); gl.bindAttribLocation(p, 0, 'p'); gl.linkProgram(p); if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error('link'); const u = {}; const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS); for (let i = 0; i < n; i++) { const a = gl.getActiveUniform(p, i); u[a.name] = gl.getUniformLocation(p, a.name); } return { p, u }; }
function mkTex(lin) { const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t); const f = lin ? gl.LINEAR : gl.NEAREST; gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, f); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, f); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE); return t; }
function mkFb(t, w, h) { gl.bindTexture(gl.TEXTURE_2D, t); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null); const f = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, f); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0); return f; }

FX.init = view => {
  try {
    cv = document.createElement('canvas'); cv.id = 'fx'; view.after(cv);
    gl = cv.getContext('webgl', { alpha: false, antialias: false, premultipliedAlpha: false, preserveDrawingBuffer: false });
    if (!gl) throw new Error('no webgl');
    prog.br = mk(BRIGHT); prog.bl = mk(BLUR); prog.co = mk(COMP);
    quad = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, quad); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    tex = mkTex(false); texA = mkTex(true); texB = mkTex(true);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    FX.ok = true;
  } catch (e) { FX.ok = false; if (cv) cv.remove(); cv = null; }
};
function size(w, h) {
  if (w === W && h === H) return; W = w; H = h; cv.width = w; cv.height = h;
  bw = Math.max(1, w >> 2); bh = Math.max(1, h >> 2); fbA = mkFb(texA, bw, bh); fbB = mkFb(texB, bw, bh);
}
function pass(pr, fb, w, h) { gl.useProgram(pr.p); gl.bindFramebuffer(gl.FRAMEBUFFER, fb); gl.viewport(0, 0, w, h); return pr.u; }
/* src：#view のキャンバス。o：{ px（ドット1つ分の画面上の大きさ）, bump（凹凸の強さ。0で無し）, bloom, vig, tint:[r,g,b] } */
FX.frame = (src, o) => {
  if (!FX.ok || !FX.on) { if (cv) cv.style.display = 'none'; return; }
  const t0 = performance.now();
  cv.style.display = 'block'; size(src.width, src.height);
  gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, tex); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
  let u = pass(prog.br, fbA, bw, bh); gl.uniform1i(u.t, 0); gl.uniform1f(u.th, o.th || 0.62); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  for (let k = 0; k < 2; k++) {
    gl.bindTexture(gl.TEXTURE_2D, texA); u = pass(prog.bl, fbB, bw, bh); gl.uniform1i(u.t, 0); gl.uniform2f(u.d, (1 + k) / bw, 0); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.bindTexture(gl.TEXTURE_2D, texB); u = pass(prog.bl, fbA, bw, bh); gl.uniform1i(u.t, 0); gl.uniform2f(u.d, 0, (1 + k) / bh); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }
  u = pass(prog.co, null, W, H);
  gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, tex); gl.uniform1i(u.t, 0);
  gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, texA); gl.uniform1i(u.b, 1);
  gl.uniform2f(u.res, W, H); gl.uniform1f(u.px, Math.max(1, o.px || 3)); gl.uniform1f(u.bump, o.bump || 0); gl.uniform1f(u.bloom, o.bloom == null ? 0.9 : o.bloom);
  gl.uniform1f(u.vig, o.vig == null ? 0.35 : o.vig); gl.uniform1f(u.tm, t0 / 1000); gl.uniform2f(u.lp, W / 2, H / 2);
  const ti = o.tint || [1, 1, 1]; gl.uniform3f(u.tint, ti[0], ti[1], ti[2]);
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4); gl.activeTexture(gl.TEXTURE0);
  // 重い端末では自動で切る（3秒続けて1枚に40ms以上かかったら）
  const dt = performance.now() - t0; if (dt > 40) { if (!slow) slow = t0; else if (t0 - slow > 3000) { FX.on = false; FX.auto = true; cv.style.display = 'none'; } } else slow = 0;
};
FX.hide = () => { if (cv) cv.style.display = 'none'; };
window.FX = FX;
})();
