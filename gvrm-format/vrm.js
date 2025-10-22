// Copyright (c) 2025 naruya
// Licensed under the MIT License. See LICENSE file in the project root for full license information.


import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';


export class VRMCharacter {
    constructor(scene, modelUrl = null, animationUrl = null, scale = 1.0, center = false) {
        this.modelUrl = modelUrl;
        this.animationUrl = animationUrl;
        this.currentVrm = undefined;
        this.currentMixer = undefined;
        this.currentAction = undefined;
        this.previousAction = null;
        this.transitionDuration = 0.5;
        this.scene = scene;
        this.scale = scale;
        this.center = center;
        this._isLoading = true;
        this.clock = new THREE.Clock();
        this.loadVRM(this.modelUrl, this.animationUrl);
        this.place();
    }

    loadVRM(modelUrl = null, animationUrl = null, scale = null) {
        this._isLoading = true;

        if (modelUrl) this.modelUrl = modelUrl;
        if (animationUrl) this.animationUrl = animationUrl;
        if (scale) this.scale = scale;

        const loader = new GLTFLoader();
        loader.crossOrigin = 'anonymous';

        const helperRoot = new THREE.Group();
        helperRoot.renderOrder = 10000;
        helperRoot.clear();

        loader.register((parser) => {
            return new VRMLoaderPlugin(
                parser, { helperRoot: helperRoot, autoUpdateHumanBones: true });
        });

        this.loadingPromise = new Promise((resolve, reject) => {
            loader.load(
                this.modelUrl,

                async (gltf) => {
                    const vrm = gltf.userData.vrm;

					// calling these functions greatly improves the performance
					VRMUtils.removeUnnecessaryVertices( gltf.scene );
					VRMUtils.removeUnnecessaryJoints( gltf.scene );

                    this.currentVrm = vrm;

                    vrm.scene.traverse((obj) => {
                        obj.frustumCulled = false;
                    });

                    // don't add to vrm.scene for rotation0
                    // this.scene.add(helperRoot);

                    // calc bbox before scale for vrm.meta?.metaVersion==0
                    const bbsize = new THREE.Vector3();
                    const box = new THREE.Box3().setFromObject(vrm.scene);
                    box.getSize(bbsize);

                    // const helper = new THREE.Box3Helper( box, 0xffff00 );
                    // vrm.scene.add( helper );
                    this.ground = - bbsize.y * 0.5 * this.scale;

                    if (this.animationUrl && this.animationUrl !== '') {
                        await this.loadFBX(this.animationUrl);
                    }

                    // move after loadFBX
                    vrm.scene.position.y += this.ground;

                    vrm.scene.scale.setScalar(this.scale);

                    // scale joints
                    for (const joint of vrm.springBoneManager.joints) {
                        joint.settings.stiffness *= this.scale;
                        joint.settings.hitRadius *= this.scale;
                    }
                    // scale colliders
                    for (const collider of vrm.springBoneManager.colliders) {
                        const shape = collider.shape;
                        shape.radius *= this.scale;
                        if (shape.tail) {
                            shape.tail.multiplyScalar(this.scale);
                        }
                    }

                    // rotate if the VRM is VRM0.0
                    VRMUtils.rotateVRM0(vrm);
                    vrm.scene.updateMatrix();
                    vrm.scene.position0 = vrm.scene.position.clone();
                    vrm.scene.rotation0 = vrm.scene.rotation.clone();
                    vrm.scene.quaternion0 = vrm.scene.quaternion.clone();
                    vrm.scene.matrix0 = vrm.scene.matrix.clone();
                    vrm.hipPos0 = vrm.humanoid.getNormalizedBoneNode('hips').position.clone();

                    this._isLoading = false;
                    resolve(gltf);
                },
                (progress) => {
                    let progressLoaded = parseFloat(
                        (100.0 * (progress.loaded / progress.total)).toPrecision(3));
                    const loaddisplay = document.getElementById('loaddisplay');
                    if (loaddisplay) {
                        loaddisplay.innerHTML = progressLoaded + '%';
                    }
                },
                (error) => reject(error),
            );
        });
    }

    async loadFBX(animationUrl = null) {
        this._isLoading = true;
        if (animationUrl) this.animationUrl = animationUrl;

        if (!this.currentMixer) {
            this.currentMixer = new THREE.AnimationMixer(this.currentVrm.scene);
        }

        const clip = await loadMixamoAnimation(this.animationUrl, this.currentVrm, this.scale);

        this.previousAction = this.action;

        this.action = this.currentMixer.clipAction(clip);
        this.currentAction = this.action; // keywalker互換性のため

        if (this.previousAction) {
            this.previousAction.fadeOut(this.transitionDuration);

            this.action
                .reset()
                .setEffectiveTimeScale(1)
                .setEffectiveWeight(1)
                .fadeIn(this.transitionDuration)
                .play();
        } else {
            this.action.play();
            this.currentMixer.update(0);  // 要る？
            this.currentVrm.update(0);  // 要る？
        }
        this._isLoading = false;
    }

    async place() {
        await this.loadingPromise;
        this.scene.add(this.currentVrm.scene);
        if (!this.center) {
            this.currentVrm.scene.position.set(0.0, 0.0, 0.0);
        }
    }

    async leave(scene) {
        scene.remove(this.currentVrm.scene);
        VRMUtils.deepDispose(this.currentVrm.scene);
        this.currentVrm = undefined;
        this.currentMixer = undefined;
    }

    async changeVRM(scene, url, scale = null) {
        let pos = this.currentVrm.scene.position.clone();
        let rot = this.currentVrm.scene.rotation.clone();
        let rot0 = this.currentVrm.scene.rotation0.clone();
        pos.y = 0;

        await this.leave(scene);
        await this.loadVRM(url, null, scale);
        await this.place();

        // this.loadingPromise;
        let rot1 = this.currentVrm.scene.rotation0.clone();
        let e2q = e => new THREE.Quaternion().setFromEuler(e);
        rot = e2q(rot).multiply(e2q(rot0).clone().invert());
        rot = e2q(rot1).multiply(rot);
        rot = new THREE.Euler().setFromQuaternion(rot, "YZX");
        this.currentVrm.scene.position.copy(pos);
        this.currentVrm.scene.rotation.copy(rot);
        if (this.center) {
            this.currentVrm.scene.position.y += this.ground;
        }
    }

    async changeFBX(url) {
        await this.loadFBX(url);
    }

    // can be overridden
    isLoading() {
        return this._isLoading;
    }

    update() {
        if (this._isLoading) {
            return;
        }

        const deltaTime = this.clock.getDelta();
        if (this.currentVrm) {
            this.currentVrm.update(deltaTime);
        }
        if (this.currentMixer) {
            this.currentMixer.update(deltaTime);
        }
    }
}


/**
 * Load Mixamo animation, convert for three-vrm use, and return it.
 *
 * @param {string} url A url of mixamo animation data
 * @param {VRM} vrm A target VRM
 * @returns {Promise<THREE.AnimationClip>} The converted AnimationClip
 */
export function loadMixamoAnimation(url, vrm, scale) {

    const loader = new FBXLoader(); // A loader which loads FBX
    return loader.loadAsync(url).then((asset) => {

        const clip = THREE.AnimationClip.findByName(asset.animations, 'mixamo.com'); // extract the AnimationClip

        const tracks = []; // KeyframeTracks compatible with VRM will be added here

        const restRotationInverse = new THREE.Quaternion();
        const parentRestWorldRotation = new THREE.Quaternion();
        const _quatA = new THREE.Quaternion();
        const _vec3 = new THREE.Vector3();

        // Adjust with reference to hips height.
        const motionHipsHeight = asset.getObjectByName('mixamorigHips').position.y;
        const vrmHipsHeight = Math.abs(vrm.hipPos0.y) * scale;
        const hipsPositionScale = vrmHipsHeight / motionHipsHeight;

        clip.tracks.forEach((track) => {

            // Convert each tracks for VRM use, and push to `tracks`
            const trackSplitted = track.name.split('.');
            const mixamoRigName = trackSplitted[0];
            const vrmBoneName = mixamoVRMRigMap[mixamoRigName];
            const vrmNodeName = vrm.humanoid?.getNormalizedBoneNode(vrmBoneName)?.name;
            const mixamoRigNode = asset.getObjectByName(mixamoRigName);

            if (vrmNodeName != null) {

                const propertyName = trackSplitted[1];

                // Store rotations of rest-pose.
                mixamoRigNode.getWorldQuaternion(restRotationInverse).invert();
                mixamoRigNode.parent.getWorldQuaternion(parentRestWorldRotation);

                if (track instanceof THREE.QuaternionKeyframeTrack) {

                    // Retarget rotation of mixamoRig to NormalizedBone.
                    for (let i = 0; i < track.values.length; i += 4) {

                        const flatQuaternion = track.values.slice(i, i + 4);

                        _quatA.fromArray(flatQuaternion);

                        // 親のレスト時ワールド回転 * トラックの回転 * レスト時ワールド回転の逆
                        _quatA
                            .premultiply(parentRestWorldRotation)
                            .multiply(restRotationInverse);

                        _quatA.toArray(flatQuaternion);

                        flatQuaternion.forEach((v, index) => {

                            track.values[index + i] = v;

                        });

                    }

                    tracks.push(
                        new THREE.QuaternionKeyframeTrack(
                            `${vrmNodeName}.${propertyName}`,
                            track.times,
                            track.values.map((v, i) => (vrm.meta?.metaVersion === '0' && i % 2 === 0 ? - v : v)),
                        ),
                    );

                } else if (track instanceof THREE.VectorKeyframeTrack) {

                    const value = track.values.map((v, i) => (vrm.meta?.metaVersion === '0' && i % 3 !== 1 ? - v : v) * hipsPositionScale);
                    tracks.push(new THREE.VectorKeyframeTrack(`${vrmNodeName}.${propertyName}`, track.times, value));

                }

            }

        });

        return new THREE.AnimationClip('vrmAnimation', clip.duration, tracks);

    });

}


/**
 * A map from Mixamo rig name to VRM Humanoid bone name
 */
const mixamoVRMRigMap = {
    mixamorigHips: 'hips',
    mixamorigSpine: 'spine',
    mixamorigSpine1: 'chest',
    mixamorigSpine2: 'upperChest',
    mixamorigNeck: 'neck',
    mixamorigHead: 'head',
    mixamorigLeftShoulder: 'leftShoulder',
    mixamorigLeftArm: 'leftUpperArm',
    mixamorigLeftForeArm: 'leftLowerArm',
    mixamorigLeftHand: 'leftHand',
    mixamorigLeftHandThumb1: 'leftThumbMetacarpal',
    mixamorigLeftHandThumb2: 'leftThumbProximal',
    mixamorigLeftHandThumb3: 'leftThumbDistal',
    mixamorigLeftHandIndex1: 'leftIndexProximal',
    mixamorigLeftHandIndex2: 'leftIndexIntermediate',
    mixamorigLeftHandIndex3: 'leftIndexDistal',
    mixamorigLeftHandMiddle1: 'leftMiddleProximal',
    mixamorigLeftHandMiddle2: 'leftMiddleIntermediate',
    mixamorigLeftHandMiddle3: 'leftMiddleDistal',
    mixamorigLeftHandRing1: 'leftRingProximal',
    mixamorigLeftHandRing2: 'leftRingIntermediate',
    mixamorigLeftHandRing3: 'leftRingDistal',
    mixamorigLeftHandPinky1: 'leftLittleProximal',
    mixamorigLeftHandPinky2: 'leftLittleIntermediate',
    mixamorigLeftHandPinky3: 'leftLittleDistal',
    mixamorigRightShoulder: 'rightShoulder',
    mixamorigRightArm: 'rightUpperArm',
    mixamorigRightForeArm: 'rightLowerArm',
    mixamorigRightHand: 'rightHand',
    mixamorigRightHandPinky1: 'rightLittleProximal',
    mixamorigRightHandPinky2: 'rightLittleIntermediate',
    mixamorigRightHandPinky3: 'rightLittleDistal',
    mixamorigRightHandRing1: 'rightRingProximal',
    mixamorigRightHandRing2: 'rightRingIntermediate',
    mixamorigRightHandRing3: 'rightRingDistal',
    mixamorigRightHandMiddle1: 'rightMiddleProximal',
    mixamorigRightHandMiddle2: 'rightMiddleIntermediate',
    mixamorigRightHandMiddle3: 'rightMiddleDistal',
    mixamorigRightHandIndex1: 'rightIndexProximal',
    mixamorigRightHandIndex2: 'rightIndexIntermediate',
    mixamorigRightHandIndex3: 'rightIndexDistal',
    mixamorigRightHandThumb1: 'rightThumbMetacarpal',
    mixamorigRightHandThumb2: 'rightThumbProximal',
    mixamorigRightHandThumb3: 'rightThumbDistal',
    mixamorigLeftUpLeg: 'leftUpperLeg',
    mixamorigLeftLeg: 'leftLowerLeg',
    mixamorigLeftFoot: 'leftFoot',
    mixamorigLeftToeBase: 'leftToes',
    mixamorigRightUpLeg: 'rightUpperLeg',
    mixamorigRightLeg: 'rightLowerLeg',
    mixamorigRightFoot: 'rightFoot',
    mixamorigRightToeBase: 'rightToes',
};