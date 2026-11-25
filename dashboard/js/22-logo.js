// ---- animated logo (Rive). The emoji stays as the fallback if the runtime or the file cannot load. ----
(function foxLogo() {
  const holders = [...document.querySelectorAll('.logo[data-fox]')];
  const tag = document.createElement('script');
  tag.src = '/vendor/rive.js';
  tag.onerror = () => {};
  tag.onload = () => {
    try {
      window.rive.RuntimeLoader.setWasmUrl('/vendor/rive.wasm');
      window.__fox = fox.list;
      holders.forEach((h) => {
        // the artboard has padding around the fox, so draw it larger than its slot and pull the margins back in
        const size = Number(h.dataset.fox), box = Math.round(size * 1.5), pad = Math.round((box - size) / 2), dpr = Math.min(3, window.devicePixelRatio || 1);
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = Math.round(box * dpr); canvas.style.cssText = `width:${box}px;height:${box}px;margin:-${pad}px`;
        canvas.className = 'loop';
        h.appendChild(canvas);
        const r = new window.rive.Rive({
          src: '/vendor/foxy-loading.riv', canvas, autoplay: true,
          layout: new window.rive.Layout({ fit: window.rive.Fit.Contain }),
          onLoad: () => { h.classList.add('fox-on'); fox.set(!(fox.reduced || paused)); },
          onLoadError: () => canvas.remove(),
        });
        window.__fox.push(r);
        // the straight-ahead pose is the artboard before any animation has run, so this copy is loaded and never played
        const still = canvas.cloneNode(false); still.className = 'still'; still.width = canvas.width; still.height = canvas.height;
        h.appendChild(still);
        new window.rive.Rive({
          src: '/vendor/foxy-loading.riv', canvas: still, autoplay: false, stateMachines: 'State Machine 1',
          layout: new window.rive.Layout({ fit: window.rive.Fit.Contain }),
          onLoad: () => h.classList.add('still-ok'),
          onLoadError: () => still.remove(),
        });
      });
    } catch {}
  };
  document.head.appendChild(tag);
})();
