// Same-origin, read-only transcript request. No player interception or external service.
(() => {
  'use strict';
  const CHANNEL = 'triangle-transcript-v2';
  const videoId = () => new URLSearchParams(location.search).get('v');
  let active = null, generation = 0;
  function findEndpoint(root) {
    const seen = new Set(), stack = [root];
    while (stack.length) {
      const node = stack.pop();
      if (!node || typeof node !== 'object' || seen.has(node)) continue;
      seen.add(node);
      if (typeof node.getTranscriptEndpoint?.params === 'string') return node.getTranscriptEndpoint;
      stack.push(...Object.values(node));
    }
    return null;
  }
  function parseTranscript(root) {
    const lines = [];
    const text = value => typeof value === 'string' ? value : value?.simpleText
      || value?.content || value?.runs?.map(run => run.text || '').join('') || '';
    function walk(node) {
      if (!node || typeof node !== 'object') return;
      const cue = node.transcriptSegmentRenderer || node.transcriptSegmentViewModel;
      if (cue) {
        // Read the snippet only, never timestamps, accessibility labels or headers.
        const value = text(cue.snippet).replace(/\s+/gu, ' ').trim();
        if (value) lines.push(value);
        return;
      }
      for (const child of Object.values(node)) walk(child);
    }
    walk(root);
    return lines.join(' ');
  }
  async function readDirect(id, signal) {
    const watch = document.querySelector('ytd-watch-flexy');
    const current = watch?.data;
    const initial = window.ytInitialData;
    const matches = data => data?.currentVideoEndpoint?.watchEndpoint?.videoId === id;
    const data = matches(current) ? current : matches(initial) ? initial : null;
    const endpoint = findEndpoint(data);
    const context = window.ytcfg?.get('INNERTUBE_CONTEXT');
    if (!endpoint || !context) throw new Error('Прямое получение недоступно');
    const response = await fetch('/youtubei/v1/get_transcript?prettyPrint=false', {
      method: 'POST', credentials: 'same-origin', signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ context, params: endpoint.params })
    });
    if (!response.ok) throw new Error(`YouTube: ${response.status}`);
    const result = parseTranscript(await response.json());
    if (!result || result.length > 16 * 1024 * 1024) throw new Error('YouTube не вернул текст');
    return result;
  }
  window.addEventListener('message', async event => {
    const message = event.data;
    if (event.source !== window || event.origin !== location.origin || message?.channel !== CHANNEL) return;
    if (message.type === 'cancel' && message.id === active?.id) { active.controller.abort(); return; }
    if (message.type !== 'request' || typeof message.id !== 'string' || message.id.length > 100
        || message.videoId !== videoId() || location.pathname !== '/watch' || active) return;
    const job = { id: message.id, controller: new AbortController(), generation };
    active = job;
    const timeout = setTimeout(() => job.controller.abort(), 7000);
    try {
      const text = await readDirect(message.videoId, job.controller.signal);
      if (job.controller.signal.aborted || generation !== job.generation || videoId() !== message.videoId) throw new Error('Видео сменилось');
      window.postMessage({ channel: CHANNEL, type: 'response', id: job.id, videoId: message.videoId, text }, location.origin);
    } catch {
      window.postMessage({ channel: CHANNEL, type: 'response', id: job.id, videoId: message.videoId, text: null }, location.origin);
    } finally {
      clearTimeout(timeout);
      if (active === job) active = null;
    }
  });
  document.addEventListener('yt-navigate-start', () => { generation++; active?.controller.abort(); });
})();
