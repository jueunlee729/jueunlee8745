// Only the cosmetics inline content needs gesture arbitration. Fancybox keeps
// its existing groups, buttons and image-slide gestures; page-deck is untouched.
(() => {
    const wrapper = document.getElementById('cosmetics-portfolio');
    if (!wrapper) return;
    let gesture = null;
    let suppressClickUntil = 0;

    wrapper.addEventListener('wheel', event => event.stopPropagation(), { passive: true });
    wrapper.addEventListener('dragstart', event => event.preventDefault());
    wrapper.addEventListener('pointerdown', event => {
        if (!event.isPrimary || event.button !== 0 || event.target.closest('button, a')) return;
        gesture = { id: event.pointerId, x: event.clientX, y: event.clientY, axis: null };
    });
    wrapper.addEventListener('pointermove', event => {
        if (!gesture || gesture.id !== event.pointerId) return;
        const dx = event.clientX - gesture.x;
        const dy = event.clientY - gesture.y;
        if (!gesture.axis) {
            if (Math.max(Math.abs(dx), Math.abs(dy)) < 10) return;
            // Lock vertical intent for the entire gesture, including diagonals.
            if (Math.abs(dy) >= Math.abs(dx)) gesture.axis = 'vertical';
            else if (Math.abs(dx) > Math.abs(dy) * 1.35) {
                gesture.axis = 'horizontal';
                wrapper.setPointerCapture(event.pointerId);
            } else return;
        }
        if (gesture.axis === 'horizontal') {
            event.preventDefault();
            event.stopPropagation();
        }
    }, { passive: false });
    wrapper.addEventListener('pointerup', event => {
        if (!gesture || gesture.id !== event.pointerId) return;
        const current = gesture;
        gesture = null;
        if (wrapper.hasPointerCapture(event.pointerId)) wrapper.releasePointerCapture(event.pointerId);
        if (current.axis !== 'horizontal') return;
        suppressClickUntil = performance.now() + 400;
        const dx = event.clientX - current.x;
        const dy = event.clientY - current.y;
        if (Math.abs(dx) < 70 || Math.abs(dx) <= Math.abs(dy) * 1.35) return;
        const instance = window.Fancybox?.getInstance();
        if (instance?.getSlide()?.$content !== wrapper) return;
        if (dx < 0) instance.next();
        else instance.prev();
    });
    const cancel = () => { gesture = null; };
    wrapper.addEventListener('pointercancel', cancel);
    wrapper.addEventListener('lostpointercapture', event => {
        // Touch transfers implicit capture from the image to its scroll wrapper.
        // Ignore the image's bubbling loss during that transfer.
        if (event.target === wrapper) cancel();
    });
    wrapper.addEventListener('click', event => {
        if (performance.now() < suppressClickUntil) {
            event.preventDefault();
            event.stopImmediatePropagation();
        }
    }, true);
})();
