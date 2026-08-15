(function () {
  'use strict';

  function setupStarRating() {
    document.querySelectorAll('[data-star-input]').forEach(function (container) {
      var hidden = container.querySelector('input[name="rating"]');
      var valueEl = container.querySelector('[data-star-value]');
      var stars = container.querySelectorAll('.star[data-star]');

      function apply(value) {
        stars.forEach(function (s) {
          s.classList.toggle('filled', parseInt(s.getAttribute('data-star'), 10) <= value);
        });
        if (valueEl && value > 0) valueEl.textContent = value + '/5';
      }

      stars.forEach(function (star) {
        var val = parseInt(star.getAttribute('data-star'), 10);
        star.addEventListener('click', function () {
          hidden.value = val;
          apply(val);
        });
        star.addEventListener('mouseenter', function () {
          stars.forEach(function (s) {
            s.classList.toggle('filled', parseInt(s.getAttribute('data-star'), 10) <= val);
          });
        });
      });

      container.addEventListener('mouseleave', function () {
        apply(parseInt(hidden.value, 10) || 0);
      });
    });
  }

  function confirmForms() {
    document.querySelectorAll('form[data-confirm]').forEach(function (form) {
      form.addEventListener('submit', function (e) {
        if (!window.confirm(form.getAttribute('data-confirm'))) {
          e.preventDefault();
        }
      });
    });
  }

  function menuItemRow(index) {
    return (
      '<div class="menu-row" data-index="' + index + '">' +
        '<div class="field">' +
          '<label for="menu-name-' + index + '">Item name</label>' +
          '<input id="menu-name-' + index + '" type="text" name="menu_items[' + index + '][name]" maxlength="100" required />' +
        '</div>' +
        '<div class="field menu-price-field">' +
          '<label for="menu-price-' + index + '">Price</label>' +
          '<input id="menu-price-' + index + '" type="number" name="menu_items[' + index + '][price]" min="0" max="99999" step="0.01" required />' +
        '</div>' +
        '<div class="field menu-desc-field">' +
          '<label for="menu-desc-' + index + '">Description <span class="optional">(optional)</span></label>' +
          '<input id="menu-desc-' + index + '" type="text" name="menu_items[' + index + '][description]" maxlength="300" />' +
        '</div>' +
        '<button type="button" class="btn btn-ghost btn-sm remove-item">Remove</button>' +
      '</div>'
    );
  }

  function nextMenuIndex() {
    var rows = document.querySelectorAll('.menu-row');
    var max = 0;
    rows.forEach(function (row) {
      var idx = parseInt(row.getAttribute('data-index'), 10);
      if (!isNaN(idx) && idx >= max) max = idx + 1;
    });
    return max;
  }

  function setupMenuItems() {
    var addButton = document.getElementById('add-item');
    var container = document.getElementById('menu-items');
    if (!addButton || !container) return;

    addButton.addEventListener('click', function () {
      if (container.querySelectorAll('.menu-row').length >= 50) {
        alert('You can add at most 50 menu items per restaurant.');
        return;
      }
      container.insertAdjacentHTML('beforeend', menuItemRow(nextMenuIndex()));
      wireRemoveButtons();
    });

    function wireRemoveButtons() {
      container.querySelectorAll('.remove-item').forEach(function (btn) {
        btn.onclick = function () {
          var rows = container.querySelectorAll('.menu-row');
          if (rows.length <= 1) return;
          btn.closest('.menu-row').remove();
        };
      });
    }

    wireRemoveButtons();
  }

  function clearClientErrors() {
    document.querySelectorAll('.field-error').forEach(function (el) {
      el.style.display = 'none';
    });
  }

  function setupValidation() {
    document.querySelectorAll('form[data-validate]').forEach(function (form) {
      form.addEventListener('submit', function (e) {
        clearClientErrors();

        var invalid = [];
        form.querySelectorAll('[required]').forEach(function (input) {
          if (input.type === 'radio') {
            var name = input.name;
            var checked = form.querySelector('input[name="' + name + '"]:checked');
            if (!checked && invalid.indexOf(name) === -1) {
              invalid.push(name);
              var label = form.querySelector('.role-option input[name="' + name + '"]');
              if (label) label.closest('.role-options').after(createInlineError('Please select an option.'));
            }
          } else if (!input.value.trim()) {
            invalid.push(input.name || input.id);
            showInlineError(input, 'This field is required.');
          }
        });

        form.querySelectorAll('input[type="number"]').forEach(function (input) {
          if (input.value && (isNaN(input.value) || parseFloat(input.value) < 0)) {
            invalid.push(input.name || input.id);
            showInlineError(input, 'Please enter a valid price.');
          }
        });

        var email = form.querySelector('input[type="email"]');
        if (email && email.value) {
          var re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
          if (!re.test(email.value)) {
            invalid.push(email.name);
            showInlineError(email, 'Please enter a valid email address.');
          }
        }

        if (invalid.length > 0) {
          e.preventDefault();
        }
      });
    });
  }

  function createInlineError(message) {
    var p = document.createElement('p');
    p.className = 'field-error';
    p.textContent = message;
    return p;
  }

  function showInlineError(input, message) {
    var error = input.closest('.field').querySelector('.field-error');
    if (!error) {
      error = createInlineError(message);
      input.closest('.field').appendChild(error);
    } else {
      error.textContent = message;
      error.style.display = '';
    }
  }

  function setupMobileNav() {
    var toggle = document.getElementById('navToggle');
    var menu = document.getElementById('mobileMenu');
    if (!toggle || !menu) return;

    toggle.addEventListener('click', function () {
      var open = menu.classList.toggle('open');
      toggle.classList.toggle('open', open);
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    });

    menu.querySelectorAll('a').forEach(function (link) {
      link.addEventListener('click', function () {
        menu.classList.remove('open');
        toggle.classList.remove('open');
        toggle.setAttribute('aria-expanded', 'false');
      });
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    confirmForms();
    setupMenuItems();
    setupValidation();
    setupStarRating();
    setupMobileNav();
  });
})();
