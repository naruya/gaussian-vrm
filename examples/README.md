# Gaussian-VRM Examples

### 1. Simply load, animate, and view a GVRM avatar

 `simple-viewer.html` ([DEMO](https://naruya.github.io/gs-edit/examples/simple-viewer.html))

<img width="160" alt="simple-viewer" src="https://i.gyazo.com/f42b9afd06b0a8045492d7b99f563f58.png" />

```html
<!DOCTYPE html>
<head>
  <title>Simple GVRM Viewer</title>
  <style>
    body { margin: 0; overflow: hidden; }
  </style>
</head>
<body>
  <canvas id="canvas"></canvas>
  <script type="importmap">
    {
      "imports": {
        "three": "https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.min.js",
        "three/addons/": "https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/",
        "@pixiv/three-vrm": "https://cdn.jsdelivr.net/npm/@pixiv/three-vrm@2.1.0/lib/three-vrm.module.js",
        "gaussian-splats-3d": "https://naruya.github.io/gs-edit/lib/gaussian-splats-3d.module.js",
        "jszip": "https://cdn.jsdelivr.net/npm/jszip@3.10.1/+esm",
        "gvrm": "https://naruya.github.io/gs-edit/lib/gaussian-vrm.min.js"
      }
    }
  </script>

  <script type="module">
    import * as THREE from 'three';
    import { GVRM } from 'gvrm';

    const canvas = document.getElementById('canvas');
    const renderer = new THREE.WebGLRenderer({ canvas });
    renderer.setSize(640, 480);

    const scene = new THREE.Scene();

    const camera = new THREE.PerspectiveCamera(65, 640 / 480, 0.01, 100);
    camera.position.set(0, 0.4, 1.5);

    // GVRM
    const gvrm = await GVRM.load('./assets/sample.gvrm', scene, camera, renderer);  // 1/3
    await gvrm.changeFBX('./assets/Idle.fbx');  // 2/3

    renderer.setAnimationLoop(() => {
      gvrm.update();  // 3/3
      renderer.render(scene, camera);
    });
  </script>
</body>
</html>
```

From now on, we'll skip the HTML part.

### 2. Use camera control and stand on the ground

- `simple-viewer2.html` ([DEMO](https://naruya.github.io/gs-edit/examples/simple-viewer2.html))

<img width="160" alt="simple-viewer2" src="https://i.gyazo.com/a831c9396e2fc953cc89754876d01ce2.png" />

```html
  <script type="module">
    import * as THREE from 'three';
    import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
    import { GVRM } from 'gvrm';

    const canvas = document.getElementById('canvas');
    const renderer = new THREE.WebGLRenderer({ canvas });
    renderer.setSize(640, 480);

    const scene = new THREE.Scene();

    // Axes
    const axesHelper = new THREE.AxesHelper(1);
    scene.add(axesHelper);

    const camera = new THREE.PerspectiveCamera(65, 640 / 480, 0.01, 100);
    camera.position.set(1.6, 1.6, 2.4);

    // OrbitControls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 1.0, 0);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.update();

    // GVRM
    const gvrm = await GVRM.load('./assets/sample.gvrm', scene, camera, renderer);
    gvrm.character.currentVrm.scene.position.y = 0;  // Stand on the ground
    // await gvrm.changeFBX('./assets/Idle.fbx');

    renderer.setAnimationLoop(() => {
      controls.update();
      gvrm.update();
      renderer.render(scene, camera);
    });
  </script>
```


### 3. Walk (change rotation + move forward)

- `simple-walker.html` ([DEMO](https://naruya.github.io/gs-edit/examples/simple-walker.html))

<img width="160" alt="simple-walker" src="https://i.gyazo.com/6f0fb23ec833725881b57a80315e0c69.png" />

```html
  <script type="module">
    import * as THREE from 'three';
    import { GVRM } from 'gvrm';

    const canvas = document.getElementById('canvas');
    const renderer = new THREE.WebGLRenderer({ canvas });
    renderer.setSize(640, 480);

    const scene = new THREE.Scene();

    const axesHelper = new THREE.AxesHelper(1);
    scene.add(axesHelper);

    const camera = new THREE.PerspectiveCamera(65, 640 / 480, 0.01, 100);
    camera.position.set(2.4, 2.4, 4);
    camera.lookAt(0, 1, 0);

    // GVRM
    const gvrm = await GVRM.load('./assets/sample.gvrm', scene, camera, renderer);
    const character = gvrm.character.currentVrm.scene;
    character.position.set(1, 0, 1);

    // Load Walking animation
    await gvrm.changeFBX('./assets/Walking.fbx');
    gvrm.character.action.play();

    const speed = 0.02;
    const turnInterval = 90;
    let frameCount = 0;

    // Get default rotation, set initial rotation
    const rot0 = character.rotation0.clone();
    character.rotation.y = -Math.PI / 2 + rot0.y;

    renderer.setAnimationLoop(() => {
      gvrm.update();

      frameCount++;

      // Turn 90°
      if (frameCount >= turnInterval) {
        frameCount = 0;
        character.rotation.y -= Math.PI / 2;
      }

      // Move forward
      const angle = character.rotation.y - rot0.y;
      character.position.x += speed * Math.sin(angle);
      character.position.z += speed * Math.cos(angle);

      renderer.render(scene, camera);
    });
  </script>
```

### 4. Keyboard walker (WASD)

- `simple-key-walker.html` ([DEMO](https://naruya.github.io/gs-edit/examples/simple-key-walker.html))

<img width="160" alt="simple-key-walker" src="https://i.gyazo.com/6e78b995975cba298cab2522e8cef376.png" />

```html
  <script type="module">
    import * as THREE from 'three';
    import { GVRM } from 'gvrm';

    const canvas = document.getElementById('canvas');
    const renderer = new THREE.WebGLRenderer({ canvas });
    renderer.setSize(640, 480);

    const scene = new THREE.Scene();

    const axesHelper = new THREE.AxesHelper(1);
    scene.add(axesHelper);

    const camera = new THREE.PerspectiveCamera(65, 640 / 480, 0.01, 100);
    camera.position.set(2.4, 2.4, 4);
    camera.lookAt(0, 1, 0);

    // GVRM
    const gvrm = await GVRM.load('./assets/sample.gvrm', scene, camera, renderer);
    const character = gvrm.character.currentVrm.scene;
    character.position.set(0, 0, 0);

    // Load Walking animation
    await gvrm.changeFBX('./assets/Walking.fbx');
    gvrm.character.action.play();

    const speed = 0.02;
    const rotationSpeed = 0.05;

    // Get default rotation
    const rot0 = character.rotation0.clone();

    // Keyboard state
    const keys = {};
    window.addEventListener('keydown', (e) => keys[e.key.toLowerCase()] = true);
    window.addEventListener('keyup', (e) => keys[e.key.toLowerCase()] = false);

    renderer.setAnimationLoop(() => {
      gvrm.update();

      // Rotation: A (left) / D (right)
      if (keys['a']) {
        character.rotation.y += rotationSpeed;
      }
      if (keys['d']) {
        character.rotation.y -= rotationSpeed;
      }

      // Movement: W (forward) / S (backward)
      const angle = character.rotation.y - rot0.y;
      if (keys['w']) {
        character.position.x += speed * Math.sin(angle);
        character.position.z += speed * Math.cos(angle);
      }
      if (keys['s']) {
        character.position.x -= speed * Math.sin(angle);
        character.position.z -= speed * Math.cos(angle);
      }

      renderer.render(scene, camera);
    });
  </script>
```


### 5. (coming soon...)

Planned examples:
- **Webcam control**
- **Gaussian Particle effects**
