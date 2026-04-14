<?php
/**
 * Plugin Name: Pilehead PDF Extractor - Quick Extract
 * Plugin URI: https://pilehead.com
 * Description: Auto-extract PDF content from existing product documents and fill tabs instantly
 * Version: 1.0.0
 * Author: Pilehead
 * License: GPL v2 or later
 * 
 * This plugin adds a button to WooCommerce products to extract PDFs from existing documents
 * and automatically fill product tabs with extracted content.
 */

if (!defined('ABSPATH')) exit;

define('PH_QUICK_EXTRACT_PATH', plugin_dir_path(__FILE__));
define('PH_QUICK_EXTRACT_URL', plugin_dir_url(__FILE__));

// Load the quick extract functionality
require_once PH_QUICK_EXTRACT_PATH . 'quick-extract.php';

// Activation hook
register_activation_hook(__FILE__, function() {
    // Ensure WooCommerce is active
    if (!class_exists('WooCommerce')) {
        wp_die('Pilehead PDF Extractor requires WooCommerce to be activated');
    }
});

// Add plugin action links
add_filter('plugin_action_links_' . plugin_basename(__FILE__), function($links) {
    array_unshift($links, '<a href="' . admin_url('edit.php?post_type=product') . '">Products</a>');
    return $links;
});
