// Copyright (c) 2025 naruya
// Licensed under the MIT License. See LICENSE file in the project root for full license information.


import * as THREE from 'three';
import * as GVRMUtils from './utils.js';
import { VRMCharacter } from './vrm.js';
import { GaussianSplatting } from './gs.js';
import { PLYParser } from './ply.js';
import JSZip from 'jszip'


export class GVRM extends THREE.Group {
  constructor(character, gs) {
    super();
    this.character = character;
    this.gs = gs;
    this.debugAxes = new Map();
    this.isReady = false;
    this.t = 0;
  }

  static async initVRM(vrmPath, scene, camera, renderer, modelScale, boneOperations) {
    if ( !boneOperations ) {
      boneOperations = (await (await fetch("./assets/default.json")).json()).boneOperations;
    }
    if ( !modelScale ) {
      modelScale = 1.0;
    }
    const character = new VRMCharacter(scene, vrmPath, '', modelScale, true);
    await character.loadingPromise;

    character.skinnedMeshIndex = 1;
    character.faceIndex = undefined;
    if (character.currentVrm.scene.children.length > 4) {
      character.skinnedMeshIndex = 2;
      character.faceIndex = 1;
    }

    const skinnedMesh = character.currentVrm.scene.children[character.skinnedMeshIndex];

    GVRMUtils.visualizeVRM(character, false);

    GVRMUtils.setPose(character, boneOperations);

    // character.currentVrm.scene.updateMatrixWorld(true);
    skinnedMesh.skeleton.update();
    skinnedMesh.skeleton.computeBoneTexture();
    skinnedMesh.geometry.computeVertexNormals();

    if (character.skinnedMeshIndex === 2) {
      const headNode = character.currentVrm.humanoid.getRawBoneNode('head');
      const headTopEndNode = new THREE.Bone();
      headTopEndNode.name = "J_Bip_C_HeadTop_End";
      headTopEndNode.position.set(0, 0.2, -0.05);
      headTopEndNode.updateMatrixWorld(true);
      headNode.add(headTopEndNode);
      skinnedMesh.skeleton.bones.push(headTopEndNode);
      skinnedMesh.bind(new THREE.Skeleton(skinnedMesh.skeleton.bones), skinnedMesh.matrixWorld);
    }
    // call renderer.render after skinnedMesh.bind (?)
    renderer.render(scene, camera);  // ???

    // do not use .clone(), texture.image will be shared unexpectedly
    // const boneTexture0 = skinnedMesh.skeleton.boneTexture.clone();
    skinnedMesh.bindMatrix0 = skinnedMesh.bindMatrix.clone();
    skinnedMesh.bindMatrixInverse0 = skinnedMesh.bindMatrixInverse.clone();

    const widthtex = skinnedMesh.skeleton.boneTexture.image.width;
    const heighttex = skinnedMesh.skeleton.boneTexture.image.height;
    const format = skinnedMesh.skeleton.boneTexture.format;
    const type = skinnedMesh.skeleton.boneTexture.type;
    const dataCopy = skinnedMesh.skeleton.boneTexture.image.data.slice();
    skinnedMesh.boneTexture0 = new THREE.DataTexture(dataCopy, widthtex, heighttex, format, type);
    skinnedMesh.boneTexture0.needsUpdate = true;

    return character;
  }


  static async initGS(gsPath, gsPosition, gsQuaternion, scene) {
    const gs = await new GaussianSplatting(gsPath, 1, gsPosition, gsQuaternion);

    await gs.loadingPromise;  // TODO: refactor
    scene.add(gs);

    gs.splatMesh = gs.viewer.splatMesh;
    gs.centers = gs.splatMesh.splatDataTextures.baseData.centers;
    gs.colors = gs.splatMesh.splatDataTextures.baseData.colors;
    gs.covariances = gs.splatMesh.splatDataTextures.baseData.covariances;
    gs.splatCount = gs.splatMesh.geometry.attributes.splatIndex.array.length;

    gs.centers0 = new Float32Array(gs.centers);
    gs.colors0 = new Float32Array(gs.colors);
    gs.covariances0 = new Float32Array(gs.covariances);
    gs.splatMesh.updateDataTexturesFromBaseData(0, gs.splatCount - 1);

    return gs;
  }


  static async load(url, scene, camera, renderer, fileName) {
    console.log('Loading GVRM:', url);
    const response = await fetch(url);
    const zip = await JSZip.loadAsync(response.arrayBuffer());
    const vrmBuffer = await zip.file('model.vrm').async('arraybuffer');
    const plyBuffer = await zip.file('model.ply').async('arraybuffer');
    const extraData = JSON.parse(await zip.file('data.json').async('text'));

    const vrmBlob = new Blob([vrmBuffer], { type: 'application/octet-stream' });
    const vrmUrl = URL.createObjectURL(vrmBlob);

    const plyBlob = new Blob([plyBuffer], { type: 'application/octet-stream' });
    const plyUrl = URL.createObjectURL(plyBlob);

    const modelScale = extraData.modelScale;
    const boneOperations = extraData.boneOperations;

    if (extraData.splatRelativePoses === undefined) {  // TODO: remove
      extraData.splatRelativePoses = extraData.relativePoses;
    }

    const character = await GVRM.initVRM(
      vrmUrl, scene, camera, renderer, modelScale, boneOperations);

    // dynamic sort (choose one splat sort)
    const { sceneSplatIndices, boneSceneMap } = GVRM.sortSplatsByBones(extraData);
    // const { sceneSplatIndices, vertexSceneMap } = GVRM.sortSplatsByVertices(extraData);
    const parser = new PLYParser();
    const sceneUrls  = await parser.splitPLY(plyUrl, sceneSplatIndices);

    const gs = await GVRM.initGS(sceneUrls, extraData.gsPosition, extraData.gsQuaternion, scene);

    const gvrm = new GVRM(character, gs);
    gvrm.modelScale = modelScale;
    gvrm.boneOperations = boneOperations;
    // dynamic sort (choose one map)
    gvrm.boneSceneMap = boneSceneMap;
    // gvrm.vertexSceneMap = vertexSceneMap;
    gvrm.fileName = fileName;

    gvrm.updatePMC();
    GVRMUtils.addPMC(scene, gvrm.pmc);
    GVRMUtils.visualizePMC(gvrm.pmc, false);
    renderer.render(scene, camera);

    gvrm.gs.splatVertexIndices = extraData.splatVertexIndices;
    gvrm.gs.splatBoneIndices = extraData.splatBoneIndices;
    gvrm.gs.splatRelativePoses = extraData.splatRelativePoses;
    GVRM.gsCustomizeMaterial(character, gs);

    // cleanup splats that are too far from the associated bone
    for (let i = 0; i < gvrm.gs.splatCount; i++) {
      let distance = Math.sqrt(
        gvrm.gs.splatRelativePoses[i * 3 + 0] ** 2 +
        gvrm.gs.splatRelativePoses[i * 3 + 1] ** 2 +
        gvrm.gs.splatRelativePoses[i * 3 + 2] ** 2
      );
      if (gvrm.gs.splatBoneIndices[i] !== 57 && distance > 0.2) {  // exclude head
        gvrm.gs.colors[i * 4 + 3] = 0;
      } else if (gvrm.gs.splatBoneIndices[i] == 21 && distance > 0.1) {  // left foot
        gvrm.gs.colors[i * 4 + 3] = 0;
      } else if (gvrm.gs.splatBoneIndices[i] == 19 && distance > 0.1) {  // right foot
        gvrm.gs.colors[i * 4 + 3] = 0;
      } else if (gvrm.gs.splatBoneIndices[i] === 57 && distance > 0.3) {  // head
        gvrm.gs.colors[i * 4 + 3] = 0;
      }
    }

    gvrm.gs.splatMesh.updateDataTexturesFromBaseData(0, gvrm.gs.splatCount - 1);


    function _traverseNodes(node, depth = 0) {
      node.children.forEach(function (childNode) {
        if (childNode.isBone) {
          const types = [
            "J_Bip_L_Hand", "J_Bip_L_LowerArm", "J_Bip_R_Hand", "J_Bip_R_LowerArm",
            "J_Bip_L_LowerLeg", "J_Bip_L_Foot", "J_Bip_R_LowerLeg", "J_Bip_R_Foot",
            "J_Bip_C_Neck", "J_Bip_C_Spine", "J_Bip_C_Chest", "J_Bip_C_UpperChest",
            "J_Bip_C_HeadTop_End",
            "J_Bip_C_Head"];
          if (types.includes(childNode.name)) {
            childNode.updateMatrix();
            childNode.matrixWorld0 = childNode.matrixWorld.clone();
          }
          _traverseNodes(childNode, depth + 1);
        }
      });
    }

    const rootNode = character.currentVrm.scene.children[0].children[0];
    _traverseNodes(rootNode, 1);


    gvrm.isReady = true

    return gvrm;
  }

  static async save(gvrm, vrmPath, gsPath, boneOperations, modelScale, fileName, savePly=false) {
    const vrmBuffer = await fetch(vrmPath).then(response => response.arrayBuffer());
    const plyBuffer = await fetch(gsPath).then(response => response.arrayBuffer());

    const extraData = {
      modelScale: modelScale,
      boneOperations: boneOperations,
      gsQuaternion: gvrm.gs.viewer.splatMesh.scenes[0].quaternion.toArray(),
      gsPosition: gvrm.gs.viewer.splatMesh.scenes[0].position.toArray(),
      splatVertexIndices: gvrm.gs.splatVertexIndices,
      splatBoneIndices: gvrm.gs.splatBoneIndices,
      splatRelativePoses: gvrm.gs.splatRelativePoses,
    };

    const zip = new JSZip();

    zip.file('model.vrm', vrmBuffer);
    zip.file('model.ply', plyBuffer);
    zip.file('data.json', JSON.stringify(extraData, null, 2));

    const content = await zip.generateAsync({ type: 'blob' });

    if (!fileName && gsPath.endsWith('.ply')) {
      fileName = gsPath.split('/').pop().replace('.ply', '.gvrm');
    } else if (!fileName) {  // blob
      fileName = gsPath.split('/').pop() + '.gvrm';
    }

    _downloadBlob(content, fileName);

    if (savePly) {
      console.log('savePly!');
      const plyBlob = new Blob([plyBuffer], { type: 'application/octet-stream' });
      const plyFileName = fileName.replace('.gvrm', '_processed.ply');
      _downloadBlob(plyBlob, plyFileName);
    }

    function _downloadBlob(blob, fileName) {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      a.click();
      if (blob === content && gvrm.url) {  // GVRM
        URL.revokeObjectURL(gvrm.url);
      }
      if (blob === content) {  // GVRM
        gvrm.url = url;
      }
       else {  // PLY
        URL.revokeObjectURL(url);
      }
    }
  }


  static async remove(gvrm, scene) {
    if (gvrm.character) {
      await gvrm.character.leave(scene);
      gvrm.character = null;
    }

    if (gvrm.gs) {
      await gvrm.gs.viewer.dispose();
      gvrm.gs = null;
    }

    if (gvrm.pmc) {
      GVRMUtils.removePMC(scene, gvrm.pmc);
    }
  }

  async load(url, scene, camera, renderer, fileName=null) {
    const _gvrm = await GVRM.load(url, scene, camera, renderer, fileName);

    // TODO: refactor
    this.character = _gvrm.character;
    // this.character.animationUrl = animationUrl;
    // this.character.currentMixer = currentMixer;
    this.gs = _gvrm.gs;
    this.modelScale = _gvrm.modelScale;
    this.boneOperations = _gvrm.boneOperations;
    this.boneSceneMap = _gvrm.boneSceneMap;
    this.vertexSceneMap = _gvrm.vertexSceneMap;
    this.fileName = _gvrm.fileName;
    this.isReady = true;
  }

  async save(vrmPath, gsPath, boneOperations, modelScale, fileName, savePly=false) {
    await GVRM.save(this, vrmPath, gsPath, boneOperations, modelScale, fileName, savePly);
  }

  async remove(scene) {
    this.isReady = false;
    await GVRM.remove(this, scene);
  }

  async changeFBX(url) {
    // GVRMUtils.resetPose(this.character, this.boneOperations);
    await this.character.changeFBX(url);
  }

  updatePMC() {
    const { pmc } = GVRMUtils.getPointsMeshCapsules(this.character);
    this.pmc = pmc;
  }

  updateByBones() {
    const tempNodePos = new THREE.Vector3();
    const tempChildPos = new THREE.Vector3();
    const tempMidPoint = new THREE.Vector3();
    const tempMat = new THREE.Matrix4();
    const tempQuat = new THREE.Quaternion();
    const noSortBoneList = [
      "J_Bip_C_Neck", "J_Bip_C_Spine", "J_Bip_C_Chest", "J_Bip_C_UpperChest", "J_Bip_C_HeadTop_End", "J_Bip_C_Head"
    ];

    const skeleton = this.character.currentVrm.scene.children[2].skeleton;

    skeleton.bones.forEach((bone) => {
      const children = bone.children;
      if (children.length === 0) return;

      children.forEach(childBone => {
        const childIndex = skeleton.bones.indexOf(childBone);
        const sceneIndex = this.boneSceneMap[childIndex];
        if (sceneIndex === undefined) return;

        bone.updateMatrixWorld(true);
        childBone.updateMatrixWorld(true);
        tempNodePos.setFromMatrixPosition(bone.matrixWorld);
        tempChildPos.setFromMatrixPosition(childBone.matrixWorld);
        tempMidPoint.addVectors(tempNodePos, tempChildPos).multiplyScalar(0.5);
        tempMidPoint.sub(this.character.currentVrm.scene.position).add(this.character.currentVrm.scene.position0);
        tempMidPoint.applyQuaternion(this.gs.viewer.quaternion.clone().invert());

        tempMat.extractRotation(childBone.matrixWorld.multiply(childBone.matrixWorld0.clone().invert()));
        tempQuat.setFromRotationMatrix(tempMat);
        tempQuat.premultiply(this.gs.viewer.quaternion.clone().invert());
        tempQuat.multiply(this.gs.quaternion0);

        const scene = this.gs.viewer.getSplatScene(sceneIndex);
        if (scene) {
          if (!noSortBoneList.includes(childBone.name)) {
            scene.position.copy(tempMidPoint);
            scene.quaternion.copy(tempQuat);
          }
          let axesHelper = this.debugAxes.get(sceneIndex);
          if (!axesHelper) {
            axesHelper = this.createDebugAxes(sceneIndex);
          }
          axesHelper.position.copy(tempMidPoint);
          axesHelper.quaternion.copy(tempQuat);
          // axesHelper.quaternion.copy(tempQuat);
        }
      });
    });
  }

  // deprecated
  // updateByVertices() {}

  createDebugAxes(sceneIndex) {
    const axesHelper = new THREE.AxesHelper(0.3);
    axesHelper.visible = false;
    this.gs.add(axesHelper);
    this.debugAxes.set(sceneIndex, axesHelper);
    return axesHelper;
  }

  update() {
    if (!this.isReady) return;
    let tempQuat = this.character.currentVrm.scene.quaternion.clone();
    let tempQuat0 = this.character.currentVrm.scene.quaternion0.clone();
    let tempPos = this.character.currentVrm.scene.position.clone();
    let tempPos0 = this.character.currentVrm.scene.position0.clone();
    this.gs.viewer.quaternion.copy(tempQuat.multiply(tempQuat0.invert()));
    this.gs.viewer.position.copy(tempPos.sub(tempPos0));
    // this.t += 1.0; GVRMUtils.simpleAnim(this.character, this.t);  // debug
    this.updateByBones();
    this.character.update();
  }

  static sortSplatsByBones(extraData) {
    const sceneSplatIndices = {};

    let sceneCount = 0;
    const boneSceneMap = {};

    for (let i = 0; i < extraData.splatBoneIndices.length; i++) {
      const boneIndex = extraData.splatBoneIndices[i];

      if (boneSceneMap[boneIndex] === undefined) {
        boneSceneMap[boneIndex] = sceneCount;
        sceneCount++;
        sceneSplatIndices[boneSceneMap[boneIndex]] = [];
      }
      sceneSplatIndices[boneSceneMap[boneIndex]].push(i);
    }

    GVRM.updateExtraData(extraData, sceneSplatIndices);

    return { sceneSplatIndices, boneSceneMap };
  }


  // deprecated
  // static sortSplatsByVertices(extraData) {}


  static updateExtraData(extraData, sceneSplatIndices) {

    let splatIndices = [];
    for (let i = 0; i < Object.keys(sceneSplatIndices).length; i++) {
      splatIndices = splatIndices.concat(sceneSplatIndices[i]);
    }

    const splatVertexIndices = [];
    const splatBoneIndices = [];
    const splatRelativePoses = [];

    for (const sceneIndex of Object.keys(sceneSplatIndices)) {
      for (const splatIndex of sceneSplatIndices[sceneIndex]) {
        splatVertexIndices.push(extraData.splatVertexIndices[splatIndex]);
        splatBoneIndices.push(extraData.splatBoneIndices[splatIndex]);
        splatRelativePoses.push(
          extraData.splatRelativePoses[splatIndex * 3],
          extraData.splatRelativePoses[splatIndex * 3 + 1],
          extraData.splatRelativePoses[splatIndex * 3 + 2]
        );
      }
    }

    extraData.splatVertexIndices = splatVertexIndices;
    extraData.splatBoneIndices = splatBoneIndices;
    extraData.splatRelativePoses = splatRelativePoses;
  }


  static gsCustomizeMaterial(character, gs) {

    gs.splatMesh.material = gs.splatMesh.material.clone();
    gs.splatMesh.material.needsUpdate = true;

    const skinnedMesh = character.currentVrm.scene.children[character.skinnedMeshIndex];

    const meshVertexCount = skinnedMesh.geometry.attributes.position.count;

    const meshPositions = skinnedMesh.geometry.attributes.position.array;
    const meshNormals = skinnedMesh.geometry.attributes.normal.array;
    const meshSkinIndices = skinnedMesh.geometry.attributes.skinIndex.array;
    const meshSkinWeights = skinnedMesh.geometry.attributes.skinWeight.array;
    const gsVertexIndices = gs.splatVertexIndices;
    const gsRelativePoses = gs.splatRelativePoses;

    const meshPositionData = new Float32Array(4096*1024*4);
    const meshNormalData = new Float32Array(4096*1024*4);
    const meshSkinIndexData = new Float32Array(4096*1024*4);
    const meshSkinWeightData = new Float32Array(4096*1024*4);
    const gsMeshVertexIndexData = new Float32Array(4096*1024*4);
    const gsMeshRelativePosData = new Float32Array(4096*1024*4);

    GVRMUtils.addChannels(meshPositions, meshPositionData, meshVertexCount, 1);
    GVRMUtils.addChannels(meshNormals, meshNormalData, meshVertexCount, 1);
    meshSkinIndexData.set(meshSkinIndices);
    meshSkinWeightData.set(meshSkinWeights);
    GVRMUtils.addChannels(gsVertexIndices, gsMeshVertexIndexData, gs.splatCount, 3);
    GVRMUtils.addChannels(gsRelativePoses, gsMeshRelativePosData, gs.splatCount, 1);

    const meshPositionTexture = GVRMUtils.createDataTexture(
      meshPositionData, 4096, 1024, THREE.RGBAFormat, THREE.FloatType);
    const meshNormalTexture = GVRMUtils.createDataTexture(
      meshNormalData, 4096, 1024, THREE.RGBAFormat, THREE.FloatType);
    const meshSkinIndexTexture = GVRMUtils.createDataTexture(
      meshSkinIndexData, 4096, 1024, THREE.RGBAFormat, THREE.FloatType);
    const meshSkinWeightTexture = GVRMUtils.createDataTexture(
      meshSkinWeightData, 4096, 1024, THREE.RGBAFormat, THREE.FloatType);
    const gsMeshVertexIndexTexture = GVRMUtils.createDataTexture(
      gsMeshVertexIndexData, 4096, 1024, THREE.RGBAFormat, THREE.FloatType);
    const gsMeshRelativePosTexture = GVRMUtils.createDataTexture(
      gsMeshRelativePosData, 4096, 1024, THREE.RGBAFormat, THREE.FloatType);

    gs.splatMesh.material.onBeforeCompile = function (shader) {
      shader.uniforms.meshPositionTexture = { value: meshPositionTexture };
      shader.uniforms.meshNormalTexture = { value: meshNormalTexture };
      shader.uniforms.meshSkinIndexTexture = { value: meshSkinIndexTexture };
      shader.uniforms.meshSkinWeightTexture = { value: meshSkinWeightTexture };
      shader.uniforms.gsMeshVertexIndexTexture = { value: gsMeshVertexIndexTexture };
      shader.uniforms.gsMeshRelativePosTexture = { value: gsMeshRelativePosTexture };
      shader.uniforms.bindMatrix0 = { value: skinnedMesh.bindMatrix0 };
      shader.uniforms.bindMatrix = { value: skinnedMesh.bindMatrix };
      shader.uniforms.bindMatrixInverse0 = { value: skinnedMesh.bindMatrixInverse0 };
      shader.uniforms.bindMatrixInverse = { value: skinnedMesh.bindMatrixInverse };
      shader.uniforms.boneTexture0 = { value: skinnedMesh.boneTexture0 };
      shader.uniforms.boneTexture = { value: skinnedMesh.skeleton.boneTexture };
      shader.uniforms.meshMatrixWorld = { value: character.currentVrm.scene.matrixWorld };
      shader.uniforms.gsMatrix0 = { value: gs.matrix0 };
      shader.uniforms.gsMatrix = { value: gs.viewer.matrixWorld };

      // console.log('Vertex Shader:', shader.vertexShader);
      // console.log('Fragment Shader:', shader.fragmentShader);

      shader.vertexShader = shader.vertexShader.replace(
        '#include <common>',
        `
        #define USE_SKINNING

        #include <common>
        #include <skinning_pars_vertex>  // boneTexture

        uniform sampler2D meshPositionTexture;
        uniform sampler2D meshNormalTexture;
        uniform sampler2D meshSkinIndexTexture;
        uniform sampler2D meshSkinWeightTexture;
        uniform sampler2D gsMeshVertexIndexTexture;
        uniform sampler2D gsMeshRelativePosTexture;
        uniform mat4 meshMatrixWorld;
        uniform mat4 gsMatrix0;
        uniform mat4 gsMatrix;

        uniform mat4 bindMatrix0;
        uniform mat4 bindMatrixInverse0;
        uniform highp sampler2D boneTexture0;

        mat4 getBoneMatrix0( const in float i ) {
          int size = textureSize( boneTexture0, 0 ).x;
          int j = int( i ) * 4;
          int x = j % size;
          int y = j / size;
          vec4 v1 = texelFetch( boneTexture0, ivec2( x, y ), 0 );
          vec4 v2 = texelFetch( boneTexture0, ivec2( x + 1, y ), 0 );
          vec4 v3 = texelFetch( boneTexture0, ivec2( x + 2, y ), 0 );
          vec4 v4 = texelFetch( boneTexture0, ivec2( x + 3, y ), 0 );
          return mat4( v1, v2, v3, v4 );
        }

        // TODO: check this
        vec4 quatFromMat3(mat3 m) {
          float trace = m[0][0] + m[1][1] + m[2][2];
          vec4 q;

          if (trace > 0.0) {
            float s = 0.5 / sqrt(trace + 1.0);
            q.w = 0.25 / s;
            q.x = (m[2][1] - m[1][2]) * s;
            q.y = (m[0][2] - m[2][0]) * s;
            q.z = (m[1][0] - m[0][1]) * s;
          } else if (m[0][0] > m[1][1] && m[0][0] > m[2][2]) {
            float s = 2.0 * sqrt(1.0 + m[0][0] - m[1][1] - m[2][2]);
            q.w = (m[2][1] - m[1][2]) / s;
            q.x = 0.25 * s;
            q.y = (m[0][1] + m[1][0]) / s;
            q.z = (m[0][2] + m[2][0]) / s;
          } else if (m[1][1] > m[2][2]) {
            float s = 2.0 * sqrt(1.0 + m[1][1] - m[0][0] - m[2][2]);
            q.w = (m[0][2] - m[2][0]) / s;
            q.x = (m[0][1] + m[1][0]) / s;
            q.y = 0.25 * s;
            q.z = (m[1][2] + m[2][1]) / s;
          } else {
            float s = 2.0 * sqrt(1.0 + m[2][2] - m[0][0] - m[1][1]);
            q.w = (m[1][0] - m[0][1]) / s;
            q.x = (m[0][2] + m[2][0]) / s;
            q.y = (m[1][2] + m[2][1]) / s;
            q.z = 0.25 * s;
          }
          return q;
        }

        vec4 quatInverse(vec4 q) {
          return vec4(-q.x, -q.y, -q.z, q.w) / dot(q, q);
        }

        vec4 quatMultiply(vec4 a, vec4 b) {
          return vec4(
            a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
            a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
            a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w,
            a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z
          );
        }

        mat3 mat3FromQuat(vec4 q) {
          float x = q.x, y = q.y, z = q.z, w = q.w;
          float x2 = x + x, y2 = y + y, z2 = z + z;
          float xx = x * x2, xy = x * y2, xz = x * z2;
          float yy = y * y2, yz = y * z2, zz = z * z2;
          float wx = w * x2, wy = w * y2, wz = w * z2;

          return mat3(
            1.0 - (yy + zz), xy - wz, xz + wy,
            xy + wz, 1.0 - (xx + zz), yz - wx,
            xz - wy, yz + wx, 1.0 - (xx + yy)
          );
        }
        `
      );

      shader.vertexShader = shader.vertexShader.replace(
        'mat4 transform = transforms[sceneIndex]',  // transforms are used for sorting only
        'mat4 transform = gsMatrix * gsMatrix0;'  // order
      );

      shader.vertexShader = shader.vertexShader.replace(
        'vec3 splatCenter = uintBitsToFloat(uvec3(sampledCenterColor.gba));',
        `
        vec2 samplerUV2 = vec2(0.0, 0.0);
        float d2 = float(splatIndex) / 4096.0;
        samplerUV2.y = float(floor(d2)) / 1024.0;
        samplerUV2.x = fract(d2);
        float meshVertexIndex = texture2D(gsMeshVertexIndexTexture, samplerUV2).r;
        vec3 relativePos = texture2D(gsMeshRelativePosTexture, samplerUV2).rgb;

        vec2 samplerUV3 = vec2(0.0, 0.0);
        float d3 = float(meshVertexIndex) / 4096.0;
        samplerUV3.y = float(floor(d3)) / 1024.0;
        samplerUV3.x = fract(d3);
        vec3 transformed = texture2D(meshPositionTexture, samplerUV3).rgb;
        vec3 objectNormal = texture2D(meshNormalTexture, samplerUV3).rgb;
        vec4 skinIndex = texture2D(meshSkinIndexTexture, samplerUV3);
        vec4 skinWeight = texture2D(meshSkinWeightTexture, samplerUV3);

        mat4 boneMatX0 = getBoneMatrix0( skinIndex.x );
        mat4 boneMatY0 = getBoneMatrix0( skinIndex.y );
        mat4 boneMatZ0 = getBoneMatrix0( skinIndex.z );
        mat4 boneMatW0 = getBoneMatrix0( skinIndex.w );
        mat4 skinMatrix0 = mat4( 0.0 );
        skinMatrix0 += skinWeight.x * boneMatX0;
        skinMatrix0 += skinWeight.y * boneMatY0;
        skinMatrix0 += skinWeight.z * boneMatZ0;
        skinMatrix0 += skinWeight.w * boneMatW0;
        skinMatrix0 = bindMatrixInverse0 * skinMatrix0 * bindMatrix0;

        #include <skinbase_vertex>  // boneMat
        #include <skinnormal_vertex>  // skinMatrix, using normal
        #include <defaultnormal_vertex>  // ?
        #include <skinning_vertex>

        // vec3 splatCenter = ( vec4(transformed, 1.0) ).xyz;
        // vec3 splatCenter = ( meshMatrixWorld * vec4(transformed, 1.0) ).xyz;
        // vec3 splatCenter = ( meshMatrixWorld * vec4(transformed + relativePos, 1.0) ).xyz;  // GOOD

        vec3 skinnedRelativePos = vec4( skinMatrix * inverse(skinMatrix0) * vec4( relativePos, 0.0 ) ).xyz;
        vec3 splatCenter = ( meshMatrixWorld * vec4(transformed + skinnedRelativePos, 1.0) ).xyz;
        `
      );

      shader.vertexShader = shader.vertexShader.replace(
        // NOTE: transformModelViewMatrix == viewMatrix * transform;  // SplatMaterial.js 143
        'vec4 viewCenter = transformModelViewMatrix * vec4(splatCenter, 1.0);',
        `
        // The splatCenter is the coordinate system for inverse(transform).
        splatCenter = (inverse(transform) * vec4(splatCenter, 1.0)).xyz;
        vec4 viewCenter = transformModelViewMatrix * vec4(splatCenter, 1.0);
        `
      );

      shader.vertexShader = shader.vertexShader.replace(
        'mat3 cov2Dm = transpose(T) * Vrk * T;',
        `
        // for debug
        // Vrk[0][0] *= 25.0; Vrk[1][1] *= 0.1; Vrk[2][2] *= 0.1;
        // Vrk[1][1] *= 25.0; Vrk[0][0] *= 0.1; Vrk[2][2] *= 0.1;
        // Vrk[2][2] *= 25.0; Vrk[0][0] *= 0.1; Vrk[1][1] *= 0.1;

        // via quat
        mat3 gsRotation0 = mat3(gsMatrix0);
        mat3 skinRotationMatrix = mat3(skinMatrix * inverse(skinMatrix0));
        mat3 relativeRotation = transpose(gsRotation0) * skinRotationMatrix * gsRotation0;
        vec4 tempQuat = quatFromMat3(relativeRotation);
        tempQuat.y = -tempQuat.y;  // Hardcode, maybe bug in quatFromMat3?
        relativeRotation = mat3FromQuat(tempQuat);
        mat3 rotatedVrk = transpose(relativeRotation) * Vrk * relativeRotation;
        mat3 cov2Dm = transpose(T) * rotatedVrk * T;

        // TODO: via mat
        // mat3 gsRotation0 = mat3(gsMatrix0);
        // mat3 skinRotationMatrix = mat3(skinMatrix * inverse(skinMatrix0));
        // mat3 relativeRotation = transpose(gsRotation0) * skinRotationMatrix * gsRotation0;
        // mat3 rotatedVrk = transpose(relativeRotation) * Vrk * relativeRotation;
        // mat3 cov2Dm = transpose(T) * rotatedVrk * T;
        `
      );
    };
    gs.splatMesh.material.needsUpdate = true;
  }
}


export * as GVRMUtils from './utils.js';