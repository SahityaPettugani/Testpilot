// YaraConnect Help sample. All page content comes from /content/*.json,
// so a Jira-triggered update only has to change JSON, never this file.
(function () {
  const ROLE_NAMES = { dealer: 'Dealer', subdealer: 'Sub-dealer', assistant: 'Shop assistant', staff: 'Yara staff' };
  const FRESH_DAYS = 30;
  const store = {
    get(k, d) { try { return localStorage.getItem(k) || d; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  };
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmtDate = (iso) => new Date(iso + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  const isFresh = (iso) => (Date.now() - new Date(iso + 'T00:00:00').getTime()) / 864e5 <= FRESH_DAYS;
  const $ = (id) => document.getElementById(id);

  async function load() {
    const bust = '?v=' + Date.now();
    const [g, n] = await Promise.all([
      fetch('content/guides.json' + bust).then((r) => r.json()),
      fetch('content/whats-new.json' + bust).then((r) => r.json())
    ]);
    return { ...g, news: n.items };
  }

  function ticketTag(c) {
    if (!c || !c.ticket) return '';
    const label = esc(c.ticket);
    return c.url ? `<a class="tag jira" href="${esc(c.url)}" target="_blank" rel="noopener">${label}</a>` : `<span class="tag jira">${label}</span>`;
  }

  // ---------- Home ----------
  function home(data) {
    let role = store.get('yh-role', 'subdealer');
    const country = $('country');
    country.value = store.get('yh-country', 'Thailand');

    const visibleGuides = () => data.guides.filter((g) => g.roles.includes(role) && g.countries.includes(country.value));

    function render() {
      document.querySelectorAll('.role').forEach((b) => b.setAttribute('aria-pressed', b.dataset.role === role));
      $('hero-eyebrow').textContent = `YaraConnect user guide · ${country.value}`;
      $('showing').textContent = `Showing guides for: ${ROLE_NAMES[role]} · ${country.value}`;
      const guides = visibleGuides();
      $('cats').innerHTML = data.categories.filter((c) => c.roles.includes(role)).map((c) => {
        const list = guides.filter((g) => g.category === c.id);
        const first = list[0];
        const fresh = list.some((g) => isFresh(g.updated));
        return `<a class="card" href="${first ? 'guide.html?id=' + first.id : '#'}">
          <strong>${esc(c.title)}</strong>
          <span class="muted">${esc(c.desc)}</span>
          <span class="count">${list.length ? list.length + (list.length === 1 ? ' guide' : ' guides') : 'Coming soon'}${fresh ? ' · <span class="tag">UPDATED</span>' : ''}</span>
        </a>`;
      }).join('');
      $('popular').innerHTML = '<span style="color:var(--muted)">Popular:</span>' +
        guides.slice(0, 4).map((g) => `<a class="pill" href="guide.html?id=${g.id}">${esc(g.title)}</a>`).join('');
    }

    $('roles').addEventListener('click', (e) => {
      const b = e.target.closest('.role'); if (!b) return;
      role = b.dataset.role; store.set('yh-role', role); render();
    });
    country.addEventListener('change', () => { store.set('yh-country', country.value); render(); });

    // Search across titles, summaries, step text and problems
    const q = $('q'), results = $('results');
    q.addEventListener('input', () => {
      const term = q.value.trim().toLowerCase();
      if (term.length < 2) { results.hidden = true; return; }
      const hits = data.guides.filter((g) => [g.title, g.summary, ...g.problems, ...g.steps.map((s) => s.title + ' ' + s.android)].join(' ').toLowerCase().includes(term));
      results.innerHTML = hits.length ? hits.map((g) => `<a href="guide.html?id=${g.id}">${esc(g.title)}<small>${esc(g.summary)}</small></a>`).join('') : '<a href="#">No guides match yet<small>Try "receipt", "QR" or "history"</small></a>';
      results.hidden = false;
    });
    document.addEventListener('click', (e) => { if (!e.target.closest('.search-row')) results.hidden = true; });

    $('news').innerHTML = data.news.slice(0, 5).map((n) => `<div class="news">
      ${n.ticket ? ticketTag(n) : '<span class="tag">NEW</span>'}
      <span>${n.guideId ? `<a href="guide.html?id=${n.guideId}">${esc(n.title)}</a>` : esc(n.title)}<br><small class="sub" style="font-size:12px">${fmtDate(n.date)}</small></span>
    </div>`).join('');

    render();
  }

  // ---------- Guide ----------
  function guide(data) {
    const id = new URLSearchParams(location.search).get('id') || data.guides[0].id;
    const g = data.guides.find((x) => x.id === id) || data.guides[0];
    const cat = data.categories.find((c) => c.id === g.category);
    const role = store.get('yh-role', 'subdealer');
    const country = store.get('yh-country', 'Thailand');
    let platform = store.get('yh-platform', 'android');
    document.title = `${g.title} · YaraConnect Help`;

    $('context-chip').textContent = `${country} · ${ROLE_NAMES[role]}`;
    $('crumbs').innerHTML = `<a href="index.html">Home</a> / <a href="index.html#topics">${esc(cat.title)}</a> / <span style="color:var(--ink)">${esc(g.title)}</span>`;
    $('side-label').textContent = cat.title;
    $('side-links').innerHTML = data.guides.filter((x) => x.category === g.category)
      .map((x) => `<a href="guide.html?id=${x.id}" ${x.id === g.id ? 'aria-current="page"' : ''}>${esc(x.title)}</a>`).join('');

    const changes = [...(g.changes || [])].sort((a, b) => b.date.localeCompare(a.date));
    const recent = changes.filter((c) => isFresh(c.date));
    const changedSteps = new Set(recent.filter((c) => Number.isInteger(c.stepIndex)).map((c) => c.stepIndex));
    const siblings = data.guides.filter((x) => x.category === g.category);
    const idx = siblings.indexOf(g);

    function render() {
      $('guide').innerHTML = `
        <div class="stack" style="gap:14px">
          <div class="meta">
            ${g.roles.map((r) => `<span class="role-tag">${ROLE_NAMES[r]}</span>`).join('')}
            <span>${esc(country)}</span>
            <span>${g.minutes} min</span>
            <span class="${isFresh(g.updated) ? 'fresh' : ''}">Updated ${fmtDate(g.updated)} · App ${esc(g.appVersion)}</span>
          </div>
          <div class="title-row">
            <h1>${esc(g.title)}</h1>
            <div class="seg" role="group" aria-label="Phone type">
              <button type="button" data-p="android" aria-pressed="${platform === 'android'}">Android</button>
              <button type="button" data-p="ios" aria-pressed="${platform === 'ios'}">iPhone</button>
            </div>
          </div>
          <p class="lead">${esc(g.summary)}</p>
        </div>

        ${recent.length ? `<section class="changed" aria-label="Recent changes">
          <h2>What changed recently</h2>
          <ul>${recent.map((c) => `<li>${ticketTag(c)} ${esc(c.text)} <small class="sub" style="font-size:12px">(${fmtDate(c.date)}${c.version ? ' · App ' + esc(c.version) : ''})</small></li>`).join('')}</ul>
        </section>` : ''}

        <section class="box" id="before">
          <h2>Before you start</h2>
          <div class="checks">${g.before.map((b, i) => `<label><input type="checkbox" id="chk${i}"> ${esc(b)}</label>`).join('')}</div>
        </section>

        <section class="stack" id="steps" style="gap:20px">
          <h2>Steps</h2>
          ${g.steps.map((s, i) => `<div class="step ${changedSteps.has(i) ? 'is-new' : ''}">
            <div class="phone"><span class="k">SCREENSHOT</span><span class="s">${esc(s.screen)}</span><span class="hot" style="top:${esc(s.y)}"></span></div>
            <div class="step-body">
              <span class="step-n">STEP ${i + 1}${changedSteps.has(i) ? ' · <span class="tag">UPDATED</span>' : ''}</span>
              <h3>${esc(s.title)}</h3>
              <p>${esc(s[platform] || s.android)}</p>
            </div>
          </div>`).join('')}
        </section>

        ${g.tip ? `<section class="tip"><b>TIP</b><p>${esc(g.tip)}</p></section>` : ''}

        ${g.next.length ? `<section class="stack" id="next" style="gap:16px">
          <h2>What happens next</h2>
          <div class="grid3">${g.next.map((n) => `<div class="state ${n.tone}"><b>${esc(n.label)}</b><span>${esc(n.text)}</span></div>`).join('')}</div>
        </section>` : '<span id="next"></span>'}

        <section class="stack" id="wrong">
          <h2>If it goes wrong</h2>
          ${g.problems.map((p) => `<a class="row-link" href="#"><span>${esc(p)}</span><span>Read fix</span></a>`).join('')}
        </section>

        <section class="feedback" id="fb">
          <span style="font-weight:600">Did this guide help?</span>
          <div style="display:flex;gap:8px"><button type="button">Yes</button><button type="button">No</button></div>
        </section>

        <div class="pager">
          ${idx > 0 ? `<a href="guide.html?id=${siblings[idx - 1].id}"><small>Previous</small><strong>${esc(siblings[idx - 1].title)}</strong></a>` : '<span></span>'}
          ${idx < siblings.length - 1 ? `<a class="next" href="guide.html?id=${siblings[idx + 1].id}"><small>Next</small><strong>${esc(siblings[idx + 1].title)}</strong></a>` : ''}
        </div>`;

      $('guide').querySelector('.seg').addEventListener('click', (e) => {
        const b = e.target.closest('button'); if (!b) return;
        platform = b.dataset.p; store.set('yh-platform', platform); render();
      });
      $('fb').addEventListener('click', (e) => {
        if (e.target.tagName === 'BUTTON') $('fb').innerHTML = '<span style="font-weight:600">Thanks for your feedback.</span>';
      });
    }
    render();
  }

  load().then((data) => (document.body.dataset.page === 'guide' ? guide : home)(data))
    .catch((err) => {
      document.body.insertAdjacentHTML('beforeend', `<p class="wrap" style="color:var(--red)">Could not load guide content (${esc(err.message)}). Open the site through a web server, e.g. <code>npx serve .</code></p>`);
    });
})();
