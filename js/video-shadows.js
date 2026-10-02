// Build the Video-only decorative background once; CSS supplies quiet idle motion.
(() => {
    if (!document.body.classList.contains('demo-3')) return;
    const background = document.querySelector('.morph-wrap');
    if (!background || background.classList.contains('video-shadows')) return;
    const ns = 'http://www.w3.org/2000/svg';
    const blades = [
        'M28 400Q45 230 9 40Q62 214 34 400Z M60 400Q70 195 110 7Q87 243 66 400Z M88 400Q104 289 144 155Q119 324 94 400Z',
        'M20 400Q35 220 33 12Q49 229 26 400Z M57 400Q79 196 134 51Q97 235 63 400Z M89 400Q99 310 144 210Q113 328 95 400Z',
        'M25 400Q34 315 5 182Q52 305 31 400Z M56 400Q63 225 96 22Q82 254 62 400Z M87 400Q104 286 142 133Q119 329 93 400Z',
        'M27 400Q13 233 6 73Q34 242 33 400Z M61 400Q47 188 82 0Q62 230 67 400Z M95 400Q108 273 145 123Q121 316 101 400Z',
        'M22 400Q37 259 11 109Q50 241 28 400Z M58 400Q48 208 95 34Q66 238 64 400Z M91 400Q104 244 146 17Q120 282 97 400Z',
        'M23 400Q13 272 2 175Q32 286 29 400Z M58 400Q75 210 110 57Q92 252 64 400Z M89 400Q95 315 140 205Q111 337 95 400Z'
    ];
    const depths = ['foreground', 'midground', 'background', 'foreground', 'midground', 'background'];
    const groups = blades.map((d, i) => {
        const group = document.createElement('div');
        group.className = 'video-shadow video-shadow--' + depths[i] + ' video-shadow--' + (i + 1);
        const svg = document.createElementNS(ns, 'svg');
        svg.setAttribute('viewBox', '0 0 150 400');
        svg.setAttribute('preserveAspectRatio', 'none');
        svg.setAttribute('aria-hidden', 'true');
        svg.setAttribute('focusable', 'false');
        const path = document.createElementNS(ns, 'path');
        path.setAttribute('d', d);
        svg.appendChild(path);
        group.appendChild(svg);
        return group;
    });
    background.classList.add('video-shadows');
    background.setAttribute('aria-hidden', 'true');
    background.replaceChildren(...groups);
})();
