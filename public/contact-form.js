// Quick message form in the Contact Us section (index.html #quickMessage).
// Posts to /api/messages (routes/messages.js).
(function () {
  var form = document.getElementById('quickMessage');
  if (!form) return;
  var status = document.getElementById('qmStatus');
  var btn = form.querySelector('button[type="submit"]');

  function say(text, ok) {
    status.textContent = text;
    status.className = 'mt-3 text-sm text-center lg:text-left ' + (ok ? 'text-green-700' : 'text-red-600');
  }

  form.addEventListener('submit', function (ev) {
    ev.preventDefault();
    if (!form.reportValidity()) return;
    var data = {
      name: form.elements.name.value,
      email: form.elements.email.value,
      question: form.elements.question.value,
      website: form.elements.website.value
    };
    btn.disabled = true;
    say('Sending…', true);
    fetch('/api/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    })
      .then(function (res) {
        return res.json().catch(function () { return {}; }).then(function (body) { return { ok: res.ok, body: body }; });
      })
      .then(function (r) {
        if (r.ok) {
          form.reset();
          say('Thanks! We got your message and will reply by email.', true);
          try { if (window.gtag) gtag('event', 'contact_message_sent'); } catch (e) {}
        } else {
          say((r.body && r.body.error) || 'Sorry, something went wrong. Please try again or call us.', false);
        }
      })
      .catch(function () {
        say('Sorry, we could not send your message. Please try again or call +1 (201) 908-7279.', false);
      })
      .then(function () { btn.disabled = false; });
  });
})();
