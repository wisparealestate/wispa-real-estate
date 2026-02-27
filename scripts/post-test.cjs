#!/usr/bin/env node
const http = require('http');

const payload = JSON.stringify({
  property: {
    title: 'POST TEST ' + Date.now(),
    price: 123,
    address: 'Test Addr',
    description: 'test',
    post_to: 'available'
  },
  photoUrls: []
});

const opts = {
  hostname: 'localhost',
  port: 3001,
  path: '/api/properties',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(payload)
  }
};

function doReq() {
  return new Promise((resolve, reject) => {
    const req = http.request(opts, (res) => {
      let s = '';
      res.on('data', (c) => (s += c));
      res.on('end', () => resolve({ status: res.statusCode, body: s }));
    });
    req.on('error', (e) => reject(e));
    req.write(payload);
    req.end();
  });
}

(async () => {
  for (let i = 0; i < 15; i++) {
    try {
      const r = await doReq();
      console.log(JSON.stringify(r, null, 2));
      process.exit(0);
    } catch (e) {
      if (i === 14) {
        console.error('post failed', e && e.stack ? e.stack : e);
        process.exit(1);
      } else {
        console.log('retry', i + 1);
        await new Promise((r) => setTimeout(r, 1000));
      }
    }
  }
})();
