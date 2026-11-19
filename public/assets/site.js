/*
 * RangerTrak public site - obfuscated mailto links.
 *
 * Every "RangerTrak@steadyeoc.com" mailto link on this site is written in the HTML as
 * <a class="js-mail" data-u="RangerTrak" data-d="steadyeoc.com" data-subject="...">RangerTrak
 * [at] steadyeoc [dot] com</a> - plain text, no @ sign for a scraper to find, and no href at
 * all until this script runs. With JS on, this builds the real mailto: href (subject and
 * all) and swaps the visible text back to the real address, which reads better for a person
 * and still works exactly like a normal mail link. With JS off, the link has no href, and
 * the text still reads as "RangerTrak [at] steadyeoc [dot] com" - not a live link, but not a
 * dead end either: the address is right there to type by hand.
 */
(function () {
  'use strict';

  var links = document.querySelectorAll('a.js-mail[data-u][data-d]');
  for (var i = 0; i < links.length; i++) {
    var link = links[i];
    var address = link.getAttribute('data-u') + '@' + link.getAttribute('data-d');
    var subject = link.getAttribute('data-subject');
    link.href = 'mailto:' + address + (subject ? '?subject=' + subject : '');
    link.textContent = address;
  }
})();

/*
 * Top bar menu button (below ~40em / ~640px, styles.css). Toggles .top-nav's .is-open
 * class and keeps aria-expanded in sync. Each page's <noscript> style overrides the CSS
 * that hides .top-nav by default at that width, so a visitor with JS off still gets a
 * usable, wrapped nav instead of a button that does nothing.
 */
(function () {
  'use strict';

  var toggles = document.querySelectorAll('.nav-toggle');
  for (var i = 0; i < toggles.length; i++) {
    (function (btn) {
      var nav = document.getElementById(btn.getAttribute('aria-controls'));
      if (!nav) return;
      btn.addEventListener('click', function () {
        var open = !nav.classList.contains('is-open');
        nav.classList.toggle('is-open', open);
        btn.setAttribute('aria-expanded', String(open));
      });
    })(toggles[i]);
  }
})();

/*
 * Back-to-top button, the same one the app has (shared/back-to-top). Built here rather
 * than written into every page, so no page needs a change. It shows only on a page tall
 * enough to need it (300px+ of scroll), once the reader is 600px or 40% of the way down,
 * whichever comes first. Scrolls smoothly unless the reader has asked for reduced motion.
 */
(function () {
  'use strict';

  var SHOW_AFTER_PX = 600;
  var MIN_SCROLLABLE_PX = 300;
  var SHOW_AFTER_FRACTION = 0.4;

  var btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'back-to-top';
  btn.title = 'Back to the top of this page';
  btn.setAttribute('aria-label', 'Back to the top of this page');
  btn.hidden = true;
  btn.innerHTML = '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" ' +
    'focusable="false"><path d="M12 5l-7 7h4v7h6v-7h4z" fill="currentColor"/></svg>';
  document.body.appendChild(btn);

  function update() {
    var scrolled = window.scrollY || document.documentElement.scrollTop || 0;
    var scrollable = document.documentElement.scrollHeight - window.innerHeight;
    if (scrollable < MIN_SCROLLABLE_PX) {
      btn.hidden = true;
      return;
    }
    btn.hidden = scrolled <= Math.min(SHOW_AFTER_PX, scrollable * SHOW_AFTER_FRACTION);
  }

  btn.addEventListener('click', function () {
    var motionOK = window.matchMedia('(prefers-reduced-motion: no-preference)').matches;
    window.scrollTo({ top: 0, behavior: motionOK ? 'smooth' : 'auto' });
    // Send keyboard focus back to the top too, or the next Tab lands at the bottom.
    var skip = document.querySelector('.skip-link');
    if (skip) skip.focus({ preventScroll: true });
  });
  window.addEventListener('scroll', update, { passive: true });
  window.addEventListener('resize', update);
  update();
})();

/*
 * Folding cards on the features pages (2026-11-16). Inside a .card-grid--fold, a card whose
 * text runs past about three lines gets its text wrapped in .card-fold (clipped, faded) and
 * a More / Less button with aria-expanded. Short cards are left alone. With JS off, nothing
 * changes and every card shows in full.
 */
(function () {
  'use strict';

  var cards = document.querySelectorAll('.card-grid--fold > .card');
  var n = 0;
  for (var i = 0; i < cards.length; i++) {
    (function (card) {
      var heading = card.querySelector('h4');
      var wrap = document.createElement('div');
      wrap.className = 'card-fold';
      var kids = Array.prototype.slice.call(card.childNodes);
      for (var k = 0; k < kids.length; k++) {
        if (kids[k] !== heading) wrap.appendChild(kids[k]);
      }
      card.appendChild(wrap);
      // Fold only when it saves real space (more than about 4.5 lines of text).
      var lineHeight = parseFloat(getComputedStyle(wrap).lineHeight) || 22;
      if (wrap.scrollHeight <= lineHeight * 4.6) return;
      wrap.id = wrap.id || 'card-fold-' + (++n);
      wrap.classList.add('is-folded');
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'card-more';
      btn.setAttribute('aria-controls', wrap.id);
      btn.setAttribute('aria-expanded', 'false');
      btn.textContent = 'More \u25BE';
      btn.addEventListener('click', function () {
        var open = wrap.classList.toggle('is-folded') === false;
        btn.setAttribute('aria-expanded', String(open));
        btn.textContent = open ? 'Less \u25B4' : 'More \u25BE';
      });
      card.appendChild(btn);
    })(cards[i]);
  }
})();
