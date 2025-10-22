// Copyright (c) 2025 naruya
// Licensed under the MIT License. See LICENSE file in the project root for full license information.


import * as THREE from 'three';
import * as GVRMUtils from '../../gvrm-format/utils.js';
import {
  initializeWebGL,
  createSplatPositionTexture,
  threeTextureToWebGLTexture,
  createWebGLTexture
} from './utils_gl.js';


// assignSplatsToBonesGL

// Vertex shader source for full-screen quad rendering
const vertexShaderSource1 = `#version 300 es
in vec4 aPosition;
out vec2 vTexCoord;

void main() {
    // Pass the vertex position directly to gl_Position
    gl_Position = aPosition;
    // Map from clip space [-1,1] to texture coordinate space [0,1]
    vTexCoord = aPosition.xy * 0.5 + 0.5;
}`;

// Fragment shader that computes the distance to all capsule vertices and selects the closest one
const fragmentShaderSource1 = `#version 300 es
precision highp float;
precision highp sampler2D;
precision highp int;

// Input texture containing splat center positions
uniform sampler2D uSplatPositions;
uniform mat4 uSplatMatrixWorld;  // Matrix to transform position to world space

// Capsule data
uniform sampler2D uCapsuleVertices;    // RGBA texture with all vertices from all capsules
uniform sampler2D uCapsuleVertexInfo;  // Information about vertex count and offset for each capsule
uniform sampler2D uCapsuleColors;      // RGBA texture with colors for each capsule
uniform sampler2D uCapsuleBoneIndices; // Texture with bone indices for each capsule

// Metadata
uniform int uCapsuleCount;          // Total number of capsules
uniform int uTotalVertices;         // Total number of vertices across all capsules

// Batch processing info
uniform int uSplatOffset;          // Current batch offset
uniform int uBatchSize;            // Current batch size

// Input texture coordinates
in vec2 vTexCoord;
// Output color and bone index
out vec4 fragColor;

// Helper function to denormalize position from 0-1 to -1-1 range
vec3 denormalizePosition(vec3 normalizedPos) {
    return normalizedPos * 2.0 - 1.0;
}

void main() {
    // Calculate the splat index based on the texture coordinate
    int splatIndex = uSplatOffset + int(vTexCoord.x * float(uBatchSize));
    
    // Calculate texture coordinates for accessing the splat position
    float d2 = float(splatIndex) / 4096.0;
    float texY = float(floor(d2)) / 1024.0;
    float texX = fract(d2);
    vec2 uv = vec2(texX, texY);
    
    // Get the normalized center position from the texture
    vec4 normalizedCenter = texture(uSplatPositions, uv);
    
    // Denormalize the position from 0-1 to -1-1 range
    vec3 position = denormalizePosition(normalizedCenter.xyz);
    
    // Apply the matrix transformation (world space)
    vec4 transformedPosition = uSplatMatrixWorld * vec4(position, 1.0);
    vec3 worldPosition = transformedPosition.xyz / transformedPosition.w;
    
    // Find the closest vertex among all capsules
    float minDistance = 1000000.0; // A large value
    int closestCapsuleIndex = 0;
    
    // Loop through capsules
    for (int ci = 0; ci < uCapsuleCount; ci++) {
        // Get information about this capsule's vertices
        float texX = (float(ci) + 0.5) / float(uCapsuleCount);
        vec4 vertexInfo = texture(uCapsuleVertexInfo, vec2(texX, 0.5));
        
        // Extract vertex offset and count
        int vertexOffset = int(vertexInfo.x);
        int vertexCount = int(vertexInfo.y);
        
        // Find minimum distance to any vertex in this capsule
        float capsuleMinDist = 1000000.0;
        
        // Loop through all vertices in this capsule
        for (int vi = 0; vi < 1000; vi++) { // Using a constant loop limit for compatibility
            if (vi >= vertexCount) break;   // Stop if we've processed all vertices
            
            // Calculate texture coordinate for this vertex
            int vertexIndex = vertexOffset + vi;
            float vertexTexX = (float(vertexIndex) + 0.5) / float(uTotalVertices);
            vec4 vertexData = texture(uCapsuleVertices, vec2(vertexTexX, 0.5));
            
            // Get vertex position in world space
            vec3 vertexPosition = denormalizePosition(vertexData.xyz);
            
            // Calculate distance to this vertex
            float dist = distance(worldPosition, vertexPosition);
            
            // Update minimum distance for this capsule
            if (dist < capsuleMinDist) {
                capsuleMinDist = dist;
            }
        }
        
        // If this capsule has a closer vertex than any we've seen so far
        if (capsuleMinDist < minDistance) {
            minDistance = capsuleMinDist;
            closestCapsuleIndex = ci;
        }
    }
    
    // Get the color from the closest capsule
    float colorTexX = (float(closestCapsuleIndex) + 0.5) / float(uCapsuleCount);
    vec2 colorUv = vec2(colorTexX, 0.5);
    vec4 capsuleColor = texture(uCapsuleColors, colorUv);
    
    // Get the bone index for this capsule
    float boneIndexTexX = (float(closestCapsuleIndex) + 0.5) / float(uCapsuleCount);
    vec2 boneIndexUv = vec2(boneIndexTexX, 0.5);
    float boneIndex = texture(uCapsuleBoneIndices, boneIndexUv).r * 255.0;
    
    // Output the color and bone index
    // Store RGB in the color channels
    // Store the bone index in the alpha channel for later retrieval
    fragColor = vec4(capsuleColor.rgb, boneIndex / 255.0);
}`;

/**
 * Prepares capsule vertex data for GPU processing
 * @param {Object} capsules - THREE.js capsules collection
 * @returns {Object} Object containing prepared data arrays and metadata
 */
function prepareCapsuleVertexData(capsules) {
  console.log(`Preparing vertex data for ${capsules.children.length} capsules`);
  
  // First pass: count total vertices
  let totalVertices = 0;
  const vertexCounts = [];
  const vertexOffsets = [];
  
  for (let ci = 0; ci < capsules.children.length; ci++) {
    const capsule = capsules.children[ci];
    const geometry = capsule.geometry;
    const position = geometry.getAttribute('position');
    
    vertexOffsets.push(totalVertices);
    vertexCounts.push(position.count);
    
    totalVertices += position.count;
  }
  
  console.log(`Total vertices: ${totalVertices}`);
  
  // Second pass: prepare the data arrays
  const vertexData = new Float32Array(totalVertices * 4); // RGBA format for each vertex
  const vertexInfoData = new Float32Array(capsules.children.length * 4); // Metadata for each capsule
  
  // Fill the data arrays
  for (let ci = 0; ci < capsules.children.length; ci++) {
    const capsule = capsules.children[ci];
    const geometry = capsule.geometry;
    const position = geometry.getAttribute('position');
    const vertexOffset = vertexOffsets[ci];
    const vertexCount = vertexCounts[ci];
    
    // Store vertex offset and count in vertex info
    vertexInfoData[ci * 4 + 0] = vertexOffset; // vertex offset
    vertexInfoData[ci * 4 + 1] = vertexCount;  // vertex count
    vertexInfoData[ci * 4 + 2] = 0;            // unused
    vertexInfoData[ci * 4 + 3] = 0;            // unused
    
    // Store vertex positions (normalized to 0-1 range)
    for (let vi = 0; vi < vertexCount; vi++) {
      const vertex = new THREE.Vector3().fromBufferAttribute(position, vi);
      
      // Transform to world space
      vertex.applyMatrix4(capsule.matrixWorld);
      
      // Normalize to 0-1 range
      const maxValue = 1.0;
      const normalizedX = (vertex.x + maxValue) / (2.0 * maxValue);
      const normalizedY = (vertex.y + maxValue) / (2.0 * maxValue);
      const normalizedZ = (vertex.z + maxValue) / (2.0 * maxValue);
      
      // Store in RGBA format
      vertexData[(vertexOffset + vi) * 4 + 0] = normalizedX; // R
      vertexData[(vertexOffset + vi) * 4 + 1] = normalizedY; // G
      vertexData[(vertexOffset + vi) * 4 + 2] = normalizedZ; // B
      vertexData[(vertexOffset + vi) * 4 + 3] = 1.0;         // A
    }
  }
  
  return {
    vertexData,
    vertexInfoData,
    totalVertices
  };
}

/**
 * Assigns splats to the closest capsule by measuring distance to capsule vertices using WebGL
 * This is step 5 of the debugging process, implemented on GPU for performance
 * @param {Object} gs - Gaussian Splats object
 * @param {Object} capsules - THREE.js capsules collection
 * @param {Array} capsuleBoneIndex - Mapping from capsule index to bone index
 * @returns {Promise} Promise that resolves when the operation is complete
 */
export async function assignSplatsToBonesGL(gs, capsules, capsuleBoneIndex) {
  console.log("Starting assignSplatsToBonesGL - Step 5 (GL): Measuring distance to capsule vertices");
  
  try {
    // Initialize WebGL context and shader program
    const { gl, program } = initializeWebGL(vertexShaderSource1, fragmentShaderSource1);
    console.log("WebGL2 context initialized");
    
    // Create THREE.js texture for splat positions
    const threeTexture = createSplatPositionTexture(gs.centers0, gs.splatCount);
    
    // Convert THREE.js texture to WebGL texture
    const splatPositionsTexture = threeTextureToWebGLTexture(gl, threeTexture);
    console.log("Splat position texture created");
    
    // Prepare capsule vertex data
    const { vertexData, vertexInfoData, totalVertices } = prepareCapsuleVertexData(capsules);
    
    // Create vertex data texture
    const capsuleVerticesTexture = createWebGLTexture(
      gl, 
      vertexData, 
      totalVertices, 
      1,
      true // float data
    );
    console.log(`Capsule vertices texture created (${totalVertices} vertices)`);
    
    // Create vertex info texture
    const capsuleVertexInfoTexture = createWebGLTexture(
      gl, 
      vertexInfoData, 
      capsules.children.length, 
      1,
      true // float data
    );
    console.log("Capsule vertex info texture created");
    
    // Create texture for capsule colors
    const capsuleColorsData = new Float32Array(capsules.children.length * 4);
    for (let ci = 0; ci < capsules.children.length; ci++) {
      const colorArray = GVRMUtils.colors[ci];
      capsuleColorsData[ci * 4 + 0] = colorArray[0] / 255.0; // R (normalize to 0-1)
      capsuleColorsData[ci * 4 + 1] = colorArray[1] / 255.0; // G
      capsuleColorsData[ci * 4 + 2] = colorArray[2] / 255.0; // B
      capsuleColorsData[ci * 4 + 3] = 1.0;                   // A
    }
    const capsuleColorsTexture = createWebGLTexture(
      gl, 
      capsuleColorsData, 
      capsules.children.length, 
      1,
      true // float data
    );
    console.log("Capsule colors texture created");
    
    // Create texture for capsule bone indices
    const capsuleBoneIndicesData = new Uint8Array(capsules.children.length * 4);
    for (let ci = 0; ci < capsules.children.length; ci++) {
      const boneIndex = capsuleBoneIndex[ci];
      capsuleBoneIndicesData[ci * 4 + 0] = boneIndex; // Store in R channel
      capsuleBoneIndicesData[ci * 4 + 1] = 0;
      capsuleBoneIndicesData[ci * 4 + 2] = 0;
      capsuleBoneIndicesData[ci * 4 + 3] = 255;
    }
    const capsuleBoneIndicesTexture = createWebGLTexture(
      gl, 
      capsuleBoneIndicesData, 
      capsules.children.length, 
      1,
      false // byte data
    );
    console.log("Capsule bone indices texture created");
    
    // Get the matrix world from the splat mesh
    const matrixWorld = gs.viewer.splatMesh.scenes[0].matrixWorld;
    
    // Initialize the splatBoneIndices array
    gs.splatBoneIndices = [];
    
    // Max batch size that can be processed at once
    const batchSize = 1024; // Adjust based on hardware capabilities
    
    // Create and set up a framebuffer for results
    const resultTexture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, resultTexture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA8,
      batchSize,
      1,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      null
    );
    
    const frameBuffer = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, frameBuffer);
    gl.framebufferTexture2D(
      gl.FRAMEBUFFER, 
      gl.COLOR_ATTACHMENT0, 
      gl.TEXTURE_2D, 
      resultTexture, 
      0
    );
    
    // Check framebuffer status
    const frameBufferStatus = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
    if (frameBufferStatus !== gl.FRAMEBUFFER_COMPLETE) {
      throw new Error(`Cannot create framebuffer: status ${frameBufferStatus}`);
    }
    
    // Buffer for reading results back from GPU
    const resultBuffer = new Uint8Array(batchSize * 4);
    
    // Process all splats in batches
    for (let offset = 0; offset < gs.splatCount; offset += batchSize) {
      // Actual size of this batch
      const currentBatchSize = Math.min(batchSize, gs.splatCount - offset);
      
      // Configure viewport
      gl.viewport(0, 0, currentBatchSize, 1);
      
      // Use the shader program
      gl.useProgram(program);
      
      // Set up the full-screen quad for rendering
      const positionBuffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
        -1, -1,
        1, -1,
        -1, 1,
        -1, 1,
        1, -1,
        1, 1
      ]), gl.STATIC_DRAW);
      
      // Set position attribute
      const positionLocation = gl.getAttribLocation(program, 'aPosition');
      gl.enableVertexAttribArray(positionLocation);
      gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);
      
      // Set uniforms
      gl.uniform1i(gl.getUniformLocation(program, 'uSplatPositions'), 0);
      gl.uniform1i(gl.getUniformLocation(program, 'uCapsuleVertices'), 1);
      gl.uniform1i(gl.getUniformLocation(program, 'uCapsuleVertexInfo'), 2);
      gl.uniform1i(gl.getUniformLocation(program, 'uCapsuleColors'), 3);
      gl.uniform1i(gl.getUniformLocation(program, 'uCapsuleBoneIndices'), 4);
      
      gl.uniform1i(gl.getUniformLocation(program, 'uCapsuleCount'), capsules.children.length);
      gl.uniform1i(gl.getUniformLocation(program, 'uTotalVertices'), totalVertices);
      gl.uniform1i(gl.getUniformLocation(program, 'uSplatOffset'), offset);
      gl.uniform1i(gl.getUniformLocation(program, 'uBatchSize'), currentBatchSize);
      
      // Set matrix world uniform
      const matrixLocation = gl.getUniformLocation(program, 'uSplatMatrixWorld');
      gl.uniformMatrix4fv(matrixLocation, false, matrixWorld.elements);
      
      // Bind textures
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, splatPositionsTexture);
      
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, capsuleVerticesTexture);
      
      gl.activeTexture(gl.TEXTURE2);
      gl.bindTexture(gl.TEXTURE_2D, capsuleVertexInfoTexture);
      
      gl.activeTexture(gl.TEXTURE3);
      gl.bindTexture(gl.TEXTURE_2D, capsuleColorsTexture);
      
      gl.activeTexture(gl.TEXTURE4);
      gl.bindTexture(gl.TEXTURE_2D, capsuleBoneIndicesTexture);
      
      // Run the computation
      gl.drawArrays(gl.TRIANGLES, 0, 6);
      
      // Read back the results
      gl.readPixels(0, 0, currentBatchSize, 1, gl.RGBA, gl.UNSIGNED_BYTE, resultBuffer);
      
      // Process results - extract colors and bone indices
      for (let i = 0; i < currentBatchSize; i++) {
        const globalIndex = offset + i;
        
        // Copy the RGB values from the result buffer
        gs.colors[globalIndex * 4 + 0] = resultBuffer[i * 4 + 0]; // R
        gs.colors[globalIndex * 4 + 1] = resultBuffer[i * 4 + 1]; // G
        gs.colors[globalIndex * 4 + 2] = resultBuffer[i * 4 + 2]; // B
        
        // Alpha channel contains the bone index (scaled by 255.0)
        const boneIndex = resultBuffer[i * 4 + 3];
        gs.splatBoneIndices.push(boneIndex);
      }
      
      // Update progress display
      if (offset % 1000 === 0 || offset + currentBatchSize >= gs.splatCount) {
        let progress = ((offset + currentBatchSize) / gs.splatCount) * 100;
        document.getElementById('loaddisplay').innerHTML = progress.toFixed(1) + '% (1/3)';
        gs.splatMesh.updateDataTexturesFromBaseData(0, gs.splatCount - 1);
        await new Promise(resolve => setTimeout(resolve, 0));
      }
      
      // Clean up resources
      gl.deleteBuffer(positionBuffer);
    }
    
    // Final update of data textures
    gs.splatMesh.updateDataTexturesFromBaseData(0, gs.splatCount - 1);
    
    // Complete progress indicator
    document.getElementById('loaddisplay').innerHTML = (100).toFixed(1) + '% (1/3)';
    
    // Cleanup WebGL resources
    gl.deleteTexture(splatPositionsTexture);
    gl.deleteTexture(capsuleVerticesTexture);
    gl.deleteTexture(capsuleVertexInfoTexture);
    gl.deleteTexture(capsuleColorsTexture);
    gl.deleteTexture(capsuleBoneIndicesTexture);
    gl.deleteTexture(resultTexture);
    gl.deleteFramebuffer(frameBuffer);
    gl.deleteProgram(program);
    
    // Dispose THREE.js texture
    threeTexture.dispose();
    
    console.log("Completed assignSplatsToBonesGL - Step 5 (GL)");
  } catch (error) {
    console.error("Error in assignSplatsToBonesGL:", error);
    throw error; // Re-throw to allow calling code to handle the error
  }
}


// assignSplatsToPointsGL

// Vertex shader source for full-screen quad rendering
const vertexShaderSource2 = `#version 300 es
in vec4 aPosition;
out vec2 vTexCoord;

void main() {
    gl_Position = aPosition;
    vTexCoord = aPosition.xy * 0.5 + 0.5;
}`;

// Fragment shader for vertex lookup and distance calculation
const fragmentShaderSource2 = `#version 300 es
precision highp float;
precision highp sampler2D;
precision highp int;

// Input textures
uniform sampler2D uSplatBoneIndices;    // Bone index for each splat
uniform sampler2D uBoneVertexInfo;      // vertex count and other metadata for each bone
uniform sampler2D uBoneVertices;        // All vertex indices for all bones
uniform sampler2D uSkinnedVertices;     // Pre-computed skinned vertices positions
uniform sampler2D uSplatPositions;      // Splat center positions
uniform mat4 uSplatMatrixWorld;         // Matrix to transform splat position to world space

// Batch processing info
uniform int uSplatOffset;             // Current batch offset
uniform int uBatchSize;               // Current batch size
uniform int uMaxVerticesPerBone;      // Maximum vertices per bone
uniform int uVertexCount;             // Total number of mesh vertices

// Input texture coordinates
in vec2 vTexCoord;
// Output the closest vertex index for the splat
out vec4 fragColor;

// ボーンの頂点テクスチャから頂点インデックスを取得する関数
float getVertexIndex(int boneIndex, int vertexOffset) {
    float texY = (float(boneIndex) + 0.5) / 256.0;
    float texX = (float(vertexOffset) + 0.5) / float(uMaxVerticesPerBone);
    return texture(uBoneVertices, vec2(texX, texY)).r * 65535.0;
}

// 頂点インデックスに対応するスキニング済み頂点の座標を取得する関数
vec3 getSkinnedVertexPosition(int vertexIndex) {
    float texX = (float(vertexIndex) + 0.5) / float(uVertexCount);
    vec4 normalizedPos = texture(uSkinnedVertices, vec2(texX, 0.5));
    return normalizedPos.xyz * 2.0 - 1.0; // 0-1から-1〜1に変換
}

// スプラットの位置を取得する関数
vec3 getSplatPosition(int splatIndex) {
    float d2 = float(splatIndex) / 4096.0;
    float texY = float(floor(d2)) / 1024.0;
    float texX = fract(d2);
    vec2 uv = vec2(texX, texY);

    vec4 normalizedCenter = texture(uSplatPositions, uv);
    vec3 position = normalizedCenter.xyz * 2.0 - 1.0;    
    vec4 transformedPosition = uSplatMatrixWorld * vec4(position, 1.0);
    return transformedPosition.xyz / transformedPosition.w;
}

void main() {
    // Calculate the splat index based on the texture coordinate
    int splatIndex = uSplatOffset + int(vTexCoord.x * float(uBatchSize));
    
    // Get the bone index from the texture
    float d2 = float(splatIndex) / 4096.0;
    float texY = float(floor(d2)) / 1024.0;
    float texX = fract(d2);
    vec2 boneIndexUV = vec2(texX, texY);
    int boneIndex = int(texture(uSplatBoneIndices, boneIndexUV).r * 255.0 + 0.5);
    
    // Get the vertex info for this bone
    float boneTexX = (float(boneIndex) + 0.5) / 256.0;
    vec4 vertexInfo = texture(uBoneVertexInfo, vec2(boneTexX, 0.5));
    
    // Get the number of vertices for this bone
    float vertexCount = vertexInfo.r * float(uMaxVerticesPerBone);
    
    // Get splat position
    vec3 splatPosition = getSplatPosition(splatIndex);
    
    // Find the closest vertex in this bone's vertices
    float minDistance = 1000000.0;
    float closestVertexIndex = 0.0;
    
    if (vertexCount > 0.0) {
        // For each vertex in this bone
        for (int vi = 0; vi < 4096; vi++) {
            if (float(vi) >= vertexCount) break;
            
            float vertexIndex = getVertexIndex(boneIndex, vi);
            vec3 vertexPosition = getSkinnedVertexPosition(int(vertexIndex));
            
            // Calculate distance between splat and vertex
            float dist = distance(splatPosition, vertexPosition);
            
            // Update if this is closer than previous minimum
            if (dist < minDistance) {
                minDistance = dist;
                closestVertexIndex = vertexIndex;
            }
        }
    }
    
    // Output the closest vertex index, bone index, and splat index for debugging
    fragColor = vec4(closestVertexIndex / 65535.0, float(boneIndex) / 255.0, float(splatIndex) / 100000.0, 1.0);
}`;


/**
 * Finds the closest vertex for each splat using GPU acceleration
 * @param {Object} character - Character object containing VRM data
 * @param {Object} gs - Gaussian Splats object
 * @returns {Promise<Array>} Promise that resolves to an array of vertex indices
 */
export async function assignSplatsToPointsGL(character, gs, capsules, capsuleBoneIndex, fast = false) {
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

        // 単純に a,b,c の中心を使う
        // let center = new THREE.Vector3().addVectors(a, b).add(c).divideScalar(3);
        // center.applyMatrix4(capsule.matrixWorld);
        // let distance = skinnedVertex.distanceTo(center);

        if (distance < minDistance) {
          minDistance = distance;
          bestCi = ci;
        }

        // This vertex is clearly not part of this capsule.
        if (distance > 0.2) {
          break;
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



  console.log("Starting assignSplatsToPointsGL - Finding closest vertices for splats on GPU");
  
  try {
    // Initialize WebGL context and shader program
    const { gl, program } = initializeWebGL(vertexShaderSource2, fragmentShaderSource2);
    console.log("WebGL2 context initialized for points assignment");
    
    // Check for float texture support and enable if necessary
    const ext = gl.getExtension('EXT_color_buffer_float');
    if (!ext) {
      console.warn('EXT_color_buffer_float not supported, falling back to RGBA8');
    }
    
    // Find max bone index for texture dimensions
    const maxBoneIndex = Math.max(...Object.keys(boneVertexIndices).map(Number));
    console.log(`Max bone index: ${maxBoneIndex}`);
    
    // Create texture with bone vertex information - using smaller dimensions
    const maxVerticesPerBone = 4096; // 1ボーンあたりの最大頂点数
    const maxBones = 256; // Should be enough for most models

    // 頂点インデックスの全リストを格納するテクスチャ用データ
    const boneVerticesData = new Float32Array(maxBones * maxVerticesPerBone * 4);
    // 各ボーンのメタ情報を格納するテクスチャ用データ
    const boneVertexInfoData = new Float32Array(maxBones * 4);

    // 各ボーンについて頂点情報を設定
    for (let boneIndex = 0; boneIndex <= maxBoneIndex && boneIndex < maxBones; boneIndex++) {
      const vertexIndices = boneVertexIndices[boneIndex] || [];
      const vertexCount = Math.min(vertexIndices.length, maxVerticesPerBone);

      // ボーンのメタ情報：頂点数を格納
      boneVertexInfoData[boneIndex * 4 + 0] = vertexCount / maxVerticesPerBone; // 正規化された頂点数
      boneVertexInfoData[boneIndex * 4 + 1] = vertexIndices.length > 0 ? 1.0 : 0.0; // 頂点があるかどうか
      boneVertexInfoData[boneIndex * 4 + 2] = 0; // 未使用
      boneVertexInfoData[boneIndex * 4 + 3] = 0; // アルファ
      
      // 頂点インデックスをテクスチャデータに設定
      for (let vi = 0; vi < vertexCount; vi++) {
        const vertexIndex = vertexIndices[vi];
        // 0.0-1.0の範囲に正規化してテクスチャに格納
        boneVerticesData[(boneIndex * maxVerticesPerBone + vi) * 4 + 0] = vertexIndex / 65535.0;
        boneVerticesData[(boneIndex * maxVerticesPerBone + vi) * 4 + 1] = 0.0;
        boneVerticesData[(boneIndex * maxVerticesPerBone + vi) * 4 + 2] = 0.0;
        boneVerticesData[(boneIndex * maxVerticesPerBone + vi) * 4 + 3] = 1.0;
      }
    }

    
    const vertexCount = position.count;
    
    const skinnedVerticesData = new Float32Array(vertexCount * 4);
    
    // 各頂点をスキニングして正規化した座標を保存
    for (let i = 0; i < vertexCount; i++) {
      const vertex = new THREE.Vector3().fromBufferAttribute(position, i);
      const skinnedVertex = skinnedMesh.applyBoneTransform(i, vertex);
      skinnedVertex.applyMatrix4(character.currentVrm.scene.matrixWorld);
      
      const normalizedX = (skinnedVertex.x + 1.0) / 2.0;
      const normalizedY = (skinnedVertex.y + 1.0) / 2.0;
      const normalizedZ = (skinnedVertex.z + 1.0) / 2.0;
      
      skinnedVerticesData[i * 4 + 0] = normalizedX; // R
      skinnedVerticesData[i * 4 + 1] = normalizedY; // G
      skinnedVerticesData[i * 4 + 2] = normalizedZ; // B
      skinnedVerticesData[i * 4 + 3] = 1.0;         // A
    }


    const boneVertexInfoTexture = createWebGLTexture(gl, boneVertexInfoData, maxBones, 1, true);
    const boneVerticesTexture = createWebGLTexture(gl, boneVerticesData, maxVerticesPerBone, maxBones, true);
    const skinnedVerticesTexture = createWebGLTexture(gl, skinnedVerticesData, vertexCount, 1, true);
    const threeTexture = createSplatPositionTexture(gs.centers0, gs.splatCount);
    const splatPositionsTexture = threeTextureToWebGLTexture(gl, threeTexture);

    // Create texture for splat bone indices - using same format as assignSplatsToBonesGL
    const width = 4096;
    const height = 1024;  // Math.ceil(gs.splatCount / width);
    const paddedSplatCount = width * height;
    
    const splatBoneIndicesData = new Float32Array(paddedSplatCount * 4);
    for (let i = 0; i < gs.splatCount; i++) {
      const boneIndex = gs.splatBoneIndices[i];
      splatBoneIndicesData[i * 4 + 0] = boneIndex / 255.0; // Normalize to 0-1
      splatBoneIndicesData[i * 4 + 1] = 0;
      splatBoneIndicesData[i * 4 + 2] = 0;
      splatBoneIndicesData[i * 4 + 3] = 1;
    }
    const splatBoneIndicesTexture = createWebGLTexture(gl, splatBoneIndicesData, width, height, true);
    console.log("Splat bone indices texture created");

    // Max batch size
    const batchSize = 1024;
    
    // Create framebuffer for results - using RGBA8 if float textures aren't supported
    const resultTexture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, resultTexture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA32F,  // Using float format
      batchSize,
      1,
      0,
      gl.RGBA,
      gl.FLOAT,
      null
    );

    
    const frameBuffer = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, frameBuffer);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, resultTexture, 0);
    
    // Check framebuffer status
    const frameBufferStatus = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
    if (frameBufferStatus !== gl.FRAMEBUFFER_COMPLETE) {
      console.error('Framebuffer status:', frameBufferStatus);
    }
    
    // Buffer for reading results - determine if we're using float or byte
    const isFloatBuffer = gl.getParameter(gl.MAX_COLOR_ATTACHMENTS) && ext;
    const resultBuffer = isFloatBuffer ? new Float32Array(batchSize * 4) : new Uint8Array(batchSize * 4);

    // Process all splats in batches
    for (let offset = 0; offset < gs.splatCount; offset += batchSize) {
      const currentBatchSize = Math.min(batchSize, gs.splatCount - offset);
      
      // Configure viewport
      gl.viewport(0, 0, currentBatchSize, 1);
      
      // Use the shader program
      gl.useProgram(program);
      
      // Set up the full-screen quad for rendering
      const positionBuffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
        -1, -1,
        1, -1,
        -1, 1,
        -1, 1,
        1, -1,
        1, 1
      ]), gl.STATIC_DRAW);
      
      // Set position attribute
      const positionLocation = gl.getAttribLocation(program, 'aPosition');
      gl.enableVertexAttribArray(positionLocation);
      gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);
      
      // Set uniforms
      gl.uniform1i(gl.getUniformLocation(program, 'uSplatBoneIndices'), 0);
      gl.uniform1i(gl.getUniformLocation(program, 'uBoneVertexInfo'), 1);
      gl.uniform1i(gl.getUniformLocation(program, 'uBoneVertices'), 2);
      gl.uniform1i(gl.getUniformLocation(program, 'uSkinnedVertices'), 3); // 新しい uniform
      gl.uniform1i(gl.getUniformLocation(program, 'uSplatPositions'), 4);
      gl.uniform1i(gl.getUniformLocation(program, 'uSplatOffset'), offset);
      gl.uniform1i(gl.getUniformLocation(program, 'uBatchSize'), currentBatchSize);
      gl.uniform1i(gl.getUniformLocation(program, 'uMaxVerticesPerBone'), maxVerticesPerBone);
      gl.uniform1i(gl.getUniformLocation(program, 'uVertexCount'), vertexCount); // 頂点数

      const matrixLocation = gl.getUniformLocation(program, 'uSplatMatrixWorld');
      gl.uniformMatrix4fv(matrixLocation, false, gs.viewer.splatMesh.scenes[0].matrixWorld.elements);

      // Bind textures
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, splatBoneIndicesTexture);
      
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, boneVertexInfoTexture);
      
      gl.activeTexture(gl.TEXTURE2);
      gl.bindTexture(gl.TEXTURE_2D, boneVerticesTexture);

      gl.activeTexture(gl.TEXTURE3);
      gl.bindTexture(gl.TEXTURE_2D, skinnedVerticesTexture);

      gl.activeTexture(gl.TEXTURE4);
      gl.bindTexture(gl.TEXTURE_2D, splatPositionsTexture);

      // Run the computation
      gl.drawArrays(gl.TRIANGLES, 0, 6);
      
      // Read back the results
      gl.readPixels(0, 0, currentBatchSize, 1, gl.RGBA, isFloatBuffer ? gl.FLOAT : gl.UNSIGNED_BYTE, resultBuffer);
      


      for (let i = 0; i < currentBatchSize; i++) {
        let resultVertexIndex = Math.round(resultBuffer[i * 4 + 0] * 65535.0);

        const vertexIndex = resultVertexIndex;
        gs.splatVertexIndices.push(vertexIndex);
      }
      
      // Clean up resources
      gl.deleteBuffer(positionBuffer);
    }
    
    // Cleanup WebGL resources
    gl.deleteTexture(splatBoneIndicesTexture);
    gl.deleteTexture(boneVertexInfoTexture);
    gl.deleteTexture(boneVerticesTexture);
    gl.deleteTexture(skinnedVerticesTexture);
    gl.deleteTexture(splatPositionsTexture);
    gl.deleteTexture(resultTexture);
    gl.deleteFramebuffer(frameBuffer);
    gl.deleteProgram(program);
    threeTexture.dispose();

    console.log("Completed first vertex assignment for all splats");



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

  } catch (error) {
    console.error("Error in assignSplatsToPointsGL:", error);
    throw error;
  }
}
