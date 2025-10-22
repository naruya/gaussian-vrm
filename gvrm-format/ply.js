// Copyright (c) 2025 naruya
// Licensed under the MIT License. See LICENSE file in the project root for full license information.


export class PLYParser {
  constructor() {
    this.header = null;
    this.vertexCount = 0;
    this.properties = [];
    this.propertyTypes = new Map([
      ['char', 1], ['uchar', 1],
      ['short', 2], ['ushort', 2],
      ['int', 4], ['uint', 4],
      ['float', 4], ['double', 8]
    ]);
  }

  async parsePLY(url, showProgress) {

    let totalLength;

    if (!url.endsWith('.ply')) {
      showProgress = false;
    }

    if (showProgress) {
      try {
        const headResponse = await fetch(url, { method: 'HEAD' });
        totalLength = Number(headResponse.headers.get('content-length'));
      } catch (error) {
        const response = await fetch(url);
        totalLength = Number(response.headers.get('content-length'));
      }
    } else {
      const response = await fetch(url);
      totalLength = Number(response.headers.get('content-length'));
    }

    const response = await fetch(url);
    const reader = response.body.getReader();
    const chunks = [];

    let loadedLength = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      chunks.push(value);
      loadedLength += value.length;

      const loaddisplay = document.getElementById('loaddisplay');
      if (loaddisplay) {
        if (totalLength) {
          const progress = (loadedLength / totalLength) * 100;
          loaddisplay.innerHTML = `${progress.toFixed(1)}% (1/2)`;
        } else {
          loaddisplay.innerHTML = `${loadedLength} bytes loaded (1/2)`;
        }
      }
    }
    const loaddisplay = document.getElementById('loaddisplay');
    if (loaddisplay) {
      loaddisplay.innerHTML = `${(100).toFixed(1)}% (1/2)`;
    }

    const arrayBuffer = new ArrayBuffer(loadedLength);
    const uint8View = new Uint8Array(arrayBuffer);

    let offset = 0;
    for (const chunk of chunks) {
      uint8View.set(chunk, offset);
      offset += chunk.length;
    }

    const data = new DataView(arrayBuffer);
    offset = 0;

    let headerText = '';
    while (true) {
      const byte = data.getUint8(offset++);
      headerText += String.fromCharCode(byte);
      if (headerText.includes('end_header\n')) break;
    }

    const headerLines = headerText.split('\n');
    this.header = headerLines.filter(line => line.trim() !== '');
    
    let format = 'binary_little_endian';
    for (const line of this.header) {
      if (line.startsWith('format')) {
        format = line.split(' ')[1];
      } else if (line.startsWith('element vertex')) {
        this.vertexCount = parseInt(line.split(' ')[2]);
      } else if (line.startsWith('property')) {
        const parts = line.split(' ');
        this.properties.push({
          type: parts[1],
          name: parts[2]
        });
      }
    }

    const vertexSize = this.properties.reduce((size, prop) => {
      return size + this.propertyTypes.get(prop.type);
    }, 0);

    const vertices = [];
    const verticesRawData = new Uint8Array(arrayBuffer.slice(offset));

    for (let i = 0; i < this.vertexCount; i++) {
      const vertex = {
        rawData: verticesRawData.slice(i * vertexSize, (i + 1) * vertexSize)
      };
      
      let propertyOffset = 0;
      for (const prop of this.properties) {
        const size = this.propertyTypes.get(prop.type);
        let value;
        
        switch (prop.type) {
          case 'float':
            value = data.getFloat32(offset + propertyOffset, true);
            break;
        }
        
        vertex[prop.name] = value;
        propertyOffset += size;
      }
      
      vertices.push(vertex);
      offset += vertexSize;

      if (i % 10000 === 0) {
        const progress = (i / this.vertexCount) * 100;
        const loaddisplay = document.getElementById('loaddisplay');
        if (loaddisplay) {
          await new Promise(resolve => {
            requestAnimationFrame(() => {
              loaddisplay.innerHTML = `${progress.toFixed(1)}% (2/2)`;
              resolve();
            });
          });
        }
      }
    }
    const loaddisplayFinal = document.getElementById('loaddisplay');
    if (loaddisplayFinal) {
      loaddisplayFinal.innerHTML = `${(100).toFixed(1)}% (2/2)`;
    }

    return {
      header: this.header,
      vertices: vertices,
      vertexCount: this.vertexCount,
      vertexSize: vertexSize
    };
  }

  createPLYFile(header, vertices, vertexSize) {
    const headerStr = header.join('\n') + '\n';
    const encoder = new TextEncoder();
    const headerArray = encoder.encode(headerStr);

    const verticesArray = new Uint8Array(vertices.length * vertexSize);
    vertices.forEach((vertex, index) => {
      verticesArray.set(vertex.rawData, index * vertexSize);
    });

    const finalArray = new Uint8Array(headerArray.length + verticesArray.length);
    finalArray.set(headerArray, 0);
    finalArray.set(verticesArray, headerArray.length);

    return finalArray;
  }

  async splitPLY(plyUrl, sceneSplatIndices) {
    const plyData = await this.parsePLY(plyUrl, false);

    const createModifiedHeader = (vertexCount) => {
      return plyData.header.map(line => {
        if (line.startsWith('element vertex')) {
          return `element vertex ${vertexCount}`;
        }
        return line;
      });
    };

    const sceneUrls = [];
    for (const [sceneIndex, indices] of Object.entries(sceneSplatIndices)) {
      const sceneVertices = indices.map(index => plyData.vertices[index]);

      const scenePlyData = this.createPLYFile(
        createModifiedHeader(sceneVertices.length),
        sceneVertices,
        plyData.vertexSize
      );

      const blob = new Blob([scenePlyData], { type: 'application/octet-stream' });
      sceneUrls.push(URL.createObjectURL(blob));
    }

    return sceneUrls;
  }
}