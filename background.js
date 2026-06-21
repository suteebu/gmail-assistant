chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'gsf-get-context') {
    chrome.scripting.executeScript({
      target: { tabId: sender.tab.id },
      world: 'MAIN',
      func: () => ({
        ik: window.GLOBALS?.[9] || null,
        at: window.GLOBALS?.[10]?.[2] || null,
      }),
    })
      .then((r) => sendResponse({ result: r?.[0]?.result ?? {} }))
      .catch((e) => sendResponse({ error: e.message }));
    return true;
  }
});
