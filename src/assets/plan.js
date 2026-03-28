/* PlanPush — Design Doc Runtime */
(function(){
  'use strict';

  /* ===== Tab switching ===== */
  function initTabs(){
    var tabs = document.querySelectorAll('.plan-tab');
    var panes = document.querySelectorAll('.plan-pane');
    if(!tabs.length) return;

    tabs.forEach(function(tab){
      tab.addEventListener('click', function(){
        var target = tab.getAttribute('data-tab');
        tabs.forEach(function(t){ t.classList.remove('active'); t.setAttribute('aria-selected','false'); });
        panes.forEach(function(p){ p.classList.remove('active'); });
        tab.classList.add('active');
        tab.setAttribute('aria-selected','true');
        var pane = document.querySelector('.plan-pane[data-pane="'+target+'"]');
        if(pane) pane.classList.add('active');
      });
    });

    // Activate first tab if none active
    if(!document.querySelector('.plan-tab.active') && tabs[0]){
      tabs[0].click();
    }
  }

  /* ===== Smooth scroll to anchored elements ===== */
  function initAnchorLinks(){
    document.addEventListener('click', function(e){
      var link = e.target.closest('a[href^="#"]');
      if(!link) return;
      var id = link.getAttribute('href').slice(1);
      var el = document.getElementById(id) || document.querySelector('[data-anchor="'+id+'"]');
      if(el){
        e.preventDefault();
        el.scrollIntoView({behavior:'smooth', block:'center'});
        el.style.outline = '2px solid var(--pp-accent)';
        el.style.outlineOffset = '4px';
        el.style.borderRadius = 'var(--pp-radius)';
        setTimeout(function(){ el.style.outline='none'; }, 2000);
      }
    });
  }

  /* ===== Collapsible sections ===== */
  function initCollapsible(){
    document.querySelectorAll('[data-collapsible]').forEach(function(toggle){
      toggle.style.cursor = 'pointer';
      toggle.addEventListener('click', function(){
        var target = document.getElementById(toggle.getAttribute('data-collapsible'));
        if(!target) return;
        var hidden = target.style.display === 'none';
        target.style.display = hidden ? '' : 'none';
        toggle.setAttribute('aria-expanded', hidden);
      });
    });
  }

  /* ===== Init ===== */
  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  function init(){
    initTabs();
    initAnchorLinks();
    initCollapsible();
  }
})();
