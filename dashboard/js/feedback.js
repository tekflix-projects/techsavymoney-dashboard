(function () {
  var currentType = 'feedback';

  function init() {
    document.body.insertAdjacentHTML('beforeend', [
      '<button id="feedback-btn" class="feedback-btn" aria-label="Share feedback">',
        '<svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.2" aria-hidden="true">',
          '<path stroke-linecap="round" stroke-linejoin="round" d="M8 10h.01M12 10h.01M16 10h.01M21 12c0 4.418-4.03 8-9 8a9.86 9.86 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"/>',
        '</svg>',
        'Feedback',
      '</button>',

      '<div id="feedback-overlay" class="feedback-overlay hidden">',
        '<div class="feedback-modal" role="dialog" aria-modal="true" aria-labelledby="feedback-modal-title">',

          '<div class="feedback-modal-header">',
            '<h3 id="feedback-modal-title">What\'s on your mind?</h3>',
            '<button id="feedback-close" class="feedback-close-btn" aria-label="Close">&times;</button>',
          '</div>',

          '<div class="feedback-modal-body" id="feedback-form-area">',
            '<div class="feedback-type-toggle">',
              '<button class="feedback-type-btn active" data-type="feedback">&#x1F4AC; Feedback</button>',
              '<button class="feedback-type-btn" data-type="feature">&#x2728; Feature Request</button>',
            '</div>',
            '<div class="form-group">',
              '<label for="feedback-message">Your message <span style="color:var(--red)">*</span></label>',
              '<textarea id="feedback-message" placeholder="Tell us what you think, or what you\'d like to see..." rows="4"></textarea>',
            '</div>',
            '<div class="form-group">',
              '<label for="feedback-email">Email &#8212; optional, if you\'d like a reply</label>',
              '<input type="email" id="feedback-email" placeholder="your@email.com" />',
            '</div>',
            '<button id="feedback-submit" class="btn btn-primary btn-block">Send Message</button>',
            '<p class="feedback-privacy-note">Anonymous by default. No tracking. No stored personal data.</p>',
          '</div>',

          '<div id="feedback-success" class="feedback-success hidden">',
            '<div class="feedback-success-inner">',
              '<div class="feedback-success-emoji">&#x1F64C;</div>',
              '<h3>Thanks!</h3>',
              '<p>Your feedback helps make TechSavyMoney better for everyone.</p>',
              '<button id="feedback-done" class="btn btn-secondary" style="margin-top:1.5rem;">Close</button>',
            '</div>',
          '</div>',

        '</div>',
      '</div>'
    ].join(''));

    document.getElementById('feedback-btn').addEventListener('click', openModal);
    document.getElementById('feedback-close').addEventListener('click', closeModal);
    document.getElementById('feedback-done').addEventListener('click', closeModal);
    document.getElementById('feedback-submit').addEventListener('click', submitForm);

    document.getElementById('feedback-overlay').addEventListener('click', function (e) {
      if (e.target === this) closeModal();
    });

    document.querySelectorAll('.feedback-type-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        currentType = this.dataset.type;
        document.querySelectorAll('.feedback-type-btn').forEach(function (b) {
          b.classList.remove('active');
        });
        this.classList.add('active');
      });
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        var overlay = document.getElementById('feedback-overlay');
        if (overlay && !overlay.classList.contains('hidden')) closeModal();
      }
    });
  }

  function openModal() {
    document.getElementById('feedback-overlay').classList.remove('hidden');
    document.body.style.overflow = 'hidden';
    setTimeout(function () {
      var ta = document.getElementById('feedback-message');
      if (ta) ta.focus();
    }, 120);
  }

  function closeModal() {
    document.getElementById('feedback-overlay').classList.add('hidden');
    document.body.style.overflow = '';
    setTimeout(function () {
      var formArea = document.getElementById('feedback-form-area');
      var success  = document.getElementById('feedback-success');
      var ta       = document.getElementById('feedback-message');
      var email    = document.getElementById('feedback-email');
      if (formArea) formArea.classList.remove('hidden');
      if (success)  success.classList.add('hidden');
      if (ta)    { ta.value = ''; ta.classList.remove('error'); }
      if (email) email.value = '';
      currentType = 'feedback';
      document.querySelectorAll('.feedback-type-btn').forEach(function (b, i) {
        b.classList.toggle('active', i === 0);
      });
    }, 300);
  }

  function submitForm() {
    var ta      = document.getElementById('feedback-message');
    var message = ta ? ta.value.trim() : '';

    if (!message) {
      if (ta) { ta.classList.add('error'); ta.focus(); }
      return;
    }
    if (ta) ta.classList.remove('error');

    var emailEl = document.getElementById('feedback-email');
    var email   = emailEl ? emailEl.value.trim() : '';
    var page    = window.location.pathname || '/';

    fetch('/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        'form-name': 'feedback',
        'bot-field': '',
        'type':    currentType === 'feature' ? 'Feature Request' : 'Feedback',
        'message': message,
        'email':   email || '(not provided)',
        'page':    page
      }).toString()
    })
    .then(showSuccess)
    .catch(showSuccess);
  }

  function showSuccess() {
    var formArea = document.getElementById('feedback-form-area');
    var success  = document.getElementById('feedback-success');
    if (formArea) formArea.classList.add('hidden');
    if (success)  success.classList.remove('hidden');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
