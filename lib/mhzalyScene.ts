import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";

export interface MhzalySceneApi {
  rotateBy(deltaTheta: number, deltaPhi: number): void;
  zoomBy(factor: number): void;
  zoomIn(): void;
  zoomOut(): void;
  resetView(): void;
  dispose(): void;
}

const HOME_POSITION = new THREE.Vector3(0, 0.5, 5.5);
const MIN_DISTANCE = 0.6;
const MAX_DISTANCE = 40;

export function createMhzalyScene(container: HTMLElement): MhzalySceneApi {
  const width = container.clientWidth;
  const height = container.clientHeight;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x000208);
  scene.fog = new THREE.FogExp2(0x000208, 0.03);

  const camera = new THREE.PerspectiveCamera(55, width / height, 0.1, 500);
  camera.position.copy(HOME_POSITION);

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(width, height);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  container.appendChild(renderer.domElement);

  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));

  const bloom = new UnrealBloomPass(
    new THREE.Vector2(width, height),
    2.2,
    0.5,
    0.1
  );
  composer.addPass(bloom);

  const chromaticShader = {
    uniforms: {
      tDiffuse: { value: null },
      uTime: { value: 0 },
      uIntensity: { value: 0.0035 },
    },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform sampler2D tDiffuse;
      uniform float uTime;
      uniform float uIntensity;
      varying vec2 vUv;
      void main() {
        vec2 dir = vUv - vec2(0.5);
        float d = length(dir);
        float offset = uIntensity * d;
        float flicker = 1.0 + 0.015 * sin(uTime * 35.0);
        vec4 cr = texture2D(tDiffuse, vUv + dir * offset);
        vec4 cg = texture2D(tDiffuse, vUv);
        vec4 cb = texture2D(tDiffuse, vUv - dir * offset * 0.6);
        gl_FragColor = vec4(cr.r * 0.2, cg.g * 0.9, cb.b * 1.5, 1.0) * flicker;
        gl_FragColor.rgb = mix(gl_FragColor.rgb, gl_FragColor.rgb * vec3(0.4, 0.9, 1.4), 0.5);
      }
    `,
  };
  const chromaticPass = new ShaderPass(chromaticShader);
  composer.addPass(chromaticPass);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.04;
  controls.minDistance = MIN_DISTANCE;
  controls.maxDistance = MAX_DISTANCE;
  controls.zoomSpeed = 1.4;
  controls.enablePan = false;

  const C_BRIGHT = 0x00d2ff;
  const C_MID = 0x0077ff;
  const C_DIM = 0x0033aa;
  const C_FAINT = 0x001555;
  const C_HOT = 0x80e5ff;

  const mhzalyGroup = new THREE.Group();
  scene.add(mhzalyGroup);

  function lineMat(color: number, opacity = 1) {
    return new THREE.LineBasicMaterial({
      color,
      transparent: true,
      opacity,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
  }

  function latRing(radius: number, lat: number, segs = 120) {
    const r = radius * Math.cos(lat);
    const y = radius * Math.sin(lat);
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= segs; i++) {
      const a = (i / segs) * Math.PI * 2;
      pts.push(new THREE.Vector3(r * Math.cos(a), y, r * Math.sin(a)));
    }
    return new THREE.BufferGeometry().setFromPoints(pts);
  }

  function meridian(radius: number, lon: number, segs = 120) {
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= segs; i++) {
      const lat = (i / segs) * Math.PI - Math.PI / 2;
      pts.push(
        new THREE.Vector3(
          radius * Math.cos(lat) * Math.cos(lon),
          radius * Math.sin(lat),
          radius * Math.cos(lat) * Math.sin(lon)
        )
      );
    }
    return new THREE.BufferGeometry().setFromPoints(pts);
  }

  const outerShell = new THREE.Group();
  const R1 = 2.0;

  for (let i = -15; i <= 15; i++) {
    const lat = (i / 15) * (Math.PI / 2) * 0.95;
    const opacity = i % 3 === 0 ? 0.5 : 0.12;
    const color = i % 3 === 0 ? C_MID : C_FAINT;
    outerShell.add(new THREE.Line(latRing(R1, lat), lineMat(color, opacity)));
  }

  for (let i = 0; i < 24; i++) {
    const lon = (i / 24) * Math.PI * 2;
    const isMajor = i % 6 === 0;
    outerShell.add(
      new THREE.Line(
        meridian(R1, lon),
        lineMat(isMajor ? C_MID : C_FAINT, isMajor ? 0.6 : 0.1)
      )
    );
  }
  mhzalyGroup.add(outerShell);

  const innerCore = new THREE.Group();
  const R3 = 0.9;
  for (let s = 0; s < 8; s++) {
    const pts: THREE.Vector3[] = [];
    const turns = 4;
    const segs = 300;
    const phase = (s / 8) * Math.PI * 2;
    for (let i = 0; i <= segs; i++) {
      const t = i / segs;
      const lat = t * Math.PI - Math.PI / 2;
      const lon = t * turns * Math.PI * 2 + phase;
      pts.push(
        new THREE.Vector3(
          R3 * Math.cos(lat) * Math.cos(lon),
          R3 * Math.sin(lat),
          R3 * Math.cos(lat) * Math.sin(lon)
        )
      );
    }
    innerCore.add(
      new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(pts),
        lineMat(C_BRIGHT, 0.4)
      )
    );
  }
  mhzalyGroup.add(innerCore);

  const coreR = 0.25;
  const icoGeo = new THREE.IcosahedronGeometry(coreR, 1);
  const icoEdges = new THREE.EdgesGeometry(icoGeo);
  const icoWireMat = lineMat(C_HOT, 0.9);
  const icoWire = new THREE.LineSegments(icoEdges, icoWireMat);
  mhzalyGroup.add(icoWire);

  const coreSphereMat = new THREE.MeshBasicMaterial({
    color: C_HOT,
    transparent: true,
    opacity: 0.25,
    blending: THREE.AdditiveBlending,
  });
  const coreSphere = new THREE.Mesh(new THREE.SphereGeometry(0.15, 16, 16), coreSphereMat);
  mhzalyGroup.add(coreSphere);

  const starCount = 3500;
  const starPos = new Float32Array(starCount * 3);
  const starColors = new Float32Array(starCount * 3);

  for (let i = 0; i < starCount; i++) {
    const u = Math.random();
    const r = 8 + u * 80;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);

    starPos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
    starPos[i * 3 + 1] = r * Math.cos(phi);
    starPos[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);

    const colorMix = Math.random();
    if (colorMix > 0.6) {
      starColors[i * 3] = 0.0;
      starColors[i * 3 + 1] = 0.8;
      starColors[i * 3 + 2] = 1.0;
    } else if (colorMix > 0.2) {
      starColors[i * 3] = 0.2;
      starColors[i * 3 + 1] = 0.4;
      starColors[i * 3 + 2] = 1.0;
    } else {
      starColors[i * 3] = 1.0;
      starColors[i * 3 + 1] = 1.0;
      starColors[i * 3 + 2] = 1.0;
    }
  }

  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute("position", new THREE.Float32BufferAttribute(starPos, 3));
  starGeo.setAttribute("color", new THREE.Float32BufferAttribute(starColors, 3));

  const dotC = document.createElement("canvas");
  dotC.width = dotC.height = 64;
  const dCtx = dotC.getContext("2d")!;
  const g = dCtx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, "rgba(128, 229, 255, 1)");
  g.addColorStop(0.25, "rgba(0, 150, 255, 0.7)");
  g.addColorStop(0.6, "rgba(0, 50, 150, 0.2)");
  g.addColorStop(1, "rgba(0, 0, 0, 0)");
  dCtx.fillStyle = g;
  dCtx.fillRect(0, 0, 64, 64);

  const starMat = new THREE.PointsMaterial({
    map: new THREE.CanvasTexture(dotC),
    size: 0.12,
    vertexColors: true,
    transparent: true,
    opacity: 0.85,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    sizeAttenuation: true,
  });
  const starField = new THREE.Points(starGeo, starMat);
  scene.add(starField);

  const codeSnippets = [
    "MHZALY.SYS", "WHATSAPP.OK", "EXEC_TASK", "SECURE_NET", "AI_RUN",
    "NODE_ACTIVE", "SYNC_100%", "GATEWAY_UP", "API_LINK", "BUFFER_RDY",
    "01001101", "01001000", "01011010", "TELEMETRY", "ENCRYPT_AES"
  ];

  interface SpriteDrift {
    phi: number;
    theta: number;
    r: number;
    speed: number;
  }

  function makeTextSprite(text: string, size = 0.08) {
    const c = document.createElement("canvas");
    c.width = 256;
    c.height = 32;
    const ctx = c.getContext("2d")!;
    ctx.font = "bold 14px Courier New";
    ctx.fillStyle = `rgba(0, 210, 255, 0.85)`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, 128, 16);
    const tex = new THREE.CanvasTexture(c);
    tex.minFilter = THREE.LinearFilter;
    const s = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: tex,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    s.scale.set(size * 5, size * 0.7, 1);
    return s;
  }

  const textGroup = new THREE.Group();
  for (let i = 0; i < 400; i++) {
    const sp = makeTextSprite(
      codeSnippets[Math.floor(Math.random() * codeSnippets.length)],
      0.04
    );
    const phi = Math.acos(2 * Math.random() - 1);
    const theta = Math.random() * Math.PI * 2;
    const r = R1 + 0.05 + Math.random() * 0.5;
    sp.position.set(
      r * Math.sin(phi) * Math.cos(theta),
      r * Math.cos(phi),
      r * Math.sin(phi) * Math.sin(theta)
    );
    sp.userData = {
      phi,
      theta,
      r,
      speed: 0.0004 * (Math.random() > 0.5 ? 1 : -1),
    } satisfies SpriteDrift;
    textGroup.add(sp);
  }
  mhzalyGroup.add(textGroup);

  const sphericalScratch = new THREE.Spherical();
  const offsetScratch = new THREE.Vector3();

  function rotateBy(deltaTheta: number, deltaPhi: number) {
    offsetScratch.copy(camera.position).sub(controls.target);
    sphericalScratch.setFromVector3(offsetScratch);
    sphericalScratch.theta -= deltaTheta;
    sphericalScratch.phi = THREE.MathUtils.clamp(
      sphericalScratch.phi - deltaPhi,
      0.05,
      Math.PI - 0.05
    );
    sphericalScratch.makeSafe();
    offsetScratch.setFromSpherical(sphericalScratch);
    camera.position.copy(controls.target).add(offsetScratch);
    camera.lookAt(controls.target);
  }

  function zoomBy(factor: number) {
    offsetScratch.copy(camera.position).sub(controls.target);
    const dist = THREE.MathUtils.clamp(
      offsetScratch.length() * factor,
      MIN_DISTANCE,
      MAX_DISTANCE
    );
    offsetScratch.setLength(dist);
    camera.position.copy(controls.target).add(offsetScratch);
  }

  function resetView() {
    camera.position.copy(HOME_POSITION);
    controls.target.set(0, 0, 0);
    camera.lookAt(controls.target);
    controls.update();
  }

  const clock = new THREE.Clock();
  let rafId = 0;
  let disposed = false;

  function animate() {
    if (disposed) return;
    rafId = requestAnimationFrame(animate);
    const t = clock.getElapsedTime();

    outerShell.rotation.y += 0.0015;
    innerCore.rotation.y -= 0.005;
    icoWire.rotation.x += 0.008;
    icoWire.rotation.y += 0.012;
    starField.rotation.y += 0.0001;

    textGroup.children.forEach((sp) => {
      const u = sp.userData as SpriteDrift;
      u.theta += u.speed;
      sp.position.set(
        u.r * Math.sin(u.phi) * Math.cos(u.theta),
        u.r * Math.cos(u.phi),
        u.r * Math.sin(u.phi) * Math.sin(u.theta)
      );
    });

    bloom.strength = 2.0 + Math.sin(t * 1.5) * 0.4;
    chromaticPass.uniforms.uTime.value = t;

    controls.update();
    composer.render();
  }

  animate();

  function onResize() {
    const w = container.clientWidth;
    const h = container.clientHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
    composer.setSize(w, h);
  }
  window.addEventListener("resize", onResize);

  function dispose() {
    disposed = true;
    cancelAnimationFrame(rafId);
    window.removeEventListener("resize", onResize);
    controls.dispose();
    composer.dispose();
    renderer.dispose();
    renderer.domElement.remove();
  }

  return {
    rotateBy,
    zoomBy,
    zoomIn: () => zoomBy(0.65),
    zoomOut: () => zoomBy(1.55),
    resetView,
    dispose,
  };
}
