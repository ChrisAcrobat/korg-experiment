/**
 * Three.js + cannon-es 3D dice stage.
 * Official roll values come from roll.js; this module animates up to VISUAL_DICE_CAP
 * dice, then orients each so the rolled face points up (d6) or shows a value label.
 */
import * as THREE from "https://esm.sh/three@0.160.0";
import * as CANNON from "https://esm.sh/cannon-es@0.20.0";
import { VISUAL_DICE_CAP } from "./roll.js";

const DIE_SIZE = 0.9;

function makeFaceTexture(label, color, fg) {
  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = color || "#a78bfa";
  ctx.fillRect(0, 0, size, size);
  ctx.strokeStyle = "rgba(0,0,0,0.35)";
  ctx.lineWidth = 8;
  ctx.strokeRect(4, 4, size - 8, size - 8);
  ctx.fillStyle = fg || "#ffffff";
  ctx.font = "bold 64px system-ui,sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(String(label), size / 2, size / 2 + 4);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Standard d6: +X=1 -X=6 +Y=2 -Y=5 +Z=3 -Z=4 (opposites sum to 7). */
function d6Materials(color) {
  const faces = [1, 6, 2, 5, 3, 4];
  return faces.map(function (n) {
    return new THREE.MeshStandardMaterial({
      map: makeFaceTexture(n, color, "#fff"),
      roughness: 0.45,
      metalness: 0.05,
    });
  });
}

function valueMaterial(value, color) {
  return new THREE.MeshStandardMaterial({
    map: makeFaceTexture(value, color, "#fff"),
    roughness: 0.45,
    metalness: 0.05,
  });
}

/**
 * Quaternion that rotates local +Y to world up after aligning a given local
 * face normal (in die local space) to world +Y. For d6 box geometry normals.
 */
function quatForTopFace(value) {
  /* Local normals for box materials order: +x,-x,+y,-y,+z,-z → values 1,6,2,5,3,4 */
  const map = {
    1: new THREE.Vector3(1, 0, 0),
    6: new THREE.Vector3(-1, 0, 0),
    2: new THREE.Vector3(0, 1, 0),
    5: new THREE.Vector3(0, -1, 0),
    3: new THREE.Vector3(0, 0, 1),
    4: new THREE.Vector3(0, 0, -1),
  };
  const local = map[value] || map[1];
  const up = new THREE.Vector3(0, 1, 0);
  const q = new THREE.Quaternion();
  q.setFromUnitVectors(local.clone().normalize(), up);
  return q;
}

function readTopFaceD6(mesh) {
  const normals = [
    { v: 1, n: new THREE.Vector3(1, 0, 0) },
    { v: 6, n: new THREE.Vector3(-1, 0, 0) },
    { v: 2, n: new THREE.Vector3(0, 1, 0) },
    { v: 5, n: new THREE.Vector3(0, -1, 0) },
    { v: 3, n: new THREE.Vector3(0, 0, 1) },
    { v: 4, n: new THREE.Vector3(0, 0, -1) },
  ];
  let best = 1;
  let bestDot = -Infinity;
  const world = new THREE.Vector3();
  for (let i = 0; i < normals.length; i++) {
    world.copy(normals[i].n).applyQuaternion(mesh.quaternion);
    if (world.y > bestDot) {
      bestDot = world.y;
      best = normals[i].v;
    }
  }
  return best;
}

export function createDiceStage(canvas) {
  const renderer = new THREE.WebGLRenderer({
    canvas: canvas,
    antialias: true,
    alpha: true,
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
  camera.position.set(0, 10, 12);
  camera.lookAt(0, 0, 0);

  const ambient = new THREE.AmbientLight(0xffffff, 0.55);
  scene.add(ambient);
  const dir = new THREE.DirectionalLight(0xffffff, 0.9);
  dir.position.set(4, 12, 6);
  scene.add(dir);

  const floorMat = new THREE.MeshStandardMaterial({
    color: 0x22262e,
    roughness: 0.9,
    metalness: 0.05,
    transparent: true,
    opacity: 0.55,
  });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(24, 24), floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = 0;
  scene.add(floor);

  let world = null;
  let bodies = [];
  let meshes = [];
  let raf = 0;
  let running = false;
  let settleFrames = 0;
  let onSettled = null;
  let diceColor = "#a78bfa";

  function resize() {
    const parent = canvas.parentElement || canvas;
    const w = Math.max(1, parent.clientWidth || canvas.clientWidth);
    const h = Math.max(1, parent.clientHeight || canvas.clientHeight);
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  function clearDice() {
    meshes.forEach(function (m) {
      scene.remove(m);
      if (m.geometry) m.geometry.dispose();
      const mats = Array.isArray(m.material) ? m.material : [m.material];
      mats.forEach(function (mat) {
        if (mat.map) mat.map.dispose();
        mat.dispose();
      });
    });
    meshes = [];
    if (world) {
      bodies.forEach(function (b) {
        world.removeBody(b);
      });
    }
    bodies = [];
  }

  function ensureWorld() {
    if (world) return;
    world = new CANNON.World({ gravity: new CANNON.Vec3(0, -18, 0) });
    world.broadphase = new CANNON.NaiveBroadphase();
    world.allowSleep = true;
    const ground = new CANNON.Body({
      type: CANNON.Body.STATIC,
      shape: new CANNON.Plane(),
    });
    ground.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
    world.addBody(ground);
    /* Invisible walls */
    const wallShape = new CANNON.Plane();
    function wall(nx, nz, px, pz) {
      const b = new CANNON.Body({ type: CANNON.Body.STATIC, shape: wallShape });
      b.quaternion.setFromEuler(0, Math.atan2(nx, nz), 0);
      b.position.set(px, 0, pz);
      world.addBody(b);
    }
    wall(0, 1, 0, -7);
    wall(0, -1, 0, 7);
    wall(1, 0, -7, 0);
    wall(-1, 0, 7, 0);
  }

  function spawnDie(spec, index, total, spinDir) {
    const sides = spec.sides;
    const value = spec.value;
    const isD6 = sides === 6;
    const geo = new THREE.BoxGeometry(DIE_SIZE, DIE_SIZE, DIE_SIZE);
    let mesh;
    if (isD6) {
      mesh = new THREE.Mesh(geo, d6Materials(diceColor));
    } else {
      const mat = valueMaterial(value, diceColor);
      mesh = new THREE.Mesh(geo, [mat, mat, mat, mat, mat, mat]);
    }
    mesh.userData = { sides: sides, value: value, isD6: isD6 };
    scene.add(mesh);
    meshes.push(mesh);

    const shape = new CANNON.Box(
      new CANNON.Vec3(DIE_SIZE / 2, DIE_SIZE / 2, DIE_SIZE / 2)
    );
    const body = new CANNON.Body({
      mass: 1,
      shape: shape,
      allowSleep: true,
      sleepSpeedLimit: 0.35,
      sleepTimeLimit: 0.35,
    });
    const cols = Math.ceil(Math.sqrt(total));
    const row = Math.floor(index / cols);
    const col = index % cols;
    body.position.set(
      (col - (cols - 1) / 2) * 1.4 + (Math.random() - 0.5) * 0.3,
      3.5 + row * 1.2 + Math.random() * 0.8,
      (Math.random() - 0.5) * 2.5
    );
    body.velocity.set(
      (Math.random() - 0.5) * 5,
      Math.random() * 2.5,
      (Math.random() - 0.5) * 5
    );
    /* Faster spin; spinDir is +1 or -1 (CW/CCW for this roll). Primary axis randomized. */
    const speed = 28 + Math.random() * 14;
    const jitter = 8;
    const axis = Math.floor(Math.random() * 3);
    const av = [
      (Math.random() - 0.5) * jitter,
      (Math.random() - 0.5) * jitter,
      (Math.random() - 0.5) * jitter,
    ];
    av[axis] = spinDir * speed;
    body.angularVelocity.set(av[0], av[1], av[2]);
    world.addBody(body);
    bodies.push(body);
  }

  function snapToValues() {
    for (let i = 0; i < meshes.length; i++) {
      const mesh = meshes[i];
      const body = bodies[i];
      if (!mesh || !body) continue;
      body.velocity.set(0, 0, 0);
      body.angularVelocity.set(0, 0, 0);
      body.position.y = Math.max(body.position.y, DIE_SIZE / 2 + 0.01);
      if (mesh.userData.isD6) {
        const q = quatForTopFace(mesh.userData.value);
        mesh.quaternion.copy(q);
        body.quaternion.set(q.x, q.y, q.z, q.w);
      } else {
        /* Keep physics pose; textures already show the value. */
        mesh.position.copy(body.position);
        mesh.quaternion.set(
          body.quaternion.x,
          body.quaternion.y,
          body.quaternion.z,
          body.quaternion.w
        );
      }
    }
  }

  function allSleeping() {
    if (!bodies.length) return true;
    return bodies.every(function (b) {
      return b.sleepState === CANNON.Body.SLEEPING || b.velocity.length() < 0.15;
    });
  }

  function tick() {
    if (!running) return;
    raf = requestAnimationFrame(tick);
    if (world) world.step(1 / 60);
    for (let i = 0; i < meshes.length; i++) {
      const mesh = meshes[i];
      const body = bodies[i];
      if (!mesh || !body) continue;
      mesh.position.copy(body.position);
      mesh.quaternion.set(
        body.quaternion.x,
        body.quaternion.y,
        body.quaternion.z,
        body.quaternion.w
      );
    }
    renderer.render(scene, camera);

    if (allSleeping()) {
      settleFrames += 1;
    } else {
      settleFrames = 0;
    }
    if (settleFrames > 25 || (meshes.length && settleFrames > 10 && performance.now() - startAt > 4500)) {
      finish();
    }
    if (performance.now() - startAt > 7000) {
      finish();
    }
  }

  let startAt = 0;

  function finish() {
    if (!running) return;
    running = false;
    cancelAnimationFrame(raf);
    snapToValues();
    renderer.render(scene, camera);
    const read = meshes.map(function (m) {
      if (m.userData.isD6) return readTopFaceD6(m);
      return m.userData.value;
    });
    const cb = onSettled;
    onSettled = null;
    if (cb) cb(read);
  }

  function roll(diceSpecs, color) {
    return new Promise(function (resolve) {
      resize();
      ensureWorld();
      clearDice();
      diceColor = color || diceColor;
      const list = (diceSpecs || []).slice(0, VISUAL_DICE_CAP);
      if (!list.length) {
        renderer.render(scene, camera);
        resolve([]);
        return;
      }
      /* One CW/CCW choice per roll, shared by all visual dice. */
      const spinDir = Math.random() < 0.5 ? 1 : -1;
      list.forEach(function (spec, i) {
        spawnDie(spec, i, list.length, spinDir);
      });
      settleFrames = 0;
      startAt = performance.now();
      onSettled = resolve;
      running = true;
      cancelAnimationFrame(raf);
      tick();
    });
  }

  function setColor(color) {
    diceColor = color || diceColor;
  }

  function destroy() {
    running = false;
    cancelAnimationFrame(raf);
    clearDice();
    renderer.dispose();
  }

  function idleRender() {
    resize();
    renderer.render(scene, camera);
  }

  window.addEventListener("resize", function () {
    resize();
    idleRender();
  });

  resize();
  idleRender();

  return {
    roll: roll,
    setColor: setColor,
    clear: function () {
      running = false;
      cancelAnimationFrame(raf);
      clearDice();
      idleRender();
    },
    destroy: destroy,
    resize: resize,
    VISUAL_DICE_CAP: VISUAL_DICE_CAP,
  };
}
