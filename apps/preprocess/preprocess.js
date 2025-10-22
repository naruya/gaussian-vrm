// Copyright (c) 2025 naruya
// Licensed under the MIT License. See LICENSE file in the project root for full license information.


import * as THREE from 'three';
import { GVRM } from '../../gvrm-format/gvrm.js';
import { PLYParser } from '../../gvrm-format/ply.js';
import * as GVRMUtils from '../../gvrm-format/utils.js';
import { PoseDetector } from './pose.js';
import { DropInViewer } from 'gaussian-splats-3d';
import { assignSplatsToBonesGL, assignSplatsToPointsGL } from './preprocess_gl.js';
import { finalCheck } from './check.js';


async function assignSplatsToBones(gs, capsules, capsuleBoneIndex, fast = false) {
  gs.splatBoneIndices = [];
  let bestCi = 0;

  for (let i = 0; i < gs.splatCount; i++) {
    if (fast && i % 10 !== 0) {  // CHANGED
      bestCi = bestCi;
      gs.splatBoneIndices.push(capsuleBoneIndex[bestCi]);
      gs.colors[i * 4 + 0] = GVRMUtils.colors[bestCi][0];
      gs.colors[i * 4 + 1] = GVRMUtils.colors[bestCi][1];
      gs.colors[i * 4 + 2] = GVRMUtils.colors[bestCi][2];
      continue;
    }
    let targetPoint = new THREE.Vector3(gs.centers0[i * 3 + 0], gs.centers0[i * 3 + 1], gs.centers0[i * 3 + 2]);
    targetPoint.applyMatrix4(gs.viewer.splatMesh.scenes[0].matrixWorld);

    let minDistance = Infinity;
    bestCi = 0;

    for (let ci = 0; ci < capsules.children.length; ci++) {
      const capsule = capsules.children[ci];
      const geometry = capsule.geometry;
      const position = geometry.getAttribute('position');
      const index = geometry.index;

      const triangle = new THREE.Triangle();

      for (let ii = 0; ii < index.count; ii += 3) {
        let a = new THREE.Vector3().fromBufferAttribute(position, index.getX(ii));
        let b = new THREE.Vector3().fromBufferAttribute(position, index.getX(ii + 1));
        let c = new THREE.Vector3().fromBufferAttribute(position, index.getX(ii + 2));

        a.applyMatrix4(capsule.matrixWorld);
        b.applyMatrix4(capsule.matrixWorld);
        c.applyMatrix4(capsule.matrixWorld);

        triangle.set(a, b, c);

        let closestPoint = new THREE.Vector3();
        triangle.closestPointToPoint(targetPoint, closestPoint);

        let distance = targetPoint.distanceTo(closestPoint);

        if (distance < minDistance) {
          minDistance = distance;
          bestCi = ci;
        }
      }
    }

    gs.splatBoneIndices.push(capsuleBoneIndex[bestCi]);

    gs.colors[i * 4 + 0] = GVRMUtils.colors[bestCi][0];
    gs.colors[i * 4 + 1] = GVRMUtils.colors[bestCi][1];
    gs.colors[i * 4 + 2] = GVRMUtils.colors[bestCi][2];

    if (i % 100 == 0) {
      let progress = (i / gs.splatCount) * 100;
      document.getElementById('loaddisplay').innerHTML = progress.toFixed(1) + '% (1/3)';
      // allowing the browser to render asynchronously
      // don't call this for every splat
      gs.splatMesh.updateDataTexturesFromBaseData(0, gs.splatCount - 1);
      await new Promise(resolve => setTimeout(resolve, 0));
    }
  }

  gs.splatMesh.updateDataTexturesFromBaseData(0, gs.splatCount - 1);
  document.getElementById('loaddisplay').innerHTML = (100).toFixed(1) + '% (1/3)';
}


async function assignSplatsToPoints(character, gs, capsules, capsuleBoneIndex, fast = false) {
  const skinnedMesh = character.currentVrm.scene.children[character.skinnedMeshIndex];
  gs.splatVertexIndices = [];

  const position = skinnedMesh.geometry.getAttribute('position');
  const boneVertexIndices = {};

  Object.values(capsuleBoneIndex).forEach(value => {
    boneVertexIndices[value] = [];
  });

  // ``vrm mesh の'' 各頂点がどのboneに一番近いかを確認 (not splats)
  // splatBoneIndices に含まれる bone の頂点だけ使う
  for (let i = 0; i < position.count; i++) {
    const vertex = new THREE.Vector3().fromBufferAttribute(position, i);
    const skinnedVertex = skinnedMesh.applyBoneTransform(i, vertex);
    skinnedVertex.applyMatrix4(character.currentVrm.scene.matrixWorld);

    let minDistance = Infinity;
    let bestCi = undefined;

    // Find the nearest triangle in the capsule  // skinnedWeight might be used (?)
    for (let ci = 0; ci < capsules.children.length; ci++) {
      const capsule = capsules.children[ci];
      const capsuleGeometry = capsule.geometry;
      const capsulePosition = capsuleGeometry.getAttribute('position');
      const index = capsuleGeometry.index;

      const triangle = new THREE.Triangle();

      // For each triangle in the capsule, find the vertex of the VRM mesh that is closest to that triangle
      for (let ii = 0; ii < index.count; ii += 3) {
        let a = new THREE.Vector3().fromBufferAttribute(capsulePosition, index.getX(ii));
        let b = new THREE.Vector3().fromBufferAttribute(capsulePosition, index.getX(ii + 1));
        let c = new THREE.Vector3().fromBufferAttribute(capsulePosition, index.getX(ii + 2));

        a.applyMatrix4(capsule.matrixWorld);
        b.applyMatrix4(capsule.matrixWorld);
        c.applyMatrix4(capsule.matrixWorld);

        triangle.set(a, b, c);

        let closestPoint = new THREE.Vector3();
        triangle.closestPointToPoint(skinnedVertex, closestPoint);

        let distance = skinnedVertex.distanceTo(closestPoint);

        if (distance < minDistance) {
          minDistance = distance;
          bestCi = ci;
        }
      }
    }

    boneVertexIndices[capsuleBoneIndex[bestCi]].push(i);

    if (i % 100 == 0) {
      let progress = (i / position.count) * 100;
      document.getElementById('loaddisplay').innerHTML = progress.toFixed(1) + '% (2/3)';
      gs.splatMesh.updateDataTexturesFromBaseData(0, gs.splatCount - 1);
      await new Promise(resolve => setTimeout(resolve, 0));
    }
  }

  document.getElementById('loaddisplay').innerHTML = (100).toFixed(1) + '% (2/3)';

  // Object.entries(boneVertexIndices).forEach(([boneIndex, vertices]) => {
  //   console.log(`Bone ${boneIndex} vertices: first=${vertices[0]}, last=${vertices[vertices.length-1]}, count=${vertices.length}`);
  // });

  // 各 splat について、それが所属している bone を取得し、その bone にアサインされた vertices の中から一番近いものを探す。
  for (let i = 0; i < gs.splatCount; i++) {
    let targetPoint = new THREE.Vector3(gs.centers0[i * 3 + 0], gs.centers0[i * 3 + 1], gs.centers0[i * 3 + 2]);
    targetPoint.applyMatrix4(gs.viewer.splatMesh.scenes[0].matrixWorld);

    let minDistance = Infinity;
    let bestVi = 0;

    let boneIndex = gs.splatBoneIndices[i];
    let vertexIndices = boneVertexIndices[boneIndex];

    // fast なら3, not fast なら1
    let skip = fast ? 3 : 1;
    for (let vi = 0; vi < vertexIndices.length; vi += skip) {  // CHANGED
      const vertexIndex = vertexIndices[vi];
      const vertex = new THREE.Vector3().fromBufferAttribute(position, vertexIndex);
      const skinnedVertex = skinnedMesh.applyBoneTransform(vertexIndex, vertex);
      skinnedVertex.applyMatrix4(character.currentVrm.scene.matrixWorld);

      let distance = skinnedVertex.distanceTo(targetPoint);

      if (distance < minDistance) {
        minDistance = distance;
        bestVi = vi;
      }
    }
    gs.splatVertexIndices.push(vertexIndices[bestVi]);


    // // GL版と比較するためのログ出力
    // const batchSize = 1024; // GL版と同じバッチサイズを使用
    // if (i % batchSize < 10) {
    //   const firstVertexIndex = vertexIndices.length > 0 ? vertexIndices[0] : 0;
    //   const lastVertexIndex = vertexIndices.length > 0 ? vertexIndices[vertexIndices.length - 1] : 0;
    //   console.log(`[CPU] Splat ${i}: vertexIndex=${vertexIndices[bestVi]}, boneIndex=${boneIndex}, firstVertexIndex=${firstVertexIndex}, lastVertexIndex=${lastVertexIndex}`);
    // }


    if (i % 100 == 0) {
      let progress = (i / gs.splatCount) * 100;
      document.getElementById('loaddisplay').innerHTML = progress.toFixed(1) + '% (3/3)';
      gs.splatMesh.updateDataTexturesFromBaseData(0, gs.splatCount - 1);
      await new Promise(resolve => setTimeout(resolve, 0));
    }
  }

  gs.splatRelativePoses = [];
  for (let i = 0; i < gs.splatCount; i++) {
    const vertexIndex = gs.splatVertexIndices[i];
    let vertex = new THREE.Vector3().fromBufferAttribute(position, vertexIndex);
    vertex = skinnedMesh.applyBoneTransform(vertexIndex, vertex);

    let center0 = new THREE.Vector3(gs.centers0[i * 3 + 0], gs.centers0[i * 3 + 1], gs.centers0[i * 3 + 2]);
    center0.applyMatrix4(gs.viewer.splatMesh.scenes[0].matrixWorld);
    center0.applyMatrix4(gs.matrixWorld);  // TODO: 要らない気がする
    center0.applyMatrix4(new THREE.Matrix4().copy(character.currentVrm.scene.matrixWorld).invert());

    let relativePos = new THREE.Vector3().subVectors(center0, vertex);
    gs.splatRelativePoses.push(relativePos.x, relativePos.y, relativePos.z);
  }

  document.getElementById('loaddisplay').innerHTML = (100).toFixed(1) + '% (3/3)';
}


async function cleanSplats(gsPath, loadingSpinner, hints = null, scene = null, camera = null, renderer = null, circle = null, circleHead = null, distXZ = 1.0, distY = 2.0, distBG = 15.0) {  // PARAM
  const task0 = loadingSpinner.addTask('Loading...');

  const parser = new PLYParser();
  const plyData = await parser.parsePLY(gsPath, true);

  loadingSpinner.removeTask(task0);
  const task1 = loadingSpinner.addTask('Cleaning splats...');

  const axesHelper = new THREE.AxesHelper(1);
  scene.add(axesHelper);

  async function calculateHeights(vertices, heights = null, centroid = null, distXZ, thresh = 1.0, phase = 1) {
    if (!heights) heights = { min: 0.0, max: 0.0 };
    if (!centroid) centroid = { x: 0, z: 0 };

    if (circle) {
      scene.remove(circle);
    }
    circle = getSearchAreaCircle(centroid, distXZ, heights.min);
    scene.add(circle);
    renderer.render(scene, camera);
    await new Promise(resolve => setTimeout(resolve, 10));

    const N = 5;

    let radiusFilteredVertices = vertices.filter((vertex, i) =>
      Math.abs(vertex.y) < distY &&
      Math.sqrt((vertex.x - centroid.x) ** 2 + (vertex.z - centroid.z) ** 2) < distXZ * thresh
    );

    // NOTE: gs rotation
    const yCoords = radiusFilteredVertices.map(vertex => Math.round(-vertex.y * 100));
    const minY = yCoords.reduce((min, y) => Math.min(min, y), yCoords[0]) - N;
    const maxY = yCoords.reduce((max, y) => Math.max(max, y), yCoords[0]) + N;

    const frequencyMap = new Map();
    for (let y = minY; y <= maxY; y += 1) {
      frequencyMap.set(y, 0);
    }

    radiusFilteredVertices.forEach(vertex => {
      const binKey = Math.round(-vertex.y * 100);
      frequencyMap.set(binKey, frequencyMap.get(binKey) + 1);
    });

    let floorY = minY + N;
    let maxDifference = -Infinity;

    const sortedYCoords = Array.from(frequencyMap.entries())
      .sort(([y1], [y2]) => y1 - y2);

    // 各位置について上側N個と下側N個のビンの点の数の差を計算
    for (let i = N; i < sortedYCoords.length - N + 1; i++) {
      const currentY = sortedYCoords[i][0];
      // use hints
      if (hints && hints.kneeHeight && currentY / 100.0 > hints.kneeHeight) {
        continue;
      }

      let lowerSum = 0;
      for (let j = 0; j < N; j++) {
        lowerSum += sortedYCoords[i - N + j][1];
      }

      let upperSum = 0;
      for (let j = 0; j < N; j++) {
        upperSum += sortedYCoords[i + j][1];
      }

      const difference = upperSum - lowerSum;

      if (difference > maxDifference) {
        maxDifference = difference;
        floorY = sortedYCoords[i + 1][0];
      }
    }

    // 差分計算できない場合（十分なデータがない場合）は従来の最頻値方式を使用
    if (maxDifference === -Infinity) {
      console.error("calculateHeights: maxDifference is -Infinity");
      throw new Error("calculateHeights: maxDifference is -Infinity");
    }

    let emptySpaceY = maxY - N;

    for (const [y, frequency] of sortedYCoords) {
      if (y / 100 > floorY / 100 + 0.3 && frequency < radiusFilteredVertices.length * 0.00025) {  // PARAM
        emptySpaceY = y;
        break;
      }
    }

    heights = { min: floorY /= 100, max: emptySpaceY /= 100 };

    // validation
    const ymin = (heights.max - heights.min) * 0.05 + heights.min;
    const testFilteredVertices = vertices.filter((vertex, i) =>
      Math.sqrt((vertex.x - centroid.x) ** 2 + (vertex.z - centroid.z) ** 2) < distXZ &&
      ymin < -vertex.y && -vertex.y < heights.max
    );

    // 高さの差が十分あるかチェック
    const heightDifference = heights.max - heights.min;

    // 外周部の点群をチェック
    const outerRingWidth = 0.02; // 外周2cm
    const outerRingVertices = testFilteredVertices.filter(vertex => {
      const distance = Math.sqrt((vertex.x - centroid.x) ** 2 + (vertex.z - centroid.z) ** 2);
      return distance > (distXZ - outerRingWidth) && distance <= distXZ;
    });
    const outerRingRatio = outerRingVertices.length / testFilteredVertices.length;

    console.log(`calculateHeights ${phase}:`,
      "min:", heights.min.toFixed(2),
      "max:", heights.max.toFixed(2),
      "centroid:", centroid,
      "number of splats:", testFilteredVertices.length,  // TODO: check thresh
      "height difference:", heightDifference.toFixed(2),
      "number of outer ring splats:", outerRingVertices.length);

    if (testFilteredVertices.length < 10000 ||
      heightDifference <= 0.3 ||  // PARAM (default: 0.5)
      (outerRingVertices.length > 10 && outerRingRatio > 0.00025)) {
      if (distXZ < 3.0) {
        distXZ += 0.1;
        console.log(`calculateHeights: adjusting search area. points: ${testFilteredVertices.length}, ` +
          `height diff: ${heightDifference.toFixed(2)}, outer ratio: ${outerRingRatio.toFixed(4)}. ` +
          `increasing distXZ to ${distXZ.toFixed(2)}`);
        return await calculateHeights(vertices, heights, centroid, distXZ, thresh, phase);
      } else {
        console.error(`calculateHeights: could not find target. distXZ: ${distXZ.toFixed(2)} [ErrorID 6]`);
        throw new Error(`calculateHeights: could not find target. distXZ: ${distXZ.toFixed(2)} [ErrorID 6]`);
      }
    }

    return { heights: heights, distXZ: distXZ };
  }

  async function calculateCentroidFeet(vertices, heights, centroid, distXZ) {
    if (!heights) heights = { min: 0.0, max: 0.0 };
    if (!centroid) centroid = { x: 0, z: 0 };

    const ymin = (heights.max - heights.min) * 0.1 + heights.min;  // PARAM
    const ymax = (heights.max - heights.min) * 0.2 + heights.min;  // PARAM
    const vertices_ = vertices.filter((vertex, i) =>
      Math.sqrt((vertex.x - centroid.x) ** 2 + (vertex.z - centroid.z) ** 2) < distXZ &&  // PARAM
      ymin < -vertex.y && -vertex.y < ymax
    );

    // only for debugging
    if (vertices_.length === 0) {
      console.error("calculateCentroid: no vertices found [ErrorID 5]");
      throw new Error("calculateCentroid: no vertices found [ErrorID 5]");
    }

    const sumX = vertices_.reduce((sum, vertex) => sum + vertex.x, 0);
    const sumZ = vertices_.reduce((sum, vertex) => sum + vertex.z, 0);

    const centroidFeet = { x: sumX / vertices_.length, z: sumZ / vertices_.length };

    if (circle) {
      scene.remove(circle);
    }
    circle = getSearchAreaCircle(centroidFeet, distXZ, heights.min);
    scene.add(circle);
    renderer.render(scene, camera);
    await new Promise(resolve => setTimeout(resolve, 10));

    return centroidFeet;
  }


  async function calculateCentroidHead(vertices, heights, centroid, distXZ) {
    if (!heights) heights = { min: 0.0, max: 0.0 };
    if (!centroid) centroid = { x: 0, z: 0 };

    const ymin = (heights.max - heights.min) * 0.9 + heights.min;  // PARAM
    const ymax = (heights.max - heights.min) * 1.0 + heights.min;  // PARAM
    const vertices_ = vertices.filter((vertex, i) =>
      Math.sqrt((vertex.x - centroid.x) ** 2 + (vertex.z - centroid.z) ** 2) < distXZ &&  // PARAM
      ymin < -vertex.y && -vertex.y < ymax
    );

    // only for debugging
    if (vertices_.length === 0) {
      console.error("calculateCentroid: no vertices found [ErrorID 5]");
      throw new Error("calculateCentroid: no vertices found [ErrorID 5]");
    }

    const sumX = vertices_.reduce((sum, vertex) => sum + vertex.x, 0);
    const sumZ = vertices_.reduce((sum, vertex) => sum + vertex.z, 0);

    const centroidHead = { x: sumX / vertices_.length, z: sumZ / vertices_.length };

    if (circleHead) {
      scene.remove(circleHead);
    }
    circleHead = getSearchAreaCircle(centroidHead, distXZ * 0.33, heights.max);
    scene.add(circleHead);
    renderer.render(scene, camera);
    await new Promise(resolve => setTimeout(resolve, 10));

    return centroidHead;
  }


  function detectShoes(filteredVertices1, heights, centroid) {
    const ymin = (heights.max - heights.min) * 0.05 + heights.min;  // PARAM
    const vertices = filteredVertices1.filter(vertex =>
      -vertex.y < ymin &&
      Math.sqrt(vertex.x * vertex.x + vertex.z * vertex.z) < 0.5
      // Math.sqrt((vertex.x - centroid.x) ** 2 + (vertex.z - centroid.z) ** 2) < 0.5
    );

    // xy 平面を0.01m*0.01mのグリッドに切って、frequencyMap を作る
    // この frequencyMap では、y の合計値と個数をカウントして、あとで平均値を出す。
    const frequencyMap = new Map();
    for (let x = -51; x <= 51; x += 1) {
      for (let z = -51; z <= 51; z += 1) {
        frequencyMap.set(`${x},${z}`, { sum: 0, count: 0 });
      }
    }
    vertices.forEach(vertex => {
      const binKey = `${Math.round(vertex.x * 100)},${Math.round(vertex.z * 100)}`;
      frequencyMap.get(binKey).sum += (- vertex.y - heights.min);
      frequencyMap.get(binKey).count += 1;
    });

    // 各グリッドの平均値を計算して、{sum, count} に {mean} を追加
    for (const [key, value] of frequencyMap) {
      value.mean = value.count === 0 ? 0 : value.sum / value.count;
    }

    // 頻度のリストを作成
    const frequencyList = Array.from(frequencyMap.values());
    frequencyList.sort((a, b) => b.count - a.count);

    const countList = frequencyList.map(frequency => frequency.count);
    const meanCount = countList.reduce((sum, count) => sum + count, 0) / countList.length;

    // 個数が平均以上で、mean が 0.01 以上の場合、{sum, count, mean} に、{keep: true} を追加
    console.log("meanCount", meanCount);
    for (const frequency of frequencyList) {
      frequency.keep = frequency.count > meanCount && frequency.mean > 0.01;  // PARAM
    }

    // frequencyMap の 各グリッドにおいて、その前後左右のグリッドのうち keep が false なものが 2 つ以上ある場合、keep を false にする。
    for (let x = -51; x <= 51; x += 1) {
      for (let z = -51; z <= 51; z += 1) {
        const binKey = `${x},${z}`;
        const frequency = frequencyMap.get(binKey);
        if (!frequency.keep) {
          continue;
        }
        let count = 0;
        for (let dx = -1; dx <= 1; dx += 1) {
          for (let dz = -1; dz <= 1; dz += 1) {
            if (dx === 0 && dz === 0) {
              continue;
            }
            const binKey2 = `${x + dx},${z + dz}`;
            const frequency2 = frequencyMap.get(binKey2);
            if (!frequency2 || !frequency2.keep) {
              count += 1;
            }
          }
        }
        if (count >= 5) {  // PARAM
          frequency.keep = false;
        }
      }
    }

    // filteredVertices1 のうち、
    // -vertex.y >= yminならキープ
    // -vertex.y < ymin の場合、Math.sqrt(vertex.x * vertex.x + vertex.z * vertex.z) < 0.5 で、かつ
    const filteredVertices3 = filteredVertices1.filter(vertex =>
      -vertex.y >= ymin ||
      (-vertex.y >= heights.min && -vertex.y <= ymin && Math.sqrt(vertex.x * vertex.x + vertex.z * vertex.z) < 0.5 &&
        frequencyMap.get(`${Math.round(vertex.x * 100)},${Math.round(vertex.z * 100)}`).keep)
    );

    // 捨てた点群を filteredVertices4 に追加
    const filteredVertices4 = filteredVertices1.filter(vertex =>
      -vertex.y < heights.min ||
      (-vertex.y < ymin && Math.sqrt(vertex.x * vertex.x + vertex.z * vertex.z) >= 0.5) ||
      (-vertex.y < ymin && Math.sqrt(vertex.x * vertex.x + vertex.z * vertex.z) < 0.5 &&
        !frequencyMap.get(`${Math.round(vertex.x * 100)},${Math.round(vertex.z * 100)}`).keep)
    );

    return { filteredVertices3: filteredVertices3, filteredVertices4: filteredVertices4 };
  }

  let urls = undefined;

  function createNewHeader(originalHeader, vertexCount) {
    return originalHeader.map(line => {
      if (line.startsWith('element vertex')) {
        return `element vertex ${vertexCount}`;
      }
      return line;
    });
  }

  let heights, centroid, centroidHead;

  {
    // expand the search range from the origin to find the target. 0.3 ~ max 3.0
    ({ heights, distXZ } = await calculateHeights(plyData.vertices, null, null, 0.3, 1.0, 1));
    centroid = await calculateCentroidFeet(plyData.vertices, heights, centroid, distXZ);

    ({ heights, distXZ } = await calculateHeights(plyData.vertices, heights, centroid, 0.3, 1.0, 2));
    centroid = await calculateCentroidFeet(plyData.vertices, heights, centroid, distXZ);

    const filteredVertices6 = plyData.vertices.filter((vertex, i) =>
      Math.sqrt((vertex.x - centroid.x) ** 2 + (vertex.z - centroid.z) ** 2) <= distXZ &&
      -vertex.y >= heights.min - 0.5 && -vertex.y <= heights.max + 0.5
    );
    const filteredVertices7 = plyData.vertices.filter((vertex, i) =>
      Math.sqrt((vertex.x - centroid.x) ** 2 + (vertex.z - centroid.z) ** 2) > distXZ ||
      -vertex.y < heights.min - 0.5 || -vertex.y > heights.max + 0.5
    );

    centroid = await calculateCentroidFeet(filteredVertices6, heights, centroid, distXZ);
    ({ heights, distXZ } = await calculateHeights(filteredVertices6, heights, centroid, distXZ, 0.5, 3));  // 0.33 or 0.5  // frkw

    const { filteredVertices3, filteredVertices4 } = detectShoes(filteredVertices6, heights, centroid);
    const filteredVertices5 = filteredVertices7.concat(filteredVertices4);

    centroidHead = await calculateCentroidHead(filteredVertices3, heights, centroid, distXZ);

    const newHeader1 = createNewHeader(plyData.header, filteredVertices3.length);
    const newPlyData1 = parser.createPLYFile(newHeader1, filteredVertices3, plyData.vertexSize);
    const blob1 = new Blob([newPlyData1], { type: 'application/octet-stream' });
    const url1 = URL.createObjectURL(blob1);

    const newHeader2 = createNewHeader(plyData.header, filteredVertices5.length);
    const newPlyData2 = parser.createPLYFile(newHeader2, filteredVertices5, plyData.vertexSize);
    const blob2 = new Blob([newPlyData2], { type: 'application/octet-stream' });
    const url2 = URL.createObjectURL(blob2);

    urls = [url1, url2];
  }

  scene.remove(circle);
  scene.remove(circleHead);
  scene.remove(axesHelper);

  console.log("cleanSplats", centroid, heights);
  loadingSpinner.removeTask(task1);

  return { urls: urls, centroid: centroid, heights: heights, distXZ: distXZ, centroidHead: centroidHead };
}


async function findBestAngleInRange(scene, camera, renderer, poseDetector, startAngle, endAngle, steps, radius) {
  // Store angles and scores in an array of objects
  const measurements = [];

  const angleStep = (endAngle - startAngle) / steps;
  const isFullCircle = Math.abs(endAngle - startAngle - 2 * Math.PI) < 0.01;

  for (let i = 0; i < steps; i++) {
    const angle = startAngle + angleStep * i;
    camera.position.x = radius * Math.sin(angle);
    camera.position.z = radius * Math.cos(angle);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld();

    renderer.render(scene, camera);
    const dataURL = renderer.domElement.toDataURL('image/png');
    const keypoints = await poseDetector.detect(dataURL, false);
    await new Promise(resolve => setTimeout(resolve, 30));  // wait for canvas
    let score = -Infinity;

    if (keypoints && keypoints.length > 0) {
      // const left = keypoints[23];  // left_hip
      // const right = keypoints[24]; // right_hip
      const left = keypoints[15];  // left_wrist
      const right = keypoints[16]; // right_wrist
      if (left && right) {
        score = left.x - right.x;
      }
    }

    measurements.push({ angle, score, index: i });
  }

  let bestMeasurement = { angle: null, score: -Infinity };

  if (isFullCircle) {
    // For full circle scan (360°), use a sliding window of 5 values
    for (let i = 0; i < steps; i++) {
      const window = [];
      for (let j = -2; j <= 2; j++) {  // PARAM
        let index = (i + j) % steps;
        if (index < 0) index += steps;
        window.push(measurements[index]);
      }

      // Calculate average score for this window
      const validScores = window
        .map(m => m.score)
        .filter(score => score !== -Infinity);  // Filter out invalid scores

      if (validScores.length === 0) continue;

      const avgScore = validScores.reduce((sum, score) => sum + score, 0) / validScores.length;
      if (avgScore > bestMeasurement.score) {
        bestMeasurement = {
          angle: measurements[i].angle,
          score: avgScore
        };
      }
    }
  } else {
    // For smaller ranges, just use the direct comparison
    bestMeasurement = measurements.reduce((best, current) =>
      current.score > best.score ? current : best,
      { angle: null, score: -Infinity }
    );
  }
  console.log("bestAngle", bestMeasurement.angle, "bestScore", bestMeasurement.score);
  return { angle: bestMeasurement.angle, score: bestMeasurement.score };
}


async function moveCameraAndDetect(camera, scene, renderer, poseDetector, angle, radius, radiusMultiplier = 1.0, visualize = true) {
  camera.position.x = radius * radiusMultiplier * Math.sin(angle);
  camera.position.z = radius * radiusMultiplier * Math.cos(angle);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();

  await poseDetector.loadingPromise;
  renderer.render(scene, camera);
  const dataURL = renderer.domElement.toDataURL('image/png');
  return await poseDetector.detect(dataURL, visualize);
}


async function saveError(message, fileName) {
  console.error(message);

  const timestamp = new Date().toISOString()
    .replace(/[-:T.Z]/g, '');
  const errorLog = { timestamp, fileName, message };

  const errorText = JSON.stringify(errorLog, null, 2);

  const blob = new Blob([errorText], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `error_${fileName ? fileName.replace(/\.gvrm$/, '') : 'unknown'}_${timestamp}.txt`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}


function getSearchAreaCircle(centroid, distXZ, floorY) {
  const circleGeometry = new THREE.CircleGeometry(distXZ, 64);
  const circleMaterial = new THREE.MeshBasicMaterial(
    { color: 0x00ff00, wireframe: true, transparent: true, opacity: 0.1 });
  let circle = new THREE.Mesh(circleGeometry, circleMaterial);
  circle.rotateX(-Math.PI / 2);
  circle.position.x = -centroid.x;  // CAUTION
  circle.position.z = centroid.z;
  circle.position.y = floorY;
  return circle;
}


export async function preprocess(vrmPath, gsPath, scene, camera, renderer, stage = null, useGPU = false, nobg = false, nocheck = false, fileName = null, savePly = false, hints = null) {
  let gs, character, gs0, gsPaths, centroid, heights, distXZ, centroidHead, circle, circleHead, radius, boneOperations;
  const gsPathOrig = gsPath;
  let vrmScale = null;
  const cameraPosition0 = new THREE.Vector3().copy(camera.position);
  const poseDetector = new PoseDetector(scene, camera, renderer);
  let loadingSpinner = new DropInViewer().viewer.loadingSpinner;
  console.log("hints", hints);

  async function moveCameraAndDetect_(camera, scene, renderer, poseDetector, angle, radius, radiusMultiplier = 1.0, visualize = true) {
    const result = await moveCameraAndDetect(camera, scene, renderer, poseDetector, angle, radius, radiusMultiplier, visualize);
    if (!result) {
      console.error(`Failed to detect pose at angle: ${angle.toFixed(3)} [ErrorID 1]`);
      throw new Error(`Failed to detect pose at angle: ${angle.toFixed(3)} [ErrorID 1]`);
    }
    return result;
  }

  try {

    if (stage === null) {
      stage = '0';
    }

    if (stage && !['0', '1', '2', '3'].includes(stage)) {
      console.error("stage must be '0', '1', '2', or '3'");
      throw new Error("stage must be '0', '1', '2', or '3'");
    }

    // clean and show
    if (stage < 1) {
      try {
        camera.position.set(-1.7, 0.6, 1.7);
        camera.lookAt(0, 0, 0);
        camera.updateMatrixWorld();

        gs0 = await GVRM.initGS(gsPath, undefined, undefined, scene);
        for (let i = 0; i < gs0.splatCount; i++) {
          gs0.colors[i * 4 + 3] /= 12.0;
        }
        gs0.splatMesh.updateDataTexturesFromBaseData(0, gs0.splatCount - 1);
        renderer.render(scene, camera);
        await new Promise(resolve => setTimeout(resolve, 30));

        ({ urls: gsPaths, centroid, heights, distXZ, centroidHead } = await cleanSplats(gsPath, loadingSpinner, hints, scene, camera, renderer, circle, circleHead));

        if (gsPaths.length === 1) {
          console.error("Only one PLY path returned. Choose stage=2");
          throw new Error("Only one PLY path returned. Choose stage=2");
        }
        gsPath = gsPaths[0];

        await gs0.viewer.dispose();
        camera.position.copy(cameraPosition0);
        camera.lookAt(0, 0, 0);
        camera.updateMatrixWorld();

        // background gs
        gs0 = await GVRM.initGS(gsPaths.slice(1), undefined, undefined, scene);

        for (let i = 0; i < gs0.splatCount; i++) {
          gs0.colors[i * 4 + 3] /= 12.0;
        }
        gs0.splatMesh.updateDataTexturesFromBaseData(0, gs0.splatCount - 1);
      } catch (error) {
        console.error(`Error in cleaning splats: ${error.message}`);
        throw new Error(`Error in cleaning splats: ${error.message}`);
      }
    }

    // main gs
    try {
      gs = await GVRM.initGS(gsPath, undefined, undefined, scene);
      character = await GVRM.initVRM(vrmPath, scene, camera, renderer, vrmScale);
    } catch (error) {
      console.error(`Error loading main GS or VRM: ${error.message}`);
      throw new Error(`Error loading main GS or VRM: ${error.message}`);
    }

    // adjust pos of gs and vrm, adjust scale of vrm
    if (stage < 1) {
      try {
        if (!vrmScale) {
          vrmScale = (heights.max - heights.min) / (- character.ground * 2 + 0.05);
        }
        console.log("vrmScale", vrmScale);

        await character.leave(scene);
        character = await GVRM.initVRM(vrmPath, scene, camera, renderer, vrmScale);
        character.currentVrm.scene.position.z = 0.02;

        const gsScene = gs.viewer.splatMesh.scenes[0];
        gsScene.position.y = character.ground - heights.min;
        gsScene.position.x += centroid.x;  // CAUTION
        gsScene.position.z -= centroid.z;
        gsScene.updateMatrixWorld();

        const gs0Scene = gs0.viewer.splatMesh.scenes[0];
        gs0Scene.position.copy(gsScene.position);
        gs0Scene.updateMatrixWorld();

        circle = getSearchAreaCircle(character.currentVrm.scene.position, distXZ, character.ground);
        scene.add(circle);
      } catch (error) {
        console.error(`Error adjusting position and scale: ${error.message}`);
        throw new Error(`Error adjusting position and scale: ${error.message}`);
      }
    }

    if (gs0) {
      for (let i = 0; i < gs0.splatCount; i++) {
        const pos = new THREE.Vector3(
          gs0.centers0[i * 3 + 0], gs0.centers0[i * 3 + 1], gs0.centers0[i * 3 + 2]
        );
        const distXZ = Math.sqrt(
          (pos.x - centroid.x) * (pos.x - centroid.x) + (pos.z - centroid.z) * (pos.z - centroid.z)
        );
        if (distXZ > 0.5) {
          gs0.colors[i * 4 + 3] = 0.0;
        }
      }
      gs0.splatMesh.updateDataTexturesFromBaseData(0, gs0.splatCount - 1);
    }

    // adjust angle of gs
    if (stage < 1) {
      try {
        const position0 = new THREE.Vector3().copy(camera.position);
        radius = Math.sqrt(position0.x * position0.x + position0.z * position0.z);

        const angle1 = 0, angle2 = Math.PI * 2;
        const coarseResult = await findBestAngleInRange(
          scene, camera, renderer, poseDetector, angle1, angle2, 12, radius);

        if (coarseResult.angle === null) {
          console.error('Failed to detect initial direction [ErrorID 2]');
          throw new Error('Failed to detect initial direction [ErrorID 2]');
        }

        const angle3 = coarseResult.angle - Math.PI / 10;
        const angle4 = coarseResult.angle + Math.PI / 10;
        const fineResult = await findBestAngleInRange(
          scene, camera, renderer, poseDetector, angle3, angle4, 12, radius);

        camera.position.x = radius * Math.sin(0);
        camera.position.z = radius * Math.cos(0);
        camera.lookAt(0, 0, 0);
        camera.updateMatrixWorld();

        const gsScene = gs.viewer.splatMesh.scenes[0];
        const originalPosition = gsScene.position.clone();
        gsScene.position.set(0, originalPosition.y, 0);
        gsScene.rotation.y = -fineResult.angle;
        const rotatedPosition = new THREE.Vector3(originalPosition.x, 0, originalPosition.z);
        rotatedPosition.applyAxisAngle(new THREE.Vector3(0, 1, 0), -fineResult.angle);  // -angle
        gsScene.position.x = rotatedPosition.x;
        gsScene.position.z = rotatedPosition.z;
        gsScene.position.y = originalPosition.y;
        gsScene.updateMatrixWorld();

        const gs0Scene = gs0.viewer.splatMesh.scenes[0];
        gs0Scene.rotation.copy(gsScene.rotation);
        gs0Scene.position.copy(gsScene.position);
        gs0Scene.updateMatrixWorld();

        centroidHead.x -= centroid.x;
        centroidHead.z -= centroid.z;
        const rotatedCentroidHead = (new THREE.Vector3(centroidHead.x, 0, centroidHead.z)).clone();
        rotatedCentroidHead.applyAxisAngle(new THREE.Vector3(0, 1, 0), fineResult.angle);  // +angle
        centroidHead.x = rotatedCentroidHead.x;
        centroidHead.z = rotatedCentroidHead.z;

        circleHead = getSearchAreaCircle(centroidHead, distXZ * 0.33, -character.ground);
        circleHead.material.visible = false;
        scene.add(circleHead);
      } catch (error) {
        console.error(`Error adjusting angle: ${error.message}`);
        throw new Error(`Error adjusting angle: ${error.message}`);
      }
    }

    camera.position.y = 0.0;

    // Check that the gaussian body is not sinking into the ground.
    if (!nocheck) {
      try {
        console.log("Checking the ground...");
        const result = await findBestAngleInRange(
          scene, camera, renderer, poseDetector, -Math.PI / 15.0, Math.PI / 15.0, 12, radius * 1.5);

        await moveCameraAndDetect_(camera, scene, renderer, poseDetector, result.angle, radius, 1.5, true);

        // return error if the height of the knee is lower than the height of the circle.
        const leftKnee = poseDetector.keypointAxes.get(25);
        const rightKnee = poseDetector.keypointAxes.get(26);
        const kneeHeight = (leftKnee.position.y + rightKnee.position.y) / 2.0;
        console.log("kneeHeight", kneeHeight, "circle.position.y", circle.position.y);
        if (kneeHeight < circle.position.y) {
          let hintsKneeHeight = kneeHeight - character.ground + heights.min;
          let hintsGround = heights.min;
          if (hints) {
            hints = null;  // no retry
          } else {
            // The ground is below the knees!
            hints = { kneeHeight: hintsKneeHeight };
          }
          console.error(`Failed to detect the ground. knee: ${hintsKneeHeight}, ground: ${hintsGround} [ErrorID 3]`);
          throw new Error(`Failed to detect the ground. knee: ${hintsKneeHeight}, ground: ${hintsGround} [ErrorID 3]`);
        }
      } catch (error) {
        console.error(`Error in checking the ground: ${error.message}`);
        throw new Error(`Error in checking the ground: ${error.message}`);
      }
    }

    camera.position.copy(cameraPosition0);  // maybe important for pose detection robustness


    // adjust the tilt of the vrm
    try {
      const dx = circleHead.position.x - circle.position.x;
      const dy = circleHead.position.y - circle.position.y;
      const dz = circleHead.position.z - circle.position.z;
      const angleRadians = Math.atan2(dy, dx);
      const angleDegrees = angleRadians * (180 / Math.PI);
      const angleRadians2 = Math.atan2(dz, dy);
      const angleDegrees2 = angleRadians2 * (180 / Math.PI);
      console.log("angleDegrees", angleDegrees, "angleDegrees2", angleDegrees2);
      character.currentVrm.scene.rotation.x = angleRadians2;
      character.currentVrm.scene.rotation.z = Math.PI * 0.5 - angleRadians;
    } catch (error) {
      console.error(`Error adjusting the tilt of the VRM: ${error.message}`);
      throw new Error(`Error adjusting the tilt of the VRM: ${error.message}`);
    }


    // apply bone operations
    if (stage < 2) {
      try {
        // temp bone operations
        let response = await fetch("./assets/default.json");
        const params = await response.json();
        boneOperations = params.boneOperations;

        // front camera
        await moveCameraAndDetect_(camera, scene, renderer, poseDetector, 0, radius, 1.0, true);
        {  // "left_shoulder" and "left_wrist"
          const point11 = poseDetector.keypointAxes.get(11).position;
          const point15 = poseDetector.keypointAxes.get(15).position;

          const dx = point15.x - point11.x;
          const dy = point15.y - point11.y;

          const angleRadians = Math.atan2(dy, dx);

          const angleDegrees = angleRadians * (180 / Math.PI);
          // console.log(angleDegrees, -180.0 - angleDegrees);
          boneOperations[2]["rotation"]["z"] = - angleDegrees;

          // Left hand is positioned further in the -X than the left elbow.
          // const point13 = poseDetector.keypointAxes.get(13).position;
          // if (point15.x < point13.x) {

          // Left hand is positioned further in the -X than the thresh.
          const point12 = poseDetector.keypointAxes.get(12).position;  // right_shoulder
          const threshX = point11.x * 0.67 + point12.x * 0.33;
          if (point15.x < threshX) {
            console.error(`A-pose check failed. left hand is bent inside. left hand: ${point15.x.toFixed(2)}, thresh: ${threshX.toFixed(2)} [ErrorID 4]`);
            throw new Error(`A-pose check failed. left hand is bent inside. left hand: ${point15.x.toFixed(2)}, thresh: ${threshX.toFixed(2)} [ErrorID 4]`);
          }

          const tempAngle = 90 + angleDegrees;
          console.log("left angleDegrees", tempAngle);
          // if (angleDegrees < -75.0) {
          //   console.error(`A-pose check failed. left angle: ${tempAngle.toFixed(2)}°. (required: 15°)`);
          //   throw new Error(`A-pose check failed. left angle: ${tempAngle.toFixed(2)}°. (required: 15°)`);
          // }
        }

        {  // "right_shoulder" and "right_wrist"
          const point12 = poseDetector.keypointAxes.get(12).position;
          const point16 = poseDetector.keypointAxes.get(16).position;

          const dx = point16.x - point12.x;
          const dy = point16.y - point12.y;

          const angleRadians = Math.atan2(dy, dx);

          const angleDegrees = angleRadians * (180 / Math.PI);
          // console.log(angleDegrees, -180.0 - angleDegrees);
          // console.log(boneOperations);
          boneOperations[3]["rotation"]["z"] = -180.0 - angleDegrees;

          // Right hand is positioned further in the +X than the right elbow.
          // const point14 = poseDetector.keypointAxes.get(14).position;
          // if (point16.x > point14.x) {

          // Right hand is positioned further in the +X than the thresh.
          const point11 = poseDetector.keypointAxes.get(11).position;  // left_shoulder
          const threshX = point11.x * 0.33 + point12.x * 0.67;
          if (point16.x > threshX) {
            console.error(`A-pose check failed. right hand is bent inside. right hand: ${point16.x.toFixed(2)}, thresh: ${threshX.toFixed(2)} [ErrorID 4]`);
            throw new Error(`A-pose check failed. right hand is bent inside. right hand: ${point16.x.toFixed(2)}, thresh: ${threshX.toFixed(2)} [ErrorID 4]`);
          }

          const tempAngle = -angleDegrees - 90.0;
          console.log("right angleDegrees", tempAngle);
          // if (angleDegrees > -105.0) {
          //   console.error(`A-pose check failed. right angle: ${tempAngle.toFixed(2)}°. (required: 15°)`);
          //   throw new Error(`A-pose check failed. right angle: ${tempAngle.toFixed(2)}°. (required: 15°)`);
          // }
        }

        {  // "left_hip" and "left_ankle"
          const point23 = poseDetector.keypointAxes.get(23).position;
          const point27 = poseDetector.keypointAxes.get(27).position;

          const dx = point27.x - point23.x * 0.8;
          const dy = point27.y - point23.y;

          const angleRadians = Math.atan2(dy, dx);

          const angleDegrees = angleRadians * (180 / Math.PI);
          // console.log(angleDegrees, -90.0 - angleDegrees);
          boneOperations[4]["rotation"]["z"] = -90.0 - angleDegrees;
        }

        {  // "right_hip" and "right_ankle"
          const point24 = poseDetector.keypointAxes.get(24).position;
          const point28 = poseDetector.keypointAxes.get(28).position;

          const dx = point28.x - point24.x * 0.8;
          const dy = point28.y - point24.y;

          const angleRadians = Math.atan2(dy, dx);

          const angleDegrees = angleRadians * (180 / Math.PI);
          // console.log(angleDegrees, -90.0 - angleDegrees);
          boneOperations[5]["rotation"]["z"] = -90.0 - angleDegrees;
        }

        // smooth camera move
        await moveCameraAndDetect_(camera, scene, renderer, poseDetector, -Math.PI / 4.0, radius, 1.5, true);

        // right camera
        await moveCameraAndDetect_(camera, scene, renderer, poseDetector, -Math.PI / 2.0, radius, 1.5, true);

        {  // "right_shoulder" and "right_wrist"
          const point12 = poseDetector.keypointAxes.get(12).position;
          const point16 = poseDetector.keypointAxes.get(16).position;

          const dx = point16.z - point12.z;
          const dy = point16.y - point12.y;

          const angleRadians = Math.atan2(dy, dx);

          const angleDegrees = angleRadians * (180 / Math.PI);
          boneOperations[3]["rotation"]["x"] = 90.0 + angleDegrees;
        }

        // smooth camera move
        await moveCameraAndDetect_(camera, scene, renderer, poseDetector, -Math.PI / 4.0, radius, 1.5, true);
        await moveCameraAndDetect_(camera, scene, renderer, poseDetector, 0, radius, 1.5, true);
        await moveCameraAndDetect_(camera, scene, renderer, poseDetector, Math.PI / 4.0, radius, 1.5, true);

        // left camera
        await moveCameraAndDetect_(camera, scene, renderer, poseDetector, Math.PI / 2.0, radius, 1.5, true);

        {  // "left_shoulder" and "left_wrist"
          const point11 = poseDetector.keypointAxes.get(11).position;
          const point15 = poseDetector.keypointAxes.get(15).position;

          const dx = -point15.z + point11.z;
          const dy = point15.y - point11.y;

          const angleRadians = Math.atan2(dy, dx);

          const angleDegrees = angleRadians * (180 / Math.PI);
          boneOperations[2]["rotation"]["x"] = -90.0 - angleDegrees;
        }

        // front camera (natural view)
        await moveCameraAndDetect_(camera, scene, renderer, poseDetector, 0, radius, 1.0, true);

        poseDetector.keypointAxes.forEach((axes) => {
          axes.visible = false;
        });


        GVRMUtils.resetPose(character, boneOperations);
        // TODO: refactor (merge with the above)
        character.currentVrm.scene.updateMatrixWorld(true);
      } catch (error) {
        console.error(`Error in bone operations: ${error.message}`);
        throw new Error(`Error in bone operations: ${error.message}`);
      }
    } else {
      try {
        // const jsonPath = gsPath.replace(".ply", ".json");
        // let response = await fetch(jsonPath);
        // use default bone operations
        let response = await fetch("./assets/default.json");
        const params = await response.json();
        boneOperations = params.boneOperations;
        GVRMUtils.resetPose(character, boneOperations);
        // TODO: refactor
        character.currentVrm.scene.updateMatrixWorld(true);
      } catch (error) {
        console.error(`Error loading default bone operations: ${error.message}`);
        throw new Error(`Error loading default bone operations: ${error.message}`);
      }
    }


    const { pmc, capsuleBoneIndex } = GVRMUtils.getPointsMeshCapsules(character);
    GVRMUtils.addPMC(scene, pmc);
    GVRMUtils.visualizePMC(pmc, false);
    renderer.render(scene, camera);

    if (!nocheck) {
      await finalCheck(pmc, moveCameraAndDetect_, camera, scene, renderer, poseDetector, radius, vrmScale, 0.15);
    }

    camera.position.copy(cameraPosition0);

    // camera.position.y = cameraPosition0.y;
    if (gs0) {
      for (let i = 0; i < gs0.splatCount; i++) {
        gs0.colors[i * 4 + 3] = gs0.colors0[i * 4 + 3] / 12.0;
      }
      gs0.splatMesh.updateDataTexturesFromBaseData(0, gs0.splatCount - 1);
      gs0.viewer.viewer.splatMesh.renderOrder = -1;
    }

    const gvrm = new GVRM(character, gs);
    gvrm.modelScale = vrmScale;
    gvrm.boneOperations = boneOperations;
    gvrm.pmc = pmc;
    GVRMUtils.visualizePMC(pmc, true);
    renderer.render(scene, camera);

    async function preprocess2() {
      try {
        if (!useGPU) {
          await assignSplatsToBones(gs, pmc.capsules, capsuleBoneIndex);
          await assignSplatsToPoints(character, gs, pmc.capsules, capsuleBoneIndex);
        } else {
          await assignSplatsToBonesGL(gs, pmc.capsules, capsuleBoneIndex);
          await assignSplatsToPointsGL(character, gs, pmc.capsules, capsuleBoneIndex);
        }

        await gvrm.save(vrmPath, gsPath, boneOperations, vrmScale, fileName, savePly);

        // Store the new URL before cleaning up old objects
        const newGvrmUrl = gvrm.url;

        // Remove old PMC and GS before reload (equivalent to key parts of removeGVRM)
        if (gvrm.pmc) {
          GVRMUtils.removePMC(scene, gvrm.pmc);
        }
        if (gvrm.gs) {
          await gvrm.gs.viewer.dispose();
        }

        // Small delay to ensure cleanup is complete before reload (especially on mobile)
        await new Promise(resolve => setTimeout(resolve, 100));

        // Reload GVRM to refresh internal state (like debug rm&load but without expensive removeGVRM)
        await gvrm.load(newGvrmUrl, scene, camera, renderer, fileName);

        if (stage < 1 && circle) {
          scene.remove(circle);
          circle.geometry.dispose();
          circle.material.dispose();
          scene.remove(circleHead);
          circleHead.geometry.dispose();
          circleHead.material.dispose();
        }

        if (nobg && gs0) {
          await gs0.viewer.dispose();
          gs0 = null;
        }
      } catch (error) {
        console.error(`Error in preprocess2: ${error.message}`);
        throw new Error(`Error in preprocess2: ${error.message}`);
      }
    }

    let promise2 = preprocess2();

    return { 'gvrm': gvrm, 'promise2': promise2 };

  } catch (error) {
    if (hints && !hints.retry) {
      hints.retry = 1;
    } else if (hints && hints.retry) {
      hints.retry += 1;
    }

    if (hints && hints.retry <= 1) {
      console.error("Retry with hints!", hints);

      if (gs0) await gs0.viewer.dispose();
      if (gs) await gs.viewer.dispose();
      if (circle) {
        scene.remove(circle);
        circle.geometry.dispose();
        circle.material.dispose();
        scene.remove(circleHead);
        circleHead.geometry.dispose();
        circleHead.material.dispose();
      }
      poseDetector.keypointAxes.forEach((axes) => {
        axes.visible = false;
      });
      camera.position.copy(cameraPosition0);

      const el = document.getElementById("error-display");
      if (el) el.style.visibility = "hidden";

      const promise1 = preprocess(vrmPath, gsPathOrig, scene, camera, renderer, stage, useGPU, nobg, nocheck, fileName, savePly, hints);
      return promise1;
    }
    await saveError(`Preprocessing failed: ${error.message}`, fileName || "unknown");
    return { 'error': error.message };
  }
}
