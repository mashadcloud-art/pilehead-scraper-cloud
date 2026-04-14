<?php
/**
 * Pilehead PDF Extractor - Quick Extract from Existing Documents
 * 
 * Adds a button to WooCommerce product pages to extract from existing document URLs
 * No upload needed - uses PDFs already attached to the product
 */

namespace PileheadPDFExtractor;

// Auto-load when WP admin loads
add_action('admin_init', __NAMESPACE__ . '\\register_quick_extract');

function register_quick_extract() {
    // Only on product edit pages
    if (!isset($_GET['post'])) return;
    if (get_post_type($_GET['post']) !== 'product') return;
    
    // Add meta box
    add_meta_box(
        'ph_quick_pdf_extract',
        '📄 Quick PDF Extract',
        __NAMESPACE__ . '\\render_quick_extract_box',
        'product',
        'side',
        'high'
    );
    
    // Handle AJAX
    add_action('wp_ajax_ph_quick_extract_existing', __NAMESPACE__ . '\\handle_quick_extract');
}

function render_quick_extract_box() {
    global $post;
    $product = wc_get_product($post->ID);
    
    // Get existing documents
    $docs = get_post_meta($post->ID, '_upsell_ids', true) ?: [];
    $doc_count = 0;
    
    // Check for any PDF meta
    $pdf_urls = [];
    $meta = get_post_meta($post->ID);
    foreach ($meta as $key => $values) {
        foreach ($values as $val) {
            if (is_string($val) && strpos($val, '.pdf') !== false) {
                if (filter_var($val, FILTER_VALIDATE_URL)) {
                    $pdf_urls[] = $val;
                }
            }
        }
    }
    $doc_count = count($pdf_urls);
    
    ?>
    <style>
        #ph_quick_pdf_extract {
            border-top: 3px solid #facc15;
        }
        .ph-extract-btn {
            background: linear-gradient(135deg, #facc15 0%, #f59e0b 100%);
            color: #1f2937;
            border: none;
            padding: 10px 16px;
            border-radius: 6px;
            font-weight: 600;
            cursor: pointer;
            width: 100%;
            margin: 10px 0;
            transition: all 0.3s ease;
        }
        .ph-extract-btn:hover {
            transform: translateY(-2px);
            box-shadow: 0 4px 12px rgba(250, 204, 21, 0.4);
        }
        .ph-extract-btn:disabled {
            opacity: 0.5;
            cursor: not-allowed;
        }
        .ph-extract-status {
            font-size: 12px;
            padding: 8px;
            margin: 8px 0;
            border-radius: 4px;
            display: none;
        }
        .ph-extract-status.success {
            background: #d1fae5;
            color: #065f46;
            display: block;
        }
        .ph-extract-status.error {
            background: #fee2e2;
            color: #991b1b;
            display: block;
        }
        .ph-extract-status.loading {
            background: #dbeafe;
            color: #1e40af;
            display: block;
        }
        .ph-doc-link {
            display: block;
            font-size: 11px;
            color: #6b7280;
            word-break: break-all;
            margin: 4px 0;
        }
    </style>

    <div class="ph-quick-extract-container">
        <p style="margin: 0 0 12px 0; font-size: 12px; color: #6b7280;">
            Found <strong><?php echo $doc_count; ?></strong> PDF(s) attached to this product.
            Click below to auto-extract and fill tabs.
        </p>
        
        <?php if ($doc_count > 0): ?>
            <?php foreach (array_slice($pdf_urls, 0, 2) as $url): ?>
                <div class="ph-doc-link">📎 <?php echo esc_url($url); ?></div>
            <?php endforeach; ?>
            
            <button class="ph-extract-btn" id="ph_quick_extract_btn">
                ⚡ Extract & Fill Tabs
            </button>
        <?php else: ?>
            <p style="font-size: 12px; color: #6b7280; margin: 8px 0;">
                ℹ️ No PDFs found. Please add documents to this product first.
            </p>
        <?php endif; ?>
        
        <div class="ph-extract-status" id="ph_extract_status"></div>
    </div>

    <script>
    (function() {
        const btn = document.getElementById('ph_quick_extract_btn');
        const status = document.getElementById('ph_extract_status');
        const postId = <?php echo $post->ID; ?>;
        
        if (!btn) return;
        
        btn.addEventListener('click', async function(e) {
            e.preventDefault();
            btn.disabled = true;
            
            status.classList.remove('error', 'success');
            status.classList.add('loading');
            status.textContent = '⏳ Extracting PDF content...';
            
            try {
                const response = await fetch(ajaxurl, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded',
                    },
                    body: new URLSearchParams({
                        action: 'ph_quick_extract_existing',
                        post_id: postId,
                        nonce: '<?php echo wp_create_nonce('ph_quick_extract'); ?>'
                    })
                });
                
                const result = await response.json();
                
                if (result.success) {
                    status.classList.remove('loading');
                    status.classList.add('success');
                    status.textContent = '✅ ' + result.data.message;
                    setTimeout(() => location.reload(), 2000);
                } else {
                    throw new Error(result.data?.message || 'Extraction failed');
                }
            } catch (error) {
                status.classList.remove('loading');
                status.classList.add('error');
                status.textContent = '❌ ' + error.message;
                btn.disabled = false;
            }
        });
    })();
    </script>
    <?php
}

function handle_quick_extract() {
    check_ajax_referer('ph_quick_extract');
    
    $post_id = intval($_POST['post_id'] ?? 0);
    if (!$post_id || get_post_type($post_id) !== 'product') {
        wp_send_json_error(['message' => 'Invalid product']);
    }
    
    // Get all meta to find PDF URLs
    $meta = get_post_meta($post_id);
    $pdf_urls = [];
    
    foreach ($meta as $key => $values) {
        foreach ($values as $val) {
            if (is_string($val) && strpos($val, '.pdf') !== false) {
                if (filter_var($val, FILTER_VALIDATE_URL)) {
                    $pdf_urls[] = $val;
                }
            }
        }
    }
    
    if (empty($pdf_urls)) {
        wp_send_json_error(['message' => 'No PDFs found in product documents']);
    }
    
    // Use first PDF
    $pdf_url = $pdf_urls[0];
    
    // Extract using our extractor class
    require_once __DIR__ . '/pdf-extractor-class.php';
    $extractor = new \PileheadPDFExtractor\PDFExtractor();
    
    $product_data = [
        'datasheetUrl' => $pdf_url,
        'id' => $post_id
    ];
    
    $enriched = $extractor->enrichProductWithPDFs($product_data);
    
    if (!$enriched['_pdf_extracted']) {
        wp_send_json_error(['message' => 'PDF extraction failed']);
    }
    
    // Save extracted tab fields to product meta
    $tabs_filled = 0;
    $tab_fields = [
        'ph_tab_specifications_html',
        'ph_tab_features_html',
        'ph_tab_applications_html',
        'ph_tab_estimating_html',
        'ph_tab_delivery_html',
        'ph_tab_faqs_html'
    ];
    
    foreach ($tab_fields as $field) {
        if (!empty($enriched[$field])) {
            update_post_meta($post_id, '_' . $field, $enriched[$field]);
            $tabs_filled++;
        }
    }
    
    // Save extraction metadata
    update_post_meta($post_id, '_pdf_extraction_source', $pdf_url);
    update_post_meta($post_id, '_pdf_extraction_date', current_time('mysql'));
    update_post_meta($post_id, '_pdf_extraction_type', $enriched['_pdf_type'] ?? 'auto');
    
    wp_send_json_success([
        'message' => "✨ Extracted {$tabs_filled} tabs from PDF!",
        'tabs_filled' => $tabs_filled,
        'pdf_type' => $enriched['_pdf_type'] ?? 'auto'
    ]);
}

// Hook into product display to show extraction status
add_action('woocommerce_product_options_general_product_data', function() {
    global $post;
    $extraction_date = get_post_meta($post->ID, '_pdf_extraction_date', true);
    if ($extraction_date) {
        echo '<div style="background: #d1fae5; border: 1px solid #6ee7b7; border-radius: 4px; padding: 12px; margin: 12px 0;">';
        echo '✅ <strong>PDF Extraction Status:</strong><br>';
        echo 'Type: ' . esc_html(get_post_meta($post->ID, '_pdf_extraction_type', true)) . '<br>';
        echo 'Extracted: ' . esc_html($extraction_date);
        echo '</div>';
    }
});

// Load the PDF extractor class we need
if (!function_exists('load_pdf_extractor_class')) {
    function load_pdf_extractor_class() {
        require_once __DIR__ . '/pdf-extractor-class.php';
    }
    add_action('plugins_loaded', 'load_pdf_extractor_class');
}
