// Copyright (c) 2025 naruya
// Licensed under the MIT License. See LICENSE file in the project root for full license information.


import * as THREE from 'three';

/**
 * Creates a WebGL2 context and initializes shaders
 * @param {string} vertexShaderSource - Vertex shader source code
 * @param {string} fragmentShaderSource - Fragment shader source code
 * @returns {Object} WebGL2 context and shader program
 */
export function initializeWebGL(vertexShaderSource, fragmentShaderSource) {
  // Create a canvas for rendering
  const canvas = document.createElement('canvas');
  canvas.width = 1024; // Width of the computation texture
  canvas.height = 1;   // Height for single row processing
  
  // Get WebGL2 context
  const gl = canvas.getContext('webgl2');
  if (!gl) {
      throw new Error('WebGL2 not supported');
  }
  
  // Create vertex shader
  const vertexShader = gl.createShader(gl.VERTEX_SHADER);
  gl.shaderSource(vertexShader, vertexShaderSource);
  gl.compileShader(vertexShader);
  if (!gl.getShaderParameter(vertexShader, gl.COMPILE_STATUS)) {
      throw new Error('Vertex shader compilation failed: ' + gl.getShaderInfoLog(vertexShader));
  }
  
  // Create fragment shader
  const fragmentShader = gl.createShader(gl.FRAGMENT_SHADER);
  gl.shaderSource(fragmentShader, fragmentShaderSource);
  gl.compileShader(fragmentShader);
  if (!gl.getShaderParameter(fragmentShader, gl.COMPILE_STATUS)) {
      throw new Error('Fragment shader compilation failed: ' + gl.getShaderInfoLog(fragmentShader));
  }
  
  // Create shader program
  const program = gl.createProgram();
  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error('Shader program linking failed: ' + gl.getProgramInfoLog(program));
  }
  
  return { gl, program, canvas };
}

/**
 * Creates a data texture from splat center positions using THREE.js DataTexture
 * Uses fixed dimensions (4096x1024) as in the reference code
 * @param {Float32Array} centers0 - Array of center positions in x,y,z format
 * @param {Number} splatCount - Number of splats
 * @returns {THREE.DataTexture} Created texture
 */
export function createSplatPositionTexture(centers0, splatCount) {
  // Fixed dimensions as in the reference code
  const width = 4096;
  const height = 1024;
  
  console.log(`Creating splat position texture: ${width}x${height} for ${splatCount} splats`);
  
  // Prepare the data array (RGBA format)
  const rgbaData = new Float32Array(width * height * 4);
  
  // Fill with data using the reference indexing method
  for (let i = 0; i < splatCount; i++) {
    const x = centers0[i * 3 + 0];
    const y = centers0[i * 3 + 1];
    const z = centers0[i * 3 + 2];
    
    // Calculate texture position using the reference method
    const d2 = i / width;
    const y2 = Math.floor(d2);
    const x2 = d2 - y2;
    
    const index = (y2 * width + Math.floor(x2 * width)) * 4;
    
    // Normalize to 0-1 range for texture storage
    rgbaData[index + 0] = (x + 1.0) / 2.0; // R = normalized x
    rgbaData[index + 1] = (y + 1.0) / 2.0; // G = normalized y
    rgbaData[index + 2] = (z + 1.0) / 2.0; // B = normalized z
    rgbaData[index + 3] = 1.0;             // A = 1.0 (fully opaque)
  }
  
  // Create the texture using THREE.DataTexture
  const texture = new THREE.DataTexture(
    rgbaData,
    width,
    height,
    THREE.RGBAFormat,
    THREE.FloatType
  );
  
  texture.needsUpdate = true;
  return texture;
}

/**
 * Creates a WebGL texture from provided data
 * @param {WebGLRenderingContext} gl - WebGL context
 * @param {TypedArray} data - Array data (Float32Array or Uint8Array)
 * @param {Number} width - Texture width
 * @param {Number} height - Texture height
 * @param {Boolean} isFloat - Whether data is float type (true) or byte type (false)
 * @returns {WebGLTexture} WebGL texture
 */
export function createWebGLTexture(gl, data, width, height, isFloat = true) {
  // Create a new WebGL texture
  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  
  // Set texture parameters
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  
  // Upload to the WebGL texture with appropriate type
  gl.texImage2D(
    gl.TEXTURE_2D,
    0,
    isFloat ? gl.RGBA32F : gl.RGBA8,   // Format based on data type
    width,
    height,
    0,
    gl.RGBA,
    isFloat ? gl.FLOAT : gl.UNSIGNED_BYTE,  // Type based on data type
    data
  );
  
  return texture;
}

/**
 * Convert a THREE.js texture to a WebGL texture
 * @param {WebGLRenderingContext} gl - WebGL context
 * @param {THREE.DataTexture} threeTexture - THREE.js texture
 * @returns {WebGLTexture} WebGL texture
 */
export function threeTextureToWebGLTexture(gl, threeTexture) {
  const data = threeTexture.image.data;
  const width = threeTexture.image.width;
  const height = threeTexture.image.height;
  
  // Determine if data is float type
  const isFloat = data instanceof Float32Array;
  
  // Use the generic function to create the texture
  return createWebGLTexture(gl, data, width, height, isFloat);
}

/**
 * Creates a texture containing capsule center positions
 * @param {WebGLRenderingContext} gl - WebGL context
 * @param {Object} capsules - THREE.js capsules collection
 * @returns {WebGLTexture} WebGL texture containing capsule centers
 */
export function createCapsuleCentersTexture(gl, capsules) {
  const capsuleCount = capsules.children.length;
  console.log(`Creating texture for ${capsuleCount} capsule centers`);
  
  // Create Float32Array for capsule center data
  const capsuleCentersData = new Float32Array(capsuleCount * 4);
  
  // Compute capsule centers and store them in the array
  for (let ci = 0; ci < capsuleCount; ci++) {
    const capsule = capsules.children[ci];
    
    // Get the center of the capsule
    const center = new THREE.Vector3();
    capsule.geometry.computeBoundingSphere();
    center.copy(capsule.geometry.boundingSphere.center);
    
    // Transform to world space
    center.applyMatrix4(capsule.matrixWorld);
    
    // Normalize the center position to 0-1 range for texture storage
    const maxValue = 1.0;
    const normalizedX = (center.x + maxValue) / (2.0 * maxValue);
    const normalizedY = (center.y + maxValue) / (2.0 * maxValue);
    const normalizedZ = (center.z + maxValue) / (2.0 * maxValue);
    
    // Store normalized coordinates in Float32Array
    capsuleCentersData[ci * 4 + 0] = normalizedX; // R
    capsuleCentersData[ci * 4 + 1] = normalizedY; // G
    capsuleCentersData[ci * 4 + 2] = normalizedZ; // B
    capsuleCentersData[ci * 4 + 3] = 1.0;         // A
    
    console.log(`Capsule ${ci} center: (${center.x.toFixed(3)}, ${center.y.toFixed(3)}, ${center.z.toFixed(3)})`);
  }
  
  // Use the generic function to create the texture
  return createWebGLTexture(gl, capsuleCentersData, capsuleCount, 1, true);
}