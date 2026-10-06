// Browser regression checks. Run with Playwright available on NODE_PATH.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.jpg': 'image/jpeg', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff': 'font/woff', '.woff2': 'font/woff2' };
const server = http.createServer((req, res) => {
    const requested = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    const file = path.resolve(root, '.' + (requested === '/' ? '/index.html' : requested));
    if (!file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
    fs.readFile(file, (error, data) => {
        if (error) { res.writeHead(404).end(); return; }
        res.setHeader('Content-Type', mime[path.extname(file)] || 'application/octet-stream');
        res.end(data);
    });
});
let browser;
const failures = [];
let base;
async function check(name, fn) {
    if (process.env.DECK_TEST_FILTER && !new RegExp(process.env.DECK_TEST_FILTER).test(name)) return;
    try { await fn(); console.log('PASS ' + name); }
    catch (error) { failures.push(name + ': ' + error.message); console.error('FAIL ' + name + ': ' + error.message); }
}
async function ready(page, file = 'index.html') {
    await page.goto(base + file, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => !document.body.classList.contains('loading'));
    await page.waitForTimeout(80);
}
async function emptyPoint(page, direction = -1) {
    return page.evaluate(direction => {
        const excluded = 'a,button,input,textarea,select,label,iframe,video,audio,img,[data-fancybox],[role="button"],[contenteditable],.content--layout,.demos,.codrops-links,.pater,#popup,.content__title,.content__desc,.codrops-header';
        const positions = direction > 0 ? [18, 50, innerWidth - 18, innerWidth - 50] : [innerWidth - 18, innerWidth - 50, 18, 50];
        for (const x of positions) {
            for (const y of [innerHeight * .18, innerHeight * .48, innerHeight * .68, innerHeight * .85, innerHeight * .92]) {
                const el = document.elementFromPoint(x, y);
                if (el && !el.closest(excluded)) return { x, y };
            }
        }
        throw new Error('No empty background point found');
    }, direction);
}
async function drag(page, delta, options = {}) {
    const point = await emptyPoint(page, Math.sign(delta));
    await page.mouse.move(point.x, point.y);
    await page.mouse.down();
    await page.waitForTimeout(650);
    await page.mouse.move(point.x + delta, point.y + (options.dy || 0), { steps: options.hold === false ? 1 : 8 });
    if (options.hold !== false) await page.waitForTimeout(180);
    if (!options.keepDown) await page.mouse.up();
    return point;
}
async function clean(page) {
    await page.waitForFunction(() => !document.querySelector('.page-deck-live') && !document.body.classList.contains('is-page-deck'));
}
async function touch(page, points, expectHorizontal = false) {
    const session = await page.context().newCDPSession(page);
    const start = points[0];
    await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: start.x, y: start.y, id: 0 }] });
    for (const p of points.slice(1)) {
        await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: p.x, y: p.y, id: 0 }] });
        await page.waitForTimeout(30);
    }
    if (expectHorizontal) assert.equal(await page.locator('.page-deck-live').count(), 1);
    await page.waitForTimeout(160);
    await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await session.detach();
}
(async () => {
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve)); base='http://127.0.0.1:'+server.address().port+'/';
 browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 const context=await browser.newContext({viewport:{width:1280,height:800},ignoreHTTPSErrors:true});
 await context.addInitScript(() => {
  window.__deckListeners = {};
  const add = EventTarget.prototype.addEventListener;
  EventTarget.prototype.addEventListener = function(type, ...args) {
   if (/\/js\/page-deck\.js\b/.test(new Error().stack)) {
    window.__deckListeners[type] = (window.__deckListeners[type] || 0) + 1;
   }
   return add.call(this, type, ...args);
  };
 });
 const page=await context.newPage(); page.setDefaultTimeout(20000);
 await check('all three pages: left/right and pre-threshold drags cannot transform, preview or navigate',async()=>{
  for (const file of ['index.html','index2.html','index3.html']) {
   for (const sign of [-1,1]) {
    await ready(page,file);
    const before = await page.evaluate(() => {
     const main=document.querySelector('main'), rect=main.getBoundingClientRect();
     window.__normalFrames=[];
     window.__watchNormal=true;
     const monitor=()=>{
      if (!window.__watchNormal) return;
      window.__normalFrames.push({transform:getComputedStyle(main).transform, live:!!document.querySelector('.page-deck-live'), visible:!!document.querySelector('.page-deck-stage.is-visible')});
      requestAnimationFrame(monitor);
     }; requestAnimationFrame(monitor);
     return {style:main.getAttribute('style'),x:rect.x,y:rect.y};
    });
    const p=await emptyPoint(page,sign);
    await page.mouse.move(p.x,p.y); await page.mouse.down();
    await page.waitForTimeout(100);
    const delta=sign*180;
    await page.mouse.move(p.x+delta,p.y);
    await page.waitForTimeout(350); await page.mouse.up();
    const after=await page.evaluate(()=>{
     window.__watchNormal=false;
     const main=document.querySelector('main'),rect=main.getBoundingClientRect();
     return {style:main.getAttribute('style'),x:rect.x,y:rect.y,frames:window.__normalFrames, previews:document.querySelectorAll('.page-deck-card').length};
    });
    assert.deepEqual({style:after.style,x:after.x,y:after.y},before);
    assert(after.frames.length>0); assert(after.frames.every(f=>f.transform==='none' && !f.live && !f.visible));
    assert.equal(after.previews,0); assert.equal(new URL(page.url()).pathname,'/'+file);
   }
  }
 });
 await check('only one gesture initializes per page even when script is loaded again',async()=>{
  for(const file of ['index.html','index2.html','index3.html']) {
   await ready(page,file);
   const before=await page.evaluate(()=>({listeners:window.__deckListeners,scripts:[...document.scripts].map(s=>s.src),styles:[...document.querySelectorAll('link[rel="stylesheet"]')].map(s=>s.href)}));
   assert.equal(before.listeners.pointerdown,1); assert.equal(before.listeners.pointermove,1); assert.equal(before.listeners.pointerup,1);
   assert.equal(before.scripts.filter(s=>s.includes('/js/page-deck.js')).length,1);
   assert(![...before.scripts,...before.styles].some(s=>s.includes('page-swipe')));
   assert.equal(await page.locator('.page-deck-card').count(),0);
   await page.addScriptTag({url:base+'js/page-deck.js?v=duplicate-check'});
   assert.deepEqual(await page.evaluate(()=>window.__deckListeners),before.listeners);
   assert.equal(await page.locator('.page-deck-stage').count(),1);
  }
 });
 await check('normal wheel and quick clicks never open deck',async()=>{
  await ready(page); const p=await emptyPoint(page); await page.mouse.click(p.x,p.y); await page.waitForTimeout(300); assert.equal(await page.locator('.page-deck-live').count(),0);
  await page.mouse.wheel(0,500); await page.waitForTimeout(300); assert((await page.evaluate(()=>scrollY))>100);
 });
 await check('hold has delay; no drag returns same live page and exact scroll',async()=>{
  await ready(page); await page.evaluate(()=>{scrollTo(0,500); window.__originalMain=document.querySelector('main');});
  const p=await emptyPoint(page); await page.mouse.move(p.x,p.y); await page.mouse.down(); await page.waitForTimeout(100); assert.equal(await page.locator('.page-deck-live').count(),0);
  await page.waitForTimeout(550); assert.equal(await page.locator('.page-deck-card').count(),3);
  const before=await page.evaluate(()=>scrollY); await page.mouse.wheel(0,300); await page.waitForTimeout(100); assert.equal(await page.evaluate(()=>scrollY),before);
  await page.mouse.up(); await clean(page);
  assert.equal(await page.evaluate(()=>scrollY),500); assert(await page.evaluate(()=>document.querySelector('main')===window.__originalMain));
 });
 await check('immediate horizontal drag does nothing and partial rotation is continuous',async()=>{
  await ready(page); const p=await emptyPoint(page); await page.mouse.move(p.x,p.y); await page.mouse.down(); await page.mouse.move(p.x-180,p.y); await page.waitForTimeout(350); assert.equal(await page.locator('.page-deck-live').count(),0); await page.mouse.up();
  await drag(page,-45,{keepDown:true}); const transform=await page.locator('.page-deck-live').evaluate(el=>el.style.transform); assert(transform.includes('rotate(')); assert(!transform.includes('rotate(0deg)')); await page.mouse.up(); await clean(page); assert.equal(new URL(page.url()).pathname,'/index.html');
 });
 await check('lost capture and visibility changes cancel safely',async()=>{
  for(const reason of ['capture','visibility']) { await ready(page); await drag(page,-180,{keepDown:true});
   if(reason==='capture') { await page.evaluate(()=>document.documentElement.releasePointerCapture(1)); await page.mouse.move(900,400); }
   else await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true}); document.dispatchEvent(new Event('visibilitychange'));});
   await clean(page); await page.mouse.up(); assert.equal(new URL(page.url()).pathname,'/index.html');
  }
 });
 await check('all six circular directions expand before navigating',async()=>{
  for(const [from,sign,to] of [['index2.html',-1,'index.html'],['index2.html',1,'index3.html'],['index.html',-1,'index3.html'],['index.html',1,'index2.html'],['index3.html',-1,'index2.html'],['index3.html',1,'index.html']]) {
   await ready(page,from); await drag(page,sign*180); assert.equal(new URL(page.url()).pathname,'/'+from); await page.waitForURL(base+to);
  }
 });
 await check('three rotations return original without reload; fourth continues circularly',async()=>{
  await ready(page); await page.evaluate(()=>window.__same=true); await drag(page,-540); await clean(page); assert(await page.evaluate(()=>window.__same));
  await drag(page,-720); await page.waitForURL(base+'index3.html');
 });
 await check('project hold never activates; navigation links still work',async()=>{
  await ready(page); const box=await page.locator('a[data-fancybox] img').first().boundingBox(); await page.mouse.move(box.x+20,box.y+20); await page.mouse.down(); await page.waitForTimeout(600); assert.equal(await page.locator('.page-deck-live').count(),0); await page.keyboard.press('Escape'); await page.mouse.move(1260,400); await page.mouse.up();
  await ready(page); await page.locator('.demos a[href="index3.html"]').click(); await page.waitForURL(base+'index3.html');
 });
 await check('popup and Fancybox API block activation',async()=>{
  await ready(page,'index3.html'); await page.evaluate(()=>document.querySelector('#popup').style.display='block'); await drag(page,-180); assert.equal(await page.locator('.page-deck-live').count(),0);
  await page.evaluate(()=>{document.querySelector('#popup').style.display='none'; window.Fancybox={getInstance:()=>({})};}); await drag(page,-180); assert.equal(await page.locator('.page-deck-live').count(),0);
 });
 await check('Escape, resize, pointer cancellation and modal opening restore original',async()=>{
  for(const reason of ['escape','resize','cancel','modal']) {
   await ready(page,'index3.html'); await drag(page,-180,{keepDown:true});
   if(reason==='escape') await page.keyboard.press('Escape');
   if(reason==='resize') await page.setViewportSize({width:1260,height:780});
   if(reason==='cancel') await page.evaluate(()=>window.dispatchEvent(new PointerEvent('pointercancel',{pointerId:1})));
   if(reason==='modal') await page.evaluate(()=>document.querySelector('#popup').style.display='block');
   await clean(page); await page.mouse.up(); assert.equal(new URL(page.url()).pathname,'/index3.html'); assert.equal(await page.locator('body > main').count(),1);
   await page.setViewportSize({width:1280,height:800});
  }
 });
 await check('previews do not create nested decks and keep actual backgrounds',async()=>{
  for(const file of ['index.html','index2.html','index3.html']) { await ready(page,file+'?deck-preview=1'); assert.equal(await page.locator('.page-deck-card,.page-deck-stage').count(),0); }
  assert.equal(await page.locator('.video-wet-glass .glass-drop').count(),8);
 });
 await check('reduced motion navigation works',async()=>{await page.emulateMedia({reducedMotion:'reduce'}); await ready(page); await drag(page,-180); await page.waitForURL(base+'index3.html');});
 const mobile=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,ignoreHTTPSErrors:true}); const phone=await mobile.newPage();
 await check('native touch vertical scroll remains available',async()=>{await ready(phone); await touch(phone,[{x:372,y:620},{x:369,y:560},{x:366,y:480},{x:357,y:370}]); assert((await phone.evaluate(()=>scrollY))>100); assert.equal(await phone.locator('.page-deck-live').count(),0);});

 async function finger(type, points = []) {
  await session.send('Input.dispatchTouchEvent',{type,touchPoints:points.map((p,i)=>({...p,id:i}))});
 }
 const session=await mobile.newCDPSession(phone);
 await check('touch taps, short holds, horizontal swipes and slow scroll never activate',async()=>{
  for(const kind of ['tap','short','horizontal','slow']) {
   await ready(phone); const p=await emptyPoint(phone);
   await finger('touchStart',[p]);
   if(kind==='short') await phone.waitForTimeout(250);
   if(kind==='horizontal') await finger('touchMove',[{x:p.x-80,y:p.y}]);
   if(kind==='slow') { await phone.waitForTimeout(80); await finger('touchMove',[{x:p.x,y:p.y+18}]); }
   if(kind==='horizontal'||kind==='slow') await phone.waitForTimeout(450);
   assert.equal(await phone.locator('.page-deck-live').count(),0);
   await finger('touchEnd'); assert.equal(new URL(phone.url()).pathname,'/index.html');
  }
 });
 await check('touch hold waits 380ms, uses mobile geometry, restores without reload and unlocks scroll',async()=>{
  await ready(phone); await phone.evaluate(()=>window.__sameMain=document.querySelector('main'));
  const p=await emptyPoint(phone); await finger('touchStart',[p]); await phone.waitForTimeout(300);
  assert.equal(await phone.locator('.page-deck-live').count(),0);
  await phone.waitForTimeout(550); assert.equal(await phone.locator('.page-deck-card').count(),3);
  const values=await phone.locator('.page-deck-live').evaluate(el=>({matrix:[...new DOMMatrix(getComputedStyle(el).transform).toFloat64Array()],overflow:document.body.style.overflow}));
  assert(Math.abs(values.matrix[0]-.86)<.001); assert(Math.abs(values.matrix[5]-.72)<.001); assert.equal(values.overflow,'hidden');
  const y=await phone.evaluate(()=>scrollY);
  await finger('touchMove',[{x:p.x,y:p.y+60}]); await phone.waitForTimeout(100);
  assert.equal(await phone.evaluate(()=>scrollY),y); assert.equal(await phone.locator('.page-deck-live').count(),1);
  await finger('touchEnd'); assert.equal(await phone.evaluate(()=>document.body.style.overflow),''); await clean(phone);
  assert(await phone.evaluate(()=>document.querySelector('main')===window.__sameMain));
  await touch(phone,[{x:372,y:620},{x:372,y:540},{x:372,y:380}]); assert((await phone.evaluate(()=>scrollY))>50);
 });
 await check('touch hold and 140px drag navigates through the existing circular deck',async()=>{
  for(const file of ['index2.html','index.html','index3.html']) {
   await ready(phone,file); const p=await emptyPoint(phone); await finger('touchStart',[p]); await phone.waitForTimeout(850);
   await finger('touchMove',[{x:p.x-140,y:p.y}]); await phone.waitForTimeout(100); assert.equal(await phone.locator('.page-deck-live').count(),1);
   await finger('touchEnd'); const order=['index2.html','index.html','index3.html']; await phone.waitForURL(base+order[(order.indexOf(file)+1)%3]);
  }
 });
 await check('touch multitouch, cancel, visibility, resize and modal opening restore safely',async()=>{
  for(const reason of ['second-pending','second-active','cancel','visibility','resize','modal']) {
   await ready(phone,'index3.html'); const p=await emptyPoint(phone); await finger('touchStart',[p]);
   await phone.waitForTimeout(reason==='second-pending'?100:850);
   if(reason.startsWith('second')) await finger('touchStart',[p,{x:p.x-35,y:p.y+35}]);
   if(reason==='cancel') await finger('touchCancel');
   if(reason==='visibility') await phone.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));});
   if(reason==='resize') await phone.setViewportSize({width:400,height:844});
   if(reason==='modal') await phone.evaluate(()=>document.querySelector('#popup').style.display='block');
   await clean(phone); assert.equal(await phone.evaluate(()=>document.body.style.overflow),''); if(reason!=='cancel') await finger('touchEnd');
   assert.equal(new URL(phone.url()).pathname,'/index3.html'); await phone.setViewportSize({width:390,height:844});
  }
 });
 await check('touch project and Discover native taps remain available; Fancybox API blocks holds',async()=>{
  await ready(phone); await phone.locator('a[data-fancybox]').first().tap({position:{x:10,y:10}}); await phone.waitForTimeout(300);
  assert(await phone.evaluate(()=>!!document.querySelector('.fancybox-container,.fancybox__container') || location.pathname.endsWith('/img/introduce1.jpg')));
  await phone.keyboard.press('Escape'); await ready(phone);
  const box=await phone.locator('a[data-fancybox] img').first().boundingBox();
  await finger('touchStart',[{x:box.x+10,y:box.y+10}]); await phone.waitForTimeout(500); assert.equal(await phone.locator('.page-deck-live').count(),0); await finger('touchCancel');
  await phone.locator('.content__link').first().tap();
  await phone.waitForFunction(()=>location.pathname.endsWith('/img/introduce1.jpg') || !!document.querySelector('.fancybox-container,.fancybox__container'));
  assert.equal(await phone.locator('.page-deck-live').count(),0);
  await ready(phone); await phone.evaluate(()=>window.Fancybox={getInstance:()=>({})});
  const p=await emptyPoint(phone); await finger('touchStart',[p]); await phone.waitForTimeout(500); assert.equal(await phone.locator('.page-deck-live').count(),0); await finger('touchEnd');
 });
 await session.detach();
 await mobile.close(); await context.close(); if(failures.length) throw Error(failures.join('\n'));
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(async()=>{if(browser) await browser.close();server.close();});
