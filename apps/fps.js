// Copyright (c) 2025 naruya
// Licensed under the MIT License. See LICENSE file in the project root for full license information.


export class FPSCounter {
    constructor(idx, scene) {
      this.gLastFrame = window.performance.now();
    }
  
    update() {
      let currentFrame = window.performance.now();
      let milliseconds = currentFrame - this.gLastFrame;
      let oldMilliseconds = 1000 /
        (parseFloat(document.getElementById('fpsdisplay').innerHTML) || 1.0);
  
      // Prevent the FPS from getting stuck by ignoring frame times over 2 seconds.
      if (oldMilliseconds > 2000 || oldMilliseconds < 0) {
        oldMilliseconds = milliseconds;
      }
      let smoothMilliseconds = oldMilliseconds * (0.75) + milliseconds * 0.25;
      let smoothFps = 1000 / smoothMilliseconds;
      this.gLastFrame = currentFrame;
      this.fps = smoothFps;
      document.getElementById('fpsdisplay').innerHTML = smoothFps.toFixed(1);
    }
  }