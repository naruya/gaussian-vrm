// Copyright (c) 2025 naruya
// Licensed under the MIT License. See LICENSE file in the project root for full license information.


import * as THREE from 'three';


const MODEL_SCORE_THRESHOLD = 0.01;
const AXIS_SIZE = 0.02;


export class PoseDetector {
  constructor(scene, camera, renderer, imgId='capturedImage', canvasId='poseCanvas', canvasId2='poseCanvas2') {
    this.scene = scene;
    this.camera = camera;
    this.renderer = renderer;
    this.img = document.getElementById(imgId);
    this.canvas = document.getElementById(canvasId);
    this.canvas2 = document.getElementById(canvasId2);
    this.flagReady = false;
    this.keypointAxes = new Map();

    // Raycasterの初期化
    this.raycaster = new THREE.Raycaster();
    // 画像座標からNDC座標に変換するための一時ベクトル
    this.ndcCoord = new THREE.Vector2();

    this.setupProjectionPlane();
    this.loadingPromise = this.init();
  }

  setupProjectionPlane() {
    const planeGeometry = new THREE.PlaneGeometry(2, 2);
    const planeMaterial = new THREE.MeshBasicMaterial({
      color: 0x0000ff,
      side: THREE.DoubleSide
    });
    this.projectionPlane = new THREE.Mesh(planeGeometry, planeMaterial);
    this.projectionPlane.visible = false;

    this.scene.add(this.projectionPlane);
  }

  updateProjectionPlane() {
    this.projectionPlane.lookAt(this.camera.position);

    const distance = this.camera.position.length();
    const fov = this.camera.fov * Math.PI / 180;
    const planeHeight = Math.tan(fov / 2) * distance;
    const planeWidth = planeHeight * this.camera.aspect;

    this.projectionPlane.scale.set(planeWidth, planeHeight, 1);
    // 強制的に行列を更新
    this.projectionPlane.updateMatrixWorld(true);
  }

  initializeKeypointAxes(keypoints) {
    if (this.keypointAxes.size === 0) {
      keypoints.forEach((keypoint, index) => {
        if (keypoint.score >= MODEL_SCORE_THRESHOLD) {
          const axesHelper = new THREE.AxesHelper(AXIS_SIZE);
          axesHelper.renderOrder = 100;
          this.scene.add(axesHelper);
          this.keypointAxes.set(index, axesHelper);
        }
      });
    }
  }

  projectPointOnPlane(point, imageWidth, imageHeight) {
    this.ndcCoord.set(
      (point.x / imageWidth) * 2 - 1,
      -(point.y / imageHeight) * 2 + 1
    );

    this.raycaster.setFromCamera(this.ndcCoord, this.camera);

    const intersects = this.raycaster.intersectObject(this.projectionPlane);

    if (intersects.length > 0) {
      // project on plane
      // return intersects[0].point;

      const intersection = intersects[0].point;
      const depthScale = 0.5;
      const normalizedZ = (-point.z + 400) / 800;
      const depth = -normalizedZ * depthScale;
      intersection.addScaledVector(this.raycaster.ray.direction, depth);
      return intersection;
    }
    return null;
  }

  updateKeypointAxes(keypoints, imageWidth, imageHeight) {
    this.projectionPlane.updateMatrixWorld(true);

    keypoints.forEach((keypoint, index) => {
        if (keypoint.score >= MODEL_SCORE_THRESHOLD) {
            const axes = this.keypointAxes.get(index);
            if (axes) {
                const projectedPosition = this.projectPointOnPlane(keypoint, imageWidth, imageHeight);
                if (projectedPosition) {
                    axes.position.copy(projectedPosition);
                    axes.quaternion.copy(this.projectionPlane.quaternion);
                    axes.updateMatrixWorld(true);
                }
            }
        }
    });
}

  drawSkeleton2(keypoints, imageWidth, imageHeight) {
    if (!keypoints || keypoints.length === 0) return;
    this.initializeKeypointAxes(keypoints);
    this.updateKeypointAxes(keypoints, imageWidth, imageHeight);
  }

  drawSkeleton(keypoints, ctx) {
    ctx.lineWidth = 2;
    const adjacentPairs = poseDetection.util.getAdjacentPairs("BlazePose");

    for (const [i, j] of adjacentPairs) {
      const kp1 = keypoints[i];
      const kp2 = keypoints[j];

      const score1 = kp1.score != null ? kp1.score : 1;
      const score2 = kp2.score != null ? kp2.score : 1;

      if (score1 >= MODEL_SCORE_THRESHOLD && score2 >= MODEL_SCORE_THRESHOLD) {
        ctx.strokeStyle = (i <= 10 && j <= 10) ? 'red' : 'green';
        ctx.beginPath();
        ctx.moveTo(kp1.x, kp1.y);
        ctx.lineTo(kp2.x, kp2.y);
        ctx.stroke();
      }
    }
  }

  async init() {
    const model = poseDetection.SupportedModels.BlazePose;
    const detectorConfig = {
      runtime: 'tfjs',
      enableSmoothing: true,
      modelType: 'full'
    };
    this.detector = await poseDetection.createDetector(model, detectorConfig);
    this.flagReady = true;
    console.log('MoveNet loaded');
  }

  drawFace(poses, tempCanvas) {
    if (!poses || poses.length === 0) return;

    const pose = poses[0];
    const facePoints = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const faceKeypoints = facePoints.map(i => pose.keypoints[i])
      .filter(kp => kp.score >= MODEL_SCORE_THRESHOLD);

    if (faceKeypoints.length === 0) return;

    const xs = faceKeypoints.map(kp => kp.x);
    const ys = faceKeypoints.map(kp => kp.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);

    const margin = 30;
    const width = maxX - minX + margin * 2;
    const height = maxY - minY + margin * 2;

    const ctx2 = this.canvas2.getContext('2d');
    this.canvas2.height = 100;
    this.canvas2.width = (width * this.canvas2.height) / height;

    ctx2.drawImage(
      tempCanvas,
      minX - margin, minY - margin, width, height,
      0, 0, this.canvas2.width, this.canvas2.height
    );
  }

  async detect(dataURL, show=true) {
    if (!this.flagReady) return;

    this.updateProjectionPlane();

    const tempCanvas = document.createElement('canvas');
    const tempCtx = tempCanvas.getContext('2d');
    const tempImg = new Image();

    const boneCanvas = document.createElement('canvas');
    const boneCtx = boneCanvas.getContext('2d');

    tempImg.src = dataURL;
    await new Promise(resolve => tempImg.onload = resolve);

    tempCanvas.height = 720;
    tempCanvas.width = (720 * tempImg.width) / tempImg.height;
    tempCtx.drawImage(tempImg, 0, 0, tempCanvas.width, tempCanvas.height);

    boneCanvas.width = tempCanvas.width;
    boneCanvas.height = tempCanvas.height;
    boneCtx.drawImage(tempCanvas, 0, 0, tempCanvas.width, tempCanvas.height);

    this.canvas.width = (100 * tempImg.width) / tempImg.height;
    this.canvas.height = 100;

    try {
      const poses = await this.detector.estimatePoses(tempCanvas);

      if (!poses[0]) {
        return null;
      }

      this.drawSkeleton(poses[0].keypoints, boneCtx);
      if (show) {
        this.drawSkeleton2(poses[0].keypoints, tempCanvas.width, tempCanvas.height);
      }

      const ctx = this.canvas.getContext('2d');
      ctx.drawImage(boneCanvas, 0, 0, this.canvas.width, this.canvas.height);

      this.drawFace(poses, boneCanvas);

      this.img.style.visibility = 'visible';
      this.canvas.style.visibility = 'visible';
      // this.canvas2.style.visibility = 'visible';
      this.img.src = dataURL;
      return poses[0].keypoints;

    } catch (error) {
      console.error('Pose estimation failed:', error);
      return null;
    }
  }
}