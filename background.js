chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  const tabId = sender.tab.id;

  if (msg.type === 'gsf-search') {
    chrome.scripting.executeScript({
      target: { tabId },
      world: 'MAIN',
      func: async (email) => {
        const m = location.pathname.match(/\/u\/(\d+)\//);
        const acct = m ? m[1] : '0';
        const now = Date.now();
        const uuid = crypto.randomUUID().toUpperCase();
        const query = `from:${email}`;

        const body = JSON.stringify([
          [79, 101, null, query,
            [null, null, null, null, 0, null, null, null, null, null, null, now, 10800000,
              null, null, null, null, null, null, null, null, null, null, 0, 0, 0, 0],
            'itemlist-ViewType(79)-1', 1, 2000, null, 0, null, null, null, 1, null,
            [1, 0, 0, null, null, null, 1, uuid, null, 1, null, null, 1, null, 1,
              null, null, null, null, null, 0],
            null, null, 1, null, null, 0, 1, 0, [], 0, 0, null, null, null, null, null,
            [now - 86400000, null, null, 55],
          ],
          null,
          [0, 5, null, null, 1, 1, 1],
        ]);

        const res = await fetch(
          `https://mail.google.com/sync/u/${acct}/i/bv?hl=en&c=1&rt=r&pt=ji`,
          { method: 'POST', credentials: 'include',
            headers: { 'Content-Type': 'text/plain;charset=UTF-8' }, body },
        );
        if (!res.ok) throw new Error(`Search failed (HTTP ${res.status})`);
        return res.text();
      },
      args: [msg.email],
    }).then((r) => sendResponse({ text: r?.[0]?.result }))
      .catch((e) => sendResponse({ error: e.message }));
    return true;
  }

  if (msg.type === 'gsf-action') {
    chrome.scripting.executeScript({
      target: { tabId },
      world: 'MAIN',
      func: async (action, ids) => {
        const ik = window.GLOBALS?.[9];
        let at = window.GLOBALS?.[10]?.[2] || null;
        if (!at) {
          for (const script of document.scripts) {
            const t = script.textContent;
            if (t.length < 20) continue;
            const m =
              t.match(/\["GMAIL_AT"(?:,[^\]]*){0,5},"([A-Za-z0-9_-]{20,})"\]/) ||
              t.match(/"at"\s*:\s*"([A-Za-z0-9_-]{20,})"/) ||
              t.match(/GM_ACTION_TOKEN\s*=\s*"([A-Za-z0-9_-]{20,})"/);
            if (m) { at = m[1]; break; }
          }
        }
        if (!ik || !at) throw new Error('Could not read Gmail session tokens. Try reloading Gmail.');
        const mb = location.pathname.match(/^(\/mail\/u\/\d+\/)/);
        const base = `https://mail.google.com${mb ? mb[1] : '/mail/u/0/'}`;
        const body = new URLSearchParams({ ui: '2', ik, action, at });
        ids.forEach((id) => body.append('t', id.replace(/^thread-f:/, '')));
        const res = await fetch(base, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: body.toString(),
        });
        if (!res.ok) throw new Error(`Action failed (HTTP ${res.status})`);
      },
      args: [msg.action, msg.ids],
    }).then(() => sendResponse({}))
      .catch((e) => sendResponse({ error: e.message }));
    return true;
  }
});
