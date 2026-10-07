(() => {
    const wrapper = document.querySelector('.about-intro');
    if (!wrapper) return;
    const center = wrapper.querySelector('.about-intro__center');
    const cards = wrapper.querySelector('.about-intro__cards');
    const reset = () => {
        wrapper.classList.remove('is-open');
        center.setAttribute('aria-expanded', 'false');
        center.setAttribute('aria-label', '자기소개 정보 펼치기');
        cards.setAttribute('aria-hidden', 'true');
        cards.inert = true;
        wrapper.scrollTop = 0;
    };
    center.addEventListener('click', () => {
        const open = wrapper.classList.toggle('is-open');
        center.setAttribute('aria-expanded', String(open));
        center.setAttribute('aria-label', open ? '자기소개 정보 접기' : '자기소개 정보 펼치기');
        cards.setAttribute('aria-hidden', String(!open));
        cards.inert = !open;
    });
    // Only this inline detail blocks Fancybox's drag handling. Native pan-y remains available.
    for (const type of ['pointerdown', 'pointermove', 'pointerup', 'touchstart', 'touchmove', 'touchend']) {
        wrapper.addEventListener(type, event => event.stopPropagation(), { passive: true });
    }
    wrapper.addEventListener('dragstart', event => event.preventDefault());
    wrapper.addEventListener('wheel', event => event.stopPropagation(), { passive: true });
    new MutationObserver(() => {
        if (wrapper.style.display === 'none') reset();
    }).observe(wrapper, { attributes: true, attributeFilter: ['style'] });
})();
