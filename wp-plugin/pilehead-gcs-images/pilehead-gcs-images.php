<?php
/**
 * Plugin Name: Pilehead GCS Images
 * Plugin URI:  https://pilehead.com/
 * Description: Serves WooCommerce product images from WordPress, GCS, ImageKit, or GCS-via-ImageKit. Uses gcs_image_url / gcs_gallery_urls meta written by Pilehead Desktop Scraper.
 * Version:     2.1.0
 * Author:      Pilehead
 * Author URI:  https://pilehead.com/
 * License:     GPL v2 or later
 * Requires at least: 5.6
 * Requires PHP: 7.4
 * WC tested up to: 9.0
 */

if ( ! defined( 'ABSPATH' ) ) exit;

// --------------------------------------------------------------
//  CONSTANTS
// --------------------------------------------------------------
define( 'PILEHEAD_GCS_MODES', [
    'wp'       => 'WordPress Media Library (default)',
    'gcs'      => 'Google Cloud Storage (direct)',
    'imagekit' => 'ImageKit CDN',
    'gcs_ik'   => 'GCS storage + ImageKit delivery',
] );

// --------------------------------------------------------------
//  SETTINGS PAGE
// --------------------------------------------------------------
add_action( 'admin_menu', function() {
    add_options_page( 'Pilehead Image Source', 'Image Source', 'manage_options', 'pilehead-gcs', 'pilehead_gcs_settings_page' );
} );

add_action( 'admin_init', function() {
    register_setting( 'pilehead_gcs_group', 'pilehead_gcs_mode' );
    register_setting( 'pilehead_gcs_group', 'pilehead_gcs_base' );
    register_setting( 'pilehead_gcs_group', 'pilehead_imagekit_base' );
    register_setting( 'pilehead_gcs_group', 'pilehead_imagekit_transforms' );    // hero / single product main
    register_setting( 'pilehead_gcs_group', 'pilehead_imagekit_tr_gallery' );   // gallery images
    register_setting( 'pilehead_gcs_group', 'pilehead_imagekit_tr_thumb' );     // shop loop / archive thumbnails
    register_setting( 'pilehead_gcs_group', 'pilehead_ik_bgremove' );           // global BG remove on/off
    register_setting( 'pilehead_gcs_group', 'pilehead_ik_bgremove_scope' );     // 'main' or 'all' (main+gallery)
} );

function pilehead_gcs_settings_page() {
    $mode    = get_option( 'pilehead_gcs_mode', 'gcs' );
    $gcsBase = rtrim( get_option( 'pilehead_gcs_base', '' ), '/' );
    $ikBase  = rtrim( get_option( 'pilehead_imagekit_base', '' ), '/' );
    ?>
    <div class="wrap">
        <h1>&#128444; Pilehead Image Source</h1>
        <p style="color:#888;max-width:700px;">Choose where product images are served from. Switching modes never deletes data.</p>
        <form method="post" action="options.php">
            <?php settings_fields( 'pilehead_gcs_group' ); ?>
            <table class="form-table" style="max-width:760px;">
                <tr>
                    <th style="width:200px;">Image Source Mode</th>
                    <td>
                        <label style="display:block;margin-bottom:10px;">
                            <input type="radio" name="pilehead_gcs_mode" value="wp" <?php checked($mode,'wp'); ?> />
                            &nbsp;<strong>&#128421; WordPress</strong> � standard WP media library, nothing changes
                        </label>
                        <label style="display:block;margin-bottom:10px;">
                            <input type="radio" name="pilehead_gcs_mode" value="gcs" <?php checked($mode,'gcs'); ?> />
                            &nbsp;<strong>&#9729; Google Cloud Storage</strong> � images served directly from GCS bucket, bypasses your server
                        </label>
                        <label style="display:block;margin-bottom:10px;">
                            <input type="radio" name="pilehead_gcs_mode" value="imagekit" <?php checked($mode,'imagekit'); ?> />
                            &nbsp;<strong>&#9889; ImageKit CDN</strong> � images via ImageKit (auto WebP, resize, compression). ImageKit must be set up with your GCS bucket as origin.
                        </label>
                        <label style="display:block;margin-bottom:10px;">
                            <input type="radio" name="pilehead_gcs_mode" value="gcs_ik" <?php checked($mode,'gcs_ik'); ?> />
                            &nbsp;<strong>&#9729;&#9889; GCS + ImageKit</strong> � GCS is storage, ImageKit is delivery. Rewrites your GCS URLs to ImageKit URLs automatically, no re-upload needed.
                        </label>
                    </td>
                </tr>
                <tr>
                    <th>GCS Base URL</th>
                    <td>
                        <input type="url" name="pilehead_gcs_base" value="<?php echo esc_attr($gcsBase); ?>"
                               style="width:500px;" placeholder="https://storage.googleapis.com/your-bucket-name" />
                        <p class="description">Required for <b>GCS + ImageKit</b> mode � used to detect and replace the GCS prefix with your ImageKit URL.</p>
                    </td>
                </tr>
                <tr>
                    <th>ImageKit Base URL</th>
                    <td>
                        <input type="url" name="pilehead_imagekit_base" value="<?php echo esc_attr($ikBase); ?>"
                               style="width:500px;" placeholder="https://ik.imagekit.io/your_id" />
                        <p class="description">Your ImageKit endpoint. Used in <b>ImageKit</b> and <b>GCS + ImageKit</b> modes.</p>
                    </td>
                </tr>
                <tr>
                    <th>IK Transforms — Hero Image</th>
                    <td>
                        <?php $ikTr = get_option( 'pilehead_imagekit_transforms', 'f-auto,q-auto,w-1400' ); ?>
                        <input type="text" name="pilehead_imagekit_transforms" value="<?php echo esc_attr($ikTr); ?>"
                               style="width:500px;" placeholder="f-auto,q-auto,w-1400" />
                        <p class="description">
                            Applied to the <b>single product main/hero image</b>. Appended as <code>?tr=VALUE</code>.<br>
                            Default: <code>f-auto,q-auto,w-1400</code> — auto WebP/AVIF, auto quality, max width 1400 px.
                        </p>
                    </td>
                </tr>
                <tr>
                    <th>IK Transforms — Gallery Images</th>
                    <td>
                        <?php $ikTrGallery = get_option( 'pilehead_imagekit_tr_gallery', 'f-auto,q-auto,w-900' ); ?>
                        <input type="text" name="pilehead_imagekit_tr_gallery" value="<?php echo esc_attr($ikTrGallery); ?>"
                               style="width:500px;" placeholder="f-auto,q-auto,w-900" />
                        <p class="description">
                            Applied to <b>product gallery thumbnails</b> on the single product page.<br>
                            Default: <code>f-auto,q-auto,w-900</code> — auto format/quality, max width 900 px.
                        </p>
                    </td>
                </tr>
                <tr>
                    <th>IK Transforms — Loop Thumbnails</th>
                    <td>
                        <?php $ikTrThumb = get_option( 'pilehead_imagekit_tr_thumb', 'f-auto,q-auto,w-600' ); ?>
                        <input type="text" name="pilehead_imagekit_tr_thumb" value="<?php echo esc_attr($ikTrThumb); ?>"
                               style="width:500px;" placeholder="f-auto,q-auto,w-600" />
                        <p class="description">
                            Applied to <b>shop / archive / related-product card thumbnails</b>.<br>
                            Default: <code>f-auto,q-auto,w-600</code> — auto format/quality, max width 600 px.
                        </p>
                    </td>
                </tr>
                <tr>
                    <th>AI Background Removal</th>
                    <td>
                        <?php
                        $bgr       = get_option( 'pilehead_ik_bgremove', '0' );
                        $bgr_scope = get_option( 'pilehead_ik_bgremove_scope', 'main' );
                        ?>
                        <label style="display:block;margin-bottom:8px;">
                            <input type="checkbox" name="pilehead_ik_bgremove" value="1" <?php checked( $bgr, '1' ); ?> />
                            &nbsp;<strong>Enable AI background removal by default</strong>
                        </label>
                        <fieldset style="margin:6px 0 6px 22px;">
                            <label style="display:block;margin-bottom:4px;">
                                <input type="radio" name="pilehead_ik_bgremove_scope" value="main" <?php checked( $bgr_scope, 'main' ); ?> />
                                &nbsp;Hero / main image only
                            </label>
                            <label style="display:block;">
                                <input type="radio" name="pilehead_ik_bgremove_scope" value="all" <?php checked( $bgr_scope, 'all' ); ?> />
                                &nbsp;Hero + all gallery images
                            </label>
                        </fieldset>
                        <p class="description">
                            Uses ImageKit's <code>e-bgremove</code> AI transform. Appended as a second transform step (<code>:e-bgremove</code>).<br>
                            <strong>Requires ImageKit Growth plan or above.</strong>
                            First request may be slow (1–3 s AI processing), then cached by ImageKit.<br>
                            Per-product overrides are available in each product's <em>Image Source Info</em> meta box.
                        </p>
                    </td>
                </tr>
                <tr>
                    <td colspan="2" style="padding-top:0;">
                        <p class="description" style="margin:0;">
                            Common transform params: <code>f-auto</code> auto format (WebP/AVIF) &nbsp;·&nbsp;
                            <code>q-auto</code> / <code>q-80</code> quality &nbsp;·&nbsp;
                            <code>w-N</code> max width &nbsp;·&nbsp;
                            <code>h-N</code> max height &nbsp;·&nbsp;
                            <code>c-at_max</code> only downscale, never upscale &nbsp;·&nbsp;
                            <code>bl-10</code> blur &nbsp;·&nbsp;
                            Leave any field blank to serve that image type without transforms.
                        </p>
                    </td>
                </tr>
            </table>
            <div style="margin:14px 0;padding:10px 14px;background:#f0f6ff;border-left:4px solid #0073aa;border-radius:0 6px 6px 0;font-size:13px;max-width:620px;">
                Active mode: <strong><?php $modes = PILEHEAD_GCS_MODES; echo esc_html($modes[$mode] ?? $mode); ?></strong>
            </div>
            <?php submit_button( 'Save Image Source' ); ?>
        </form>
    </div>
    <?php
}

// --------------------------------------------------------------
//  CORE HELPERS
// --------------------------------------------------------------

function pilehead_get_mode(): string {
    return (string) get_option( 'pilehead_gcs_mode', 'gcs' );
}

function pilehead_gcs_get_raw_main( int $product_id ): string {
    return (string) get_post_meta( $product_id, 'gcs_image_url', true );
}

function pilehead_gcs_get_raw_gallery( int $product_id ): array {
    $raw = (string) get_post_meta( $product_id, 'gcs_gallery_urls', true );
    if ( ! $raw ) return [];
    return array_values( array_filter( array_map( 'trim', explode( '|', $raw ) ) ) );
}

/**
 * Transform one GCS URL according to active mode:
 *   wp        => '' (fall back to WP � callers check for empty string)
 *   gcs       => GCS URL as-is
 *   imagekit  => ImageKit URL (replaces GCS base with IK base)
 *   gcs_ik    => same as imagekit
 */
function pilehead_transform_url( string $gcs_url ): string {
    if ( ! $gcs_url ) return '';
    $mode = pilehead_get_mode();
    if ( $mode === 'wp' ) return '';
    if ( $mode === 'gcs' ) return $gcs_url;

    // imagekit or gcs_ik: rewrite GCS base -> IK base
    $ikBase = rtrim( get_option( 'pilehead_imagekit_base', '' ), '/' );
    if ( ! $ikBase ) return $gcs_url; // IK not configured � serve GCS directly as fallback

    $gcsBase = rtrim( get_option( 'pilehead_gcs_base', '' ), '/' );
    if ( $gcsBase && strpos( $gcs_url, $gcsBase ) === 0 ) {
        return $ikBase . substr( $gcs_url, strlen( $gcsBase ) );
    }
    // No match � serve via IK with just the filename path
    return $ikBase . '/' . ltrim( parse_url( $gcs_url, PHP_URL_PATH ) ?? basename($gcs_url), '/' );
}

/**
 * Determine whether AI background removal should be applied for a given product + context.
 *
 * Priority: per-product meta ('1' force ON / '0' force OFF / '' follow global) → global setting.
 *
 * @param int    $product_id  0 = no per-product check (use global only).
 * @param string $context     'main', 'gallery', or 'thumb'.
 */
function pilehead_should_bgremove( int $product_id = 0, string $context = 'main' ): bool {
    // Never on loop thumbnails — wastes IK credits on tiny images
    if ( $context === 'thumb' ) return false;

    // Per-product override
    if ( $product_id > 0 ) {
        $per = get_post_meta( $product_id, 'pilehead_ik_bgremove', true );
        if ( $per === '1' ) {
            // Still respect scope: per-product ON uses global scope setting
            $scope = get_option( 'pilehead_ik_bgremove_scope', 'main' );
            return $context === 'main' || $scope === 'all';
        }
        if ( $per === '0' ) return false; // per-product explicitly OFF
    }

    // Global default
    if ( get_option( 'pilehead_ik_bgremove', '0' ) !== '1' ) return false;
    $scope = get_option( 'pilehead_ik_bgremove_scope', 'main' );
    return $context === 'main' || $scope === 'all';
}

/**
 * Append ImageKit transformation params to a URL.
 *
 * @param string $url        The image URL.
 * @param string $context    'main' (hero), 'gallery', or 'thumb' (loop/archive).
 * @param bool   $bgremove   Whether to add :e-bgremove as a chained step.
 *
 * Only applies in imagekit / gcs_ik modes. Safe on any URL.
 * Skips if transforms setting is empty or tr= already present.
 */
function pilehead_ik_url( string $url, string $context = 'main', bool $bgremove = false ): string {
    if ( ! $url ) return $url;
    if ( ! in_array( pilehead_get_mode(), [ 'imagekit', 'gcs_ik' ], true ) ) return $url;

    $ctx_map = [
        'main'    => [ 'option' => 'pilehead_imagekit_transforms',  'default' => 'f-auto,q-auto,w-1400' ],
        'gallery' => [ 'option' => 'pilehead_imagekit_tr_gallery',  'default' => 'f-auto,q-auto,w-900' ],
        'thumb'   => [ 'option' => 'pilehead_imagekit_tr_thumb',    'default' => 'f-auto,q-auto,w-600' ],
    ];
    $ctx        = $ctx_map[ $context ] ?? $ctx_map['main'];
    $transforms = trim( (string) get_option( $ctx['option'], $ctx['default'] ) );
    if ( ! $transforms && ! $bgremove ) return $url;
    if ( strpos( $url, 'tr=' ) !== false ) return $url; // don't double-apply
    $tr_value = $transforms;
    if ( $bgremove ) {
        // Chain bgremove as a separate IK transformation step with ':'
        $tr_value = $tr_value ? $tr_value . ':e-bgremove' : 'e-bgremove';
    }
    $sep = ( strpos( $url, '?' ) === false ) ? '?' : '&';
    return $url . $sep . 'tr=' . rawurlencode( $tr_value );
}

/**
 * @param int    $product_id
 * @param string $context    'main' (hero), 'thumb' (loop/archive card), 'gallery'
 */
function pilehead_get_main( int $product_id, string $context = 'main' ): string {
    $mode    = pilehead_get_mode();
    $bgr     = pilehead_should_bgremove( $product_id, $context );
    // In imagekit / gcs_ik mode: prefer directly-uploaded IK URL (set by Electron uploader)
    if ( in_array( $mode, [ 'imagekit', 'gcs_ik' ], true ) ) {
        $ik_url = (string) get_post_meta( $product_id, 'imagekit_image_url', true );
        if ( $ik_url ) return pilehead_ik_url( $ik_url, $context, $bgr );
    }
    $external = pilehead_ik_url( pilehead_transform_url( pilehead_gcs_get_raw_main( $product_id ) ), $context, $bgr );
    if ( $external ) return $external;
    // Fallback: WP attachment image (for products not yet on GCS/IK)
    $size_map = [ 'thumb' => 'medium', 'main' => 'large', 'gallery' => 'medium' ];
    $size     = $size_map[ $context ] ?? 'large';
    return (string) get_the_post_thumbnail_url( $product_id, $size );
}

function pilehead_get_gallery( int $product_id ): array {
    $mode = pilehead_get_mode();
    $bgr  = pilehead_should_bgremove( $product_id, 'gallery' );
    // In imagekit / gcs_ik mode: prefer directly-uploaded IK gallery URLs
    if ( in_array( $mode, [ 'imagekit', 'gcs_ik' ], true ) ) {
        $ik_raw = (string) get_post_meta( $product_id, 'imagekit_gallery_urls', true );
        if ( $ik_raw ) {
            $urls = array_values( array_filter( array_map( 'trim', explode( '|', $ik_raw ) ) ) );
            return array_map( function( $url ) use ( $bgr ) {
                return pilehead_ik_url( $url, 'gallery', $bgr );
            }, $urls );
        }
    }
    return array_values( array_filter( array_map( function( $url ) use ( $bgr ) {
        return pilehead_ik_url( pilehead_transform_url( $url ), 'gallery', $bgr );
    }, pilehead_gcs_get_raw_gallery( $product_id ) ) ) );
}

function pilehead_is_external(): bool {
    return pilehead_get_mode() !== 'wp';
}

// --------------------------------------------------------------
//  WOOCOMMERCE FILTERS
// --------------------------------------------------------------

// 0. Global post_thumbnail_html filter — catches get_the_post_thumbnail() calls from shortcodes
//    on any page type (homepage carousels, custom shortcodes like phst-card, etc.)
add_filter( 'post_thumbnail_html', 'pilehead_global_product_thumb_html', 25, 5 );
function pilehead_global_product_thumb_html( $html, $post_id, $post_thumbnail_id, $size, $attr ) {
    if ( ! pilehead_is_external() ) return $html;
    if ( get_post_type( $post_id ) !== 'product' ) return $html;
    $url = pilehead_get_main( (int) $post_id, 'thumb' );
    if ( ! $url ) return $html;

    if ( $html ) {
        // Existing WP thumbnail HTML — swap in CDN URL
        $html = preg_replace( '/\ssrc=["\'][^"\']*["\']/',      ' src="'    . esc_url( $url ) . '"', $html );
        $html = preg_replace( '/\ssrcset=["\'][^"\']*["\']/',   ' srcset=""',                        $html );
        $html = preg_replace( '/\sdata-src=["\'][^"\']*["\']/', ' data-src="' . esc_url( $url ) . '"', $html );
        return $html;
    }

    // No WP attachment thumbnail — build img tag from CDN URL directly
    $alt = esc_attr( get_the_title( $post_id ) );
    return '<img src="' . esc_url( $url ) . '" class="attachment-woocommerce_thumbnail size-woocommerce_thumbnail wp-post-image" alt="' . $alt . '" loading="lazy" />';
}

// 1. Shop / archive loop thumbnail — uses 'thumb' context (smaller, optimized for cards)
add_filter( 'woocommerce_product_get_image', 'pilehead_filter_loop_image', 10, 6 );
function pilehead_filter_loop_image( $html, $product, $size, $attr, $placeholder, $image_url ) {
    if ( ! pilehead_is_external() || ! $product ) return $html;
    $url = pilehead_get_main( $product->get_id(), 'thumb' );
    if ( ! $url ) return $html;
    $classes = isset( $attr['class'] ) ? esc_attr( $attr['class'] ) : 'attachment-woocommerce_thumbnail size-woocommerce_thumbnail';
    return '<img src="' . esc_url($url) . '" class="' . $classes . '" alt="' . esc_attr($product->get_name()) . '" loading="lazy" />';
}

// 2. Single product main hero
add_filter( 'woocommerce_single_product_image_html', 'pilehead_filter_single_main', 10, 2 );
function pilehead_filter_single_main( $html, $post_id ) {
    if ( ! pilehead_is_external() ) return $html;
    $url = pilehead_get_main( (int) $post_id );
    if ( ! $url ) return $html;
    $product = wc_get_product( $post_id );
    $alt     = $product ? esc_attr( $product->get_name() ) : '';
    return '<div data-thumb="' . esc_url($url) . '" data-thumb-alt="' . $alt . '" class="woocommerce-product-gallery__image">'
         . '<a href="' . esc_url($url) . '"><img src="' . esc_url($url) . '" class="wp-post-image" alt="' . $alt . '" loading="eager" /></a></div>';
}

// 3a. Clear WP gallery IDs
add_filter( 'woocommerce_product_get_gallery_image_ids', 'pilehead_clear_gallery_ids', 10, 2 );
function pilehead_clear_gallery_ids( $ids, $product ) {
    if ( ! pilehead_is_external() || ! $product ) return $ids;
    return pilehead_get_gallery( $product->get_id() ) ? [] : $ids;
}

// 3b. Render gallery thumbnails
add_action( 'woocommerce_product_thumbnails', 'pilehead_render_gallery_thumbs', 20 );
function pilehead_render_gallery_thumbs() {
    global $product;
    if ( ! pilehead_is_external() || ! $product ) return;
    $gallery = pilehead_get_gallery( $product->get_id() );
    if ( ! $gallery ) return;
    $alt = esc_attr( $product->get_name() );
    foreach ( $gallery as $url )
        echo '<div data-thumb="' . esc_url($url) . '" data-thumb-alt="' . $alt . '" class="woocommerce-product-gallery__image"><a href="' . esc_url($url) . '"><img src="' . esc_url($url) . '" alt="' . $alt . '" loading="lazy" /></a></div>';
}

// 4. REST API images[]
add_filter( 'woocommerce_rest_prepare_product_object', 'pilehead_rest_images', 10, 3 );
function pilehead_rest_images( $response, $product, $request ) {
    if ( ! pilehead_is_external() ) return $response;
    $main    = pilehead_get_main( $product->get_id() );
    $gallery = pilehead_get_gallery( $product->get_id() );
    if ( ! $main && ! $gallery ) return $response;
    $images = [];
    if ( $main ) $images[] = [ 'id' => 0, 'src' => $main, 'name' => $product->get_name(), 'alt' => $product->get_name() ];
    foreach ( $gallery as $url ) $images[] = [ 'id' => 0, 'src' => $url, 'name' => $product->get_name(), 'alt' => $product->get_name() ];
    $data = $response->get_data();
    $data['images'] = $images;
    $response->set_data( $data );
    return $response;
}

// 5. og:image
add_filter( 'wpseo_opengraph_image',                 'pilehead_og_image' );
add_filter( 'rank_math/opengraph/facebook/og:image', 'pilehead_og_image' );
function pilehead_og_image( $url ) {
    if ( ! pilehead_is_external() || ! is_product() ) return $url;
    global $product;
    if ( ! $product ) return $url;
    $ext = pilehead_get_main( $product->get_id() );
    return $ext ?: $url;
}

// --------------------------------------------------------------
//  ADMIN META BOX
// --------------------------------------------------------------
add_action( 'add_meta_boxes', function() {
    add_meta_box( 'pilehead_img_info', 'Image Source Info', 'pilehead_meta_box_render', 'product', 'side', 'default' );
} );

function pilehead_meta_box_render( $post ) {
    $mode     = pilehead_get_mode();
    $rawMain  = pilehead_gcs_get_raw_main( $post->ID );
    $main     = pilehead_get_main( $post->ID );
    $gallery  = pilehead_get_gallery( $post->ID );
    $failed   = get_post_meta( $post->ID, 'gcs_upload_failed', true );
    $no_img   = get_post_meta( $post->ID, 'gcs_no_images', true );
    $modes    = PILEHEAD_GCS_MODES;
    $per_bgr  = get_post_meta( $post->ID, 'pilehead_ik_bgremove', true ); // '1', '0', or ''

    wp_nonce_field( 'pilehead_meta_save', 'pilehead_meta_nonce' );

    echo '<p style="font-size:11px;color:#888;margin:0 0 8px;">Mode: <strong>' . esc_html($modes[$mode] ?? $mode) . '</strong></p>';
    echo '<p style="font-size:12px;margin:0 0 6px;">';
    if ( $failed )      echo '<span style="color:red;">&#x2717; Upload failed</span>';
    elseif ( $no_img )  echo '<span style="color:#aaa;">&#8212; No images flag</span>';
    elseif ( $rawMain ) echo '<span style="color:green;">&#x2713; GCS meta present</span>';
    else                echo '<span style="color:red;">&#x2717; No GCS meta</span>';
    echo '</p>';
    if ( $main ) {
        echo '<img src="' . esc_url($main) . '" style="max-width:100%;border-radius:4px;margin-bottom:6px;" />';
        echo '<p style="font-size:10px;word-break:break-all;color:#888;margin:0 0 6px;">' . esc_html($main) . '</p>';
    }
    if ( $gallery ) {
        echo '<p style="font-size:12px;font-weight:600;margin:8px 0 4px;">Gallery (' . count($gallery) . ')</p><div style="display:flex;flex-wrap:wrap;gap:4px;">';
        foreach ( $gallery as $url ) echo '<img src="' . esc_url($url) . '" style="width:48px;height:48px;object-fit:cover;border-radius:3px;" />';
        echo '</div>';
    }

    // ── Per-product BG remove override ──────────────────────────
    if ( in_array( $mode, [ 'imagekit', 'gcs_ik' ], true ) ) :
        $global_on = get_option( 'pilehead_ik_bgremove', '0' ) === '1';
        echo '<hr style="margin:12px 0;border:0;border-top:1px solid #eee;">';
        echo '<p style="font-size:11px;font-weight:600;margin:0 0 6px;">&#127913; AI Background Removal</p>';
        echo '<select name="pilehead_ik_bgremove" style="width:100%;font-size:12px;">';
        echo '<option value=""'  . selected( $per_bgr, '',  false ) . '>Follow global (' . ( $global_on ? 'ON' : 'OFF' ) . ')</option>';
        echo '<option value="1"' . selected( $per_bgr, '1', false ) . '>Force ON for this product</option>';
        echo '<option value="0"' . selected( $per_bgr, '0', false ) . '>Force OFF for this product</option>';
        echo '</select>';
        echo '<p style="font-size:10px;color:#888;margin:4px 0 0;">Requires ImageKit Growth plan.</p>';
    endif;

    echo '<p style="margin-top:10px;"><a href="' . admin_url('options-general.php?page=pilehead-gcs') . '" style="font-size:11px;">&#9881; Change mode</a></p>';
}

// Save per-product BG remove meta
add_action( 'save_post_product', 'pilehead_save_product_meta' );
function pilehead_save_product_meta( int $post_id ): void {
    if ( ! isset( $_POST['pilehead_meta_nonce'] ) ) return;
    if ( ! wp_verify_nonce( sanitize_text_field( wp_unslash( $_POST['pilehead_meta_nonce'] ) ), 'pilehead_meta_save' ) ) return;
    if ( defined( 'DOING_AUTOSAVE' ) && DOING_AUTOSAVE ) return;
    if ( ! current_user_can( 'edit_product', $post_id ) ) return;

    // '' = follow global, '1' = force on, '0' = force off
    $val = isset( $_POST['pilehead_ik_bgremove'] ) ? sanitize_text_field( $_POST['pilehead_ik_bgremove'] ) : '';
    if ( $val === '' ) {
        delete_post_meta( $post_id, 'pilehead_ik_bgremove' );
    } else {
        update_post_meta( $post_id, 'pilehead_ik_bgremove', $val === '1' ? '1' : '0' );
    }
}
