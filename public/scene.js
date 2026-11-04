// Ivan's room in golden hour, a cel-shaded diorama built from primitives: sun
// through the balcony door, a turntable going, headphones, a game controller
// and a handheld, a bookshelf with a camera, a print above the sofa, his road bike. Night swaps the sun for the lamp, the laptop and the city.
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { HorizontalBlurShader } from "three/addons/shaders/HorizontalBlurShader.js";
import { VerticalBlurShader } from "three/addons/shaders/VerticalBlurShader.js";
import { motion } from "./motion.js";
import { onTrack } from "./nowplaying.js";

const canvas = document.getElementById("scene");
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
    metal: "#d7d8de", record: "#1d1b22", skin: "#f6d3b8", hair: "#2b2429", tee: "#2f2e37",
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
  const RUG_H = 0.025, RUG_TOP = 0.0005 + RUG_H;
  put(cyl(1.25, 1.25, RUG_H, 64), toonMat({ map: rugTex, roughness: 1 }), [-0.15, RUG_TOP - RUG_H / 2, 0.05], room, { cast: false });
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
  me.scale.setScalar(1.12);
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
  // His limbs hang from joints, so one body takes every pose: at rest each hangs straight down
  // from its joint, and a pose turns the joints. The knee's frame matches his own when he sits.
  const DOWN = new THREE.Vector3(0, -1, 0), THIGH = 0.38, UPPER = 0.26, FORE = 0.28;
  const hips = [], knees = [], shoulders = [], elbows = [];
  for (const s of [-1, 1]) {
    const hip = new THREE.Group();
    hip.position.set(s * 0.11, 0.06, -0.02);
    me.add(hip);
    limb([0, 0, 0], [s * 0.01, -THIGH, 0], 0.095, denim, hip);
    const knee = new THREE.Group();
    knee.position.set(s * 0.01, -THIGH, 0);
    hip.add(knee);
    limb([0, 0, 0], [s * 0.01, -0.48, 0.06], 0.085, denim, knee);
    put(box(0.15, 0.1, 0.27, 0.05), clay(C.shoe, 0.6), [s * 0.01, -0.56, 0.14], knee);
    put(box(0.155, 0.03, 0.28, 0.012), clay("#d9d6cf", 0.6), [s * 0.01, -0.62, 0.14], knee);
    hips.push(hip);
    knees.push(knee);
  }
  for (const s of [-1, 1]) {
    const shoulder = new THREE.Group();
    shoulder.position.set(s * 0.2, 0.52, -0.05);
    me.add(shoulder);
    limb([0, 0, 0], [s * 0.01, -0.087, 0], 0.085, tee, shoulder);
    limb([0, 0, 0], [0, -UPPER, 0], 0.055, skin, shoulder);
    const elbow = new THREE.Group();
    elbow.position.set(0, -UPPER, 0);
    shoulder.add(elbow);
    limb([0, 0, 0], [0, -FORE, 0], 0.05, skin, elbow);
    put(new THREE.SphereGeometry(0.058, 16, 12), skin, [0, -FORE, 0], elbow).scale.set(1, 1.15, 0.8);
    shoulders.push(shoulder);
    elbows.push(elbow);
  }
  // Turns `joint` so the limb hanging from it points along `to`, given in `frame`'s axes.
  const toward = new THREE.Vector3(), unturn = new THREE.Quaternion();
  function turnTo(joint, to, frame = joint.parent) {
    toward.set(...to).normalize();
    if (frame !== joint.parent) toward.applyQuaternion(unturn.copy(joint.parent.quaternion).invert());
    joint.quaternion.setFromUnitVectors(DOWN, toward);
  }
  // A leg or an arm along `upper` then `lower`, both in his own axes.
  function pose(top, bottom, upper, lower) {
    turnTo(top, upper);
    turnTo(bottom, lower, me);
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

  // The head: rounded like his Memoji but sized to the body, an illustration rather than a chibi.
  const head = new THREE.Group();
  head.position.set(0, 0.84, 0.0);
  head.scale.setScalar(0.95);
  me.add(head);
  put(new THREE.SphereGeometry(0.245, 48, 36), skin, [0, 0, 0], head).scale.set(0.94, 1.0, 0.96);
  put(new THREE.SphereGeometry(0.19, 40, 28), skin, [0, -0.085, 0.03], head).scale.set(0.98, 0.66, 0.92);
  for (const s of [-1, 1]) put(new THREE.SphereGeometry(0.042, 16, 12), skin, [s * 0.228, -0.015, -0.01], head).scale.set(0.55, 1, 0.9);
  put(new THREE.CapsuleGeometry(0.07, 0.06, 6, 12), skin, [0, -0.26, -0.01], head);
  // A messy textured crop: short sides (a cap held close to the head), a choppy fringe falling to
  // just above the brows and over the temples, and on top spikes standing up and out at random.
  const cap = put(new THREE.SphereGeometry(0.248, 48, 28, 0, Math.PI * 2, 0, Math.PI * 0.52), hair, [0, 0.006, -0.03], head);
  cap.rotation.x = -0.8;
  for (const s of [-1, 1]) put(new THREE.SphereGeometry(0.06, 16, 12), hair, [s * 0.206, 0.07, -0.06], head).scale.set(0.3, 0.75, 1.0);
  // The top is one sphere band whose pole faces forward, so azimuth runs around the face (PI his
  // left, 1.5 PI the crown line, 2 PI his right) and the polar angle runs back from the fringe.
  // Each vertex is placed by hand: the fringe edge is a polar angle per azimuth, low across the
  // forehead and pointed into LOCKS locks. Spikes stand out of the mass, leaning up and forward.
  const top = new THREE.Group();
  top.position.set(0, 0.012, -0.012);
  top.rotation.x = -0.18;
  head.add(top);
  const SEG_W = 96, SEG_H = 64, R = 0.256, FROM = Math.PI + 0.05, TO = Math.PI * 2 - 0.05, BACK = 2.4;
  const LOCKS = 12, THICK = 0.045, CROWN = Math.PI * 1.5;
  const ramp = (x, a, b) => THREE.MathUtils.smoothstep(x, a, b);
  const hash = (i, j) => { const s = Math.sin(i * 127.1 + j * 311.7) * 43758.5453; return s - Math.floor(s); };
  const along = (r, phi, theta) => new THREE.Vector3(-r * Math.cos(phi) * Math.sin(theta), -r * Math.sin(phi) * Math.sin(theta), r * Math.cos(theta));
  const fringeEdge = (phi, u) => 0.38 + 0.38 * ramp(Math.abs(phi - CROWN), 0.35, 1.25) - 0.17 * Math.max(0, Math.sin(u * Math.PI * LOCKS)) ** 3;
  const body = (phi, th, u, edge) => THICK * ramp(th, edge, edge + 0.08) * (1 - ramp(th, 1.9, BACK)) * ramp(u, 0, 0.05) * ramp(1 - u, 0, 0.05);
  const crop = new THREE.SphereGeometry(R, SEG_W, SEG_H);
  const pos = crop.attributes.position;
  for (let iy = 0, i = 0; iy <= SEG_H; iy++) {
    for (let ix = 0; ix <= SEG_W; ix++, i++) {
      const u = ix / SEG_W, phi = FROM + u * (TO - FROM), edge = fringeEdge(phi, u);
      const th = edge + (iy / SEG_H) * (BACK - edge);
      const p = along(R + body(phi, th, u, edge), phi, th);
      pos.setXYZ(i, p.x, p.y, p.z);
    }
  }
  crop.computeVertexNormals();
  put(crop, hair, [0, 0, 0], top);
  const lean = new THREE.Vector3(0, 0.3, 0.35), yAxis = new THREE.Vector3(0, 1, 0);
  for (const [j, th, count, spread] of [[0, 0.82, 5, 0.95], [1, 1.1, 6, 1.15], [2, 1.42, 6, 1.2], [3, 1.75, 5, 1.05]]) {
    for (let k = 0; k < count; k++) {
      const phi = CROWN + ((k + 0.5) / count - 0.5) * 2 * spread + (hash(j, k) - 0.5) * 0.18;
      const t = th + (hash(k, j) - 0.5) * 0.12, u = (phi - FROM) / (TO - FROM);
      const base = along(R + body(phi, t, u, fringeEdge(phi, u)) - 0.012, phi, t);
      const dir = base.clone().normalize().add(lean).normalize();
      const len = 0.07 + 0.045 * hash(k + 5, j + 9);
      const spike = put(new THREE.ConeGeometry(0.046, len, 10), hair, [0, 0, 0], top, { cast: false });
      spike.quaternion.setFromUnitVectors(yAxis, dir);
      spike.position.copy(base).addScaledVector(dir, len * 0.4);
    }
  }
  // Dark oval eyes with a pinpoint of light, straight brows, a small nose and a short mouth line.
  const iris = toonMat({ color: "#1f1917" });
  const spark = new THREE.MeshBasicMaterial({ color: "#ffffff" });
  const browMat = clay("#231d20");
  const eyes = [];
  for (const s of [-1, 1]) {
    const x = s * 0.083;
    const eye = put(new THREE.SphereGeometry(0.024, 20, 16), iris, [x, -0.002, 0.222], head, { cast: false });
    eye.scale.set(0.85, 1.15, 0.5);
    eyes.push(eye, put(new THREE.SphereGeometry(0.006, 8, 6), spark, [x + 0.007, 0.01, 0.234], head, { cast: false }));
    const brow = put(new THREE.TorusGeometry(0.07, 0.0075, 6, 12, Math.PI * 0.32), browMat, [x, 0.052, 0.214], head, { cast: false });
    brow.rotation.z = Math.PI * 0.34;
  }
  put(new THREE.SphereGeometry(0.022, 12, 10), skin, [0, -0.06, 0.232], head, { cast: false });
  const mouth = put(new THREE.TorusGeometry(0.028, 0.0045, 6, 12, Math.PI * 0.45), clay("#8a5048"), [0, -0.095, 0.206], head, { cast: false });
  mouth.rotation.z = Math.PI * 1.275;
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
  // The same frame showing a pixtuoid office, faded in while the page points at pixtuoid.
  const officeTex = new THREE.TextureLoader().load("/pixtuoid.png");
  officeTex.colorSpace = THREE.SRGBColorSpace;
  officeTex.magFilter = THREE.NearestFilter;
  const officeMat = toonMat({ map: officeTex, transparent: true, opacity: 0 });
  const office = put(new THREE.PlaneGeometry(1.02, 0.68), officeMat, [-0.65, 1.86, backZ + T / 2 + 0.06], room, { cast: false });

  // The turntable on a low cabinet by the door, records leaning beside it.
  put(box(0.95, 0.56, 0.55, 0.05), clay(C.wood), [1.45, 0.28, -1.55]);
  for (const x of [1.22, 1.68]) put(box(0.4, 0.4, 0.02, 0.01), clay(C.woodDark), [x, 0.28, -1.27]);
  put(box(0.6, 0.08, 0.44, 0.03), clay("#f3efe7", 0.6), [1.45, 0.6, -1.55]);
  const platter = new THREE.Group();
  platter.position.set(1.4, 0.655, -1.55);
  room.add(platter);
  put(cyl(0.17, 0.17, 0.015, 48), toonMat({ color: C.record, roughness: 0.3 }), [0, 0, 0], platter);
  const label = put(cyl(0.065, 0.065, 0.018, 32), clay(C.coral), [0, 0.001, 0], platter);
  // The label takes the cover of what Ivan is playing, once the page has asked Spotify.
  const covers = new THREE.TextureLoader();
  let coverUrl = null;
  function showCover(track) {
    if (!track?.cover || track.cover === coverUrl) return;
    coverUrl = track.cover;
    covers.load(coverUrl, (tex) => {
      tex.colorSpace = THREE.SRGBColorSpace;
      label.material = toonMat({ map: tex });
      wake();
    });
  }
  onTrack(showCover);
  put(box(0.04, 0.006, 0.01, 0.002), clay("#fff"), [0.03, 0.011, 0], platter, { cast: false });
  put(box(0.015, 0.015, 0.26, 0.006), rimMat, [1.62, 0.68, -1.52]).rotation.y = 0.45;
  for (const [i, c] of [[0, C.coral], [1, C.sage], [2, C.mustard]]) put(box(0.035, 0.42, 0.42, 0.01), clay(c), [2.02 + i * 0.045, 0.22, -1.05 + i * 0.02]).rotation.z = -0.1;
  // Headphones standing on the sofa's arm, cups down, the band arched between them along the arm.
  const cans = new THREE.Group();
  cans.position.set(0.58, 0.83, -1.02);
  cans.rotation.y = 0.2;
  room.add(cans);
  const shell = clay("#f2efe8"), pad = clay(C.ink);
  for (const s of [-1, 1]) {
    put(cyl(0.05, 0.05, 0.04, 24), shell, [0, 0, s * 0.105], cans).rotation.x = Math.PI / 2;
    put(cyl(0.042, 0.042, 0.022, 24), pad, [0, 0, s * 0.075], cans).rotation.x = Math.PI / 2;
  }
  put(new THREE.TorusGeometry(0.11, 0.013, 8, 32, Math.PI), shell, [0, 0.01, 0], cans).rotation.y = Math.PI / 2;
  // A game controller on the seat beside him, white grips round a black middle.
  const pad1 = new THREE.Group();
  pad1.position.set(-0.82, 0.668, -1.0);
  pad1.rotation.set(0, 0.5, 0);
  room.add(pad1);
  const padWhite = clay("#f4f2ee");
  put(box(0.11, 0.038, 0.075, 0.018), pad, [0, 0.005, 0], pad1);
  for (const s of [-1, 1]) {
    const grip = put(new THREE.CapsuleGeometry(0.024, 0.06, 6, 12), padWhite, [s * 0.068, 0, 0.022], pad1);
    grip.rotation.set(Math.PI / 2 - 0.25, 0, s * 0.45);
    put(cyl(0.011, 0.011, 0.014, 12), pad, [s * 0.03, 0.028, 0.018], pad1, { cast: false });
  }
  // A handheld console on the far arm of the sofa, its two controllers in red and blue.
  const handheld = new THREE.Group();
  handheld.position.set(-1.78, 0.79, -1.08);
  handheld.rotation.set(0, Math.PI / 2 - 0.2, 0);
  room.add(handheld);
  put(box(0.17, 0.014, 0.1, 0.006), pad, [0, 0, 0], handheld);
  put(new THREE.PlaneGeometry(0.14, 0.08), new THREE.MeshBasicMaterial({ color: "#3a4157" }), [0, 0.0075, 0], handheld, { cast: false }).rotation.x = -Math.PI / 2;
  for (const [s, color] of [[-1, "#20b8e6"], [1, "#ff4b3a"]]) put(box(0.04, 0.016, 0.1, 0.012), clay(color), [s * 0.105, 0, 0], handheld);
  // A paper plane, two wings and a keel, that the email link sends from the laptop out of the door.
  const dart = new THREE.BufferGeometry().setAttribute("position", new THREE.Float32BufferAttribute([
    0, 0, 0.12, -0.075, 0, -0.06, 0, 0, -0.04,
    0, 0, 0.12, 0, 0, -0.04, 0.075, 0, -0.06,
    0, 0, 0.12, 0, -0.035, -0.05, 0, 0, -0.04,
  ], 3));
  dart.computeVertexNormals();
  const paperPlane = new THREE.Mesh(dart, toonMat({ color: "#fbf8f1", side: THREE.DoubleSide }));
  paperPlane.scale.setScalar(1.8);
  paperPlane.visible = false;
  room.add(paperPlane);
  const doorX = (door.left + door.right) / 2;
  // Seen isometrically, height and nearness cancel on screen, so it climbs first, crosses the room
  // to the right, then dips through the door; the leg outside is short, since the view hides it.
  const flight = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-0.05, 1.12, -0.85), new THREE.Vector3(0.6, 2.1, -1.0), new THREE.Vector3(1.3, 2.0, -1.7),
    new THREE.Vector3(doorX, 1.5, backZ + 0.12), new THREE.Vector3(doorX + 0.05, 1.6, backZ - 0.5),
  ]);

  // Glyphs that drift up and fade: the record's notes, and a sleeper's z's.
  function drifters(ch, font, color, count) {
    const c = document.createElement("canvas");
    c.width = c.height = 64;
    const g = c.getContext("2d");
    g.fillStyle = "#fff"; g.font = font; g.textAlign = "center"; g.textBaseline = "middle";
    g.fillText(ch, 32, 34);
    const map = new THREE.CanvasTexture(c);
    return Array.from({ length: count }, (_, i) => {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map, color, transparent: true, depthWrite: false, toneMapped: false }));
      s.scale.setScalar(NOTE_SIZE);
      room.add(s);
      return { s, phase: i / count };
    });
  }
  const NOTE_SIZE = 0.15;
  const notes = drifters("♪", "52px serif", "#ffcf86", 4);
  const zs = drifters("z", "bold 46px sans-serif", "#dfe4ff", 3);

  // Each visit finds him doing one of four things, picked at random: at the laptop, listening on
  // his headphones, asleep on the sofa, or pacing the rug. Listening needs a song playing, so it
  // waits on the song line and gives way to one of the others when nothing plays.
  const DOINGS = ["computer", "music", "sleep", "walk"];
  const SEAT = me.position.clone(), LID_OPEN = lid.rotation.x, LID_SHUT = Math.PI / 2;
  // Standing, his soles meet the rug: the hip's height less the thigh, the shin and the sole.
  const STAND_Y = RUG_TOP + (THIGH + 0.635 - 0.06) * me.scale.y;
  const LOOP = { x: -0.15, z: 0.12, rx: 0.75, rz: 0.5 }, PACE = 0.35, STRIDE = 0.5;
  let doing = "computer", lidOpen = 1;
  function become(next) {
    doing = next;
    lidOpen = next === "computer" || next === "walk" ? 1 : 0;
    if (next === "music") {
      head.add(cans);
      cans.position.set(0, 0.03, -0.01);
      cans.rotation.set(0, Math.PI / 2, 0);
      cans.scale.setScalar(2.35);
    }
    if (next === "sleep") for (const e of eyes) e.scale.y *= 0.12;
    if (next === "walk") {
      // He left the laptop open on the seat, facing the room.
      room.add(laptop);
      laptop.position.set(SEAT.x, 0.66, SEAT.z + 0.07);
      laptop.rotation.set(0, 0, 0);
      laptop.scale.setScalar(me.scale.x);
    }
    contactStale = true;
    wake();
  }
  const pick = (from) => from[Math.floor(Math.random() * from.length)];
  const picked = pick(DOINGS);
  let waiting = picked === "music";
  // The song line asks again each minute; only its first answer decides.
  if (waiting) onTrack((track) => {
    if (!waiting) return;
    waiting = false;
    const next = track?.playing ? "music" : pick(DOINGS.filter((d) => d !== "music"));
    if (next !== "computer") become(next);
  });
  else if (picked !== "computer") queueMicrotask(() => become(picked));
  // Poses him for what he's doing at time `t`, still when `calm`.
  function act(t, calm) {
    const sides = [-1, 1];
    if (doing === "walk") {
      const at = calm ? 1 : (t * PACE) / 0.64, gait = calm ? 0 : ((t * PACE) / STRIDE) * Math.PI * 2;
      me.position.set(LOOP.x + LOOP.rx * Math.cos(at), STAND_Y + 0.012 * Math.abs(Math.cos(gait)), LOOP.z + LOOP.rz * Math.sin(at));
      me.rotation.y = Math.atan2(-LOOP.rx * Math.sin(at), LOOP.rz * Math.cos(at));
      sides.forEach((s, i) => {
        const swing = 0.42 * Math.sin(gait + i * Math.PI), bend = 0.55 * Math.max(0, Math.cos(gait + i * Math.PI));
        pose(hips[i], knees[i], [s * 0.01, -Math.cos(swing), Math.sin(swing)], [s * 0.01, -Math.cos(swing - bend), Math.sin(swing - bend)]);
        const arm = -0.35 * Math.sin(gait + i * Math.PI);
        pose(shoulders[i], elbows[i], [s * 0.06, -Math.cos(arm), Math.sin(arm)], [s * 0.02, -Math.cos(arm + 0.35), Math.sin(arm + 0.35)]);
      });
      head.rotation.set(0.04, 0, 0);
      if (!calm) contactStale = true;
      return;
    }
    sides.forEach((s, i) => pose(hips[i], knees[i], [s * 0.01, 0, THIGH], [s * 0.01, -0.48, 0.06]));
    if (doing === "computer") {
      const typing = calm ? 0 : (1 - attention.hello) * (0.5 + 0.5 * Math.sin(t * 0.8)) * 0.05;
      sides.forEach((s, i) => {
        pose(shoulders[i], elbows[i], [s * 0.05, -0.22, 0.13], [s * -0.12, 0, 0.25]);
        elbows[i].rotateX(Math.sin(t * 11 + i * 1.7) * typing);
      });
      if (calm) head.rotation.set(0.04, 0.34, 0);
      else head.rotation.set(0.04 + Math.sin(t * 0.7) * 0.025, 0.34 + Math.sin(t * 0.31) * 0.12, Math.sin(t * 0.5) * 0.03);
    } else if (doing === "music") {
      sides.forEach((s, i) => pose(shoulders[i], elbows[i], [s * 0.04, -0.24, 0.1], [s * -0.05, -0.1, 0.25]));
      head.rotation.set(0.06 + (calm ? 0 : 0.09 * Math.max(0, Math.sin(t * Math.PI * 3.2))), 0.12, 0);
    } else {
      sides.forEach((s, i) => pose(shoulders[i], elbows[i], [s * 0.04, -0.25, 0.07], [s * -0.08, -0.14, 0.22]));
      head.rotation.set(0.36, 0.15, 0.32);
    }
  }
  // A sleeper's z's rise from beside his head.
  const zAt = new THREE.Vector3();
  function snore(t, calm) {
    const asleep = doing === "sleep";
    if (asleep) room.worldToLocal(head.localToWorld(zAt.set(0.22, 0.25, 0)));
    for (const z of zs) {
      const k = calm ? z.phase : (t * 0.3 + z.phase) % 1;
      z.s.visible = asleep;
      z.s.position.set(zAt.x + k * 0.18, zAt.y + k * 0.45, zAt.z);
      z.s.material.opacity = asleep ? Math.sin(k * Math.PI) * 0.85 : 0;
    }
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
  const flash = new THREE.PointLight("#fff4dc", 0, 2.4, 2);
  flash.position.set(0, 0.05, 0.2);
  cam.add(flash);
  put(new THREE.IcosahedronGeometry(0.12, 2), clay(C.leaf), [0.04, 1.27, 0.38], shelf);
  put(cyl(0.075, 0.06, 0.13), clay(C.pot), [0.04, 1.17, 0.38], shelf);

  // The floor lamp, warm at night. It stands as far from each wall as from the other, so the
  // light it throws on the two is one shape mirrored across the corner.
  const LAMP_FROM_WALLS = 0.2;
  const lampX = sideX + T / 2 + LAMP_FROM_WALLS, lampZ = backZ + T / 2 + LAMP_FROM_WALLS;
  put(cyl(0.15, 0.17, 0.04), clay(C.ink, 0.5), [lampX, 0.02, lampZ]);
  put(cyl(0.018, 0.018, 1.7, 12), clay(C.ink, 0.5), [lampX, 0.87, lampZ]);
  const shadeMat = toonMat({ color: "#f7e6c6", roughness: 0.9, side: THREE.DoubleSide, emissive: new THREE.Color("#ffb560"), emissiveIntensity: 0 });
  put(new THREE.CylinderGeometry(0.15, 0.27, 0.3, 40, 1, true), shadeMat, [lampX, 1.82, lampZ]);
  const lamp = new THREE.PointLight("#ffb56b", 0, 5.5, 1.5);
  // The bulb sits inside the shade, which throws its light up and down, as a shade does.
  lamp.position.set(lampX, 1.78, lampZ);
  lamp.castShadow = true;
  lamp.shadow.mapSize.set(512, 512);
  lamp.shadow.radius = 6;
  room.add(lamp);

  // A plant in the front corner, and dust turning in the sunlight.
  put(cyl(0.2, 0.15, 0.36), clay(C.pot), [-1.9, 0.18, 1.55]);
  for (const [x, y, z, s] of [[-1.9, 0.62, 1.55, 0.24], [-2.0, 0.84, 1.6, 0.17], [-1.8, 0.8, 1.48, 0.18], [-1.92, 1.0, 1.52, 0.14]]) put(new THREE.IcosahedronGeometry(s, 2), clay(C.sage), [x, y, z]);

  // His road bike in the open corner, a steel paint with drop bars, its back axle held by a stand
  // since a road bike has no kickstand. The bike is drawn along local x, front wheel forward.
  const bike = new THREE.Group();
  bike.position.set(1.4, 0, 1.15);
  bike.rotation.y = 0.25;
  room.add(bike);
  const WHEEL = 0.34, black = clay(C.ink), paint = clay(C.coral);
  const rear = [-0.5, WHEEL, 0], front = [0.5, WHEEL, 0], bb = [-0.06, 0.3, 0], seat = [-0.2, 0.8, 0];
  const headTop = [0.36, 0.82, 0], headLow = [0.4, 0.68, 0];
  for (const hub of [rear, front]) {
    put(new THREE.TorusGeometry(WHEEL - 0.024, 0.024, 10, 56), black, hub, bike);
    put(new THREE.TorusGeometry(WHEEL - 0.055, 0.008, 6, 56), rimMat, hub, bike, { cast: false });
    put(cyl(0.022, 0.022, 0.09, 12), rimMat, hub, bike, { cast: false }).rotation.x = Math.PI / 2;
  }
  for (const [a, b] of [[bb, seat], [seat, headTop], [bb, headLow]]) limb(a, b, 0.019, paint, bike);
  limb(headLow, headTop, 0.024, paint, bike);
  for (const s of [-1, 1]) {
    const axle = [rear[0], rear[1], s * 0.045];
    limb(bb, axle, 0.013, paint, bike);
    limb(seat, axle, 0.012, paint, bike);
    limb(headLow, [front[0], front[1], s * 0.045], 0.013, paint, bike);
    for (const dx of [-0.16, 0.16]) limb([rear[0], rear[1], s * 0.07], [rear[0] + dx, 0.01, s * 0.2], 0.01, black, bike);
  }
  limb(seat, [-0.23, 0.92, 0], 0.012, rimMat, bike);
  put(box(0.2, 0.035, 0.085, 0.015), black, [-0.25, 0.94, 0], bike).rotation.z = 0.05;
  limb(headTop, [0.45, 0.86, 0], 0.013, rimMat, bike);
  limb([0.45, 0.86, -0.19], [0.45, 0.86, 0.19], 0.012, black, bike);
  for (const s of [-1, 1]) {
    const z = s * 0.19;
    limb([0.45, 0.86, z], [0.53, 0.81, z], 0.012, black, bike);
    limb([0.53, 0.81, z], [0.5, 0.72, z], 0.012, black, bike);
    limb([0.5, 0.72, z], [0.43, 0.72, z], 0.012, black, bike);
  }
  put(cyl(0.09, 0.09, 0.012, 32), rimMat, [bb[0], bb[1], 0.06], bike, { cast: false }).rotation.x = Math.PI / 2;
  for (const s of [-1, 1]) {
    const crank = put(box(0.022, 0.17, 0.016, 0.006), rimMat, [bb[0] + s * 0.05, bb[1] - s * 0.06, s * 0.075], bike, { cast: false });
    crank.rotation.z = s * 0.7;
    put(box(0.08, 0.018, 0.06, 0.006), black, [bb[0] + s * 0.1, bb[1] - s * 0.12, s * 0.11], bike);
  }
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

  // Contact shadows, so what stands on the floor sits on it: the room seen from just above the
  // rug, looking up, its depth darkened and blurred onto the floor (three.js's
  // webgl_shadow_contact example). Only what stands within GROUNDED of the floor darkens it.
  const CONTACT_PX = 1024, GROUNDED = 0.45;
  const contactTarget = new THREE.WebGLRenderTarget(CONTACT_PX, CONTACT_PX);
  const contactBlurTarget = new THREE.WebGLRenderTarget(CONTACT_PX, CONTACT_PX);
  contactTarget.texture.generateMipmaps = contactBlurTarget.texture.generateMipmaps = false;
  const contact = new THREE.Group();
  // Just above the rug, so the rug and the floor lie behind the camera and darken nothing.
  contact.position.y = RUG_TOP + 0.0005;
  room.add(contact);
  const contactPlaneGeo = new THREE.PlaneGeometry(W, D).rotateX(Math.PI / 2);
  const contactPlane = new THREE.Mesh(contactPlaneGeo, new THREE.MeshBasicMaterial({ map: contactTarget.texture, transparent: true, depthWrite: false, opacity: 0.5 }));
  contactPlane.renderOrder = 1;
  contactPlane.scale.y = -1;
  contact.add(contactPlane);
  const blurPlane = new THREE.Mesh(contactPlaneGeo);
  blurPlane.visible = false;
  contact.add(blurPlane);
  const contactCamera = new THREE.OrthographicCamera(-W / 2, W / 2, D / 2, -D / 2, 0, GROUNDED);
  contactCamera.rotation.x = Math.PI / 2;
  contact.add(contactCamera);
  const contactDepth = new THREE.MeshDepthMaterial({ depthTest: false, depthWrite: false });
  contactDepth.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      "gl_FragColor = vec4( vec3( 1.0 - fragCoordZ ), opacity );",
      "gl_FragColor = vec4( vec3( 0.0 ), 1.0 - fragCoordZ );"
    );
  };
  const blurH = new THREE.ShaderMaterial({ ...HorizontalBlurShader, uniforms: THREE.UniformsUtils.clone(HorizontalBlurShader.uniforms), depthTest: false });
  const blurV = new THREE.ShaderMaterial({ ...VerticalBlurShader, uniforms: THREE.UniformsUtils.clone(VerticalBlurShader.uniforms), depthTest: false });
  function blurContact(texels) {
    blurPlane.visible = true;
    blurPlane.material = blurH;
    blurH.uniforms.tDiffuse.value = contactTarget.texture;
    blurH.uniforms.h.value = texels / CONTACT_PX;
    renderer.setRenderTarget(contactBlurTarget);
    renderer.render(blurPlane, contactCamera);
    blurPlane.material = blurV;
    blurV.uniforms.tDiffuse.value = contactBlurTarget.texture;
    blurV.uniforms.v.value = texels / CONTACT_PX;
    renderer.setRenderTarget(contactTarget);
    renderer.render(blurPlane, contactCamera);
    blurPlane.visible = false;
  }
  // The room is still but for its small loops, so the shadows are drawn once, and again only
  // when what stands on the floor moves.
  let contactStale = true;
  function drawContact() {
    const clearAlpha = renderer.getClearAlpha();
    contactPlane.visible = dust.visible = false;
    scene.overrideMaterial = contactDepth;
    renderer.setClearAlpha(0);
    renderer.setRenderTarget(contactTarget);
    renderer.render(scene, contactCamera);
    scene.overrideMaterial = null;
    // The example's two passes: the second, at 0.4 of the first, clears the first's artifacts.
    blurContact(3);
    blurContact(1.2);
    renderer.setRenderTarget(null);
    renderer.setClearAlpha(clearAlpha);
    contactPlane.visible = dust.visible = true;
    contactStale = false;
  }

  // Light.
  const hemi = new THREE.HemisphereLight("#fff3e3", "#d2aa82", 0.9);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight("#ffd9a6", 3);
  sun.position.set(2.6, 4.2, -6.5);
  sun.target.position.set(0.2, 0, 0.3);
  scene.add(sun.target);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  // Edges blurred over a few texels; three.js warns high values band, so the map stays large.
  sun.shadow.radius = 3;
  sun.shadow.bias = -0.0005;
  sun.shadow.normalBias = 0.02;
  scene.add(sun);
  // The shadow's frustum hugs the room's bounding sphere, so every texel lands on the room
  // however far the room leans toward the pointer.
  sun.updateMatrixWorld();
  sun.target.updateMatrixWorld();
  sun.shadow.updateMatrices(sun);
  const roomSphere = new THREE.Box3().setFromObject(room).getBoundingSphere(new THREE.Sphere());
  const roomInLight = roomSphere.center.clone().applyMatrix4(sun.shadow.camera.matrixWorldInverse);
  const reach = roomSphere.radius;
  Object.assign(sun.shadow.camera, {
    left: roomInLight.x - reach, right: roomInLight.x + reach, top: roomInLight.y + reach, bottom: roomInLight.y - reach,
    near: Math.max(0.1, -roomInLight.z - reach), far: -roomInLight.z + reach,
  });
  sun.shadow.camera.updateProjectionMatrix();
  const fill = new THREE.DirectionalLight("#cfd9ff", 0.5);
  fill.position.set(6, 5, 6);
  scene.add(fill);

  let glowBase = 0;
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
    glowBase = night ? 1.2 : 0.2;
    dust.visible = !night;
    ink.uniforms.color.value.set(night ? "#17142a" : "#2a2236");
  }
  applyTheme();

  // Motion.
  let aim = 0, look = 0, aimY = 0, lookY = 0, frame = 0, visible = true, shown = false;
  // The page's links point into the room: hovering or focusing one turns the room toward the
  // thing it belongs to. GitHub lights the laptop on his face, Instagram has the camera turn
  // and fire, LinkedIn has him look up, Email sends a paper plane out of the door, the song line
  // swells the record's notes, and pixtuoid puts its office in the picture frame.
  const attention = { laptop: 0, camera: 0, hello: 0, mail: 0, record: 0, pixtuoid: 0 };
  const FLIGHT_MS = 1600;
  let pointing = null, flashAt = -Infinity, sentAt = -Infinity;
  // What is pointed at is asked of the page, not tracked from enter and leave events: a scroll
  // moves links out from under a still mouse and some browsers send no leave for it. The mouse's
  // spot is hit-tested on every move and scroll, and a touch never hovers. Focus counts only while
  // the last input was a key: a tapped or clicked link keeps focus, Safari hands it back on a
  // return from another page, and :focus-visible's guess about that differs between browsers.
  let px = -1, py = -1, keyed = false;
  const launch = new THREE.Vector3();
  function aimAt() {
    const hovered = px < 0 ? null : document.elementFromPoint(px, py)?.closest("[data-room]");
    const focused = keyed ? document.activeElement?.closest("[data-room]") : null;
    const next = (hovered ?? focused)?.dataset.room ?? null;
    if (next === pointing) return;
    if (next === "camera") flashAt = performance.now();
    if (next === "mail") {
      // The plane leaves from wherever the laptop is.
      sentAt = performance.now();
      flight.points[0].copy(room.worldToLocal(lid.localToWorld(launch.set(0, 0.2, 0))));
      flight.updateArcLengths();
    }
    pointing = next;
    wake();
  }
  addEventListener("focusin", aimAt);
  addEventListener("focusout", () => setTimeout(aimAt));
  addEventListener("keydown", () => { keyed = true; }, true);
  addEventListener("pointerdown", () => { keyed = false; aimAt(); }, true);
  addEventListener("pageshow", () => { keyed = false; aimAt(); });
  document.documentElement.addEventListener("pointerleave", () => { px = py = -1; aimAt(); });
  const lerp = THREE.MathUtils.lerp;
  // A sideways drag turns the room like a model on a turntable, as far as SPIN_MAX either way;
  // let go and it settles back.
  const SPIN_MAX = 0.6;
  let spin = 0, spinTo = 0, dragX = null, dragFrom = 0;
  canvas.addEventListener("pointerdown", (e) => {
    dragX = e.clientX;
    dragFrom = spinTo;
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener("pointermove", (e) => {
    if (dragX === null) return;
    spinTo = THREE.MathUtils.clamp(dragFrom + ((e.clientX - dragX) / canvas.clientWidth) * Math.PI, -SPIN_MAX, SPIN_MAX);
    wake();
  });
  const release = () => { dragX = null; spinTo = 0; wake(); };
  canvas.addEventListener("pointerup", release);
  canvas.addEventListener("pointercancel", release);
  // While a link points into the room, a dotted leader runs from it to its thing, redrawn each
  // frame since the room sways with the pointer. It fades with the attention that drew it.
  const leader = document.querySelector(".leader");
  const trails = leader ? [...leader.querySelectorAll("path")] : [], dots = leader ? [...leader.querySelectorAll("circle")] : [];
  const pointers = new Map([...document.querySelectorAll("[data-room]")].map((el) => [el.dataset.room, el]));
  const anchor = new THREE.Vector3();
  const anchors = {
    laptop: () => lid.localToWorld(anchor.set(0, 0.2, 0)),
    camera: () => cam.localToWorld(anchor.set(0, 0, 0)),
    hello: () => head.localToWorld(anchor.set(0, 0.02, 0.22)),
    mail: () => room.localToWorld(anchor.set(doorX, 1.45, backZ)),
    record: () => platter.localToWorld(anchor.set(0, 0.02, 0)),
    pixtuoid: () => office.localToWorld(anchor.set(0, -0.3, 0)),
  };
  let last = null;
  const onScreen = (x, y) => x >= 0 && x <= innerWidth && y >= 0 && y <= innerHeight;
  // A leader is drawn only where it can cross no words and no other link. A project's picture
  // rises straight from its top edge into the room. A link beside the room steps into the lane
  // next to its group (above it from the top row, below it from any lower row, so it never
  // passes another row), runs right along that lane to the room's edge, then turns to the thing.
  // Where the room sits above the links any leader would cut through them, so the room's own
  // reaction is the whole answer there; and nothing is drawn with either end off screen.
  const LANE = 10, BEND = 6;
  function route(el, tx, ty, cr) {
    const figure = el.querySelector("figure");
    if (figure) {
      const r = figure.getBoundingClientRect(), sx = r.left + r.width / 2, sy = r.top - BEND;
      if (!onScreen(sx, sy)) return null;
      const my = (sy + ty) / 2;
      return `M${sx} ${sy}C${sx} ${my} ${tx} ${my} ${tx} ${ty}`;
    }
    const link = el.matches("a") ? el : el.querySelector("a");
    const r = link.getBoundingClientRect();
    if (cr.left <= r.right) return null;
    const group = (link.closest(".social, .listening") ?? link).getBoundingClientRect();
    const topRow = r.top - group.top < r.height / 2, dir = topRow ? -1 : 1;
    const sx = r.left + r.width / 2, sy = topRow ? r.top : r.bottom;
    const gy = topRow ? group.top - LANE : group.bottom + LANE, gx = cr.left;
    if (!onScreen(sx, sy)) return null;
    return `M${sx} ${sy}L${sx} ${gy - dir * BEND}Q${sx} ${gy} ${sx + BEND} ${gy}L${gx} ${gy}C${(gx + tx) / 2} ${gy} ${tx} ${(gy + ty) / 2} ${tx} ${ty}`;
  }
  function placeLeader() {
    if (!leader) return;
    if (pointing) last = pointing;
    const a = last ? attention[last] : 0;
    leader.style.opacity = a.toFixed(3);
    if (a < 0.01) return;
    const el = pointers.get(last), cr = canvas.getBoundingClientRect();
    const v = anchors[last]().project(camera);
    const tx = cr.left + ((v.x + 1) / 2) * cr.width, ty = cr.top + ((1 - v.y) / 2) * cr.height;
    const d = onScreen(tx, ty) ? route(el, tx, ty, cr) : null;
    if (!d) {
      leader.style.opacity = "0";
      return;
    }
    for (const path of trails) path.setAttribute("d", d);
    for (const c of dots) { c.setAttribute("cx", tx); c.setAttribute("cy", ty); }
  }
  // A scroll changes nothing in the room, only where the leader's ends sit on screen.
  addEventListener("scroll", () => { aimAt(); if (!frame) placeLeader(); }, { passive: true });
  function react(now, calm) {
    // Between frames nothing eases, so with the loop stopped a change lands whole, never stuck halfway.
    const ease = calm || !running() ? 1 : 0.14;
    for (const k in attention) attention[k] += ((pointing === k ? 1 : 0) - attention[k]) * ease;
    const { laptop: l, camera: c, hello: h, pixtuoid: p } = attention;
    // GitHub opens a shut laptop as it lights it.
    lid.rotation.x = lerp(LID_SHUT, LID_OPEN, Math.max(lidOpen, l));
    screenGlow.intensity = lidOpen * glowBase + 2.4 * l;
    cam.rotation.y = 0.8 - 0.55 * c;
    cam.position.y = 1.2 + 0.05 * c;
    flash.intensity = calm ? 0 : 7 * Math.max(0, 1 - (now - flashAt) / 380) ** 2;
    head.rotation.x = lerp(head.rotation.x, -0.24, h);
    head.rotation.y = lerp(head.rotation.y, 0.75, h);
    head.rotation.z = lerp(head.rotation.z, 0, h);
    officeMat.opacity = p;
    for (const n of notes) n.s.scale.setScalar(NOTE_SIZE * (1 + 0.7 * attention.record));
    // In flight the plane eases along its path nose first, rocking; held still, it waits on the laptop.
    const flown = (now - sentAt) / FLIGHT_MS;
    paperPlane.visible = calm ? attention.mail > 0.5 : flown > 0 && flown < 1;
    if (paperPlane.visible) {
      const u = calm ? 0 : flown * flown * (3 - 2 * flown);
      flight.getPointAt(u, paperPlane.position);
      flight.getTangentAt(u, heading);
      paperPlane.lookAt(room.localToWorld(heading.add(paperPlane.position)));
      if (!calm) paperPlane.rotateZ(Math.sin(flown * 9) * 0.35);
    }
  }
  const heading = new THREE.Vector3();
  const t0 = performance.now();
  const dustBase = dust.geometry.attributes.position.array.slice();
  addEventListener("pointermove", (e) => {
    aim = (e.clientX / innerWidth - 0.5) * 2;
    aimY = (e.clientY / innerHeight - 0.5) * 2;
    if (e.pointerType === "touch") return;
    px = e.clientX;
    py = e.clientY;
    aimAt();
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
    const calm = !motion.on;
    const t = calm ? 0 : (now - t0) / 1000;
    spin += (spinTo - spin) * (calm ? 1 : 0.12);
    if (!calm) {
      look += (aim - look) * 0.04;
      lookY += (aimY - lookY) * 0.04;
      room.rotation.y = look * 0.1 + spin;
      room.rotation.x = lookY * 0.03;
      torso.scale.y = 1 + Math.sin(t * (doing === "sleep" ? 0.9 : 1.6)) * 0.015;
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
      room.rotation.set(0, spin, 0);
      for (const n of notes) n.s.material.opacity = 0;
    }
    act(t, calm);
    snore(t, calm);
    react(now, calm);
    if (contactStale) drawContact();
    renderer.render(scene, camera);
    placeLeader();
    if (!shown) { shown = true; canvas.classList.add("ready"); }
  }

  const running = () => visible && !document.hidden && motion.on;
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
  motion.subscribe(wake);
  dark.addEventListener("change", () => { applyTheme(); draw(); });
  new ResizeObserver(() => draw()).observe(canvas);
  wake();
}
