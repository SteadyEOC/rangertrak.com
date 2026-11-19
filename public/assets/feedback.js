// Feedback form: posts to rangertrak.org/api/feedback, falls back to a pre-filled GitHub issue.
// Moved out of feedback.html on 2026-10-05 so the Content-Security-Policy in public/_headers
// can refuse inline scripts. Loaded at the end of the body, not deferred, as before.
// Mirrors feedback.component.ts (ADR D-15) - see feedback.html's <head> comment. Kept as
// plain JS with no build step, matching the rest of this static site.
(function () {
  var GITHUB_ISSUE_URL = 'https://github.com/SteadyEOC/RangerTrak/issues/new';

  var form = document.getElementById('feedback-form');
  var messageEl = document.getElementById('message');
  var contactEl = document.getElementById('contact');
  var statusEl = document.getElementById('status');
  var submitBtn = document.getElementById('submit-btn');

  function fallbackUrl(message, contact) {
    var params = new URLSearchParams({ labels: 'feedback' });
    var trimmedMessage = message.trim();
    var trimmedContact = contact.trim();
    if (trimmedMessage) {
      params.set('body', trimmedContact
        ? trimmedMessage + '\n\n---\nContact: ' + trimmedContact
        : trimmedMessage);
    }
    return GITHUB_ISSUE_URL + '?' + params.toString();
  }

  form.addEventListener('submit', function (event) {
    event.preventDefault();
    var message = messageEl.value;
    var contact = contactEl.value;
    if (!message.trim()) {
      return;
    }

    submitBtn.disabled = true;
    statusEl.textContent = 'Sending...';

    // Maintainer-requested site review, 2026-09-23: this was a RELATIVE '/api/feedback'
    // - on a page served from rangertrak.com, that resolves to rangertrak.com/api/feedback,
    // which does not exist (wrangler.jsonc: static assets only, no server code, no feedback
    // route of its own - by design, see its own comment). Every submission 404'd, silently,
    // and fell through to the GitHub fallback below - which never actually failed loudly,
    // so this went unnoticed: the form LOOKED like it worked. Both this file's OWN header
    // comment and wrangler.jsonc's comment already said the intent was posting CROSS-origin
    // to the app's endpoint - the app's worker/index.js has allowlisted this origin
    // (FEEDBACK_ALLOWED_ORIGINS) since before the site went live. The one thing actually
    // missing was making this URL absolute.
    fetch('https://rangertrak.org/api/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: message.trim(), contact: contact.trim() })
    })
      .then(function (response) {
        if (!response.ok) { throw new Error('not ok'); }
        return response.json();
      })
      .then(function (data) {
        statusEl.textContent = 'Sent - thank you.';
        submitBtn.disabled = false;
        if (data && data.url) {
          window.open(data.url, '_blank', 'noopener');
        }
      })
      .catch(function () {
        // Expected on rangertrak.com today - see this file's header comment. Falls
        // through to the same pre-filled GitHub link the in-app form itself falls
        // back to, so nothing typed here is lost.
        statusEl.textContent = 'Opening a pre-filled GitHub issue instead...';
        submitBtn.disabled = false;
        window.open(fallbackUrl(message, contact), '_blank', 'noopener');
      });
  });
})();
