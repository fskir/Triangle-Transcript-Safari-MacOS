// Adapted from Triangle Downloader (GPL-3.0).
(() => {
  'use strict';
  const CHANNEL = 'triangle-transcript-v2';
  const BTN_ID = 'triangle-transcript-button';
  const vidId = () => location.pathname === '/watch' ? new URLSearchParams(location.search).get('v') : null;
  const normalize = text => String(text).replace(/\s+/gu, ' ').trim();
  let generation = 0, active = null, resetTimer = null;
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  function newSession() {
    return { videoId: vidId(), generation, controller: new AbortController(), openedDescription: null,
      openedPanel: false, scrollY: window.scrollY, scrolled: false, source: null };
  }
  function check(session) {
    if (session.controller.signal.aborted || session.generation !== generation || vidId() !== session.videoId)
      throw new Error('Видео сменилось или операция отменена. Нажмите кнопку ещё раз.');
  }
  async function pause(session, ms) { await sleep(ms); check(session); }
  function directTranscript(session) {
    return new Promise(resolve => {
      const id = crypto.randomUUID();
      let timer;
      const finish = text => {
        clearTimeout(timer); window.removeEventListener('message', receive);
        session.controller.signal.removeEventListener('abort', cancel); resolve(text);
      };
      const cancel = () => {
        window.postMessage({ channel: CHANNEL, type: 'cancel', id }, location.origin); finish(null);
      };
      const receive = event => {
        const data = event.data;
        if (event.source !== window || event.origin !== location.origin || data?.channel !== CHANNEL
            || data.type !== 'response' || data.id !== id || data.videoId !== session.videoId) return;
        finish(typeof data.text === 'string' && data.text.length <= 16 * 1024 * 1024 ? normalize(data.text) : null);
      };
      window.addEventListener('message', receive);
      session.controller.signal.addEventListener('abort', cancel, { once: true });
      timer = setTimeout(cancel, 8000);
      window.postMessage({ channel: CHANNEL, type: 'request', id, videoId: session.videoId }, location.origin);
    });
  }
  function expandedTranscriptPanel() {
    return [...document.querySelectorAll('ytd-engagement-panel-section-list-renderer')]
      .find(p => p.getAttribute('visibility') === 'ENGAGEMENT_PANEL_VISIBILITY_EXPANDED' &&
                 (p.querySelector('transcript-segment-view-model') ||
                  p.querySelector('ytd-transcript-segment-renderer')));
  }
  // Rows are read ONLY from the panel that is currently open. After in-site navigation
  // YouTube can leave the previous video's panel in the DOM (hidden but still full of
  // its rows) — reading the document at large would hand back the old video's text.
  function modernSegments() {
    const panel = expandedTranscriptPanel();
    return panel ? [...panel.querySelectorAll('transcript-segment-view-model')] : [];
  }
  // For the legacy list the ACTIVE one is the last rendered: switching language appends
  // a new list and leaves the old one behind, so reading the last avoids duplicates.
  function legacySegmentList() {
    const panel = expandedTranscriptPanel();
    if (!panel) return null;
    const lists = panel.querySelectorAll('ytd-transcript-segment-list-renderer');
    const last = lists[lists.length - 1];
    return last && last.querySelector('ytd-transcript-segment-renderer') ? last : null;
  }
  function transcriptReady() {
    return modernSegments().length > 0 || !!legacySegmentList();
  }
  function isClickable(el) {
    if (!el || el.offsetParent === null) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  }
  // The control that opens the transcript. The modern layout calls it "Показать текст
  // видео" and puts it at the bottom of the description; the classic one says
  // "Расшифровка видео". Both labels are ALSO used by the tab chip inside the transcript
  // panel itself, which is invisible while that panel is closed — clicking it does
  // nothing, so only a genuinely clickable control counts.
  function findTranscriptButton() {
    return [...document.querySelectorAll('button, a[role="button"], [role="button"]')].find((b) => {
      if (b.id === 'triangle-transcript-button') return false;
      const label = (b.getAttribute('aria-label') || '') + ' ' + (b.textContent || '');
      if (!/показать текст видео|показать расшифровку|расшифровка видео|show transcript|show video text/i.test(label)) return false;
      if (/закрыть|close|скрыть/i.test(label)) return false;
      return isClickable(b);
    });
  }
  // The modern panel groups "Эпизоды" and "Расшифровка видео" as tabs — if it opens on
  // the wrong tab there are no transcript rows until we switch to it.
  function activateTranscriptTab() {
    const panel = [...document.querySelectorAll('ytd-engagement-panel-section-list-renderer')]
      .find(p => p.getAttribute('visibility') === 'ENGAGEMENT_PANEL_VISIBILITY_EXPANDED');
    if (!panel) return false;
    const tab = [...panel.querySelectorAll('button')].find(b =>
      /расшифровка видео|transcript/i.test(b.getAttribute('aria-label') || b.textContent || ''));
    if (!tab) return false;
    try { tab.click(); return true; } catch (e) { return false; }
  }
  function closeTranscript() {
    // Scope to the transcript panel: the modern one labels its button just "Закрыть",
    // and that label is used by many other panels on the page.
    const panel = expandedTranscriptPanel();
    const inPanel = panel && [...panel.querySelectorAll('button')].find(b =>
      /закрыть|close/i.test(b.getAttribute('aria-label') || ''));
    const btn = inPanel || [...document.querySelectorAll('button')].find(b =>
      /закрыть расшифров|close transcript/i.test(b.getAttribute('aria-label') || ''));
    if (btn) { try { btn.click(); } catch (e) {} }
  }

  async function openTranscript(session) {
    check(session);
    let button = findTranscriptButton();
    if (!button) {
      const more = document.querySelector('ytd-watch-metadata #description-inline-expander #expand, ytd-text-inline-expander #expand, #description #expand');
      if (isClickable(more)) {
        // Save the exact expander: never collapse an unrelated or already open description.
        session.openedDescription = more.closest('ytd-text-inline-expander') || more.closest('#description');
        more.click(); await pause(session, 350); button = findTranscriptButton();
      }
    }
    if (!button) {
      const anchor = document.querySelector('ytd-structured-description-content-renderer, ytd-watch-metadata');
      if (anchor) {
        session.scrolled = true; anchor.scrollIntoView({ block: 'end' });
        await pause(session, 350); button = findTranscriptButton();
      }
    }
    if (!button) return false;
    check(session); session.openedPanel = true; button.click();
    for (let i = 0; i < 30 && !transcriptReady(); i++) await pause(session, 150);
    if (!transcriptReady() && activateTranscriptTab()) {
      for (let i = 0; i < 20 && !transcriptReady(); i++) await pause(session, 150);
    }
    return transcriptReady();
  }
  function extractTranscriptText() {
    const lines = [];
    const push = (raw) => {
      const t = String(raw || '').replace(/\s*\n\s*/g, ' ').replace(/\s+/g, ' ').trim();
      if (!t) return;
      lines.push(t);
    };
    const modern = modernSegments();
    if (modern.length) {
      // each row is [timestamp div][screen-reader label div][text span] — taking the
      // whole row's textContent would glue "0:00" and "0 секунд" onto the text
      for (const s of modern) {
        const span = s.querySelector('span');
        push(span ? span.textContent : (s.children[s.children.length - 1] || {}).textContent);
      }
      return lines;
    }
    const list = legacySegmentList();
    if (!list) return [];
    for (const s of list.querySelectorAll('ytd-transcript-segment-renderer')) {
      const tx = s.querySelector('.segment-text, yt-formatted-string.segment-text');
      if (tx) push(tx.textContent);
    }
    return lines;
  }


  async function getTranscript(session) {
    if (!session.videoId) throw new Error('Откройте видео YouTube.');
    check(session);
    const direct = await directTranscript(session);
    check(session);
    if (direct) { session.source = 'direct'; return direct; }
    // Reopen current video's panel to avoid previous-video rows left by YouTube's SPA.
    if (transcriptReady()) {
      closeTranscript(); await pause(session, 250);
      if (transcriptReady()) throw new Error('Перезагрузите страницу: старая расшифровка не закрылась.');
    }
    for (let attempt = 0; attempt < 2; attempt++) {
      check(session);
      if (await openTranscript(session)) {
        check(session);
        const text = normalize(extractTranscriptText().join(' '));
        if (text) { session.source = 'panel'; return text; }
      }
      closeTranscript(); await pause(session, 350);
    }
    throw new Error('Расшифровка недоступна или не загрузилась. Попробуйте ещё раз.');
  }
  function cleanup(session, copied) {
    // Never close/collapse UI belonging to the next video after SPA navigation.
    if (vidId() !== session.videoId || generation !== session.generation) return;
    if (copied || session.openedPanel) closeTranscript();
    const expander = session.openedDescription && (session.openedDescription.isConnected
      ? session.openedDescription : document.querySelector('ytd-watch-metadata #description-inline-expander'));
    const collapse = expander?.querySelector(':scope > #collapse');
    if (isClickable(collapse)) collapse.click();
    if (session.scrolled) window.scrollTo(0, session.scrollY);
  }
  // Start Clipboard.write inside the trusted click; Safari receives text asynchronously.
  function copyTranscript(session) {
    if (!navigator.clipboard?.write || typeof ClipboardItem === 'undefined')
      return Promise.reject(new Error('Safari не разрешил доступ к буферу обмена.'));
    let copied = false;
    const extraction = getTranscript(session);
    const blob = extraction.then(text => { check(session); return new Blob([text], { type: 'text/plain' }); });
    blob.catch(() => {});
    let writing;
    try { writing = navigator.clipboard.write([new ClipboardItem({ 'text/plain': blob })]); }
    catch (error) { writing = Promise.reject(error); }
    return writing.then(() => { copied = true; }).finally(async () => {
      session.controller.abort();
      // A permission rejection must not leave a late extraction opening panels behind it.
      await extraction.catch(() => {});
      cleanup(session, copied);
    });
  }
  const PATHS = {
    idle: 'M10.5 11.5h12v16h-12z M13.5 8.5h12v16 M13.5 15.5h6 M13.5 19.5h6 M13.5 23.5h4',
    busy: 'M18 10a8 8 0 1 1-8 8',
    success: 'M10 19l5 5 11-12',
    error: 'M18 10v12 M18 25v1'
  };
  function setButton(button, state, label) {
    button.dataset.state = state; button.title = label;
    button.setAttribute('aria-label', label);
    button.setAttribute('aria-busy', String(state === 'busy'));
    button.disabled = state === 'busy';
    button.querySelector('path').setAttribute('d', PATHS[state]);
  }
  function idle(button) { setButton(button, 'idle', 'Скопировать транскрипцию'); }
  function onClick(event) {
    if (!event.isTrusted || active) return;
    event.preventDefault(); event.stopPropagation();
    clearTimeout(resetTimer);
    const button = event.currentTarget, session = newSession(); active = session;
    setButton(button, 'busy', 'Получаю транскрипцию…');
    copyTranscript(session).then(() => {
      if (session.generation !== generation) return;
      button.dataset.source = session.source;
      setButton(button, 'success', 'Транскрипция скопирована');
      resetTimer = setTimeout(() => idle(button), 1000);
    }, error => {
      if (session.generation !== generation) return;
      setButton(button, 'error', error.name === 'NotAllowedError'
        ? 'Safari запретил копирование. Проверьте разрешения расширения.' : error.message);
    }).finally(() => { if (active === session) active = null; });
  }
  function ensureButton() {
    const existing = document.getElementById(BTN_ID);
    if (!vidId()) { existing?.remove(); return; }
    const controls = document.querySelector('#movie_player .ytp-right-controls');
    if (!controls || (existing && controls.contains(existing))) return;
    existing?.remove();
    const button = document.createElement('button'); button.id = BTN_ID;
    button.type = 'button'; button.className = 'ytp-button';
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 36 36'); svg.setAttribute('width', '100%'); svg.setAttribute('height', '100%');
    svg.setAttribute('aria-hidden', 'true');
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    for (const [name, value] of Object.entries({ fill:'none', stroke:'currentColor', 'stroke-width':'2', 'stroke-linecap':'round', 'stroke-linejoin':'round' })) path.setAttribute(name,value);
    svg.append(path); button.append(svg); idle(button);
    button.addEventListener('click', onClick);
    controls.insertBefore(button, controls.firstChild);
  }
  function mount() {
    const style = document.createElement('style');
    style.textContent = `#${BTN_ID}{color:#fff;position:relative;display:inline-flex!important;align-items:center;justify-content:center;padding:0!important;vertical-align:top} #${BTN_ID}>svg{position:static!important;display:block!important;flex:none;width:100%!important;height:100%!important;margin:0!important;transform-box:view-box;transform-origin:50% 50%;overflow:visible} #${BTN_ID}[data-state="success"]{color:#8ee5a1} #${BTN_ID}[data-state="error"]{color:#ffb4ab} #${BTN_ID}:focus-visible{outline:2px solid #fff;outline-offset:-4px} #${BTN_ID}[data-state="busy"] svg{animation:triangle-transcript-spin 1s linear infinite} @keyframes triangle-transcript-spin{to{transform:rotate(360deg)}} @media(prefers-reduced-motion:reduce){#${BTN_ID} svg{animation:none!important}}`;
    document.head.append(style);
    let queued = false;
    new MutationObserver(() => {
      if (queued) return; queued = true;
      requestAnimationFrame(() => { queued = false; ensureButton(); });
    }).observe(document.documentElement, { childList:true, subtree:true });
    document.addEventListener('yt-navigate-start', () => {
      generation++; active?.controller.abort(); clearTimeout(resetTimer);
      const button = document.getElementById(BTN_ID); if (button) idle(button);
    });
    document.addEventListener('yt-navigate-finish', ensureButton);
    ensureButton();
  }
  mount();
})();
