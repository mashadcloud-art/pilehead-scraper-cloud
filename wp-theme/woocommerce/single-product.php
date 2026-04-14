<?php
/**
 * Pilehead Store — Single Product Template
 * Version: 2.3.0
 * Place at: your-theme/woocommerce/single-product.php
 *
 * Changes:
 * - Gallery: object-fit:contain, aspect-ratio, smooth fade thumb swap, rounded corners
 * - Middle column (ph-info): qty + ATC REMOVED
 * - Right buy box (ph-buybox): THE ONE ATC, wired to WC AJAX
 * - Quick Cart drawer: slides in after ATC, shows real WC cart items
 * - Updated: Custom related product cards with slide-up quick cart UI
 */
if ( ! defined( 'ABSPATH' ) ) exit;

/* ═══════════════════════════════════════════════════
   SEO — All in <head> via wp_head
   ✔ If Rank Math active: skip meta/OG (it handles those) but
     still inject our enhanced JSON-LD schemas.
   ✔ If Rank Math NOT active: output full meta + OG + JSON-LD.
═══════════════════════════════════════════════════ */
add_action( 'wp_head', function () {
    if ( ! is_singular( 'product' ) ) return;

    $prod = wc_get_product( get_queried_object_id() );
    if ( ! $prod ) return;

    $pid          = $prod->get_id();
    $prod_name    = $prod->get_name();
    $prod_url     = get_permalink( $pid );
    $sku          = $prod->get_sku();
    $price        = (float) $prod->get_price();
    $reg_price    = (float) $prod->get_regular_price();
    $currency     = get_woocommerce_currency();
    $in_stock     = $prod->is_in_stock();
    $on_sale      = $prod->is_on_sale();
    $rank_math_active = class_exists( 'RankMath\RankMath' ) || function_exists( 'rank_math' );

    // --- Shared data ---
    $brand_terms = get_the_terms( $pid, 'pa_brand' );
    $brand_name  = ( $brand_terms && ! is_wp_error( $brand_terms ) ) ? $brand_terms[0]->name : 'PileHead';

    $short_desc  = wp_strip_all_tags( $prod->get_short_description() ?: $prod->get_description() );
    $seo_desc    = $short_desc
        ? wp_trim_words( $short_desc, 28, '' )
        : 'Buy ' . $prod_name . ' online in UAE. ' . ( $sku ? 'SKU: ' . $sku . '. ' : '' ) . 'Fast delivery across Dubai, Abu Dhabi & Sharjah. Secure checkout at PileHead.';

    $img_id   = $prod->get_image_id();
    $img_url  = $img_id ? wp_get_attachment_image_url( (int) $img_id, 'large' ) : wc_placeholder_img_src( 'large' );
    $img_full = $img_id ? wp_get_attachment_image_url( (int) $img_id, 'full' )  : $img_url;

    // === META / OG / TWITTER — only when Rank Math is NOT active ===
    if ( ! $rank_math_active ) :
        $seo_title = 'Buy ' . $prod_name . ' Online in UAE | PileHead';
        ?>
    <!-- PileHead Product SEO -->
    <meta name="description" content="<?php echo esc_attr( $seo_desc ); ?>" />
    <link rel="canonical" href="<?php echo esc_url( $prod_url ); ?>" />
    <meta name="robots" content="index, follow, max-snippet:-1, max-image-preview:large, max-video-preview:-1" />
    <meta property="og:type" content="product" />
    <meta property="og:locale" content="en_AE" />
    <meta property="og:site_name" content="PileHead" />
    <meta property="og:title" content="<?php echo esc_attr( $seo_title ); ?>" />
    <meta property="og:description" content="<?php echo esc_attr( $seo_desc ); ?>" />
    <meta property="og:url" content="<?php echo esc_url( $prod_url ); ?>" />
    <meta property="og:image" content="<?php echo esc_url( $img_url ); ?>" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="1200" />
    <meta property="product:price:amount" content="<?php echo esc_attr( $price ); ?>" />
    <meta property="product:price:currency" content="<?php echo esc_attr( $currency ); ?>" />
    <meta property="product:availability" content="<?php echo $in_stock ? 'in stock' : 'out of stock'; ?>" />
    <meta property="product:brand" content="<?php echo esc_attr( $brand_name ); ?>" />
    <?php if ( $sku ) : ?>
    <meta property="product:retailer_item_id" content="<?php echo esc_attr( $sku ); ?>" />
    <?php endif; ?>
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="<?php echo esc_attr( $seo_title ); ?>" />
    <meta name="twitter:description" content="<?php echo esc_attr( $seo_desc ); ?>" />
    <meta name="twitter:image" content="<?php echo esc_url( $img_url ); ?>" />
    <?php
    endif; // end ! $rank_math_active

    // === JSON-LD SCHEMAS — always output (in <head>) ===
    // Skip if ph_schema_json is already set (custom schema from seoPush.js)
    $has_custom_schema = ! empty( get_post_meta( $pid, 'ph_schema_json', true ) );

    // BreadcrumbList — always useful, Rank Math usually outputs a simpler one
    $_bc = [
        [ '@type' => 'ListItem', 'position' => 1, 'name' => 'Home', 'item' => home_url( '/' ) ],
        [ '@type' => 'ListItem', 'position' => 2, 'name' => 'Shop', 'item' => get_permalink( wc_get_page_id( 'shop' ) ) ],
    ];
    $_pos = 3;
    $_cats = get_the_terms( $pid, 'product_cat' );
    if ( $_cats && ! is_wp_error( $_cats ) ) {
        usort( $_cats, fn( $a, $b ) => $b->parent - $a->parent );
        $_lead = $_cats[0];
        foreach ( array_reverse( get_ancestors( $_lead->term_id, 'product_cat' ) ) as $_aid ) {
            $_at = get_term( $_aid, 'product_cat' );
            if ( $_at && ! is_wp_error( $_at ) ) $_bc[] = [ '@type' => 'ListItem', 'position' => $_pos++, 'name' => $_at->name, 'item' => get_term_link( $_at ) ];
        }
        $_bc[] = [ '@type' => 'ListItem', 'position' => $_pos++, 'name' => $_lead->name, 'item' => get_term_link( $_lead ) ];
    }
    $_bc[] = [ '@type' => 'ListItem', 'position' => $_pos, 'name' => $prod_name, 'item' => $prod_url ];
    echo '<script type="application/ld+json">' . wp_json_encode([
        '@context' => 'https://schema.org', '@type' => 'BreadcrumbList', 'itemListElement' => $_bc
    ], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE ) . '</script>' . "\n";

    // Product schema — only if no custom ph_schema_json and Rank Math is not active
    if ( ! $has_custom_schema && ! $rank_math_active ) {
        $_gallery = [];
        if ( $img_full ) $_gallery[] = $img_full;
        foreach ( $prod->get_gallery_image_ids() as $_gid ) {
            $_gu = wp_get_attachment_image_url( (int) $_gid, 'full' );
            if ( $_gu ) $_gallery[] = $_gu;
        }
        $_offer = [
            '@type' => 'Offer', 'url' => $prod_url,
            'priceCurrency' => $currency, 'price' => (string) $price,
            'availability'  => $in_stock ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
            'itemCondition' => 'https://schema.org/NewCondition',
            'seller'        => [ '@type' => 'Organization', 'name' => 'PileHead', 'url' => home_url( '/' ) ],
        ];
        if ( $on_sale ) $_offer['priceValidUntil'] = date( 'Y-12-31' );
        $_ps = [
            '@context' => 'https://schema.org', '@type' => 'Product',
            'name'        => $prod_name,
            'description' => wp_strip_all_tags( $prod->get_short_description() ?: $prod->get_description() ?: $prod_name ),
            'url'         => $prod_url,
            'image'       => count( $_gallery ) === 1 ? $_gallery[0] : $_gallery,
            'sku'         => $sku ?: (string) $pid,
            'brand'       => [ '@type' => 'Brand', 'name' => $brand_name ],
            'offers'      => $_offer,
        ];
        $avg = (float) $prod->get_average_rating();
        $cnt = (int)   $prod->get_rating_count();
        if ( $avg > 0 && $cnt > 0 ) {
            $_ps['aggregateRating'] = [ '@type' => 'AggregateRating', 'ratingValue' => (string) $avg, 'reviewCount' => (string) $cnt, 'bestRating' => '5', 'worstRating' => '1' ];
        }
        $_gtin = get_post_meta( $pid, '_gtin', true ) ?: get_post_meta( $pid, '_barcode', true );
        if ( $_gtin ) $_ps['gtin'] = $_gtin;
        $_mpn = get_post_meta( $pid, '_mpn', true );
        if ( $_mpn ) $_ps['mpn'] = $_mpn;
        echo '<script type="application/ld+json">' . wp_json_encode( $_ps, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE ) . '</script>' . "\n";
    }

}, 6 ); // priority 6 — fires after Rank Math (priority 1) so we can detect it; before most others

get_header( 'shop' );
wp_enqueue_script( 'wc-add-to-cart' );

if ( have_posts() ) :
while ( have_posts() ) :
    the_post();
    global $product;
    if ( empty( $product ) || ! $product->is_visible() ) return;

    $product_id          = $product->get_id();
    $average_rating      = $product->get_average_rating();
    $rating_count        = $product->get_rating_count();
    $currency            = get_woocommerce_currency_symbol();
    $aed_symbol_url      = 'https://www.pilehead.com/wp-content/uploads/2025/10/uae-dirham-symbol.svg'; // Fallback
    $price               = (float) $product->get_price();
    $regular_price       = (float) $product->get_regular_price();
    $discount_percentage = ( $product->is_on_sale() && $regular_price > 0 )
        ? round( ( ( $regular_price - $price ) / $regular_price ) * 100 ) : 0;
    $atc_nonce           = wp_create_nonce( 'add-to-cart' );

    // Brand
    $brand = $product->get_attribute( 'pa_brand' );
    if ( empty( $brand ) ) {
        $bt = get_the_terms( $product_id, 'product_brand' );
        if ( $bt && ! is_wp_error( $bt ) ) $brand = $bt[0]->name;
    }
    if ( empty( $brand ) ) $brand = get_post_meta( $product_id, '_brand', true );
    if ( empty( $brand ) ) { $tp = explode( ' ', $product->get_name() ); $brand = $tp[0]; }

    // Gallery
    $post_thumbnail_id = $product->get_image_id();
    $main_img_alt      = $post_thumbnail_id
        ? get_post_meta( $post_thumbnail_id, '_wp_attachment_image_alt', true )
        : '';
    if ( empty( $main_img_alt ) ) $main_img_alt = $product->get_name() . ' UAE';
    $gcs_mode    = get_option( 'pilehead_gcs_mode', 'wp' );
    $use_gcs     = false;
    $gcs_main    = '';
    $gcs_gallery = [];
    if ( $gcs_mode !== 'wp' ) {
        if ( function_exists( 'pilehead_get_main' ) ) {
            $gcs_main    = pilehead_get_main( $product_id );
            $gcs_gallery = pilehead_get_gallery( $product_id );
        } else {
            $gcs_main       = get_post_meta( $product_id, 'gcs_image_url', true );
            $gcs_gallery_r  = get_post_meta( $product_id, 'gcs_gallery_urls', true );
            $gcs_gallery    = $gcs_gallery_r
                ? array_values( array_filter( array_map( 'trim', explode( '|', $gcs_gallery_r ) ) ) )
                : [];
        }
        if ( ! empty( $gcs_main ) ) $use_gcs = true;
    }

    // Fallback: If no WP featured image (or it's a placeholder) and we have a GCS URL, use GCS anyway
    if ( ! $use_gcs ) {
        $wp_thumb = wp_get_attachment_image_url( $post_thumbnail_id, 'full' );
        if ( ! $post_thumbnail_id || ! $wp_thumb || strpos($wp_thumb, 'placeholder') !== false ) {
            $gcs_main = get_post_meta( $product_id, 'gcs_image_url', true );
            if ( $gcs_main ) {
                $use_gcs = true;
                $gcs_gallery_r = get_post_meta( $product_id, 'gcs_gallery_urls', true );
                $gcs_gallery = $gcs_gallery_r ? array_values( array_filter( array_map( 'trim', explode( '|', $gcs_gallery_r ) ) ) ) : [];
            }
        }
    }

    $ph_ssl = is_ssl() || ( isset($_SERVER['HTTP_X_FORWARDED_PROTO']) && $_SERVER['HTTP_X_FORWARDED_PROTO'] === 'https' );

    // Documents
    $datasheet_url = get_post_meta( $product_id, 'datasheet_url', true ) ?: get_post_meta( $product_id, '_datasheet_url', true ) ?: get_post_meta( $product_id, '_spec_sheet', true ) ?: $product->get_attribute( 'datasheet_url' );
    $sds_url       = get_post_meta( $product_id, 'sds_url', true ) ?: get_post_meta( $product_id, '_sds_url', true ) ?: get_post_meta( $product_id, '_safety_sheet', true ) ?: get_post_meta( $product_id, 'safety_datasheet_url', true ) ?: get_post_meta( $product_id, '_safety_datasheet_url', true );
    $ms_url        = get_post_meta( $product_id, 'ms_url', true ) ?: get_post_meta( $product_id, '_ms_url', true ) ?: get_post_meta( $product_id, 'method_statement_url', true ) ?: get_post_meta( $product_id, '_method_statement_url', true );
    
    // Scraper additional documents
    $additional_json = get_post_meta( $product_id, '_additional_datasheets', true );
    $additional_docs = $additional_json ? json_decode($additional_json, true) : [];
    
    // Extract additional downloads from the description (legacy scraper generated <details> blocks)
    $raw_description = $product->get_description();
    $extracted_docs = [];
    if (strpos($raw_description, 'Downloads (') !== false || strpos($raw_description, '⬇️ Downloads') !== false) {
        if (preg_match('/<div[^>]*>\s*<details.*?>.*?<\/details>\s*<\/div>/is', $raw_description, $details_match) || preg_match('/<details.*?>.*?<\/details>/is', $raw_description, $details_match)) {
            $details_html = $details_match[0];
            // Remove the hardcoded downloads box from the description layout
            $raw_description = str_replace($details_html, '', $raw_description);
            // Extract the links
            if (preg_match_all('/<a[^>]+href=["\']([^"\']+)["\'][^>]*>(.*?)<\/a>/i', $details_html, $a_matches, PREG_SET_ORDER)) {
                foreach ($a_matches as $m) {
                    $extracted_docs[] = [
                        'url' => trim($m[1]),
                        'title' => strip_tags($m[2]),
                        'type' => 'document'
                    ];
                }
            }
        }
    }

    // Merge all document sources
    $all_product_docs = [];
    if ($datasheet_url) $all_product_docs[] = ['url' => $datasheet_url, 'title' => 'Technical Datasheet', 'type' => 'TDS'];
    if ($sds_url)       $all_product_docs[] = ['url' => $sds_url,       'title' => 'Safety Data Sheet',   'type' => 'SDS'];
    if ($ms_url)        $all_product_docs[] = ['url' => $ms_url,        'title' => 'Method Statement',    'type' => 'MS'];
    
    if (is_array($additional_docs)) {
        foreach ($additional_docs as $doc) {
            $all_product_docs[] = [
                'url' => $doc['url'] ?? '',
                'title' => $doc['name'] ?? $doc['title'] ?? 'Document',
                'type' => $doc['type'] ?? 'document'
            ];
        }
    }
    
    foreach ($extracted_docs as $doc) {
        $all_product_docs[] = $doc;
    }

    // Deduplicate by URL and Title (with normalization)
    $unique_docs = [];
    $seen_urls = [];
    $seen_titles = [];
    foreach ($all_product_docs as $doc) {
        $url = trim($doc['url'] ?? '');
        $title = trim($doc['title'] ?? '');
        if (empty($url)) continue;
        
        // Normalize URL
        $norm_url = preg_replace('/^https?:\/\//', '', $url);
        $norm_url = rtrim($norm_url, '/');
        
        // Normalize Title (lowercase, remove spaces and common prefixes)
        $norm_title = strtolower($title);
        $norm_title = preg_replace('/[^a-z0-9]/', '', $norm_title);
        $norm_title = str_replace(['technicaldatasheet', 'safetydatasheet', 'tds', 'sds'], '', $norm_title);
        
        // If we haven't seen this URL OR this Title, add it
        // (But URL is the primary unique factor)
        if (!in_array($norm_url, $seen_urls)) {
            // Also check title if URL is new - sometimes different URLs point to same doc with same title
            if (!empty($norm_title) && in_array($norm_title, $seen_titles)) {
                continue; // Skip if title is identical even if URL is slightly different
            }
            
            $unique_docs[] = $doc;
            $seen_urls[] = $norm_url;
            if (!empty($norm_title)) $seen_titles[] = $norm_title;
        }
    }
    
    // Estimating & Delivery content preparation
    $estimating_html = get_post_meta( $product_id, 'ph_tab_estimating_html', true ) ?: get_post_meta( $product_id, 'estimating_html', true );
    $delivery_html   = get_post_meta( $product_id, 'ph_tab_delivery_html', true ) ?: get_post_meta( $product_id, 'delivery_html', true ) ?: get_post_meta( $product_id, 'delivery_returns_html', true );

    // Move pack/litre/kg info from delivery to estimating if needed
    if ( empty($estimating_html) && !empty($delivery_html) ) {
        if ( preg_match('/(\d+\s*(?:kg|litre|pack|bag|drum|can|unit|set))/i', $delivery_html, $matches) ) {
            $estimating_html = '<div class="ph-est-note"><strong>Pack Size:</strong> ' . esc_html($matches[1]) . '</div>' . $delivery_html;
        }
    }

    // Intelligent Estimating Parser: Turn "Product : Pack size" strings into a clean 2-col table
    if ( ! empty( $estimating_html ) ) {
        $plain_est = trim( preg_replace( '/\s+/', ' ', wp_strip_all_tags( $estimating_html ) ) );
        $has_structured_html = preg_match( '/<(?:table|ul|li|tr|td|th)\b/i', $estimating_html );

        // Only parse when it's basically raw text (not already a clean table/list)
        if ( ! $has_structured_html && $plain_est !== '' ) {
            $pairs = [];
            $pack_note = '';

            if ( preg_match( '/^Pack Size:\s*(.+)$/i', $plain_est, $pm ) ) {
                $after = trim( $pm[1] );
                if ( strpos( $after, ':' ) !== false ) {
                    $pack_note = '';
                } else {
                    if ( preg_match( '/^(.+?)\s+([A-Z][^:]{1,70}?\s*:\s+.+)$/', $after, $pm2 ) ) {
                        $pack_note = trim( $pm2[1] );
                        $plain_est = trim( $pm2[2] );
                    }
                }
            }

            // Match: "Label : Value" repeated, using next " CapitalizedLabel : " as boundary
            if ( preg_match_all( '/\s*([^:]{2,70}?)\s*:\s*(.+?)(?=\s+[A-Z][^:]{1,70}?\s*:\s|$)/', $plain_est, $m, PREG_SET_ORDER ) ) {
                foreach ( $m as $row ) {
                    $label = trim( $row[1] );
                    $value = trim( $row[2] );
                    if ( $label !== '' && $value !== '' ) {
                        $pairs[] = [ $label, $value ];
                    }
                }
            }

            // Fallback: if ":" is missing (already flattened), split by size patterns like "1 and 4 litre packs"
            if ( count( $pairs ) < 2 ) {
                $pairs = [];
                if ( preg_match_all( '/((?:\d+(?:\.\d+)?\s*(?:and|&|,)\s*)?\d+(?:\.\d+)?)\s*(kg|litre|l|ml|g)\s*(packs?|bags?|drums?|cans?|units?)/i', $plain_est, $mm, PREG_OFFSET_CAPTURE ) ) {
                    $last = 0;
                    foreach ( $mm[0] as $hit ) {
                        $pos = (int) $hit[1];
                        $pack = trim( $hit[0] );
                        $before = trim( substr( $plain_est, $last, $pos - $last ) );
                        $before = preg_replace( '/^(and|&|,)\s*/i', '', $before );
                        $before = preg_replace( '/\s*(and|&|,)\s*$/i', '', $before );
                        if ( $before !== '' ) {
                            $pairs[] = [ $before, $pack ];
                        }
                        $last = $pos + strlen( $hit[0] );
                    }
                }
            }

            // Build table if we have at least 2 pairs; otherwise keep as single line note
            if ( count( $pairs ) >= 2 ) {
                $rows_html = '';
                foreach ( $pairs as $pair ) {
                    $rows_html .= '<tr><td>' . esc_html( $pair[0] ) . '</td><td>' . esc_html( $pair[1] ) . '</td></tr>';
                }
                $estimating_html = '';
                if ( $pack_note !== '' ) {
                    $estimating_html .=
                        '<div class="ph-info-note" style="margin-bottom:16px">' .
                            '<span class="ph-info-note-icon">📦</span>' .
                            '<span><strong>Pack size:</strong> ' . esc_html( $pack_note ) . '</span>' .
                        '</div>';
                }
                $estimating_html .=
                        '<div class="ph-est-table-wrap">' .
                            '<table class="ph-est-table">' .
                                '<thead><tr><th style="width:45%">Product</th><th>Pack size</th></tr></thead>' .
                                '<tbody>' . $rows_html . '</tbody>' .
                            '</table>' .
                        '</div>';
            } elseif ( $plain_est !== '' ) {
                $estimating_html =
                    '<div class="ph-info-note" style="margin-bottom:16px">' .
                        '<span class="ph-info-note-icon">ℹ</span>' .
                        '<span>' . esc_html( $plain_est ) . '</span>' .
                    '</div>';
            }
        }
    }

    $faqs = [];
    $faqs_json = get_post_meta( $product_id, 'ph_faqs_json', true ) ?: get_post_meta( $product_id, '_ph_faqs_json', true ) ?: get_post_meta( $product_id, 'ph_tab_faqs_json', true );
    if ( $faqs_json ) {
        $decoded = json_decode( $faqs_json, true );
        if ( is_array( $decoded ) ) {
            foreach ( $decoded as $f ) {
                $q = trim( (string) ( $f['q'] ?? $f['question'] ?? '' ) );
                $a = trim( (string) ( $f['a'] ?? $f['answer'] ?? '' ) );
                if ( $q !== '' && $a !== '' ) {
                    $faqs[] = [ 'q' => $q, 'a' => $a ];
                }
            }
        }
    }
    if ( empty( $faqs ) ) {
        $faqs = [
            [ 'q' => 'Do you deliver across UAE?', 'a' => 'Yes. Standard delivery is available across all 7 Emirates. Express delivery is available in Dubai and Abu Dhabi for eligible items.' ],
            [ 'q' => 'What is the minimum order quantity?', 'a' => 'There is no minimum order quantity. For bulk orders, contact us for better pricing and availability.' ],
            [ 'q' => 'How do I choose the correct product for my application?', 'a' => 'Check the Technical Datasheet (TDS) and Method Statement (if available). If you are unsure, share your application details and we will recommend the correct system.' ],
            [ 'q' => 'Can this be applied in direct sunlight in UAE summer?', 'a' => 'Apply early morning or evening when substrate temperatures are lower. Follow the datasheet temperature limits and protect the surface during curing if required.' ],
            [ 'q' => 'Is a primer required?', 'a' => 'Some systems require a primer depending on substrate and conditions. Always follow the manufacturer’s datasheet for surface preparation and priming requirements.' ],
            [ 'q' => 'What is the shelf life and storage condition?', 'a' => 'Shelf life varies by product. Store in original unopened packaging, in a cool and dry place, away from direct sunlight. Refer to the datasheet for exact details.' ],
            [ 'q' => 'Do you provide Safety Data Sheets (SDS)?', 'a' => 'Yes. If the SDS is available for the product, you can view it in the Documents tab. If it is missing, contact us and we will share it.' ],
            [ 'q' => 'What is your return policy?', 'a' => 'We accept returns on unopened items in original packaging within 14 days. Opened, mixed, or used products cannot be returned.' ],
        ];
    }
    $faqs_count = count( $faqs );

    $has_downloads = ! empty( $unique_docs );

    // WhatsApp
    $wa_message = urlencode( 'Hello Pilehead, I want a price for: ' . $product->get_name() . ' (SKU: ' . ( $product->get_sku() ?: 'N/A' ) . ')' );
    $wa_url     = 'https://wa.me/971547656789?text=' . $wa_message;

    // Related
    $related_ids = wc_get_related_products( $product_id, 10 );
    // Enqueue Google Fonts for this template
    wp_enqueue_style( 'ph-sp-fonts', 'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&family=Outfit:wght@400;500;600;700;800&display=swap', [], null );

    // SEO JSON-LD + meta tags are output in <head> via the wp_head hook above.
?>
<style>
/* ======================================================
   PILEHEAD — Single Product + Quick Cart
====================================================== */
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
:root{
  --amber:#facc15;--amber-lt:rgba(250,204,21,.13);--amber-glow:rgba(250,204,21,.3);
  --stone:#6B7280;--green:#16A34A;--red:#DC2626;
  --border:#E5E7EB;--bg:#F8F7F5;--card:#FFFFFF;
  --text:#0A0A0A;--text-2:#374151;
  --font-d:'Outfit',sans-serif;--font-b:'Inter',sans-serif;
  --r-lg:20px;--r-md:14px;--r-sm:10px;
  --shadow:0 2px 16px rgba(0,0,0,.07),0 1px 4px rgba(0,0,0,.04);
  --shadow-h:0 12px 40px rgba(0,0,0,.13),0 4px 12px rgba(0,0,0,.07)
}
html{scroll-behavior:smooth}
body{font-family:var(--font-b);background:var(--bg);color:var(--text);font-size:14px;line-height:1.6}
a{color:inherit;text-decoration:none}
img{max-width:100%;display:block}
button{cursor:pointer;font-family:var(--font-b);border:none;background:none}

/* Page */
.ph-page{max-width:1936px;margin:0 auto;padding:0 24px 100px}

/* Breadcrumb */
.ph-breadcrumb,.woocommerce-breadcrumb{padding:14px 0;font-size:12px;color:var(--stone);display:flex;align-items:center;gap:6px;flex-wrap:wrap}
.ph-breadcrumb a,.woocommerce-breadcrumb a{color:var(--stone);transition:color .2s}
.ph-breadcrumb a:hover,.woocommerce-breadcrumb a:hover{color:var(--amber)}

/* Grid */
.ph-product-grid{display:grid;grid-template-columns:minmax(0, 4fr) minmax(0, 3.8fr) minmax(0, 2.2fr);gap:28px;margin-top:8px;align-items:stretch;height:650px;}
.ph-gallery, .ph-info, .ph-buybox { min-width: 0; box-sizing: border-box; max-height: 100%; overflow-y: auto; scrollbar-width: none; }
.ph-gallery::-webkit-scrollbar, .ph-info::-webkit-scrollbar, .ph-buybox::-webkit-scrollbar { display: none; }

/* ---- GALLERY ---- */
.ph-gallery{display:flex;flex-direction:column;align-self:stretch;position:relative;}
.ph-main-image{position:relative;width:100%;height:100%;aspect-ratio:auto;background:#fff;border-radius:var(--r-lg);overflow:hidden;cursor:zoom-in;box-shadow:var(--shadow);transition:box-shadow .3s;display:flex;align-items:center;justify-content:center;}
.ph-thumbs{position:absolute;left:20px;top:20px;bottom:20px;width:74px;display:flex;flex-direction:column;gap:10px;overflow-y:auto;scrollbar-width:none;z-index:10;padding-right:4px;pointer-events:none;}
.ph-thumbs > * { pointer-events:auto; }
.ph-thumbs::-webkit-scrollbar{display:none}
.ph-main-image-inner{flex:1;position:relative;display:flex;align-items:center;justify-content:center;}
.ph-main-image:hover{box-shadow:var(--shadow-h)}
.ph-main-image-img{display:block!important;visibility:visible!important;opacity:1!important;width:100%;height:100%;max-height:100%;object-fit:contain;object-position:center;border-radius:var(--r-lg);padding:20px 20px 20px 100px;transition:transform .38s cubic-bezier(.25,.8,.25,1),opacity .22s ease;will-change:transform,opacity}
.ph-main-image:hover .ph-main-image-img{transform:scale(1.04)}
.ph-main-image-img.ph-img-loading{opacity:0!important;transform:scale(.97)}
.ph-zoom-hint-badge{position:absolute;bottom:12px;right:12px;background:rgba(0,0,0,.42);backdrop-filter:blur(5px);color:#fff;font-size:11px;font-weight:600;padding:4px 10px;border-radius:8px;opacity:0;transition:opacity .2s;pointer-events:none;display:flex;align-items:center;gap:4px;z-index:11;}
.ph-main-image:hover .ph-zoom-hint-badge{opacity:1}
.ph-badge-featured,.ph-badge-sale{position:absolute;top:14px;font-size:11px;font-weight:700;font-family:var(--font-d);letter-spacing:.04em;padding:4px 11px;border-radius:9px;pointer-events:none;z-index:11}
.ph-badge-featured{left:14px;background:var(--amber);color:#fff}
.ph-badge-sale{right:14px;background:var(--red);color:#fff}
.ph-thumb{width:64px;height:64px;object-fit:contain;object-position:center;border-radius:var(--r-sm);border:2.5px solid transparent;background:#fff;padding:5px;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,.06);transition:border-color .2s,box-shadow .2s,transform .2s,opacity .2s;opacity:.62;flex-shrink:0}
.ph-thumb:hover{border-color:#e0b040;opacity:1;transform:translateX(3px);box-shadow:0 4px 14px rgba(0,0,0,.12)}
.ph-thumb.active{border-color:var(--amber);opacity:1;box-shadow:0 0 0 3px var(--amber-glow),0 4px 12px rgba(0,0,0,.09);transform:translateX(2px)}
.woocommerce-product-gallery{display:none!important}

/* ---- INFO (no ATC) ---- */
.ph-info{display:flex;flex-direction:column;gap:14px;padding:22px 20px;background:var(--card);border:1.5px solid var(--border);border-radius:var(--r-lg);box-shadow:var(--shadow)}
.ph-brand{font-family:var(--font-d);font-size:11px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--amber);display:inline-block}
.ph-title{font-family:var(--font-d);font-size:24px;font-weight:800;line-height:1.22;letter-spacing:-.02em}
.ph-sku{font-size:12px;color:var(--stone);font-weight:500}
.ph-rating-row{display:flex;align-items:center;gap:7px}
.ph-stars{color:var(--amber);font-size:14px;letter-spacing:1px}
.ph-rating-num{font-weight:700;font-size:13px}
.ph-rating-count{color:var(--stone);font-size:12px}
.ph-price-block{margin:2px 0}
.ph-price-main{display:flex;align-items:baseline;gap:6px}
.ph-aed-label{height:26px!important;width:auto!important;max-width:30px!important;max-height:26px!important;display:inline-block!important;vertical-align:middle;margin-right:4px;flex-shrink:0}
.ph-price-num{font-family:var(--font-d);font-size:36px;font-weight:800;letter-spacing:-.03em}
.ph-vat-tag{font-size:11px;background:#F0FDF4;color:var(--green);padding:2px 8px;border-radius:6px;font-weight:600}
.ph-price-compare{display:flex;align-items:center;gap:8px;margin-top:4px}
.ph-price-old{font-size:14px;color:var(--stone);text-decoration:line-through}
.ph-discount-pill{background:#FEF3C7;color:#92400E;font-size:11px;font-weight:700;padding:2px 8px;border-radius:6px}
.ph-highlights{background:#FAFAF9;border:1px solid var(--border);border-radius:var(--r-md);padding:14px 16px;font-size:13px;color:var(--text-2);line-height:1.65}
.ph-highlights-label{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:var(--stone);margin-bottom:8px}
.ph-highlights ul{padding-left:16px}
.ph-highlights li{margin-bottom:4px}
.ph-options-block{background:#FAFAF9;border:1px solid var(--border);border-radius:var(--r-md);padding:14px 16px}
.ph-options-title{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:var(--stone);margin-bottom:12px}
.ph-var-row{display:flex;flex-direction:column;gap:6px;margin-bottom:12px}
.ph-var-row:last-child{margin-bottom:0}
.ph-var-label{font-size:12px;font-weight:600}
.ph-select{width:100%;height:40px;border:1.5px solid var(--border);border-radius:var(--r-sm);padding:0 12px;font-family:var(--font-b);font-size:13px;background:#fff;transition:border-color .2s}
.ph-select:focus{outline:none;border-color:var(--amber)}
.ph-delivery-options{display:flex;gap:10px}
.ph-delivery-card{flex:1;border:1.5px solid var(--border);border-radius:var(--r-md);padding:12px 14px;background:#fff;transition:border-color .2s}
.ph-delivery-card.selected{border-color:var(--amber);background:#FFFBF0}
.ph-delivery-header{display:flex;justify-content:space-between;align-items:center;margin-bottom:8px}
.ph-delivery-info-btn{width:20px;height:20px;color:var(--stone);display:flex;align-items:center;justify-content:center}
.ph-delivery-info-btn svg{width:16px;height:16px}
.ph-delivery-body{display:flex;justify-content:space-between;align-items:flex-end}
.ph-delivery-label{font-size:13px;font-weight:600}
.ph-delivery-sub{font-size:11px;color:var(--stone);margin-top:1px}
.ph-delivery-price{font-family:var(--font-d);font-size:13px;font-weight:700;color:var(--green)}
.ph-free-contact{display:flex;align-items:center;justify-content:space-between;background:#F0FDF4;border:1px solid #BBF7D0;border-radius:var(--r-md);padding:12px 14px;gap:12px}
.ph-free-info{display:flex;align-items:flex-start;gap:10px;flex:1}
.ph-free-icon{color:var(--green);flex-shrink:0;margin-top:1px}
.ph-free-icon svg{width:18px;height:18px}
.ph-free-text{display:flex;flex-direction:column;gap:2px;font-size:12px}
.ph-free-text strong{font-size:13px;color:var(--text)}
.ph-free-text span{color:var(--stone)}
.ph-contact-btns{display:flex;gap:8px}
.ph-contact-btn{width:36px;height:36px;border-radius:50%;background:#fff;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 8px rgba(0,0,0,.08);transition:transform .15s,box-shadow .15s}
.ph-contact-btn:hover{transform:scale(1.1)}
.ph-contact-btn svg{width:18px;height:18px}
.ph-asset-module{display:flex;align-items:center;gap:12px;border:1.5px solid var(--border);border-radius:var(--r-md);padding:12px 14px;background:#fff;cursor:pointer;transition:border-color .2s,box-shadow .2s,transform .15s}
.ph-asset-module:hover{border-color:var(--amber);box-shadow:0 4px 16px rgba(0,0,0,.08);transform:translateY(-1px)}
.ph-icon-shield{color:var(--stone)}
.ph-icon-shield svg{width:22px;height:22px}
.ph-content{flex:1}
.ph-asset-title{font-size:13px;font-weight:600;display:block}
.ph-asset-subtitle{font-size:11px;color:var(--stone);display:block;margin-top:2px}
.ph-action-box{color:var(--stone)}
.ph-trust{display:flex;gap:14px;flex-wrap:wrap}
.ph-trust-item{display:flex;align-items:center;gap:5px;font-size:12px;color:var(--stone);font-weight:500}
.ph-trust-item svg{width:14px;height:14px;color:var(--green)}
/* Trust Badges Strip */
.ph-trust-strip{width:100%;background:#FAFAF9;border:1px solid #EBEBEA;border-radius:14px;overflow:hidden;margin-top:4px}
.ph-trust-inner{display:flex;overflow-x:auto;scrollbar-width:none}
.ph-trust-inner::-webkit-scrollbar{display:none}
.ph-badge{flex:1;min-width:80px;display:flex;flex-direction:column;align-items:center;gap:6px;padding:11px 8px 10px;position:relative;cursor:default;transition:background .2s;border-right:1px solid #EBEBEA}
.ph-badge:last-child{border-right:none}
.ph-badge:hover{background:#F3F2F0}
.ph-badge::before{content:'';position:absolute;top:0;left:20%;right:20%;height:2px;border-radius:0 0 4px 4px;opacity:0;transition:opacity .2s}
.ph-badge:hover::before{opacity:1}
.ph-badge:nth-child(1)::before{background:#4ADE80}
.ph-badge:nth-child(2)::before{background:#60A5FA}
.ph-badge:nth-child(3)::before{background:#F472B6}
.ph-badge:nth-child(4)::before{background:#FBBF24}
.ph-badge:nth-child(5)::before{background:#34D399}
.ph-badge:nth-child(6)::before{background:#A78BFA}
.ph-badge-icon{width:26px;height:26px;display:flex;align-items:center;justify-content:center;border-radius:8px;transition:transform .22s cubic-bezier(.34,1.56,.64,1)}
.ph-badge:hover .ph-badge-icon{transform:translateY(-3px) scale(1.12)}
.ph-badge-label{display:flex;flex-direction:column;align-items:center;gap:2px;text-align:center}
.ph-badge-name{font-size:9.5px;font-weight:600;color:#111;line-height:1.2;white-space:nowrap}
.ph-badge-sub{font-size:8.5px;color:#AAA;white-space:nowrap;letter-spacing:.04em}

/* ---- BUY BOX (THE ONE ATC) ---- */
.ph-buybox{background:var(--card);border:1.5px solid var(--border);border-radius:var(--r-lg);padding:22px 20px;display:flex;flex-direction:column;gap:18px;box-shadow:var(--shadow);position:sticky;top:80px}
.ph-buybox-price-label{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:var(--stone);margin-bottom:6px}
.ph-buybox-total{display:flex;align-items:baseline;gap:5px}
.ph-buybox-total-currency{height:22px!important;width:auto!important;max-width:28px!important;max-height:22px!important;display:inline-block!important;vertical-align:middle;margin-right:4px;flex-shrink:0}
.ph-buybox-total-amount{font-family:var(--font-d);font-size:32px;font-weight:800;letter-spacing:-.03em}
.ph-buybox-divider{height:1px;background:var(--border)}
.ph-sidebar-qty{display:flex;align-items:center;border:1.5px solid var(--border);border-radius:var(--r-sm);overflow:hidden;background:#fff}
.ph-sidebar-qty-btn{width:40px;height:44px;font-size:20px;font-weight:300;color:var(--text);transition:background .15s}
.ph-sidebar-qty-btn:hover{background:#f3f3f1}
.ph-sidebar-qty-input{flex:1;height:44px;border:none;border-left:1.5px solid var(--border);border-right:1.5px solid var(--border);text-align:center;font-size:15px;font-weight:600;-moz-appearance:textfield}
.ph-sidebar-qty-input::-webkit-outer-spin-button,.ph-sidebar-qty-input::-webkit-inner-spin-button{-webkit-appearance:none}
/* ★ THE ONE ADD TO CART ★ */
.ph-sidebar-atc{width:100%;height:50px;background:var(--amber);color:#000;border-radius:var(--r-sm);font-family:var(--font-d);font-size:15px;font-weight:700;display:flex;align-items:center;justify-content:center;gap:8px;transition:background .2s,transform .15s,box-shadow .2s;box-shadow:0 4px 14px var(--amber-glow)}
.ph-sidebar-atc:hover:not(:disabled){background:#eab308;transform:translateY(-2px);box-shadow:0 8px 24px var(--amber-glow)}
.ph-sidebar-atc:disabled{opacity:.6;cursor:not-allowed;transform:none}
.ph-atc-text{display:inline}
.ph-atc-spinner{display:none;width:18px;height:18px;animation:ph-spin .8s linear infinite;flex-shrink:0}
.ph-sidebar-buy{width:100%;height:48px;background:var(--text);color:#fff;border-radius:var(--r-sm);font-family:var(--font-d);font-size:15px;font-weight:700;transition:background .2s,transform .15s}
.ph-sidebar-buy:hover{background:#222;transform:translateY(-2px)}
/* B2B Quote (price=0) */
.ph-quote-badge{background:var(--amber);color:#fff;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;padding:3px 8px;border-radius:6px;display:inline-block;width:fit-content}
.ph-quote-title{font-family:var(--font-d);font-size:18px;font-weight:700;margin-top:6px}
.ph-quote-subtitle{font-size:12px;color:var(--stone);margin-top:3px}
.ph-quote-qty-label{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:var(--stone);margin-bottom:8px;display:block}
.ph-quote-qty-row{display:flex;border:1.5px solid var(--border);border-radius:var(--r-sm);overflow:hidden}
.ph-quote-qty-row button{flex:0 0 40px;height:44px;font-size:20px;font-weight:300;color:var(--text);transition:background .15s}
.ph-quote-qty-row button:hover{background:#f3f3f1}
.ph-quote-qty-row input{flex:1;height:44px;border:none;border-left:1.5px solid var(--border);border-right:1.5px solid var(--border);text-align:center;font-size:15px;font-weight:600;-moz-appearance:textfield}
.ph-quote-qty-row input::-webkit-outer-spin-button,.ph-quote-qty-row input::-webkit-inner-spin-button{-webkit-appearance:none}

.ph-asset-module{display:flex;align-items:center;gap:12px;border:1.5px solid var(--border);border-radius:var(--r-md);padding:12px 14px;background:#fff;cursor:pointer;transition:border-color .2s,box-shadow .2s,transform .15s}
.ph-asset-module:hover{border-color:var(--amber);box-shadow:0 4px 16px rgba(0,0,0,.08);transform:translateY(-1px)}
.ph-file-ext{flex-shrink:0;width:40px;height:40px;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:800;border-radius:8px;text-transform:uppercase}
.ph-asset-title{font-size:13.5px;font-weight:600;color:var(--text);line-height:1.4}
.ph-action-box{margin-left:auto;color:var(--stone);opacity:.4;transition:opacity .2s,color .2s}
.ph-asset-module:hover .ph-action-box{opacity:1;color:var(--amber)}

.ph-estimating-content table, .ph-supply-content table { width: 100%; border-collapse: collapse; margin-bottom: 20px; border: 1px solid var(--border); border-radius: 8px; overflow: hidden; }
.ph-estimating-content th, .ph-supply-content th { background: #f8f8f7; padding: 12px 15px; text-align: left; font-size: 13px; font-weight: 700; color: var(--stone); border-bottom: 1px solid var(--border); }
.ph-estimating-content td, .ph-supply-content td { padding: 12px 15px; border-bottom: 1px solid var(--border); font-size: 14px; color: var(--text); }
.ph-estimating-content tr:last-child td, .ph-supply-content tr:last-child td { border-bottom: none; }
.ph-estimating-content ul, .ph-supply-content ul { list-style: disc; margin-left: 20px; margin-bottom: 20px; }
.ph-estimating-content li, .ph-supply-content li { margin-bottom: 8px; font-size: 14px; }

.ph-spec-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 12px; margin-top: 20px; }
.ph-spec-item { background: #fff; border: 1.5px solid var(--border); border-radius: 10px; padding: 12px 15px; display: flex; flex-direction: column; gap: 4px; transition: transform .2s, border-color .2s; }
.ph-spec-item:hover { border-color: var(--amber); transform: translateY(-2px); box-shadow: 0 4px 12px rgba(0,0,0,.04); }
.ph-spec-label { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: .08em; color: var(--stone); }
.ph-spec-value { font-size: 14px; font-weight: 600; color: var(--text); line-height: 1.4; }
.ph-modern-specs-table table { width: 100%; border-collapse: separate; border-spacing: 0; border: 1.5px solid var(--border); border-radius: 12px; overflow: hidden; margin-top: 20px; }
.ph-modern-specs-table th { background: #f8f8f7; padding: 12px 15px; text-align: left; font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: .05em; color: var(--stone); border-bottom: 1.5px solid var(--border); }
.ph-modern-specs-table td { padding: 12px 15px; border-bottom: 1px solid var(--border); font-size: 14px; color: var(--text); background: #fff; }
.ph-modern-specs-table tr:last-child td { border-bottom: none; }
.ph-quote-btn{width:100%;height:48px;border-radius:var(--r-sm);font-family:var(--font-d);font-size:14px;font-weight:700;cursor:pointer;border:none;transition:background .2s,transform .15s;display:flex;align-items:center;justify-content:center;gap:8px}
.ph-quote-btn-primary{background:var(--amber);color:#0f172a;box-shadow:0 4px 14px var(--amber-glow)}
.ph-quote-btn-primary:hover{background:#eab308;transform:translateY(-2px)}
.ph-quote-btn-wa{background:#25D366;color:#fff}
.ph-quote-btn-wa:hover{background:#1da851;transform:translateY(-2px)}
/* BNPL */
.ph-bnpl-title{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:var(--stone);margin-bottom:10px}
.ph-bnpl-cards{display:flex;flex-direction:column;gap:10px}
.ph-bnpl-card{border:1.5px solid var(--border);border-radius:var(--r-sm);padding:12px;background:#FAFAF9}
.ph-bnpl-header{display:flex;align-items:center;gap:10px;margin-bottom:10px}
.ph-bnpl-amount{font-weight:700;font-size:14px}
.ph-bnpl-per{font-size:11px;color:var(--stone)}
.ph-bnpl-dots{display:flex;align-items:center}
.ph-dot{width:10px;height:10px;border-radius:50%}
.ph-dot-line{flex:1;height:1.5px;background:var(--border)}
.ph-bnpl-timeline{display:flex;justify-content:space-between;font-size:10px;color:var(--stone);margin-top:4px}

/* ---- STICKY NAV ---- */
.ph-top-nav-bar{position:sticky;top:0;z-index:100;background:rgba(255,255,255,.92);backdrop-filter:blur(12px);border-bottom:1px solid var(--border);margin-top:36px}
.ph-top-nav-inner{display:flex;max-width:1936px;margin:0 auto;padding:0 24px;overflow-x:auto}
.ph-top-nav-link{padding:14px 20px;font-size:13px;font-weight:600;color:var(--stone);cursor:pointer;white-space:nowrap;border-bottom:2.5px solid transparent;transition:color .2s,border-color .2s}
.ph-top-nav-link:hover{color:var(--text)}
.ph-top-nav-link.active{color:var(--amber);border-bottom-color:var(--amber)}

/* ======================================================
   PRECISION TABS v4.0 — Premium Industrial UI
   ====================================================== */
.ph-tabs-card { 
    background: #ffffff; 
    border: 1px solid #E2E8F0; 
    border-radius: 24px; 
    overflow: hidden; 
    margin-top: 60px;
    box-shadow: 0 4px 20px rgba(0,0,0,0.03);
}

/* Nav Bar */
.ph-tab-nav { 
    position: sticky;
    top: 0;
    z-index: 50;
    display: flex; 
    overflow-x: auto; 
    scrollbar-width: none; 
    border-bottom: 1px solid #F1F5F9; 
    background: rgba(248, 250, 252, 0.92); 
    backdrop-filter: blur(10px);
    padding: 6px 12px;
    gap: 4px;
}
.ph-tab-nav::-webkit-scrollbar { display: none; }

.ph-tab-btn { 
    flex-shrink: 0; 
    padding: 12px 20px; 
    font-size: 13px; 
    font-weight: 600; 
    color: #64748B; 
    background: transparent; 
    border: none; 
    cursor: pointer; 
    position: relative; 
    border-radius: 12px;
    transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
    font-family: 'Outfit', sans-serif;
    display: flex;
    align-items: center;
    gap: 8px;
}

.ph-tab-btn:hover { 
    color: #0F172A; 
    background: #F1F5F9;
}

.ph-tab-btn.active { 
    color: #0F172A; 
    background: #FFFFFF;
    box-shadow: 0 2px 8px rgba(0,0,0,0.05);
}

.ph-tab-btn.active::after {
    content: '';
    position: absolute;
    bottom: 8px;
    left: 20%;
    right: 20%;
    height: 3px;
    background: #FACC15;
    border-radius: 10px;
}

.ph-tab-count { 
    display: inline-flex; 
    align-items: center; 
    justify-content: center; 
    min-width: 18px; 
    height: 18px; 
    background: #E2E8F0; 
    border-radius: 6px; 
    font-size: 10px; 
    font-weight: 700;
    color: #475569; 
    padding: 0 5px;
}

.ph-tab-btn.active .ph-tab-count { 
    background: #FEF08A; 
    color: #854D0E; 
}

/* Panels */
.ph-panel { display: none; padding: 40px; animation: phSlideUp 0.3s ease-out; }
.ph-panel.active { display: block; }
@keyframes phSlideUp { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }

.ph-panel-heading { 
    font-family: 'Outfit', sans-serif; 
    font-size: 26px; 
    font-weight: 700; 
    color: #0F172A; 
    margin-bottom: 18px; 
    letter-spacing: -0.02em;
}

.ph-panel-sub { 
    font-size: 14px; 
    color: #64748B; 
    margin-bottom: 32px; 
    line-height: 1.6;
    max-width: 600px;
}

/* Internal Content Components */

/* 1. Technical Data Slices (Specs) */
.ph-spec-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 12px; }
.ph-spec-row { 
    display: flex; 
    flex-direction: column; 
    gap: 4px; 
    padding: 16px 20px; 
    background: #F8FAFC;
    border: 1px solid #F1F5F9; 
    border-radius: 16px; 
    transition: all 0.2s;
}
.ph-spec-row:hover { 
    border-color: #FACC15; 
    background: #FFFFFF;
    box-shadow: 0 4px 12px rgba(250, 204, 21, 0.1);
    transform: translateY(-2px);
}
.ph-spec-label { font-size: 10px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.1em; color: #94A3B8; }
.ph-spec-val { font-size: 15px; font-weight: 600; color: #1E293B; }

/* 2. Feature Cards (Features) */
.ph-feat-list { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 16px; }
.ph-feat-item { 
    display: flex; 
    gap: 16px; 
    padding: 20px; 
    background: #FFFFFF;
    border: 1px solid #F1F5F9; 
    border-radius: 18px; 
    transition: all 0.2s;
    box-shadow: 0 2px 4px rgba(0,0,0,0.02);
}
.ph-feat-item:hover { 
    border-color: #FACC15; 
    background: #FEFCE8;
    transform: translateY(-2px);
}
.ph-feat-dot { 
    width: 28px; 
    height: 28px; 
    border-radius: 8px; 
    background: #FACC15; 
    display: flex; 
    align-items: center; 
    justify-content: center; 
    flex-shrink: 0; 
}
.ph-feat-dot svg { width: 14px; height: 14px; stroke: #000; stroke-width: 3; fill: none; }
.ph-feat-title { font-size: 15px; font-weight: 700; color: #0F172A; margin-bottom: 4px; }
.ph-feat-desc { font-size: 13px; color: #64748B; line-height: 1.5; }

/* 3. Application Tiles (Applications) */
.ph-app-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 12px; }
.ph-app-card { 
    padding: 24px 16px; 
    background: #F8FAFC;
    border: 1px solid #F1F5F9; 
    border-radius: 20px; 
    text-align: center; 
    transition: all 0.2s;
}
.ph-app-card:hover { 
    border-color: #FACC15; 
    background: #FFFFFF;
    box-shadow: 0 8px 16px rgba(0,0,0,0.04);
}
.ph-app-icon { font-size: 32px; margin-bottom: 12px; display: block; filter: drop-shadow(0 4px 6px rgba(0,0,0,0.1)); }
.ph-app-name { font-size: 14px; font-weight: 700; color: #0F172A; }
.ph-app-detail { font-size: 11px; color: #94A3B8; margin-top: 4px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; }

/* 4. Estimating & Supply */
.ph-est-note { 
    padding: 20px; 
    background: #FFFBEB; 
    border: 1px solid #FEF3C7;
    border-radius: 16px; 
    margin-bottom: 24px; 
    font-size: 14px; 
    color: #92400E; 
    display: flex;
    gap: 12px;
    align-items: flex-start;
}
.ph-est-note::before { content: '💡'; font-size: 18px; }
.ph-est-grid { display: grid; grid-template-columns: 1fr !important; gap: 12px; margin-top: 16px; }
.ph-est-card { 
    background: #F8FAFC; 
    padding: 18px 24px; 
    border-radius: 16px; 
    border: 1px solid #F1F5F9;
    display: flex;
    justify-content: space-between;
    align-items: center;
}
.ph-est-card-label { font-size: 11px; font-weight: 800; color: #94A3B8; text-transform: uppercase; letter-spacing: 0.05em; }
.ph-est-card-val { font-size: 15px; font-weight: 600; color: #1E293B; }

.ph-est-table-wrap { border: 1px solid #F1F5F9; border-radius: 16px; overflow: hidden; }
.ph-est-table { width: 100%; border-collapse: collapse; background: #FFF; }
.ph-est-table th { background: #F8FAFC; text-align: left; padding: 14px 20px; font-size: 11px; font-weight: 800; text-transform: uppercase; color: #64748B; border-bottom: 1px solid #F1F5F9; }
.ph-est-table td { padding: 14px 20px; border-bottom: 1px solid #F8FAFC; font-size: 14px; color: #1E293B; font-weight: 600; }
.ph-est-table tr:hover td { background: #F8FAFC; }

/* 5. FAQ Premium Accordion */
.ph-faq-list { display: flex; flex-direction: column; gap: 10px; }
.ph-faq-item { border: 1px solid #F1F5F9; border-radius: 16px; background: #F8FAFC; transition: all 0.2s; overflow: hidden; }
.ph-faq-item[open] { border-color: #FACC15; background: #FFFFFF; box-shadow: 0 4px 12px rgba(0,0,0,0.04); }
.ph-faq-q { 
    width: 100%;
    padding: 18px 20px;
    text-align: left;
    cursor: pointer; 
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 14px;
    font-size: 14px;
    font-weight: 600;
    color: #0F172A;
    font-family: 'Outfit', sans-serif;
    list-style: none;
}
.ph-faq-q::-webkit-details-marker { display: none; }
.ph-faq-q:focus-visible { outline: 2px solid rgba(250, 204, 21, 0.55); outline-offset: 2px; border-radius: 12px; }
.ph-faq-qtext { flex: 1; }
.ph-faq-chevron { width: 18px; height: 18px; stroke: #94A3B8; stroke-width: 2.5; transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1); }
.ph-faq-item[open] .ph-faq-chevron { transform: rotate(180deg); stroke: #FACC15; }
.ph-faq-a-inner { padding: 0 20px 18px; font-size: 14px; color: #475569; line-height: 1.65; }
.ph-faq-a-inner p { margin: 0; }

/* 6. Delivery cards */
.ph-delivery-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 16px; margin-top: 18px; }
.ph-delivery-card { padding: 22px; background: #FFFFFF; border: 1px solid #F1F5F9; border-radius: 20px; display: flex; gap: 16px; transition: transform 0.2s, box-shadow 0.2s, border-color 0.2s; box-shadow: 0 2px 4px rgba(0,0,0,0.02); }
.ph-delivery-card:hover { border-color: #FACC15; transform: translateY(-2px); box-shadow: 0 12px 24px rgba(0,0,0,0.06); }
.ph-delivery-icon { width: 48px; height: 48px; border-radius: 14px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.ph-ico-yellow { background: #FEFCE8; color: #854D0E; }
.ph-ico-blue { background: #F0F9FF; color: #0369A1; }
.ph-ico-green { background: #F0FDF4; color: #15803D; }
.ph-ico-red { background: #FFF1F2; color: #BE123C; }
.ph-delivery-icon svg { stroke: currentColor; }
.ph-delivery-title { font-size: 14px; font-weight: 700; color: #0F172A; margin-bottom: 3px; }
.ph-delivery-text { font-size: 13px; color: #64748B; line-height: 1.5; }
.ph-delivery-note { margin-top: 24px; padding: 18px 20px; background: #FEFCE8; border: 1px solid #FEF3C7; border-radius: 16px; display: flex; gap: 14px; align-items: center; }
.ph-delivery-note-ico { font-size: 18px; line-height: 1; }
.ph-delivery-note-text { font-size: 13px; font-weight: 600; color: #854D0E; }

/* 6. Document Visual Cards */
.ph-doc-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 12px; }
.ph-doc-card { 
    display: flex; flex-direction: column; align-items: center; gap: 12px; padding: 24px 20px; 
    background: #FFFFFF; border: 1px solid #F1F5F9; border-radius: 20px; cursor: pointer; transition: all 0.2s;
}
.ph-doc-card:hover { border-color: #FACC15; transform: translateY(-4px); box-shadow: 0 12px 24px rgba(0,0,0,0.06); }
.ph-doc-badge { 
    width: 48px; height: 48px; border-radius: 12px; background: #FEF08A; 
    display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 800; color: #854D0E;
}
.ph-doc-title { font-size: 13px; font-weight: 700; color: #0F172A; text-align: center; line-height: 1.4; }

/* Mobile Optimizations */
@media (max-width: 600px) {
    .ph-panel { padding: 24px 16px; }
    .ph-panel-heading { font-size: 22px; }
    .ph-feat-list { grid-template-columns: 1fr; }
    .ph-spec-grid, .ph-app-grid, .ph-doc-grid { grid-template-columns: repeat(2, 1fr); gap: 8px; }
    .ph-tab-btn { padding: 10px 14px; font-size: 12px; }
}

/* ---- FEATURES & BENEFITS - INDUSTRIAL GEOMETRIC ---- */
#tab-features{padding:0}

#tab-features h3{font-size:26px;font-weight:800;color:#111827;margin:0 0 32px 0;letter-spacing:-0.5px;font-family:'Outfit','Inter',sans-serif;text-transform:uppercase;position:relative;display:flex;align-items:center;gap:16px}

#tab-features h3::before{content:'';flex:1;height:2px;background:linear-gradient(90deg,#facc15 0%,transparent 100%)}

#tab-features h3::after{content:'';width:12px;height:12px;background:#facc15;transform:rotate(45deg)}

#tab-features ul{display:flex;flex-direction:column;gap:12px;padding:0;margin:0;list-style:none}

/* Industrial Data Slices */
#tab-features li{display:flex;align-items:center;padding:16px;background:#ffffff;border-left:4px solid #f3f4f6;margin-bottom:0;transition:all 0.3s cubic-bezier(0.65,0,0.35,1);position:relative;cursor:pointer}

#tab-features li:hover{border-left-color:#facc15;background:#fefce8;transform:translateX(6px);box-shadow:inset -20px 0 0 -15px rgba(250,204,21,0.1)}

#tab-features li span:first-child{font-size:10px;font-weight:900;color:#9ca3af;text-transform:uppercase;letter-spacing:0.15em;width:150px;flex-shrink:0;font-family:'Outfit','Inter',sans-serif}

#tab-features li span:last-child{font-size:14px;font-weight:700;color:#111827;font-family:'Outfit','Inter',sans-serif;letter-spacing:0.02em}

#tab-features li strong{color:#111827;font-weight:900}

/* Icon-like accent */
#tab-features li::before{content:'✓';position:absolute;right:16px;font-size:16px;color:#facc15;opacity:0;transition:opacity 0.3s ease;font-weight:900}

#tab-features li:hover::before{opacity:1}

/* Geometric accent bar animation */
@keyframes slideIn{
  from{border-left-color:#f3f4f6;transform:translateX(-6px)}
  to{border-left-color:#facc15;transform:translateX(0)}
}

/* Staggered entrance */
#tab-features li{animation:featureSlide 0.5s ease-out backwards}
#tab-features li:nth-child(1){animation-delay:0.08s}
#tab-features li:nth-child(2){animation-delay:0.12s}
#tab-features li:nth-child(3){animation-delay:0.16s}
#tab-features li:nth-child(4){animation-delay:0.2s}
#tab-features li:nth-child(5){animation-delay:0.24s}
#tab-features li:nth-child(6){animation-delay:0.28s}
#tab-features li:nth-child(7){animation-delay:0.32s}
#tab-features li:nth-child(8){animation-delay:0.36s}
#tab-features li:nth-child(9){animation-delay:0.4s}
#tab-features li:nth-child(10){animation-delay:0.44s}

@keyframes featureSlide{
  from{opacity:0;transform:translateX(-12px);border-left-color:#f3f4f6}
  to{opacity:1;transform:translateX(0);border-left-color:#f3f4f6}
}

/* Metric accent box - geometric */
#tab-features .ph-metric-box{background:#facc15;padding:24px;display:flex;align-items:center;justify-content:space-between;position:relative;clip-path:polygon(8% 0,100% 0,100% 88%,92% 100%,0 100%,0 12%);margin:28px 0}

#tab-features .ph-metric-box span{font-size:12px;font-weight:900;color:#111827;text-transform:uppercase;letter-spacing:0.1em;font-family:'Outfit',sans-serif}

/* Mobile responsive */
@media(max-width:768px){
  #tab-features h3{font-size:20px;margin-bottom:24px;flex-direction:column;align-items:flex-start}
  #tab-features h3::before{flex:none;width:100%;margin-bottom:12px}
  #tab-features h3::after{display:none}
  #tab-features ul{gap:8px}
  #tab-features li{padding:14px;gap:12px}
  #tab-features li span:first-child{width:120px;font-size:9px}
  #tab-features li span:last-child{font-size:13px}
  #tab-features li::before{right:12px;font-size:14px}
  #tab-features .ph-metric-box{padding:20px;margin:20px 0}
}

.ph-specs-table{width:100%;border-collapse:collapse;font-size:13px}
.ph-specs-table th,.ph-specs-table td{padding:11px 16px;text-align:left;border-bottom:1px solid var(--border)}
.ph-specs-table th{background:#F9F8F6;font-weight:600;width:35%}
.ph-specs-table td{color:var(--text-2)}
.ph-specs-table tr:last-child th,.ph-specs-table tr:last-child td{border-bottom:none}
/* Reviews */
.ph-review-card{background:#FAFAF9;border:1px solid var(--border);border-radius:var(--r-md);padding:16px;margin-bottom:12px}
.ph-review-header{display:flex;align-items:center;gap:12px;margin-bottom:8px}
.ph-review-avatar{width:38px;height:38px;border-radius:50%;background:var(--amber-lt);display:flex;align-items:center;justify-content:center;font-family:var(--font-d);font-size:16px;font-weight:700;color:var(--amber);flex-shrink:0}
.ph-review-meta{flex:1}
.ph-review-name{font-size:13px;font-weight:600;color:var(--text)}
.ph-review-date{font-size:11px;color:var(--stone);margin-top:1px}
.ph-review-stars{color:var(--amber);font-size:13px;letter-spacing:.5px}
.ph-review-body{font-size:13px;color:var(--text-2);line-height:1.65}

/* ---- RELATED PRODUCTS GRID ---- */
.ph-related-section{margin-top:60px; font-family:'Inter',sans-serif; *{box-sizing:border-box;}}
.ph-related-header{display:flex;align-items:center;justify-content:space-between;margin-bottom:20px}
.ph-related-header h2{font-family:'Outfit',sans-serif;font-size:24px;font-weight:800;text-transform:uppercase;letter-spacing:-0.5px; margin:0; color:#0f172a;}
.ph-related-track{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:16px}

/* Footer width alignment for this template */
.site-footer .phst-container{max-width:1936px;padding-left:24px;padding-right:24px}

/* ---- STICKY BOTTOM BAR ---- */
.ph-sticky-bottom{position:fixed;bottom:0;left:0;right:0;z-index:200;background:rgba(255,255,255,.95);backdrop-filter:blur(14px);border-top:1px solid var(--border);box-shadow:0 -4px 24px rgba(0,0,0,.08);transform:translateY(100%);transition:transform .3s cubic-bezier(.25,.8,.25,1)}
.ph-sticky-bottom.visible{transform:translateY(0)}
.ph-sticky-bottom-inner{max-width:1936px;margin:0 auto;padding:12px 24px;display:flex;align-items:center;gap:14px}
.ph-sticky-product-thumb{width:44px;height:44px;object-fit:contain;border-radius:8px;border:1px solid var(--border);background:#fff;padding:3px}
.ph-sticky-name{font-size:13px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:320px}
.ph-sticky-price{display:flex;align-items:center;gap:4px}
.ph-sticky-price span{font-size:14px;font-weight:700;font-family:var(--font-d)}
.ph-sticky-atc{margin-left:auto;background:var(--amber);color:#fff;padding:0 24px;height:40px;border-radius:10px;font-family:var(--font-d);font-size:14px;font-weight:700;transition:background .2s;border:none;cursor:pointer}
.ph-sticky-atc:hover{background:#eab308}

/* ---- ZOOM OVERLAY ---- */
.ph-zoom-overlay{position:fixed;inset:0;z-index:9000;background:rgba(0,0,0,.84);backdrop-filter:blur(10px);display:flex;align-items:center;justify-content:center;opacity:0;pointer-events:none;transition:opacity .25s}
.ph-zoom-overlay.open{opacity:1;pointer-events:all}
.ph-zoom-container{position:relative;max-width:88vw;max-height:88vh}
.ph-zoom-image{max-width:700px;max-height:85vh;object-fit:contain;border-radius:16px;box-shadow:0 24px 80px rgba(0,0,0,.5);transform:scale(.9);transition:transform .3s cubic-bezier(.25,.8,.25,1)}
.ph-zoom-overlay.open .ph-zoom-image{transform:scale(1)}
.ph-zoom-close-btn{position:absolute;top:-16px;right:-16px;width:36px;height:36px;background:rgba(255,255,255,.15);color:#fff;border-radius:50%;font-size:20px;display:flex;align-items:center;justify-content:center;cursor:pointer;border:none;transition:background .2s}
.ph-zoom-close-btn:hover{background:rgba(255,255,255,.3)}
.ph-zoom-hint{position:absolute;bottom:-28px;left:50%;transform:translateX(-50%);color:rgba(255,255,255,.4);font-size:12px;white-space:nowrap;pointer-events:none}

/* ---- MODALS ---- */
.ph-modal-overlay{position:fixed;inset:0;z-index:8500;background:rgba(0,0,0,.5);backdrop-filter:blur(4px);display:flex;align-items:center;justify-content:center}
.ph-modal-overlay.hidden{display:none}
.ph-modal-box{background:#fff;border-radius:var(--r-lg);padding:28px;max-width:420px;width:90%;box-shadow:0 24px 60px rgba(0,0,0,.2)}
.ph-modal-header{display:flex;align-items:center;justify-content:space-between;margin-bottom:16px}
.ph-modal-header h3{font-family:var(--font-d);font-size:18px;font-weight:700}
.ph-modal-close{font-size:22px;color:var(--stone);cursor:pointer;background:none;border:none;line-height:1}
.ph-modal-close:hover{color:var(--text)}
.ph-modal-content p{font-size:14px;color:var(--text-2);margin-bottom:8px}
.ph-modal-content ul{padding-left:18px}
.ph-modal-content li{font-size:14px;color:var(--text-2);margin-bottom:6px}
.ph-modal-footer{margin-top:20px;text-align:right}
.ph-modal-btn{background:var(--text);color:#fff;padding:10px 22px;border-radius:10px;font-weight:600;font-size:14px;cursor:pointer;border:none;transition:background .2s}
.ph-modal-btn:hover{background:#333}
/* Quote modal */
.ph-quote-modal-overlay{position:fixed;inset:0;z-index:8500;background:rgba(0,0,0,.5);backdrop-filter:blur(4px);display:none;align-items:center;justify-content:center}
.ph-quote-modal-overlay.open{display:flex}
.ph-quote-modal-content{background:#fff;border-radius:var(--r-lg);padding:28px;max-width:480px;width:90%;box-shadow:0 24px 60px rgba(0,0,0,.2);position:relative;max-height:90vh;overflow-y:auto}
.ph-qm-close-btn{position:absolute;top:18px;right:18px;width:32px;height:32px;border-radius:50%;border:1.5px solid var(--border);display:flex;align-items:center;justify-content:center;background:#fff;cursor:pointer}
.ph-qm-title{font-family:var(--font-d);font-size:20px;font-weight:700;margin-bottom:8px}
.ph-qm-desc{font-size:14px;color:var(--stone);margin-bottom:20px}
.ph-qm-group{display:flex;flex-direction:column;gap:6px;margin-bottom:14px}
.ph-qm-label{font-size:12px;font-weight:600}
.ph-qm-input{height:42px;border:1.5px solid var(--border);border-radius:var(--r-sm);padding:0 12px;font-size:14px;font-family:var(--font-b);transition:border-color .2s}
.ph-qm-input:focus{outline:none;border-color:var(--amber)}
.ph-qm-success{display:none;text-align:center;padding:20px 0}
.ph-qm-success-icon{width:56px;height:56px;background:#F0FDF4;border-radius:50%;display:flex;align-items:center;justify-content:center;margin:0 auto 16px}
.ph-qm-success-icon svg{width:28px;height:28px;color:var(--green)}
/* PDF modal */
.ph-pdf-modal-overlay{position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.8);backdrop-filter:blur(8px);display:none;align-items:center;justify-content:center}
.ph-pdf-modal-overlay.open{display:flex}
.ph-pdf-modal-content{background:#fff;border-radius:12px;width:96%;max-width:1200px;height:94vh;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 40px 120px rgba(0,0,0,.5);position:relative}
.ph-pdf-modal-header{display:flex;align-items:center;justify-content:space-between;padding:16px 24px;border-bottom:1px solid var(--border);background:#fff;flex-shrink:0}
.ph-pdf-modal-title-row{display:flex;align-items:center;gap:12px}
.ph-pdf-modal-title-row h3{font-family:var(--font-d);font-size:18px;font-weight:700;color:var(--text)}
.ph-file-ext{background:var(--red);color:#fff;font-size:11px;font-weight:800;padding:4px 8px;border-radius:4px;letter-spacing:.05em}
.ph-pdf-close-btn{width:36px;height:36px;border-radius:50%;border:1px solid var(--border);display:flex;align-items:center;justify-content:center;background:#fff;cursor:pointer;transition:all .2s}
.ph-pdf-close-btn:hover{background:#f3f4f6;transform:rotate(90deg)}
.ph-docs-tabs-bar{padding:12px 24px;border-bottom:1px solid var(--border);background:#f9fafb;flex-shrink:0}
.ph-docs-tabs-label{font-size:11px;font-weight:700;text-transform:uppercase;color:var(--stone);margin-bottom:10px;letter-spacing:.08em}
.ph-docs-tabs-list{display:flex;gap:10px;flex-wrap:wrap}
.ph-doc-tab{padding:6px 16px;border-radius:20px;font-size:13px;font-weight:600;border:1.5px solid var(--border);background:#fff;cursor:pointer;transition:all .2s;color:var(--text-2)}
.ph-doc-tab.active,.ph-doc-tab:hover{background:var(--amber);color:#000;border-color:var(--amber);box-shadow:0 4px 12px var(--amber-lt)}
.ph-pdf-viewer-frame{flex:1;width:100%;border:none;background:#525659}

/* ======== QUICK CART DRAWER ======== */
.ph-qc-backdrop{position:fixed;inset:0;background:rgba(0,0,0,.45);backdrop-filter:blur(3px);z-index:8000;opacity:0;pointer-events:none;transition:opacity .3s}
.ph-qc-backdrop.active{opacity:1;pointer-events:all}
.ph-qc-drawer{position:fixed;top:0;right:0;bottom:0;width:420px;max-width:100vw;background:#fff;z-index:8100;display:flex;flex-direction:column;box-shadow:-8px 0 48px rgba(0,0,0,.18);transform:translateX(110%);transition:transform .35s cubic-bezier(.25,.8,.25,1);border-radius:16px 0 0 16px;overflow:hidden}
.ph-qc-drawer.open{transform:translateX(0)}
.ph-qc-header{display:flex;align-items:center;justify-content:space-between;padding:18px 20px;border-bottom:1px solid var(--border);background:#FAFAF9;flex-shrink:0}
.ph-qc-header-left{display:flex;align-items:center;gap:8px;font-family:var(--font-d);font-size:17px;font-weight:700}
.ph-qc-header-left svg{width:20px;height:20px;color:var(--amber)}
.ph-qc-count{background:var(--amber);color:#fff;font-size:11px;font-weight:700;width:22px;height:22px;border-radius:50%;display:flex;align-items:center;justify-content:center;flex-shrink:0}
.ph-qc-close-btn{width:34px;height:34px;border-radius:50%;border:1.5px solid var(--border);display:flex;align-items:center;justify-content:center;background:#fff;cursor:pointer;transition:background .15s}
.ph-qc-close-btn:hover{background:#F3F4F6}
.ph-qc-close-btn svg{width:16px;height:16px;color:var(--stone)}
.ph-qc-banner{display:flex;align-items:center;gap:8px;background:#F0FDF4;border-bottom:1px solid #BBF7D0;font-size:13px;font-weight:600;color:#15803D;flex-shrink:0;overflow:hidden;max-height:0;opacity:0;padding:0 20px;transition:max-height .3s,opacity .3s,padding .3s}
.ph-qc-banner.show{max-height:48px;opacity:1;padding:10px 20px}
.ph-qc-banner svg{flex-shrink:0;width:16px;height:16px}
.ph-qc-items{flex:1;overflow-y:auto;padding:8px 20px;display:flex;flex-direction:column;scrollbar-width:thin;scrollbar-color:var(--border) transparent}
.ph-qc-items::-webkit-scrollbar{width:4px}
.ph-qc-items::-webkit-scrollbar-thumb{background:var(--border);border-radius:2px}
.ph-qc-loading{display:flex;align-items:center;justify-content:center;gap:10px;padding:48px 20px;color:#9CA3AF;font-size:13px}
.ph-qc-spinner-ring{width:20px;height:20px;border:2.5px solid var(--border);border-top-color:var(--amber);border-radius:50%;animation:ph-spin .7s linear infinite}
.ph-qc-empty{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;padding:56px 20px;color:#9CA3AF;text-align:center}
.ph-qc-empty svg{opacity:.35}
.ph-qc-empty p{font-size:14px;font-weight:500}
.ph-qc-item{display:flex;align-items:flex-start;gap:12px;padding:14px 0;border-bottom:1px solid #F3F4F6;transition:opacity .2s,transform .25s}
.ph-qc-item:last-child{border-bottom:none}
.ph-qc-item.removing{opacity:0;transform:translateX(20px)}
.ph-qc-item-img{width:66px;height:66px;border-radius:10px;border:1.5px solid #F3F4F6;background:#FAFAF9;display:flex;align-items:center;justify-content:center;flex-shrink:0;overflow:hidden;padding:4px}
.ph-qc-item-img img{width:100%;height:100%;object-fit:contain}
.ph-qc-item-info{flex:1;min-width:0}
.ph-qc-item-name{font-size:13px;font-weight:600;line-height:1.35;margin-bottom:4px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.ph-qc-item-variant{font-size:11px;color:#9CA3AF;margin-bottom:6px}
.ph-qc-item-meta{display:flex;align-items:center;gap:8px}
.ph-qc-item-price{font-family:var(--font-d);font-size:14px;font-weight:700;color:var(--amber)}
.ph-qc-item-qty{font-size:12px;color:#9CA3AF;font-weight:500}
.ph-qc-item-remove{width:26px;height:26px;border-radius:50%;border:1px solid var(--border);background:#fff;display:flex;align-items:center;justify-content:center;cursor:pointer;flex-shrink:0;margin-top:2px;transition:background .15s,border-color .15s;color:#9CA3AF}
.ph-qc-item-remove:hover{background:#FEF2F2;border-color:#FECACA;color:#EF4444}
.ph-qc-item-remove svg{width:13px;height:13px}
.ph-qc-summary{padding:14px 20px;border-top:1px solid var(--border);background:#FAFAF9;flex-shrink:0}
.ph-qc-summary-row{display:flex;justify-content:space-between;align-items:center;font-size:13px;color:var(--text-2);padding:3px 0}
.ph-qc-summary-row.ph-qc-total{font-weight:700;font-size:15px;color:var(--text)}
.ph-qc-free{color:var(--green);font-weight:700;font-size:12px}
.ph-qc-actions{padding:14px 20px 20px;display:flex;flex-direction:column;gap:8px;flex-shrink:0;background:#fff;border-top:1px solid var(--border)}
.ph-qc-btn{width:100%;height:48px;border-radius:12px;font-family:var(--font-d);font-size:15px;font-weight:700;cursor:pointer;border:none;transition:background .2s,transform .15s;display:flex;align-items:center;justify-content:center;text-decoration:none}
.ph-qc-btn:hover{transform:translateY(-1px)}
.ph-qc-btn-checkout{background:var(--amber);color:#0f172a;box-shadow:0 4px 14px var(--amber-glow)}
.ph-qc-btn-checkout:hover{background:#eab308}
.ph-qc-btn-cart{background:var(--text);color:#fff}
.ph-qc-btn-cart:hover{background:#222}
.ph-qc-btn-continue{background:transparent;color:var(--stone);font-size:13px;height:36px;font-weight:600}
.ph-qc-btn-continue:hover{background:#F9F8F6;color:var(--text-2);transform:none}

@keyframes ph-spin{to{transform:rotate(360deg)}}

/* Responsive */
@media(max-width:1518px){.ph-product-grid{grid-template-columns:minmax(0, 4fr) minmax(0, 3.8fr) minmax(0, 2.2fr);gap:20px}.ph-related-track{grid-template-columns:repeat(3,1fr)}}
@media(max-width:900px){.ph-product-grid{grid-template-columns:1fr 1fr;height:auto;}.ph-buybox{grid-column:1/-1;position:static}.ph-related-track{grid-template-columns:repeat(3,1fr)}}
@media(max-width:600px){
  /* 1. Prevent Horizonal Scroll Entirely */
  body, html { width: 100%; max-width: 100%; overflow-x: hidden; }
  .ph-page { padding: 4px 8px 100px !important; width: 100%; max-width: 100%; overflow-x: hidden; box-sizing: border-box; }
  
  /* 2. Fix Grid Blowout */
  .ph-product-grid { display: grid; grid-template-columns: minmax(0, 1fr) !important; width: 100%; max-width: 100%; gap: 16px; height: auto; }
  .ph-gallery, .ph-info, .ph-buybox { min-width: 0 !important; max-width: 100% !important; width: 100% !important; box-sizing: border-box !important; }
  
  /* 3. Strip Dead Paddings */
  .ph-info { padding: 14px 10px !important; border-radius: 12px; overflow: hidden; }
  .ph-buybox { padding: 14px 10px !important; border-radius: 12px; overflow: hidden; }
  
  /* 4. Main Image (Zero padding, maximum sizing) */
  .ph-gallery { flex-direction: column; gap: 12px; align-items: center; position: relative !important; z-index: 1; }
  .ph-main-image { width: 100%; aspect-ratio: unset !important; height: auto; min-height: 240px; display: flex !important; flex-direction: column !important; align-items: center; justify-content: center; padding: 0 !important; box-sizing: border-box; background: transparent; box-shadow: none; }
  .ph-main-image-inner { width: 100%; order: 1; }
  .ph-main-image-img { width: auto !important; height: auto !important; max-width: 100%; max-height: 280px; object-fit: contain; padding: 0 !important; border-radius: 10px; mix-blend-mode: multiply; }
  
  /* Thumbnails */
  .ph-thumbs { position: relative !important; left: auto !important; top: auto !important; bottom: auto !important; flex-direction: row; width: 100%; max-height: none; overflow-x: auto; overflow-y: visible; gap: 8px; padding-bottom: 5px; justify-content: center; order: 2; z-index: 10; padding-right: 0; }
  .ph-thumb { width: 60px !important; height: 60px !important; flex-shrink: 0; box-shadow: 0 1px 4px rgba(0,0,0,0.08); padding: 4px; transform: none !important; }
  
  /* 5. Fonts & Alignment */
  .ph-title { font-size: 18px; line-height: 1.3; }
  .ph-price-num { font-size: 24px; }
  .ph-aed-label { max-width: 22px !important; }
  .ph-buybox-total-amount { font-size: 24px !important; }
  
  .ph-free-contact { flex-direction: column; align-items: flex-start; gap: 10px; padding: 10px !important; }
  .ph-contact-btns { width: 100%; justify-content: flex-start; margin-top: 4px; }
  .ph-delivery-options { flex-direction: column; gap: 10px; }
  .ph-delivery-card { padding: 10px !important; }
  
  .ph-trust { gap: 6px; }
  .ph-trust-strip { width: 100%; max-width: 100%; overflow: hidden; border-radius: 10px; }
  .ph-trust-inner { padding-bottom: 4px; scrollbar-width: none; }
  .ph-badge { min-width: 65px; padding: 8px 4px; }
  .ph-badge-name { font-size: 8px; } .ph-badge-sub { font-size: 7px; }

  /* 6. Fix Related products - 2 Column Grid! */
  .ph-related-track { display: grid !important; grid-template-columns: repeat(2, 1fr) !important; gap: 6px !important; margin: 0 !important; padding: 0 !important; overflow: visible !important; }
  .ph-related-track > div { flex: none !important; max-width: 100% !important; scroll-snap-align: none !important; }
  
  /* Ultra-Micro Layout to fit 2 cards comfortably */
  .ph-ncard { min-height: 270px !important; border-radius: 8px !important; }
  .ph-ncard .rounded-b-xl { border-radius: 0 0 8px 8px !important; }
  
  /* ---> SINGLE LINE FOR PRODUCT NAMES (SEO Supported) <--- */
  .nc-top-title { font-size: 11px !important; padding: 5px 8px !important; white-space: nowrap !important; overflow: hidden !important; text-overflow: ellipsis !important; }
  .ph-ncard h3 { white-space: nowrap !important; overflow: hidden !important; text-overflow: ellipsis !important; display: block !important; margin-bottom: 4px !important; }
  
  .ph-ncard .aspect-\[10\/11\] { padding: 6px !important; height: auto; }
  .ph-ncard .p-4 { padding: 12px 10px 6px 10px !important; }
  
  /* Shrink Inner Fonts - ENLARGED FOR Readability */
  .ph-ncard .text-\[14px\] { font-size: 13px !important; line-height: 1.25 !important; }
  .ph-ncard .text-\[20px\] { font-size: 16px !important; }
  .ph-ncard .text-\[13px\] { font-size: 11.5px !important; }
  .ph-ncard .text-\[10px\] { font-size: 9px !important; }
  
  /* Bottom Action Bar Details */
  .ph-ncard .h-\[60px\] { height: 48px !important; }
  .ph-ncard .pl-5 { padding-left: 10px !important; }
  .ph-ncard .w-\[64px\] { width: 44px !important; }
  .nc-arrow-right, .nc-arrow-up { width: 22px !important; height: 22px !important; }
  
  /* Slide-up Expand Drawer Details */
  .ph-ncard .bottom-\[60px\] { bottom: 48px !important; }
  .ph-ncard .h-\[52px\] { height: 65px !important; }
  
  /* Qty Controls in narrow space */
  .ph-ncard .w-\[110px\] { width: 62px !important; }
  .ph-ncard .w-\[34px\] { width: 20px !important; }
  .ph-ncard .nc-qty-val { font-size: 13px !important; }
  
  /* ---> SINGLE LINE FOR WHATSAPP/ATC BUTTONS (Bigger and Bolder) <--- */
  .nc-btn-text, .nc-success { font-size: 10px !important; font-weight: 800 !important; white-space: nowrap !important; text-align: center; letter-spacing: 0 !important; padding: 0 4px; overflow: hidden !important; text-overflow: ellipsis !important; display: flex !important; align-items: center !important; justify-content: center !important; width: 100% !important; height: 100% !important; margin: 0 auto; }
  .nc-atc-btn svg { width: 14px !important; height: 14px !important; flex-shrink: 0; }
  
  .ph-ncard a[href^="https://wa.me"] { gap: 4px !important; padding: 0 8px !important; letter-spacing: 0 !important; flex-wrap: nowrap !important; justify-content: center !important; }
  .ph-ncard a[href^="https://wa.me"] span { font-size: 9.5px !important; font-weight: 800 !important; white-space: nowrap !important; overflow: hidden !important; text-overflow: ellipsis !important; display: inline-block !important; text-align: left !important; flex: 0 1 auto; margin-top: 0 !important; }
  .ph-ncard a[href^="https://wa.me"] svg { width: 15px !important; height: 15px !important; flex-shrink: 0; }

  /* Quick Cart Drawer */
  .ph-qc-drawer { width: 100vw; border-radius: 16px 16px 0 0; top: auto; height: 90vh; transform: translateY(110%); }
  .ph-qc-drawer.open { transform: translateY(0); }
}
</style>

<script>
window.phProductPrice  = <?php echo json_encode($price); ?>;
window.phAjaxUrl       = '<?php echo esc_url(admin_url('admin-ajax.php')); ?>';
window.phWcAjaxUrl     = '<?php echo esc_url(add_query_arg('wc-ajax', 'add_to_cart', home_url('/'))); ?>';
window.phNonce         = '<?php echo $atc_nonce; ?>';
window.phCheckoutUrl   = '<?php echo esc_url(wc_get_checkout_url()); ?>';
window.phCartUrl       = '<?php echo esc_url(wc_get_cart_url()); ?>';
window.phProductId     = <?php echo $product_id; ?>;
window.phCurrency      = '<?php echo esc_js($currency); ?>';

/* ---- Data 2373: Download Docs ---- */
window.phProductDocs = <?php echo wp_json_encode(array_values($unique_docs)); ?>;

window.data2373 = function() {
    if (window.phProductDocs && window.phProductDocs.length > 0) {
        phOpenPdfModal(window.phProductDocs, "<?php echo esc_js($product->get_name()); ?>");
    } else {
        alert("No documents available for this product.");
    }
};
</script>

<div class="ph-zoom-overlay" id="zoomOverlay">
  <div class="ph-zoom-container">
    <button class="ph-zoom-close-btn" onclick="phCloseZoom()">×</button>
    <img src="" alt="" class="ph-zoom-image" id="zoomImage">
    <span class="ph-zoom-hint">Click outside or press ESC to close</span>
  </div>
</div>

<div class="ph-qc-backdrop" id="phQcBackdrop" onclick="phCloseQuickCart()"></div>

<div class="ph-qc-drawer" id="phQcDrawer">
  <div class="ph-qc-header">
    <div class="ph-qc-header-left">
      <svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z"/></svg>
      Your Cart
      <span class="ph-qc-count" id="phQcCount">0</span>
    </div>
    <button class="ph-qc-close-btn" onclick="phCloseQuickCart()">
      <svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
    </button>
  </div>
  <div class="ph-qc-banner" id="phQcBanner">
    <svg fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/></svg>
    <span id="phQcBannerText">Added to cart!</span>
  </div>
  <div class="ph-qc-items" id="phQcItems">
    <div class="ph-qc-loading">
      <div class="ph-qc-spinner-ring"></div>
      <span>Loading cart…</span>
    </div>
  </div>
  <div class="ph-qc-summary" id="phQcSummary" style="display:none;">
    <div class="ph-qc-summary-row ph-qc-total">
      <span id="phQcItemLabel">0 items</span>
      <span id="phQcSubtotal">AED 0.00</span>
    </div>
    <div class="ph-qc-summary-row">
      <span>Delivery</span>
      <span class="ph-qc-free">FREE</span>
    </div>
  </div>
  <div class="ph-qc-actions">
    <a href="<?php echo esc_url(wc_get_checkout_url()); ?>" class="ph-qc-btn ph-qc-btn-checkout">Proceed to Checkout</a>
    <a href="<?php echo esc_url(wc_get_cart_url()); ?>"     class="ph-qc-btn ph-qc-btn-cart">View Cart</a>
    <button class="ph-qc-btn ph-qc-btn-continue" onclick="phCloseQuickCart()">Continue Shopping</button>
  </div>
</div>

<div id="deliveryModal" class="ph-modal-overlay hidden">
  <div class="ph-modal-box">
    <div class="ph-modal-header">
      <h3 id="deliveryModalTitle">Delivery Details</h3>
      <button class="ph-modal-close" onclick="phCloseDeliveryModal()">✕</button>
    </div>
    <div class="ph-modal-content">
      <p><strong>Charges are based on:</strong></p>
      <ul>
        <li>Distance to your location</li>
        <li>Order weight &amp; size</li>
        <li>Delivery time slot selected</li>
      </ul>
      <p style="margin-top:12px;font-size:13px;color:#666;">Final charge calculated at checkout.</p>
    </div>
    <div class="ph-modal-footer">
      <button class="ph-modal-btn" onclick="phCloseDeliveryModal()">Close</button>
    </div>
  </div>
</div>

<div class="ph-quote-modal-overlay" id="quoteModal">
  <div class="ph-quote-modal-content">
    <button class="ph-qm-close-btn" onclick="phCloseQuoteModal()">
      <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
    </button>
    <div id="quoteFormWrapper">
      <h3 class="ph-qm-title">Request a Quote</h3>
      <p class="ph-qm-desc">Our B2B sales team will respond with pricing for <strong id="quoteModalProductName"></strong>.</p>
      <form id="quoteForm" onsubmit="phSubmitQuote(event)">
        <input type="hidden" id="quoteProductNameInput" name="product_name">
        <input type="hidden" id="quoteProductSkuInput"  name="product_sku">
        <div class="ph-qm-group"><label class="ph-qm-label">Full Name *</label><input type="text" class="ph-qm-input" name="full_name" required placeholder="John Doe"></div>
        <div class="ph-qm-group"><label class="ph-qm-label">Company Name</label><input type="text" class="ph-qm-input" name="company_name" placeholder="Acme Corp LLC"></div>
        <div class="ph-qm-group"><label class="ph-qm-label">Work Email *</label><input type="email" class="ph-qm-input" name="email" required placeholder="john@company.com"></div>
        <div class="ph-qm-group"><label class="ph-qm-label">Phone Number *</label><input type="tel" class="ph-qm-input" name="phone" required placeholder="+971 50 123 4567"></div>
        <button type="submit" class="ph-quote-btn ph-quote-btn-primary" style="margin-top:16px;width:100%;">Submit Request</button>
      </form>
    </div>
    <div class="ph-qm-success" id="quoteSuccessState">
      <div class="ph-qm-success-icon"><svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/></svg></div>
      <h3 class="ph-qm-title">Request Received!</h3>
      <p class="ph-qm-desc">Our team will contact you shortly with pricing.</p>
      <button class="ph-quote-btn ph-quote-btn-primary" onclick="phCloseQuoteModal()">Close</button>
    </div>
  </div>
</div>

<div class="ph-pdf-modal-overlay" id="pdfModalOverlay">
  <div class="ph-pdf-modal-content">
    <div class="ph-pdf-modal-header">
      <div class="ph-pdf-modal-title-row">
        <div class="ph-file-ext">PDF</div>
        <h3 id="pdfModalTitle">Document Preview</h3>
      </div>
      <div style="display:flex; align-items:center; gap:12px;">
        <a id="pdfDownloadBtn" href="#" target="_blank" download class="ph-modal-btn" style="padding:7px 16px; display:inline-flex; align-items:center; gap:6px; font-size:13px; text-decoration:none;">
          <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg> Download
        </a>
        <button class="ph-pdf-close-btn" onclick="phClosePdfModal()">
          <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
        </button>
      </div>
    </div>
    <div class="ph-docs-tabs-bar" id="pdfDocsTabs" style="display:none;">
      <div class="ph-docs-tabs-label">Documents:</div>
      <div class="ph-docs-tabs-list" id="pdfDocsTabsList"></div>
    </div>
    <iframe id="pdfViewerFrame" class="ph-pdf-viewer-frame" src="" type="application/pdf"></iframe>
  </div>
</div>

<div class="ph-page">

<style>
  .breadcrumb-wrap {
    display: inline-flex;
    filter: drop-shadow(0 3px 10px rgba(0,0,0,0.09));
    margin: 10px 0 16px;
  }

  .breadcrumb-nav {
    display: flex;
    align-items: stretch;
    height: 26px;
    overflow-x: auto;
    hide-scrollbar: none;
  }
  .breadcrumb-nav::-webkit-scrollbar { display: none; }

  .breadcrumb-nav a,
  .breadcrumb-nav .current {
    display: flex;
    align-items: center;
    padding: 0 20px 0 12px;
    font-family: 'Inter', sans-serif;
    font-size: 10.5px;
    font-weight: 500;
    text-decoration: none;
    clip-path: polygon(0 0, calc(100% - 9px) 0, 100% 50%, calc(100% - 9px) 100%, 0 100%, 9px 50%);
    margin-right: 1px;
    transition: background 0.2s, color 0.2s;
    white-space: nowrap;
    letter-spacing: 0.02em;
  }

  .breadcrumb-nav a:first-child {
    clip-path: polygon(0 0, calc(100% - 9px) 0, 100% 50%, calc(100% - 9px) 100%, 0 100%);
    padding-left: 16px;
    border-radius: 5px 0 0 5px;
  }

  .breadcrumb-nav a                { background: #ffffff; color: #c0c0c0; }
  .breadcrumb-nav a:nth-child(2)   { background: #fafafa; }
  .breadcrumb-nav a:nth-child(3)   { background: #f5f5f5; }
  .breadcrumb-nav a:nth-child(4)   { background: #f0f0f0; }
  .breadcrumb-nav a:hover          { color: #333; }

  .breadcrumb-nav .current {
    background: rgba(245, 194, 0, 0.4);
    color: #332800;
    font-weight: 600;
    clip-path: polygon(0 0, 100% 0, 100% 100%, 0 100%, 9px 50%);
    padding-right: 20px;
    border-radius: 0 5px 5px 0;
    font-size: 10.5px;
  }
</style>
<?php
ob_start();
woocommerce_breadcrumb(array(
    'delimiter'   => '',
    'wrap_before' => '<div class="breadcrumb-wrap"><nav class="breadcrumb-nav" aria-label="Breadcrumb">',
    'wrap_after'  => '</nav></div>',
    'before'      => '',
    'after'       => '',
));
$bc = ob_get_clean();
$bc = preg_replace('/<\/a>\s*([^<]+)[ \t\s]*<\/nav>/', '</a><span class="current">$1</span></nav>', $bc);
echo $bc;
?>

  <div class="ph-product-grid">

    <div class="ph-gallery">

      <div class="ph-main-image" id="phMainImageWrap">
        
        <div class="ph-thumbs">
          <?php
          if ( $use_gcs ) {
            echo '<img class="ph-thumb active" src="' . esc_url($gcs_main) . '" data-full="' . esc_url($gcs_main) . '" alt="' . esc_attr($product->get_name()) . '">';
            $gi = 2;
            foreach ( $gcs_gallery as $gu ) {
              echo '<img class="ph-thumb" src="' . esc_url($gu) . '" data-full="' . esc_url($gu) . '" alt="' . esc_attr($product->get_name() . ' View ' . $gi) . '">';
              $gi++;
            }
          } else {
            $att_ids = $product->get_gallery_image_ids();
            if ( $post_thumbnail_id ) {
              $ts  = wp_get_attachment_image_url( $post_thumbnail_id, 'woocommerce_gallery_thumbnail' );
              $fs  = wp_get_attachment_image_url( $post_thumbnail_id, 'full' );
              if ( $ph_ssl ) { $ts = $ts ? set_url_scheme($ts,'https') : $ts; $fs = $fs ? set_url_scheme($fs,'https') : $fs; }
              if ( ! $ts ) $ts = wc_placeholder_img_src();
              if ( ! $fs ) $fs = wc_placeholder_img_src();
              $alt = get_post_meta( $post_thumbnail_id, '_wp_attachment_image_alt', true ) ?: $product->get_name();
              echo '<img class="ph-thumb active" src="' . esc_url($ts) . '" data-full="' . esc_url($fs) . '" alt="' . esc_attr($alt) . '">';
            }
            $gi = 2;
            foreach ( $att_ids as $aid ) {
              $ts  = wp_get_attachment_image_url( $aid, 'woocommerce_gallery_thumbnail' );
              $fs  = wp_get_attachment_image_url( $aid, 'full' );
              if ( $ph_ssl ) { $ts = $ts ? set_url_scheme($ts,'https') : $ts; $fs = $fs ? set_url_scheme($fs,'https') : $fs; }
              if ( ! $ts ) $ts = wc_placeholder_img_src();
              if ( ! $fs ) $fs = wc_placeholder_img_src();
              $alt = get_post_meta( $aid, '_wp_attachment_image_alt', true ) ?: ($product->get_name() . ' View ' . $gi);
              echo '<img class="ph-thumb" src="' . esc_url($ts) . '" data-full="' . esc_url($fs) . '" alt="' . esc_attr($alt) . '">';
              $gi++;
            }
          }
          ?>
        </div>

        <div class="ph-main-image-inner" onclick="phOpenZoom()" style="width:100%; height:100%; display:flex; align-items:center; justify-content:center;">
          <?php
          if ( $use_gcs ) {
            echo '<img id="mainProductImage" class="ph-main-image-img" loading="eager"
                       src="' . esc_url($gcs_main) . '" alt="' . esc_attr($main_img_alt) . '">';
          } elseif ( $post_thumbnail_id ) {
            $full = wp_get_attachment_image_url( $post_thumbnail_id, 'full' );
            if ( $ph_ssl && $full ) $full = set_url_scheme($full,'https');
            if ( ! $full ) $full = wc_placeholder_img_src();
            echo '<img id="mainProductImage" class="ph-main-image-img" loading="eager"
                       src="' . esc_url($full) . '" alt="' . esc_attr($main_img_alt) . '">';
          } else {
            $ph = wc_placeholder_img_src();
            if ( $ph_ssl && $ph ) $ph = set_url_scheme($ph,'https');
            echo '<img id="mainProductImage" class="ph-main-image-img"
                       src="' . esc_url($ph) . '" alt="' . esc_attr($product->get_name()) . '">';
          }
          if ( $product->is_featured() ) echo '<div class="ph-badge-featured">Best Seller</div>';
          if ( $discount_percentage > 0 ) echo '<div class="ph-badge-sale">−' . $discount_percentage . '%</div>';
          ?>
          <div class="ph-zoom-hint-badge">
            <svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M21 21l-4.35-4.35M17 11A6 6 0 115 11a6 6 0 0112 0z"/></svg>
            Click to zoom
          </div>
        </div>

      </div>

    </div><div class="ph-info">

      <?php
      if ( $brand ) {
        $bl = get_term_link( sanitize_title($brand), 'product_brand' );
        if ( ! is_wp_error($bl) ) {
          echo '<a href="' . esc_url($bl) . '" class="ph-brand">' . esc_html($brand) . '</a>';
        } else {
          echo '<span class="ph-brand">' . esc_html($brand) . '</span>';
        }
      }
      ?>

      <div style="display:flex; align-items:center; gap:12px; margin-bottom:4px; flex-wrap: wrap;">
        <h1 class="ph-title" style="margin-bottom:0;"><?php echo esc_html( $product->get_name() ); ?></h1>
        <?php if ( $has_downloads ) : ?>
          <div class="inputs" style="padding: 0px;"> 
            <button type="button" class="btn downloadbtn" style="padding: 4px 15px; border: none; background-color: var(--amber); color: #000; border-radius: 4px; font-weight: 700; cursor: pointer; font-size: 13px; text-transform: uppercase; box-shadow: 0 2px 6px var(--amber-glow);" onclick="data2373()">Download</button> 
          </div>
        <?php endif; ?>
      </div>
      <div class="ph-sku">SKU: <?php echo esc_html( $product->get_sku() ?: '—' ); ?></div>

      <div class="ph-rating-row">
        <span class="ph-stars">
          <?php $r = $average_rating ?: 4.7; for ($i=1;$i<=5;$i++) echo $i<=round($r)?'★':'☆'; ?>
        </span>
        <span class="ph-rating-num"><?php echo number_format($r,1); ?></span>
        <span class="ph-rating-count">(<?php echo $rating_count ?: 8; ?> reviews)</span>
      </div>

      <?php if ( $price > 0 ) : ?>
      <div class="ph-price-block">
        <div class="ph-price-main">
          <img src="<?php echo esc_url($aed_symbol_url); ?>" alt="AED" class="ph-aed-label">
          <span class="ph-price-num"><?php echo number_format($price,2); ?></span>
          <span class="ph-vat-tag">Incl. VAT</span>
        </div>
        <?php if ( $regular_price > $price ) : ?>
        <div class="ph-price-compare">
          <span class="ph-price-old"><?php echo $currency; ?> <?php echo number_format($regular_price,2); ?></span>
          <span class="ph-discount-pill"><?php echo $discount_percentage; ?>% OFF</span>
        </div>
        <?php endif; ?>
      </div>
      <?php endif; ?>

      <?php if ( $product->get_short_description() ) : ?>
      <div class="ph-highlights">
        <div class="ph-highlights-label">Highlights</div>
        <?php echo wp_kses_post( $product->get_short_description() ); ?>
      </div>
      <?php endif; ?>

      <?php if ( $product->is_type('variable') ) :
        $attrs = $product->get_variation_attributes(); ?>
      <div class="ph-options-block">
        <div class="ph-options-title">Select Options</div>
        <?php foreach ( $attrs as $attr_name => $opts ) :
          $attr_label = wc_attribute_label($attr_name); ?>
        <div class="ph-var-row">
          <label class="ph-var-label"><?php echo esc_html($attr_label); ?></label>
          <select class="ph-select variation-select"
                  name="attribute_<?php echo esc_attr(sanitize_title($attr_name)); ?>"
                  data-attribute_name="attribute_<?php echo esc_attr(sanitize_title($attr_name)); ?>">
            <option value="">Choose <?php echo esc_html($attr_label); ?></option>
            <?php foreach ($opts as $opt) : ?>
            <option value="<?php echo esc_attr($opt); ?>"><?php echo esc_html($opt); ?></option>
            <?php endforeach; ?>
          </select>
        </div>
        <?php endforeach; ?>
      </div>
      <?php endif; ?>

      <div class="ph-delivery-options">
        <div class="ph-delivery-card selected">
          <div class="ph-delivery-header">
            <span style="font-weight:700;font-size:13px;">⚡ Superfast</span>
            <button class="ph-delivery-info-btn" onclick="phOpenDeliveryModal('superfast')">
              <svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
            </button>
          </div>
          <div class="ph-delivery-body">
            <div><div class="ph-delivery-label">Same Day</div><div class="ph-delivery-sub">Within 3 hours</div></div>
            <div class="ph-delivery-price">AED 60</div>
          </div>
        </div>
        <div class="ph-delivery-card">
          <div class="ph-delivery-header">
            <span style="font-weight:700;font-size:13px;">🚚 Standard</span>
            <button class="ph-delivery-info-btn" onclick="phOpenDeliveryModal('standard')">
              <svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
            </button>
          </div>
          <div class="ph-delivery-body">
            <div><div class="ph-delivery-label">Next Day</div><div class="ph-delivery-sub">Before 10 PM</div></div>
            <div class="ph-delivery-price">FREE</div>
          </div>
        </div>
      </div>

      <div class="ph-free-contact">
        <div class="ph-free-info">
          <div class="ph-free-icon"><svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg></div>
          <div class="ph-free-text">
            <strong>Free UAE Delivery on orders over AED 200</strong>
            <span>Dispatched from Dubai · Covers all 7 Emirates</span>
          </div>
        </div>
        <div class="ph-contact-btns">
          <a href="<?php echo esc_url($wa_url); ?>" class="ph-contact-btn" target="_blank" rel="noopener">
            <svg viewBox="0 0 24 24" fill="#25D366" width="18" height="18"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/></svg>
          </a>
          <a href="tel:+971547656789" class="ph-contact-btn">
            <svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" width="18" height="18"><path d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"/></svg>
          </a>
        </div></div><?php if ( $has_downloads ) :
          $dlabels = [];
          foreach ($unique_docs as $udoc) {
              $type = strtoupper($udoc['type'] ?: 'Document');
              if ($type === 'TDS') $dlabels[] = 'Datasheet';
              elseif ($type === 'SDS') $dlabels[] = 'SDS';
              elseif ($type === 'MS') $dlabels[] = 'Method';
              else $dlabels[] = $udoc['title'] ?: 'Document';
          }
          $dlabels = array_unique($dlabels);
          $docs_json = json_encode(array_values($unique_docs), JSON_HEX_QUOT|JSON_HEX_APOS);
      ?>
      <div class="ph-asset-module" onclick='phOpenPdfModal(<?php echo $docs_json; ?>,"<?php echo esc_js($product->get_name()); ?>")'>
        <div class="ph-icon-shield"><svg width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" viewBox="0 0 24 24"><path d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"/></svg></div>
        <div class="ph-content">
          <span class="ph-asset-title"><?php echo esc_html($product->get_name()); ?></span>
          <span class="ph-asset-subtitle">Documentation: <?php echo esc_html(implode(', ',$dlabels)); ?></span>
        </div>
        <div class="ph-action-box"><svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path stroke-linecap="round" stroke-linejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/></svg></div>
      </div>
      <?php endif; ?>

      <div class="ph-trust-strip">
        <div class="ph-trust-inner">
          <div class="ph-badge">
            <div class="ph-badge-icon" style="background:linear-gradient(135deg,#d1fae5,#a7f3d0)"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#059669" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z"/><path d="M8 12l2.5 2.5L16 9"/></svg></div>
            <div class="ph-badge-label"><span class="ph-badge-name">Cash on</span><span class="ph-badge-sub">Delivery</span></div>
          </div>
          <div class="ph-badge">
            <div class="ph-badge-icon" style="background:linear-gradient(135deg,#dbeafe,#bfdbfe)"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#2563eb" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 10h18M3 14h18M3 6h18a2 2 0 012 2v8a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2z"/><path d="M7 10v4"/></svg></div>
            <div class="ph-badge-label"><span class="ph-badge-name">7-Day</span><span class="ph-badge-sub">Returns</span></div>
          </div>
          <div class="ph-badge">
            <div class="ph-badge-icon" style="background:linear-gradient(135deg,#fce7f3,#fbcfe8)"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#db2777" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg></div>
            <div class="ph-badge-label"><span class="ph-badge-name">Free</span><span class="ph-badge-sub">Delivery</span></div>
          </div>
          <div class="ph-badge">
            <div class="ph-badge-icon" style="background:linear-gradient(135deg,#fef3c7,#fde68a)"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#d97706" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg></div>
            <div class="ph-badge-label"><span class="ph-badge-name">Fulfilled</span><span class="ph-badge-sub">by Pilehead</span></div>
          </div>
          <div class="ph-badge">
            <div class="ph-badge-icon" style="background:linear-gradient(135deg,#d1fae5,#a7f3d0)"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg></div>
            <div class="ph-badge-label"><span class="ph-badge-name">100%</span><span class="ph-badge-sub">Secure</span></div>
          </div>
          <div class="ph-badge">
            <div class="ph-badge-icon" style="background:linear-gradient(135deg,#ede9fe,#ddd6fe)"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#7c3aed" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg></div>
            <div class="ph-badge-label"><span class="ph-badge-name">100%</span><span class="ph-badge-sub">Genuine</span></div>
          </div>
        </div>
      </div>

    </div><div class="ph-buybox">

      <?php if ( $price > 0 ) : ?>
      <div>
        <div class="ph-buybox-price-label">Total Price</div>
        <div class="ph-buybox-total">
          <img src="<?php echo esc_url($aed_symbol_url); ?>" alt="AED" class="ph-buybox-total-currency">
          <span class="ph-buybox-total-amount" id="ph-buybox-price"><?php echo number_format($price,2); ?></span>
        </div>
        <?php if ( $product->is_on_sale() ) : ?>
        <div style="font-size:12px;color:var(--green);margin-top:4px;font-weight:600;">
          You save <?php echo $currency; ?> <?php echo number_format($regular_price-$price,2); ?> (<?php echo $discount_percentage; ?>% OFF)
        </div>
        <?php endif; ?>
      </div>
      <div class="ph-buybox-divider"></div>
      <div>
        <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:var(--stone);margin-bottom:10px;">Quantity</div>
        <div class="ph-sidebar-qty">
          <button class="ph-sidebar-qty-btn" id="ph-qty-minus">−</button>
          <input type="number" class="ph-sidebar-qty-input" id="ph-qty-input" value="1" min="1" max="99">
          <button class="ph-sidebar-qty-btn" id="ph-qty-plus">+</button>
        </div>
      </div>
      <button type="button" class="ph-sidebar-atc" id="ph-sidebar-atc"
        data-product-id="<?php echo $product_id; ?>"
        data-product-type="<?php echo esc_attr($product->get_type()); ?>"
        <?php echo !$product->is_in_stock() ? 'disabled' : ''; ?>>
        <span class="ph-atc-text"><?php echo $product->is_in_stock() ? 'Add to Cart' : 'Out of Stock'; ?></span>
        <svg class="ph-atc-spinner" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
        </svg>
      </button>
      <button type="button" class="ph-sidebar-buy" id="ph-sidebar-buy">Buy Now</button>
      <div class="ph-buybox-divider"></div>
      <?php
      // BNPL — only show if price > 0
      $install = number_format($price/4, 2);
      ?>
      <div>
        <div class="ph-bnpl-title">Buy Now, Pay Later</div>
        <div class="ph-bnpl-cards">
          <div class="ph-bnpl-card">
            <div class="ph-bnpl-header">
              <span style="font-weight:800;font-size:14px;color:#3D1A6E;">tabby</span>
              <div><div class="ph-bnpl-amount">AED <?php echo $install; ?></div><div class="ph-bnpl-per">/ month × 4</div></div>
            </div>
            <div class="ph-bnpl-dots">
              <div class="ph-dot" style="background:var(--amber)"></div><div class="ph-dot-line"></div>
              <div class="ph-dot" style="background:var(--border)"></div><div class="ph-dot-line"></div>
              <div class="ph-dot" style="background:var(--border)"></div><div class="ph-dot-line"></div>
              <div class="ph-dot" style="background:var(--border)"></div>
            </div>
            <div class="ph-bnpl-timeline"><span>Today</span><span>Month 2</span><span>Month 3</span><span>Month 4</span></div>
          </div>
          <div class="ph-bnpl-card">
            <div class="ph-bnpl-header">
              <span style="font-weight:800;font-size:14px;color:#00B2A9;">tamara</span>
              <div><div class="ph-bnpl-amount">AED <?php echo $install; ?></div><div class="ph-bnpl-per">/ month × 4</div></div>
            </div>
            <div class="ph-bnpl-dots">
              <div class="ph-dot" style="background:var(--amber)"></div><div class="ph-dot-line"></div>
              <div class="ph-dot" style="background:var(--border)"></div><div class="ph-dot-line"></div>
              <div class="ph-dot" style="background:var(--border)"></div><div class="ph-dot-line"></div>
              <div class="ph-dot" style="background:var(--border)"></div>
            </div>
            <div class="ph-bnpl-timeline"><span>Today</span><span>Month 2</span><span>Month 3</span><span>Month 4</span></div>
          </div>
        </div>
      </div>

      <?php else : /* B2B QUOTE BOX */ ?>
      <div>
        <span class="ph-quote-badge">Corporate &amp; B2B</span>
        <div class="ph-quote-title">Price on Request</div>
        <div class="ph-quote-subtitle">Contact our technical sales team for volume pricing.</div>
      </div>
      <div class="ph-buybox-divider"></div>
      <div>
        <span class="ph-quote-qty-label">Quantity Required</span>
        <div class="ph-quote-qty-row">
          <button type="button" id="ph-quote-qty-minus">−</button>
          <input type="number" id="ph-quote-qty-input" value="1" min="1" max="999">
          <button type="button" id="ph-quote-qty-plus">+</button>
        </div>
      </div>
      <button class="ph-quote-btn ph-quote-btn-primary"
        onclick="phOpenQuoteModal('<?php echo esc_js($product->get_name()); ?>','<?php echo esc_js($product->get_sku() ?: 'N/A'); ?>')">
        Request Official Quote
      </button>
      <button class="ph-quote-btn ph-quote-btn-wa"
        onclick="window.open('<?php echo esc_url($wa_url); ?>','_blank')">
        <svg fill="currentColor" viewBox="0 0 24 24" width="18" height="18"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/></svg>
        WhatsApp Us
      </button>
      <?php endif; ?>

    </div></div>

<style>
/* ======================================================
   PILEHEAD — Redesigned Product Tabs v3.0
   Clean, flat, well-aligned — drop-in replacement
====================================================== */

/* ── Tab Card Wrapper ── */
.ph-tabs-card {
    background: var(--card, #ffffff);
    border: 0.5px solid var(--border, #E5E7EB);
    border-radius: 16px;
    overflow: hidden;
    margin-top: 48px;
    font-family: var(--font-b, 'Inter', sans-serif);
}

/* ── Navigation Bar ── */
.ph-tab-nav {
    display: flex;
    overflow-x: auto;
    scrollbar-width: none;
    background: #F8F9FA;
    border-bottom: 0.5px solid #E5E7EB;
    padding: 6px 8px;
    gap: 2px;
    position: sticky;
    top: 0;
    z-index: 50;
}
.ph-tab-nav::-webkit-scrollbar { display: none; }

.ph-tab-btn {
    flex-shrink: 0;
    padding: 8px 14px;
    font-size: 12px;
    font-weight: 500;
    color: #6B7280;
    background: transparent;
    border: 0.5px solid transparent;
    border-radius: 8px;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 6px;
    transition: background 0.15s, color 0.15s, border-color 0.15s;
    white-space: nowrap;
    font-family: var(--font-b, 'Inter', sans-serif);
}
.ph-tab-btn:hover {
    background: #ffffff;
    color: #0A0A0A;
}
.ph-tab-btn.active {
    background: #ffffff;
    color: #0A0A0A;
    border-color: #D1D5DB;
    font-weight: 600;
}

/* Tab count badge */
.ph-tab-count {
    min-width: 16px;
    height: 16px;
    background: #E5E7EB;
    color: #6B7280;
    border-radius: 10px;
    font-size: 10px;
    font-weight: 600;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0 4px;
}
.ph-tab-btn.active .ph-tab-count {
    background: #FEF3C7;
    color: #92400E;
}

/* ── Panel Base ── */
.ph-panel {
    display: none;
    padding: 28px 32px;
    animation: phFadeIn 0.2s ease;
}
.ph-panel.active { display: block; }

@keyframes phFadeIn {
    from { opacity: 0; transform: translateY(4px); }
    to   { opacity: 1; transform: translateY(0); }
}

/* ── Section Label ── */
.ph-section-label {
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    color: #9CA3AF;
    margin-bottom: 14px;
    display: flex;
    align-items: center;
    gap: 10px;
}
.ph-section-label::after {
    content: '';
    flex: 1;
    height: 0.5px;
    background: #E5E7EB;
}

/* ── Section Title ── */
.ph-section-title {
    font-family: var(--font-d, 'Outfit', sans-serif);
    font-size: 20px;
    font-weight: 700;
    color: #0A0A0A;
    margin-bottom: 6px;
}
.ph-section-sub {
    font-size: 13px;
    color: #6B7280;
    margin-bottom: 24px;
    line-height: 1.7;
    max-width: 680px;
}

/* ── Spec Grid ── */
.ph-spec-grid-new {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
    gap: 1px;
    background: #E5E7EB;
    border: 0.5px solid #E5E7EB;
    border-radius: 12px;
    overflow: hidden;
    margin-bottom: 20px;
}
.ph-spec-row-new {
    background: #ffffff;
    padding: 13px 16px;
    display: flex;
    flex-direction: column;
    gap: 3px;
}
.ph-spec-lbl {
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: #9CA3AF;
}
.ph-spec-val {
    font-size: 13px;
    font-weight: 600;
    color: #0A0A0A;
    line-height: 1.4;
}

/* ── Spec Tables (PDF extracted) ── */
#ph-panel-specifications table {
    width: 100%;
    border-collapse: collapse;
    table-layout: auto;
    min-width: 720px;
}
#ph-panel-specifications th,
#ph-panel-specifications td {
    padding: 12px 14px;
    border-bottom: 0.5px solid #F3F4F6;
    vertical-align: top;
    font-size: 13px;
    line-height: 1.55;
    color: #374151;
    word-break: break-word;
    background: #ffffff !important;
}
#ph-panel-specifications th {
    font-weight: 600;
    color: #0A0A0A;
    background: #F9FAFB !important;
}
#ph-panel-specifications tr:nth-child(even) td { background: #FCFCFD !important; }
#ph-panel-specifications table p { margin: 0; }

/* ── Feature List ── */
.ph-feat-list-new {
    display: flex;
    flex-direction: column;
    gap: 0;
    border: 0.5px solid #E5E7EB;
    border-radius: 12px;
    overflow: hidden;
}
.ph-feat-row {
    display: flex;
    align-items: flex-start;
    gap: 12px;
    padding: 14px 16px;
    background: #ffffff;
    border-bottom: 0.5px solid #F3F4F6;
    transition: background 0.15s;
}
.ph-feat-row:last-child { border-bottom: none; }
.ph-feat-row:hover { background: #FAFAF9; }
.ph-feat-dot-new {
    width: 20px;
    height: 20px;
    border-radius: 50%;
    background: #FEF3C7;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    margin-top: 1px;
}
.ph-feat-dot-new svg {
    width: 10px;
    height: 10px;
    stroke: #92400E;
    stroke-width: 2.5;
    fill: none;
}
.ph-feat-title-new {
    font-size: 13px;
    font-weight: 600;
    color: #0A0A0A;
    margin-bottom: 2px;
}
.ph-feat-desc-new {
    font-size: 12px;
    color: #6B7280;
    line-height: 1.55;
}

/* ── Application Grid ── */
.ph-app-grid-new {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(130px, 1fr));
    gap: 8px;
    margin-bottom: 16px;
}
.ph-app-card-new {
    border: 0.5px solid #E5E7EB;
    border-radius: 12px;
    padding: 18px 12px;
    text-align: center;
    background: #ffffff;
    transition: border-color 0.15s, background 0.15s;
}
.ph-app-card-new:hover {
    border-color: #D1D5DB;
    background: #FAFAF9;
}
.ph-app-icon-new { font-size: 22px; margin-bottom: 8px; line-height: 1; }
.ph-app-name-new { font-size: 12px; font-weight: 600; color: #0A0A0A; margin-bottom: 2px; line-height: 1.3; }
.ph-app-type-new { font-size: 10px; color: #9CA3AF; text-transform: uppercase; letter-spacing: 0.06em; }

/* ── Info Note ── */
.ph-info-note {
    display: flex;
    gap: 10px;
    padding: 12px 16px;
    background: #FFFBEB;
    border: 0.5px solid #FDE68A;
    border-radius: 10px;
    font-size: 12px;
    color: #92400E;
    line-height: 1.55;
}
.ph-info-note-icon { font-size: 13px; flex-shrink: 0; margin-top: 1px; }

/* ── Estimating Table ── */
.ph-est-table-wrap {
    border: 0.5px solid #E5E7EB;
    border-radius: 12px;
    overflow: hidden;
}
.ph-est-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 13px;
    table-layout: fixed;
}
.ph-est-table th {
    background: #F9FAFB;
    padding: 10px 16px;
    text-align: left;
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: #9CA3AF;
    border-bottom: 0.5px solid #E5E7EB;
}
.ph-est-table td {
    padding: 12px 16px;
    border-bottom: 0.5px solid #F3F4F6;
    color: #374151;
    line-height: 1.4;
}
.ph-est-table tr:last-child td { border-bottom: none; }
.ph-est-table tr:hover td { background: #FAFAF9; }
.ph-est-table td:first-child { font-weight: 600; color: #0A0A0A; }

/* ── FAQ Accordion ── */
.ph-faq-list-new {
    display: flex;
    flex-direction: column;
    gap: 0;
    border: 0.5px solid #E5E7EB;
    border-radius: 12px;
    overflow: hidden;
}
.ph-faq-item-new {
    border-bottom: 0.5px solid #F3F4F6;
}
.ph-faq-item-new:last-child { border-bottom: none; }

.ph-faq-q-new {
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 14px 16px;
    background: #ffffff;
    cursor: pointer;
    text-align: left;
    gap: 12px;
    border: none;
    font-family: var(--font-b, 'Inter', sans-serif);
    transition: background 0.15s;
}
.ph-faq-q-new:hover { background: #FAFAF9; }

.ph-faq-qtext-new {
    font-size: 13px;
    font-weight: 600;
    color: #0A0A0A;
    line-height: 1.4;
    flex: 1;
}
.ph-faq-chevron-new {
    width: 16px;
    height: 16px;
    flex-shrink: 0;
    color: #9CA3AF;
    transition: transform 0.2s;
    stroke: currentColor;
    fill: none;
    stroke-width: 2;
    stroke-linecap: round;
    stroke-linejoin: round;
}
.ph-faq-item-new.open .ph-faq-chevron-new { transform: rotate(180deg); }

.ph-faq-a-new {
    display: none;
    padding: 0 16px 14px 16px;
    font-size: 13px;
    color: #6B7280;
    line-height: 1.65;
}
.ph-faq-item-new.open .ph-faq-a-new { display: block; }

/* ── Document Grid ── */
.ph-doc-grid-new {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
    gap: 8px;
    margin-bottom: 16px;
}
.ph-doc-card-new {
    border: 0.5px solid #E5E7EB;
    border-radius: 12px;
    padding: 18px 14px;
    text-align: center;
    background: #ffffff;
    cursor: pointer;
    transition: border-color 0.15s, background 0.15s;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 10px;
}
.ph-doc-card-new:hover {
    border-color: #D1D5DB;
    background: #FFFBEB;
}
.ph-doc-badge-new {
    width: 40px;
    height: 40px;
    border-radius: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 11px;
    font-weight: 700;
    background: #FEF3C7;
    color: #92400E;
}
.ph-doc-name-new {
    font-size: 12px;
    font-weight: 600;
    color: #0A0A0A;
    line-height: 1.3;
}
.ph-doc-type-new {
    font-size: 10px;
    color: #9CA3AF;
}

/* ── Delivery Cards ── */
.ph-del-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
    gap: 8px;
    margin-bottom: 20px;
}
.ph-del-card {
    border: 0.5px solid #E5E7EB;
    border-radius: 12px;
    padding: 16px;
    background: #ffffff;
    display: flex;
    gap: 12px;
    align-items: flex-start;
    transition: border-color 0.15s;
}
.ph-del-card:hover { border-color: #D1D5DB; }
.ph-del-ico {
    width: 36px;
    height: 36px;
    border-radius: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
}
.ph-del-ico svg { width: 18px; height: 18px; fill: none; stroke-width: 2; }
.ph-del-title { font-size: 13px; font-weight: 600; color: #0A0A0A; margin-bottom: 3px; }
.ph-del-text  { font-size: 12px; color: #6B7280; line-height: 1.5; }

/* Responsive */
@media (max-width: 768px) {
    .ph-panel { padding: 20px 16px; }
    .ph-spec-grid-new { grid-template-columns: repeat(2, 1fr); }
    .ph-app-grid-new  { grid-template-columns: repeat(2, 1fr); }
    .ph-doc-grid-new  { grid-template-columns: repeat(2, 1fr); }
    .ph-del-grid      { grid-template-columns: 1fr; }
}
@media (max-width: 480px) {
    .ph-spec-grid-new { grid-template-columns: 1fr; }
}
</style>

<article class="ph-tabs-card">

    <!-- ── TAB NAVIGATION ─────────────────────────── -->
    <nav class="ph-tab-nav" id="phTabNav" role="tablist">

        <button class="ph-tab-btn active" data-tab="overview" role="tab">Overview</button>

        <?php
        $features_html = get_post_meta( $product_id, 'ph_tab_features_html', true )
            ?: get_post_meta( $product_id, 'ph_tab_benefits_html', true )
            ?: get_post_meta( $product_id, '_features_benefits', true )
            ?: get_post_meta( $product_id, 'features_html', true );
        $feat_count = 0;
        if ( $features_html && preg_match_all( '/<li/i', $features_html, $fm ) ) {
            $feat_count = count( $fm[0] );
        }
        ?>
        <button class="ph-tab-btn" data-tab="features" role="tab">
            Features <?php if ( $feat_count ) echo '<span class="ph-tab-count">' . $feat_count . '</span>'; ?>
        </button>

        <?php
        $spec_html  = get_post_meta( $product_id, 'ph_tab_specifications_html', true )
            ?: get_post_meta( $product_id, 'specifications_html', true );
        $spec_count = count( $product->get_attributes() );
        if ( $spec_html && preg_match_all( '/<tr|ph-spec-row/i', $spec_html, $sm ) ) {
            $spec_count += count( $sm[0] );
        }
        if ( $spec_html && $spec_count === 0 ) {
            if ( preg_match_all( '/<td\b/i', $spec_html, $tm ) ) {
                $spec_count = max( 1, (int) floor( count( $tm[0] ) / 2 ) );
            } else {
                $spec_count = 1;
            }
        }
        ?>
        <button class="ph-tab-btn" data-tab="specifications" role="tab">
            Specifications <span class="ph-tab-count"><?php echo (int) $spec_count; ?></span>
        </button>

        <button class="ph-tab-btn" data-tab="applications" role="tab">Applications</button>
        <button class="ph-tab-btn" data-tab="estimating"   role="tab">Estimating</button>

        <button class="ph-tab-btn" data-tab="faqs" role="tab">
            FAQs <span class="ph-tab-count"><?php echo (int) $faqs_count; ?></span>
        </button>

        <?php if ( $has_downloads ) : ?>
        <button class="ph-tab-btn" data-tab="documents" role="tab">
            Documents <span class="ph-tab-count"><?php echo count( $unique_docs ); ?></span>
        </button>
        <?php endif; ?>

        <button class="ph-tab-btn" data-tab="delivery" role="tab">Delivery</button>

    </nav>

    <!-- ══════════════════════════════════════════════
         PANEL 1 — OVERVIEW
    ══════════════════════════════════════════════ -->
    <section class="ph-panel active" id="ph-panel-overview" role="tabpanel">

        <div class="ph-section-label">Product overview</div>
        <div class="ph-section-title"><?php the_title(); ?></div>

        <?php
        $overview_content = get_post_meta( $product_id, 'ph_tab_overview_html', true )
            ?: get_post_meta( $product_id, 'ph_tab_description_html', true )
            ?: $product->get_description();
        ?>
        <?php
        $overview_text = wp_strip_all_tags( $overview_content );
        $overview_text = preg_replace( '/\s+/', ' ', $overview_text );

        $where_to_use_items = [];
        if ( preg_match( '/(?:including|such\s+as)\s*:?\s*(.+?)(?:\.\s|$)/i', $overview_text, $wm ) ) {
            $chunk = $wm[1];
            $chunk = preg_replace( '/[•▪■◆◼◻]+/u', '|', $chunk );
            $chunk = str_replace( [ '', '', '', '', '●', '○', '|' ], '|', $chunk );
            $chunk = preg_replace( '/\s*\|\s*/', '|', $chunk );
            $parts = array_filter( array_map( 'trim', explode( '|', $chunk ) ) );
            if ( count( $parts ) < 2 ) {
                $parts = array_filter( array_map( 'trim', preg_split( '/\s*,\s*/', $chunk ) ) );
            }
            foreach ( $parts as $p ) {
                $p = preg_replace( '/^\s*(?:and|&)\s+/i', '', $p );
                if ( $p !== '' ) $where_to_use_items[] = $p;
            }
        }

        echo wp_kses_post( $overview_content );
        ?>

        <?php if ( ! empty( $where_to_use_items ) ) : ?>
        <div class="ph-section-label" style="margin-top:22px">Where to use</div>
        <div class="ph-feat-list-new">
            <?php foreach ( array_slice( $where_to_use_items, 0, 10 ) as $witem ) : ?>
            <div class="ph-feat-row">
                <div class="ph-feat-dot-new">
                    <svg viewBox="0 0 10 10"><polyline points="1.5,5 4,8 8.5,2"/></svg>
                </div>
                <div>
                    <div class="ph-feat-title-new"><?php echo esc_html( $witem ); ?></div>
                </div>
            </div>
            <?php endforeach; ?>
        </div>
        <?php endif; ?>

        <?php
        $attribs       = $product->get_attributes();
        $overview_attrs = array_slice( $attribs, 0, 4, true );
        if ( ! empty( $overview_attrs ) ) :
        ?>
        <div class="ph-section-label" style="margin-top:24px">Quick specs</div>
        <div class="ph-spec-grid-new" style="grid-template-columns: repeat(4, 1fr)">
            <?php foreach ( $overview_attrs as $attr ) :
                if ( ! $attr->get_visible() ) continue;
                $label = wc_attribute_label( $attr->get_name() );
                $val   = implode( ', ', $attr->is_taxonomy()
                    ? wc_get_product_terms( $product_id, $attr->get_name(), ['fields'=>'names'] )
                    : $attr->get_options() );
            ?>
            <div class="ph-spec-row-new">
                <span class="ph-spec-lbl"><?php echo esc_html( $label ); ?></span>
                <span class="ph-spec-val"><?php echo esc_html( $val ); ?></span>
            </div>
            <?php endforeach; ?>
        </div>
        <?php endif; ?>

    </section>

    <!-- ══════════════════════════════════════════════
         PANEL 2 — FEATURES
    ══════════════════════════════════════════════ -->
    <section class="ph-panel" id="ph-panel-features" role="tabpanel">

        <div class="ph-section-label">Key features &amp; benefits</div>

        <?php if ( $features_html ) : ?>

            <?php if ( strpos( $features_html, '<li' ) !== false ) :
                preg_match_all( '/<li[^>]*>(.*?)<\/li>/is', $features_html, $matches ); ?>
            <div class="ph-feat-list-new">
                <?php
                $raw_items = [];
                foreach ( $matches[1] as $feat_text ) {
                    $clean = strip_tags( $feat_text );
                    $clean = html_entity_decode( $clean, ENT_QUOTES | ENT_HTML5, 'UTF-8' );
                    $clean = preg_replace( '/\s+/', ' ', $clean );
                    $clean = preg_replace( '/^[\s\x{00A0}\x{200B}\x{FEFF}]*/u', '', $clean );
                    $clean = preg_replace( '/^[✓✔☑✅●○]+\s*/u', '', $clean );
                    $clean = preg_replace( '/^\s*[\-\–\—•▪■◆◼◻]+\s*/u', '', $clean );
                    $clean = trim( $clean );
                    if ( $clean !== '' ) $raw_items[] = $clean;
                }

                $items = [];
                foreach ( $raw_items as $it ) {
                    $prev_i = count( $items ) - 1;
                    if ( $prev_i >= 0 ) {
                        $prev = $items[$prev_i];
                        $prev_trim = rtrim( $prev );
                        $should_merge =
                            preg_match( '/-$/', $prev_trim ) ||
                            preg_match( '/^[a-z]/', $it ) ||
                            strlen( $it ) < 18;
                        if ( $should_merge ) {
                            $prev_trim = preg_replace( '/-$/', '', $prev_trim );
                            $items[$prev_i] = trim( $prev_trim . ' ' . $it );
                            continue;
                        }
                    }
                    $items[] = $it;
                }

                foreach ( $items as $clean ) :
                    $clean = preg_replace( '/^[✓✔☑✅]+\s*/u', '', trim( $clean ) );
                    $title = $clean; $desc = '';
                    if ( strpos( $clean, ':' ) !== false ) {
                        list( $title, $desc ) = explode( ':', $clean, 2 );
                    } elseif ( strpos( $clean, ' - ' ) !== false ) {
                        list( $title, $desc ) = explode( ' - ', $clean, 2 );
                    }
                ?>
                <div class="ph-feat-row">
                    <div class="ph-feat-dot-new">
                        <svg viewBox="0 0 10 10"><polyline points="1.5,5 4,8 8.5,2"/></svg>
                    </div>
                    <div>
                        <div class="ph-feat-title-new"><?php echo esc_html( trim( $title ) ); ?></div>
                        <?php if ( $desc ) : ?>
                        <div class="ph-feat-desc-new"><?php echo esc_html( trim( $desc ) ); ?></div>
                        <?php endif; ?>
                    </div>
                </div>
                <?php endforeach; ?>
            </div>

            <?php else :
                echo wp_kses_post( $features_html );
            endif; ?>

        <?php else : ?>
        <div class="ph-feat-list-new">
            <div class="ph-feat-row">
                <div class="ph-feat-dot-new"><svg viewBox="0 0 10 10"><polyline points="1.5,5 4,8 8.5,2"/></svg></div>
                <div>
                    <div class="ph-feat-title-new">High early strength</div>
                    <div class="ph-feat-desc-new">Achieves working strength quickly, enabling fast project turnover on site.</div>
                </div>
            </div>
            <div class="ph-feat-row">
                <div class="ph-feat-dot-new"><svg viewBox="0 0 10 10"><polyline points="1.5,5 4,8 8.5,2"/></svg></div>
                <div>
                    <div class="ph-feat-title-new">Chemical &amp; moisture resistance</div>
                    <div class="ph-feat-desc-new">Withstands seawater, fuels, and dilute acids — suitable for coastal UAE sites.</div>
                </div>
            </div>
            <div class="ph-feat-row">
                <div class="ph-feat-dot-new"><svg viewBox="0 0 10 10"><polyline points="1.5,5 4,8 8.5,2"/></svg></div>
                <div>
                    <div class="ph-feat-title-new">Solvent-free &amp; low VOC</div>
                    <div class="ph-feat-desc-new">Safe for confined spaces. Compliant with UAE Green Building regulations.</div>
                </div>
            </div>
        </div>
        <?php endif; ?>

    </section>

    <!-- ══════════════════════════════════════════════
         PANEL 3 — SPECIFICATIONS
    ══════════════════════════════════════════════ -->
    <section class="ph-panel" id="ph-panel-specifications" role="tabpanel">

        <div class="ph-section-label">Technical data</div>

        <?php
        $ph_src_text = wp_strip_all_tags( (string) $spec_html . "\n" . (string) $overview_content );
        $ph_src_text = preg_replace( '/\s+/', ' ', $ph_src_text );
        $ph_key_specs = [];

        if ( preg_match( '/gap\s+widths?\s*(?:of|:)?\s*([0-9]+(?:\.[0-9]+)?)\s*(?:to|–|-)\s*([0-9]+(?:\.[0-9]+)?)\s*mm/i', $ph_src_text, $m ) ) {
            $ph_key_specs[] = [ 'Gap width', $m[1] . '–' . $m[2] . ' mm' ];
        } elseif ( preg_match( '/([0-9]+(?:\.[0-9]+)?)\s*(?:to|–|-)\s*([0-9]+(?:\.[0-9]+)?)\s*mm/i', $ph_src_text, $m ) ) {
            $ph_key_specs[] = [ 'Gap width', $m[1] . '–' . $m[2] . ' mm' ];
        }

        if ( preg_match( '/solvent[-\s]*free\s+epoxy\s+resin\s+grout/i', $ph_src_text ) ) {
            $ph_key_specs[] = [ 'Type', 'Solvent-free epoxy resin grout' ];
        } elseif ( preg_match( '/epoxy\s+resin\s+grout/i', $ph_src_text ) ) {
            $ph_key_specs[] = [ 'Type', 'Epoxy resin grout' ];
        }

        if ( preg_match( '/consisting\s+of\s+base\s+and\s+hardener/i', $ph_src_text ) ) {
            $ph_key_specs[] = [ 'System', 'Base + hardener (whole pack mixing)' ];
        }

        if ( preg_match( '/compressive\s+strength[^.]{0,80}greater\s+than\s*([0-9]+(?:\.[0-9]+)?)/i', $ph_src_text, $m ) ) {
            $ph_key_specs[] = [ 'Compressive strength (7 days)', '> ' . $m[1] ];
        }
        if ( preg_match( '/tensile\s+strength[^.]{0,80}greater\s+than\s*([0-9]+(?:\.[0-9]+)?)/i', $ph_src_text, $m ) ) {
            $ph_key_specs[] = [ 'Tensile strength (7 days)', '> ' . $m[1] ];
        }
        if ( preg_match( '/flexural\s+strength[^.]{0,80}greater\s+than\s*([0-9]+(?:\.[0-9]+)?)/i', $ph_src_text, $m ) ) {
            $ph_key_specs[] = [ 'Flexural strength (7 days)', '> ' . $m[1] ];
        }

        if ( preg_match( '/chemical\s+resist/i', $ph_src_text ) ) {
            $ph_key_specs[] = [ 'Chemical resistance', 'Good' ];
        }

        $ph_key_specs_unique = [];
        $ph_key_seen = [];
        foreach ( $ph_key_specs as $pair ) {
            $k = strtolower( trim( $pair[0] ) );
            if ( isset( $ph_key_seen[$k] ) ) continue;
            $ph_key_seen[$k] = true;
            $ph_key_specs_unique[] = $pair;
        }
        ?>

        <?php if ( ! empty( $ph_key_specs_unique ) ) : ?>
        <div class="ph-spec-grid-new" style="grid-template-columns:repeat(2,1fr);margin-bottom:16px">
            <?php foreach ( $ph_key_specs_unique as $pair ) : ?>
            <div class="ph-spec-row-new">
                <span class="ph-spec-lbl"><?php echo esc_html( $pair[0] ); ?></span>
                <span class="ph-spec-val"><?php echo esc_html( $pair[1] ); ?></span>
            </div>
            <?php endforeach; ?>
        </div>
        <?php endif; ?>

        <?php if ( $spec_html ) : ?>
            <?php if ( strpos( $spec_html, 'ph-spec-grid-new' ) !== false || strpos( $spec_html, 'ph-spec-row-new' ) !== false ) : ?>
            <?php echo wp_kses_post( $spec_html ); ?>
            <?php elseif ( strpos( $spec_html, '<table' ) !== false ) : ?>
            <div style="border:0.5px solid #E5E7EB;border-radius:12px;overflow:auto;margin-bottom:20px;-webkit-overflow-scrolling:touch">
                <?php echo wp_kses_post( $spec_html ); ?>
            </div>
            <?php else :
                $clean_text = strip_tags( $spec_html, '<br>' );
                $lines      = preg_split( '/[.\n]+/', $clean_text );
                echo '<div class="ph-spec-grid-new" style="grid-template-columns:repeat(2,1fr)">';
                foreach ( $lines as $line ) {
                    if ( strpos( $line, ':' ) !== false ) {
                        $parts = explode( ':', $line, 2 );
                        echo '<div class="ph-spec-row-new"><span class="ph-spec-lbl">' . esc_html( trim( $parts[0] ) ) . '</span><span class="ph-spec-val">' . esc_html( trim( $parts[1] ) ) . '</span></div>';
                    } elseif ( trim( $line ) ) {
                        echo '<div class="ph-spec-row-new" style="grid-column:1/-1"><span class="ph-spec-val">' . esc_html( trim( $line ) ) . '</span></div>';
                    }
                }
                echo '</div>';
            endif; ?>
        <?php endif; ?>

        <?php
        $attribs = $product->get_attributes();
        if ( ! empty( $attribs ) ) :
        ?>
        <div class="ph-section-label" <?php if ( $spec_html ) echo 'style="margin-top:8px"'; ?>>Product attributes</div>
        <div class="ph-spec-grid-new" style="grid-template-columns: repeat(2, 1fr)">
            <?php foreach ( $attribs as $attr ) :
                if ( ! $attr->get_visible() ) continue;
                $label = wc_attribute_label( $attr->get_name() );
                $val   = implode( ', ', $attr->is_taxonomy()
                    ? wc_get_product_terms( $product_id, $attr->get_name(), ['fields'=>'names'] )
                    : $attr->get_options() );
            ?>
            <div class="ph-spec-row-new">
                <span class="ph-spec-lbl"><?php echo esc_html( $label ); ?></span>
                <span class="ph-spec-val"><?php echo esc_html( $val ); ?></span>
            </div>
            <?php endforeach; ?>
        </div>
        <?php endif; ?>

    </section>

    <!-- ══════════════════════════════════════════════
         PANEL 4 — APPLICATIONS
    ══════════════════════════════════════════════ -->
    <section class="ph-panel" id="ph-panel-applications" role="tabpanel">

        <div class="ph-section-label">Suitable for</div>

        <?php
        $applications_html = get_post_meta( $product_id, 'ph_tab_applications_html', true )
            ?: get_post_meta( $product_id, 'ph_tab_application_html', true )
            ?: get_post_meta( $product_id, '_application_area', true )
            ?: get_post_meta( $product_id, 'applications_html', true );
        ?>

        <?php if ( $applications_html ) : ?>
            <?php echo wp_kses_post( $applications_html ); ?>
        <?php else : ?>
        <div class="ph-app-grid-new">
            <div class="ph-app-card-new"><div class="ph-app-icon-new">🏗️</div><div class="ph-app-name-new">Structural anchoring</div><div class="ph-app-type-new">Rebar, bolts, dowels</div></div>
            <div class="ph-app-card-new"><div class="ph-app-icon-new">🔩</div><div class="ph-app-name-new">Void filling</div><div class="ph-app-type-new">Honeycomb &amp; pinholes</div></div>
            <div class="ph-app-card-new"><div class="ph-app-icon-new">🧱</div><div class="ph-app-name-new">Crack injection</div><div class="ph-app-type-new">Structural cracks</div></div>
            <div class="ph-app-card-new"><div class="ph-app-icon-new">🛣️</div><div class="ph-app-name-new">Floor repair</div><div class="ph-app-type-new">Industrial &amp; car parks</div></div>
            <div class="ph-app-card-new"><div class="ph-app-icon-new">⚓</div><div class="ph-app-name-new">Equipment bases</div><div class="ph-app-type-new">Machinery grouting</div></div>
            <div class="ph-app-card-new"><div class="ph-app-icon-new">🌊</div><div class="ph-app-name-new">Marine structures</div><div class="ph-app-type-new">Piers, jetties</div></div>
        </div>
        <?php endif; ?>

    </section>

    <!-- ══════════════════════════════════════════════
         PANEL 5 — ESTIMATING
    ══════════════════════════════════════════════ -->
    <section class="ph-panel" id="ph-panel-estimating" role="tabpanel">

        <div class="ph-section-label">Estimating &amp; supply</div>

        <?php if ( $estimating_html ) : ?>
            <?php echo wp_kses_post( $estimating_html ); ?>
        <?php else : ?>
        <div class="ph-info-note" style="margin-bottom:16px">
            <span class="ph-info-note-icon">ℹ</span>
            <span>Coverage values assume a smooth, prepared concrete substrate. Add 10–15% wastage for site conditions. Bulk pricing available for orders above 100 kg — contact our team.</span>
        </div>
        <div class="ph-est-table-wrap">
            <table class="ph-est-table">
                <thead>
                    <tr>
                        <th style="width:35%">Application</th>
                        <th style="width:20%">Thickness</th>
                        <th style="width:25%">Consumption</th>
                        <th style="width:20%">Packs / 100 m²</th>
                    </tr>
                </thead>
                <tbody>
                    <tr><td>Floor topping</td><td>3 mm</td><td>5.25 kg / m²</td><td>19 packs</td></tr>
                    <tr><td>Medium topping</td><td>6 mm</td><td>10.5 kg / m²</td><td>38 packs</td></tr>
                    <tr><td>Bedding mortar</td><td>10 mm</td><td>17.5 kg / m²</td><td>63 packs</td></tr>
                    <tr><td>Crack injection</td><td>3 mm crack</td><td>~0.5 kg / m run</td><td>—</td></tr>
                </tbody>
            </table>
        </div>
        <?php endif; ?>

    </section>

    <!-- ══════════════════════════════════════════════
         PANEL 6 — FAQs
    ══════════════════════════════════════════════ -->
    <section class="ph-panel" id="ph-panel-faqs" role="tabpanel">

        <div class="ph-section-label">Frequently asked questions</div>

        <div class="ph-faq-list-new" id="phFaqList">
            <?php foreach ( $faqs as $idx => $f ) : ?>
            <div class="ph-faq-item-new <?php echo $idx === 0 ? 'open' : ''; ?>">
                <button class="ph-faq-q-new" type="button">
                    <span class="ph-faq-qtext-new"><?php echo esc_html( $f['q'] ); ?></span>
                    <svg class="ph-faq-chevron-new" viewBox="0 0 16 16">
                        <polyline points="3,5 8,11 13,5"/>
                    </svg>
                </button>
                <div class="ph-faq-a-new">
                    <?php echo wp_kses_post( wpautop( esc_html( $f['a'] ) ) ); ?>
                </div>
            </div>
            <?php endforeach; ?>
        </div>

    </section>

    <!-- ══════════════════════════════════════════════
         PANEL 7 — DOCUMENTS (only if docs exist)
    ══════════════════════════════════════════════ -->
    <?php if ( $has_downloads ) : ?>
    <section class="ph-panel" id="ph-panel-documents" role="tabpanel">

        <div class="ph-section-label">Product documentation</div>

        <div class="ph-doc-grid-new">
            <?php foreach ( $unique_docs as $doc ) :
                $type_label = strtoupper( substr( $doc['type'] ?? 'DOC', 0, 3 ) );
                $doc_json   = json_encode( [$doc], JSON_HEX_QUOT | JSON_HEX_APOS );
            ?>
            <div class="ph-doc-card-new"
                 onclick='phOpenPdfModal(<?php echo $doc_json; ?>, "<?php echo esc_js( $product->get_name() ); ?>")'>
                <div class="ph-doc-badge-new"><?php echo esc_html( $type_label ); ?></div>
                <div class="ph-doc-name-new"><?php echo esc_html( $doc['title'] ); ?></div>
                <div class="ph-doc-type-new">Official PDF</div>
            </div>
            <?php endforeach; ?>
        </div>

        <div class="ph-info-note">
            <span class="ph-info-note-icon">ℹ</span>
            <span>All documents are the latest published version. If a document is missing, contact us and we will source it for you.</span>
        </div>

    </section>
    <?php endif; ?>

    <!-- ══════════════════════════════════════════════
         PANEL 8 — DELIVERY
    ══════════════════════════════════════════════ -->
    <section class="ph-panel" id="ph-panel-delivery" role="tabpanel">

        <div class="ph-section-label">Shipping options — UAE</div>

        <div class="ph-del-grid">
            <div class="ph-del-card">
                <div class="ph-del-ico" style="background:#FEF3C7">
                    <svg viewBox="0 0 24 24" stroke="#92400E"><circle cx="12" cy="12" r="10"/><polyline points="12,6 12,12 16,14"/></svg>
                </div>
                <div>
                    <div class="ph-del-title">Express — same day</div>
                    <div class="ph-del-text">Within 3 hours · Dubai &amp; Abu Dhabi · AED 60</div>
                </div>
            </div>
            <div class="ph-del-card">
                <div class="ph-del-ico" style="background:#EFF6FF">
                    <svg viewBox="0 0 24 24" stroke="#1D4ED8"><rect x="1" y="3" width="15" height="13"/><polyline points="16,8 20,8 23,11 23,16 16,16 16,8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>
                </div>
                <div>
                    <div class="ph-del-title">Standard — next day</div>
                    <div class="ph-del-text">Before 10 PM · All 7 Emirates · Free over AED 200</div>
                </div>
            </div>
            <div class="ph-del-card">
                <div class="ph-del-ico" style="background:#F0FDF4">
                    <svg viewBox="0 0 24 24" stroke="#15803D"><path d="M3 12h18M3 12l6-6M3 12l6 6"/></svg>
                </div>
                <div>
                    <div class="ph-del-title">Easy returns</div>
                    <div class="ph-del-text">14 days · Unopened items · Original packaging</div>
                </div>
            </div>
        </div>

        <div class="ph-info-note">
            <span class="ph-info-note-icon">📍</span>
            <span>All orders dispatched from our central warehouse in Dubai. Delivery times are estimates and may vary during peak periods.</span>
        </div>

    </section>

</article>

<script>
/* ── Tab Switcher ─────────────────────────────── */
(function () {
    var nav = document.getElementById('phTabNav');
    if (!nav) return;
    nav.addEventListener('click', function (e) {
        var btn = e.target.closest('.ph-tab-btn');
        if (!btn) return;
        var tabId = btn.dataset.tab;
        nav.querySelectorAll('.ph-tab-btn').forEach(function (b) { b.classList.remove('active'); });
        btn.classList.add('active');
        document.querySelectorAll('.ph-panel').forEach(function (p) { p.classList.remove('active'); });
        var panel = document.getElementById('ph-panel-' + tabId);
        if (panel) panel.classList.add('active');
    });
})();

/* ── FAQ Accordion ────────────────────────────── */
(function () {
    var list = document.getElementById('phFaqList');
    if (!list) return;
    list.querySelectorAll('.ph-faq-q-new').forEach(function (btn) {
        btn.addEventListener('click', function () {
            var item    = btn.closest('.ph-faq-item-new');
            var wasOpen = item.classList.contains('open');
            list.querySelectorAll('.ph-faq-item-new').forEach(function (i) { i.classList.remove('open'); });
            if (!wasOpen) item.classList.add('open');
        });
    });
})();
</script>

<?php if ( ! empty($related_ids) ) : ?>
  <div class="ph-related-section">
    <div class="ph-related-header">
      <h2>Similar Products</h2>
    </div>
    <div class="ph-related-track">
      <?php
      foreach ( array_slice($related_ids,0,6) as $rid ) {
        $rp = wc_get_product($rid);
        if ( ! $rp || ! $rp->is_visible() ) continue;
        
        $rimg = $rp->get_image_id() ? wp_get_attachment_image_url($rp->get_image_id(),'woocommerce_thumbnail') : wc_placeholder_img_src();
        
        $rbrand = $rp->get_attribute('pa_brand') ?: '';
        if (!$rbrand) { $rbt=get_the_terms($rid,'product_brand'); if($rbt&&!is_wp_error($rbt)) $rbrand=$rbt[0]->name; }
        if (!$rbrand) { $rbrand = 'PILEHEAD'; } // Fallback

        $in_stock = $rp->is_in_stock();
        $price = (float) $rp->get_price();
        $price_int = floor($price);
        $price_dec = str_pad(round(($price - $price_int) * 100), 2, '0', STR_PAD_RIGHT);
        $currency = get_woocommerce_currency();
      ?>
      <div class="group relative flex flex-col bg-white dark:bg-slate-900 border-[2px] border-yellow-300 dark:border-yellow-400 hover:border-yellow-400 dark:hover:border-yellow-300 hover:shadow-2xl transition-all duration-500 rounded-xl overflow-hidden min-h-[420px] h-full ph-ncard z-0 hover:z-30 w-full" data-id="<?php echo esc_attr($rid); ?>" style="height: 100%;">

        <a href="<?php echo esc_url($rp->get_permalink()); ?>" class="relative aspect-[10/11] w-full bg-white dark:bg-slate-800 overflow-hidden flex items-center justify-center p-4 border-b border-yellow-300 dark:border-yellow-400 shrink-0">
            <div class="nc-top-title absolute top-0 left-0 right-0 bg-yellow-400 text-slate-900 text-center px-3 py-1.5 text-[12px] font-bold leading-none truncate z-[5] transform -translate-y-full opacity-0 transition-all duration-300 pointer-events-none shadow-sm"><?php echo esc_html($rp->get_name()); ?></div>
            <img decoding="async" src="<?php echo esc_url($rimg); ?>" alt="<?php echo esc_attr($rp->get_name()); ?>" class="object-contain block mx-auto my-auto w-full h-full max-h-[95%] max-w-[95%] mix-blend-multiply dark:mix-blend-normal" loading="lazy" style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%);">
            
            <button class="nc-wl-btn absolute top-4 right-4 p-2.5 bg-white dark:bg-slate-800 shadow-sm border border-slate-100 dark:border-slate-700 rounded-full text-slate-400 opacity-0 group-hover:opacity-100 hover:text-yellow-500 hover:border-yellow-400 transition-all duration-300 z-20 m-0 leading-none" style="overflow: visible; z-index: 20;">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="nc-wl-icon"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"></path></svg>
            </button>
        </a>

        <div class="p-4 pb-2 px-4 flex flex-col flex-grow relative bg-slate-50/30 dark:bg-slate-900 w-full text-left items-start" style="width:100%; box-sizing:border-box;">
            <div class="flex items-center justify-between mb-2 w-full">
                <span class="text-[10px] font-bold tracking-[0.1em] text-slate-500 dark:text-slate-400 uppercase"><?php echo esc_html($rbrand); ?></span>
                <?php if ( $in_stock ) : ?>
                <span class="flex items-center gap-1.5"><span class="flex h-1.5 w-1.5 rounded-full bg-emerald-500"></span><span class="text-[9px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-widest">In Stock</span></span>
                <?php else : ?>
                <span class="flex items-center gap-1.5"><span class="flex h-1.5 w-1.5 rounded-full bg-red-500"></span><span class="text-[9px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-widest">Out of Stock</span></span>
                <?php endif; ?>
            </div>
            <h3 class="text-[14px] font-normal text-left w-full text-[#535665] dark:text-slate-300 leading-snug mb-1.5 mb-auto truncate whitespace-nowrap overflow-hidden" style="font-family: 'Assistant', -apple-system, BlinkMacSystemFont, sans-serif; font-weight: 400;"><a href="<?php echo esc_url($rp->get_permalink()); ?>" class="hover:text-yellow-500 transition-colors" title="<?php echo esc_attr($rp->get_name()); ?>"><?php echo esc_html($rp->get_name()); ?></a></h3>
        </div>

        <div class="mt-auto relative w-full flex flex-col pointer-events-auto rounded-b-xl" style="box-sizing:border-box;">
            
            <div class="nc-expand-panel absolute left-0 right-0 bottom-[60px] w-full h-[52px] bg-white dark:bg-slate-900 flex pointer-events-none transition-all duration-300 ease-in-out translate-y-full opacity-0 z-0 overflow-hidden box-border border-t border-slate-200 shadow-[0_-8px_20px_rgba(0,0,0,0.06)] pl-0">
                <div class="flex items-center w-[110px] border-r border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/80 shrink-0 m-0">
                    <button class="nc-qty-dec w-[34px] h-full flex items-center justify-center text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M5 12h14"></path></svg></button>
                    <span class="nc-qty-val text-[14px] font-black flex-1 text-center tabular-nums text-slate-900 dark:text-white">1</span>
                    <button class="nc-qty-inc w-[34px] h-full flex items-center justify-center text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M5 12h14"></path><path d="M12 5v14"></path></svg></button>
                </div>
                
                <?php if ($price > 0) : ?>
                <button class="nc-atc-btn relative flex-1 h-full bg-yellow-400 hover:bg-yellow-500 text-slate-900 text-[11px] font-bold uppercase tracking-widest transition-all duration-300 ease-out active:scale-95 flex items-center justify-center gap-2 overflow-hidden m-0" data-cart-url="<?php echo esc_url(wc_get_cart_url()); ?>">
                    <span class="nc-btn-text transition-all duration-300 transform translate-y-0 opacity-100 absolute inset-0 flex items-center justify-center">Add Item To Box</span>
                    <div class="nc-loading absolute inset-0 flex items-center justify-center transition-all duration-300 transform translate-y-full opacity-0"><div class="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div></div>
                    <span class="nc-success absolute inset-0 flex items-center justify-center transition-all duration-300 transform translate-y-full opacity-0 text-slate-900 text-[11px] font-bold uppercase tracking-widest whitespace-nowrap">View Cart →</span>
                </button>
                <?php else: ?>
                <a href="https://wa.me/971547656789?text=<?php echo urlencode('Price inquiry for: ' . $rp->get_name()); ?>" target="_blank" class="relative flex-1 h-full bg-slate-900 hover:bg-slate-800 text-white text-[11px] font-bold uppercase tracking-widest transition-all duration-300 ease-out active:scale-95 flex items-center justify-center overflow-hidden m-0">
                    Get Quote
                </a>
                <?php endif; ?>
            </div>

            <div class="h-[60px] w-full bg-slate-50/50 dark:bg-slate-800 border-t border-slate-200 dark:border-slate-700 flex items-stretch relative z-10 box-border rounded-b-xl overflow-hidden pl-0" style="box-sizing:border-box;">
                <div class="flex-1 flex items-center pl-5 relative z-10 box-border">
                    <div class="flex items-end gap-1.5">
                        <div class="text-[20px] font-black text-slate-900 dark:text-white leading-none tracking-tight flex items-center gap-[4px]">
                            <?php if ($price > 0) : ?>
                            <img decoding="async" src="<?php echo esc_url($aed_symbol_url); ?>" alt="AED" class="ph-aed-label" style="height:13px; width:auto; transform: translateY(1.5px);">
                            <div class="flex items-baseline"><?php echo $price_int; ?><span class="text-[13px] font-bold text-yellow-500">.<?php echo $price_dec; ?></span></div>
                            <?php else: ?>
                            <div class="flex items-baseline" style="font-size:16px;">Enquire</div>
                            <?php endif; ?>
                        </div>
                    </div>                
                </div>
                <button class="nc-expand-btn w-[64px] border-l border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-yellow-400 dark:hover:bg-yellow-400 hover:text-slate-900 text-slate-600 dark:text-slate-300 flex items-center justify-center transition-all duration-300 shrink-0 relative box-border <?php if ($price <= 0) echo 'opacity-50 pointer-events-none'; ?>">
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="nc-arrow-right absolute transition-all duration-300 opacity-100 rotate-0 scale-100 pointer-events-none"><path d="M5 12h14"></path><path d="m12 5 7 7-7 7"></path></svg>
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="nc-arrow-up absolute transition-all duration-300 opacity-0 rotate-90 scale-50 pointer-events-none"><path d="m5 12 7-7 7 7"></path><path d="M12 19V5"></path></svg>
                </button>
            </div>
        </div>
      </div>
      <?php } ?>

      <script>
      document.addEventListener('DOMContentLoaded', () => {
          const ncards = document.querySelectorAll('.ph-ncard');
          
          ncards.forEach(card => {
              const expandBtn = card.querySelector('.nc-expand-btn');
              const topTitle = card.querySelector('.nc-top-title');
              const panel = card.querySelector('.nc-expand-panel');
              const arrowRight = card.querySelector('.nc-arrow-right');
              const arrowUp = card.querySelector('.nc-arrow-up');
              
              let isExpanded = false;

              if (expandBtn && panel) {
                  expandBtn.addEventListener('click', (e) => {
                      e.preventDefault();
                      isExpanded = !isExpanded;
                      
                      if(isExpanded) {
                          card.classList.add('!z-40');
                          if(topTitle) { topTitle.classList.remove('-translate-y-full', 'opacity-0'); topTitle.classList.add('translate-y-0', 'opacity-100'); }
                          panel.classList.remove('translate-y-full', 'opacity-0', 'pointer-events-none');
                          panel.classList.add('translate-y-0', 'opacity-100', 'pointer-events-auto');
                          
                          if(arrowRight) {
                              arrowRight.classList.remove('opacity-100', 'rotate-0', 'scale-100');
                              arrowRight.classList.add('opacity-0', '-rotate-90', 'scale-50');
                          }
                          if(arrowUp) {
                              arrowUp.classList.remove('opacity-0', 'rotate-90', 'scale-50');
                              arrowUp.classList.add('opacity-100', 'rotate-0', 'scale-100');
                          }
                          
                          expandBtn.classList.remove('bg-white', 'dark:bg-slate-900', 'text-slate-600', 'dark:text-slate-300');
                          expandBtn.classList.add('bg-yellow-400', 'text-slate-900');
                      } else {
                          card.classList.remove('!z-40');
                          if(topTitle) { topTitle.classList.add('-translate-y-full', 'opacity-0'); topTitle.classList.remove('translate-y-0', 'opacity-100'); }
                          panel.classList.add('translate-y-full', 'opacity-0', 'pointer-events-none');
                          panel.classList.remove('translate-y-0', 'opacity-100', 'pointer-events-auto');
                          
                          if(arrowRight) {
                              arrowRight.classList.add('opacity-100', 'rotate-0', 'scale-100');
                              arrowRight.classList.remove('opacity-0', '-rotate-90', 'scale-50');
                          }
                          if(arrowUp) {
                              arrowUp.classList.add('opacity-0', 'rotate-90', 'scale-50');
                              arrowUp.classList.remove('opacity-100', 'rotate-0', 'scale-100');
                          }
                          
                          expandBtn.classList.add('bg-white', 'dark:bg-slate-900', 'text-slate-600', 'dark:text-slate-300');
                          expandBtn.classList.remove('bg-yellow-400', 'text-slate-900');
                      }
                  });
              }

              // Wishlist
              const wlBtn = card.querySelector('.nc-wl-btn');
              const wlIcon = card.querySelector('.nc-wl-icon');
              let isWl = false;
              if(wlBtn) {
                  wlBtn.addEventListener('click', (e) => {
                      e.preventDefault();
                      isWl = !isWl;
                      if(isWl) {
                          wlBtn.classList.add('text-red-500', 'border-red-200', 'bg-red-50');
                          if(wlIcon) wlIcon.setAttribute('fill', 'currentColor');
                      } else {
                          wlBtn.classList.remove('text-red-500', 'border-red-200', 'bg-red-50');
                          if(wlIcon) wlIcon.setAttribute('fill', 'none');
                      }
                  });
              }

              // Qty Logic
              const qtyDec = card.querySelector('.nc-qty-dec');
              const qtyInc = card.querySelector('.nc-qty-inc');
              const qtyVal = card.querySelector('.nc-qty-val');
              
              if(qtyDec && qtyInc && qtyVal) {
                  let qty = 1;
                  qtyDec.addEventListener('click', (e) => { 
                      e.preventDefault(); 
                      if(qty > 1) { qty--; qtyVal.textContent = qty; } 
                  });
                  qtyInc.addEventListener('click', (e) => { 
                      e.preventDefault(); 
                      qty++; qtyVal.textContent = qty; 
                  });
              }

              // Add to Cart
              const atcBtn = card.querySelector('.nc-atc-btn');
              if(atcBtn) {
                  atcBtn.addEventListener('click', (e) => {
                      e.preventDefault();

                      // Redirect to cart if already added
                      if (atcBtn.dataset.added === 'true') {
                          const cartUrl = atcBtn.dataset.cartUrl || '/cart/';
                          window.location.href = cartUrl;
                          return;
                      }

                      const btnText = atcBtn.querySelector('.nc-btn-text');
                      const loader = atcBtn.querySelector('.nc-loading');
                      const success = atcBtn.querySelector('.nc-success');

                      // Loading State
                      atcBtn.classList.add('bg-slate-800', 'text-white', 'pointer-events-none', 'scale-95');
                      atcBtn.classList.remove('bg-yellow-400', 'text-slate-900', 'hover:bg-yellow-500');
                      
                      if(btnText) {
                          btnText.classList.remove('translate-y-0', 'opacity-100');
                          btnText.classList.add('-translate-y-full', 'opacity-0');
                      }
                      if(loader) {
                          loader.classList.remove('translate-y-full', 'opacity-0');
                          loader.classList.add('translate-y-0', 'opacity-100');
                      }

                      const pid = card.dataset.id;
                      const pqty = qtyVal ? parseInt(qtyVal.textContent) : 1;

                      if (typeof wc_add_to_cart_params !== 'undefined' && typeof jQuery !== 'undefined') {
                          jQuery.post( wc_add_to_cart_params.wc_ajax_url.toString().replace( '%%endpoint%%', 'add_to_cart' ), {
                              product_id: pid,
                              quantity: pqty
                          }, function( response ) {
                              if ( ! response ) return;
                              
                              if(loader) {
                                  loader.classList.remove('translate-y-0', 'opacity-100');
                                  loader.classList.add('-translate-y-full', 'opacity-0');
                              }
                              if(success) {
                                  success.classList.remove('translate-y-full', 'opacity-0');
                                  success.classList.add('translate-y-0', 'opacity-100');
                              }

                              atcBtn.classList.remove('bg-slate-800', 'scale-95', 'text-white');
                              atcBtn.classList.add('bg-yellow-400', 'scale-105', 'text-slate-900', 'hover:bg-yellow-500');

                              jQuery(document.body).trigger('added_to_cart', [response.fragments, response.cart_hash, atcBtn]);
                              
                              setTimeout(() => { atcBtn.classList.remove('scale-105'); }, 200);
                              atcBtn.classList.remove('pointer-events-none');
                              atcBtn.dataset.added = 'true';
                          });
                      }
                  });
              }
          });
      });
      </script>

    </div>
  </div>
  <?php endif; ?>

</div>

<div class="ph-sticky-bottom" id="ph-sticky-bottom">
  <div class="ph-sticky-bottom-inner">
    <?php
    if ($use_gcs) {
      echo '<img src="' . esc_url($gcs_main) . '" alt="" class="ph-sticky-product-thumb">';
    } elseif ($post_thumbnail_id) {
      $sth = wp_get_attachment_image_url($post_thumbnail_id,'thumbnail');
      if ( $ph_ssl && $sth ) $sth = set_url_scheme($sth,'https');
      echo '<img src="' . esc_url($sth) . '" alt="" class="ph-sticky-product-thumb">';
    }
    ?>
    <div>
      <div class="ph-sticky-name"><?php echo esc_html($product->get_name()); ?></div>
      <?php if ($price>0) : ?>
      <div class="ph-sticky-price">
        <img src="<?php echo esc_url($aed_symbol_url); ?>" alt="AED" style="height:12px;width:auto;vertical-align:middle;margin-right:2px;">
        <span><?php echo number_format($price,2); ?></span>
      </div>
      <?php endif; ?>
    </div>
    <?php if ($price>0) : ?>
    <button class="ph-sticky-atc" id="ph-sticky-atc">Add to Cart</button>
    <?php else : ?>
    <button class="ph-sticky-atc" onclick="phOpenQuoteModal('<?php echo esc_js($product->get_name()); ?>','<?php echo esc_js($product->get_sku()?:'N/A'); ?>')">Request Quote</button>
    <?php endif; ?>
  </div>
</div>

<script>
(function(){
'use strict';

var BASE_PRICE = window.phProductPrice || 0;
var mainImg    = document.getElementById('mainProductImage');
var zoomImg    = document.getElementById('zoomImage');

/* ---- Gallery: thumb click → smooth fade swap ---- */
document.querySelectorAll('.ph-thumb').forEach(function(thumb){
  thumb.addEventListener('click', function(){
    var src = thumb.dataset.full || thumb.src;
    document.querySelectorAll('.ph-thumb').forEach(function(t){ t.classList.remove('active'); });
    thumb.classList.add('active');
    mainImg.classList.add('ph-img-loading');
    setTimeout(function(){
      mainImg.src = src;
      if (zoomImg) zoomImg.src = src;
      var onLoad = function(){ mainImg.removeEventListener('load',onLoad); mainImg.classList.remove('ph-img-loading'); };
      mainImg.addEventListener('load', onLoad);
      setTimeout(function(){ mainImg.classList.remove('ph-img-loading'); }, 450);
    }, 120);
  });
});

/* ---- Zoom ---- */
window.phOpenZoom = function(){
  if(zoomImg && mainImg) zoomImg.src = mainImg.src;
  document.getElementById('zoomOverlay').classList.add('open');
};
window.phCloseZoom = function(){ document.getElementById('zoomOverlay').classList.remove('open'); };
document.getElementById('zoomOverlay').addEventListener('click', function(e){
  if(e.target===this || e.target.classList.contains('ph-zoom-hint')) phCloseZoom();
});

/* ---- Qty controls ---- */
var qtyInput = document.getElementById('ph-qty-input');
if(qtyInput){
  document.getElementById('ph-qty-minus').addEventListener('click',function(){
    var v=parseInt(qtyInput.value)||1; if(v>1){qtyInput.value=v-1;syncTotal();}
  });
  document.getElementById('ph-qty-plus').addEventListener('click',function(){
    var v=parseInt(qtyInput.value)||1; if(v<99){qtyInput.value=v+1;syncTotal();}
  });
  qtyInput.addEventListener('input', syncTotal);
}
function syncTotal(){
  var qty=parseInt(qtyInput?qtyInput.value:1)||1;
  var el=document.getElementById('ph-buybox-price');
  if(el) el.textContent=(BASE_PRICE*qty).toFixed(2);
}

/* ---- B2B Qty controls ---- */
var quoteQtyInput = document.getElementById('ph-quote-qty-input');
if(quoteQtyInput){
  document.getElementById('ph-quote-qty-minus').addEventListener('click',function(){
    var v=parseInt(quoteQtyInput.value)||1; if(v>1) quoteQtyInput.value=v-1;
  });
  document.getElementById('ph-quote-qty-plus').addEventListener('click',function(){
    var v=parseInt(quoteQtyInput.value)||1; if(v<999) quoteQtyInput.value=v+1;
  });
}

/* ======== ADD TO CART → WC AJAX → Quick Cart ======== */
function handleATC(btn){
  if(!btn || btn.disabled) return;
  var pid  = btn.dataset.productId || window.phProductId;
  var qty  = qtyInput ? (parseInt(qtyInput.value)||1) : 1;
  var type = btn.dataset.productType || 'simple';
  var textEl = btn.querySelector('.ph-atc-text');
  var spinEl = btn.querySelector('.ph-atc-spinner');

  // Gather variation data if variable product
  var varData = {};
  if(type==='variable'){
    document.querySelectorAll('.variation-select').forEach(function(sel){
      varData[sel.name] = sel.value;
    });
    var incomplete = Object.values(varData).some(function(v){return !v;});
    if(incomplete){ alert('Please select all product options before adding to cart.'); return; }
  }

  // Show spinner
  btn.disabled=true;
  if(textEl) textEl.style.display='none';
  if(spinEl) spinEl.style.display='block';

  // WooCommerce AJAX add to cart
  var formData = new FormData();
  formData.append('product_id', pid);
  formData.append('quantity', qty);
  formData.append('security', window.phNonce);
  Object.keys(varData).forEach(function(k){ formData.append(k, varData[k]); });

  fetch(window.phWcAjaxUrl, { method:'POST', body:formData })
    .then(function(r){ return r.json(); })
    .then(function(data){
      btn.disabled=false;
      if(textEl) textEl.style.display='';
      if(spinEl) spinEl.style.display='none';
      if(data.error){ alert(data.product_url ? 'Error. Please try again.' : (data.error || 'Error adding to cart.')); return; }
      // Trigger WC fragments update
      jQuery(document.body).trigger('wc_fragment_refresh');
      jQuery(document.body).trigger('added_to_cart', [data.fragments, data.cart_hash, btn]);
      phOpenQuickCart(true, '<?php echo esc_js($product->get_name()); ?> added to cart!');
    })
    .catch(function(){ btn.disabled=false; if(textEl) textEl.style.display=''; if(spinEl) spinEl.style.display='none'; alert('Network error. Please try again.'); });
}

var atcMain   = document.getElementById('ph-sidebar-atc');
var atcSticky = document.getElementById('ph-sticky-atc');
if(atcMain)   atcMain.addEventListener('click',   function(){ handleATC(atcMain); });
if(atcSticky && BASE_PRICE > 0) atcSticky.addEventListener('click', function(){ handleATC(atcMain); });

// Buy Now
var buyNow = document.getElementById('ph-sidebar-buy');
if(buyNow){
  buyNow.addEventListener('click', function(){
    if(!atcMain || atcMain.disabled) return;
    var pid = atcMain.dataset.productId || window.phProductId;
    window.location.href = window.phCheckoutUrl + '?add-to-cart=' + pid + '&quantity=' + (qtyInput?qtyInput.value:1);
  });
}

/* ======== QUICK CART DRAWER ======== */
window.phOpenQuickCart = function(justAdded, bannerMsg){
  document.getElementById('phQcBackdrop').classList.add('active');
  document.getElementById('phQcDrawer').classList.add('open');
  document.body.style.overflow = 'hidden';
  if(justAdded && bannerMsg){
    var banner = document.getElementById('phQcBanner');
    document.getElementById('phQcBannerText').textContent = bannerMsg;
    banner.classList.add('show');
    setTimeout(function(){ banner.classList.remove('show'); }, 3500);
  }
  phLoadCartItems();
};
window.phCloseQuickCart = function(){
  document.getElementById('phQcDrawer').classList.remove('open');
  document.getElementById('phQcBackdrop').classList.remove('active');
  document.body.style.overflow = '';
};

function phLoadCartItems(){
  var itemsEl   = document.getElementById('phQcItems');
  var summaryEl = document.getElementById('phQcSummary');
  itemsEl.innerHTML = '<div class="ph-qc-loading"><div class="ph-qc-spinner-ring"></div><span>Loading cart…</span></div>';
  summaryEl.style.display = 'none';

  var fd = new FormData();
  fd.append('action','ph_get_cart_items');
  fd.append('nonce', window.phNonce);
  fetch(window.phAjaxUrl,{method:'POST',body:fd})
    .then(function(r){return r.json();})
    .then(function(res){
      if(!res.success){ itemsEl.innerHTML='<div class="ph-qc-empty"><svg fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24" width="52" height="52"><path d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z"/></svg><p>Your cart is empty</p></div>'; return; }
      var data = res.data;
      document.getElementById('phQcCount').textContent = data.count || 0;
      if(!data.items || data.items.length===0){
        itemsEl.innerHTML='<div class="ph-qc-empty"><svg fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24" width="52" height="52"><path d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z"/></svg><p>Your cart is empty</p></div>';
        return;
      }
      var html = '';
      data.items.forEach(function(item){
        html += '<div class="ph-qc-item" id="qci-' + item.key + '">';
        html += '<div class="ph-qc-item-img"><img src="' + (item.image||'') + '" alt="' + (item.name||'') + '" loading="lazy"></div>';
        html += '<div class="ph-qc-item-info">';
        html += '<div class="ph-qc-item-name">' + (item.name||'') + '</div>';
        if(item.variant) html += '<div class="ph-qc-item-variant">' + item.variant + '</div>';
        html += '<div class="ph-qc-item-meta">';
        html += '<span class="ph-qc-item-price">AED ' + parseFloat(item.price).toFixed(2) + '</span>';
        html += '<span class="ph-qc-item-qty">× ' + item.qty + '</span>';
        html += '</div></div>';
        html += '<button class="ph-qc-item-remove" data-key="' + item.key + '" title="Remove item">';
        html += '<svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>';
        html += '</button></div>';
      });
      itemsEl.innerHTML = html;
      // Wire remove buttons
      itemsEl.querySelectorAll('.ph-qc-item-remove').forEach(function(btn){
        btn.addEventListener('click', function(){
          var key = btn.dataset.key;
          var el  = document.getElementById('qci-'+key);
          if(el) el.classList.add('removing');
          phRemoveCartItem(key);
        });
      });
      document.getElementById('phQcItemLabel').textContent = data.count + ' item' + (data.count!==1?'s':'');
      document.getElementById('phQcSubtotal').textContent  = 'AED ' + parseFloat(data.subtotal).toFixed(2);
      summaryEl.style.display = 'block';
    })
    .catch(function(){ itemsEl.innerHTML='<div class="ph-qc-empty"><p>Could not load cart. Please refresh.</p></div>'; });
}

function phRemoveCartItem(key){
  var fd = new FormData();
  fd.append('action','ph_remove_cart_item');
  fd.append('cart_item_key', key);
  fd.append('nonce', window.phNonce);
  fetch(window.phAjaxUrl,{method:'POST',body:fd})
    .then(function(r){return r.json();})
    .then(function(){ setTimeout(function(){ phLoadCartItems(); }, 280); })
    .catch(function(){ phLoadCartItems(); });
}

/* ---- Tabs ---- */
document.querySelectorAll('.ph-tab-link').forEach(function(link){
  link.addEventListener('click', function(){
    document.querySelectorAll('.ph-tab-link').forEach(function(l){l.classList.remove('active');});
    document.querySelectorAll('.ph-tab-pane').forEach(function(p){p.classList.remove('active');});
    link.classList.add('active');
    var pane = document.getElementById(link.dataset.tab);
    if(pane) pane.classList.add('active');
  });
});

/* ---- Sticky bottom bar ---- */
var stickyBar = document.getElementById('ph-sticky-bottom');
var grid      = document.querySelector('.ph-product-grid');
window.addEventListener('scroll', function(){
  if(!grid||!stickyBar) return;
  stickyBar.classList.toggle('visible', grid.getBoundingClientRect().bottom < 0);
});

/* ---- Delivery modal ---- */
window.phOpenDeliveryModal = function(type){
  document.getElementById('deliveryModalTitle').textContent = type==='superfast' ? '⚡ Superfast Delivery' : '🚚 Standard Delivery';
  document.getElementById('deliveryModal').classList.remove('hidden');
};
window.phCloseDeliveryModal = function(){ document.getElementById('deliveryModal').classList.add('hidden'); };

/* ---- Quote modal ---- */
window.phOpenQuoteModal = function(name, sku){
  document.getElementById('quoteModalProductName').textContent = name;
  document.getElementById('quoteProductNameInput').value = name;
  document.getElementById('quoteProductSkuInput').value  = sku;
  document.getElementById('quoteFormWrapper').style.display = '';
  document.getElementById('quoteSuccessState').style.display = 'none';
  document.getElementById('quoteModal').classList.add('open');
};
window.phCloseQuoteModal = function(){ document.getElementById('quoteModal').classList.remove('open'); };
window.phSubmitQuote = function(e){
  e.preventDefault();
  var fd = new FormData(document.getElementById('quoteForm'));
  fd.append('action','ph_submit_quote');
  fd.append('nonce', window.phNonce);
  fetch(window.phAjaxUrl,{method:'POST',body:fd})
    .then(function(){ document.getElementById('quoteFormWrapper').style.display='none'; document.getElementById('quoteSuccessState').style.display='block'; })
    .catch(function(){ alert('Error submitting. Please try WhatsApp instead.'); });
};

/* ---- PDF modal ---- */
window.phOpenPdfModal = function(docs, productName){
  document.getElementById('pdfModalTitle').textContent = productName + ' — Documents';
  var frame = document.getElementById('pdfViewerFrame');
  var tabsBar = document.getElementById('pdfDocsTabs');
  var tabsList = document.getElementById('pdfDocsTabsList');
  
  function updateViewer(url) {
    if (!url) return;
    
    // Normalize URL: Ensure it starts with https if the current page is on https
    if (window.location.protocol === 'https:' && url.startsWith('http:')) {
        url = url.replace('http:', 'https:');
    }

    // Check if it's a local URL (same host, relative path, or common WP upload paths)
    var isLocal = url.indexOf(window.location.hostname) !== -1 || 
                  url.startsWith('/') || 
                  url.startsWith('./') ||
                  url.indexOf('/wp-content/') !== -1 ||
                  url.indexOf('/downloads/') !== -1;
    
    // Check if it's a GCS URL
    var isGcs = url.indexOf('storage.googleapis.com') !== -1;
    
    // Check if it's a restricted domain that might block embedding
    var isRestricted = /fosroc\.ae|fosroc\.com|henkelpolybit\.com/.test(url);

    var finalViewerUrl = '';
    // On Oracle Cloud, X-Frame-Options: SAMEORIGIN is often set.
    // To be safest, we use Google Docs viewer for almost everything unless we are sure it works.
    if ((isLocal || isGcs) && !isRestricted) {
        // Direct link for local/GCS - but if it's blocked in frame, we may need a fallback.
        // For now, let's try direct first as it's cleaner.
        finalViewerUrl = url;
    } else {
        // Use Google Docs viewer for external or potentially restricted files
        finalViewerUrl = 'https://docs.google.com/viewer?url=' + encodeURIComponent(url) + '&embedded=true';
    }

    frame.src = finalViewerUrl;
    document.getElementById('pdfDownloadBtn').href = url;
  }

  if(docs.length===1){
    updateViewer(docs[0].url);
    tabsBar.style.display='none';
  } else {
    tabsBar.style.display='block';
    tabsList.innerHTML='';
    docs.forEach(function(doc, i){
      var btn = document.createElement('button');
      btn.className = 'ph-doc-tab' + (i===0?' active':'');
      btn.textContent = doc.title;
      btn.addEventListener('click', function(){
        document.querySelectorAll('.ph-doc-tab').forEach(function(b){b.classList.remove('active');});
        btn.classList.add('active');
        updateViewer(doc.url);
      });
      tabsList.appendChild(btn);
    });
    updateViewer(docs[0].url);
  }
  document.getElementById('pdfModalOverlay').classList.add('open');
};
window.phClosePdfModal = function(){ document.getElementById('pdfModalOverlay').classList.remove('open'); document.getElementById('pdfViewerFrame').src=''; };

/* ---- ESC key ---- */
document.addEventListener('keydown', function(e){
  if(e.key==='Escape'){ phCloseZoom(); phCloseQuickCart(); phCloseDeliveryModal(); phCloseQuoteModal(); phClosePdfModal(); }
});

})();
</script>

<?php if ( ! empty( $faqs ) ) : ?>
<script type="application/ld+json"><?php
echo wp_json_encode(
    [
        '@context' => 'https://schema.org',
        '@type' => 'FAQPage',
         'mainEntity' => array_map(
            function ( $f ) {
                return [
                    '@type' => 'Question',
                    'name' => (string) $f['q'],
                    'acceptedAnswer' => [
                        '@type' => 'Answer',
                        'text' => (string) $f['a'],
                    ],
                ];
            },
            array_slice( $faqs, 0, 12 )
        ),
    ],
    JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE
);
?></script>
<?php endif; ?>

<?php wp_footer(); ?>

<?php
endwhile;
endif;
get_footer('shop'); 
