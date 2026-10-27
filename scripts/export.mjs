// Builds the public data feed in api/ from data/items.json + aggregated Nostr poll votes (totals only).
import fs from 'fs';
const BASE = 'https://walterhendersonjr41-blip.github.io/civic-vote/';
const RELAYS = ['wss://nos.lol', 'wss://relay.primal.net', 'wss://nostr.mom', 'wss://offchain.pub', 'wss://relay.snort.social'];
const d = JSON.parse(fs.readFileSync('data/items.json', 'utf8'));
const items = d.items.map(i => ({ id: i.id, level: i.level, place: i.place, state: i.state, title: i.title, summary: i.summary, status: i.status, official: i.official, officialNote: i.officialNote, date: i.date, url: i.url }));
const w = (f, o) => fs.writeFileSync('api/' + f, JSON.stringify(o));
function readRelay(url) {
  return new Promise(res => {
    const evs = []; let ws, ok = false; const done = () => { try { ws.close(); } catch {} res({ evs, ok }); };
    const t = setTimeout(done, 15000);
    try { ws = new WebSocket(url); } catch { clearTimeout(t); return res(evs); }
    ws.onopen = () => ws.send(JSON.stringify(['REQ', 'cv', { kinds: [30078], '#t': ['cv-vote'], limit: 50000 }]));
    ws.onmessage = m => { const x = JSON.parse(m.data); if (x[0] === 'EVENT') evs.push(x[2]); if (x[0] === 'EOSE') ok = true; if (x[0] === 'EOSE' || x[0] === 'CLOSED') { clearTimeout(t); done(); } };
    ws.onerror = () => { clearTimeout(t); done(); };
  });
}
const latest = new Map(); let relaysOk = 0;
for (const { evs, ok } of await Promise.all(RELAYS.map(readRelay))) {
  if (ok) relaysOk++;
  for (const e of evs) { let c; try { c = JSON.parse(e.content); } catch { continue; } if (!c?.id || !['yes', 'no'].includes(c.v)) continue;
    const k = e.pubkey + '|' + c.id, o = latest.get(k); if (!o || e.created_at > o.at) latest.set(k, { at: e.created_at, id: c.id, v: c.v }); }
}
const tally = {}; for (const { id, v } of latest.values()) { (tally[id] ||= { id, yes: 0, no: 0 })[v]++; }
const votes = Object.values(tally).map(t => ({ ...t, total: t.yes + t.no, yesPct: Math.round(100 * t.yes / (t.yes + t.no)) })).sort((a, b) => b.total - a.total);
const byItem = Object.fromEntries(votes.map(v => [v.id, v]));
const updated = d.updated, cnt = k => items.reduce((m, i) => (m[i[k] || 'none'] = (m[i[k] || 'none'] || 0) + 1, m), {});
w('items.json', { updated, count: items.length, license: 'Government records are public. Civic Vote poll aggregates: free with attribution.', items: items.map(i => ({ ...i, publicVote: byItem[i.id] ? { yes: byItem[i.id].yes, no: byItem[i.id].no } : null })) });
const places = {}; items.forEach(i => { const k = i.level + '|' + i.place + '|' + (i.state || ''); (places[k] ||= { level: i.level, place: i.place, state: i.state || null, items: 0 }).items++; });
w('places.json', { updated, count: Object.keys(places).length, places: Object.values(places).sort((a, b) => b.items - a.items) });
w('summary.json', { updated, items: items.length, places: Object.keys(places).length, votedItems: votes.length, votesCast: latest.size, byLevel: cnt('level'), byState: cnt('state'), byOutcome: cnt('official'), sources: d.status });
w('votes.json', { updated: new Date().toISOString(), note: 'Aggregated public opinion poll totals from Nostr relays (one vote per device key, latest counts). Not an official vote. No per-user data.', relaysRead: relaysOk, items: votes.length, votesCast: latest.size, votes });
const q = s => s == null ? '' : /[",\n\r]/.test(String(s)) ? '"' + String(s).replace(/"/g, '""') + '"' : String(s);
const cols = ['id', 'level', 'place', 'state', 'title', 'summary', 'status', 'official', 'date', 'url', 'publicYes', 'publicNo'];
fs.writeFileSync('api/items.csv', cols.join(',') + '\n' + items.map(i => cols.map(c => q(c === 'publicYes' ? byItem[i.id]?.yes ?? 0 : c === 'publicNo' ? byItem[i.id]?.no ?? 0 : i[c])).join(',')).join('\n') + '\n');
console.log('items', items.length, 'places', Object.keys(places).length, 'votes', latest.size, 'on', votes.length, 'items; relays', relaysOk);
