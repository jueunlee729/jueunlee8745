// Shared enhancement for three separate documents. No background animation is rewritten.
(() => {
    'use strict';
    const order = ['index2.html', 'index.html', 'index3.html'];
    const url = new URL(location.href);
    const file = url.pathname.split('/').pop() || 'index.html';
    const pageIndex = order.indexOf(file);
    const main = document.querySelector('main');
    if (!main || pageIndex < 0) return;
    if (url.searchParams.get('swipe-preview') === '1') {
        document.body.classList.add('is-swipe-preview');
        window.scrollTo(0, 0);
        window.addEventListener('load', () => window.scrollTo(0, 0), { once: true });
        return; // Never construct previews or gesture listeners inside a preview.
    }
    if (document.documentElement.classList.contains('page-swipe-enabled')) return;
    document.documentElement.classList.add('page-swipe-enabled');
    const reduced = matchMedia('(prefers-reduced-motion: reduce)');
    const excluded = [
        'a', 'button', 'input', 'textarea', 'select', 'label', 'iframe', 'video', 'audio',
        'img', '[data-fancybox]', '[role="button"]', '[contenteditable]',
        '.content__img', '.content__link', '.content--layout', '.demos', '.codrops-links', '.pater',
        '#popup', '#openPopup', '#closePopup', '.modal', '[role="dialog"]', 'dialog',
        '.fancybox__container', '.fancybox-container', '[data-swipe-ignore]',
        '.content__title', '.content__subtitle', '.content__desc', '.codrops-header', '.content__info'
    ].join(',');
    const nextFile = direction => order[(pageIndex + (direction < 0 ? 1 : -1) + order.length) % order.length];
    const stage = document.createElement('div');
    stage.className = 'page-swipe-preview-stage';
    stage.setAttribute('aria-hidden', 'true');
    stage.inert = true;
    document.body.appendChild(stage);
    const previews = new Map();
    let gesture = null, canvas = null, placeholder = null, savedMainStyle = null;
    let currentPreview = null, frame = null, settleTimer = null, settling = false;
    let savedScrollX = 0, savedScrollY = 0, suppressClickUntil = 0;
    let navigating = false;

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
        if (blockedByModal && (gesture || settling)) reset();
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
    const previewFor = target => {
        if (previews.has(target)) return previews.get(target);
        const iframe = document.createElement('iframe');
        iframe.className = 'page-swipe-preview';
        iframe.title = 'Adjacent portfolio page preview';
        iframe.tabIndex = -1;
        iframe.setAttribute('aria-hidden', 'true');
        iframe.inert = true;
        const destination = new URL(target, url);
        destination.searchParams.set('swipe-preview', '1');
        iframe.src = destination.href;
        stage.appendChild(iframe);
        previews.set(target, iframe);
        return iframe;
    };
    // Two cached neighbors, only one visible. Staggered preparation limits startup work.
    let preloadTimer = null;
    const prepare = () => {
        previewFor(nextFile(-1));
        preloadTimer = setTimeout(() => previewFor(nextFile(1)), 600);
    };
    if (document.readyState === 'complete') prepare();
    else window.addEventListener('load', prepare, { once: true });

    const selectPreview = direction => {
        const target = nextFile(direction);
        const preview = previewFor(target);
        if (currentPreview !== preview) {
            if (currentPreview) currentPreview.classList.remove('is-current-preview');
            currentPreview = preview;
            preview.classList.add('is-current-preview');
        }
        return target;
    };
    const mountCanvas = () => {
        savedScrollX = window.scrollX;
        savedScrollY = window.scrollY;
        const rect = main.getBoundingClientRect();
        savedMainStyle = main.getAttribute('style');
        placeholder = document.createElement('div');
        placeholder.className = 'page-swipe-placeholder';
        placeholder.style.height = main.offsetHeight + 'px';
        main.before(placeholder);
        canvas = document.createElement('div');
        canvas.className = 'page-swipe-canvas';
        const background = getComputedStyle(document.body);
        canvas.style.backgroundColor = background.backgroundColor;
        canvas.style.backgroundImage = background.backgroundImage;
        canvas.style.backgroundSize = background.backgroundSize;
        canvas.style.backgroundPosition = background.backgroundPosition;
        canvas.style.backgroundRepeat = background.backgroundRepeat;
        main.style.position = 'absolute';
        main.style.top = rect.top + 'px';
        main.style.left = rect.left + 'px';
        main.style.width = rect.width + 'px';
        canvas.appendChild(main);
        document.body.appendChild(canvas);
        document.body.classList.add('is-page-swiping');
        stage.classList.add('is-visible');
    };
    const draw = () => {
        frame = null;
        if (!canvas || !gesture || gesture.mode !== 'horizontal') return;
        const x = gesture.dx;
        const direction = x === 0 ? gesture.direction : Math.sign(x);
        gesture.direction = direction;
        gesture.target = selectPreview(direction);
        canvas.style.transform = `translate3d(${x}px, 0, 0)`;
        const progress = Math.min(1, Math.abs(x) / gesture.width);
        const parallax = -direction * gesture.width * .15 * (1 - progress);
        currentPreview.style.transform = `translate3d(${parallax}px, 0, 0) scale(${.985 + progress * .015})`;
        currentPreview.style.opacity = .75 + progress * .25;
    };
    const releaseCapture = pointerId => {
        const root = document.documentElement;
        if (pointerId !== undefined && root.hasPointerCapture(pointerId)) root.releasePointerCapture(pointerId);
    };
    const reset = () => {
        if (frame !== null) cancelAnimationFrame(frame);
        frame = null;
        clearTimeout(settleTimer);
        settleTimer = null;
        const pointerId = gesture && gesture.pointerId;
        gesture = null;
        settling = false;
        if (canvas) {
            placeholder.replaceWith(main);
            if (savedMainStyle === null) main.removeAttribute('style');
            else main.setAttribute('style', savedMainStyle);
            canvas.remove();
            canvas = placeholder = null;
            window.scrollTo(savedScrollX, savedScrollY);
        }
        document.body.classList.remove('is-page-swiping');
        stage.classList.remove('is-visible');
        if (currentPreview) {
            currentPreview.classList.remove('is-current-preview');
            currentPreview.style.transition = '';
            currentPreview.style.transform = '';
            currentPreview.style.opacity = '';
            currentPreview = null;
        }
        releaseCapture(pointerId);
    };
    const settle = accepted => {
        if (!gesture || !canvas) { reset(); return; }
        if (frame !== null) { cancelAnimationFrame(frame); frame = null; }
        draw();
        const direction = Math.sign(gesture.dx) || gesture.direction;
        const target = gesture.target;
        const duration = reduced.matches ? 60 : accepted ? 550 : 360;
        const easing = 'cubic-bezier(0.22, 1, 0.36, 1)';
        const pointerId = gesture.pointerId;
        settling = true;
        gesture = null;
        releaseCapture(pointerId);
        // Flush only once at release, not on drag frames.
        void canvas.offsetWidth;
        canvas.style.transition = `transform ${duration}ms ${easing}`;
        currentPreview.style.transition = `transform ${duration}ms ${easing}, opacity ${duration}ms ${easing}`;
        canvas.style.transform = `translate3d(${accepted ? direction * window.innerWidth : 0}px, 0, 0)`;
        currentPreview.style.transform = accepted ? 'translate3d(0, 0, 0) scale(1)' : `translate3d(${-direction * window.innerWidth * .15}px, 0, 0) scale(.985)`;
        currentPreview.style.opacity = accepted ? '1' : '.75';
        settleTimer = setTimeout(() => {
            if (modalOpen()) { reset(); return; }
            if (!accepted) { reset(); return; }
            // One-shot flag affects swipe arrivals only, preserving ordinary history restores.
            try { sessionStorage.setItem('portfolio-swipe-arrival', new URL(target, url).pathname); } catch {}
            navigating = true;
            window.location.assign(new URL(target, url).href);
        }, duration + 20);
    };
    window.addEventListener('pointerdown', event => {
        if (gesture && event.pointerId !== gesture.pointerId) { reset(); return; }
        if (settling || event.isPrimary === false || (event.pointerType === 'mouse' && event.button !== 0)) return;
        blockedByModal = modalOpen(); // Read visibility once at the gesture boundary.
        if (document.body.classList.contains('loading') || blockedByModal || !(event.target instanceof Element) || event.target.closest(excluded)) return;
        gesture = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, dx: 0, width: window.innerWidth, mode: 'pending', direction: -1, samples: [{ x: event.clientX, t: performance.now() }] };
    }, { capture: true, passive: true });
    window.addEventListener('pointermove', event => {
        if (settling && canvas) { event.stopImmediatePropagation(); return; }
        if (!gesture || event.pointerId !== gesture.pointerId || settling) return;
        if (blockedByModal) { reset(); return; }
        const dx = event.clientX - gesture.startX;
        const dy = event.clientY - gesture.startY;
        if (gesture.mode === 'pending') {
            if (Math.max(Math.abs(dx), Math.abs(dy)) < 12) return;
            if (Math.abs(dy) > Math.abs(dx)) gesture.mode = 'vertical';
            else if (Math.abs(dx) > Math.abs(dy) * 1.35) {
                gesture.mode = 'horizontal';
                document.documentElement.setPointerCapture(event.pointerId);
                mountCanvas();
            } else return;
        }
        if (gesture.mode !== 'horizontal') return;
        event.preventDefault();
        event.stopImmediatePropagation(); // Suppresses existing mouse-wind input only during page drag.
        gesture.dx = Math.max(-gesture.width, Math.min(gesture.width, dx));
        const now = performance.now();
        gesture.samples.push({ x: event.clientX, t: now });
        gesture.samples = gesture.samples.filter(sample => now - sample.t <= 120);
        if (frame === null) frame = requestAnimationFrame(draw);
    }, { capture: true, passive: false });
    window.addEventListener('pointerup', event => {
        if (!gesture || event.pointerId !== gesture.pointerId) return;
        if (gesture.mode !== 'horizontal') { reset(); return; }
        event.preventDefault();
        event.stopImmediatePropagation();
        suppressClickUntil = performance.now() + 400;
        const dx = event.clientX - gesture.startX;
        gesture.dx = Math.max(-gesture.width, Math.min(gesture.width, dx));
        const now = performance.now();
        const samples = gesture.samples.filter(sample => now - sample.t <= 120);
        const first = samples[0];
        const velocity = first ? (event.clientX - first.x) / Math.max(1, now - first.t) : 0;
        const accepted = Math.abs(dx) >= gesture.width * .18 || (Math.abs(dx) >= 55 && Math.abs(velocity) >= .58 && Math.sign(velocity) === Math.sign(dx));
        settle(accepted && !modalOpen());
    }, { capture: true, passive: false });
    window.addEventListener('click', event => {
        if (performance.now() < suppressClickUntil && event.detail !== 0) {
            event.preventDefault();
            event.stopImmediatePropagation();
            suppressClickUntil = 0;
        }
    }, true);
    window.addEventListener('pointercancel', event => { if (gesture && event.pointerId === gesture.pointerId) reset(); }, true);
    document.documentElement.addEventListener('lostpointercapture', event => {
        // Touch transfers implicit capture from the starting element to the root.
        // Its bubbling lost-capture event must not cancel the new root capture.
        if (event.target === document.documentElement && gesture && event.pointerId === gesture.pointerId) reset();
    });
    window.addEventListener('resize', reset);
    window.addEventListener('blur', () => { if (!navigating) reset(); });
    document.addEventListener('visibilitychange', () => { if (document.hidden && !navigating) reset(); });
    window.addEventListener('pagehide', () => { clearTimeout(preloadTimer); reset(); });
    window.addEventListener('pageshow', event => {
        if (event.persisted) { navigating = false; reset(); }
        try {
            if (sessionStorage.getItem('portfolio-swipe-arrival') === url.pathname) {
                sessionStorage.removeItem('portfolio-swipe-arrival');
                window.scrollTo(0, 0);
            }
        } catch {}
    });
})();
