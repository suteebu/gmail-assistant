chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  const tabId = sender.tab.id;

  if (msg.type === 'gsf-search') {
    chrome.scripting.executeScript({
      target: { tabId },
      world: 'MAIN',
      func: async (email) => {
        const ik = window.GLOBALS?.[9];
        if (!ik) throw new Error('Could not read Gmail session (ik). Try reloading Gmail.');
        const m = location.pathname.match(/^(\/mail\/u\/\d+\/)/);
        const base = `https://mail.google.com${m ? m[1] : '/mail/u/0/'}`;
        const q = encodeURIComponent(`from:${email} in:inbox`);
        const url = `${base}?ui=2&ik=${ik}&search=query&q=${q}&start=0&num=50&rt=j`;
        const res = await fetch(url, { credentials: 'include' });
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
        ids.forEach((id) => body.append('t', id));
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
