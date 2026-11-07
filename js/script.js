(function() {
  'use strict';

  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('overlay');
  const menuToggle = document.getElementById('menuToggle');
  const backToTop = document.getElementById('backToTop');
  const sidebarLinks = document.querySelectorAll('.sidebar-link');
  const lessonPlans = document.querySelectorAll('.lesson-plan');

  // ============ SIDEBAR TOGGLE (mobile) ============
  function openSidebar() {
    sidebar.classList.add('open');
    overlay.classList.add('visible');
    menuToggle.classList.add('active');
    document.body.style.overflow = 'hidden';
  }
  function closeSidebar() {
    sidebar.classList.remove('open');
    overlay.classList.remove('visible');
    menuToggle.classList.remove('active');
    document.body.style.overflow = '';
  }
  menuToggle.addEventListener('click', function() {
    if (sidebar.classList.contains('open')) {
      closeSidebar();
    } else {
      openSidebar();
    }
  });
  overlay.addEventListener('click', closeSidebar);

  // Close sidebar on link click (mobile)
  sidebarLinks.forEach(function(link) {
    link.addEventListener('click', function() {
      if (window.innerWidth <= 768) {
        closeSidebar();
      }
    });
  });

  // Close sidebar on Escape key
  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') closeSidebar();
  });

  // ============ BACK TO TOP ============
  window.addEventListener('scroll', function() {
    if (window.pageYOffset > 400) {
      backToTop.classList.add('visible');
    } else {
      backToTop.classList.remove('visible');
    }
    updateActiveLink();
  });
  backToTop.addEventListener('click', function() {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  // ============ ACTIVE SIDEBAR LINK HIGHLIGHTING ============
  function updateActiveLink() {
    let current = null;
    const scrollPos = window.pageYOffset + 120;
    lessonPlans.forEach(function(lp) {
      const top = lp.offsetTop;
      const bottom = top + lp.offsetHeight;
      if (scrollPos >= top && scrollPos < bottom) {
        current = lp.id;
      }
    });
    sidebarLinks.forEach(function(link) {
      const target = 'lp' + link.getAttribute('data-lp');
      if (target === current) {
        link.classList.add('active');
      } else {
        link.classList.remove('active');
      }
    });
  }

  // Initial active state
  updateActiveLink();

  // ============ HANDLE WINDOW RESIZE ============
  let resizeTimer;
  window.addEventListener('resize', function() {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function() {
      if (window.innerWidth > 768) {
        closeSidebar();
      }
    }, 150);
  });

})();
