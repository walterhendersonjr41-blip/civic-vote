// Runs in GitHub Actions every 6 hours. Writes data/items.json with real items only.
import fs from 'fs';
const now = Date.now(), DAY = 864e5;
const status = {}; const items = [];
const clip = (s, n = 280) => { s = String(s || '').replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1) + '…' : s; };
const get = async (u, ms = 20000) => { const r = await fetch(u, { signal: AbortSignal.timeout(ms), headers: { 'User-Agent': 'civic-vote (github.com/walterhendersonjr41-blip/civic-vote)' } }); if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); };

// ---- Federal: congress.gov (free DEMO_KEY, or CONGRESS_API_KEY secret if set)
const KEY = process.env.CONGRESS_API_KEY || 'DEMO_KEY';
const TYPE = { HR: 'house-bill', S: 'senate-bill', HJRES: 'house-joint-resolution', SJRES: 'senate-joint-resolution', HCONRES: 'house-concurrent-resolution', SCONRES: 'senate-concurrent-resolution', HRES: 'house-resolution', SRES: 'senate-resolution' };
try {
  const j = await get(`https://api.congress.gov/v3/bill/119?api_key=${KEY}&format=json&limit=250&sort=updateDate+desc`, 30000);
  let n = 0;
  for (const b of j.bills || []) {
    const d = b.latestAction?.actionDate; if (!d || now - Date.parse(d) > 45 * DAY) continue;
    items.push({ id: `us-${b.type}${b.number}-${b.congress}`.toLowerCase(), level: 'Federal', place: 'U.S. Congress', state: 'US',
      title: clip(`${b.type} ${b.number}: ${b.title}`, 220), summary: clip('Latest: ' + b.latestAction.text), date: d,
      status: b.originChamber ? `Started in the ${b.originChamber}` : '',
      url: `https://www.congress.gov/bill/${b.congress}th-congress/${TYPE[b.type] || 'house-bill'}/${b.number}` });
    n++;
  }
  status.federal = { ok: true, source: 'congress.gov', count: n };
} catch (e) { status.federal = { ok: false, source: 'congress.gov', error: String(e.message || e) }; }

// ---- World: UK Parliament bills API (free, no key)
try {
  const j = await get('https://bills-api.parliament.uk/api/v1/Bills?SortOrder=DateUpdatedDescending&Take=40&CurrentHouse=All', 30000);
  let n = 0;
  for (const b of j.items || []) {
    if (b.billWithdrawn || b.isDefeated) continue;
    const st = b.currentStage || {}; const sit = (st.stageSittings || [])[0];
    items.push({ id: 'uk-' + b.billId, level: 'World', place: 'United Kingdom Parliament', state: 'UK', country: 'United Kingdom',
      title: clip(b.shortTitle, 220), summary: clip(`Now at: ${st.description || 'unknown stage'} in the House of ${b.currentHouse}.${b.isAct ? ' Already became law.' : ''}`),
      date: (sit?.date || b.lastUpdate || '').slice(0, 10), status: b.isAct ? 'Act (law)' : (st.description || ''),
      url: `https://bills.parliament.uk/bills/${b.billId}` });
    n++;
  }
  status.world = { ok: true, source: 'UK Parliament bills API', count: n, note: 'Canada LEGISinfo blocked automated reads; EU not added yet.' };
} catch (e) { status.world = { ok: false, source: 'UK Parliament bills API', error: String(e.message || e) }; }

// ---- State: no free no-signup source found yet (Open States/Plural and LegiScan need keys)
status.state = { ok: false, source: 'none', error: 'No free, no-sign-up source for state legislatures yet. Open States needs a free API key.' };

// ---- Local: every Legistar client that answers the public API
const places = JSON.parse(fs.readFileSync('scripts/places.json', 'utf8'));
const slugs = fs.readFileSync('scripts/legistar-clients.txt', 'utf8').split('\n').map(s => s.trim()).filter(Boolean);
const since = new Date(now - 120 * DAY).toISOString().slice(0, 10);
const local = { tried: slugs.length, ok: 0, withItems: 0, failed: [] };
async function one(s) {
  const meta = places[s] || { name: s, state: '', level: 'City' };
  try {
    const j = await get(`https://webapi.legistar.com/v1/${s}/matters?$top=20&$orderby=MatterLastModifiedUtc%20desc&$filter=MatterLastModifiedUtc%20ge%20datetime'${since}'`);
    if (!Array.isArray(j)) throw new Error('bad reply');
    local.ok++; let n = 0;
    for (const m of j) {
      const title = clip(m.MatterTitle || m.MatterName, 220); if (!title) continue;
      const d = (m.MatterAgendaDate || m.MatterIntroDate || m.MatterLastModifiedUtc || '').slice(0, 10);
      const bits = [m.MatterTypeName, m.MatterBodyName && 'at ' + m.MatterBodyName].filter(Boolean).map(x => x.trim());
      items.push({ id: `${s}-${m.MatterId}`, level: meta.level || 'City', place: meta.name, state: meta.state || '', title,
        summary: clip((m.MatterName && m.MatterName !== m.MatterTitle ? m.MatterName + '. ' : '') + bits.join(' ')),
        date: d, status: (m.MatterStatusName || '').trim(),
        url: `https://${s}.legistar.com/LegislationDetail.aspx?ID=${m.MatterId}&GUID=${m.MatterGuid}` });
      n++;
    }
    if (n) local.withItems++;
  } catch (e) { local.failed.push(s); }
}
const q = [...slugs]; await Promise.all(Array.from({ length: 8 }, async () => { while (q.length) await one(q.shift()); }));
status.local = { ok: local.withItems > 0, source: 'Legistar public API', tried: local.tried, answered: local.ok, withItems: local.withItems,
  note: 'Places not on Legistar (for example Chattanooga and Hamilton County, TN) are not covered yet.' };

items.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
fs.mkdirSync('data', { recursive: true });
fs.writeFileSync('data/items.json', JSON.stringify({ updated: new Date().toISOString(), status, items }));
console.log(JSON.stringify(status), items.length, 'items');
