// Copyright (c) 2025 naruya
// Licensed under the MIT License. See LICENSE file in the project root for full license information.


// openssl req -x509 -newkey rsa:4096 -keyout key.pem -out cert.pem -days 365 -nodes -subj "/CN=localhost"
// mkdir .server
// mv *.pem .server/
// export PATH=$PATH:/home/nama/.npm_global/bin
// npm install -g express
// node server.js &

const https = require('https');
const fs = require('fs');
const express = require('express');
const app = express();

const options = {
  key: fs.readFileSync('.server/key.pem'),
  cert: fs.readFileSync('.server/cert.pem')
};

app.use(express.static('./'));

https.createServer(options, app).listen(8080);
