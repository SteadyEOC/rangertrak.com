/*
 * RangerTrak public site - image pop-up (lightbox).
 *
 * Dependency-free. Intercepts a plain <a href="img/x.png"><img ...></a> link (the site's
 * usual pattern for "click a screenshot to see it full size") and shows the image in a
 * centred <dialog> instead of navigating the browser to the bare file.
 *
 * Deliberately narrow:
 *   - Only links whose href ends in .png/.jpg/.jpeg/.webp/.svg are intercepted.
 *   - A modified click (middle-click, ctrl/cmd/shift/alt-click) is left alone, so "open
 *     image in new tab" keeps working exactly as before.
 *   - Esc and a click on the backdrop close it. Focus goes to the close button on open and
 *     back to the link that opened it on close, so keyboard use stays sane.
 */
(function () {
  'use strict';

  var IMAGE_RE = /\.(png|jpe?g|webp|svg)$/i;

  var dialogEl = null;
  var imgEl = null;
  var captionEl = null;
  var closeBtn = null;
  var lastTrigger = null;

  function buildDialog() {
    if (dialogEl) { return; }

    dialogEl = document.createElement('dialog');
    dialogEl.className = 'lightbox-dialog';

    closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'lightbox-close';
    closeBtn.setAttribute('aria-label', 'Close');
    closeBtn.innerHTML =
      '<svg width="18" height="18" viewBox="0 0 16 16" aria-hidden="true">' +
      '<path d="M2 2 L14 14 M14 2 L2 14" stroke="currentColor" stroke-width="2" ' +
      'stroke-linecap="round" fill="none"/></svg>';
    closeBtn.addEventListener('click', close);

    imgEl = document.createElement('img');
    captionEl = document.createElement('p');
    captionEl.className = 'lightbox-caption';

    var figure = document.createElement('div');
    figure.className = 'lightbox-figure';
    figure.appendChild(imgEl);
    figure.appendChild(captionEl);

    dialogEl.appendChild(closeBtn);
    dialogEl.appendChild(figure);
    document.body.appendChild(dialogEl);

    // A click that lands on the backdrop (the ::backdrop pseudo-element isn't a real
    // target, so this checks for a click that hits the <dialog> itself, outside the
    // figure) closes it, same as Esc.
    dialogEl.addEventListener('click', function (event) {
      if (event.target === dialogEl) { close(); }
    });

    dialogEl.addEventListener('cancel', function (event) {
      // <dialog> already closes itself on Esc; just keep our own state tidy.
      event.preventDefault();
      close();
    });
  }

  function open(href, alt) {
    buildDialog();
    imgEl.src = href;
    imgEl.alt = '';
    captionEl.textContent = alt || '';
    captionEl.hidden = !alt;
    dialogEl.setAttribute('aria-label', alt || 'Image');
    if (typeof dialogEl.showModal === 'function') {
      dialogEl.showModal();
    } else {
      dialogEl.setAttribute('open', '');
    }
    closeBtn.focus();
  }

  function close() {
    if (!dialogEl) { return; }
    if (typeof dialogEl.close === 'function' && dialogEl.open) {
      dialogEl.close();
    } else {
      dialogEl.removeAttribute('open');
    }
    imgEl.removeAttribute('src');
    if (lastTrigger && typeof lastTrigger.focus === 'function') {
      lastTrigger.focus();
    }
    lastTrigger = null;
  }

  document.addEventListener('click', function (event) {
    // Leave modified clicks alone - the browser's own "new tab" / "new window" behaviour
    // must keep working.
    if (event.defaultPrevented || event.button !== 0 ||
        event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
      return;
    }

    var link = event.target.closest ? event.target.closest('a') : null;
    if (!link || !link.href) { return; }

    var url;
    try {
      url = new URL(link.href, document.baseURI);
    } catch (err) {
      return;
    }
    if (!IMAGE_RE.test(url.pathname)) { return; }

    // Only for the "click a screenshot to see it full size" pattern: the link's whole
    // content is a single image.
    var img = link.querySelector('img');
    if (!img || link.children.length !== 1) { return; }

    event.preventDefault();
    lastTrigger = link;
    open(link.href, img.getAttribute('alt'));
  });
})();
