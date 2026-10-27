// Free shared votes and polls on public Nostr relays (no account, no server).
// Each device makes its own random key; one vote per device per item (a newer vote replaces the older one).
import { generateSecretKey, getPublicKey, finalizeEvent, SimplePool, bytesToHex, hexToBytes } from './nostr.bundle.js';
const KIND = 30078, NS = /[?&]ns=test/.test(location.search) ? '-test' : '';
const RELAYS = ['wss://nos.lol', 'wss://relay.primal.net', 'wss://nostr.mom', 'wss://offchain.pub', 'wss://relay.snort.social'];
const sleep = ms => new Promise(r => setTimeout(r, ms));
let hex = localStorage.getItem('cv-sk');
if (!/^[0-9a-f]{64}$/.test(hex || '')) { hex = bytesToHex(generateSecretKey()); localStorage.setItem('cv-sk', hex); }
const SK = hexToBytes(hex), PK = getPublicKey(SK), pool = new SimplePool();
async function publish(tags, content) {
  const ev = finalizeEvent({ kind: KIND, created_at: Math.floor(Date.now() / 1000), tags, content: JSON.stringify(content) }, SK);
  const rs = await Promise.allSettled(pool.publish(RELAYS, ev).map(p => Promise.race([p, sleep(9000).then(() => { throw 0; })])));
  if (!rs.some(r => r.status === 'fulfilled')) throw new Error('offline');
  return ev;
}
const J = s => { try { return JSON.parse(s) || {}; } catch (e) { return {}; } };
window.Board = {
  me: PK,
  vote: (id, choice) => publish([['d', 'cv-vote' + NS + ':' + id], ['t', 'cv-vote' + NS], ['t', 'cv-v' + NS + ':' + id]], { id, v: choice }),
  async tallies(ids) {
    const out = {}; ids.forEach(i => out[i] = { yes: 0, no: 0, mine: null });
    for (let k = 0; k < ids.length; k += 80) {
      const evs = await pool.querySync(RELAYS, { kinds: [KIND], '#t': ids.slice(k, k + 80).map(i => 'cv-v' + NS + ':' + i), limit: 5000 }, { maxWait: 4500 });
      const latest = new Map();
      evs.forEach(e => { const c = J(e.content); if (!out[c.id] || !['yes', 'no'].includes(c.v)) return; const key = e.pubkey + '|' + c.id; const o = latest.get(key); if (!o || e.created_at > o.at) latest.set(key, { at: e.created_at, id: c.id, v: c.v, me: e.pubkey === PK }); });
      latest.forEach(x => { out[x.id][x.v]++; if (x.me) out[x.id].mine = x.v; });
    }
    return out;
  },
  addPoll: (p) => { const id = 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); return publish([['d', 'cv-poll' + NS + ':' + id], ['t', 'cv-poll' + NS]], Object.assign({ id }, p)).then(() => id); },
  async polls() {
    const evs = await pool.querySync(RELAYS, { kinds: [KIND], '#t': ['cv-poll' + NS], limit: 500 }, { maxWait: 4500 });
    const m = new Map();
    evs.forEach(e => { const c = J(e.content); if (!c.id || !c.q) return; const k = e.pubkey + '|' + c.id; if (!m.has(k) || e.created_at > m.get(k).at) m.set(k, { at: e.created_at, id: 'poll-' + e.pubkey.slice(0, 8) + '-' + c.id, q: String(c.q).slice(0, 200), details: String(c.details || '').slice(0, 500), place: String(c.place || '').slice(0, 60), mine: e.pubkey === PK }); });
    return [...m.values()].sort((a, b) => b.at - a.at);
  }
};
window.dispatchEvent(new Event('board-ready'));
