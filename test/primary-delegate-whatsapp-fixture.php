<?php
class WP_REST_Request {
    private $params;
    public function __construct($params) { $this->params = $params; }
    public function get_param($key) { return $this->params[$key] ?? null; }
}
class WP_Error {}

function add_action() {}
function get_post($id) {
    return (object) array('post_type' => $id === 13413 ? 'sp_team' : 'sp_staff');
}
function has_excerpt() { return true; }
function get_post_meta() { return 2468; }
function get_the_title($id) { return $id === 13413 ? 'U8 A' : 'Primary Delegate'; }
function get_post_field() { return 375474; }
function get_user_meta() { return '+32 470 12 34 56'; }
function get_option() {
    return array(
        'accountSid' => 'ACtest',
        'authToken' => 'secret',
        'from' => 'whatsapp:+32123456789',
        'primaryDelegateWhatsappTemplateId' => 'HXstored-value-must-be-ignored',
    );
}
function wp_strip_all_tags($value) { return strip_tags($value); }
function wp_json_encode($value) { return json_encode($value); }
function wp_remote_post($endpoint, $args) {
    $GLOBALS['twilio_request'] = array('endpoint' => $endpoint) + $args;
    return array('response' => array('code' => 201));
}
function is_wp_error() { return false; }
function wp_remote_retrieve_response_code($response) { return $response['response']['code']; }
function rest_ensure_response($value) { return $value; }

require dirname(__DIR__) . '/wordpress/jvgh-team-delegates.php';

$response = jvgh_rest_send_primary_delegate_whatsapp(
    new WP_REST_Request(array('teamId' => 13413, 'staffId' => 2468))
);
if (empty($response['ok'])) {
    fwrite(STDERR, "The mocked send did not succeed.\n");
    exit(1);
}
echo json_encode($GLOBALS['twilio_request']);
