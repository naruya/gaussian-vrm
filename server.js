// Copyright (c) 2025 naruya
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

// Development server.
//   node server.js            -> http://localhost:8080  (Chrome treats localhost as a secure context,
//                                so WebGL / WebXR / getUserMedia all work without a certificate)
//   with .server/{key,cert}.pem present, an HTTPS server is also started on 8443 for access from
//   other devices (e.g. a VR headset), which do require https:
//     openssl req -x509 -newkey rsa:4096 -keyout key.pem -out cert.pem -days 365 -nodes -subj "/CN=localhost"
//     mkdir .server && mv *.pem .server/

import http from 'http';
import https from 'https';
import fs from 'fs';
import express from 'express';

const app = express();
app.use(express.static('./'));

const HTTP_PORT = process.env.PORT || 8080;
const HTTPS_PORT = process.env.HTTPS_PORT || 8443;

http.createServer(app).listen(HTTP_PORT, () => {
  console.log(`http://localhost:${HTTP_PORT}`);
});

if (fs.existsSync('.server/key.pem') && fs.existsSync('.server/cert.pem')) {
  const options = {
    key: fs.readFileSync('.server/key.pem'),
    cert: fs.readFileSync('.server/cert.pem')
  };
  https.createServer(options, app).listen(HTTPS_PORT, () => {
    console.log(`https://localhost:${HTTPS_PORT}`);
  });
}
