// Copyright (c) 2025 naruya
// Licensed under the MIT License. See LICENSE file in the project root for full license information.


import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TrackballControls } from 'three/addons/controls/TrackballControls.js';
import { GVRM, GVRMUtils } from '../../gvrm-format/gvrm.js';
import { FPSCounter } from '../fps.js';
import { createSky, createHouses, createFloor, createParticleFloor } from './scene.js';
import * as Utils from '../../gvrm-format/utils.js';
import { Walker } from './walker.js';

// UI
const container = document.getElementById('threejs-container');
let width = window.innerWidth;
let height = window.innerHeight;

// params
const params = new URL(window.location.href).searchParams;

// renderer
const renderer = new THREE.WebGLRenderer({ antialias: true });
container.appendChild(renderer.domElement);
renderer.setSize(width, height);

// camera
const camera = new THREE.PerspectiveCamera(65.0, width / height, 0.01, 2000.0);
camera.position.set(2.0, 6.0, 12.0);
camera.aspect = width / height;
camera.updateProjectionMatrix();

const controls = new OrbitControls(camera, renderer.domElement);
controls.screenSpacePanning = true;
controls.target.set(0.0, 0.8, 0.0);
controls.minDistance = 0.1;
controls.maxDistance = 50;
controls.enableDamping = true;
controls.enableZoom = false;
controls.enablePan = false;
controls.update();

const controls2 = new TrackballControls(camera, renderer.domElement);
controls2.noRotate = true;
controls2.target.set(0.0, 0.4, 0.0);
controls2.noPan = false;
controls2.noZoom = false;
controls2.zoomSpeed = 0.25;
controls2.useDummyMouseWheel = true;
controls2.update();

// scene
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x000000);
const light = new THREE.DirectionalLight(0xffffff, Math.PI);
light.position.set(10.0, 10.0, 10.0);
scene.add(light);

// Scene management
let currentScene = 2; // Default is Scene 2 (dark)
let gridHelper = new THREE.GridHelper(300, 60, 0x808080, 0x808080); // Dark scene grid
scene.add(gridHelper);
const axesHelper = new THREE.AxesHelper(0.5);
scene.add(axesHelper);
let vectorFloor = createFloor(scene);
vectorFloor.visible = true; // Visible in Scene 2
let sky = createSky(scene, 2);
createHouses(scene);

// Function to update button styles
function updateButtonStyles() {
  const homeButton = document.getElementById('home-button');
  const sceneButton = document.getElementById('sceneButton');
  const increaseButton = document.getElementById('increaseButton');
  const decreaseButton = document.getElementById('decreaseButton');

  if (currentScene === 1) {
    // Bright scene: Black
    homeButton.style.color = 'rgba(0, 0, 0, 0.7)';
    homeButton.style.borderColor = 'rgba(0, 0, 0, 0.5)';
    homeButton.style.backgroundColor = 'rgba(0, 0, 0, 0.05)';
    sceneButton.style.color = 'rgba(0, 0, 0, 0.7)';
    sceneButton.style.borderColor = 'rgba(0, 0, 0, 0.5)';
    sceneButton.style.backgroundColor = 'rgba(0, 0, 0, 0.05)';
  } else {
    // Dark scene: White
    homeButton.style.color = 'rgba(255, 255, 255, 0.4)';
    homeButton.style.borderColor = 'rgba(255, 255, 255, 0.3)';
    homeButton.style.backgroundColor = 'rgba(0, 0, 0, 0.2)';
    sceneButton.style.color = 'rgba(255, 255, 255, 0.4)';
    sceneButton.style.borderColor = 'rgba(255, 255, 255, 0.3)';
    sceneButton.style.backgroundColor = 'rgba(0, 0, 0, 0.2)';
  }
}

// Set initial styles
updateButtonStyles();

const fbxFiles = [
  '../../assets/Breathing.fbx',
  '../../assets/Capoeira.fbx',
  '../../assets/Listening.fbx',
  '../../assets/Shrugging.fbx',
  '../../assets/Texting.fbx',
  '../../assets/Warrior.fbx',
  '../../assets/Around.fbx'
];

const gvrmFiles = [
  '../../assets/sample1.gvrm',
  '../../assets/sample2.gvrm',
  '../../assets/sample3.gvrm',
  '../../assets/sample4.gvrm',
  '../../assets/sample5.gvrm',
  // '../../assets/sample6.gvrm',
  // '../../assets/sample7.gvrm',
  '../../assets/sample8.gvrm'
  // '../../assets/sample9.gvrm'
];

// Limit avatar count to not exceed gvrmFiles length
const requestedN = parseInt(params.get('n')) || 1;
let N = Math.min(requestedN, 6); // Max 6 avatars

// Track current animation state for each model
const modelAnimations = [];

const gvrms = [];
const walkers = [];
let loadCount = 0;
let totalLoadCount = N;
window.gvrms = gvrms;

let allModelsReady = false;

const loadDisplay = document.getElementById('loaddisplay');


// Function to shuffle and assign animations without duplicates
function shuffleAnimations() {
  const indices = [...Array(fbxFiles.length).keys()];

  // Shuffle indices using Fisher-Yates algorithm
  for (let i = indices.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [indices[i], indices[j]] = [indices[j], indices[i]];
  }

  return indices;
}

async function loadAllModels() {
  const boundary = 7.5; // Use same boundary as walker

  for (let i = 0; i < N; i++) {
    const fileName = gvrmFiles[i].split('/').pop();
    const promise = GVRM.load(gvrmFiles[i], scene, camera, renderer, fileName);

    promise.then((gvrm) => {
      // Generate random initial position
      const randomX = (Math.random() - 0.5) * boundary * 2;
      const randomZ = (Math.random() - 0.5) * boundary * 2;
      const randomY = 0;

      // Generate random initial rotation
      const randomRotationY = (Math.random() - 0.5) * Math.PI * 2; // -π to π

      gvrm.character.currentVrm.scene.position.set(randomX, randomY, randomZ);
      gvrm.character.currentVrm.scene.rotation.y = randomRotationY;

      gvrms.push(gvrm);
      // Set initial animation to Idle
      modelAnimations.push(0);

      // Create Walker
      const walker = new Walker(gvrm, i);
      walkers.push(walker);

      // Load Idle.fbx then initialize Walker
      gvrm.changeFBX('../../assets/Idle.fbx').then(() => {
        loadCount++;
        updateLoadingDisplay();

        // Initialize Walker animations
        walker.initAnimations();

        if (loadCount === totalLoadCount) {
          allModelsReady = true;
        }
      });
    });
    await promise;
  }
}

function updateLoadingDisplay() {
  const percentage = Math.floor((loadCount / totalLoadCount) * 100);
  loadDisplay.textContent = percentage + '%';
}

// Function to set animation for individual model
async function setModelAnimation(gvrm, animationIndex) {
  if (gvrm && gvrm.isReady && !gvrm.character.isLoading()) {
    await gvrm.changeFBX(fbxFiles[animationIndex]);
  }
}

loadAllModels();

// Avatar count control
const avatarCountDisplay = document.getElementById('avatarCount');
const increaseButton = document.getElementById('increaseButton');
const decreaseButton = document.getElementById('decreaseButton');

function updateAvatarCountDisplay() {
  avatarCountDisplay.textContent = N;
  decreaseButton.disabled = N <= 1;
  increaseButton.disabled = N >= 6;
}

increaseButton.addEventListener('click', async () => {
  if (N < 6 && N < gvrmFiles.length) {
    const newIndex = N;
    N++;
    totalLoadCount = N;
    updateAvatarCountDisplay();

    // Load new avatar
    const fileName = gvrmFiles[newIndex].split('/').pop();
    const gvrm = await GVRM.load(gvrmFiles[newIndex], scene, camera, renderer, fileName);

    // Set random position and rotation
    const boundary = 7.5;
    const randomX = (Math.random() - 0.5) * boundary * 2;
    const randomZ = (Math.random() - 0.5) * boundary * 2;
    const randomRotationY = (Math.random() - 0.5) * Math.PI * 2;

    gvrm.character.currentVrm.scene.position.set(randomX, 0, randomZ);
    gvrm.character.currentVrm.scene.rotation.y = randomRotationY;

    gvrms.push(gvrm);
    modelAnimations.push(0);

    // Create Walker
    const walker = new Walker(gvrm, gvrms.length - 1);
    walkers.push(walker);

    // Load Idle.fbx then initialize Walker
    await gvrm.changeFBX('../../assets/Idle.fbx');
    walker.initAnimations();
    loadCount++;
    updateLoadingDisplay();

    if (loadCount >= totalLoadCount) {
      allModelsReady = true;
    }
  }
});

decreaseButton.addEventListener('click', async () => {
  if (N > 1 && gvrms.length > 0) {
    N--;
    totalLoadCount = N;
    loadCount = Math.min(loadCount, N);
    updateAvatarCountDisplay();
    updateLoadingDisplay();

    // Remove last avatar
    const gvrm = gvrms.pop();
    walkers.pop();
    modelAnimations.pop();

    if (gvrm) {
      await GVRM.remove(gvrm, scene);
    }
  }
});

updateAvatarCountDisplay();

const fpsc = new FPSCounter();

let stateAnim = "play";

window.addEventListener('resize', function (event) {
  width = window.innerWidth;
  height = window.innerHeight;
  renderer.setSize(width, height);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.render(scene, camera);
});

window.addEventListener('keydown', function (event) {
  if (event.code === "Space") {
    if (stateAnim === "play") {
      stateAnim = "pause";
      for (const gvrm of gvrms) {
        if (gvrm && gvrm.character && gvrm.character.action) {
          // Stop animation
          gvrm.character.action.stop();
          // Reset to default pose
          Utils.resetPose(gvrm.character, gvrm.boneOperations);
        }
      }
    } else {
      stateAnim = "play";
      for (const gvrm of gvrms) {
        if (gvrm && gvrm.character && gvrm.character.action) {
          // Resume animation
          gvrm.character.action.reset();
          gvrm.character.action.play();
        }
      }
    }
  }

  // Enable debug features only when N=1
  if (N === 1 && gvrms.length > 0) {
    const gvrm = gvrms[0];
    if (!gvrm || !gvrm.isReady) return;

    if (event.code === "KeyX") {
      // Toggle VRM mesh visibility
      GVRMUtils.visualizeVRM(gvrm.character, null);
    }
    if (event.code === "KeyZ") {
      // Toggle bone axes visibility
      GVRMUtils.visualizeBoneAxes(gvrm, null);
    }
  }
});

// Home button handler
document.getElementById('home-button').addEventListener('click', function() {
  window.location.href = '../../index.html';
});

// Scene switch button handler
document.getElementById('sceneButton').addEventListener('click', () => {
  // Toggle scene
  currentScene = currentScene === 1 ? 2 : 1;

  // Remove and recreate grid helper
  scene.remove(gridHelper);
  if (currentScene === 1) {
    gridHelper = new THREE.GridHelper(1000, 200, 0xdfdfdf, 0xdfefdf);
  } else {
    gridHelper = new THREE.GridHelper(300, 60, 0x808080, 0x808080);
  }
  scene.add(gridHelper);

  // Remove and recreate sky
  scene.remove(sky);
  sky = createSky(scene, currentScene);

  // Toggle vector field floor
  if (currentScene === 1) {
    // Scene 1: Hide floor
    if (vectorFloor) {
      vectorFloor.visible = false;
    }
  } else {
    // Scene 2: Show floor
    if (vectorFloor) {
      vectorFloor.visible = true;
    }
  }

  // Update button styles
  updateButtonStyles();
});

// Drag and drop implementation
container.addEventListener('dragover', (event) => {
  event.preventDefault();
  event.stopPropagation();

  const file = event.dataTransfer.items[0];
  if (file && file.type === '' && event.dataTransfer.items[0].getAsFile()?.name.endsWith('.gvrm')) {
    container.style.backgroundColor = 'rgba(100, 100, 100, 0.2)';
  }
});

container.addEventListener('dragleave', (event) => {
  event.preventDefault();
  event.stopPropagation();
  container.style.backgroundColor = '';
});

container.addEventListener('drop', async (event) => {
  event.preventDefault();
  event.stopPropagation();
  container.style.backgroundColor = '';

  const files = event.dataTransfer.files;
  if (files.length === 0) return;

  const file = files[0];
  if (!file.name.endsWith('.gvrm')) {
    console.error('Not a .gvrm file');
    return;
  }

  // Get center character (index 0)
  const centerGVRM = gvrms[0];
  if (!centerGVRM || !centerGVRM.isReady) {
    console.error('Center character not ready');
    return;
  }

  try {
    // Read file as Blob
    const blob = new Blob([file], { type: file.type });
    const url = URL.createObjectURL(blob);

    // Save current animation index
    const currentAnimIndex = modelAnimations[0];

    // Remove existing GVRM
    await centerGVRM.remove(scene);

    // Load new GVRM
    const newGVRM = await GVRM.load(url, scene, camera, renderer, file.name);

    // Set position (center position)
    newGVRM.character.currentVrm.scene.position.set(0, 0, 1);

    // Update gvrms array
    gvrms[0] = newGVRM;

    // Apply current animation
    await newGVRM.changeFBX(fbxFiles[currentAnimIndex]);

    // Release URL
    URL.revokeObjectURL(url);

    console.log(`Replaced center character with: ${file.name}`);
  } catch (error) {
    console.error('Failed to load dropped GVRM:', error);
  }
});

function updateRenderOrder() {
  if (!allModelsReady || gvrms.length === 0) return;

  const cameraPosition = camera.position.clone();

  const modelDistances = gvrms.map((gvrm, index) => {
    if (!gvrm || !gvrm.isReady || !gvrm.character || !gvrm.character.currentVrm) {
      return { index, distance: Infinity };
    }
    const modelPosition = gvrm.character.currentVrm.scene.position.clone();
    const distance = modelPosition.distanceTo(cameraPosition);
    return { index, distance };
  });

  modelDistances.sort((a, b) => b.distance - a.distance);

  modelDistances.forEach((model, sortedIndex) => {
    const { index } = model;
    const gvrm = gvrms[index];

    if (gvrm && gvrm.isReady && gvrm.gs && gvrm.gs.viewer && gvrm.gs.viewer.viewer && gvrm.gs.viewer.viewer.splatMesh) {
      gvrm.gs.viewer.viewer.splatMesh.renderOrder = sortedIndex;
    }
  });
}

function animate() {
  if (!allModelsReady) {
    requestAnimationFrame(animate);
    return;
  }

  // Update vector field floor animation
  if (vectorFloor) {
    vectorFloor.material.uniforms.time.value = performance.now() * 0.001;
  }

  for (let i = 0; i < gvrms.length; i++) {
    const gvrm = gvrms[i];
    if (gvrm && gvrm.isReady) {
      // Update Walker
      if (walkers[i]) {
        walkers[i].update();
      }

      // Update entire GVRM (includes character.update() and updateByBones())
      gvrm.update();
    }
  }

  updateRenderOrder();
  controls.update();
  controls2.update();
  renderer.render(scene, camera);
  fpsc.update();
  requestAnimationFrame(animate);
}

animate();
