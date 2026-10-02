// Independent static surface: procedural rounded moisture cells, never random-noise filters.
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
    for (let i = 1; i <= 6; i++) {
        const smear = document.createElement('span');
        smear.className = 'video-glass-smear video-glass-smear--' + i;
        surface.appendChild(smear);
    }
    const texture = document.createElementNS(ns, 'svg');
    texture.setAttribute('class', 'video-glass-texture');
    texture.setAttribute('viewBox', '0 0 1440 900');
    texture.setAttribute('preserveAspectRatio', 'xMidYMid slice');
    texture.setAttribute('focusable', 'false');
    surface.appendChild(texture);
    const compact = matchMedia('(max-width: 50em)');
    const buildTexture = () => {
        let seed = 8745;
        const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
        const cells = [[], [], []], rims = [];
        const count = compact.matches ? 9600 : 16000;
        for (let i = 0; i < count; i++) {
            const x = random() * 1440, y = random() * 900;
            // Broad damp regions vary bead size/density without a tiled or gridded pattern.
            const damp = .5 + .25 * Math.sin(x / 213 + y / 271) + .2 * Math.cos(y / 173 - x / 307);
            if (random() > .55 + damp * .4) continue;
            const rx = .35 + random() * (.7 + damp * .65);
            const ry = rx * (.85 + random() * .6);
            const bucket = damp > .72 ? 2 : damp > .4 ? 1 : 0;
            const f = v => v.toFixed(2);
            cells[bucket].push(`M${f(x-rx)} ${f(y)}a${f(rx)} ${f(ry)} 0 1 0 ${f(rx*2)} 0a${f(rx)} ${f(ry)} 0 1 0 ${f(-rx*2)} 0Z`);
            if (rx > 1.1) rims.push(`M${f(x-rx*.7)} ${f(y+ry*.45)}Q${f(x)} ${f(y+ry*1.08)} ${f(x+rx*.7)} ${f(y+ry*.45)}`);
        }
        const paths = cells.map((d, i) => {
            const path = document.createElementNS(ns, 'path');
            path.setAttribute('class', 'video-glass-moisture video-glass-moisture--' + ['fine','medium','dense'][i]);
            path.setAttribute('d', d.join(' '));
            return path;
        });
        const rim = document.createElementNS(ns, 'path');
        rim.setAttribute('class', 'video-glass-micro-rim');
        rim.setAttribute('d', rims.join(' '));
        texture.replaceChildren(...paths, rim);
    };
    buildTexture();
    compact.addEventListener('change', buildTexture);
    const reflection = document.createElement('span');
    reflection.className = 'video-glass-reflection';
    surface.appendChild(reflection);
    water.before(surface);
})();
