/* Betriebsstatus-Widget
 *
 * Einbinden (ein Script für alle Gebiete):
 *   <div data-bss-tenant="grindelwald-first"></div>
 *   <script src="https://<BENUTZER>.github.io/<REPO>/widget.js" defer></script>
 *
 * Optionen als Attribute am <div>:
 *   data-bss-tenant       Gebiet (Pflicht): kleine-scheidegg | grindelwald-first | muerren-schilthorn
 *   data-bss-season       auto (Standard) | summer | winter
 *   data-bss-categories   nur diese Kategorie-Nummern, z.B. "1,2"  (1 Bahnen, 2 Pisten, ...)
 *   data-bss-hide-unknown "true" blendet Objekte mit Status "unbekannt" aus
 *   data-bss-expanded     "true" klappt alle Kategorien auf
 *   data-bss-details      "true" zeigt Betriebszeiten und Infotexte
 *   data-bss-title        eigener Titel statt Gebietsname
 *   data-bss-base         andere Daten-Adresse (Standard: Ordner dieses Scripts)
 */
(function () {
  'use strict';

  var SCRIPT = document.currentScript;
  var BASE = SCRIPT && SCRIPT.src ? SCRIPT.src.replace(/[^/]*$/, '') : '';
  var CSS_ID = 'bss-style';
  var REFRESH_MS = 10 * 60 * 1000;

  function injectStyles() {
    if (document.getElementById(CSS_ID)) return;
    var s = document.createElement('style');
    s.id = CSS_ID;
    s.textContent = [
      '.bss-widget{font-family:system-ui,sans-serif;width:100%;max-width:100%;border:1px solid #e2e8f0;',
      'border-radius:.5rem;overflow:hidden;background:#fff;font-size:.875rem;color:#1e293b;box-sizing:border-box;}',
      '.bss-widget *{box-sizing:border-box;}',
      '.bss-hdr{background:#fff;padding:.6rem .9rem;border-bottom:1px solid #e2e8f0;}',
      '.bss-hdr .bss-title{margin:0;font-size:1rem;font-weight:600;}',
      '.bss-hdr p{margin:.15rem 0 0;font-size:.72rem;color:#64748b;}',
      '.bss-sec{border-top:1px solid #e2e8f0;}',
      '.bss-sec:first-child{border-top:none;}',
      '.bss-sec summary{margin:0;padding:.45rem .8rem;background:#f1f5f9;font-size:.8rem;font-weight:600;',
      'color:#475569;cursor:pointer;list-style:none;display:flex;align-items:center;justify-content:space-between;gap:.5rem;}',
      '.bss-sec summary::-webkit-details-marker{display:none;}',
      '.bss-sec summary:focus-visible{outline:2px solid #2563eb;outline-offset:-2px;}',
      '.bss-count{font-weight:400;color:#94a3b8;}',
      '.bss-sec summary .of-icon{width:.72rem;height:.72rem;fill:#94a3b8;flex-shrink:0;',
      'transform:rotate(180deg);transition:transform .2s ease;}',
      '.bss-sec[open] summary .of-icon{transform:rotate(0deg);}',
      '.bss-sub{display:flex;justify-content:space-between;gap:.5rem;padding:.35rem .8rem .25rem;',
      'font-size:.72rem;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:.03em;',
      'border-bottom:1px solid #f1f5f9;background:#fafbfc;}',
      '.bss-list{list-style:none;margin:0;padding:0;}',
      '.bss-list li{display:flex;align-items:flex-start;gap:.5rem;padding:.4rem .8rem;border-bottom:1px solid #f1f5f9;}',
      '.bss-list li:last-child{border-bottom:none;}',
      '.bss-dot{width:8px;height:8px;border-radius:50%;flex-shrink:0;margin-top:.38rem;background:#9ca3af;}',
      '.bss-dot.bss-open{background:#16a34a;}',
      '.bss-dot.bss-closed{background:#dc2626;}',
      '.bss-dot.bss-preparation{background:#d97706;}',
      '.bss-dot.bss-free{background:#2563eb;}',
      '.bss-dot.bss-full{background:#7c3aed;}',
      '.bss-dot.bss-unknown{background:#9ca3af;}',
      '.bss-name{flex:1;min-width:0;}',
      '.bss-label{display:inline-block;min-width:1.4rem;margin-right:.35rem;padding:0 .3rem;border-radius:.25rem;',
      'background:#f1f5f9;color:#475569;font-size:.7rem;font-weight:600;text-align:center;}',
      '.bss-meta{display:block;margin-top:.1rem;font-size:.72rem;color:#64748b;}',
      '.bss-meta a{color:inherit;}',
      '.bss-state{font-size:.72rem;color:#64748b;white-space:nowrap;margin-top:.1rem;}',
      '.bss-empty{padding:.75rem .9rem;color:#64748b;font-size:.8rem;}',
      '.bss-footer{padding:.4rem .8rem;font-size:.7rem;color:#94a3b8;border-top:1px solid #e2e8f0;}',
      '.bss-error{padding:.75rem;color:#dc2626;font-size:.8rem;margin:0;}'
    ].join('');
    (document.head || document.documentElement).appendChild(s);
  }

  var CHEVRON = '<svg class="of-icon" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">' +
    '<path d="M239 111c9.4-9.4 24.6-9.4 33.9 0L465 303c9.4 9.4 9.4 24.6 0 33.9s-24.6 9.4-33.9 0l-175-175L81 337' +
    'c-9.4 9.4-24.6 9.4-33.9 0s-9.4-24.6 0-33.9L239 111z"></path></svg>';

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function safeUrl(u) {
    return /^https?:\/\//i.test(u || '') ? u : '';
  }

  function formatDateTimeDe(value) {
    var date = new Date(value);
    if (!value || isNaN(date.getTime())) return '';
    return new Intl.DateTimeFormat('de-CH', {
      day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
      hour12: false, timeZone: 'Europe/Zurich'
    }).format(date).replace(',', '');
  }

  function opts(el) {
    var cats = (el.getAttribute('data-bss-categories') || '').split(',')
      .map(function (x) { return parseInt(x, 10); }).filter(function (x) { return !isNaN(x); });
    var season = (el.getAttribute('data-bss-season') || 'auto').toLowerCase();
    return {
      tenant: (el.getAttribute('data-bss-tenant') || '').trim(),
      season: season === 'summer' || season === 'winter' ? season : 'current',
      categories: cats,
      hideUnknown: el.getAttribute('data-bss-hide-unknown') === 'true',
      expanded: el.getAttribute('data-bss-expanded') === 'true',
      details: el.getAttribute('data-bss-details') === 'true',
      title: el.getAttribute('data-bss-title') || '',
      base: (el.getAttribute('data-bss-base') || BASE).replace(/\/?$/, '/')
    };
  }

  function itemHtml(item, o) {
    var meta = [];
    if (o.details) {
      if (item.firstRide && item.lastRide) meta.push(esc(item.firstRide) + '–' + esc(item.lastRide) + ' Uhr');
      if (item.lengthMeter) meta.push(esc(item.lengthMeter) + ' m');
      if (item.info) meta.push(esc(item.info));
      (item.links || []).forEach(function (l) {
        var u = safeUrl(l.url);
        if (u) meta.push('<a href="' + esc(u) + '" target="_blank" rel="noopener">' + esc(l.text) + '</a>');
      });
    }
    return '<li>' +
      '<span class="bss-dot bss-' + esc(item.status || 'unknown') + '"></span>' +
      '<span class="bss-name">' +
        (item.label ? '<span class="bss-label">' + esc(item.label) + '</span>' : '') + esc(item.name) +
        (meta.length ? '<span class="bss-meta">' + meta.join(' · ') + '</span>' : '') +
      '</span>' +
      '<span class="bss-state">' + esc(item.statusLabel || 'unbekannt') + '</span>' +
      '</li>';
  }

  function render(el, data, o) {
    var html = '';
    var cats = (data.categories || []).filter(function (c) {
      return !o.categories.length || o.categories.indexOf(c.nr) !== -1;
    });
    cats.forEach(function (cat) {
      var subs = (cat.subcategories || []).map(function (s) {
        var items = (s.items || []).filter(function (i) { return !(o.hideUnknown && i.status === 'unknown'); });
        return { name: s.name, items: items, open: items.filter(function (i) { return i.isOpen; }).length };
      }).filter(function (s) { return s.items.length; });
      if (!subs.length) return;
      var total = 0, open = 0;
      subs.forEach(function (s) { total += s.items.length; open += s.open; });

      html += '<details class="bss-sec"' + (o.expanded ? ' open' : '') + '><summary><span>' + esc(cat.name) +
        ' <span class="bss-count">(' + open + '/' + total + ' offen)</span></span>' + CHEVRON + '</summary>';
      subs.forEach(function (s) {
        if (subs.length > 1) {
          html += '<div class="bss-sub"><span>' + esc(s.name) + '</span><span>' + s.open + '/' + s.items.length + '</span></div>';
        }
        html += '<ul class="bss-list">' + s.items.map(function (i) { return itemHtml(i, o); }).join('') + '</ul>';
      });
      html += '</details>';
    });

    var stand = formatDateTimeDe(data.updated);
    el.innerHTML =
      '<div class="bss-hdr"><p class="bss-title">' + esc(o.title || data.title || o.tenant) + '</p>' +
      '<p>' + esc(data.seasonLabel || '') + (stand ? ' · Stand: ' + esc(stand) : '') + '</p></div>' +
      (html ? '<div class="bss-body">' + html + '</div>' : '<p class="bss-empty">Keine Angaben vorhanden.</p>') +
      '<div class="bss-footer">Daten: Siscontrol SISMedia</div>';
  }

  function load(el) {
    var o = opts(el);
    if (!o.tenant) {
      el.innerHTML = '<p class="bss-error">Kein Gebiet angegeben (data-bss-tenant).</p>';
      return;
    }
    var url = o.base + 'api/' + encodeURIComponent(o.tenant) + '/' + o.season + '.json';
    // Aufgeklappte Kategorien beim Aktualisieren beibehalten
    var openNames = Array.prototype.map.call(el.querySelectorAll('details[open] summary > span'),
      function (s) { return s.firstChild && s.firstChild.nodeValue; });
    fetch(url, { cache: 'no-cache' })
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(function (data) {
        render(el, data, o);
        if (openNames.length) {
          Array.prototype.forEach.call(el.querySelectorAll('details'), function (d) {
            var span = d.querySelector('summary > span');
            if (span && span.firstChild && openNames.indexOf(span.firstChild.nodeValue) !== -1) d.open = true;
          });
        }
      })
      .catch(function (err) {
        if (!el.querySelector('.bss-hdr')) {
          el.innerHTML = '<p class="bss-error">Status konnte nicht geladen werden.</p>';
        }
        if (window.console) console.warn('Betriebsstatus-Widget:', url, err);
      });
  }

  function init() {
    injectStyles();
    var targets = document.querySelectorAll('[data-bss-tenant]');
    Array.prototype.forEach.call(targets, function (el) {
      if (el.getAttribute('data-bss-ready')) return;
      el.setAttribute('data-bss-ready', '1');
      el.classList.add('bss-widget');
      el.setAttribute('aria-live', 'polite');
      load(el);
      var timer = setInterval(function () {
        if (!document.documentElement.contains(el)) { clearInterval(timer); return; }
        load(el);
      }, REFRESH_MS);
    });
  }

  // Später eingefügte Widgets einlesen: window.dispatchEvent(new Event('bss:scan'))
  window.addEventListener('bss:scan', init);

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
}());
