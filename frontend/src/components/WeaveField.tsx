"use client";
import { useEffect, useRef } from "react";

// The reference's lava-lamp shader (five smooth-merged spheres, fresnel shading), recoloured:
// signal-blue background instead of white, navy blobs with a sky rim instead of black and white.
// Raw WebGL1 with one fullscreen triangle, so the landing page doesn't pull in three.js.
const VERT = "attribute vec2 p; void main() { gl_Position = vec4(p, 0.0, 1.0); }";

const FRAG = `
precision highp float;
uniform vec2 res; uniform float time;
mat4 rotationMatrix(vec3 axis, float angle) {
  axis = normalize(axis); float s = sin(angle), c = cos(angle), oc = 1.0 - c;
  return mat4(oc*axis.x*axis.x + c, oc*axis.x*axis.y - axis.z*s, oc*axis.z*axis.x + axis.y*s, 0.0,
              oc*axis.x*axis.y + axis.z*s, oc*axis.y*axis.y + c, oc*axis.y*axis.z - axis.x*s, 0.0,
              oc*axis.z*axis.x - axis.y*s, oc*axis.y*axis.z + axis.x*s, oc*axis.z*axis.z + c, 0.0,
              0.0, 0.0, 0.0, 1.0);
}
vec3 rotate(vec3 v, vec3 axis, float angle) { return (rotationMatrix(axis, angle) * vec4(v, 1.0)).xyz; }
float smin(float a, float b, float k) { k *= 6.0; float h = max(k - abs(a - b), 0.0) / k; return min(a, b) - h*h*h*k*(1.0/6.0); }
float sdf(vec3 p) {
  vec3 p1 = rotate(p, vec3(0.0, 0.0, 1.0), time/5.0);
  vec3 p2 = rotate(p, vec3(1.0), -time/5.0);
  vec3 p3 = rotate(p, vec3(1.0, 1.0, 0.0), -time/4.5);
  vec3 p4 = rotate(p, vec3(0.0, 1.0, 0.0), -time/4.0);
  float d = length(p1 - vec3(-0.5, 0.0, 0.0)) - 0.35;
  d = smin(d, length(p2 - vec3(0.55, 0.0, 0.0)) - 0.3, 0.1);
  d = smin(d, length(p2 - vec3(-0.8, 0.0, 0.0)) - 0.2, 0.1);
  d = smin(d, length(p3 - vec3(1.0, 0.0, 0.0)) - 0.15, 0.1);
  d = smin(d, length(p4 - vec3(0.45, -0.45, 0.0)) - 0.15, 0.1);
  return d;
}
vec3 getNormal(vec3 p) {
  float e = 0.001;
  return normalize(vec3(sdf(p + vec3(e,0,0)) - sdf(p - vec3(e,0,0)), sdf(p + vec3(0,e,0)) - sdf(p - vec3(0,e,0)), sdf(p + vec3(0,0,e)) - sdf(p - vec3(0,0,e))));
}
void main() {
  vec2 frag = gl_FragCoord.xy / res;
  vec2 uv = (gl_FragCoord.xy - 0.5 * res) * 0.4 / max(res.x, res.y);
  vec3 cam = vec3(0.0, 0.0, 5.0), ray = normalize(vec3(uv, -1.0));
  // background: the .hero-blue gradient (#087cf8 to #0a508f) with the sky glow at the top
  vec3 bg = mix(vec3(0.039, 0.314, 0.561), vec3(0.031, 0.486, 0.973), smoothstep(0.0, 1.0, frag.y));
  bg = mix(bg, vec3(0.541, 0.847, 0.988), 0.55 * smoothstep(0.55, 0.0, length((frag - vec2(0.5, 1.0)) * vec2(1.0, 1.6))));
  float t = 0.0; bool hit = false;
  for (int i = 0; i < 100; i++) {
    float d = sdf(cam + ray * t);
    if (d < 0.001) { hit = true; break; }
    t += d; if (t > 100.0) break;
  }
  if (!hit) { gl_FragColor = vec4(bg, 1.0); return; }
  float fresnel = pow(1.0 + dot(ray, getNormal(cam + ray * t)), 3.0);
  // reference: black core to white rim; ours: deep navy core to sky, then white at the very edge
  vec3 c = mix(vec3(0.016, 0.149, 0.329), vec3(0.541, 0.847, 0.988), smoothstep(0.0, 0.7, fresnel));
  gl_FragColor = vec4(mix(c, vec3(1.0), smoothstep(0.7, 1.0, fresnel)), 1.0);
}`;

export default function WeaveField({ className = "" }: { className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = ref.current!;
    const gl = cv.getContext("webgl", { antialias: true });
    if (!gl) return; // no WebGL: the .hero-blue gradient behind the canvas shows instead
    const sh = (type: number, src: string) => { const s = gl.createShader(type)!; gl.shaderSource(s, src); gl.compileShader(s); return s; };
    const prog = gl.createProgram()!;
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return;
    gl.useProgram(prog);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    const uRes = gl.getUniformLocation(prog, "res"), uT = gl.getUniformLocation(prog, "time");

    const t0 = performance.now();
    const draw = (now: number) => { gl.uniform1f(uT, (now - t0) / 1000); gl.drawArrays(gl.TRIANGLES, 0, 3); };
    // resizing clears the canvas, so redraw even while paused offscreen
    const fit = () => {
      const s = Math.min(window.devicePixelRatio || 1, 2);
      cv.width = Math.max(1, cv.clientWidth * s); cv.height = Math.max(1, cv.clientHeight * s);
      gl.viewport(0, 0, cv.width, cv.height); gl.uniform2f(uRes, cv.width, cv.height);
      draw(performance.now());
    };
    const ro = new ResizeObserver(fit); ro.observe(cv); fit();

    // pause offscreen; one still frame for reduced motion
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let visible = true, raf = 0;
    const frame = (now: number) => {
      raf = 0;
      draw(now);
      if (visible && !still) raf = requestAnimationFrame(frame);
    };
    const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; if (visible && !raf) raf = requestAnimationFrame(frame); });
    io.observe(cv);
    raf = requestAnimationFrame(frame);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); io.disconnect(); };
  }, []);
  return <canvas ref={ref} aria-hidden className={`pointer-events-none absolute inset-0 h-full w-full ${className}`} />;
}
