// Static, localized condensation. Clear glass occupies most of the viewport.
(() => {
    if (!document.body.classList.contains('demo-3') || document.querySelector('.video-glass-surface')) return;
    const water = document.querySelector('.video-wet-glass');
    if (!water) return;
    const ns = 'http://www.w3.org/2000/svg';
    const surface = document.createElement('div');
    surface.className = 'video-glass-surface';
    surface.setAttribute('aria-hidden', 'true');
    const film = document.createElement('span');
    film.className = 'video-glass-film';
    surface.appendChild(film);
    for (let i = 1; i <= 4; i++) {
        const smear = document.createElement('span');
        smear.className = 'video-glass-smear video-glass-smear--' + i;
        surface.appendChild(smear);
    }
    const texture = document.createElementNS(ns, 'svg');
    texture.setAttribute('class', 'video-glass-texture');
    texture.setAttribute('focusable', 'false');
    surface.appendChild(texture);
    const compact = matchMedia('(max-width: 50em)');
    // Fractional centers and bounds: six disconnected zones, never a tiled field.
    const zones = [
        [.055, .12, .09, .105, .85], [.94, .16, .075, .12, .7],
        [.075, .48, .07, .15, .8], [.93, .62, .065, .13, .6],
        [.18, .91, .135, .07, .75], [.79, .92, .12, .065, .65]
    ];
    const buildTexture = () => {
        const width = Math.max(1, window.innerWidth), height = Math.max(1, window.innerHeight);
        texture.setAttribute('viewBox', `0 0 ${width} ${height}`);
        let seed = 8745;
        const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
        const groups = zones.map(([cx, cy, rx, ry, strength], index) => {
            const group = document.createElementNS(ns, 'g');
            group.setAttribute('class', 'video-condensation-zone');
            group.setAttribute('opacity', strength);
            const cells = [[], [], []], rims = [];
            // Only tens of droplets per zone, with clear internal gaps and ragged edges.
            const count = compact.matches ? 42 : 78;
            for (let i = 0; i < count; i++) {
                const u = random() * 2 - 1, v = random() * 2 - 1;
                const angle = Math.atan2(v, u);
                const edge = .84 + .12 * Math.sin(angle * 3 + index) + .07 * Math.cos(angle * 5 - index);
                const radius = Math.hypot(u, v);
                if (radius > edge || Math.hypot(u - .23, v + .18) < .24 || random() > .86 - radius * .35) continue;
                const x = (cx + u * rx) * width, y = (cy + v * ry) * height;
                const sizeRoll = random();
                let diameter = sizeRoll < .63 ? 1 + random() : sizeRoll < .9 ? 2 + random() * 2 : 4 + random() * 3;
                // One rare larger mark per zone at most; it remains translucent.
                if (i === 0 && index === 2) diameter = 8 + random();
                const half = diameter / 2, vertical = half * (1.04 + random() * .22);
                const bucket = sizeRoll < .63 ? 0 : sizeRoll < .9 ? 1 : 2;
                const f = n => n.toFixed(2);
                cells[bucket].push(`M${f(x-half)} ${f(y)}a${f(half)} ${f(vertical)} 0 1 0 ${f(diameter)} 0a${f(half)} ${f(vertical)} 0 1 0 ${f(-diameter)} 0Z`);
                if (diameter > 3) rims.push(`M${f(x-half*.6)} ${f(y+vertical*.5)}Q${f(x)} ${f(y+vertical)} ${f(x+half*.6)} ${f(y+vertical*.5)}`);
            }
            cells.forEach((d, i) => {
                const path = document.createElementNS(ns, 'path');
                path.setAttribute('class', 'video-glass-moisture video-glass-moisture--' + ['fine', 'medium', 'dense'][i]);
                path.setAttribute('d', d.join(' '));
                group.appendChild(path);
            });
            const rim = document.createElementNS(ns, 'path');
            rim.setAttribute('class', 'video-glass-micro-rim');
            rim.setAttribute('d', rims.join(' '));
            group.appendChild(rim);
            return group;
        });
        texture.replaceChildren(...groups);
    };
    buildTexture();
    compact.addEventListener('change', buildTexture);
    // Rebuild only after viewport resizing settles; there is no texture animation loop.
    let resizeTimer;
    window.addEventListener('resize', () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(buildTexture, 150); }, { passive: true });
    const reflection = document.createElement('span');
    reflection.className = 'video-glass-reflection';
    surface.appendChild(reflection);
    water.before(surface);
})();
