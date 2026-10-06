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
    if (process.env.SWIPE_TEST_FILTER && !new RegExp(process.env.SWIPE_TEST_FILTER).test(name)) return;
    try { await fn(); console.log('PASS ' + name); }
    catch (error) { failures.push(name + ': ' + error.message); console.error('FAIL ' + name + ': ' + error.message); }
}
async function ready(page, file = 'index.html') {
    await page.goto(base + file, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => !document.body.classList.contains('loading'));
    await page.waitForTimeout(80);
}
async function emptyPoint(page) {
    return page.evaluate(() => {
        const excluded = 'a,button,input,textarea,select,label,iframe,video,audio,img,[data-fancybox],[role="button"],[contenteditable],.content--layout,.demos,.pater,#popup,.content__title,.content__desc,.codrops-header';
        for (const x of [innerWidth - 18, 18, innerWidth - 50, 50]) {
            for (const y of [innerHeight * .18, innerHeight * .48, innerHeight * .68, innerHeight * .85, innerHeight * .92]) {
                const el = document.elementFromPoint(x, y);
                if (el && !el.closest(excluded)) return { x, y };
            }
        }
        throw new Error('No empty background point found');
    });
}
async function drag(page, delta, options = {}) {
    const point = await emptyPoint(page);
    // Pick the edge that leaves enough room in the intended direction.
    if (delta > 0 && point.x > 400) point.x = 18;
    if (delta < 0 && point.x < 400) point.x = (await page.evaluate(() => innerWidth)) - 18;
    await page.mouse.move(point.x, point.y);
    await page.mouse.down();
    await page.mouse.move(point.x + delta, point.y + (options.dy || 0), { steps: options.hold === false ? 1 : 8 });
    if (options.hold !== false) await page.waitForTimeout(180);
    if (!options.keepDown) await page.mouse.up();
    return point;
}
async function clean(page) {
    await page.waitForFunction(() => !document.querySelector('.page-swipe-canvas') && !document.body.classList.contains('is-page-swiping'));
}
async function touch(page, points, expectHorizontal = false) {
    const session = await page.context().newCDPSession(page);
    const start = points[0];
    await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: start.x, y: start.y, id: 0 }] });
    for (const p of points.slice(1)) {
        await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: p.x, y: p.y, id: 0 }] });
        await page.waitForTimeout(30);
    }
    if (expectHorizontal) assert.equal(await page.locator('.page-swipe-canvas').count(), 1);
    await page.waitForTimeout(160);
    await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await session.detach();
}
(async () => {
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    base = `http://127.0.0.1:${server.address().port}/`;
    browser = await chromium.launch({ executablePath: process.env.SWIPE_CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, ignoreHTTPSErrors: true });
    await context.addInitScript(() => {
        window.__swipePerf = { rafRequests: 0, listeners: {}, ownListeners: {}, listenerSources: {}, styleReads: 0, rectReads: 0 };
        const raf = window.requestAnimationFrame;
        window.requestAnimationFrame = callback => { window.__swipePerf.rafRequests++; return raf.call(window, callback); };
        const listen = EventTarget.prototype.addEventListener;
        EventTarget.prototype.addEventListener = function(type, ...args) {
            window.__swipePerf.listeners[type] = (window.__swipePerf.listeners[type] || 0) + 1;
            const source = new Error().stack.match(/\/js\/(demo[123]|moss-mist|video-wet-glass|page-swipe)\.js/);
            if (source) {
                window.__swipePerf.ownListeners[type] = (window.__swipePerf.ownListeners[type] || 0) + 1;
                const key = source[1] + ':' + type;
                window.__swipePerf.listenerSources[key] = (window.__swipePerf.listenerSources[key] || 0) + 1;
            }
            return listen.call(this, type, ...args);
        };
        const styles = window.getComputedStyle;
        window.getComputedStyle = (...args) => {
            if (document.body?.classList.contains('is-page-swiping')) window.__swipePerf.styleReads++;
            return styles(...args);
        };
        const rect = Element.prototype.getBoundingClientRect;
        Element.prototype.getBoundingClientRect = function(...args) {
            if (document.body?.classList.contains('is-page-swiping')) window.__swipePerf.rectReads++;
            return rect.apply(this, args);
        };
    });
    const page = await context.newPage();
    page.setDefaultTimeout(15000);
    await check('performance: previews stay static while active-page water keeps animating', async () => {
        for (const file of ['index.html', 'index2.html', 'index3.html']) {
            await ready(page, file + '?swipe-preview=1');
            const initial = await page.evaluate(() => ({ ...window.__swipePerf }));
            await page.waitForTimeout(600);
            const later = await page.evaluate(() => ({ ...window.__swipePerf }));
            console.log('Preview work ' + file + ':', later.rafRequests - initial.rafRequests, 'rAF requests / 600ms; decorative pointermove:', later.ownListeners.pointermove || 0, 'mousemove:', later.ownListeners.mousemove || 0);
            if (!process.env.SWIPE_PERF_BASELINE) {
                assert.equal(later.rafRequests, initial.rafRequests);
                assert.equal(later.ownListeners.pointermove || 0, 0);
                assert.equal(later.ownListeners.mousemove || 0, 0);
            }
            assert.equal(await page.locator('.page-swipe-preview').count(), 0);
            const playing = await page.evaluate(() => document.getAnimations().filter(a => a.playState === 'running').length);
            assert.equal(playing, 0);
        }
        await ready(page, 'index3.html');
        assert.equal(await page.evaluate(() => window.__swipePerf.listenerSources['page-swipe:pointermove']), 1);
        const initial = await page.evaluate(() => window.__swipePerf.rafRequests);
        await page.waitForTimeout(300);
        assert((await page.evaluate(() => window.__swipePerf.rafRequests)) > initial);
        for (const file of ['index.html', 'index2.html']) {
            await ready(page, file);
            assert((await page.evaluate(() => document.getAnimations().filter(a => a.playState === 'running').length)) > 0);
        }
    });
    await check('performance: drag reuses frames and performs no repeated style/layout reads', async () => {
        await ready(page, 'index3.html');
        await page.waitForFunction(() => document.querySelectorAll('.page-swipe-preview').length === 2);
        await drag(page, -100, { keepDown: true });
        const count = await page.locator('.page-swipe-preview').count();
        await page.evaluate(() => { window.__swipePerf.styleReads = 0; window.__swipePerf.rectReads = 0; });
        await page.mouse.move(1100, 150, { steps: 15 });
        await page.waitForTimeout(100);
        const work = await page.evaluate(() => ({ ...window.__swipePerf }));
        console.log('Drag work: style reads', work.styleReads, 'rect reads', work.rectReads);
        if (!process.env.SWIPE_PERF_BASELINE) {
            assert.equal(work.styleReads, 0);
            assert.equal(work.rectReads, 0);
        }
        assert.equal(await page.locator('.page-swipe-preview').count(), count);
        await page.mouse.up(); await clean(page);
    });
    await check('click empty background does not navigate', async () => {
        await ready(page);
        const p = await emptyPoint(page);
        await page.mouse.click(p.x, p.y);
        assert.equal(new URL(page.url()).pathname, '/index.html');
        assert.equal(await page.locator('.page-swipe-canvas').count(), 0);
    });
    await check('30px drag returns and restores the main element', async () => {
        await ready(page);
        await drag(page, -30);
        await clean(page);
        assert.equal(new URL(page.url()).pathname, '/index.html');
        assert.equal(await page.locator('body > main').count(), 1);
        assert.equal(await page.locator('main').evaluate(el => el.style.cssText), '');
    });
    await check('page follows pointer and actual preview has no recursive frames', async () => {
        await ready(page);
        await page.waitForFunction(() => document.querySelectorAll('.page-swipe-preview').length === 2);
        await drag(page, -320, { keepDown: true });
        await page.waitForTimeout(120);
        assert.equal(await page.locator('.is-current-preview').count(), 1);
        const frame = page.frames().find(f => f.url().includes('index3.html?swipe-preview=1'));
        assert(frame);
        await frame.waitForSelector('.is-swipe-preview');
        assert.equal(await frame.locator('.page-swipe-preview-stage').count(), 0);
        assert.equal(await frame.evaluate(() => scrollY), 0);
        const x = await page.locator('.page-swipe-canvas').evaluate(el => new DOMMatrix(getComputedStyle(el).transform).m41);
        assert(Math.abs(x + 320) < 1);
        await page.screenshot({ path: path.join(process.env.TEMP || root, 'portfolio-swipe-drag.png') });
        await page.mouse.up();
        await page.waitForURL('**/index3.html');
        await page.waitForFunction(() => !document.body.classList.contains('loading'));
        assert.equal(await page.evaluate(() => scrollY), 0);
        assert.equal(await page.locator('.video-wet-glass .glass-drop').count(), 8);
    });
    await check('all six cyclic next/previous directions navigate correctly', async () => {
        const routes = [['index2.html', -1, 'index.html'], ['index2.html', 1, 'index3.html'], ['index.html', -1, 'index3.html'], ['index.html', 1, 'index2.html'], ['index3.html', -1, 'index2.html'], ['index3.html', 1, 'index.html']];
        for (const [from, sign, to] of routes) {
            await ready(page, from);
            await drag(page, sign * 300);
            await page.waitForURL(base + to);
        }
    });
    await check('Discover and bottom navigation receive normal clicks', async () => {
        await ready(page);
        await page.evaluate(() => {
            window.__discoverClicks = 0;
            const link = document.querySelector('.content__link');
            link.addEventListener('click', e => { window.__discoverClicks++; e.preventDefault(); e.stopImmediatePropagation(); }, { capture: true });
        });
        await page.locator('.content__link').first().click();
        assert.equal(await page.evaluate(() => window.__discoverClicks), 1);
        assert.equal(await page.locator('.page-swipe-canvas').count(), 0);
        await page.locator('.demos a[href="index2.html"]').click();
        await page.waitForURL(base + 'index2.html');
    });
    await check('card drags never start page swipes', async () => {
        await ready(page);
        const rect = await page.locator('a[data-fancybox] img').first().boundingBox();
        await page.mouse.move(rect.x + 25, rect.y + 25); await page.mouse.down();
        await page.mouse.move(rect.x + 285, rect.y + 30, { steps: 8 }); await page.mouse.up();
        assert.equal(await page.locator('.page-swipe-canvas').count(), 0);
    });
    await check('image click is preserved and Fancybox modal state blocks swipe', async () => {
        await ready(page);
        const hasFancybox = await page.evaluate(() => typeof window.Fancybox !== 'undefined');
        await page.locator('a[data-fancybox] img').first().click({ position: { x: 30, y: 30 } });
        if (hasFancybox) {
            await page.waitForSelector('.fancybox__container', { state: 'visible' });
        } else {
            await page.waitForURL('**/img/introduce1.jpg');
            console.log('NOTE Existing CDN Fancybox unavailable in this browser; normal image navigation checked, Fancybox guards tested with its modal/API contract.');
            await ready(page);
            await page.evaluate(() => {
                const box = document.createElement('div'); box.className = 'fancybox__container'; box.setAttribute('role', 'dialog');
                box.style.cssText = 'position:fixed;inset:0;z-index:30000;background:rgba(0,0,0,.8)'; document.body.appendChild(box);
                window.Fancybox = { getInstance: () => box, close: () => { box.remove(); delete window.Fancybox; } };
            });
        }
        await page.mouse.move(1250, 400);
        await page.mouse.down();
        await page.mouse.move(930, 400, { steps: 6 });
        await page.mouse.up();
        assert.equal(await page.locator('.page-swipe-canvas').count(), 0);
        assert.equal(new URL(page.url()).pathname, '/index.html');
        await page.evaluate(() => window.Fancybox.close());
    });
    await check('vertical mouse intent stays vertical even after horizontal movement', async () => {
        await ready(page);
        const p = await emptyPoint(page);
        await page.mouse.move(p.x, p.y); await page.mouse.down();
        await page.mouse.move(p.x - 5, p.y + 40);
        await page.mouse.move(p.x - 300, p.y + 45);
        await page.mouse.up();
        assert.equal(await page.locator('.page-swipe-canvas').count(), 0);
        assert.equal(new URL(page.url()).pathname, '/index.html');
    });
    await check('popup and native dialog block swipe', async () => {
        await ready(page, 'index3.html');
        await page.evaluate(() => document.querySelector('#popup').style.display = 'block');
        await page.mouse.move(1250, 400); await page.mouse.down();
        await page.mouse.move(950, 400, { steps: 6 }); await page.mouse.up();
        assert.equal(await page.locator('.page-swipe-canvas').count(), 0);
        await page.evaluate(() => { document.querySelector('#popup').style.display = 'none'; const d = document.createElement('dialog'); d.textContent = 'Test dialog'; document.body.appendChild(d); d.showModal(); });
        await page.mouse.move(1250, 400); await page.mouse.down();
        await page.mouse.move(950, 400, { steps: 6 }); await page.mouse.up();
        assert.equal(await page.locator('.page-swipe-canvas').count(), 0);
        await page.evaluate(() => document.querySelector('dialog').remove());
    });
    await check('modal visibility changes cancel a drag without waiting for another pointermove', async () => {
        await ready(page, 'index3.html');
        await drag(page, -100, { keepDown: true });
        await page.waitForSelector('.page-swipe-canvas');
        await page.evaluate(() => document.querySelector('#popup').style.display = 'block');
        await clean(page);
        await page.mouse.up();
        assert.equal(new URL(page.url()).pathname, '/index3.html');
        await page.evaluate(() => document.querySelector('#popup').style.display = 'none');
    });
    await check('cancel, lost capture, resize and visibility interruption reset safely', async () => {
        for (const reason of ['pointercancel', 'lostpointercapture', 'resize', 'visibility']) {
            await ready(page, 'index2.html');
            await drag(page, -100, { keepDown: true });
            await page.waitForSelector('.page-swipe-canvas');
            if (reason === 'pointercancel') await page.evaluate(() => window.dispatchEvent(new PointerEvent('pointercancel', { pointerId: 1 })));
            if (reason === 'lostpointercapture') {
                await page.evaluate(() => document.documentElement.releasePointerCapture(1));
                await page.mouse.move(1170, 400);
            }
            if (reason === 'resize') await page.setViewportSize({ width: 1260, height: 780 });
            if (reason === 'visibility') await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, value: true }); document.dispatchEvent(new Event('visibilitychange')); });
            await clean(page); await page.mouse.up();
            assert.equal(await page.locator('body > main').count(), 1);
            assert.equal(await page.locator('main').evaluate(el => el.style.cssText), '');
            await page.setViewportSize({ width: 1280, height: 800 });
        }
    });
    await check('fixed atmospheric layers remain viewport-aligned at a scrolled position', async () => {
        await ready(page, 'index3.html');
        await page.evaluate(() => scrollTo(0, 500));
        await page.waitForTimeout(100);
        await drag(page, -100, { keepDown: true });
        await page.waitForTimeout(60);
        for (const selector of ['.video-wet-glass', '.video-glass-surface', '.morph-wrap', '.content--fixed']) {
            const top = await page.locator(selector).evaluate(el => el.getBoundingClientRect().top);
            assert(Math.abs(top) < 1, selector + ' drifted vertically to ' + top);
        }
        await page.mouse.up(); await clean(page);
        assert.equal(await page.evaluate(() => scrollY), 500);
    });
    await check('background pointer input is suppressed during dragging and restored after', async () => {
        await ready(page, 'index2.html');
        await page.evaluate(() => { window.__windInputs = 0; window.addEventListener('pointermove', () => window.__windInputs++); });
        await drag(page, -100, { keepDown: true });
        const before = await page.evaluate(() => window.__windInputs);
        await page.mouse.move(900, 430);
        assert.equal(await page.evaluate(() => window.__windInputs), before);
        await page.mouse.move(1160, 400); await page.mouse.up(); await clean(page);
        await page.mouse.move(1210, 400);
        assert((await page.evaluate(() => window.__windInputs)) > before);
    });
    await check('fast 80px intentional flick commits, held 80px drag does not', async () => {
        await ready(page);
        await drag(page, -80, { hold: false });
        await page.waitForURL(base + 'index3.html');
        await ready(page);
        await drag(page, -80);
        await clean(page);
        assert.equal(new URL(page.url()).pathname, '/index.html');
    });
    await check('normal browser history remains available', async () => {
        await ready(page, 'index2.html');
        await page.evaluate(() => scrollTo(0, 400));
        await drag(page, -300); await page.waitForURL(base + 'index.html');
        await page.goBack(); await page.waitForURL(base + 'index2.html');
        await clean(page);
        assert.equal(await page.locator('main').evaluate(el => el.style.cssText), '');
        assert.equal(await page.evaluate(() => scrollY), 400);
    });
    await check('reduced motion uses a short completion without breaking navigation', async () => {
        await page.emulateMedia({ reducedMotion: 'reduce' });
        await ready(page);
        await drag(page, -300); await page.waitForURL(base + 'index3.html');
        await page.emulateMedia({ reducedMotion: 'no-preference' });
    });
    const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1, ignoreHTTPSErrors: true });
    const phone = await mobile.newPage(); phone.setDefaultTimeout(15000);
    await check('native vertical touch scroll and mostly-vertical diagonal do not swipe', async () => {
        await ready(phone);
        await touch(phone, [{ x: 372, y: 620 }, { x: 369, y: 560 }, { x: 366, y: 480 }, { x: 357, y: 370 }]);
        assert((await phone.evaluate(() => scrollY)) > 100);
        assert.equal(new URL(phone.url()).pathname, '/index.html');
        assert.equal(await phone.locator('.page-swipe-canvas').count(), 0);
    });
    await check('short horizontal touch swipe cancels', async () => {
        await ready(phone);
        const p = await emptyPoint(phone);
        const sign = p.x > 200 ? -1 : 1;
        await touch(phone, [{ x: p.x, y: p.y }, { x: p.x + sign * 15, y: p.y + 1 }, { x: p.x + sign * 30, y: p.y + 3 }], true);
        await clean(phone); assert.equal(new URL(phone.url()).pathname, '/index.html');
    });
    await check('deliberate mostly-horizontal touch swipe navigates', async () => {
        await ready(phone);
        const p = await emptyPoint(phone);
        const sign = p.x > 200 ? -1 : 1;
        await touch(phone, [{ x: p.x, y: p.y }, { x: p.x + sign * 32, y: p.y + 5 }, { x: p.x + sign * 72, y: p.y + 10 }, { x: p.x + sign * 122, y: p.y + 18 }], true);
        await phone.waitForURL(base + (sign < 0 ? 'index3.html' : 'index2.html'));
        assert.equal(await phone.evaluate(() => scrollY), 0);
    });
    await mobile.close(); await context.close();
    if (failures.length) throw new Error(failures.join('\n'));
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => {
    if (browser) await browser.close();
    server.close();
});
