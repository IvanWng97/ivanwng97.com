// Ivan's corner at dusk, built from primitives and drawn like the avatar: flat
// toon light under ink outlines. Sofa and laptop, pixtuoid's office playing in
// a frame on the wall, a turntable, a bookshelf with a camera, the balcony door.
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";

const canvas = document.getElementById("scene");
const video = document.getElementById("feed");
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
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(28, 1, 0.1, 100);
  camera.position.set(10.6, 8.2, 12.3);
  camera.lookAt(-0.3, 0.8, -0.3);

  // Three bands of light, like a cel painting.
  const bands = new THREE.DataTexture(new Uint8Array([96, 170, 255]), 3, 1, THREE.RedFormat);
  bands.minFilter = bands.magFilter = THREE.NearestFilter;
  bands.needsUpdate = true;

  const ink = new THREE.ShaderMaterial({
    uniforms: { width: { value: 0.016 }, color: { value: new THREE.Color("#1c1830") } },
    vertexShader: `uniform float width;
      void main() {
        vec3 p = position + normal * width;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
      }`,
    fragmentShader: `uniform vec3 color; void main() { gl_FragColor = vec4(color, 1.0); }`,
    side: THREE.BackSide,
  });

  const room = new THREE.Group();
  scene.add(room);

  const toon = (color) => new THREE.MeshToonMaterial({ color, gradientMap: bands });

  function part(geometry, material, at, parent = room, { outline = true, shadow = true } = {}) {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(...at);
    mesh.castShadow = shadow;
    mesh.receiveShadow = true;
    if (outline) mesh.add(new THREE.Mesh(geometry, ink));
    parent.add(mesh);
    return mesh;
  }
  const box = (w, h, d, r = 0.04) => new RoundedBoxGeometry(w, h, d, 3, Math.min(r, w / 2, h / 2, d / 2));
  const cyl = (r, h, s = 32) => new THREE.CylinderGeometry(r, r, h, s);

  // Palette: the room by night and by day share every hue but the walls.
  const C = {
    floor: "#b9875b", rug: "#e2b04a", wallNight: "#3b3566", wallDay: "#efe5d6",
    sofa: "#2f6f73", cushion: "#3d8a8e", skin: "#f1c6a4", hair: "#1f1a22",
    tee: "#2b2a33", pants: "#4a5068", wood: "#8a5a3b", dark: "#25222f",
    metal: "#c9c6d6", record: "#17151d", label: "#e85d5d", leaf: "#5f9e6e", pot: "#d9a07a",
    books: ["#e07a5f", "#3d405b", "#81b29a", "#f2cc8f", "#6d597a", "#e8e1d1", "#4d7ea8"],
  };

  // Floor, walls, rug.
  part(box(6.2, 0.24, 5.2, 0.06), toon(C.floor), [0, -0.12, 0]);
  const wallMat = toon(C.wallNight);
  part(box(6.2, 3.3, 0.22, 0.05), wallMat, [0, 1.53, -2.6]);
  part(box(0.22, 3.3, 5.2, 0.05), wallMat, [-3.1, 1.53, 0]);
  part(new THREE.CylinderGeometry(1.45, 1.45, 0.03, 48), toon(C.rug), [-0.3, 0.015, -0.35], room, { shadow: false });

  // The balcony door: a glass that shows the sky and the city past the railing.
  const glass = new THREE.ShaderMaterial({
    uniforms: { night: { value: 1 }, time: { value: 0 } },
    vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `
      varying vec2 vUv; uniform float night; uniform float time;
      float hash(vec2 p) { return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5453); }
      void main() {
        vec3 dayTop = vec3(0.62, 0.78, 0.95), dayLow = vec3(1.0, 0.86, 0.68);
        vec3 nightTop = vec3(0.06, 0.06, 0.20), nightLow = vec3(0.55, 0.30, 0.45);
        vec3 sky = mix(mix(dayLow, dayTop, vUv.y), mix(nightLow, nightTop, vUv.y), night);
        float col = floor(vUv.x * 14.0);
        float h = 0.28 + 0.22 * hash(vec2(col, 1.0));
        float town = step(vUv.y, h);
        vec3 bldg = mix(vec3(0.55, 0.58, 0.70), vec3(0.10, 0.10, 0.22), night);
        vec2 win = vec2(floor(vUv.x * 70.0), floor(vUv.y * 60.0));
        float lit = step(0.72, hash(win)) * night * town * step(vUv.y, h - 0.02);
        vec3 c = mix(sky, bldg, town) + lit * vec3(1.0, 0.8, 0.45);
        float star = step(0.997, hash(floor(vUv * 220.0))) * night * (1.0 - town);
        c += star;
        float rail = step(abs(vUv.y - 0.2), 0.008) + step(0.97, fract(vUv.x * 9.0)) * step(vUv.y, 0.2);
        c = mix(c, vec3(0.11, 0.09, 0.18), clamp(rail, 0.0, 1.0));
        gl_FragColor = vec4(c, 1.0);
      }`,
  });
  part(new THREE.PlaneGeometry(1.5, 2.25), glass, [1.25, 1.2, -2.48], room, { outline: false, shadow: false });
  const frameMat = toon(C.dark);
  for (const [w, h, x, y] of [[1.7, 0.1, 1.25, 2.36], [1.7, 0.1, 1.25, 0.06], [0.1, 2.35, 0.43, 1.2], [0.1, 2.35, 2.07, 1.2], [0.06, 2.25, 1.25, 1.2]]) {
    part(box(w, h, 0.08, 0.02), frameMat, [x, y, -2.45]);
  }
  // A plant by the door.
  part(cyl(0.18, 0.32), toon(C.pot), [2.45, 0.16, -2.05]);
  for (const [x, y, z, s] of [[2.45, 0.55, -2.05, 0.22], [2.32, 0.72, -2.0, 0.16], [2.58, 0.68, -2.12, 0.17]]) {
    part(new THREE.IcosahedronGeometry(s, 1), toon(C.leaf), [x, y, z]);
  }

  // The sofa.
  const sofa = toon(C.sofa), cushion = toon(C.cushion);
  part(box(2.5, 0.42, 1.0, 0.1), sofa, [-0.55, 0.3, -1.45]);
  part(box(2.5, 0.75, 0.28, 0.12), sofa, [-0.55, 0.85, -1.85]);
  part(box(0.28, 0.62, 1.0, 0.12), sofa, [-1.82, 0.52, -1.45]);
  part(box(0.28, 0.62, 1.0, 0.12), sofa, [0.72, 0.52, -1.45]);
  part(box(1.12, 0.18, 0.82, 0.08), cushion, [-1.12, 0.6, -1.38]);
  part(box(1.12, 0.18, 0.82, 0.08), cushion, [0.02, 0.6, -1.38]);
  part(box(0.5, 0.42, 0.18, 0.09), toon(C.rug), [-1.35, 0.92, -1.66]).rotation.z = 0.25;

  // Ivan, on the right cushion with the laptop on his lap.
  const me = new THREE.Group();
  me.position.set(0.05, 0.69, -1.42);
  room.add(me);
  const skin = toon(C.skin), tee = toon(C.tee), pants = toon(C.pants), hair = toon(C.hair);
  const torso = part(new THREE.CapsuleGeometry(0.23, 0.32, 6, 16), tee, [0, 0.42, -0.06], me);
  torso.rotation.x = -0.18;
  // A Memoji's proportions: the head carries the likeness, so it's drawn large.
  const head = new THREE.Group();
  head.position.set(0, 1.0, -0.02);
  head.scale.setScalar(1.25);
  me.add(head);
  // A round face with a full jaw, his own shape.
  part(new THREE.SphereGeometry(0.21, 32, 24), skin, [0, 0.02, 0], head).scale.set(1.0, 1.02, 0.95);
  part(new THREE.SphereGeometry(0.2, 32, 24), skin, [0, -0.07, 0.01], head).scale.set(1.04, 0.78, 0.94);
  for (const x of [-0.205, 0.205]) part(new THREE.SphereGeometry(0.045, 12, 10), skin, [x, -0.01, -0.02], head).scale.set(0.6, 1, 1);
  // Black hair parted three-to-seven: the part on his right, the swept side lifting over his left.
  // The cap tips back so the hairline sits above the brows and the back covers low.
  const cap = part(new THREE.SphereGeometry(0.225, 32, 20, 0, Math.PI * 2, 0, Math.PI * 0.46), hair, [0, 0.05, -0.03], head);
  cap.scale.set(1.04, 1.0, 1.06);
  cap.rotation.x = -0.42;
  const sweep = part(new THREE.SphereGeometry(0.13, 24, 16), hair, [0.05, 0.215, 0.06], head);
  sweep.scale.set(1.35, 0.5, 1.0);
  sweep.rotation.set(0.35, 0, -0.22);
  part(new THREE.SphereGeometry(0.075, 16, 12), hair, [0.15, 0.17, 0.08], head).scale.set(1.1, 0.65, 1.0);
  part(new THREE.SphereGeometry(0.06, 16, 12), hair, [-0.12, 0.19, 0.08], head).scale.set(1.0, 0.5, 0.9);
  for (const x of [-0.205, 0.205]) part(new THREE.SphereGeometry(0.055, 12, 10), hair, [x, 0.07, -0.07], head).scale.set(0.5, 1.1, 1.2);
  // Pointed bangs falling toward the swept side, as on his Memoji.
  for (const [x, y, z, tilt] of [[-0.03, 0.15, 0.17, 0.75], [0.05, 0.14, 0.18, 0.6], [0.12, 0.13, 0.16, 0.45]]) {
    const bang = part(new THREE.ConeGeometry(0.045, 0.13, 12), hair, [x, y, z], head, { outline: false });
    bang.rotation.set(-0.35, 0, Math.PI - tilt);
  }
  // His Memoji's face: big eyes, thick brows, a small smile, a little blush.
  const inkFlat = new THREE.MeshBasicMaterial({ color: "#1c1830" });
  const white = new THREE.MeshBasicMaterial({ color: "#fbfaf7" });
  for (const x of [-0.072, 0.072]) {
    part(new THREE.SphereGeometry(0.034, 14, 10), white, [x, 0.005, 0.178], head, { outline: false, shadow: false }).scale.set(1, 0.9, 0.6);
    part(new THREE.SphereGeometry(0.021, 12, 10), inkFlat, [x * 0.96, 0.0, 0.196], head, { outline: false, shadow: false }).scale.set(1, 1, 0.6);
    part(box(0.075, 0.02, 0.012, 0.006), inkFlat, [x, 0.07, 0.19], head, { outline: false, shadow: false }).rotation.z = x > 0 ? -0.1 : 0.1;
    part(new THREE.SphereGeometry(0.028, 10, 8), new THREE.MeshBasicMaterial({ color: "#f2a59b", transparent: true, opacity: 0.55 }), [x * 1.45, -0.07, 0.165], head, { outline: false, shadow: false }).scale.set(1.2, 0.7, 0.4);
  }
  part(new THREE.SphereGeometry(0.03, 10, 8), skin, [0, -0.045, 0.2], head, { shadow: false });
  const smile = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.006, 6, 16, Math.PI), new THREE.MeshBasicMaterial({ color: "#8c3d3d" }));
  smile.position.set(0, -0.095, 0.188);
  smile.rotation.z = Math.PI;
  head.add(smile);
  // Thin silver frames, the thing everyone knows him by.
  const wire = new THREE.MeshBasicMaterial({ color: "#d3d4de" });
  for (const x of [-0.072, 0.072]) {
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.0055, 6, 4), wire);
    rim.position.set(x, 0.005, 0.205);
    rim.rotation.z = Math.PI / 4;
    rim.scale.set(1.25, 0.95, 1);
    head.add(rim);
  }
  const brow = new THREE.MeshBasicMaterial({ color: "#3a3944" });
  for (const x of [-0.072, 0.072]) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.115, 0.014, 0.008), brow);
    bar.position.set(x, 0.042, 0.207);
    head.add(bar);
  }
  const bridge = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.006, 0.006), wire);
  bridge.position.set(0, 0.03, 0.208);
  head.add(bridge);
  for (const x of [-0.14, 0.14]) {
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.006, 0.2), wire);
    arm.position.set(x * 1.02, 0.02, 0.1);
    head.add(arm);
  }
  // A small silver hoop in each ear.
  for (const x of [-0.212, 0.212]) {
    const hoop = new THREE.Mesh(new THREE.TorusGeometry(0.014, 0.0035, 6, 16), wire);
    hoop.position.set(x, -0.05, -0.005);
    hoop.rotation.y = Math.PI / 2;
    head.add(hoop);
  }
  part(new THREE.CapsuleGeometry(0.06, 0.06, 4, 8), skin, [0, 0.72, -0.02], me);
  // Legs: thighs along the cushion, shins down to the rug.
  for (const x of [-0.12, 0.12]) {
    part(new THREE.CapsuleGeometry(0.1, 0.42, 4, 12), pants, [x, 0.08, 0.2], me).rotation.x = Math.PI / 2;
    part(new THREE.CapsuleGeometry(0.09, 0.4, 4, 12), pants, [x, -0.27, 0.48], me).rotation.x = 0.12;
    part(box(0.14, 0.1, 0.26, 0.05), toon(C.dark), [x, -0.56, 0.56], me);
  }
  // The laptop, its screen turned to him: the room sees its lid and its glow.
  const laptop = new THREE.Group();
  laptop.position.set(0, 0.22, 0.33);
  laptop.rotation.set(0.12, Math.PI, 0);
  me.add(laptop);
  const alu = toon(C.metal);
  part(box(0.62, 0.035, 0.42, 0.015), alu, [0, 0, 0], laptop);
  const lid = new THREE.Group();
  lid.position.set(0, 0.02, -0.2);
  lid.rotation.x = 1.92 - Math.PI / 2;
  laptop.add(lid);
  part(box(0.62, 0.42, 0.025, 0.015), alu, [0, 0.21, 0], lid);
  part(new THREE.PlaneGeometry(0.56, 0.37), new THREE.MeshBasicMaterial({ color: "#a9bcff" }), [0, 0.215, 0.0135], lid, { outline: false, shadow: false });
  const screenGlow = new THREE.PointLight("#9fb8ff", 0, 2.2, 2);
  screenGlow.position.set(0, 0.25, 0.25);
  lid.add(screenGlow);

  // On the wall above the sofa, a frame playing pixtuoid's office.
  const feed = new THREE.VideoTexture(video);
  feed.colorSpace = THREE.SRGBColorSpace;
  const poster = new THREE.TextureLoader().load(video.poster, () => draw());
  poster.colorSpace = THREE.SRGBColorSpace;
  const screen = new THREE.MeshBasicMaterial({ map: poster, toneMapped: false });
  part(box(1.46, 1.0, 0.06, 0.02), toon(C.dark), [-0.62, 2.02, -2.46]);
  part(new THREE.PlaneGeometry(1.34, 0.893), screen, [-0.62, 2.02, -2.425], room, { outline: false, shadow: false });
  // Arms as joined segments, shoulder to elbow to the keys; typing turns the forearm at the elbow.
  const Y = new THREE.Vector3(0, 1, 0);
  function limb(a, b, radius, material, parent) {
    const from = new THREE.Vector3(...a), to = new THREE.Vector3(...b);
    const span = to.clone().sub(from);
    const mesh = part(new THREE.CapsuleGeometry(radius, Math.max(span.length() - radius, 0.01), 4, 12), material, [0, 0, 0], parent);
    mesh.position.copy(from).addScaledVector(span, 0.5);
    mesh.quaternion.setFromUnitVectors(Y, span.normalize());
    return mesh;
  }
  const forearms = [];
  for (const s of [-1, 1]) {
    const shoulder = [s * 0.21, 0.63, -0.08], elbow = [s * 0.27, 0.36, 0.03];
    limb(shoulder, [s * 0.235, 0.53, -0.04], 0.085, tee, me);
    limb(shoulder, elbow, 0.055, skin, me);
    const fore = new THREE.Group();
    fore.position.set(...elbow);
    me.add(fore);
    const hand = [s * -0.15, -0.085, 0.27];
    limb([0, 0, 0], hand, 0.05, skin, fore);
    part(new THREE.SphereGeometry(0.058, 12, 10), skin, hand, fore).scale.set(1, 0.7, 1.2);
    forearms.push(fore);
  }

  // The turntable on a low cabinet, a record turning on it.
  part(box(1.05, 0.62, 0.62, 0.06), toon(C.wood), [1.75, 0.31, -1.7]);
  part(box(0.66, 0.09, 0.5, 0.03), toon(C.dark), [1.75, 0.67, -1.7]);
  const platter = new THREE.Group();
  platter.position.set(1.68, 0.73, -1.7);
  room.add(platter);
  part(cyl(0.2, 0.02, 48), toon(C.record), [0, 0, 0], platter);
  part(cyl(0.065, 0.025, 24), toon(C.label), [0, 0.002, 0], platter, { outline: false });
  part(box(0.05, 0.01, 0.012, 0.004), toon("#f2efe8"), [0.035, 0.016, 0], platter, { outline: false, shadow: false });
  part(box(0.02, 0.02, 0.3, 0.008), toon(C.metal), [1.92, 0.76, -1.66]).rotation.y = 0.5;
  // Records leaning against the cabinet.
  for (const [i, c] of [[0, "#e07a5f"], [1, "#4d7ea8"], [2, "#f2cc8f"]]) {
    part(box(0.04, 0.5, 0.5, 0.01), toon(c), [2.33 + i * 0.05, 0.26, -1.25 + i * 0.03]).rotation.z = -0.12;
  }
  // Notes drifting up from the music.
  const noteTex = (() => {
    const c = document.createElement("canvas");
    c.width = c.height = 64;
    const g = c.getContext("2d");
    g.fillStyle = "#fff";
    g.font = "52px serif";
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText("♪", 32, 34);
    return new THREE.CanvasTexture(c);
  })();
  const notes = [];
  for (let i = 0; i < 4; i++) {
    const m = new THREE.SpriteMaterial({ map: noteTex, color: "#ffd38a", transparent: true, depthWrite: false });
    const s = new THREE.Sprite(m);
    s.scale.setScalar(0.16);
    room.add(s);
    notes.push({ sprite: s, phase: i / 4 });
  }

  // The bookshelf on the side wall, a camera on its middle shelf.
  const shelfMat = toon(C.wood);
  const shelf = new THREE.Group();
  shelf.position.set(-2.82, 0, 0.55);
  room.add(shelf);
  part(box(0.42, 2.3, 0.06, 0.02), shelfMat, [0, 1.15, -0.72], shelf);
  part(box(0.42, 2.3, 0.06, 0.02), shelfMat, [0, 1.15, 0.72], shelf);
  for (const y of [0.05, 0.62, 1.2, 1.78, 2.28]) part(box(0.42, 0.05, 1.5, 0.015), shelfMat, [0, y, 0], shelf);
  let seed = 7;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (const y of [0.075, 0.645, 1.805]) {
    let z = -0.66;
    while (z < 0.62) {
      const w = 0.06 + rand() * 0.05, h = 0.32 + rand() * 0.18;
      if (z + w > 0.66) break;
      const b = part(box(0.3, h, w, 0.012), toon(C.books[Math.floor(rand() * C.books.length)]), [0.02, y + h / 2, z + w / 2], shelf, { outline: rand() > 0.4 });
      if (rand() > 0.85) b.rotation.x = 0.12;
      z += w + 0.008;
    }
  }
  // The camera.
  const cam = new THREE.Group();
  cam.position.set(0.02, 1.32, -0.2);
  cam.rotation.y = 0.7;
  shelf.add(cam);
  part(box(0.24, 0.15, 0.12, 0.03), toon(C.dark), [0, 0, 0], cam);
  part(box(0.07, 0.04, 0.1, 0.01), toon(C.dark), [-0.06, 0.09, 0], cam);
  const lens = part(cyl(0.05, 0.08), toon(C.metal), [0.0, 0, 0.09], cam);
  lens.rotation.x = Math.PI / 2;
  part(cyl(0.035, 0.012), new THREE.MeshBasicMaterial({ color: "#3a4a7a" }), [0, 0, 0.135], cam, { outline: false, shadow: false }).rotation.x = Math.PI / 2;
  part(new THREE.IcosahedronGeometry(0.13, 1), toon(C.leaf), [0.02, 1.36, 0.4], shelf);
  part(cyl(0.08, 0.14), toon(C.pot), [0.02, 1.27, 0.4], shelf);

  // The floor lamp behind the sofa's arm.
  part(cyl(0.16, 0.04), toon(C.dark), [-2.35, 0.02, -2.1]);
  part(cyl(0.02, 1.75), toon(C.dark), [-2.35, 0.9, -2.1]);
  const shadeMat = new THREE.MeshToonMaterial({ color: "#f6dcae", gradientMap: bands, emissive: new THREE.Color("#ffb860"), emissiveIntensity: 0 });
  part(new THREE.CylinderGeometry(0.16, 0.3, 0.32, 32, 1, true), shadeMat, [-2.35, 1.86, -2.1]).material.side = THREE.DoubleSide;
  const lamp = new THREE.PointLight("#ffb46a", 0, 6, 1.6);
  lamp.position.set(-2.35, 1.7, -2.0);
  lamp.castShadow = true;
  lamp.shadow.mapSize.set(512, 512);
  room.add(lamp);

  // Light: the sky through the door, and the sun or the moon.
  const hemi = new THREE.HemisphereLight("#ffffff", "#5a4a6a", 1);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight("#fff3df", 1);
  sun.position.set(4, 7, 3);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -4, right: 4, top: 4, bottom: -4, near: 1, far: 20 });
  sun.shadow.bias = -0.0008;
  scene.add(sun);

  function applyTheme() {
    const night = dark.matches;
    wallMat.color.set(night ? C.wallNight : C.wallDay);
    glass.uniforms.night.value = night ? 1 : 0;
    hemi.intensity = night ? 0.55 : 1.15;
    hemi.groundColor.set(night ? "#2a2240" : "#b9a48f");
    sun.intensity = night ? 0.35 : 1.6;
    sun.color.set(night ? "#8f9bff" : "#fff1dc");
    lamp.intensity = night ? 3.2 : 0;
    shadeMat.emissiveIntensity = night ? 0.9 : 0;
    screenGlow.intensity = night ? 0.9 : 0.25;
    ink.uniforms.color.value.set(night ? "#120f22" : "#2a2440");
  }
  applyTheme();

  // Motion: one slow life, paused when nobody can see it.
  let aim = 0, look = 0, aimY = 0, lookY = 0, frame = 0, visible = true, shown = false;
  const t0 = performance.now();
  addEventListener("pointermove", (e) => {
    aim = (e.clientX / innerWidth - 0.5) * 2;
    aimY = (e.clientY / innerHeight - 0.5) * 2;
  }, { passive: true });

  function resize() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return;
    if (canvas.width !== Math.round(w * renderer.getPixelRatio()) || canvas.height !== Math.round(h * renderer.getPixelRatio())) {
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
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
      room.rotation.y = -0.05 + look * 0.12;
      room.rotation.x = lookY * 0.04;
      torso.scale.y = 1 + Math.sin(t * 1.6) * 0.012;
      head.rotation.set(0.12 + Math.sin(t * 0.7) * 0.03, 0.28 + Math.sin(t * 0.33) * 0.14, Math.sin(t * 0.5) * 0.03);
      forearms.forEach((f, i) => { f.rotation.x = Math.sin(t * 11 + i * 1.7) * 0.05 * (0.5 + 0.5 * Math.sin(t * 0.8)); });
      platter.rotation.y = -t * 3.49;
      for (const n of notes) {
        const k = (t * 0.22 + n.phase) % 1;
        n.sprite.position.set(1.62 + Math.sin(k * 6 + n.phase * 9) * 0.18, 0.85 + k * 1.3, -1.68);
        n.sprite.material.opacity = Math.sin(k * Math.PI) * 0.9;
      }
      glass.uniforms.time.value = t;
    } else {
      room.rotation.set(0, -0.05, 0);
      head.rotation.set(0.12, 0.28, 0);
      for (const n of notes) n.sprite.material.opacity = 0;
    }
    if (!calm && video.readyState >= 2) {
      if (screen.map !== feed) { screen.map = feed; screen.needsUpdate = true; }
    } else if (screen.map !== poster) {
      screen.map = poster;
      screen.needsUpdate = true;
    }
    renderer.render(scene, camera);
    if (!shown) { shown = true; canvas.classList.add("ready"); }
  }

  function loop(now) {
    draw(now);
    frame = running() ? requestAnimationFrame(loop) : 0;
  }
  const running = () => visible && !document.hidden && !still.matches;

  function wake() {
    if (running()) {
      video.muted = true;
      video.play().catch(() => {});
      if (!frame) frame = requestAnimationFrame(loop);
    } else {
      video.pause();
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
