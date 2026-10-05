// Mouse-only temporary deck; normal page layout and touch scrolling are untouched.
(() => {
'use strict';
const order = ['index2.html','index.html','index3.html'];
const url = new URL(location.href), pageIndex = order.indexOf(url.pathname.split('/').pop() || 'index.html');
const main = document.querySelector('main');
if (!main || pageIndex < 0) return;
if (url.searchParams.get('deck-preview') === '1') { document.body.classList.add('is-deck-preview'); return; }
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const excluded = 'a,button,input,textarea,select,label,iframe,video,audio,img,nav,[role="navigation"],[data-fancybox],[role="button"],[contenteditable],.content__img,.content__link,.content--layout,.demos,.codrops-links,.pater,#popup,#openPopup,#closePopup,.modal,[role="dialog"],dialog,.fancybox__container,.fancybox-container,[data-deck-ignore],.content__title,.content__subtitle,.content__desc,.codrops-header,.content__info';
const stage = document.createElement('div'); stage.className = 'page-deck-stage'; stage.inert = true; stage.setAttribute('aria-hidden','true'); document.body.append(stage);
const cards = new Map();
let gesture = null, closing = false, frame = null, holdTimer = null, canvas = null, placeholder = null;
let savedStyle, savedInert, savedX = 0, savedY = 0, phase = pageIndex, opening = 0, started = 0, suppressClickUntil = 0, navigating = false;
const mod = n => ((n % 3) + 3) % 3;
// Solve cubic-bezier(0.22, 1, 0.36, 1) without measuring layout.
const ease = t => {
 if (t <= 0 || t >= 1) return t;
 let low = 0, high = 1, u = t;
 for (let i = 0; i < 14; i++) {
  const x = 3*(1-u)*(1-u)*u*.22 + 3*(1-u)*u*u*.36 + u*u*u;
  if (x < t) low = u; else high = u;
  u = (low+high)/2;
 }
 return 1-Math.pow(1-u,3);
};
    const isVisible = el => {
        if (el.hidden || el.getAttribute('aria-hidden') === 'true') return false;
        const style = getComputedStyle(el);
        return style.display !== 'none' && style.visibility !== 'hidden' && el.getClientRects().length > 0;
    };
    const modalOpen = () => {
        if (document.body.classList.contains('modal-open') || document.documentElement.classList.contains('with-fancybox') || document.body.classList.contains('fancybox-active')) return true;
        if (window.Fancybox && typeof window.Fancybox.getInstance === 'function' && window.Fancybox.getInstance()) return true;
        return Array.from(document.querySelectorAll('dialog[open], [role="dialog"], [aria-modal="true"], .modal.show, .fancybox__container, .fancybox-container, #popup, .offcanvas.show')).some(isVisible);
    };
    let blockedByModal = false;
    const modalSelector = 'dialog, [role="dialog"], [aria-modal], .modal, .fancybox__container, .fancybox-container, #popup, .offcanvas';
    const trackedModals = new WeakSet();
    const modalObserver = new MutationObserver(records => {
        const changed = records.map(record => {
            if (record.type === 'attributes') {
                const el = record.target;
                if (el.matches(modalSelector)) trackModal(el);
                return el === document.body || el === document.documentElement || el.matches(modalSelector) ||
                    record.attributeName === 'aria-modal' ||
                    (record.attributeName === 'role' && record.oldValue === 'dialog') ||
                    (record.attributeName === 'class' && /(?:^|\s)(?:modal|offcanvas|fancybox__container|fancybox-container)(?:\s|$)/.test(record.oldValue || ''));
            }
            let relevant = false;
            for (const node of [...record.addedNodes, ...record.removedNodes]) {
                if (!(node instanceof Element)) continue;
                if (node.matches(modalSelector)) { trackModal(node); relevant = true; }
                const nested = node.querySelectorAll(modalSelector);
                nested.forEach(trackModal);
                relevant ||= nested.length > 0;
            }
            return relevant;
        }).some(Boolean); // Inspect all records so newly inserted modals get tracked.
        if (!changed) return; // Ignore animated droplet/grass style updates entirely.
        blockedByModal = modalOpen();
        if (blockedByModal && (gesture || closing)) cancel();
    });
    const trackModal = el => {
        if (trackedModals.has(el)) return;
        trackedModals.add(el);
        // Observe inline visibility changes only on actual modal elements, not on
        // every droplet/grass node that updates its style on animation frames.
        modalObserver.observe(el, { attributes: true, attributeOldValue: true,
            attributeFilter: ['class', 'style', 'hidden', 'aria-hidden', 'aria-modal', 'open', 'role'] });
    };
    modalObserver.observe(document.documentElement, {
        subtree: true, childList: true, attributes: true, attributeOldValue: true,
        attributeFilter: ['class', 'hidden', 'aria-hidden', 'aria-modal', 'open', 'role']
    });
    document.querySelectorAll(modalSelector).forEach(trackModal);

const prepare = () => order.forEach((file,i) => {
 if (i === pageIndex || cards.has(i)) return;
 const card = document.createElement('iframe'); card.className = 'page-deck-card'; card.title = ['Web/App','Graphic','Video'][i] + ' preview'; card.tabIndex = -1; card.inert = true;
 const target = new URL(file,url); target.searchParams.set('deck-preview','1'); card.src = target.href;
 stage.append(card); cards.set(i,card);
});
if (document.readyState === 'complete') prepare(); else window.addEventListener('load',prepare,{once:true});
const slots = [ {x:0,y:0,s:1,o:1,r:0}, {x:.24,y:-.06,s:.86,o:.78,r:1.5}, {x:-.24,y:.06,s:.86,o:.78,r:-1.5} ];
const pose = i => {
 const relative = mod(i-phase), k = Math.floor(relative), t = relative-k, a = slots[k], b = slots[(k+1)%3];
 const p = {}; for (const key in a) p[key] = a[key]+(b[key]-a[key])*t;
 p.z = p.s > .93 ? 3 : (k === 1 ? 1 : 2); return p;
};
const paint = (card,p,amount) => {
 card.style.transform = 'translate3d('+p.x*innerWidth*amount+'px,'+p.y*innerHeight*amount+'px,0) rotate('+p.r*amount+'deg) scale('+(1+(.74*p.s-1)*amount)+','+(1+(.76*p.s-1)*amount)+')';
 card.style.opacity = card === canvas ? 1+(p.o-1)*amount : p.o*amount;
 card.style.zIndex = p.z; card.style.borderRadius = 12*amount+'px';
};
const draw = now => {
 frame = null; if (!canvas || closing) return;
 opening = Math.min(1,(now-started)/(reduced.matches ? 70 : 380));
 cards.forEach((card,i) => paint(card,pose(i),ease(opening)));
 if (opening < 1) frame = requestAnimationFrame(draw);
};
const schedule = () => { if (frame === null) frame = requestAnimationFrame(draw); };
const releaseCapture = id => { if (id !== undefined && document.documentElement.hasPointerCapture(id)) document.documentElement.releasePointerCapture(id); };
const reset = () => {
 clearTimeout(holdTimer); holdTimer = null; if (frame !== null) cancelAnimationFrame(frame); frame = null;
 const id = gesture?.id; gesture = null; closing = false;
 if (canvas) {
  placeholder.replaceWith(main); if (savedStyle === null) main.removeAttribute('style'); else main.setAttribute('style',savedStyle);
  main.inert = savedInert; canvas.remove(); canvas = placeholder = null; cards.delete(pageIndex); window.scrollTo(savedX,savedY);
 }
 stage.classList.remove('is-visible'); document.body.classList.remove('is-page-deck'); releaseCapture(id);
};
const mount = () => {
 holdTimer = null; if (!gesture || modalOpen()) { reset(); return; }
 savedX = scrollX; savedY = scrollY; const rect = main.getBoundingClientRect(); savedStyle = main.getAttribute('style'); savedInert = main.inert;
 placeholder = document.createElement('div'); placeholder.style.height = main.offsetHeight+'px'; main.before(placeholder);
 canvas = document.createElement('div'); canvas.className = 'page-deck-card page-deck-live'; const bg = getComputedStyle(document.body);
 for (const key of ['backgroundColor','backgroundImage','backgroundSize','backgroundPosition','backgroundRepeat']) canvas.style[key] = bg[key];
 main.style.position = 'absolute'; main.style.top = rect.top+'px'; main.style.left = rect.left+'px'; main.style.width = rect.width+'px'; main.inert = true;
 canvas.append(main); stage.append(canvas); cards.set(pageIndex,canvas); prepare();
 phase = pageIndex; opening = 0; started = performance.now(); gesture.active = true;
 document.body.classList.add('is-page-deck'); stage.classList.add('is-visible'); document.documentElement.setPointerCapture(gesture.id);
 cards.forEach((card,i) => paint(card,pose(i),0)); schedule();
};
const finish = cancelled => {
 if (!canvas || closing) { if (!closing) reset(); return; }
 if (frame !== null) cancelAnimationFrame(frame); frame = null;
 const selected = cancelled ? pageIndex : mod(Math.round(phase));
 const from = new Map(); cards.forEach((card,i) => from.set(i,pose(i)));
 const amount = ease(opening), start = performance.now(), duration = reduced.matches ? 80 : 560, id = gesture?.id;
 gesture = null; closing = true; suppressClickUntil = start+duration+400; releaseCapture(id);
 const tick = now => {
  const t = Math.min(1,(now-start)/duration), progress = ease(t);
  cards.forEach((card,i) => {
   const p = from.get(i);
   if (i === selected) {
    paint(card,p,amount*(1-progress)); card.style.opacity = (1-progress)*(card === canvas ? 1+(p.o-1)*amount : p.o*amount)+progress; card.style.zIndex = 5;
   } else { paint(card,{...p,x:p.x*(1+.25*progress)},amount); card.style.opacity = (1-progress)*(card === canvas ? 1 : p.o*amount); }
  });
  if (t < 1) frame = requestAnimationFrame(tick);
  else if (selected === pageIndex || modalOpen()) reset();
  else { try { sessionStorage.setItem('portfolio-deck-arrival',new URL(order[selected],url).pathname); } catch {} navigating = true; location.assign(new URL(order[selected],url).href); }
 }; frame = requestAnimationFrame(tick);
};
const cancel = () => { if (canvas && !closing) finish(true); else reset(); };
window.addEventListener('pointerdown',e => {
 if (gesture || closing || e.pointerType !== 'mouse' || e.button !== 0 || e.isPrimary === false) return;
 if (document.body.classList.contains('loading') || modalOpen() || !(e.target instanceof Element) || e.target.closest(excluded)) return;
 gesture = {id:e.pointerId,x:e.clientX,y:e.clientY,lastX:e.clientX,active:false}; holdTimer = setTimeout(mount,220);
},{capture:true,passive:true});
window.addEventListener('pointermove',e => {
 if (closing) { e.stopImmediatePropagation(); return; }
 if (!gesture || e.pointerId !== gesture.id) return;
 if (!gesture.active) { if (Math.hypot(e.clientX-gesture.x,e.clientY-gesture.y)>8) reset(); return; }
 e.preventDefault(); e.stopImmediatePropagation(); phase -= (e.clientX-gesture.lastX)/180; gesture.lastX = e.clientX; schedule();
},{capture:true,passive:false});
window.addEventListener('mousemove',e => { if (canvas) e.stopImmediatePropagation(); },true);
window.addEventListener('pointerup',e => {
 if (!gesture || e.pointerId !== gesture.id) return;
 if (!gesture.active) { reset(); return; }
 phase -= (e.clientX-gesture.lastX)/180; e.preventDefault(); e.stopImmediatePropagation(); finish(false);
},{capture:true,passive:false});
window.addEventListener('wheel',e => { if (canvas) { e.preventDefault(); e.stopImmediatePropagation(); } else if (gesture) reset(); },{capture:true,passive:false});
window.addEventListener('click',e => { if (performance.now()<suppressClickUntil && e.detail!==0) { e.preventDefault(); e.stopImmediatePropagation(); } },true);
window.addEventListener('keydown',e => {
 if (e.key==='Escape' && (gesture || canvas)) { e.preventDefault(); if (closing) reset(); else cancel(); }
 else if (canvas && ['ArrowDown','ArrowUp','PageDown','PageUp','Home','End',' '].includes(e.key)) e.preventDefault();
},true);
window.addEventListener('pointercancel',cancel,true);
document.documentElement.addEventListener('lostpointercapture',e => { if (gesture?.active && e.target===document.documentElement) cancel(); });
window.addEventListener('resize',reset); window.addEventListener('blur',() => { if (!navigating) cancel(); });
document.addEventListener('visibilitychange',() => { if (document.hidden && !navigating) reset(); });
window.addEventListener('pagehide',reset);
window.addEventListener('pageshow',e => {
 if (e.persisted) { navigating = false; reset(); }
 try { if (sessionStorage.getItem('portfolio-deck-arrival')===url.pathname) { sessionStorage.removeItem('portfolio-deck-arrival'); window.scrollTo(0,0); } } catch {}
});
})();
