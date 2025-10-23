# Instant Skinned Gaussian Avatars

[![Project Page](https://img.shields.io/badge/Project%20Page-Open-1f6feb?style=flat-square&logo=homepage)](https://gaussian-vrm.github.io/)
[![arXiv](https://img.shields.io/badge/arXiv-2501.12345-b31b1b?style=flat-square&logo=arxiv&logoColor=white)](https://arxiv.org/abs/2510.13978)
[![Demo](https://img.shields.io/badge/Demo-Live-00b140?style=flat-square&logo=googlechrome&logoColor=white)](http://naruya.github.io/gaussian-vrm)

<img src="https://i.gyazo.com/5f7bcfed3de6e51f98e84278f18c1897.gif" width=80%>

This is the official repository for **Instant Skinned Gaussian Avatars for Web, Mobile and VR Applications** (SUI 2025 Demo Track).<br>

Try our online demo at https://naruya.github.io/gaussian-vrm/ <br>
For more details, check out our project page at https://gaussian-vrm.github.io/

🎉 We’ve released **sample avatars and original scan data**!  
Check out the [Sample Avatars](#sample-avatars) section below for details.

# Gaussian-VRM

**Gaussian-VRM (GVRM)** is a three.js implementation of **Instant Skinned Gaussian Avatars**. GVRM is built on top of [three-vrm](https://github.com/pixiv/three-vrm) and [gaussian-splats-3d](https://github.com/mkkellogg/GaussianSplats3D). GVRM can handle avatars as standard three.js objects, allowing you to directly reuse VRM format avatar operations (such as movement and animations).

**For detailed usage instructions, please check 👉 [Gaussian-VRM Examples](https://github.com/naruya/gaussian-vrm/tree/main/examples) 👈**

## Quick Example

```javascript
// GVRM
const gvrm = await GVRM.load('./assets/author.gvrm', scene, camera, renderer);  // 1/3
await gvrm.changeFBX('./assets/Idle.fbx');  // 2/3

renderer.setAnimationLoop(() => {
  gvrm.update();  // 3/3
  renderer.render(scene, camera);
});
```

The three steps are:

1. Load GVRM file
2. Change animation
3. Update every frame

That's all! (Super easy!) The full JavaScript code can be seen below:

```javascript
import * as THREE from 'three';
import { GVRM } from 'gvrm';

const canvas = document.getElementById('canvas');
const renderer = new THREE.WebGLRenderer({ canvas });
renderer.setSize(640, 480);

const scene = new THREE.Scene();

const camera = new THREE.PerspectiveCamera(65, 640 / 480, 0.01, 100);
camera.position.set(0, 0.4, 1.5);

// GVRM
const gvrm = await GVRM.load('./assets/author.gvrm', scene, camera, renderer);  // 1/3
await gvrm.changeFBX('./assets/Idle.fbx');  // 2/3

renderer.setAnimationLoop(() => {
    gvrm.update();  // 3/3
    renderer.render(scene, camera);
});
```


**For more usage, please check 👉 [Gaussian-VRM Examples](https://github.com/naruya/gaussian-vrm/tree/main/examples) 👈**


## Advanced Examples

### Embed in Your Website

<img src="https://i.gyazo.com/250c99bd3bed7f30e3ca2ab064da88cc.png" width="400px">

### Playable Avatar

<img src="https://i.gyazo.com/ec1ba83eb39d6ecf08605feaa880c1fd.png" width="400px">

### Webcam control / Splat Effects

(coming soon!)

## Sample Avatars

Six sample avatars and original scan data are available on Google Drive:
🔗 [Sample Avatars (Google Drive)](https://drive.google.com/drive/folders/1R9QXjUiDZf0vo7E4GnmnvyB_KB9-N2F8?usp=drive_link)  
These avatars are released under the **MIT License**,
**as long as they are not used in ways that violate public order or morality.**

<!--
<img width="300" height="876" alt="samples" src="https://github.com/user-attachments/assets/ab1e7e23-ed57-4f57-8fcc-8881743866f8" />
-->

## Extra Animation Files

If you would like to use animation files with the sample avatars, the easiest way is to download them from [Mixamo](https://www.mixamo.com/).

**Recommended download settings:**
- **Format:** FBX ASCII (.fbx)  
- **Skin:** Without Skin  
- **Frames per Second:** 60  
- **Keyframe Reduction:** None  

## License

- **Source Code**
  This repository's source code is licensed under the [MIT License](./LICENSE).  
  👉 Unlike other related research, this work does **not** use SMPL, any deep learning models,  
  or mesh optimizers with restrictive licenses — therefore, it can be released under the MIT License! 🎉🎉

- **Assets** (`./assets` and `./examples/assets/` directories)
  The files under these directories are **not covered by the MIT License**.  
  They are provided solely for research purposes and **may not be used, modified, or redistributed**
  without explicit permission.

  Certain sample avatars are separately provided under the MIT License
  — see the [Sample Avatars](#sample-avatars) section above for details.


## Acknowledgements

This work was supported by the Ochiai Pavilion at the Osaka/Kansai Expo 2025.<br>
This work was supported by JSPS KAKENHI Grant Number [23KJ0284](https://kaken.nii.ac.jp/ja/grant/KAKENHI-PROJECT-23KJ0284/).

The VRM model in this repository is freely usable for any purpose, except standalone redistribution of the original, unmodified model. The model can be found at [JOKER's store](https://jokerconentsshop.booth.pm/). Thanks!

## Bibtex

```bibtex
@misc{kondo2025instantskinnedgaussianavatars,
      title={Instant Skinned Gaussian Avatars for Web, Mobile and VR Applications},
      author={Naruya Kondo and Yuto Asano and Yoichi Ochiai},
      year={2025},
      eprint={2510.13978},
      archivePrefix={arXiv},
      primaryClass={cs.CG},
      url={https://arxiv.org/abs/2510.13978},
}
```
