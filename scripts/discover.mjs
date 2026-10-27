// One-time/occasional: find which Legistar clients answer the public API and read their display name.
import fs from 'fs';
const slugs = fs.readFileSync('scripts/legistar-clients.txt','utf8').split('\n').map(s=>s.trim()).filter(Boolean);
const out = {}; let i = 0;
async function one(s){
  try{
    const r = await fetch(`https://webapi.legistar.com/v1/${s}/matters?$top=1`, {signal: AbortSignal.timeout(15000)});
    if(!r.ok) return;
    const j = await r.json(); if(!Array.isArray(j)) return;
    let name = s;
    try{ const h = await (await fetch(`https://${s}.legistar.com/Calendar.aspx`,{signal:AbortSignal.timeout(20000),headers:{'User-Agent':'Mozilla/5.0'}})).text();
      const m = h.match(/alt="([^"]+?)\s*logo"/i); if(m) name = m[1].trim(); }catch(e){}
    out[s] = {name};
  }catch(e){}
}
const q=[...slugs]; await Promise.all(Array.from({length:10},async()=>{while(q.length) await one(q.shift());}));
fs.writeFileSync('scripts/discovered.json', JSON.stringify(out,null,0));
console.log(Object.keys(out).length, 'of', slugs.length);
