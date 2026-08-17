'use strict';
const http = require('http');

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'vk8821494@gmail.com';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'vinoth@18';

function request(opts, data) {
  return new Promise((resolve, reject) => {
    const req = http.request(opts, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (c) => { body += c; });
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }));
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

function grabCookies(res) {
  return (res.headers['set-cookie'] || []).map((c) => c.split(';')[0]).join('; ');
}

async function main() {
  const get = await request({ host: 'localhost', port: 3000, path: '/login', method: 'GET' });
  let cookie = grabCookies(get);
  const csrf = (get.body.match(/name="_csrf"[^>]*value="([^"]+)"/) || [])[1];

  const form = `_csrf=${encodeURIComponent(csrf)}&email=${encodeURIComponent(ADMIN_EMAIL)}&password=${encodeURIComponent(ADMIN_PASSWORD)}`;
  const login = await request({
    host: 'localhost',
    port: 3000,
    path: '/login',
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Content-Length': Buffer.byteLength(form),
      Cookie: cookie,
    },
  }, form);
  cookie = grabCookies(login) || cookie;
  console.log('login:', login.status, login.headers.location || '');

  // Fetch pending queue page to obtain session-bound CSRF token.
  const queue = await request({
    host: 'localhost',
    port: 3000,
    path: '/admin/restaurants?status=pending',
    method: 'GET',
    headers: { Cookie: cookie },
  });
  const token = (queue.body.match(/name="_csrf"[^>]*value="([^"]+)"/) || [])[1];
  console.log('queue page:', queue.status, 'csrf token:', !!token);

  const hrefs = [...new Set((queue.body.match(/\/admin\/restaurants\/(\d+)\/approve/g) || []))];
  console.log('approve links found:', hrefs.length);

  let ok = 0;
  let failed = 0;
  for (const href of hrefs) {
    const id = href.match(/\/admin\/restaurants\/(\d+)\/approve/)[1];
    const body = `_csrf=${encodeURIComponent(token)}`;
    const res = await request({
      host: 'localhost',
      port: 3000,
      path: href,
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(body),
        Cookie: cookie,
      },
    }, body);
    if (res.status === 302 && (res.headers.location || '').includes('/admin/restaurants')) {
      ok++;
      console.log(`approved id=${id} (302)`);
    } else {
      failed++;
      console.log(`FAILED id=${id}: ${res.status} -> ${res.headers.location || ''}`);
    }
  }

  console.log(`\nDONE: ${ok} approved, ${failed} failed`);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});