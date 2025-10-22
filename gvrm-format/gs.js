// Copyright (c) 2025 naruya
// Licensed under the MIT License. See LICENSE file in the project root for full license information.


import * as THREE from 'three';
import * as GS3D from 'gaussian-splats-3d';


export class GaussianSplatting extends THREE.Group {
  constructor(urls, scale, gsPosition, quaternion) {
    super();
    this.loadGS(urls, scale, gsPosition, quaternion);
  }

  loadGS(urls, scale, gsPosition=[0, 0, 0], quaternion=[0, 0, 1, 0]) {

    if (!Array.isArray(urls)) {
      urls = [urls];
    }

    this.loadingPromise = new Promise(async (resolve, reject) => {
      let viewer = new GS3D.DropInViewer({
        // 'gpuAcceleratedSort': true,  // ?
        'sharedMemoryForWorkers': false,  // ?
        'dynamicScene': true,  // changed
        'sceneRevealMode': 2,
        'sphericalHarmonicsDegree': 2,
        // 'optimizeSplatData': false,  // not implemented at 8ef8abc
        // 'plyInMemoryCompressionLevel': 0,
      });

      const sceneOptions = urls.map(url => ({
        'path': url,
        'scale': [scale, scale, scale],
        'position': gsPosition,
        'rotation': quaternion,  // z rot 180
        'splatAlphaRemovalThreshold': 0
      }));

      await viewer.addSplatScenes(sceneOptions, false);

      this.add(viewer);  // THREE.Group
      this.viewer = viewer;
      // These are directly overwritten in splats and separated from the viewer's pose.
      this.position0 = new THREE.Vector3(...gsPosition);
      this.quaternion0 = new THREE.Quaternion(...quaternion);
      this.rotation0 = new THREE.Euler().setFromQuaternion(this.quaternion0);
      this.matrix0 = new THREE.Matrix4().compose(this.position0, this.quaternion0, new THREE.Vector3(1, 1, 1));

      resolve(this);
    }, undefined, function (error) {
      console.error(error);
    });
  }
}