// Ivan's room in golden hour, a cel-shaded diorama built from primitives: sun
// through the balcony door, a turntable going, a bookshelf with a camera, a
// print above the sofa. Night swaps the sun for the lamp, the laptop and the city.
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";

const canvas = document.getElementById("scene");
const still = matchMedia("(prefers-reduced-motion: reduce)");
const dark = matchMedia("(prefers-color-scheme: dark)");

let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
} catch {
  document.documentElement.classList.add("no-webgl");
}
if (renderer) build(renderer);

function build(renderer) {
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;

  const scene = new THREE.Scene();

  // An isometric view: orthographic, so the room reads like a model on a desk.
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
  camera.position.set(10, 8.6, 10);
  camera.lookAt(-0.05, 0.85, -0.15);
  const VIEW = 6.25;

  const room = new THREE.Group();
  scene.add(room);

  // Cel shading: three crisp bands of light, and ink round every solid shape.
  const bands = new THREE.DataTexture(new Uint8Array([90, 168, 255]), 3, 1, THREE.RedFormat);
  bands.minFilter = bands.magFilter = THREE.NearestFilter;
  bands.needsUpdate = true;
  const toonMat = ({ roughness, metalness, ...rest } = {}) => new THREE.MeshToonMaterial({ gradientMap: bands, ...rest });
  const clay = (color) => toonMat({ color });
  const INK = 0.013;
  const ink = new THREE.ShaderMaterial({
    uniforms: { color: { value: new THREE.Color("#2a2236") } },
    vertexShader: `void main() { gl_Position = projectionMatrix * modelViewMatrix * vec4(position + normal * ${INK.toFixed(4)}, 1.0); }`,
    fragmentShader: `uniform vec3 color; void main() { gl_FragColor = vec4(color, 1.0); }`,
    side: THREE.BackSide,
  });
  const box = (w, h, d, r = 0.05) => new RoundedBoxGeometry(w, h, d, 4, Math.min(r, w / 2 - 0.001, h / 2 - 0.001, d / 2 - 0.001));
  const cyl = (rt, rb, h, s = 40) => new THREE.CylinderGeometry(rt, rb, h, s);
  function put(geometry, material, at, parent = room, { cast = true, receive = true } = {}) {
    const m = new THREE.Mesh(geometry, material);
    m.position.set(...at);
    m.castShadow = cast;
    m.receiveShadow = receive;
    if (cast) m.add(new THREE.Mesh(geometry, ink));
    parent.add(m);
    return m;
  }

  const C = {
    wall: "#f1e6d6", wallNight: "#5a5277", floor: "#d9a978", rug: "#f4ead8", rugLine: "#e2a35a",
    sofa: "#7f9cc0", cushion: "#8eaacc", mustard: "#e8b65a", coral: "#ee8a72", sage: "#7fa889",
    leaf: "#5f9a6c", pot: "#e9cdb2", wood: "#b9805a", woodDark: "#8a5a3e", ink: "#2b2a35",
    metal: "#d7d8de", record: "#1d1b22", skin: "#f6d3b8", hair: "#1c181e", tee: "#2f2e37",
    denim: "#4f6f9b", shoe: "#f5f4f1", books: ["#ee8a72", "#7f9cc0", "#7fa889", "#e8b65a", "#a68bc4", "#f3e4cc", "#5f7f9a"],
  };

  // A floor of planks, painted once on a canvas.
  const planks = (() => {
    const c = document.createElement("canvas");
    c.width = 512; c.height = 512;
    const g = c.getContext("2d");
    g.fillStyle = C.floor;
    g.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 8; i++) {
      g.fillStyle = `rgba(120, 70, 30, ${0.04 + (i % 3) * 0.025})`;
      g.fillRect(0, i * 64, 512, 64);
      g.fillStyle = "rgba(90, 50, 20, .22)";
      g.fillRect(0, i * 64, 512, 2);
      g.fillRect(((i * 197) % 512), i * 64, 2, 64);
    }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(1.4, 1.4);
    return t;
  })();

  // Room: floor slab, side wall, and a back wall framed round the balcony door.
  const W = 4.8, D = 4.2, H = 2.8, T = 0.2;
  const floorMat = toonMat({ map: planks, roughness: 0.7 });
  put(box(W, 0.28, D, 0.08), floorMat, [0, -0.14, 0]);
  const wallMat = clay(C.wall, 0.95);
  const backZ = -D / 2 + T / 2, sideX = -W / 2 + T / 2;
  const door = { left: 0.45, right: 1.75, top: 2.2 };
  put(box(door.left + W / 2, H, T, 0.04), wallMat, [(-W / 2 + door.left) / 2, H / 2, backZ]);
  put(box(W / 2 - door.right, H, T, 0.04), wallMat, [(door.right + W / 2) / 2, H / 2, backZ]);
  put(box(door.right - door.left, H - door.top, T, 0.04), wallMat, [(door.left + door.right) / 2, (H + door.top) / 2, backZ]);
  put(box(T, H, D, 0.04), wallMat, [sideX, H / 2, 0]);
  const trim = clay("#fbf6ee", 0.6);
  put(box(W - T, 0.1, 0.04, 0.015), trim, [T / 2, 0.05, backZ + T / 2 + 0.02]);
  put(box(0.04, 0.1, D - T, 0.015), trim, [sideX + T / 2 + 0.02, 0.05, T / 2]);
  // The door's frame and its mullion.
  const doorFrame = clay("#f8f4ec", 0.5);
  for (const [w, h, x, y] of [
    [0.07, door.top, door.left, door.top / 2], [0.07, door.top, door.right, door.top / 2],
    [door.right - door.left + 0.07, 0.07, (door.left + door.right) / 2, door.top], [0.04, door.top, (door.left + door.right) / 2, door.top / 2],
  ]) put(box(w, h, 0.09, 0.02), doorFrame, [x, y, backZ]);

  // The view through the door, painted on one plane just behind it: sky,
  // the city, the balcony rail and its plants. Nothing outside the room is built.
  let seed = 11;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const viewMat = new THREE.ShaderMaterial({
    uniforms: { night: { value: 0 } },
    vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `varying vec2 vUv; uniform float night;
      float hash(vec2 p) { return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5453); }
      void main() {
        vec2 u = vUv;
        vec3 day = mix(vec3(1.0, 0.82, 0.62), vec3(0.64, 0.78, 0.96), smoothstep(0.25, 1.0, u.y));
        vec3 eve = mix(vec3(0.52, 0.30, 0.46), vec3(0.07, 0.07, 0.20), smoothstep(0.25, 1.0, u.y));
        vec3 c = mix(day, eve, night);
        c += step(0.995, hash(floor(u * 180.0))) * night * step(0.6, u.y);
        float col = floor(u.x * 9.0);
        float top = 0.42 + 0.2 * hash(vec2(col, 3.0));
        float town = step(u.y, top) * step(0.3, u.y);
        vec3 bldg = mix(vec3(0.72, 0.74, 0.84), vec3(0.16, 0.17, 0.32), night);
        vec2 w = vec2(floor(u.x * 54.0), floor(u.y * 70.0));
        float lit = step(0.7, hash(w)) * night * step(u.y, top - 0.02) * step(fract(u.x * 54.0), 0.6) * step(fract(u.y * 70.0), 0.55);
        c = mix(c, bldg, town) + town * lit * vec3(1.0, 0.78, 0.45);
        float floorLine = step(u.y, 0.3);
        c = mix(c, mix(vec3(0.82, 0.76, 0.68), vec3(0.20, 0.18, 0.26), night), floorLine);
        float rail = step(abs(u.y - 0.47), 0.006) + step(0.93, fract(u.x * 11.0)) * step(u.y, 0.47) * step(0.3, u.y);
        c = mix(c, mix(vec3(0.24, 0.22, 0.28), vec3(0.06, 0.05, 0.1), night), clamp(rail, 0.0, 1.0));
        float leaf = smoothstep(0.16, 0.14, length((u - vec2(0.83, 0.42)) * vec2(1.0, 0.8)));
        leaf = max(leaf, smoothstep(0.11, 0.09, length((u - vec2(0.73, 0.38)) * vec2(1.0, 0.8))));
        c = mix(c, mix(vec3(0.35, 0.58, 0.40), vec3(0.08, 0.14, 0.12), night), leaf);
        gl_FragColor = vec4(c, 1.0);
      }`,
  });
  put(new THREE.PlaneGeometry(door.right - door.left, door.top), viewMat, [(door.left + door.right) / 2, door.top / 2, backZ - T / 2 + 0.01], room, { cast: false, receive: false });

  // The rug, the sofa and its cushions.
  const rugTex = (() => {
    const c = document.createElement("canvas");
    c.width = c.height = 256;
    const g = c.getContext("2d");
    g.fillStyle = C.rug;
    g.beginPath(); g.arc(128, 128, 128, 0, Math.PI * 2); g.fill();
    g.strokeStyle = C.rugLine; g.lineWidth = 7;
    for (const r of [104, 84]) { g.beginPath(); g.arc(128, 128, r, 0, Math.PI * 2); g.stroke(); }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  })();
  put(cyl(1.25, 1.25, 0.025, 64), toonMat({ map: rugTex, roughness: 1 }), [-0.15, 0.013, 0.05], room, { cast: false });
  const sofa = clay(C.sofa), cushion = clay(C.cushion);
  put(box(2.3, 0.4, 0.95, 0.12), sofa, [-0.6, 0.28, -1.3]);
  put(box(2.3, 0.62, 0.26, 0.13), sofa, [-0.6, 0.78, -1.68]);
  for (const x of [-1.78, 0.58]) put(box(0.26, 0.6, 0.95, 0.13), sofa, [x, 0.48, -1.3]);
  for (const x of [-1.12, -0.07]) {
    put(box(1.04, 0.16, 0.82, 0.08), cushion, [x, 0.56, -1.24]);
    put(box(1.0, 0.5, 0.2, 0.1), cushion, [x, 0.88, -1.56]).rotation.x = -0.12;
  }
  put(box(0.42, 0.4, 0.14, 0.12), clay(C.mustard), [-1.45, 0.83, -1.38]).rotation.set(-0.15, 0.25, 0.2);

  // Ivan, Memoji-proportioned, on the right cushion with the laptop on his knees.
  const me = new THREE.Group();
  me.position.set(-0.07, 0.64, -1.27);
  room.add(me);
  const skin = clay(C.skin, 0.7), tee = clay(C.tee, 0.92), denim = clay(C.denim, 0.9), hair = clay(C.hair, 0.55);
  const Y = new THREE.Vector3(0, 1, 0);
  function limb(a, b, r, mat, parent) {
    const from = new THREE.Vector3(...a), span = new THREE.Vector3(...b).sub(from);
    const m = put(new THREE.CapsuleGeometry(r, Math.max(span.length() - r, 0.01), 6, 14), mat, [0, 0, 0], parent);
    m.position.copy(from).addScaledVector(span, 0.5);
    m.quaternion.setFromUnitVectors(Y, span.normalize());
    return m;
  }
  const torso = put(new THREE.CapsuleGeometry(0.2, 0.22, 8, 20), tee, [0, 0.36, -0.04], me);
  torso.scale.set(1.08, 1, 0.85);
  for (const s of [-1, 1]) {
    limb([s * 0.11, 0.06, -0.02], [s * 0.12, 0.06, 0.36], 0.095, denim, me);
    limb([s * 0.12, 0.06, 0.36], [s * 0.13, -0.42, 0.42], 0.085, denim, me);
    put(box(0.15, 0.1, 0.27, 0.05), clay(C.shoe, 0.6), [s * 0.13, -0.5, 0.5], me);
    put(box(0.155, 0.03, 0.28, 0.012), clay("#d9d6cf", 0.6), [s * 0.13, -0.56, 0.5], me);
  }
  const forearms = [];
  for (const s of [-1, 1]) {
    const shoulder = [s * 0.2, 0.52, -0.05], elbow = [s * 0.25, 0.3, 0.08];
    limb(shoulder, [s * 0.22, 0.44, -0.02], 0.085, tee, me);
    limb(shoulder, elbow, 0.055, skin, me);
    const fore = new THREE.Group();
    fore.position.set(...elbow);
    me.add(fore);
    const hand = [s * -0.12, 0.0, 0.25];
    limb([0, 0, 0], hand, 0.05, skin, fore);
    put(new THREE.SphereGeometry(0.058, 16, 12), skin, hand, fore).scale.set(1, 0.75, 1.15);
    forearms.push(fore);
  }
  // The laptop on his knees, its screen turned to him.
  const laptop = new THREE.Group();
  laptop.position.set(0, 0.28, 0.33);
  laptop.rotation.set(0.1, Math.PI, 0);
  me.add(laptop);
  const alu = toonMat({ color: C.metal, roughness: 0.35, metalness: 0.6 });
  put(box(0.56, 0.03, 0.38, 0.015), alu, [0, 0, 0], laptop);
  const lid = new THREE.Group();
  lid.position.set(0, 0.015, -0.18);
  lid.rotation.x = 0.32;
  laptop.add(lid);
  put(box(0.56, 0.38, 0.02, 0.015), alu, [0, 0.19, 0], lid);
  put(new THREE.PlaneGeometry(0.5, 0.32), new THREE.MeshBasicMaterial({ color: "#b9c8ff", toneMapped: false }), [0, 0.195, 0.011], lid, { cast: false });
  const screenGlow = new THREE.PointLight("#a9bcff", 0, 1.8, 2);
  screenGlow.position.set(0, 0.2, 0.25);
  lid.add(screenGlow);

  // The head: round, smooth, young.
  const head = new THREE.Group();
  head.position.set(0, 0.86, 0.0);
  me.add(head);
  put(new THREE.SphereGeometry(0.245, 40, 32), skin, [0, 0, 0], head).scale.set(1.0, 0.98, 0.96);
  put(new THREE.SphereGeometry(0.2, 32, 24), skin, [0, -0.07, 0.025], head).scale.set(1.08, 0.8, 0.95);
  for (const s of [-1, 1]) put(new THREE.SphereGeometry(0.05, 16, 12), skin, [s * 0.24, -0.01, -0.01], head).scale.set(0.55, 1, 0.9);
  put(new THREE.CapsuleGeometry(0.07, 0.06, 6, 12), skin, [0, -0.25, -0.01], head);
  // Hair parted three-to-seven: the part on his right, the long side lifting and sweeping over to his left.
  const PART = -0.085;
  put(new THREE.SphereGeometry(0.252, 40, 24, 0, Math.PI * 2, 0, Math.PI * 0.5), hair, [0, 0.02, -0.035], head).rotation.x = -0.5;
  const shortSide = put(new THREE.SphereGeometry(0.12, 24, 16), hair, [PART - 0.08, 0.17, 0.02], head);
  shortSide.scale.set(0.95, 0.5, 1.6);
  shortSide.rotation.z = 0.35;
  const longSide = put(new THREE.SphereGeometry(0.17, 32, 20), hair, [PART + 0.16, 0.2, 0.025], head);
  longSide.scale.set(1.1, 0.55, 1.35);
  longSide.rotation.set(0.1, 0, -0.2);
  const quiff = put(new THREE.SphereGeometry(0.11, 24, 16), hair, [PART + 0.11, 0.21, 0.15], head);
  quiff.scale.set(1.25, 0.7, 0.85);
  quiff.rotation.set(0.5, 0.1, -0.35);
  for (const s of [-1, 1]) put(new THREE.SphereGeometry(0.07, 16, 12), hair, [s * 0.215, 0.08, -0.06], head).scale.set(0.35, 0.85, 1.05);
  // Eyes with a light in them and thin arched brows; the Memoji's smile reads from the eyes.
  const white = new THREE.MeshBasicMaterial({ color: "#fdfcf9" });
  const iris = toonMat({ color: "#241c19", roughness: 0.25 });
  const spark = new THREE.MeshBasicMaterial({ color: "#ffffff" });
  const browMat = clay("#231d20", 0.6);
  for (const s of [-1, 1]) {
    const x = s * 0.085;
    put(new THREE.SphereGeometry(0.05, 20, 16), white, [x, 0.0, 0.2], head, { cast: false }).scale.set(0.95, 1.08, 0.5);
    put(new THREE.SphereGeometry(0.034, 20, 16), iris, [x - s * 0.004, -0.002, 0.219], head, { cast: false }).scale.set(1, 1.08, 0.55);
    put(new THREE.SphereGeometry(0.009, 8, 6), spark, [x + 0.012, 0.012, 0.234], head, { cast: false });
    const brow = put(new THREE.TorusGeometry(0.05, 0.008, 6, 16, Math.PI * 0.7), browMat, [x, 0.082, 0.21], head, { cast: false });
    brow.rotation.z = Math.PI * 0.15 + (s > 0 ? 0 : 0.1);
  }
  put(new THREE.SphereGeometry(0.026, 12, 10), skin, [0, -0.055, 0.235], head, { cast: false });
  // His glasses: thin silver rims.
  const rimMat = toonMat({ color: "#c9ccd6", roughness: 0.3, metalness: 0.7 });
  const ring = (() => {
    const s = new THREE.Shape(), w = 0.13, h = 0.095, r = 0.03;
    s.moveTo(-w / 2 + r, -h / 2); s.lineTo(w / 2 - r, -h / 2); s.quadraticCurveTo(w / 2, -h / 2, w / 2, -h / 2 + r);
    s.lineTo(w / 2, h / 2 - r); s.quadraticCurveTo(w / 2, h / 2, w / 2 - r, h / 2); s.lineTo(-w / 2 + r, h / 2);
    s.quadraticCurveTo(-w / 2, h / 2, -w / 2, h / 2 - r); s.lineTo(-w / 2, -h / 2 + r); s.quadraticCurveTo(-w / 2, -h / 2, -w / 2 + r, -h / 2);
    const hole = new THREE.Path(), i = 0.008, wi = w - 2 * i, hi = h - 2 * i, ri = r - i;
    hole.moveTo(-wi / 2 + ri, -hi / 2); hole.lineTo(wi / 2 - ri, -hi / 2); hole.quadraticCurveTo(wi / 2, -hi / 2, wi / 2, -hi / 2 + ri);
    hole.lineTo(wi / 2, hi / 2 - ri); hole.quadraticCurveTo(wi / 2, hi / 2, wi / 2 - ri, hi / 2); hole.lineTo(-wi / 2 + ri, hi / 2);
    hole.quadraticCurveTo(-wi / 2, hi / 2, -wi / 2, hi / 2 - ri); hole.lineTo(-wi / 2, -hi / 2 + ri); hole.quadraticCurveTo(-wi / 2, -hi / 2, -wi / 2 + ri, -hi / 2);
    s.holes.push(hole);
    return new THREE.ExtrudeGeometry(s, { depth: 0.006, bevelEnabled: false, curveSegments: 6 });
  })();
  for (const s of [-1, 1]) {
    put(ring, rimMat, [s * 0.085, 0.008, 0.232], head, { cast: false });
    put(box(0.008, 0.008, 0.2, 0.003), rimMat, [s * 0.155, 0.03, 0.13], head, { cast: false });
    const hoop = put(new THREE.TorusGeometry(0.016, 0.004, 8, 20), rimMat, [s * 0.252, -0.055, -0.01], head, { cast: false });
    hoop.rotation.y = Math.PI / 2;
  }
  put(box(0.045, 0.008, 0.008, 0.003), rimMat, [0, 0.03, 0.238], head, { cast: false });

  // A print above the sofa: hills at sunset, the kind of picture he'd take.
  const print = (() => {
    const c = document.createElement("canvas");
    c.width = 360; c.height = 240;
    const g = c.getContext("2d");
    const sky = g.createLinearGradient(0, 0, 0, 240);
    sky.addColorStop(0, "#f7c9a0"); sky.addColorStop(0.55, "#f19a7e"); sky.addColorStop(1, "#b9779a");
    g.fillStyle = sky; g.fillRect(0, 0, 360, 240);
    g.fillStyle = "#fde7c4"; g.beginPath(); g.arc(220, 118, 34, 0, Math.PI * 2); g.fill();
    for (const [y, col, amp] of [[150, "#8d6a9c", 18], [178, "#5f5a8c", 22], [205, "#3e4572", 14]]) {
      g.fillStyle = col; g.beginPath(); g.moveTo(0, 240);
      for (let x = 0; x <= 360; x += 12) g.lineTo(x, y - Math.sin(x / 47 + y) * amp - Math.sin(x / 19) * amp * 0.3);
      g.lineTo(360, 240); g.fill();
    }
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  })();
  put(box(1.22, 0.86, 0.05, 0.02), clay("#f8f3ea", 0.6), [-0.65, 1.86, backZ + T / 2 + 0.03]);
  put(new THREE.PlaneGeometry(1.02, 0.68), toonMat({ map: print, roughness: 0.9 }), [-0.65, 1.86, backZ + T / 2 + 0.058], room, { cast: false });

  // The turntable on a low cabinet by the door, records leaning beside it.
  put(box(0.95, 0.56, 0.55, 0.05), clay(C.wood), [1.45, 0.28, -1.55]);
  for (const x of [1.22, 1.68]) put(box(0.4, 0.4, 0.02, 0.01), clay(C.woodDark), [x, 0.28, -1.27]);
  put(box(0.6, 0.08, 0.44, 0.03), clay("#f3efe7", 0.6), [1.45, 0.6, -1.55]);
  const platter = new THREE.Group();
  platter.position.set(1.4, 0.655, -1.55);
  room.add(platter);
  put(cyl(0.17, 0.17, 0.015, 48), toonMat({ color: C.record, roughness: 0.3 }), [0, 0, 0], platter);
  put(cyl(0.055, 0.055, 0.018, 32), clay(C.coral), [0, 0.001, 0], platter);
  put(box(0.04, 0.006, 0.01, 0.002), clay("#fff"), [0.03, 0.011, 0], platter, { cast: false });
  put(box(0.015, 0.015, 0.26, 0.006), rimMat, [1.62, 0.68, -1.52]).rotation.y = 0.45;
  for (const [i, c] of [[0, C.coral], [1, C.sage], [2, C.mustard]]) put(box(0.035, 0.42, 0.42, 0.01), clay(c), [2.02 + i * 0.045, 0.22, -1.05 + i * 0.02]).rotation.z = -0.1;

  // Notes drifting up from the record.
  const noteTex = (() => {
    const c = document.createElement("canvas");
    c.width = c.height = 64;
    const g = c.getContext("2d");
    g.fillStyle = "#fff"; g.font = "52px serif"; g.textAlign = "center"; g.textBaseline = "middle";
    g.fillText("♪", 32, 34);
    return new THREE.CanvasTexture(c);
  })();
  const notes = [];
  for (let i = 0; i < 4; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: noteTex, color: "#ffcf86", transparent: true, depthWrite: false, toneMapped: false }));
    s.scale.setScalar(0.15);
    room.add(s);
    notes.push({ s, phase: i / 4 });
  }

  // The bookshelf on the side wall, a camera on its middle shelf.
  const shelf = new THREE.Group();
  shelf.position.set(sideX + T / 2 + 0.2, 0, 0.35);
  room.add(shelf);
  const wood = clay(C.wood, 0.7);
  for (const z of [-0.7, 0.7]) put(box(0.38, 2.1, 0.05, 0.02), wood, [0, 1.05, z], shelf);
  for (const y of [0.04, 0.56, 1.08, 1.6, 2.08]) put(box(0.38, 0.045, 1.45, 0.015), wood, [0, y, 0], shelf);
  for (const y of [0.065, 0.585, 1.625]) {
    let z = -0.64;
    while (z < 0.6) {
      const w = 0.055 + rand() * 0.045, h = 0.28 + rand() * 0.16;
      if (z + w > 0.64) break;
      const b = put(box(0.28, h, w, 0.012), clay(C.books[Math.floor(rand() * C.books.length)], 0.75), [0.02, y + h / 2, z + w / 2], shelf);
      if (rand() > 0.85) b.rotation.x = 0.13;
      z += w + 0.01;
    }
  }
  const cam = new THREE.Group();
  cam.position.set(0.04, 1.2, -0.22);
  cam.rotation.y = 0.8;
  shelf.add(cam);
  put(box(0.24, 0.15, 0.11, 0.03), clay(C.ink, 0.5), [0, 0, 0], cam);
  put(box(0.22, 0.05, 0.115, 0.02), clay("#cfcbc2", 0.5), [0, 0.03, 0], cam);
  put(cyl(0.048, 0.05, 0.08), clay(C.ink, 0.4), [0, -0.01, 0.09], cam).rotation.x = Math.PI / 2;
  put(cyl(0.032, 0.032, 0.012), toonMat({ color: "#3d5a9a", roughness: 0.05, metalness: 0.3 }), [0, -0.01, 0.135], cam, { cast: false }).rotation.x = Math.PI / 2;
  put(new THREE.IcosahedronGeometry(0.12, 2), clay(C.leaf), [0.04, 1.27, 0.38], shelf);
  put(cyl(0.075, 0.06, 0.13), clay(C.pot), [0.04, 1.17, 0.38], shelf);

  // The floor lamp, warm at night.
  put(cyl(0.15, 0.17, 0.04), clay(C.ink, 0.5), [-2.0, 0.02, -1.75]);
  put(cyl(0.018, 0.018, 1.7, 12), clay(C.ink, 0.5), [-2.0, 0.87, -1.75]);
  const shadeMat = toonMat({ color: "#f7e6c6", roughness: 0.9, side: THREE.DoubleSide, emissive: new THREE.Color("#ffb560"), emissiveIntensity: 0 });
  put(new THREE.CylinderGeometry(0.15, 0.27, 0.3, 40, 1, true), shadeMat, [-2.0, 1.82, -1.75]);
  const lamp = new THREE.PointLight("#ffb56b", 0, 5.5, 1.5);
  lamp.position.set(-2.0, 1.65, -1.65);
  lamp.castShadow = true;
  lamp.shadow.mapSize.set(512, 512);
  lamp.shadow.radius = 6;
  room.add(lamp);

  // A plant in the corner by the door, and dust turning in the sunlight.
  put(cyl(0.2, 0.15, 0.36), clay(C.pot), [-1.9, 0.18, 1.55]);
  for (const [x, y, z, s] of [[-1.9, 0.62, 1.55, 0.24], [-2.0, 0.84, 1.6, 0.17], [-1.8, 0.8, 1.48, 0.18], [-1.92, 1.0, 1.52, 0.14]]) put(new THREE.IcosahedronGeometry(s, 2), clay(C.sage), [x, y, z]);
  const motes = new Float32Array(60 * 3);
  for (let i = 0; i < motes.length; i += 3) {
    motes[i] = 0.4 + rand() * 1.6;
    motes[i + 1] = 0.2 + rand() * 1.8;
    motes[i + 2] = -1.9 + rand() * 1.9;
  }
  const dust = new THREE.Points(
    new THREE.BufferGeometry().setAttribute("position", new THREE.BufferAttribute(motes, 3)),
    new THREE.PointsMaterial({ color: "#fff2d0", size: 0.025, transparent: true, opacity: 0.6, depthWrite: false })
  );
  room.add(dust);

  // Light.
  const hemi = new THREE.HemisphereLight("#fff3e3", "#d2aa82", 0.9);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight("#ffd9a6", 3);
  sun.position.set(2.6, 4.2, -6.5);
  sun.target.position.set(0.2, 0, 0.3);
  scene.add(sun.target);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -5, right: 5, top: 5, bottom: -5, near: 0.5, far: 20 });
  sun.shadow.bias = -0.0005;
  sun.shadow.normalBias = 0.02;
  scene.add(sun);
  const fill = new THREE.DirectionalLight("#cfd9ff", 0.5);
  fill.position.set(6, 5, 6);
  scene.add(fill);

  function applyTheme() {
    const night = dark.matches;
    wallMat.color.set(night ? C.wallNight : C.wall);
    viewMat.uniforms.night.value = night ? 1 : 0;
    hemi.intensity = night ? 0.5 : 1.25;
    hemi.color.set(night ? "#8e8cff" : "#fff3e3");
    hemi.groundColor.set(night ? "#3a2f48" : "#d2aa82");
    sun.intensity = night ? 0.6 : 2.4;
    sun.color.set(night ? "#8fa2ff" : "#ffd6a0");
    fill.intensity = night ? 0.12 : 0.5;
    lamp.intensity = night ? 5 : 0;
    shadeMat.emissiveIntensity = night ? 1.4 : 0;
    screenGlow.intensity = night ? 1.2 : 0.2;
    dust.visible = !night;
    ink.uniforms.color.value.set(night ? "#17142a" : "#2a2236");
  }
  applyTheme();

  // Motion.
  let aim = 0, look = 0, aimY = 0, lookY = 0, frame = 0, visible = true, shown = false;
  const t0 = performance.now();
  const dustBase = dust.geometry.attributes.position.array.slice();
  addEventListener("pointermove", (e) => {
    aim = (e.clientX / innerWidth - 0.5) * 2;
    aimY = (e.clientY / innerHeight - 0.5) * 2;
  }, { passive: true });

  function resize() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return;
    const pr = renderer.getPixelRatio();
    if (canvas.width !== Math.round(w * pr) || canvas.height !== Math.round(h * pr)) {
      renderer.setSize(w, h, false);
      const a = w / h, half = VIEW / 2;
      Object.assign(camera, a >= 1 ? { left: -half * a, right: half * a, top: half, bottom: -half } : { left: -half, right: half, top: half / a, bottom: -half / a });
      camera.updateProjectionMatrix();
    }
  }

  function draw(now = performance.now()) {
    resize();
    const calm = still.matches;
    const t = calm ? 0 : (now - t0) / 1000;
    if (!calm) {
      look += (aim - look) * 0.04;
      lookY += (aimY - lookY) * 0.04;
      room.rotation.y = look * 0.1;
      room.rotation.x = lookY * 0.03;
      torso.scale.y = 1 + Math.sin(t * 1.6) * 0.015;
      head.rotation.set(0.05 + Math.sin(t * 0.7) * 0.025, 0.3 + Math.sin(t * 0.31) * 0.14, Math.sin(t * 0.5) * 0.03);
      forearms.forEach((f, i) => { f.rotation.x = Math.sin(t * 11 + i * 1.7) * 0.05 * (0.5 + 0.5 * Math.sin(t * 0.8)); });
      platter.rotation.y = -t * 3.49;
      for (const n of notes) {
        const k = (t * 0.22 + n.phase) % 1;
        n.s.position.set(1.36 + Math.sin(k * 6 + n.phase * 9) * 0.16, 0.8 + k * 1.2, -1.52);
        n.s.material.opacity = Math.sin(k * Math.PI) * 0.9;
      }
      const p = dust.geometry.attributes.position.array;
      for (let i = 0; i < p.length; i += 3) {
        p[i] = dustBase[i] + Math.sin(t * 0.3 + i) * 0.05;
        p[i + 1] = dustBase[i + 1] + Math.sin(t * 0.2 + i * 0.7) * 0.08;
      }
      dust.geometry.attributes.position.needsUpdate = true;
    } else {
      room.rotation.set(0, 0, 0);
      head.rotation.set(0.05, 0.3, 0);
      for (const n of notes) n.s.material.opacity = 0;
    }
    renderer.render(scene, camera);
    if (!shown) { shown = true; canvas.classList.add("ready"); }
  }

  const running = () => visible && !document.hidden && !still.matches;
  function loop(now) {
    draw(now);
    frame = running() ? requestAnimationFrame(loop) : 0;
  }
  function wake() {
    if (running()) {
      if (!frame) frame = requestAnimationFrame(loop);
    } else {
      if (frame) { cancelAnimationFrame(frame); frame = 0; }
      draw();
    }
  }
  new IntersectionObserver(([e]) => { visible = e.isIntersecting; wake(); }).observe(canvas);
  document.addEventListener("visibilitychange", wake);
  still.addEventListener("change", wake);
  dark.addEventListener("change", () => { applyTheme(); draw(); });
  new ResizeObserver(() => draw()).observe(canvas);
  wake();
}
