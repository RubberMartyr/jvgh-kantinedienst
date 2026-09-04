<?php
class WP_REST_Server {
    const CREATABLE = 'POST';
}

class WP_Error {
    private $message;
    public function __construct($code = '', $message = '') { $this->message = $message; }
    public function get_error_message() { return $this->message; }
}

class WP_REST_Request {
    public $method;
    public $route;
    public $query_params = array();
    public $headers = array();
    public $body = '';
    public $body_params = array();

    public function __construct($method, $route) { $this->method = $method; $this->route = $route; }
    public function set_query_params($params) { $this->query_params = $params; }
    public function set_header($name, $value) { $this->headers[$name] = $value; }
    public function set_body($body) { $this->body = $body; }
    public function set_body_params($params) { $this->body_params = $params; }
}

class WP_REST_Response {
    private $data;
    private $error;
    public function __construct($data = null, $error = null) { $this->data = $data; $this->error = $error; }
    public function is_error() { return $this->error !== null; }
    public function as_error() { return $this->error; }
    public function get_data() { return $this->data; }
}

function add_action() {}
function add_filter() {}
function register_rest_route() {}
function wp_json_encode($value) { return json_encode($value); }
function rest_do_request($request) {
    $GLOBALS['requests'][] = $request;
    if ($request->route === '/error') {
        return new WP_REST_Response(null, $GLOBALS['expected_error']);
    }
    return new WP_REST_Response(array('ok' => true));
}

require dirname(__DIR__) . '/wordpress/jvgh-availability-assignments.php';

$GLOBALS['requests'] = array();
jvgh_availability_internal_request('post', '/jvgh/v1/schedules', array(
    'title' => 'Kantinedienst 2026-09-05',
    'start' => '2026-09-05T08:30:00',
    'end' => '2026-09-05T14:30:00',
));
jvgh_availability_internal_request('POST', '/jvgh/v1/schedules/17/tasks', array(
    'title' => 'Kantinedienst 08:30–14:30',
    'qty' => 360,
    'date' => '2026-09-05',
    'time' => '08:30',
));
jvgh_availability_internal_request('POST', '/jvgh/v1/tasks/29/signups', array(
    'firstName' => 'Test User',
    'lastName' => '',
    'email' => '',
    'phone' => '',
    'userId' => 42,
));
jvgh_availability_internal_request('get', '/jvgh/v1/planner-month-data', array('month' => '2026-09'));
jvgh_availability_internal_request('delete', '/jvgh/v1/schedules/17/tasks/29');

$GLOBALS['expected_error'] = new WP_Error('original_code', 'Original REST error');
$returned_error = jvgh_availability_internal_request('POST', '/error', array('title' => 'Still JSON'));

$output = array();
foreach ($GLOBALS['requests'] as $request) {
    $output[] = array(
        'method' => $request->method,
        'route' => $request->route,
        'query' => $request->query_params,
        'contentType' => $request->headers['Content-Type'] ?? null,
        'json' => $request->body === '' ? null : json_decode($request->body, true),
        'bodyParams' => $request->body_params,
    );
}
$output['preservedError'] = $returned_error === $GLOBALS['expected_error']
    && $returned_error->get_error_message() === 'Original REST error';

echo json_encode($output);
