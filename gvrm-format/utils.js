// Copyright (c) 2025 naruya
// Licensed under the MIT License. See LICENSE file in the project root for full license information.


import * as THREE from 'three';


// 14 colors
export const colors = [
  [255, 222, 62], [138, 119, 199], [243, 82, 82], [16, 157, 123], [43, 247, 242],
  [120, 84, 254], [157, 238, 149], [80, 105, 17], [39, 121, 232], [88, 149, 76],
  [22, 60, 188], [243, 67, 171], [94, 62, 2], [162, 192, 4]
];


// bone operations

export function applyBoneOperations(vrm, boneOperations) {
  for (const op of boneOperations) {
    const boneName = op.boneName;
    const rawBone = vrm.humanoid.getRawBoneNode(boneName);
    const normBone = vrm.humanoid.getNormalizedBoneNode(boneName);

    if (op.position) {
      rawBone.position.x += op.position.x;
      rawBone.position.y += op.position.y;
      rawBone.position.z += op.position.z;
    }

    if (op.rotation) {
      normBone.rotation.x = op.rotation.x * Math.PI / 180.0;
      normBone.rotation.y = op.rotation.y * Math.PI / 180.0;
      normBone.rotation.z = op.rotation.z * Math.PI / 180.0;
    }

    if (op.scale) {
      rawBone.scale.set(op.scale.x, op.scale.y, op.scale.z);
    }
  }
}


export function setPose(character, boneOperations) {
  applyBoneOperations(character.currentVrm, boneOperations);
  character.currentVrm.humanoid.update();
}


export function resetPose(character, boneOperations) {
  character.currentVrm.humanoid.resetRawPose();
  character.currentVrm.humanoid.resetNormalizedPose();
  setPose(character, boneOperations);
}


// visualization

export function visualizeVRM(character, flag) {
  const skinnedMesh = character.currentVrm.scene.children[character.skinnedMeshIndex];
  const face = character.faceIndex ? character.currentVrm.scene.children[character.faceIndex] : null;

  if (flag === null) {
    skinnedMesh.material.forEach(material => {
      // material.visible = !material.visible;
      material.colorWrite = !material.colorWrite;
      material.depthWrite = !material.depthWrite;
    });
    if (face) {
      face.visible = !face.visible;
    }
  } else {
    skinnedMesh.material.forEach(material => {
      // material.visible = flag;
      material.colorWrite = flag;
      material.depthWrite = flag;
    });
    if (face) {
      face.visible = flag;
    }
  }
}


export function visualizePMC(pmc, flag) {
  const { points, mesh, capsules } = pmc;

  if (flag === null) {
    points.visible = !points.visible;
    mesh.visible = !mesh.visible;
    capsules.children.forEach((capsule) => { capsule.visible = !capsule.visible; });
  } else {
    points.visible = flag;
    mesh.visible = flag;
    capsules.children.forEach((capsule) => { capsule.visible = flag; });
  }
}


export function visualizeBoneAxes(gvrm, flag) {
  if (!gvrm || !gvrm.debugAxes || gvrm.debugAxes.size === 0) return;

  const currentVisibility = gvrm.debugAxes.values().next().value.visible;
  gvrm.debugAxes.forEach((axesHelper) => {
    axesHelper.visible = !currentVisibility;
  });
}


export function removePMC(scene, pmc) {
  const { points, mesh, capsules } = pmc;

  if (points) { scene.remove(points); points.geometry.dispose(); points.material.dispose(); }
  if (mesh) { scene.remove(mesh); mesh.geometry.dispose(); mesh.material.dispose(); }
  if (capsules) {
    scene.remove(capsules);
    capsules.children.forEach((capsule) => {
      capsule.geometry.dispose(); capsule.material.dispose();
    });
  }
}


export function addPMC(scene, pmc) {
  const { points, mesh, capsules } = pmc;

  if (points) { scene.add(points); }
  if (mesh) { scene.add(mesh); }
  if (capsules) { scene.add(capsules); }
}


export function addChannels(fromArray, toArray, count, N = 1) {
  for (let i = 0; i < count; i++) {
    toArray[i * 4 + 0] = N > 3 ? 1.0 : fromArray[i * (4 - N) + 0];
    toArray[i * 4 + 1] = N > 2 ? 1.0 : fromArray[i * (4 - N) + 1];
    toArray[i * 4 + 2] = N > 1 ? 1.0 : fromArray[i * (4 - N) + 2];
    toArray[i * 4 + 3] = N > 0 ? 1.0 : fromArray[i * (4 - N) + 3];
  }
}


export function createDataTexture(...args) {
  const texture = new THREE.DataTexture(...args);
  texture.needsUpdate = true;
  return texture;
}


export function simpleAnim(character, t) {
  const s1 = Math.PI * 65 / 180 * Math.sin(Math.PI * (t / 60. + 0.5));
  const s2 = 0.4 * Math.PI * Math.sin(Math.PI * (t / 60.));
  character.currentVrm.humanoid.getNormalizedBoneNode('leftUpperArm').rotation.z = s1;
  character.currentVrm.humanoid.getNormalizedBoneNode('leftUpperLeg').rotation.x = s2;
  character.currentVrm.humanoid.getNormalizedBoneNode('leftLowerLeg').rotation.x = -Math.max(s2, 0);
  character.currentVrm.humanoid.getNormalizedBoneNode('rightLowerLeg').rotation.y = s2;
}


export const BONE_CONFIG = {
  arm: {
    names: ["J_Bip_L_Hand", "J_Bip_L_LowerArm", "J_Bip_R_Hand", "J_Bip_R_LowerArm"],
    radius: 0.06,
    scale: { x: 1.0, z: 1.0 }
  },
  leg: {
    names: ["J_Bip_L_LowerLeg", "J_Bip_L_Foot", "J_Bip_R_LowerLeg", "J_Bip_R_Foot"],
    radius: 0.08,
    scale: { x: 1.0, z: 1.0 }
  },
  torso: {
    names: ["J_Bip_C_Neck", "J_Bip_C_Spine", "J_Bip_C_Chest", "J_Bip_C_UpperChest"],
    radius: 0.03,
    scale: { x: 6.0, z: 4.0 }
  },
  headTop: {
    names: ["J_Bip_C_HeadTop_End"],
    radius: 0.06,
    scale: { x: 1.5, z: 2.0 }
  },
  head: {
    names: ["J_Bip_C_Head"],
    radius: 0.03,
    scale: { x: 2.0, z: 2.0 }
  }
};


export function getPointsMeshCapsules(character) {
  const skinnedMesh = character.currentVrm.scene.children[character.skinnedMeshIndex];

  const pointsMaterial = new THREE.PointsMaterial({
    color: 0xff0000,
    size: 0.02,
    opacity: 0.3,
    transparent: true
  });

  const meshMaterial = new THREE.MeshBasicMaterial({
    color: 0x00ff00,
    wireframe: true,
    opacity: 0.2,
    transparent: true
  });

  const capsuleMaterial = new THREE.MeshBasicMaterial({
    wireframe: true,
    opacity: 0.5,
    transparent: true
  });


  // points
  const pointsGeometry = new THREE.BufferGeometry();
  const vertices = [];

  const geometry = skinnedMesh.geometry;
  const position = geometry.getAttribute('position');
  const vertex = new THREE.Vector3();
  let skinnedVertex = new THREE.Vector3();

  for (let i = 0; i < position.count; i++) {
    vertex.fromBufferAttribute(position, i);
    skinnedVertex = skinnedMesh.applyBoneTransform(i, vertex);
    skinnedVertex.applyMatrix4(character.currentVrm.scene.matrixWorld);
    vertices.push(skinnedVertex.x, skinnedVertex.y, skinnedVertex.z);
  }

  pointsGeometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  const points = new THREE.Points(pointsGeometry, pointsMaterial);


  // mesh
  const meshGeometry = new THREE.BufferGeometry();
  meshGeometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  const index = skinnedMesh.geometry.getIndex();
  meshGeometry.setIndex(index);
  const mesh = new THREE.Mesh(meshGeometry, meshMaterial);


  // capsules
  const capsules = new THREE.Group();
  const capsuleBoneIndex = [];
  let nodeCount = 0;

  function _traverseNodes(node, depth = 0) {
    nodeCount++;
    // console.log(String(nodeCount).padStart(2, ' '), "  ".repeat(depth)+"- " , node.name);
    const nodePosition = new THREE.Vector3().setFromMatrixPosition(node.matrixWorld);

    node.children.forEach(function (childNode) {
      // make a capsule from parent to child
      if (childNode.isBone) {
        const childNodePosition = new THREE.Vector3().setFromMatrixPosition(childNode.matrixWorld);

        const distance = nodePosition.distanceTo(childNodePosition);
        const midPoint = new THREE.Vector3().addVectors(nodePosition, childNodePosition).multiplyScalar(0.5);

        // Find matching bone config
        let boneConfig = null;
        for (const configType of Object.values(BONE_CONFIG)) {
          if (configType.names.includes(childNode.name)) {
            boneConfig = configType;
            break;
          }
        }

        if (boneConfig) {
          const [r, g, b] = colors[capsules.children.length];
          const hexColor = (r << 16) | (g << 8) | b;

          const capsuleGeometry = new THREE.CapsuleGeometry(
            boneConfig.radius, distance - boneConfig.radius * 2, 1, 6);
          const capsule = new THREE.Mesh(capsuleGeometry, capsuleMaterial.clone());
          capsule.material.color.setHex(hexColor);
          capsule.scale.set(boneConfig.scale.x, 1, boneConfig.scale.z);
          capsule.position.copy(midPoint);

          const direction = new THREE.Vector3().subVectors(childNodePosition, nodePosition).normalize();
          const quaternion = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction);
          capsule.setRotationFromQuaternion(quaternion);
          capsule.updateMatrixWorld();

          const nodeIndex = skinnedMesh.skeleton.bones.indexOf(childNode);
          capsules.add(capsule);
          capsuleBoneIndex.push(nodeIndex);
        }

        _traverseNodes(childNode, depth + 1);
      }
    });
  }

  const rootNode = character.currentVrm.scene.children[0].children[0];
  _traverseNodes(rootNode, 1);

  const pmc = { points, mesh, capsules };
  return { pmc, capsuleBoneIndex };
}


