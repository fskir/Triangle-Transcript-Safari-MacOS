const {test} = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname,'../extension/transcript.js'),'utf8')
  .replace('  mount();', '  globalThis.qa = { newSession, getTranscript, copyTranscript, ensureButton, onClick, cleanup, navigate() { generation++; active?.controller.abort(); } };');
const expected = 'Привет, мир! Повтор Повтор Встреча в 12:30 завтра. Конец.';
function fixture({modern=true,available=true,direct=null,descriptionOpen=false,requiresDescription=true,clipboardReject=false,delayDirect=false}={}) {
  let expanded=false, described=descriptionOpen;
  const timers=[], listeners=new Map(), buttons=new Map();
  const stats={opens:0,closes:0,expands:0,collapses:0,writes:0};
  function element(tag) {
    const attrs={},children=[];
    return {tag,children,dataset:{},setAttribute(k,v){attrs[k]=v;},getAttribute:k=>attrs[k],append(...items){children.push(...items);},
      querySelector:q=>q==='path'?children.flatMap(c=>c.children||[]).find(c=>c.tag==='path'):null,
      addEventListener(){},remove(){buttons.delete(this.id);}};
  }
  const controls={children:[],contains:b=>controls.children.includes(b),get firstChild(){return controls.children[0]||null;},insertBefore(b){controls.children.unshift(b);buttons.set(b.id,b);}};
  const texts=['Привет,\nмир!','Повтор','Повтор','Встреча в 12:30\r\nзавтра.\u2028Конец.'];
  const rows=texts.map(textContent=>({querySelector:()=>({textContent})}));
  const close={getAttribute:()=> 'Close transcript',click(){if(expanded)stats.closes++;expanded=false;}};
  const panel={getAttribute:()=>expanded?'ENGAGEMENT_PANEL_VISIBILITY_EXPANDED':'HIDDEN',
    querySelector:q=>q===(modern?'transcript-segment-view-model':'ytd-transcript-segment-renderer')?rows[0]:null,
    querySelectorAll:q=>q==='button'?[close]:q==='transcript-segment-view-model'?(modern?rows:[]):q==='ytd-transcript-segment-list-renderer'?[{querySelector:()=>rows[0],querySelectorAll:()=>rows}]:[]};
  const clickable={getBoundingClientRect:()=>({width:50,height:20})};
  const collapse={...clickable,get offsetParent(){return described?{}:null;},click(){stats.collapses++;described=false;}};
  const expander={isConnected:true,querySelector:q=>q===':scope > #collapse'?collapse:q==='#collapse'?{...clickable,offsetParent:null,click(){throw new Error('Nested chapter control must not be clicked');}}:null};
  const more={...clickable,get offsetParent(){return described?null:{};},closest:()=>expander,click(){stats.expands++;described=true;}};
  const open={...clickable,get offsetParent(){return (described||!requiresDescription)&&available?{}:null;},getAttribute:()=> 'Show transcript',textContent:'Show transcript',click(){expanded=true;stats.opens++;}};
  const c={location:{pathname:'/watch',search:'?v=abcdefghijk',origin:'https://www.youtube.com'},URLSearchParams,Blob,AbortController,crypto:require('node:crypto').webcrypto,
    setTimeout(f,ms){if(ms>=1000){const timer={f,ms};timers.push(timer);return timer;}return setTimeout(f,0);},clearTimeout(t){if(t&&typeof t==='object'&&'ms'in t){t.cancelled=true;}else clearTimeout(t);},
    document:{getElementById:id=>buttons.get(id)||null,createElement:element,createElementNS:(_,tag)=>element(tag),
      querySelector:q=>q==='#movie_player .ytp-right-controls'?controls:q.includes('#expand')?more:null,
      querySelectorAll:q=>q==='ytd-engagement-panel-section-list-renderer'?[panel]:q==='button'?[close]:q==='button, a[role="button"], [role="button"]'?[open]:[]},
    navigator:{clipboard:{write(items){stats.writes++;if(clipboardReject)return Promise.reject(new DOMException('Denied','NotAllowedError'));return items[0].data['text/plain'].then(async blob=>{c.copied=await blob.text();});}}},
    ClipboardItem:class{constructor(data){this.data=data;}},scrollY:100,scrollTo(){},
    addEventListener(type,fn){if(!listeners.has(type))listeners.set(type,new Set());listeners.get(type).add(fn);},
    removeEventListener(type,fn){listeners.get(type)?.delete(fn);},
    postMessage(message){if(message.type==='request'&&!delayDirect)queueMicrotask(()=>{for(const fn of listeners.get('message')||[]) fn({source:vm.runInContext('window',c),origin:c.location.origin,data:{channel:message.channel,type:'response',id:message.id,videoId:message.videoId,text:direct}});});}
  };
  c.window=c;vm.createContext(c);vm.runInContext(source,c);
  return {c,stats,controls,timers,get expanded(){return expanded;},get described(){return described;}};
}
for(const modern of [true,false]) test(`${modern?'modern':'legacy'}: clean cue text; closes panel and description after clipboard succeeds`,async()=>{
  const f=fixture({modern});await f.c.qa.copyTranscript(f.c.qa.newSession());assert.equal(f.c.copied,expected);
  assert.deepEqual(f.stats,{opens:1,closes:1,expands:1,collapses:1,writes:1});assert.equal(f.expanded,false);assert.equal(f.described,false);
});
test('direct response copies without opening description or panel',async()=>{
  const f=fixture({direct:'Один\nдва\u2028три'});const s=f.c.qa.newSession();await f.c.qa.copyTranscript(s);
  assert.equal(f.c.copied,'Один два три');assert.equal(s.source,'direct');assert.deepEqual(f.stats,{opens:0,closes:0,expands:0,collapses:0,writes:1});
});
test('keeps description that was expanded by the user',async()=>{
  const f=fixture({descriptionOpen:true});await f.c.qa.copyTranscript(f.c.qa.newSession());assert.equal(f.described,true);assert.equal(f.stats.collapses,0);assert.equal(f.expanded,false);
});
test('Clipboard.write is called synchronously before transcript loading',async()=>{
  const f=fixture();const running=f.c.qa.copyTranscript(f.c.qa.newSession());assert.equal(f.stats.writes,1);assert.equal(f.stats.opens,0);await running;
});
test('missing transcript cleans up description and leaves clipboard unchanged',async()=>{
  const f=fixture({available:false});await assert.rejects(f.c.qa.copyTranscript(f.c.qa.newSession()),/недоступна/);assert.equal(f.c.copied,undefined);assert.equal(f.described,false);
});
test('permission rejection cancels extraction without late panels',async()=>{
  const f=fixture({clipboardReject:true,delayDirect:true});await assert.rejects(f.c.qa.copyTranscript(f.c.qa.newSession()),{name:'NotAllowedError'});
  assert.equal(f.stats.opens,0);assert.equal(f.stats.expands,0);assert.equal(f.c.copied,undefined);
});
test('SPA navigation rejects stale transcript and does not collapse next video',async()=>{
  const f=fixture();const running=f.c.qa.copyTranscript(f.c.qa.newSession());f.c.location.search='?v=newvideo123';
  await assert.rejects(running,/Видео сменилось/);assert.equal(f.c.copied,undefined);assert.equal(f.stats.opens,0);
});
test('toolbar position matches original extension; idempotent; no floating host',()=>{
  const f=fixture();f.c.qa.ensureButton();f.c.qa.ensureButton();assert.equal(f.controls.children.length,1);
  const b=f.controls.firstChild;assert.equal(b.id,'triangle-transcript-button');assert.equal(b.className,'ytp-button');assert.equal(b.dataset.state,'idle');
});
test('success changes only button to a checkmark for exactly 1000 ms',async()=>{
  const f=fixture({direct:'Текст'});f.c.qa.ensureButton();const b=f.controls.firstChild;
  f.c.qa.onClick({isTrusted:true,currentTarget:b,preventDefault(){},stopPropagation(){}});
  assert.equal(b.dataset.state,'busy');for(let i=0;i<8;i++)await new Promise(resolve=>setImmediate(resolve));
  assert.equal(b.dataset.state,'success');assert.equal(b.querySelector('path').getAttribute('d'),'M10 19l5 5 11-12');
  const reset=f.timers.find(t=>t.ms===1000&&!t.cancelled);assert.ok(reset);reset.f();assert.equal(b.dataset.state,'idle');
});
test('repeat click during extraction cannot start another clipboard operation',async()=>{
  const f=fixture({direct:'Текст'});f.c.qa.ensureButton();const event={isTrusted:true,currentTarget:f.controls.firstChild,preventDefault(){},stopPropagation(){}};
  f.c.qa.onClick(event);f.c.qa.onClick(event);assert.equal(f.stats.writes,1);
  for(let i=0;i<8;i++)await new Promise(resolve=>setImmediate(resolve));
});
const directSource=fs.readFileSync(path.join(__dirname,'../extension/direct.js'),'utf8')
  .replace("  window.addEventListener('message', async event => {", "  globalThis.qa = { readDirect, parseTranscript };\n  window.addEventListener('message', async event => {");
function directFixture(data,fetcher){const c={URLSearchParams,location:{search:'?v=abcdefghijk'},document:{querySelector:()=>({data}),addEventListener(){}},ytcfg:{get:()=>({client:{clientName:'WEB'}})},fetch:fetcher,addEventListener(){}};c.window=c;vm.createContext(c);vm.runInContext(directSource,c);return c;}
test('direct parser excludes timestamps, headings and accessibility labels',()=>{
  const c=directFixture();const data={body:[{transcriptSectionHeaderRenderer:{title:'Заголовок'}},{transcriptSegmentRenderer:{startTimeText:{simpleText:'0:00'},snippet:{runs:[{text:'Первый\n'},{text:'второй'}]}}},{transcriptSegmentViewModel:{startTimeMs:'2000',accessibilityText:'2 секунды',snippet:{content:'Третий'}}}]};
  assert.equal(c.qa.parseTranscript(data),'Первый второй Третий');
});
test('direct request is same-origin, bound to current video, uses actual page endpoint',async()=>{
  let request;const data={currentVideoEndpoint:{watchEndpoint:{videoId:'abcdefghijk'}},engagementPanels:[{getTranscriptEndpoint:{params:'actual-params'}}]};
  const c=directFixture(data,async(url,options)=>{request={url,options};return {ok:true,json:async()=>({transcriptSegmentRenderer:{snippet:{simpleText:'Текст'}}})};});
  assert.equal(await c.qa.readDirect('abcdefghijk',new AbortController().signal),'Текст');
  assert.equal(request.url,'/youtubei/v1/get_transcript?prettyPrint=false');assert.equal(request.options.credentials,'same-origin');assert.equal(JSON.parse(request.options.body).params,'actual-params');
  await assert.rejects(c.qa.readDirect('newvideo123',new AbortController().signal),/недоступно/);
});
test('YouTube API refusal is explicit so caller can fall back to the panel',async()=>{
  const data={currentVideoEndpoint:{watchEndpoint:{videoId:'abcdefghijk'}},getTranscriptEndpoint:{params:'actual'}};
  const c=directFixture(data,async()=>({ok:false,status:400}));await assert.rejects(c.qa.readDirect('abcdefghijk',new AbortController().signal),/400/);
});
test('cleanup finds the current description if YouTube replaced its DOM during extraction',()=>{
  const f=fixture();const s=f.c.qa.newSession();let collapsed=false;
  s.openedDescription={isConnected:false,querySelector(){throw new Error('Detached expander must not be used');}};
  const original=f.c.document.querySelector;
  f.c.document.querySelector=q=>q==='ytd-watch-metadata #description-inline-expander'?{querySelector:()=>({offsetParent:{},getBoundingClientRect:()=>({width:50,height:20}),click(){collapsed=true;}})}:original(q);
  f.c.qa.cleanup(s,true);assert.equal(collapsed,true);
});
