(() => {
  'use strict';

  const BUTTON_ID = 'gsf-sender-btn';
  const OVERLAY_ID = 'gsf-overlay';

  // ── Gmail session context ─────────────────────────────────────────────────

  function getGmailContext() {
    // ik lives at GLOBALS[9] in current Gmail
    const ik = window.GLOBALS?.[9] || null;

    // at: CSRF action token — scan inline scripts
    let at = null;
    for (const script of document.scripts) {
      const t = script.textContent;
      if (t.length < 20) continue;
      const m =
        t.match(/\["GMAIL_AT"(?:,[^\]]*){0,5},"([A-Za-z0-9_-]{20,})"\]/) ||
        t.match(/"at"\s*:\s*"([A-Za-z0-9_-]{20,})"/) ||
        t.match(/GM_ACTION_TOKEN\s*=\s*"([A-Za-z0-9_-]{20,})"/);
      if (m) { at = m[1]; break; }
    }
    if (!at) at = document.querySelector('[name="at"]')?.value || null;

    return { ik, at };
  }

  function gmailBase() {
    const m = location.pathname.match(/^(\/mail\/u\/\d+\/)/);
    return `https://mail.google.com${m ? m[1] : '/mail/u/0/'}`;
  }

  // ── Gmail internal API calls ──────────────────────────────────────────────

  async function searchSender(email) {
    const { ik } = getGmailContext();
    if (!ik) throw new Error('Could not read Gmail session (ik). Try reloading Gmail.');

    const q = encodeURIComponent(`from:${email} in:inbox`);
    const url = `${gmailBase()}?ui=2&ik=${ik}&view=tl&search=query&q=${q}&start=0&num=50&rt=j`;

    const res = await fetch(url, { credentials: 'include' });
    if (!res.ok) throw new Error(`Search failed (HTTP ${res.status})`);

    const text = await res.text();
    const json = JSON.parse(text.replace(/^\)\]\}'\n?/, ''));
    return parseThreadList(json);
  }

  function parseThreadList(data) {
    const threads = [];

    function walk(node) {
      if (!Array.isArray(node)) return;
      if (node[0] === 't' && typeof node[1] === 'string' && node[1].length > 4) {
        const threadId = node[1];
        const subject  = typeof node[2] === 'string' ? node[2] : '(no subject)';

        let from = '';
        for (let i = 4; i <= 6; i++) {
          if (typeof node[i] === 'string' && node[i].includes('@')) {
            from = node[i]; break;
          }
        }

        let date = '';
        for (let i = 6; i <= 12; i++) {
          const v = parseInt(node[i], 10);
          if (v > 1_000_000_000 && v < 9_999_999_999) {
            date = new Date(v * 1000).toISOString(); break;
          }
        }

        threads.push({ id: threadId, subject, from, date });
        return;
      }
      for (const child of node) walk(child);
    }

    walk(data);
    return threads;
  }

  async function archiveThreads(ids) { await batchAction('archiveMessages', ids); }
  async function trashThreads(ids)   { await batchAction('deleteMessages',  ids); }

  async function batchAction(action, ids) {
    const { ik, at } = getGmailContext();
    if (!ik || !at) throw new Error('Could not read Gmail session tokens. Try reloading Gmail.');

    const body = new URLSearchParams({ ui: '2', ik, action, at });
    ids.forEach((id) => body.append('t', id));

    const res = await fetch(gmailBase(), {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });
    if (!res.ok) throw new Error(`Action failed (HTTP ${res.status})`);
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  function getSenderEmail() {
    const el =
      document.querySelector('[data-hovercard-id]') ||
      document.querySelector('.go span[email]') ||
      document.querySelector('span[email]');
    if (el) return el.getAttribute('data-hovercard-id') || el.getAttribute('email');
    const gD = document.querySelector('.gD');
    return gD ? gD.getAttribute('email') : null;
  }

  function formatDate(iso) {
    if (!iso) return '';
    try {
      return new Date(iso).toLocaleDateString(undefined, {
        year: 'numeric', month: 'short', day: 'numeric',
      });
    } catch { return iso; }
  }

  // ── Overlay ───────────────────────────────────────────────────────────────

  function removeOverlay() {
    document.getElementById(OVERLAY_ID)?.remove();
  }

  function showError(msg) {
    removeOverlay();
    const div = document.createElement('div');
    div.id = OVERLAY_ID;
    div.className = 'gsf-overlay';
    div.innerHTML = `
      <div class="gsf-panel">
        <div class="gsf-header">
          <span class="gsf-title">Error</span>
          <button class="gsf-close" title="Close">✕</button>
        </div>
        <div class="gsf-error">${msg}</div>
      </div>`;
    div.querySelector('.gsf-close').addEventListener('click', removeOverlay);
    div.addEventListener('click', (e) => { if (e.target === div) removeOverlay(); });
    document.body.appendChild(div);
  }

  function showLoading(email) {
    removeOverlay();
    const div = document.createElement('div');
    div.id = OVERLAY_ID;
    div.className = 'gsf-overlay';
    div.innerHTML = `
      <div class="gsf-panel">
        <div class="gsf-header">
          <span class="gsf-title">Messages from ${email}</span>
          <button class="gsf-close" title="Close">✕</button>
        </div>
        <div class="gsf-loading">
          <div class="gsf-spinner"></div>
          <span>Loading…</span>
        </div>
      </div>`;
    div.querySelector('.gsf-close').addEventListener('click', removeOverlay);
    div.addEventListener('click', (e) => { if (e.target === div) removeOverlay(); });
    document.body.appendChild(div);
  }

  function showMessages(email, threads) {
    removeOverlay();
    if (threads.length === 0) {
      showError(`No other inbox messages from ${email}.`);
      return;
    }

    const div = document.createElement('div');
    div.id = OVERLAY_ID;
    div.className = 'gsf-overlay';

    const rows = threads.map((m) => `
      <tr data-id="${m.id}">
        <td class="gsf-col-check"><input type="checkbox" class="gsf-check" checked></td>
        <td class="gsf-col-date">${formatDate(m.date)}</td>
        <td class="gsf-col-subject" title="${m.subject}">${m.subject}</td>
      </tr>`).join('');

    div.innerHTML = `
      <div class="gsf-panel">
        <div class="gsf-header">
          <span class="gsf-title">Inbox messages from <em>${email}</em></span>
          <button class="gsf-close" title="Close">✕</button>
        </div>
        <div class="gsf-subheader">
          <label class="gsf-select-all">
            <input type="checkbox" id="gsf-check-all" checked> Select all (${threads.length})
          </label>
        </div>
        <div class="gsf-table-wrap">
          <table class="gsf-table">
            <thead><tr><th></th><th>Date</th><th>Subject</th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
        <div class="gsf-footer">
          <span class="gsf-count-label"><span id="gsf-sel-count">${threads.length}</span> selected</span>
          <div class="gsf-actions">
            <button class="gsf-btn gsf-btn-archive" id="gsf-archive">Archive selected</button>
            <button class="gsf-btn gsf-btn-delete" id="gsf-delete">Delete selected</button>
          </div>
        </div>
        <div class="gsf-status" id="gsf-status" hidden></div>
      </div>`;

    document.body.appendChild(div);

    div.addEventListener('click', (e) => { if (e.target === div) removeOverlay(); });
    div.querySelector('.gsf-close').addEventListener('click', removeOverlay);

    const checkAll  = div.querySelector('#gsf-check-all');
    const checks    = () => [...div.querySelectorAll('.gsf-check')];
    const updateCount = () => {
      div.querySelector('#gsf-sel-count').textContent = checks().filter((c) => c.checked).length;
    };

    checkAll.addEventListener('change', () => {
      checks().forEach((c) => { c.checked = checkAll.checked; });
      updateCount();
    });
    div.querySelector('tbody').addEventListener('change', () => {
      const all = checks();
      checkAll.checked = all.every((c) => c.checked);
      checkAll.indeterminate = !checkAll.checked && all.some((c) => c.checked);
      updateCount();
    });

    function selectedIds() {
      return [...div.querySelectorAll('tbody tr')]
        .filter((tr) => tr.querySelector('.gsf-check')?.checked)
        .map((tr) => tr.dataset.id);
    }

    function setStatus(text, isError = false) {
      const s = div.querySelector('#gsf-status');
      s.textContent = text;
      s.hidden = false;
      s.className = 'gsf-status' + (isError ? ' gsf-status-error' : ' gsf-status-ok');
    }

    function removeRows(ids) {
      const set = new Set(ids);
      div.querySelectorAll('tbody tr').forEach((tr) => {
        if (set.has(tr.dataset.id)) tr.remove();
      });
      updateCount();
      if (div.querySelectorAll('tbody tr').length === 0) setTimeout(removeOverlay, 1200);
    }

    div.querySelector('#gsf-archive').addEventListener('click', async () => {
      const ids = selectedIds();
      if (!ids.length) return;
      setStatus('Archiving…');
      try {
        await archiveThreads(ids);
        setStatus(`Archived ${ids.length} message${ids.length > 1 ? 's' : ''}.`);
        removeRows(ids);
      } catch (e) { setStatus(`Error: ${e.message}`, true); }
    });

    div.querySelector('#gsf-delete').addEventListener('click', async () => {
      const ids = selectedIds();
      if (!ids.length) return;
      setStatus('Moving to Trash…');
      try {
        await trashThreads(ids);
        setStatus(`Deleted ${ids.length} message${ids.length > 1 ? 's' : ''}.`);
        removeRows(ids);
      } catch (e) { setStatus(`Error: ${e.message}`, true); }
    });
  }

  // ── Button injection ──────────────────────────────────────────────────────

  function createButton() {
    const btn = document.createElement('div');
    btn.id = BUTTON_ID;
    btn.className = 'gsf-action-btn';
    btn.setAttribute('role', 'button');
    btn.setAttribute('tabindex', '0');
    btn.title = 'Show all inbox messages from this sender';
    btn.setAttribute('aria-label', btn.title);
    btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <rect x="2" y="4" width="20" height="16" rx="2"/>
      <polyline points="2,4 12,13 22,4"/>
      <line x1="16" y1="17" x2="22" y2="17"/>
      <line x1="19" y1="14" x2="22" y2="17"/>
      <line x1="19" y1="20" x2="22" y2="17"/>
    </svg>`;

    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (document.getElementById(OVERLAY_ID)) { removeOverlay(); return; }
      const email = getSenderEmail();
      if (!email) { showError('Could not detect sender email. Please open a message first.'); return; }
      showLoading(email);
      try {
        const threads = await searchSender(email);
        showMessages(email, threads);
      } catch (err) { showError(err.message); }
    });

    btn.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') btn.click();
    });

    return btn;
  }

  function findToolbar() {
    return document.querySelector('[gh="mtb"] [act="7"]') ||
           document.querySelector('[gh="mtb"]');
  }

  function injectButton() {
    if (document.getElementById(BUTTON_ID)) return;
    const anchor = findToolbar();
    if (!anchor) return;
    const parent = anchor.getAttribute('act') === '7' ? anchor.parentElement : anchor;
    const ref    = anchor.getAttribute('act') === '7' ? anchor : anchor.firstChild;
    parent.insertBefore(createButton(), ref);
  }

  // ── Mutation observer ─────────────────────────────────────────────────────

  let debounceTimer = null;
  const observer = new MutationObserver(() => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      injectButton();
      if (document.getElementById(OVERLAY_ID) && !document.querySelector('[gh="mtb"]')) removeOverlay();
    }, 300);
  });

  observer.observe(document.body, { childList: true, subtree: true });
  injectButton();
})();