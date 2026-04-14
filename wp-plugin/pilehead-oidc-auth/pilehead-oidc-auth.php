<?php
/**
 * Plugin Name: Pilehead Bridge Auth
 * Description: Simplified Bridge Authentication for Desktop App.
 * Version: 0.2.0
 * Author: Pilehead
 */
if (!defined('ABSPATH')) exit;

// --- App Users Management ---
function p_bridge_load_users() {
    $raw = get_option('pilehead_app_users', '');
    return $raw ? json_decode($raw, true) : array();
}

function p_bridge_save_users($users) {
    update_option('pilehead_app_users', json_encode($users));
}

// --- Admin UI ---
add_action('admin_menu', function() {
    add_menu_page('Pilehead Bridge', 'Bridge Users', 'manage_options', 'pilehead-bridge-users', 'p_bridge_users_page', 'dashicons-admin-users', 81);
});

function p_bridge_users_page() {
    if (!current_user_can('manage_options')) return;
    
    // Handle Add User
    if (isset($_POST['add_user']) && check_admin_referer('p_bridge_add')) {
        $u = sanitize_text_field($_POST['app_user']);
        $p = $_POST['app_pass'];
        $r = sanitize_text_field($_POST['app_role']);
        if ($u && $p) {
            $users = p_bridge_load_users();
            $users[$u] = array('hash' => wp_hash_password($p), 'role' => $r);
            p_bridge_save_users($users);
            echo '<div class="updated"><p>User added.</p></div>';
        }
    }
    
    // Handle Delete User
    if (isset($_GET['del']) && check_admin_referer('p_bridge_del')) {
        $u = sanitize_text_field($_GET['del']);
        $users = p_bridge_load_users();
        if (isset($users[$u])) {
            unset($users[$u]);
            p_bridge_save_users($users);
            echo '<div class="updated"><p>User deleted.</p></div>';
        }
    }

    $users = p_bridge_load_users();
    ?>
    <div class="wrap">
        <h1>Pilehead Bridge Users</h1>
        <p>Create separate credentials for desktop app users. These are NOT WordPress users.</p>
        
        <div class="card" style="max-width: 500px; padding: 1em; margin-bottom: 20px;">
            <h2>Add New App User</h2>
            <form method="post">
                <?php wp_nonce_field('p_bridge_add'); ?>
                <p>
                    <label>Username</label><br>
                    <input type="text" name="app_user" class="regular-text" required>
                </p>
                <p>
                    <label>Password</label><br>
                    <input type="password" name="app_pass" class="regular-text" required>
                </p>
                <p>
                    <label>Role (Permissions)</label><br>
                    <select name="app_role">
                        <option value="shop_manager">Shop Manager (Recommended)</option>
                        <option value="editor">Editor</option>
                        <option value="administrator">Administrator</option>
                    </select>
                </p>
                <p><input type="submit" name="add_user" class="button button-primary" value="Add User"></p>
            </form>
        </div>

        <table class="wp-list-table widefat fixed striped">
            <thead><tr><th>Username</th><th>Role</th><th>Actions</th></tr></thead>
            <tbody>
                <?php if (empty($users)): ?>
                    <tr><td colspan="3">No app users found.</td></tr>
                <?php else: ?>
                    <?php foreach ($users as $name => $data): ?>
                        <tr>
                            <td><?php echo esc_html($name); ?></td>
                            <td><?php echo esc_html($data['role'] ?? 'shop_manager'); ?></td>
                            <td>
                                <a href="<?php echo wp_nonce_url(admin_url('admin.php?page=pilehead-bridge-users&del=' . urlencode($name)), 'p_bridge_del'); ?>" style="color: #b32d2e;">Delete</a>
                            </td>
                        </tr>
                    <?php endforeach; ?>
                <?php endif; ?>
            </tbody>
        </table>
    </div>
    <?php
}

// --- JWT Helper ---
function p_bridge_local_secret() {
    $env = getenv('PILEHEAD_BRIDGE_SECRET');
    if ($env) return $env;
    $opt = get_option('pilehead_bridge_secret');
    if ($opt) return $opt;
    $gen = wp_generate_password(64, false, false);
    update_option('pilehead_bridge_secret', $gen);
    return $gen;
}

function p_bridge_b64url_enc($bin) {
    return rtrim(strtr(base64_encode($bin), '+/', '-_'), '=');
}

function p_bridge_issue_jwt($user_id) {
    $secret = p_bridge_local_secret();
    $header = json_encode(array('alg' => 'HS256', 'typ' => 'JWT'));
    $payload = json_encode(array(
        'uid' => $user_id,
        'iat' => time(),
        'exp' => time() + (3600 * 24) // 24 hours
    ));
    $base = p_bridge_b64url_enc($header) . '.' . p_bridge_b64url_enc($payload);
    $sig = hash_hmac('sha256', $base, $secret, true);
    return $base . '.' . p_bridge_b64url_enc($sig);
}

function p_bridge_verify_jwt($token) {
    $secret = p_bridge_local_secret();
    $parts = explode('.', $token);
    if (count($parts) !== 3) return false;
    $base = $parts[0] . '.' . $parts[1];
    $sig = p_bridge_b64url_enc(hash_hmac('sha256', $base, $secret, true));
    if (!hash_equals($sig, $parts[2])) return false;
    $payload = json_decode(base64_decode(strtr($parts[1], '-_', '+/')), true);
    if (!$payload || !isset($payload['uid'])) return false;
    if (isset($payload['exp']) && $payload['exp'] < time()) return false;
    return $payload;
}

// --- Login Endpoint ---
add_action('rest_api_init', function() {
    register_rest_route('pilehead-bridge/v1', '/app-login', array(
        'methods' => 'POST',
        'callback' => function($request) {
            $username = sanitize_text_field($request->get_param('username'));
            $password = $request->get_param('password');
            
            if (!$username || !$password) {
                return new WP_Error('bridge_login', 'Missing credentials', array('status' => 400));
            }

            // Check Bridge Users first
            $users = p_bridge_load_users();
            if (isset($users[$username])) {
                if (wp_check_password($password, $users[$username]['hash'])) {
                    $role = $users[$username]['role'] ?? 'shop_manager';
                    
                    // Map to shadow WP user
                    $wp_login = 'bridge_' . sanitize_title($username);
                    $u = get_user_by('login', $wp_login);
                    if (!$u) {
                        $uid = wp_create_user($wp_login, wp_generate_password(32), '');
                        if (!is_wp_error($uid)) {
                            $u = get_user_by('id', $uid);
                            $u->set_role($role);
                        }
                    }
                    
                    if ($u) {
                        // Create API Keys if missing
                        global $wpdb;
                        $consumer_key = '';
                        $consumer_secret = '';
                        
                        // Check existing keys for this user description
                        $desc = 'Desktop App Key (' . $username . ')';
                        $row = $wpdb->get_row($wpdb->prepare(
                            "SELECT consumer_key, consumer_secret FROM {$wpdb->prefix}woocommerce_api_keys WHERE user_id = %d AND description = %s LIMIT 1",
                            $u->ID,
                            $desc
                        ));

                        if ($row) {
                            $consumer_key = $row->consumer_key; // hashed, can't retrieve secret easily from DB if hashed
                            // Actually, WooCommerce stores truncated key and hashed secret usually.
                            // We can't retrieve the secret. 
                            // So we generate a JWT instead to bypass keys management complexity.
                        } 
                        
                        // Issue JWT
                        $token = p_bridge_issue_jwt($u->ID);
                        
                        // Return JWT + User Info + (Optional: newly generated keys if we wanted to go that route)
                        // Simpler: Just return JWT and use Bearer everywhere.
                        return rest_ensure_response(array(
                            'access_token' => $token,
                            'token_type' => 'Bearer',
                            'user_display' => $username,
                            'role' => $role
                        ));
                    }
                }
            }

            return new WP_Error('bridge_login', 'Invalid credentials', array('status' => 401));
        },
        'permission_callback' => '__return_true'
    ));
});

// --- Auth Filter ---
add_filter('determine_current_user', function($user_id) {
    $auth = isset($_SERVER['HTTP_AUTHORIZATION']) ? $_SERVER['HTTP_AUTHORIZATION'] : '';
    if (!$auth || stripos($auth, 'Bearer ') !== 0) return $user_id;
    $token = trim(substr($auth, 7));
    $payload = p_bridge_verify_jwt($token);
    if ($payload && $payload['uid']) {
        return $payload['uid'];
    }
    return $user_id;
}, 21);

// --- Allow Login Route ---
add_filter('rest_authentication_errors', function($result) {
    $uri = isset($_SERVER['REQUEST_URI']) ? $_SERVER['REQUEST_URI'] : '';
    if (strpos($uri, '/wp-json/pilehead-bridge/v1/app-login') !== false) return $result;
    
    // Optional: Enforce auth for other endpoints if desired, or let WP handle standard auth
    // if (!is_user_logged_in()) return new WP_Error('auth_required', 'Authentication required', array('status' => 401));
    
    return $result;
}, 20);
