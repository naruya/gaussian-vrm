// Copyright (c) 2025 naruya
// Licensed under the MIT License. See LICENSE file in the project root for full license information.


import * as THREE from 'three';
import * as GVRMUtils from '../../gvrm-format/utils.js';


export async function finalCheck(pmc, moveCameraAndDetect_, camera, scene, renderer, poseDetector, radius, vrmScale, thresh = 0.15) {
  let capsules = pmc.capsules;
  try {
    console.log("Final Checking...");

    // smooth camera move
    await moveCameraAndDetect_(camera, scene, renderer, poseDetector, 0, radius, 1.25 * vrmScale, true);
    await moveCameraAndDetect_(camera, scene, renderer, poseDetector, -Math.PI / 4.0, radius, 1.25 * vrmScale, true);

    // Define 11 camera angles around the front view
    const cameraAngles = [-75 * Math.PI / 180, -60 * Math.PI / 180, -45 * Math.PI / 180, -30 * Math.PI / 180, -15 * Math.PI / 180,
      0,
    15 * Math.PI / 180, 30 * Math.PI / 180, 45 * Math.PI / 180, 60 * Math.PI / 180, 75 * Math.PI / 180];

    // Important capsule indices
    const headIndex = 5;       // 'J_Bip_C_HeadTop_End'
    const leftHandIndex = 7;   // 'J_Bip_L_Hand'
    const rightHandIndex = 9;  // 'J_Bip_R_Hand'
    const leftFootIndex = 11;  // 'J_Bip_L_Foot'
    const rightFootIndex = 13; // 'J_Bip_R_Foot'

    let failedAngles = 0;
    const totalAngles = cameraAngles.length;

    // Check from each angle
    for (let i = 0; i < totalAngles; i++) {
      const angle = cameraAngles[i];
      const angleDegrees = angle * (180 / Math.PI);

      // Move camera to specified angle and detect pose
      await moveCameraAndDetect_(camera, scene, renderer, poseDetector, angle, radius, 1.25 * vrmScale, true);

      // Get 3D positions of important capsules
      const headPosition = new THREE.Vector3().setFromMatrixPosition(capsules.children[headIndex].matrixWorld);
      const leftHandPosition = new THREE.Vector3().setFromMatrixPosition(capsules.children[leftHandIndex].matrixWorld);
      const rightHandPosition = new THREE.Vector3().setFromMatrixPosition(capsules.children[rightHandIndex].matrixWorld);
      const leftFootPosition = new THREE.Vector3().setFromMatrixPosition(capsules.children[leftFootIndex].matrixWorld);
      const rightFootPosition = new THREE.Vector3().setFromMatrixPosition(capsules.children[rightFootIndex].matrixWorld);

      // Convert 3D positions to screen coordinates
      const headScreenPos = headPosition.clone().project(camera);
      const leftHandScreenPos = leftHandPosition.clone().project(camera);
      const rightHandScreenPos = rightHandPosition.clone().project(camera);
      const leftFootScreenPos = leftFootPosition.clone().project(camera);
      const rightFootScreenPos = rightFootPosition.clone().project(camera);

      // Convert normalized coordinates to pixel coordinates and normalize by screen height
      const toNormalizedCoords = (pos) => {
        const pixelX = (pos.x + 1) / 2 * renderer.domElement.width;
        const pixelY = (-pos.y + 1) / 2 * renderer.domElement.height;

        return {
          x: pixelX / renderer.domElement.height,
          y: pixelY / renderer.domElement.height
        };
      };

      const headNormPos = toNormalizedCoords(headScreenPos);
      const leftHandNormPos = toNormalizedCoords(leftHandScreenPos);
      const rightHandNormPos = toNormalizedCoords(rightHandScreenPos);
      const leftFootNormPos = toNormalizedCoords(leftFootScreenPos);
      const rightFootNormPos = toNormalizedCoords(rightFootScreenPos);

      // Get positions from keypointAxes
      const nosePosition = poseDetector.keypointAxes.get(0) ?
        toNormalizedCoords(new THREE.Vector3().setFromMatrixPosition(poseDetector.keypointAxes.get(0).matrixWorld).project(camera)) : null;
      const leftWristPosition = poseDetector.keypointAxes.get(15) ?
        toNormalizedCoords(new THREE.Vector3().setFromMatrixPosition(poseDetector.keypointAxes.get(15).matrixWorld).project(camera)) : null;
      const rightWristPosition = poseDetector.keypointAxes.get(16) ?
        toNormalizedCoords(new THREE.Vector3().setFromMatrixPosition(poseDetector.keypointAxes.get(16).matrixWorld).project(camera)) : null;
      const leftAnklePosition = poseDetector.keypointAxes.get(27) ?
        toNormalizedCoords(new THREE.Vector3().setFromMatrixPosition(poseDetector.keypointAxes.get(27).matrixWorld).project(camera)) : null;
      const rightAnklePosition = poseDetector.keypointAxes.get(28) ?
        toNormalizedCoords(new THREE.Vector3().setFromMatrixPosition(poseDetector.keypointAxes.get(28).matrixWorld).project(camera)) : null;

      // Log normalized positions for each important body part
      console.log(`Angle ${angleDegrees.toFixed(0)}° view:`);
      console.log(`  Head position:`, headNormPos);
      console.log(`  Pose detection nose:`, nosePosition || "not detected");
      console.log(`  Left hand position:`, leftHandNormPos);
      console.log(`  Pose detection left wrist:`, leftWristPosition || "not detected");
      console.log(`  Right hand position:`, rightHandNormPos);
      console.log(`  Pose detection right wrist:`, rightWristPosition || "not detected");
      console.log(`  Left foot position:`, leftFootNormPos);
      console.log(`  Pose detection left ankle:`, leftAnklePosition || "not detected");
      console.log(`  Right foot position:`, rightFootNormPos);
      console.log(`  Pose detection right ankle:`, rightAnklePosition || "not detected");

      // Calculate L2 distance
      const calculateL2Distance = (pos1, pos2) => {
        if (!pos1 || !pos2) return null;
        return Math.sqrt(Math.pow(pos1.x - pos2.x, 2) + Math.pow(pos1.y - pos2.y, 2));
      };

      // Define checks to perform (same for all angles)
      const checksToPerform = [
        { name: "head", model: headNormPos, detection: nosePosition },
        { name: "left hand", model: leftHandNormPos, detection: leftWristPosition },
        { name: "right hand", model: rightHandNormPos, detection: rightWristPosition },
        { name: "left foot", model: leftFootNormPos, detection: leftAnklePosition },
        { name: "right foot", model: rightFootNormPos, detection: rightAnklePosition }
      ];

      let angleHasError = false;

      // Check L2 distance for each body part
      for (const check of checksToPerform) {
        const distance = calculateL2Distance(check.model, check.detection);

        // If detection is not available
        if (distance === null) {
          console.error(`Final check failed. ${angleDegrees.toFixed(0)}° view: ${check.name} check failed. Detection not available.`);
          angleHasError = true;
          break;
        }

        console.log(`  ${check.name} distance: ${distance.toFixed(4)}`);

        // If distance exceeds threshold
        if (distance > thresh) {
          console.error(`Final check failed. ${angleDegrees.toFixed(0)}° view: ${check.name} position mismatch. L2 distance: ${distance.toFixed(4)} (threshold: ${thresh})`);
          angleHasError = true;
          break;
        }
      }

      if (angleHasError) {
        failedAngles++;
      }
    }

    // Fail if 3 or more angles have errors
    if (failedAngles >= 3) {  // PARAM
      console.error(`Final check failed: ${failedAngles} out of ${totalAngles} angles have errors.`);
      throw new Error(`Final check failed: ${failedAngles} out of ${totalAngles} angles have errors.`);
    }

    console.log(`Final Check passed with ${failedAngles} failed angles out of ${totalAngles}!`);

  } catch (error) {
    GVRMUtils.visualizePMC(pmc, true);
    renderer.render(scene, camera);
    console.error(`Error in final check: ${error.message}`);
    throw new Error(`Error in final check: ${error.message}`);
  }
}
