#!/usr/bin/env node
// Compare UI-like upload+POST flow vs scripted admin POST
// Usage: node scripts/compare-ui-vs-script.cjs [--admin-cookie "name=value"]

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const fetch = global.fetch || require('node-fetch');
const FormData = global.FormData;

const API_BASE = (process.env.API_HOST) ? process.env.API_HOST.replace(/\/$/, '') : 'http://localhost:3001';

function log(obj){ console.log(JSON.stringify(obj, null, 2)); }

async function uploadPhotos(cookie) {
  const url = API_BASE + '/api/upload-photos';
  const form = new FormData();
  // UI uploads files as FormData; simulate with a small text file field
  const blob = new Blob([Buffer.from('test')], { type: 'text/plain' });
  form.append('files', blob, 'test.txt');

  const headers = {};
  if (cookie) headers['cookie'] = cookie;

  console.log('-> Uploading to', url);
  console.log('   Request headers (upload):', headers);

  const res = await fetch(url, { method: 'POST', body: form, headers, redirect: 'manual' });
  const text = await res.text();
  console.log('   Response status (upload):', res.status);
  let json = null;
  try{ json = JSON.parse(text); }catch(e){ json = text; }
  console.log('   Response body (upload):', json);
  return { status: res.status, body: json, headers: res.headers.raw ? res.headers.raw() : {} };
}

async function postProperty(photoUrls, cookie, provideUserId) {
  const url = API_BASE + '/api/properties';
  const property = {
    title: 'Compare test ' + Date.now(),
    description: 'Compare UI vs script',
    price: 1000,
    address: '123 Script Rd',
    bedrooms: 1,
    bathrooms: 1,
    area: 50,
    images: photoUrls || []
  };
  if (provideUserId) property.user_id = null; // mimic admin leaving user_id null

  const headers = { 'content-type': 'application/json' };
  if (cookie) headers['cookie'] = cookie;

  console.log('-> Posting property to', url);
  console.log('   Request headers (post):', headers);
  console.log('   Request body (post):', property);

  const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify({ property, photoUrls }) });
  const text = await res.text();
  console.log('   Response status (post):', res.status);
  let json = null;
  try{ json = JSON.parse(text); }catch(e){ json = text; }
  console.log('   Response body (post):', json);
  return { status: res.status, body: json, headers: res.headers.raw ? res.headers.raw() : {} };
}

(async function(){
  const args = process.argv.slice(2);
  let adminCookie = null;
  for(let i=0;i<args.length;i++){
    if(args[i] === '--admin-cookie' && args[i+1]){ adminCookie = args[i+1]; i++; }
  }

  console.log('API_BASE=', API_BASE);

  // 1) UI-like flow: upload then post, credentials simulated by NOT providing cookie (browser would send cookie automatically if same-origin or API_BASE matches and credentials include). For comparison we run without cookie to see public behavior.
  console.log('\n=== UI-like flow (no cookie passed) ===');
  const upResUI = await uploadPhotos(null);
  let photoUrlsUI = [];
  if (upResUI && upResUI.body) {
    if (Array.isArray(upResUI.body)) photoUrlsUI = upResUI.body;
    else if (Array.isArray(upResUI.body.urls)) photoUrlsUI = upResUI.body.urls;
    else if (Array.isArray(upResUI.body.uploaded)) photoUrlsUI = upResUI.body.uploaded;
  }
  const postResUI = await postProperty(photoUrlsUI, null, false);

  // 2) Admin-like flow: include admin cookie header if provided
  console.log('\n=== Admin-like flow (with cookie header if provided) ===');
  const upResAdmin = await uploadPhotos(adminCookie);
  let photoUrlsAdmin = [];
  if (upResAdmin && upResAdmin.body) {
    if (Array.isArray(upResAdmin.body)) photoUrlsAdmin = upResAdmin.body;
    else if (Array.isArray(upResAdmin.body.urls)) photoUrlsAdmin = upResAdmin.body.urls;
    else if (Array.isArray(upResAdmin.body.uploaded)) photoUrlsAdmin = upResAdmin.body.uploaded;
  }
  const postResAdmin = await postProperty(photoUrlsAdmin, adminCookie, true);

  // Summarize
  console.log('\n=== Summary ===');
  log({ ui: { upload: upResUI, post: postResUI }, admin: { upload: upResAdmin, post: postResAdmin } });
})();
