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
  await fs.writeFile(p, JSON.stringify(data, null, 2), 'utf8');
  console.log('Wrote', p);
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
