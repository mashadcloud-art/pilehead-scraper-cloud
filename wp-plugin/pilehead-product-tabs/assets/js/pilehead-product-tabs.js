/**
 * Pilehead Product Tabs - Standalone Tab Switcher
 * Version: 2.1.0
 */

(function($) {
    'use strict';

    $(document).ready(function() {

        // ── DOM Injection ──────────────────────────────────────────────
        // The theme bypasses woocommerce_after_single_product_summary,
        // so the plugin outputs its HTML in wp_footer (hidden).
        // We move it to the correct position here and show it.
        var $tabs = $('.pilehead-tabs-wrapper');
        if ($tabs.length) {
            var $themeSection = $('.ph-tabs-section');
            if ($themeSection.length) {
                // Insert our tabs right before the (already CSS-hidden) theme tabs
                $tabs.insertBefore($themeSection);
            } else {
                // Fallback: append to .ph-page container
                var $page = $('.ph-page');
                if ($page.length) {
                    $page.append($tabs);
                } else {
                    $('body').append($tabs);
                }
            }
            $tabs.show();
        }
        // ──────────────────────────────────────────────────────────────

        // Initialize Pilehead standalone tabs
        const $tabsContainer = $('.pilehead-product-tabs');
        
        if ($tabsContainer.length === 0) {
            return;
        }
        
        const $tabButtons = $tabsContainer.find('.pilehead-tab-btn');
        const $tabPanels = $tabsContainer.find('.pilehead-tab-pane');
        
        // Use delegation for better compatibility with AJAX content
        $(document).on('click', '.pilehead-tab-btn', function(e) {
            e.preventDefault();
            
            const $clickedBtn = $(this);
            const $container = $clickedBtn.closest('.pilehead-product-tabs');
            
            if (!$container.length) return;
            
            const targetTab = $clickedBtn.data('tab');
            
            // Scope selectors to this container
            const $tabButtons = $container.find('.pilehead-tab-btn');
            const $tabPanels = $container.find('.pilehead-tab-pane');
            
            // Remove active state
            $tabButtons.removeClass('active').attr('aria-selected', 'false');
            $tabPanels.removeClass('active').hide();
            
            // Activate clicked tab
            $clickedBtn.addClass('active').attr('aria-selected', 'true');
            
            // Find panel within container (supports new unique IDs and data-tab-content)
            const $targetPanel = $container.find('.pilehead-tab-pane[data-tab-content="' + targetTab + '"]');
            
            // Fallback for older HTML without data-tab-content
            if ($targetPanel.length) {
                $targetPanel.addClass('active').fadeIn(300);
            } else {
                // Try old ID selector as fallback
                $('#pilehead-panel-' + targetTab).addClass('active').fadeIn(300);
            }
            
            // Scroll on mobile
            if ($(window).width() < 768) {
                $('html, body').animate({
                    scrollTop: $container.offset().top - 20
                }, 300);
            }
        });
        
        // Keyboard navigation (accessibility)
        $tabButtons.on('keydown', function(e) {
            const currentIndex = $tabButtons.index(this);
            
            if (e.keyCode === 37) { // Left arrow
                e.preventDefault();
                const $prevTab = $tabButtons.eq(currentIndex - 1);
                if ($prevTab.length) {
                    $prevTab.focus().trigger('click');
                }
            } else if (e.keyCode === 39) { // Right arrow
                e.preventDefault();
                const $nextTab = $tabButtons.eq(currentIndex + 1);
                if ($nextTab.length) {
                    $nextTab.focus().trigger('click');
                }
            } else if (e.keyCode === 13 || e.keyCode === 32) { // Enter or Space
                e.preventDefault();
                $(this).trigger('click');
            }
        });
        
        // Ensure first tab is visible on load
        if ($tabPanels.filter('.active:visible').length === 0) {
            $tabButtons.first().addClass('active');
            $tabPanels.first().addClass('active').show();
        }
        
    });
    
})(jQuery);
