// Copyright (c) 2025 naruya
// Licensed under the MIT License. See LICENSE file in the project root for full license information.


import * as THREE from 'three';
import { VRButton } from 'three/addons/webxr/VRButton.js';
import { XRControllerModelFactory } from "three/addons/webxr/XRControllerModelFactory.js";

/**
 * VR機能をセットアップする
 * @param {THREE.WebGLRenderer} renderer - Three.jsのレンダラー
 * @param {HTMLElement} container - VRButtonを追加するコンテナ
 * @param {THREE.Scene} scene - Three.jsのシーン
 * @param {Object} gvrm - GVRMオブジェクト
 * @param {Array} gvrmFiles - GVRMファイルのパス配列
 * @param {Array} fbxFiles - FBXファイルのパス配列
 * @param {THREE.Camera} camera - カメラ
 * @param {string} fileName - ファイル名
 * @returns {Object} VRコントローラーオブジェクト
 */
export function setupVR(renderer, container, scene, gvrm, gvrmFiles, fbxFiles, camera, fileName) {
  renderer.xr.enabled = true;  // experimental
  const button = VRButton.createButton(renderer);
  button.style.bottom = '60px';
  container.appendChild(button);

  const controllerModelFactory = new XRControllerModelFactory();

  const geometry = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(0, 0, -1),
  ]);
  const line = new THREE.Line(geometry);
  line.name = "line";
  line.scale.z = 5;

  function addController(index) {
    const controller = renderer.xr.getController(index);
    scene.add(controller);

    const controllerGrip = renderer.xr.getControllerGrip(index);
    controllerGrip.add(
      controllerModelFactory.createControllerModel(controllerGrip)
    );
    scene.add(controllerGrip);

    controller.add(line.clone());
    return controller;
  }

  const controller0 = addController(0);
  const controller1 = addController(1);

  let currentGvrmIndex = 0;
  let currentFbxIndex = 0;

  async function onSelectStart0(event) {
    const controller = event.target;
    const direction = new THREE.Vector3(0, 0, -1);
    direction.applyQuaternion(controller.quaternion);

    if (direction.y > 0) {
      await gvrm.remove(scene);
      await gvrm.load(gvrmFiles[currentGvrmIndex], scene, camera, renderer, fileName);
      currentGvrmIndex = (currentGvrmIndex + 1) % gvrmFiles.length;
    } else {
      await gvrm.changeFBX(fbxFiles[currentFbxIndex]);
      currentFbxIndex = (currentFbxIndex + 1) % fbxFiles.length;
    }
  }

  controller0.addEventListener("selectstart", onSelectStart0);

  return {
    controller0,
    controller1,
    getCurrentGvrmIndex: () => currentGvrmIndex,
    getCurrentFbxIndex: () => currentFbxIndex,
    setCurrentGvrmIndex: (index) => { currentGvrmIndex = index; },
    setCurrentFbxIndex: (index) => { currentFbxIndex = index; }
  };
}
