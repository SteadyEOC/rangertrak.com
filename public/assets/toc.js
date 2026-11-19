// Field Guide: highlights the table-of-contents entry for the section being read.
// Moved out of field-guide.html on 2026-10-05 so the Content-Security-Policy in public/_headers
// can refuse inline scripts. Loaded at the end of the body, not deferred, as before.
// Highlights the TOC entry for the section you are actually reading. Plain JS with
// no build step, matching feedback.html and the rest of this static site.
(function () {
  var links = Array.prototype.slice.call(document.querySelectorAll('.toc a'));
  if (!links.length) { return; }

  var headings = links
    .map(function (link) { return document.getElementById(link.getAttribute('href').slice(1)); })
    .filter(Boolean);
  if (!headings.length) { return; }

  // Deliberately a scan rather than IntersectionObserver. "Which section am I in"
  // is not the same question as "which heading is on screen": these sections range
  // from a short paragraph to several screens, so observing heading visibility
  // would leave long sections with nothing highlighted at all.
  var MARKER = 120;
  var current = null;

  function update() {
    var active = headings[0];
    for (var i = 0; i < headings.length; i++) {
      if (headings[i].getBoundingClientRect().top <= MARKER) { active = headings[i]; }
    }

    // The last section is short enough that it can never reach the marker line;
    // without this, scrolling to the very bottom leaves the previous one lit.
    if (window.innerHeight + window.pageYOffset >= document.documentElement.scrollHeight - 2) {
      active = headings[headings.length - 1];
    }

    if (active === current) { return; }
    current = active;
    for (var j = 0; j < links.length; j++) {
      if (links[j].getAttribute('href') === '#' + active.id) {
        links[j].setAttribute('aria-current', 'true');
      } else {
        links[j].removeAttribute('aria-current');
      }
    }
  }

  var queued = false;
  function onScroll() {
    if (queued) { return; }
    queued = true;
    window.requestAnimationFrame(function () { queued = false; update(); });
  }

  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll, { passive: true });
  update();
})();
