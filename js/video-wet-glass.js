// One cached rAF loop reveals each path behind its attached moving droplet head.
(() => {
    if (!document.body.classList.contains('demo-3') || document.querySelector('.video-wet-glass')) return;
    const anchor = document.querySelector('.morph-wrap.video-shadows');
    if (!anchor) return;
    const ns = 'http://www.w3.org/2000/svg';
    const svgNode = (tag, attrs) => {
        const node = document.createElementNS(ns, tag);
        Object.entries(attrs).forEach(([k, v]) => node.setAttribute(k, v));
        return node;
    };
    const layer = document.createElement('div');
    layer.className = 'video-wet-glass';
    layer.setAttribute('aria-hidden', 'true');
    // x%, y%, head width/height, trail width, movement seconds, rest seconds, drift, travel, phase seconds.
    const config = [
        [8, 15, 4, 7, .9, 17, 16, 3, 130, 8],
        [89, 23, 6, 10, 1.3, 24, 20, -4, 190, 34],
        [21, 55, 3.5, 6, .7, 14, 14, 2, 85, 2],
        [78, 51, 5, 8, 1.1, 21, 18, -3, 155, 13],
        [94, 8, 8, 13, 1.7, 32, 24, -6, 220, 46],
        [13, 35, 4.5, 7.5, 1, 19, 17, 4, 120, 25],
        [68, 69, 5.5, 9, 1.2, 27, 22, -2, 110, 18],
        [31, 7, 6.5, 11, 1.4, 28, 21, 5, 180, 43]
    ];
    const smooth = p => p * p * (3 - 2 * p);
    const curveX = (p, drift) => drift * smooth(p);
    const systems = config.map(([x, y, width, height, trailWidth, duration, rest, drift, travel, phase], i) => {
        const root = document.createElement('div');
        root.className = 'glass-drop';
        Object.entries({ '--drop-start-x': x + '%', '--drop-start-y': y + '%', '--drop-travel': travel + 'px', '--head-width': width + 'px', '--head-height': height + 'px', '--trail-width': trailWidth + 'px' }).forEach(([k, v]) => root.style.setProperty(k, v));
        const trail = svgNode('svg', { class: 'glass-trail', viewBox: `0 0 16 ${travel}`, preserveAspectRatio: 'none', focusable: 'false' });
        const defs = svgNode('defs', {}), id = 'glass-path-density-' + i;
        const gradient = svgNode('linearGradient', { id, gradientUnits: 'userSpaceOnUse', x1: 0, y1: 0, x2: 0, y2: travel });
        [[0, 0], [16, .03], [33, .08], [48, .04], [69, .12], [83, .09], [100, .18]].forEach(([offset, opacity]) => gradient.appendChild(svgNode('stop', { offset: offset + '%', 'stop-color': 'rgb(230, 240, 236)', 'stop-opacity': opacity })));
        defs.appendChild(gradient);
        trail.appendChild(defs);
        // The prebuilt curve and moving head share this exact coordinate function.
        const points = Array.from({ length: 41 }, (_, n) => {
            const p = n / 40;
            return (n ? 'L' : 'M') + (8 + curveX(p, drift)).toFixed(3) + ' ' + (p * travel).toFixed(3);
        }).join(' ');
        trail.appendChild(svgNode('path', { d: points, stroke: 'url(#' + id + ')' }));
        const head = document.createElement('span');
        head.className = 'glass-drop-head';
        root.appendChild(trail);
        root.appendChild(head);
        layer.appendChild(root);
        return { root, trail, head, duration, rest, drift, travel, phase };
    });
    for (let i = 1; i <= 3; i++) {
        const mark = document.createElement('span');
        mark.className = 'glass-moisture-mark glass-moisture-mark--' + i;
        layer.appendChild(mark);
    }
    const haze = document.createElement('div');
    haze.className = 'video-glass-haze';
    haze.setAttribute('aria-hidden', 'true');
    anchor.before(haze);
    anchor.after(layer);

    const reduced = matchMedia('(prefers-reduced-motion: reduce)');
    const mobile = matchMedia('(max-width: 50em)');
    let elapsed = 0, last = null, frame = null;
    const clamp = v => Math.max(0, Math.min(1, v));
    // Continuous speed: slow start, faster middle, a soft slowdown, then acceleration.
    const progressAt = p => p - .065 * Math.sin(2 * Math.PI * p) - .02 * Math.sin(4 * Math.PI * p);
    const draw = () => systems.forEach((s, i) => {
        if (mobile.matches && i >= 5) return;
        const fadeSeconds = 4.5;
        const age = (elapsed + s.phase) % (s.duration + fadeSeconds + s.rest);
        const progress = progressAt(clamp(age / s.duration));
        const after = Math.max(0, age - s.duration);
        const fade = clamp(after / fadeSeconds);
        const distance = s.travel * (mobile.matches ? .7 : 1);
        const y = progress * distance;
        const x = curveX(progress, s.drift);
        s.root.style.setProperty('--drop-travel', distance + 'px');
        s.head.style.transform = `translate(${x.toFixed(3)}px, ${y.toFixed(3)}px)`;
        s.head.style.opacity = clamp(age / 1.4) * (1 - clamp(after / 1.2));
        s.trail.style.clipPath = `inset(0 0 ${(100 * (1 - progress)).toFixed(3)}% 0)`;
        s.trail.style.opacity = (1 - fade) * clamp(age / 1.8);
        s.trail.style.setProperty('--dry-front', (12 + fade * 76) + '%');
    });
    // Draw one recognizable moisture state; previews never start the droplet loop.
    if (new URLSearchParams(location.search).get('swipe-preview') === '1') {
        draw();
        return;
    }
    const tick = time => {
        frame = null;
        if (reduced.matches || document.hidden) { last = null; return; }
        if (last !== null) elapsed += Math.min(80, time - last) / 1000;
        last = time;
        draw();
        frame = requestAnimationFrame(tick);
    };
    const sync = () => {
        if (frame !== null) cancelAnimationFrame(frame);
        frame = null;
        last = null;
        if (!reduced.matches && !document.hidden) { draw(); frame = requestAnimationFrame(tick); }
    };
    reduced.addEventListener('change', sync);
    document.addEventListener('visibilitychange', sync);
    mobile.addEventListener('change', draw);
    sync();
})();
