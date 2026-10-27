const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const LEVELS = ['All', 'Federal', 'State', 'County', 'City', 'Local agency', 'World'];
const ST = (k, v) => v === undefined ? localStorage.getItem('cv-' + k) || '' : localStorage.setItem('cv-' + k, v);
let data = { items: [], status: {} }, shown = [], limit = 30, level = ST('level') || 'All', tallies = {};
const boardReady = new Promise(r => window.Board ? r() : window.addEventListener('board-ready', r, { once: true }));

const YES = { 'Passed': 1, 'Adopted': 1, 'Approved': 1, 'Became law': 1 }, NO = { 'Failed': 1, 'Vetoed': 1 };
function offHtml(id, n, pct) {
  const i = byId[id]; if (!i) return '';
  const o = i.official, pub = n ? `Public: ${pct}% yes` : 'Public: no votes yet';
  let agree = '';
  if (o && n && (YES[o] || NO[o]) && pct !== 50) agree = `<div class="small">${(pct > 50) === !!YES[o] ? '🤝 The public agreed with the officials.' : '⚔️ The public disagreed with the officials.'}</div>`;
  return `<div class="small"><b>${pub} | Official: ${o ? esc(o) : 'Pending (no official result yet)'}</b>${o && i.officialNote ? ' · ' + esc(i.officialNote) : ''}</div>${agree}`;
}
let byId = {};
function voteHtml(id, it) {
  const t = tallies[id] || { yes: 0, no: 0, mine: null }, n = t.yes + t.no, pct = n ? Math.round(100 * t.yes / n) : 50;
  return `<div class="vote"><button data-v="yes" data-id="${esc(id)}" class="${t.mine === 'yes' ? 'picked' : ''}">👍 Yes · ${t.yes}</button><button data-v="no" data-id="${esc(id)}" class="no ${t.mine === 'no' ? 'picked' : ''}">👎 No · ${t.no}</button></div>
  <div class="bar"><i style="width:${n ? pct : 0}%"></i></div><div class="small">${n ? `${pct}% yes of ${n} vote${n > 1 ? 's' : ''}` : 'No votes yet. Be the first.'}</div>${offHtml(id, n, pct)}`;
}
const fmtDate = d => { if (!d) return ''; const x = new Date(d + 'T12:00:00'); return isNaN(x) ? d : x.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }); };

function filtered() {
  const st = $('state').value, pl = $('place').value, q = $('q').value.trim().toLowerCase();
  return data.items.filter(i => (!$('decided') || !$('decided').checked || i.official) && (level === 'All' || i.level === level) && (!st || i.state === st) && (!pl || i.place === pl) && (!q || (i.title + ' ' + i.summary + ' ' + i.place).toLowerCase().includes(q)));
}
function fillPlaces() {
  const st = $('state').value, keep = $('place').value;
  const ps = [...new Set(data.items.filter(i => (!st || i.state === st) && (level === 'All' || i.level === level)).map(i => i.place))].sort();
  $('place').innerHTML = '<option value="">All places (' + ps.length + ')</option>' + ps.map(p => `<option${p === keep ? ' selected' : ''}>${esc(p)}</option>`).join('');
}
function render() {
  const all = filtered(); shown = all.slice(0, limit);
  $('list').innerHTML = shown.length ? shown.map(i => `<div class="card"><div class="meta"><span class="tag">${esc(i.level)}</span><span>${esc(i.place)}${i.state && i.state !== 'US' && i.state !== 'UK' ? ', ' + esc(i.state) : ''}</span>${i.date ? '<span>· ' + fmtDate(i.date) + '</span>' : ''}</div>
    <h3>${esc(i.title)}</h3>${i.summary ? `<p>${esc(i.summary)}</p>` : ''}${i.status ? `<p class="small">Status: ${esc(i.status)}</p>` : ''}
    <a href="${esc(i.url)}" target="_blank" rel="noopener">Read the official page ↗</a><div id="v-${esc(i.id)}">${voteHtml(i.id)}</div></div>`).join('')
    : `<div class="note">Nothing matches.${level === 'State' ? ' State legislatures are not covered yet (no free source without sign-up).' : ''}</div>`;
  $('more').hidden = all.length <= limit; $('more').textContent = `Show more (${all.length - limit} left)`;
  loadTallies(shown.map(i => i.id));
}
async function loadTallies(ids) {
  if (!ids.length) return; await boardReady;
  try { Object.assign(tallies, await Board.tallies(ids)); ids.forEach(id => { const el = $('v-' + id); if (el) el.innerHTML = voteHtml(id); }); } catch (e) {}
}
document.addEventListener('click', async e => {
  const b = e.target.closest('button[data-v]'); if (!b) return;
  const id = b.dataset.id, v = b.dataset.v; await boardReady;
  const t = tallies[id] || (tallies[id] = { yes: 0, no: 0, mine: null }); if (t.mine === v) return;
  if (t.mine) t[t.mine]--; t[v]++; t.mine = v;
  const el = $('v-' + id); if (el) el.innerHTML = voteHtml(id);
  try { await Board.vote(id, v); } catch (x) { alert("Couldn't reach the vote network. Check your connection and try again."); }
});

function sourcesNote() {
  const s = data.status, line = (n, x) => x ? `${x.ok ? '✅' : '⚠️'} ${n}: ${x.ok ? esc(x.source) : esc(x.error || 'not available')}` : '';
  const l = s.local ? `${s.local.ok ? '✅' : '⚠️'} Cities &amp; counties: ${s.local.withItems} of ${s.local.tried} places had new items (Legistar)` : '';
  $('sources').innerHTML = `${data.items.length} items · updated ${new Date(data.updated).toLocaleString()}<br>` + [line('Federal', s.federal), line('State', s.state), l, line('World', s.world)].filter(Boolean).join('<br>');
}
async function init() {
  $('levels').innerHTML = LEVELS.map(l => `<button data-l="${l}" class="${l === level ? 'on' : ''}">${l}</button>`).join('');
  $('levels').onclick = e => { const b = e.target.closest('button'); if (!b) return; level = b.dataset.l; ST('level', level); [...$('levels').children].forEach(x => x.classList.toggle('on', x === b)); fillPlaces(); limit = 30; render(); };
  try { data = await (await fetch('data/items.json', { cache: 'no-cache' })).json(); }
  catch (e) { $('list').innerHTML = '<div class="note">Couldn\'t load the list of items right now. Please try again later.</div>'; return; }
  data.items.forEach(i => byId[i.id] = i); $('decided').onchange = () => { limit = 30; render(); };
  const states = [...new Set(data.items.map(i => i.state).filter(Boolean))].sort();
  $('state').innerHTML += states.map(s => `<option${s === ST('state') ? ' selected' : ''}>${esc(s)}</option>`).join('');
  fillPlaces(); if (ST('place')) $('place').value = ST('place');
  $('state').onchange = () => { ST('state', $('state').value); $('place').value = ''; ST('place', ''); fillPlaces(); limit = 30; render(); };
  $('place').onchange = () => { ST('place', $('place').value); limit = 30; render(); };
  let tm; $('q').oninput = () => { clearTimeout(tm); tm = setTimeout(() => { limit = 30; render(); }, 250); };
  $('more').onclick = () => { limit += 30; render(); };
  sourcesNote(); render();
}

// Community polls
let polls = [];
async function loadPolls() {
  await boardReady;
  try { polls = await Board.polls(); } catch (e) { $('plist').innerHTML = '<div class="note">Couldn\'t reach the poll network right now.</div>'; return; }
  renderPolls();
}
function renderPolls() {
  const q = $('pqs').value.trim().toLowerCase(), ps = polls.filter(p => !q || (p.q + ' ' + p.details + ' ' + p.place).toLowerCase().includes(q)).slice(0, 60);
  $('plist').innerHTML = ps.length ? ps.map(p => `<div class="card"><div class="meta"><span class="tag">Community</span>${p.place ? `<span>${esc(p.place)}</span>` : ''}<span>· ${new Date(p.at * 1000).toLocaleDateString()}</span>${p.mine ? '<span>· yours</span>' : ''}</div>
    <h3>${esc(p.q)}</h3>${p.details ? `<p>${esc(p.details)}</p>` : ''}<div id="v-${esc(p.id)}">${voteHtml(p.id)}</div></div>`).join('') : '<p class="small">No polls yet. Ask the first question above.</p>';
  loadTallies(ps.map(p => p.id));
}
$('pqs').oninput = renderPolls;
$('padd').onclick = async () => {
  const q = $('pq').value.trim(); if (q.length < 8) { $('pmsg').textContent = 'Please write a full question.'; return; }
  $('padd').disabled = true; $('pmsg').textContent = 'Posting…'; await boardReady;
  try { await Board.addPoll({ q, details: $('pd').value.trim(), place: $('pp').value.trim() }); $('pq').value = $('pd').value = ''; $('pmsg').textContent = 'Posted!'; setTimeout(loadPolls, 1500); }
  catch (e) { $('pmsg').textContent = "Couldn't post. Check your connection and try again."; }
  $('padd').disabled = false;
};
$('tBills').onclick = () => { $('tBills').classList.add('on'); $('tPolls').classList.remove('on'); $('billsView').hidden = false; $('pollsView').hidden = true; };
$('tPolls').onclick = () => { $('tPolls').classList.add('on'); $('tBills').classList.remove('on'); $('billsView').hidden = true; $('pollsView').hidden = false; loadPolls(); };
init();
