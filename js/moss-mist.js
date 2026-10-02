// Web/App background only. CSS idle sway and JS gusts use separate wrappers.
(() => {
    const background = document.querySelector('.morph-wrap');
    if (!background || background.classList.contains('moss-mist')) return;
    const ns = 'http://www.w3.org/2000/svg';
    const shapes = [
        'M34 400Q44 210 12 38Q55 175 39 400Z M54 400Q71 185 109 0Q86 229 60 400Z M77 400Q91 262 146 130Q107 295 83 400Z',
        'M28 400Q51 252 4 76Q66 210 33 400Z M55 400Q62 170 88 15Q81 207 61 400Z M83 400Q106 301 141 177Q121 324 89 400Z',
        'M24 400Q37 219 40 52Q51 211 30 400Z M57 400Q80 194 131 21Q99 237 63 400Z M89 400Q98 279 145 146Q113 300 95 400Z',
        'M26 400Q38 222 5 12Q58 204 32 400Z M58 400Q74 231 102 63Q88 243 64 400Z M87 400Q102 299 147 191Q119 327 93 400Z',
        'M29 400Q18 281 3 167Q34 283 35 400Z M62 400Q48 199 75 0Q61 231 68 400Z M94 400Q103 210 143 82Q118 247 100 400Z',
        'M22 400Q43 309 10 177Q55 303 28 400Z M54 400Q77 206 118 32Q93 246 60 400Z M86 400Q91 276 145 117Q110 305 92 400Z',
        'M30 400Q16 229 4 97Q35 234 36 400Z M66 400Q47 170 98 24Q63 216 72 400Z M103 400Q108 284 148 164Q124 315 109 400Z',
        'M25 400Q48 237 16 45Q65 221 31 400Z M63 400Q72 194 123 3Q93 247 69 400Z M97 400Q108 299 145 181Q121 319 103 400Z',
        'M21 400Q10 271 3 140Q28 276 27 400Z M55 400Q42 184 81 12Q60 212 61 400Z M87 400Q94 238 137 63Q110 276 93 400Z'
    ];
    const depths = ['foreground', 'background', 'midground', 'foreground', 'background', 'midground', 'background', 'midground', 'foreground'];
    const sensitivities = [1, .55, .76, .91, .61, .83, .67, .72, .96];
    const field = document.createElement('div');
    field.className = 'moss-plant-field';
    const plants = shapes.map((shape, i) => {
        const wrapper = document.createElement('div');
        wrapper.className = 'moss-plant moss-plant--' + depths[i] + ' moss-plant--' + (i + 1);
        const idle = document.createElement('div');
        idle.className = 'moss-idle-sway';
        const wind = document.createElement('div');
        wind.className = 'moss-wind-reactive';
        const svg = document.createElementNS(ns, 'svg');
        svg.setAttribute('viewBox', '0 0 150 400');
        svg.setAttribute('preserveAspectRatio', 'none');
        svg.setAttribute('aria-hidden', 'true');
        svg.setAttribute('focusable', 'false');
        const path = document.createElementNS(ns, 'path');
        path.setAttribute('d', shape);
        svg.appendChild(path);
        wind.appendChild(svg);
        idle.appendChild(wind);
        wrapper.appendChild(idle);
        field.appendChild(wrapper);
        return { wrapper, wind, height: 400, response: depths[i] === 'background' ? .08 : depths[i] === 'foreground' ? .12 : .10, sensitivity: sensitivities[i], side: [0, 1, 2, 5, 7].includes(i) ? 'left' : 'right', mouse: 0, scroll: 0, currentMouse: 0, currentScroll: 0 };
    });
    const elements = [field];
    for (let i = 1; i <= 3; i++) {
        const mist = document.createElement('span');
        mist.className = 'moss-mist-layer moss-mist-layer--' + i;
        elements.push(mist);
    }
    background.classList.add('moss-mist');
    background.setAttribute('aria-hidden', 'true');
    background.replaceChildren(...elements);

    const reduced = matchMedia('(prefers-reduced-motion: reduce)');
    const compact = matchMedia('(max-width: 50em)');
    const fine = matchMedia('(pointer: fine)');
    const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
    let viewportWidth = innerWidth;
    // Measure only on initialization/resize; shear keeps each rooted base fixed.
    const sizePlants = () => {
        viewportWidth = innerWidth;
        plants.forEach(p => {
            p.height = Math.max(1, p.wrapper.offsetHeight);
            const style = getComputedStyle(p.wrapper);
            const left = parseFloat(style.getPropertyValue('--sway-left')) || 3;
            const right = parseFloat(style.getPropertyValue('--sway-right')) || 4;
            p.wrapper.style.setProperty('--idle-skew-left', Math.atan(left / p.height) * 180 / Math.PI + 'deg');
            p.wrapper.style.setProperty('--idle-skew-right', Math.atan(-right / p.height) * 180 / Math.PI + 'deg');
        });
    };
    sizePlants();
    // Static preview: retain plant/mist shapes but create no wind listeners or rAF loop.
    if (new URLSearchParams(location.search).get('swipe-preview') === '1') return;
    let previousMouseX = null, previousMouseTime = 0;
    let previousScrollY = scrollY, previousScrollTime = performance.now();
    let frame = null, lastFrame = 0;
    const reset = () => {
        if (frame !== null) cancelAnimationFrame(frame);
        frame = null;
        previousMouseX = null;
        previousScrollY = scrollY;
        previousScrollTime = performance.now();
        plants.forEach(p => {
            p.mouse = p.scroll = p.currentMouse = p.currentScroll = 0;
            p.wind.style.transform = '';
        });
    };
    const update = time => {
        const dt = Math.min(50, Math.max(1, time - lastFrame));
        lastFrame = time;
        // Idle CSS never pauses or restarts; the independent gust layer dissolves over it.
        // Individual depth response remains within lerp .08 to .12.
        const mouseDecay = Math.exp(-dt / 155);
        const scrollDecay = Math.exp(-dt / 180);
        let active = false;
        plants.forEach(p => {
            const lerp = 1 - Math.pow(1 - p.response, dt / (1000 / 60));
            p.currentMouse += (p.mouse - p.currentMouse) * lerp;
            p.currentScroll += (p.scroll - p.currentScroll) * lerp;
            p.mouse *= mouseDecay;
            p.scroll *= scrollDecay;
            const rotation = clamp(p.currentMouse * 4 + p.currentScroll * 3, -5, 5);
            const x = clamp(p.currentMouse * 8 + p.currentScroll * 6, -10, 10);
            p.wind.style.transform = `skewX(${(Math.atan(-x / p.height) * 180 / Math.PI).toFixed(4)}deg) rotate(${rotation.toFixed(3)}deg)`;
            active ||= Math.max(Math.abs(p.mouse), Math.abs(p.scroll), Math.abs(p.currentMouse), Math.abs(p.currentScroll)) > .00005;
        });
        frame = active ? requestAnimationFrame(update) : null;
        if (!active) plants.forEach(p => { p.wind.style.transform = ''; });
    };
    const wake = () => {
        if (frame !== null || reduced.matches) return;
        lastFrame = performance.now();
        frame = requestAnimationFrame(update);
    };
    window.addEventListener('pointermove', event => {
        if (reduced.matches || compact.matches || !fine.matches || event.pointerType !== 'mouse') return;
        const time = performance.now();
        if (previousMouseX !== null && time - previousMouseTime < 160) {
            const deltaX = event.clientX - previousMouseX;
            const velocity = deltaX / Math.max(8, time - previousMouseTime);
            const force = clamp(velocity / 1.8, -1, 1);
            plants.forEach(p => {
                // Cursor location weights proximity only; movement velocity supplies direction.
                const anchor = p.side === 'left' ? 0 : viewportWidth;
                const proximity = Math.exp(-Math.abs(event.clientX - anchor) / Math.max(1, viewportWidth * .35));
                p.mouse = force * p.sensitivity * proximity;
            });
            wake();
        }
        previousMouseX = event.clientX;
        previousMouseTime = time;
    }, { passive: true });
    window.addEventListener('scroll', () => {
        const time = performance.now();
        const deltaY = scrollY - previousScrollY;
        const velocity = deltaY / Math.max(16, time - previousScrollTime);
        previousScrollY = scrollY;
        previousScrollTime = time;
        if (reduced.matches) return;
        const force = clamp(velocity / 2.4, -1, 1) * (compact.matches ? .3 : 1);
        plants.forEach(p => { p.scroll = force * p.sensitivity; });
        wake();
    }, { passive: true });
    window.addEventListener('resize', sizePlants, { passive: true });
    reduced.addEventListener('change', reset);
    compact.addEventListener('change', reset);
    fine.addEventListener('change', reset);
    document.addEventListener('visibilitychange', () => { if (document.hidden) reset(); });
})();
