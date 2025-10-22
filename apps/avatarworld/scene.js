// Copyright (c) 2025 naruya
// Licensed under the MIT License. See LICENSE file in the project root for full license information.


import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';


export function createSky(scene, sceneType = 2) {
  const sky = new Sky();
  sky.scale.setScalar(450000);
  scene.add(sky);

  const sky_uniforms = sky.material.uniforms;

  if (sceneType === 1) {
    // Scene 1: Bright sky
    sky_uniforms['turbidity'].value = 0.3;
    sky_uniforms['rayleigh'].value = 0.1;
    sky_uniforms['mieCoefficient'].value = 0.003;
    sky_uniforms['mieDirectionalG'].value = 0.999;
    let sun = new THREE.Vector3();
    let elevation = 40, azimuth = 180;
    let phi = THREE.MathUtils.degToRad(90 - elevation);
    let theta = THREE.MathUtils.degToRad(azimuth);
    sun.setFromSphericalCoords(1, phi, theta)
    sky_uniforms['sunPosition'].value.copy(sun);
  } else {
    // Scene 2: Dark sky
    sky_uniforms['turbidity'].value = 10;
    sky_uniforms['rayleigh'].value = 0.5;
    sky_uniforms['mieCoefficient'].value = 0.005;
    sky_uniforms['mieDirectionalG'].value = 0.8;
    let sun = new THREE.Vector3();
    let elevation = -10, azimuth = 180;
    let phi = THREE.MathUtils.degToRad(90 - elevation);
    let theta = THREE.MathUtils.degToRad(azimuth);
    sun.setFromSphericalCoords(1, phi, theta)
    sky_uniforms['sunPosition'].value.copy(sun);
  }

  return sky;
}

export function createFloor(scene) {
  const floorGeometry = new THREE.PlaneGeometry(30, 30, 1, 1);

  const floorMaterial = new THREE.ShaderMaterial({
    uniforms: {
      time: { value: 0 },
      resolution: { value: new THREE.Vector2(512, 512) }
    },
    vertexShader: `
      varying vec2 vUv;

      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform float time;
      uniform vec2 resolution;
      varying vec2 vUv;

      // Hash function (pseudo-random)
      float hash(vec2 p) {
        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
      }

      // Noise function
      float noise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        f = f * f * (3.0 - 2.0 * f);

        float a = hash(i);
        float b = hash(i + vec2(1.0, 0.0));
        float c = hash(i + vec2(0.0, 1.0));
        float d = hash(i + vec2(1.0, 1.0));

        return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
      }

      // Calculate velocity field (Navier-Stokes style)
      vec2 getVelocityField(vec2 pos, float t) {
        vec2 velocity = vec2(0.0);

        // Generate multiple vortices (increased to 12)
        for (int i = 0; i < 12; i++) {
          float fi = float(i);

          // Vortex center (moves over time)
          float angle = t * 0.15 + fi * 0.524; // More finely distributed
          float radius = 0.2 + sin(t * 0.12 + fi * 0.5) * 0.15;
          vec2 vortexCenter = vec2(
            cos(angle) * radius + sin(t * 0.07 + fi * 0.67) * 0.12,
            sin(angle) * radius + cos(t * 0.09 + fi * 1.13) * 0.12
          );

          vec2 diff = pos - vortexCenter;
          float dist = length(diff);

          // Vortex strength (more localized)
          float strength = 1.2 / (1.0 + dist * 6.0);

          // Rotation direction
          float direction = mod(fi, 2.0) < 1.0 ? 1.0 : -1.0;

          // Tangential velocity (rotation)
          vec2 tangent = vec2(-diff.y, diff.x) * direction;
          velocity += normalize(tangent) * strength;

          // Flow toward/away from vortex center
          float pulse = sin(t * 0.35 + fi * 0.6) * 0.15;
          velocity += normalize(diff) * pulse * strength * 0.25;
        }

        // Add smaller vortices (finer pattern)
        for (int i = 0; i < 8; i++) {
          float fi = float(i);
          vec2 miniVortex = vec2(
            sin(t * 0.1 + fi * 0.785) * 0.4,
            cos(t * 0.13 + fi * 0.785) * 0.4
          );

          vec2 diff = pos - miniVortex;
          float dist = length(diff);
          float strength = 0.5 / (1.0 + dist * 10.0);
          float direction = mod(fi, 2.0) < 1.0 ? 1.0 : -1.0;
          vec2 tangent = vec2(-diff.y, diff.x) * direction;
          velocity += normalize(tangent) * strength;
        }

        // Large-scale turbulence
        float n1 = noise(pos * 4.0 + vec2(t * 0.1, 0.0));
        float n2 = noise(pos * 4.0 + vec2(0.0, t * 0.1));
        velocity += vec2(n1 - 0.5, n2 - 0.5) * 0.4;

        return velocity;
      }

      // Calculate streamlines
      vec2 tracePath(vec2 startPos, float t, int steps) {
        vec2 pos = startPos;
        float dt = 0.02;

        for (int i = 0; i < 20; i++) {
          if (i >= steps) break;
          vec2 vel = getVelocityField(pos, t);
          pos += vel * dt;

          // Boundary handling (torus)
          pos = fract(pos + 0.5) - 0.5;
        }

        return pos;
      }

      void main() {
        // Coordinate system -0.5 to 0.5
        vec2 pos = vUv - 0.5;

        // Velocity at current position
        vec2 velocity = getVelocityField(pos, time);
        float speed = length(velocity);

        // Visualize streamlines (calculate trajectory going back in time)
        float pattern = 0.0;

        // Distort noise pattern along streamlines
        vec2 tracedPos = tracePath(pos, time - 2.0, 15);
        float flowNoise = noise(tracedPos * 20.0 + time * 0.5);

        // Brightness based on velocity
        pattern = flowNoise * speed * 0.35;

        // Emphasize vortex centers
        for (int i = 0; i < 12; i++) {
          float fi = float(i);
          float angle = time * 0.15 + fi * 0.524;
          float radius = 0.2 + sin(time * 0.12 + fi * 0.5) * 0.15;
          vec2 vortexCenter = vec2(
            cos(angle) * radius + sin(time * 0.07 + fi * 0.67) * 0.12,
            sin(angle) * radius + cos(time * 0.09 + fi * 1.13) * 0.12
          );

          float distToVortex = length(pos - vortexCenter);
          pattern += smoothstep(0.1, 0.0, distToVortex) * 0.08;
        }

        // Express as white gradation
        vec3 color = vec3(1.0) * clamp(pattern, 0.0, 1.0);
        float alpha = clamp(pattern * 0.2, 0.01, 0.1);

        gl_FragColor = vec4(color, alpha);
      }
    `,
    transparent: true,
    side: THREE.DoubleSide,
    depthWrite: false
  });

  const floor = new THREE.Mesh(floorGeometry, floorMaterial);
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = 0.01;
  floor.renderOrder = -100;
  scene.add(floor);

  return floor;
}

export function createParticleFloor(scene) {
  const particleCount = 1600;
  const positions = new Float32Array(particleCount * 3);
  const initialPositions = new Float32Array(particleCount * 3);
  const randoms = new Float32Array(particleCount);

  const radius = 15;

  for (let i = 0; i < particleCount; i++) {
    const i3 = i * 3;

    // 半径15の円内にランダム配置
    const r = Math.sqrt(Math.random()) * radius;
    const theta = Math.random() * Math.PI * 2;
    const x = r * Math.cos(theta);
    const z = r * Math.sin(theta);

    positions[i3] = x;
    positions[i3 + 1] = 0.05; // 地面より少し上
    positions[i3 + 2] = z;

    initialPositions[i3] = x;
    initialPositions[i3 + 1] = 0.05;
    initialPositions[i3 + 2] = z;

    randoms[i] = Math.random();
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('initialPosition', new THREE.BufferAttribute(initialPositions, 3));
  geometry.setAttribute('random', new THREE.BufferAttribute(randoms, 1));

  const material = new THREE.ShaderMaterial({
    uniforms: {
      time: { value: 0 },
      pointSize: { value: 0.3 }
    },
    vertexShader: `
      attribute vec3 initialPosition;
      attribute float random;
      uniform float time;
      uniform float pointSize;
      varying float vAlpha;

      // 流体の速度場を計算（複数の渦の影響を合成）
      vec2 getVelocityField(vec2 pos, float t) {
        vec2 velocity = vec2(0.0);

        // 動的な渦を複数生成
        for (int i = 0; i < 6; i++) {
          float fi = float(i);

          // 渦の中心位置（時間とともに移動）
          float angle = t * 0.15 + fi * 2.094; // 2π/3 ずつずらす
          float radius = 8.0 + sin(t * 0.2 + fi) * 3.0;
          vec2 vortexCenter = vec2(
            cos(angle) * radius + sin(t * 0.1 + fi * 1.234) * 2.0,
            sin(angle) * radius + cos(t * 0.13 + fi * 2.345) * 2.0
          );

          vec2 diff = pos - vortexCenter;
          float dist = length(diff);

          // 渦の強さ（距離に応じて減衰）
          float strength = 1.5 / (1.0 + dist * 0.3);

          // 回転方向（時計回りと反時計回り混在）
          float direction = mod(fi, 2.0) < 1.0 ? 1.0 : -1.0;

          // 接線方向の速度（渦）
          vec2 tangent = vec2(-diff.y, diff.x) * direction;
          velocity += normalize(tangent) * strength;

          // 渦の中心に向かう/離れる流れ（呼吸するような動き）
          float pulse = sin(t * 0.5 + fi * 0.5) * 0.3;
          velocity += normalize(diff) * pulse * strength * 0.5;
        }

        // 乱流成分（パーリンノイズ風）
        float turbulence = sin(pos.x * 0.3 + t * 0.5) * cos(pos.y * 0.3 + t * 0.7);
        velocity += vec2(
          sin(pos.y * 0.2 + t + turbulence),
          cos(pos.x * 0.2 + t * 0.8 + turbulence)
        ) * 0.3;

        return velocity;
      }

      void main() {
        vec3 pos = initialPosition;

        // オイラー法で軌跡を計算（複数ステップで精度向上）
        float dt = 0.1;
        float currentTime = time + random * 20.0; // 位相をずらす

        for (int step = 0; step < 15; step++) {
          vec2 velocity = getVelocityField(pos.xz, currentTime);
          pos.xz += velocity * dt;
          currentTime += dt;

          // 円形の境界処理
          float dist = length(pos.xz);
          if (dist > 15.0) {
            // 円の外に出たら反対側に戻す
            pos.xz = -pos.xz * (14.0 / dist);
          }
        }

        // Y座標の微細な変動
        pos.y += sin(time * 1.5 + random * 10.0) * 0.05;

        // 速度に応じた透明度
        vec2 vel = getVelocityField(pos.xz, time + random * 20.0);
        float speed = length(vel);
        vAlpha = clamp(speed * 0.3 + 0.2, 0.2, 0.8);

        vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
        gl_PointSize = pointSize * (300.0 / -mvPosition.z);
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: `
      varying float vAlpha;

      void main() {
        // 円形のパーティクル
        vec2 center = gl_PointCoord - vec2(0.5);
        float dist = length(center);
        if (dist > 0.5) discard;

        // 白色、速度に応じた透明度
        float alpha = (1.0 - dist * 2.0) * vAlpha;
        gl_FragColor = vec4(1.0, 1.0, 1.0, alpha);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending
  });

  const particleSystem = new THREE.Points(geometry, material);
  particleSystem.renderOrder = -100; // 背景として描画
  scene.add(particleSystem);

  return particleSystem;
}


// temp (add houses)
function createHouse(myrng, ox, oz, scale = 50) {
  const randomColor = Math.floor(myrng() * 16777215);
  const houseGeometry = new THREE.BoxGeometry(3, 2, 3);
  const houseMaterial = new THREE.MeshBasicMaterial({ color: randomColor, wireframe: true });
  const house = new THREE.Mesh(houseGeometry, houseMaterial);
  const roofGeometry = new THREE.ConeGeometry(3, 1.5, 4);
  const roofMaterial = new THREE.MeshBasicMaterial({ color: randomColor, wireframe: true });
  const roof = new THREE.Mesh(roofGeometry, roofMaterial);
  roof.position.set(0, 1.75, 0);
  roof.rotation.y = THREE.MathUtils.degToRad(45);
  house.add(roof);
  const x = myrng() * scale * 2 - scale + ox;
  const z = myrng() * scale * 2 - scale + oz;
  house.position.set(x, 1, z);
  return house;
}


export function createHouses(scene) {
  // Math.random() -> myrng()
  var myrng = new Math.seedrandom('Hello!');
  for (let i = 0; i < 10; i++) {
    const house = createHouse(myrng, 0, 0);
    scene.add(house);
    // dragControls.getObjects().push(house);
  }
  for (let i = 0; i < 5; i++) {
    const house = createHouse(myrng, -100, -100);
    scene.add(house);
    // dragControls.getObjects().push(house);
  }
  for (let i = 0; i < 5; i++) {
    const house = createHouse(myrng, -100, 100);
    scene.add(house);
    // dragControls.getObjects().push(house);
  }
  for (let i = 0; i < 5; i++) {
    const house = createHouse(myrng, 100, -100);
    scene.add(house);
    // dragControls.getObjects().push(house);
  }
  for (let i = 0; i < 5; i++) {
    const house = createHouse(myrng, 100, 100);
    scene.add(house);
    // dragControls.getObjects().push(house);
  }
}
