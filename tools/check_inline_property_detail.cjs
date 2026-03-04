const fs = require('fs');
const path = require('path');
const html = fs.readFileSync(path.join(__dirname,'..','src','property-detail.html'),'utf8');
const regex = /<script(?![^>]*src)[^>]*>([\s\S]*?)<\/script>/gi;
let m; let combined = '';
while((m = regex.exec(html)) !== null){ combined += '\n//---- INLINE SCRIPT ----\n' + m[1] + '\n'; }
if(!combined.trim()){ console.log('No inline scripts found'); process.exit(0); }
const tmp = path.join(__dirname,'..','tmp_property_detail_inline.js');
try{
  try{ if(fs.existsSync(tmp)) fs.copyFileSync(tmp, tmp + '.bak.' + Date.now()); }catch(_){ }
  const tmpOut = tmp + `.tmp.${Math.random().toString(36).slice(2,8)}`;
  fs.writeFileSync(tmpOut, combined, 'utf8');
  fs.renameSync(tmpOut, tmp);
  console.log('Wrote inline script to', tmp);
}catch(e){ console.error('Failed to write inline script', e && e.message ? e.message : e); process.exit(2); }
// Run node --check on the generated file
const cp = require('child_process');
try{
  const out = cp.execFileSync(process.execPath, ['--check', tmp], { stdio: 'pipe' });
  console.log('Syntax OK');
  process.exit(0);
}catch(err){
  console.error('Syntax check failed:');
  if(err.stdout) console.log(err.stdout.toString());
  if(err.stderr) console.log(err.stderr.toString());
  process.exit(err.status || 1);
}
