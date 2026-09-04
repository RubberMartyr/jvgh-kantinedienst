<?php
/**
 * Atomic desired-state reconciliation for assignments created by availability.html.
 * Load this beside the existing JVGH REST implementation.
 */

define('JVGH_AVAILABILITY_SOURCE_META', '_jvgh_source');
define('JVGH_AVAILABILITY_OWNER_META', '_jvgh_owner_user_id');
define('JVGH_AVAILABILITY_SLOTS_META', '_jvgh_covered_slots');
define('JVGH_AVAILABILITY_TEAM_META', '_jvgh_team_id');

add_action('rest_api_init', function () {
    register_rest_route('jvgh/v1', '/availability-assignments/reconcile', array(
        'methods' => WP_REST_Server::CREATABLE,
        'callback' => 'jvgh_rest_reconcile_availability_assignments',
        'permission_callback' => '__return_true',
    ));
});

/** Add private ownership metadata to the existing bulk response, without changing planner behavior. */
add_filter('rest_post_dispatch', function ($response, $server, $request) {
    if ($request->get_route() !== '/jvgh/v1/planner-month-data' || is_wp_error($response)) return $response;
    $data = $response instanceof WP_REST_Response ? $response->get_data() : $response;
    if (!is_array($data) || empty($data['schedules'])) return $response;
    foreach ($data['schedules'] as &$schedule) {
        if (empty($schedule['tasks']) || !is_array($schedule['tasks'])) continue;
        foreach ($schedule['tasks'] as &$task) {
            $task_id = isset($task['id']) ? (int) $task['id'] : 0;
            if (!$task_id || get_post_meta($task_id, JVGH_AVAILABILITY_SOURCE_META, true) !== 'availability') continue;
            $task['jvghSource'] = 'availability';
            $task['jvghOwnerUserId'] = (int) get_post_meta($task_id, JVGH_AVAILABILITY_OWNER_META, true);
            $slots = get_post_meta($task_id, JVGH_AVAILABILITY_SLOTS_META, true);
            $task['jvghCoveredSlots'] = is_array($slots) ? array_values($slots) : array();
            $team_id = (int) get_post_meta($task_id, JVGH_AVAILABILITY_TEAM_META, true);
            $task['teamId'] = $team_id ?: null;
        }
        unset($task);
    }
    unset($schedule);
    if ($response instanceof WP_REST_Response) { $response->set_data($data); return $response; }
    return rest_ensure_response($data);
}, 10, 3);

function jvgh_availability_internal_request($method, $route, $body = array()) {
    $method = strtoupper((string) $method);
    $request = new WP_REST_Request($method, $route);

    if ($method === 'GET') {
        $request->set_query_params($body);
    } elseif (!empty($body)) {
        $request->set_header('Content-Type', 'application/json');
        $request->set_body(wp_json_encode($body));
        $request->set_body_params($body);
    }

    $response = rest_do_request($request);

    if ($response->is_error()) {
        return $response->as_error();
    }

    return $response->get_data();
}

function jvgh_availability_entity($data, $key) {
    if (isset($data[$key]) && is_array($data[$key])) return $data[$key];
    return is_array($data) ? $data : array();
}

function jvgh_availability_identity($user_id, $task) {
    $date = substr((string) ($task['date'] ?? ''), 0, 10);
    $start = substr((string) ($task['time'] ?? $task['startTime'] ?? ''), 0, 5);
    $qty = (int) ($task['qty'] ?? 0);
    $end = isset($task['endTime']) ? substr((string) $task['endTime'], 0, 5) : '';
    if (!$end && preg_match('/^(\d{2}):(\d{2})$/', $start, $match)) {
        $minutes = ((int) $match[1] * 60) + (int) $match[2] + $qty;
        $end = sprintf('%02d:%02d', intdiv($minutes, 60), $minutes % 60);
    }
    $slots = $task['coveredSlotKeys'] ?? $task['jvghCoveredSlots'] ?? array();
    sort($slots, SORT_STRING);
    return $user_id . '|' . $date . '|' . $start . '|' . $end . '|' . implode(',', $slots);
}

function jvgh_rest_reconcile_availability_assignments(WP_REST_Request $request) {
    global $wpdb;
    $user_id = (int) $request->get_param('userId');
    $team_id = (int) $request->get_param('teamId');
    $month = sanitize_text_field((string) $request->get_param('month'));
    $input = $request->get_param('assignments');
    if (!$user_id || !get_userdata($user_id) || !preg_match('/^\d{4}-\d{2}$/', $month) || !is_array($input))
        return new WP_Error('jvgh_invalid_availability_state', 'Ongeldige availability desired state.', array('status' => 400));

    $desired = array();
    foreach ($input as $assignment) {
        $date = sanitize_text_field((string) ($assignment['date'] ?? ''));
        $start = sanitize_text_field((string) ($assignment['startTime'] ?? ''));
        $end = sanitize_text_field((string) ($assignment['endTime'] ?? ''));
        $slots = array_values(array_unique(array_map('sanitize_text_field', (array) ($assignment['coveredSlotKeys'] ?? array()))));
        if (substr($date, 0, 7) !== $month || !preg_match('/^\d{2}:\d{2}$/', $start) ||
            !preg_match('/^\d{2}:\d{2}$/', $end) || $end <= $start || !$slots)
            return new WP_Error('jvgh_invalid_availability_interval', 'Een availabilityinterval is ongeldig.', array('status' => 400));
        $start_ts = strtotime("$date $start"); $end_ts = strtotime("$date $end");
        if (!$start_ts || !$end_ts || $end_ts <= $start_ts || date('Y-m-d', $end_ts) !== $date)
            return new WP_Error('jvgh_invalid_availability_interval', 'Een availabilityinterval mag niet over middernacht lopen.', array('status' => 400));
        sort($slots, SORT_STRING);
        $normalized = array('date' => $date, 'startTime' => $start, 'endTime' => $end,
            'qty' => (int) (($end_ts - $start_ts) / 60), 'coveredSlotKeys' => $slots);
        $desired[jvgh_availability_identity($user_id, $normalized)] = $normalized;
    }

    $month_data = jvgh_availability_internal_request('GET', '/jvgh/v1/planner-month-data', array('month' => $month));
    if (is_wp_error($month_data)) return $month_data;
    $schedules = (array) ($month_data['schedules'] ?? array());
    $schedule_by_day = array(); $existing = array();
    foreach ($schedules as $schedule) {
        $day = substr((string) ($schedule['start'] ?? ''), 0, 10);
        if ($day) $schedule_by_day[$day] = (int) $schedule['id'];
        foreach ((array) ($schedule['tasks'] ?? array()) as $task) {
            $task_id = (int) ($task['id'] ?? 0);
            if (!$task_id || get_post_meta($task_id, JVGH_AVAILABILITY_SOURCE_META, true) !== 'availability' ||
                (int) get_post_meta($task_id, JVGH_AVAILABILITY_OWNER_META, true) !== $user_id ||
                (int) get_post_meta($task_id, JVGH_AVAILABILITY_TEAM_META, true) !== $team_id) continue;
            $task['jvghCoveredSlots'] = (array) get_post_meta($task_id, JVGH_AVAILABILITY_SLOTS_META, true);
            $task['_schedule_id'] = (int) $schedule['id'];
            $existing[jvgh_availability_identity($user_id, $task)] = $task;
        }
    }

    $wpdb->query('START TRANSACTION');
    try {
        foreach (array_diff_key($desired, $existing) as $identity => $assignment) {
            $date = $assignment['date'];
            if (empty($schedule_by_day[$date])) {
                $created = jvgh_availability_internal_request('POST', '/jvgh/v1/schedules', array(
                    'title' => "Kantinedienst $date", 'start' => "{$date}T{$assignment['startTime']}:00",
                    'end' => "{$date}T{$assignment['endTime']}:00"));
                if (is_wp_error($created)) throw new Exception($created->get_error_message());
                $schedule_by_day[$date] = (int) (jvgh_availability_entity($created, 'schedule')['id'] ?? 0);
            }
            $schedule_id = $schedule_by_day[$date];
            $created = jvgh_availability_internal_request('POST', "/jvgh/v1/schedules/$schedule_id/tasks", array(
                'title' => "Kantinedienst {$assignment['startTime']}–{$assignment['endTime']}",
                'qty' => $assignment['qty'], 'date' => $date, 'time' => $assignment['startTime']));
            if (is_wp_error($created)) throw new Exception($created->get_error_message());
            $task_id = (int) (jvgh_availability_entity($created, 'task')['id'] ?? 0);
            if (!$task_id) throw new Exception('De availabilitytask kon niet worden aangemaakt.');
            update_post_meta($task_id, JVGH_AVAILABILITY_SOURCE_META, 'availability');
            update_post_meta($task_id, JVGH_AVAILABILITY_OWNER_META, $user_id);
            update_post_meta($task_id, JVGH_AVAILABILITY_SLOTS_META, $assignment['coveredSlotKeys']);
            if ($team_id) update_post_meta($task_id, JVGH_AVAILABILITY_TEAM_META, $team_id);
            $user = get_userdata($user_id);
            $signup = jvgh_availability_internal_request('POST', "/jvgh/v1/tasks/$task_id/signups", array(
                'firstName' => $user->display_name, 'lastName' => '', 'email' => '', 'phone' => '', 'userId' => $user_id));
            if (is_wp_error($signup)) throw new Exception($signup->get_error_message());
        }

        foreach (array_diff_key($existing, $desired) as $task) {
            $task_id = (int) $task['id'];
            $other_signups = array(); $own_signups = array();
            foreach ((array) ($task['signups'] ?? array()) as $signup) {
                $signup_user = (int) ($signup['userId'] ?? $signup['user_id'] ?? 0);
                if ($signup_user === $user_id) $own_signups[] = $signup; else $other_signups[] = $signup;
            }
            foreach ($own_signups as $signup) {
                $deleted = jvgh_availability_internal_request('DELETE', "/jvgh/v1/tasks/$task_id/signups/" . (int) $signup['id']);
                if (is_wp_error($deleted)) throw new Exception($deleted->get_error_message());
            }
            if (!$other_signups) {
                $deleted = jvgh_availability_internal_request('DELETE', "/jvgh/v1/schedules/{$task['_schedule_id']}/tasks/$task_id");
                if (is_wp_error($deleted)) throw new Exception($deleted->get_error_message());
            }
        }
        $wpdb->query('COMMIT');
    } catch (Exception $error) {
        $wpdb->query('ROLLBACK');
        return new WP_Error('jvgh_availability_reconcile_failed', $error->getMessage(), array('status' => 500));
    }
    return rest_ensure_response(array('ok' => true, 'userId' => $user_id, 'month' => $month,
        'assignmentCount' => count($desired)));
}
