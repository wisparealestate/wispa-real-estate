const fs = require('fs').promises;
const path = require('path');

async function ensureDataDir(){
  const d = path.join(process.cwd(), 'data');
  try{ await fs.mkdir(d, { recursive: true }); }catch(e){}
  return d;
}

async function write(name, data){
  const d = await ensureDataDir();
  const p = path.join(d, name);
  try{
    // create backup if file exists
    const stat = await fs.stat(p).catch(()=>null);
    if(stat && stat.isFile()){
      const bak = path.join(d, `${name}.bak.${Date.now()}`);
      await fs.copyFile(p, bak).catch(()=>{});
      console.log('Backup created:', bak);
    }
    const tmp = p + `.tmp.${Math.random().toString(36).slice(2,8)}`;
    await fs.writeFile(tmp, JSON.stringify(data, null, 2), 'utf8');
    await fs.rename(tmp, p);
    console.log('Wrote', p);
  }catch(e){
    console.error('Failed to write', p, e && e.message ? e.message : e);
    throw e;
  }
}

(async()=>{
  try{
    const now = new Date().toISOString();
    await write('property_requests.json', [
      { id: 1, name: 'Smoke Tester', email: 'smoke@test', message: 'I am interested in property #123', status: 'open', createdAt: now }
    ]);

    await write('contact_messages.json', [
      { id: 1, name: 'Smoke Contact', email: 'contact@smoke.test', subject: 'Test', message: 'Contact message from smoke test', createdAt: now }
    ]);

    await write('system_alerts.json', [
      { id: 1, title: 'Smoke Alert', message: 'This is a test system alert', severity: 'info', createdAt: now }
    ]);

    await write('notification_reactions.json', [
      { id: 1, notificationId: 1, userId: null, reaction: 'like', createdAt: now }
    ]);

    console.log('Seed complete.');
  }catch(e){ console.error('Seed error', e); process.exit(1); }
})();
