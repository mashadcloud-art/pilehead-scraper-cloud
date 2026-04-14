/**
 * PileHead Store — Single Product JS
 * Version: 2.3.1
 */
(function ($) {
  'use strict';

  /* ══════════════════════════════════════════════
     GALLERY
  ══════════════════════════════════════════════ */
  function initGallery() {
    var $thumbs = $('.ph-thumb');
    var $mainImg = $('#mainProductImage');
    if (!$thumbs.length || !$mainImg.length) return;

    $thumbs.on('click', function () {
      $thumbs.removeClass('active');
      $(this).addClass('active');
      var fullSrc = $(this).data('full') || $(this).attr('src');
      $mainImg.attr('src', fullSrc);
      // Update zoom image if open
      $('#zoomImage').attr('src', fullSrc);
    });
  }

  /* ══════════════════════════════════════════════
     ZOOM OVERLAY
  ══════════════════════════════════════════════ */
  window.openZoom = function () {
    var $overlay = $('#zoomOverlay');
    var currentSrc = $('#mainProductImage').attr('src') || '';
    $('#zoomImage').attr('src', currentSrc);
    $overlay.addClass('active');
    $('body').css('overflow', 'hidden');
  };

  window.closeZoom = function (e) {
    if (e && $(e.target).closest('.ph-zoom-container').length) return;
    $('#zoomOverlay').removeClass('active');
    $('body').css('overflow', '');
  };

  /* ══════════════════════════════════════════════
     TABS
  ══════════════════════════════════════════════ */
  function initTabs() {
    var $tabLinks = $('.ph-tab-link');
    var $tabPanes = $('.ph-tab-pane');
    var $topNavLinks = $('.ph-top-nav-link');

    function switchTab(tabId) {
      $tabLinks.removeClass('active');
      $tabPanes.removeClass('active');
      $topNavLinks.removeClass('active');

      $tabLinks.filter('[data-tab="' + tabId + '"]').addClass('active');
      $('#' + tabId).addClass('active');
      $topNavLinks.filter('[data-target="' + tabId + '"]').addClass('active');
    }

    $tabLinks.on('click', function () {
      switchTab($(this).data('tab'));
    });

    $topNavLinks.on('click', function () {
      var target = $(this).data('target');
      switchTab(target);

      // Scroll to tab section
      var $section = $('#ph-tabs-section');
      if ($section.length) {
        $('html, body').animate({ scrollTop: $section.offset().top - 60 }, 300);
      }
    });
  }

  /* ══════════════════════════════════════════════
     STICKY TOP NAV + SCROLL ACTIVE
  ══════════════════════════════════════════════ */
  function initStickyNav() {
    var $navBar = $('#ph-top-nav-bar');
    var $tabsSection = $('#ph-tabs-section');
    if (!$navBar.length || !$tabsSection.length) return;

    if ('IntersectionObserver' in window) {
      var sentinel = document.createElement('div');
      sentinel.style.cssText = 'height:1px;pointer-events:none;';
      $tabsSection[0].insertAdjacentElement('beforebegin', sentinel);

      var observer = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          $navBar.toggleClass('visible', !entry.isIntersecting);
        });
      }, { rootMargin: '-64px 0px 0px 0px' });

      observer.observe(sentinel);
    }

    // Update active nav link on scroll
    var tabSections = [];
    var sectionIds = ['tab-overview', 'tab-features', 'tab-specifications', 'tab-applications', 'tab-faqs', 'tab-reviews'];
    sectionIds.forEach(function (id) {
      var el = document.getElementById(id);
      if (el) tabSections.push({ id: id, el: el });
    });

    $(window).on('scroll.phNav', function () {
      var scrollTop = $(this).scrollTop() + 100;
      var current = tabSections[0];

      tabSections.forEach(function (s) {
        if (s.el.offsetTop <= scrollTop) current = s;
      });

      if (current) {
        $('.ph-top-nav-link').removeClass('active');
        $('.ph-top-nav-link[data-target="' + current.id + '"]').addClass('active');
      }
    });
  }

  /* ══════════════════════════════════════════════
     QTY CONTROLS — Sync main ↔ sidebar
  ══════════════════════════════════════════════ */
  function initQty() {
    var mainInput    = '#ph-qty-input';
    var sidebarInput = '#ph-sidebar-qty-input';
    var price        = parseFloat(window.phProductPrice) || 0;

    function updatePriceDisplay(qty) {
      if (price <= 0) return;
      var total = (price * qty).toFixed(2);
      $('#ph-buybox-price').text(total);
      $('#ph-sticky-price-val').text(total);
    }

    function clamp(val) { return Math.max(1, Math.min(99, parseInt(val, 10) || 1)); }

    function syncInputs(qty) {
      $(mainInput).val(qty);
      $(sidebarInput).val(qty);
      $('#ph-quote-qty-input').val(qty);
      updatePriceDisplay(qty);
    }

    // Main qty
    $('#ph-qty-minus').on('click', function () { syncInputs(clamp($(mainInput).val()) - 1); });
    $('#ph-qty-plus').on('click',  function () { syncInputs(clamp($(mainInput).val()) + 1); });
    $(mainInput).on('input', function () { syncInputs(clamp($(this).val())); });

    // Sidebar qty
    $('#ph-sidebar-qty-minus').on('click', function () { syncInputs(clamp($(sidebarInput).val()) - 1); });
    $('#ph-sidebar-qty-plus').on('click',  function () { syncInputs(clamp($(sidebarInput).val()) + 1); });
    $(sidebarInput).on('input', function () { syncInputs(clamp($(this).val())); });

    // Quote qty
    $('#ph-quote-qty-minus').on('click', function () {
      var v = clamp($('#ph-quote-qty-input').val()) - 1;
      $('#ph-quote-qty-input').val(v);
    });
    $('#ph-quote-qty-plus').on('click', function () {
      var v = clamp($('#ph-quote-qty-input').val()) + 1;
      $('#ph-quote-qty-input').val(v);
    });
  }

  /* ══════════════════════════════════════════════
     ADD TO CART (WooCommerce AJAX)
  ══════════════════════════════════════════════ */
  function initATCButtons() {
    function getQty() {
      var v = parseInt($('#ph-qty-input').val(), 10);
      return isNaN(v) || v < 1 ? 1 : v;
    }

    function doAddToCart($btn, qty) {
      var productId = $btn.data('product-id');
      if (!productId) return;

      $btn.prop('disabled', true).text('Adding…');

      $.post(window.phAjaxUrl, {
        action:     'woocommerce_add_to_cart',
        nonce:      window.phNonce,
        product_id: productId,
        quantity:   qty
      })
      .done(function (res) {
        if (res.error) {
          alert(res.product_url || 'Failed to add to cart.');
          $btn.prop('disabled', false).text('Add to Cart');
        } else {
          $btn.text('✓ Added!');
          setTimeout(function () {
            $btn.prop('disabled', false).text('Add to Cart');
          }, 2000);
          $(document.body).trigger('wc_fragment_refresh');
          $(document.body).trigger('added_to_cart', [res.fragments, res.cart_hash, $btn]);
        }
      })
      .fail(function () {
        $btn.prop('disabled', false).text('Add to Cart');
        alert('Could not add to cart. Please try again.');
      });
    }

    $('#ph-atc-btn, #ph-sidebar-atc, #ph-sticky-atc').on('click', function () {
      doAddToCart($(this), getQty());
    });

    // Buy Now — direct checkout
    $('#ph-sidebar-buy').on('click', function () {
      var productId = $(this).data('product-id');
      var qty = getQty();
      window.location.href = window.phCheckoutUrl + '?add-to-cart=' + productId + '&quantity=' + qty;
    });
  }

  /* ══════════════════════════════════════════════
     DELIVERY CARDS
  ══════════════════════════════════════════════ */
  function initDeliveryCards() {
    $('.ph-delivery-card').on('click', function (e) {
      if ($(e.target).closest('.ph-delivery-info-btn').length) return;
      $('.ph-delivery-card').removeClass('selected');
      $(this).addClass('selected');
    });
  }

  /* ══════════════════════════════════════════════
     DELIVERY MODAL
  ══════════════════════════════════════════════ */
  var deliveryContent = {
    superfast: {
      title: '⚡ Superfast Delivery',
      body:  '<p><strong>Same Day Delivery</strong> — within 3 hours after order confirmation.</p>' +
             '<ul><li>Available in Dubai, Sharjah, Abu Dhabi</li>' +
             '<li>Order before 3 PM for same-day guarantee</li>' +
             '<li>Flat rate: AED 60</li>' +
             '<li>Real-time tracking via SMS</li></ul>'
    },
    stander: {
      title: '🚚 Standard Delivery',
      body:  '<p><strong>Next Day Delivery</strong> — delivered before 10 PM the following day.</p>' +
             '<ul><li>Available across all 7 Emirates</li>' +
             '<li>FREE on orders above AED 200</li>' +
             '<li>Dispatched from our Dubai warehouse</li></ul>'
    }
  };

  window.openDeliveryModal = function (type) {
    var data = deliveryContent[type] || { title: 'Delivery Details', body: '<p>Please contact us for delivery details.</p>' };
    $('#modalTitle').text(data.title);
    $('#modalBody').html(data.body);
    $('#deliveryModal').removeClass('hidden');
    $('body').css('overflow', 'hidden');
  };

  window.closeDeliveryModal = function () {
    $('#deliveryModal').addClass('hidden');
    $('body').css('overflow', '');
  };

  /* ══════════════════════════════════════════════
     RELATED CAROUSEL
  ══════════════════════════════════════════════ */
  function initRelatedCarousel() {
    var $track    = $('#ph-related-track');
    var $prev     = $('#ph-related-prev');
    var $next     = $('#ph-related-next');
    var $counter  = $('#ph-related-counter');
    if (!$track.length) return;

    var $cards      = $track.find('.ph-related-card');
    var total       = $cards.length;
    var perView     = getPerView();
    var current     = 0;

    function getPerView() {
      if ($(window).width() > 1100) return 6;
      if ($(window).width() > 720)  return 4;
      return 2;
    }

    function getCardWidth() {
      var $first = $cards.first();
      return $first.outerWidth(true) || 180;
    }

    function updateCarousel() {
      perView = getPerView();
      var offset = current * getCardWidth();
      $track.css('transform', 'translateX(-' + offset + 'px)');
      $prev.prop('disabled', current === 0);
      $next.prop('disabled', current + perView >= total);
      var shown = Math.min(current + perView, total);
      $counter.text((current + 1) + '–' + shown + ' of ' + total);
    }

    $prev.on('click', function () {
      if (current > 0) { current--; updateCarousel(); }
    });

    $next.on('click', function () {
      if (current + perView < total) { current++; updateCarousel(); }
    });

    $(window).on('resize.carousel', function () { updateCarousel(); });
    updateCarousel();
  }

  /* ══════════════════════════════════════════════
     STICKY BOTTOM BAR
  ══════════════════════════════════════════════ */
  function initStickyBottom() {
    var $stickyBar = $('#ph-sticky-bottom');
    var $buyBox    = $('.ph-buybox');
    if (!$stickyBar.length || !$buyBox.length) return;

    var observer = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          $stickyBar.toggleClass('visible', !entry.isIntersecting);
        });
      },
      { rootMargin: '0px 0px -100px 0px', threshold: 0 }
    );
    observer.observe($buyBox[0]);
  }

  /* ══════════════════════════════════════════════
     PDF PREVIEW MODAL
  ══════════════════════════════════════════════ */
  window.openPdfPreview = function (docs, productName) {
    var $overlay = $('#pdfModalOverlay');
    var $frame   = $('#pdfViewerFrame');
    var $tabs    = $('#pdfDocsTabs');
    var $list    = $('#pdfDocsList');
    var $title   = $('#pdfModalTitle');

    $title.text(productName + ' — Documents');
    $frame.attr('src', '');
    $tabs.empty();

    if (!Array.isArray(docs) || !docs.length) return;

    if (docs.length === 1) {
      $list.hide();
      $frame.attr('src', 'https://docs.google.com/viewer?url=' + encodeURIComponent(docs[0].url) + '&embedded=true');
    } else {
      $list.show();
      docs.forEach(function (doc, idx) {
        var $btn = $('<button>').text(doc.title || ('Document ' + (idx + 1)));
        $btn.on('click', function () {
          $tabs.find('button').removeClass('active');
          $(this).addClass('active');
          $frame.attr('src', 'https://docs.google.com/viewer?url=' + encodeURIComponent(doc.url) + '&embedded=true');
        });
        if (idx === 0) {
          $btn.addClass('active');
          $frame.attr('src', 'https://docs.google.com/viewer?url=' + encodeURIComponent(doc.url) + '&embedded=true');
        }
        $tabs.append($btn);
      });
    }

    $overlay.addClass('active');
    $('body').css('overflow', 'hidden');
  };

  window.closePdfPreview = function () {
    $('#pdfModalOverlay').removeClass('active');
    $('#pdfViewerFrame').attr('src', '');
    $('body').css('overflow', '');
  };

  /* ══════════════════════════════════════════════
     QUOTE MODAL
  ══════════════════════════════════════════════ */
  window.openQuoteModal = function (productName, sku) {
    var qty = parseInt($('#ph-quote-qty-input').val(), 10) || 1;

    $('#quoteProductName').val(productName);
    $('#quoteProductSku').val(sku);
    $('#quoteQty').val(qty);
    $('#modalProductName').text(productName);
    $('#modalQtyDisplay').text(qty);

    // Reset
    $('#quoteFormWrapper').show();
    $('#successState').removeClass('active');
    $('#quoteForm')[0].reset();

    $('#quoteModal').addClass('active');
    $('body').css('overflow', 'hidden');
  };

  window.closeQuoteModal = function () {
    $('#quoteModal').removeClass('active');
    $('body').css('overflow', '');
  };

  window.submitQuoteForm = function (e) {
    e.preventDefault();
    var $form   = $(e.target);
    var $submit = $form.find('[type="submit"]');

    $submit.prop('disabled', true).text('Sending…');

    $.post(window.phAjaxUrl || '', {
      action:       'ph_submit_quote',
      nonce:        window.phNonce || '',
      full_name:    $form.find('[name="full_name"]').val(),
      company_name: $form.find('[name="company_name"]').val(),
      email:        $form.find('[name="email"]').val(),
      phone:        $form.find('[name="phone"]').val(),
      product_name: $form.find('[name="product_name"]').val(),
      product_sku:  $form.find('[name="product_sku"]').val(),
      quantity:     $form.find('[name="quantity"]').val()
    })
    .always(function () {
      // Show success regardless (email fallback handled server-side)
      $('#quoteFormWrapper').hide();
      $('#successState').addClass('active');
    });
  };

  /* ══════════════════════════════════════════════
     WHATSAPP QUOTE
  ══════════════════════════════════════════════ */
  window.sendQuoteWhatsApp = function (number, productName, sku) {
    var qty = parseInt($('#ph-quote-qty-input').val(), 10) || 1;
    var message = 'Hello PileHead, I would like to get the price for:\n'
      + productName + '\nSKU: ' + sku + '\nQty: ' + qty;
    var url = 'https://wa.me/' + number + '?text=' + encodeURIComponent(message);
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  /* ══════════════════════════════════════════════
     KEYBOARD EVENTS
  ══════════════════════════════════════════════ */
  $(document).on('keydown', function (e) {
    if (e.key === 'Escape') {
      if ($('#zoomOverlay').hasClass('active'))         closeZoom();
      if (!$('#deliveryModal').hasClass('hidden'))      closeDeliveryModal();
      if ($('#pdfModalOverlay').hasClass('active'))     closePdfPreview();
      if ($('#quoteModal').hasClass('active'))          closeQuoteModal();
    }
  });

  // Close modals when clicking overlay background
  $('#deliveryModal').on('click', function (e) {
    if (e.target === this) closeDeliveryModal();
  });
  $('#quoteModal').on('click', function (e) {
    if (e.target === this) closeQuoteModal();
  });
  $('#pdfModalOverlay').on('click', function (e) {
    if (e.target === this) closePdfPreview();
  });

  /* ══════════════════════════════════════════════
     INIT
  ══════════════════════════════════════════════ */
  $(function () {
    initGallery();
    initTabs();
    initStickyNav();
    initQty();
    initATCButtons();
    initDeliveryCards();
    initRelatedCarousel();
    initStickyBottom();
  });

}(jQuery));
