<?php
/**
 * REST support for volunteers and the parent availability popup.
 *
 * `sp_role` belongs to a staff post, not to a staff/team relation. A staff post
 * can serve several teams, so the selected staff ID is also stored on each team.
 * The SportsPress role remains synchronised and visible in WordPress.
 */
define('JVGH_PRIMARY_DELEGATE_META_KEY', '_jvgh_primary_delegate_staff_id');
define('JVGH_WHATSAPP_SETTINGS_OPTION', 'jvgh_whatsapp_settings');
define(
    'JVGH_PRIMARY_DELEGATE_WHATSAPP_TEMPLATE_ID',
    'HX99004e68f1b165d54e7824088636bf6f'
);

add_action('rest_api_init', function () {
    register_rest_route('jvgh/v1', '/volunteers', array(
        'methods'             => WP_REST_Server::READABLE,
        'callback'            => 'jvgh_rest_volunteers',
        'permission_callback' => '__return_true',
        'args'                => array(
            'role' => array('required' => false, 'type' => 'string'),
        ),
    ));

    register_rest_route('jvgh/v1', '/team-delegates', array(
        'methods'             => WP_REST_Server::READABLE,
        'callback'            => 'jvgh_rest_team_delegates',
        'permission_callback' => '__return_true',
    ));

    register_rest_route('jvgh/v1', '/availability-parent', array(
        'methods'             => WP_REST_Server::CREATABLE,
        'callback'            => 'jvgh_rest_resolve_availability_parent',
        'permission_callback' => '__return_true',
        'args'                => array(
            'firstName' => array('required' => true, 'type' => 'string'),
            'lastName'  => array('required' => true, 'type' => 'string'),
            'phone'     => array('required' => true, 'type' => 'string'),
            'teamId'    => array('required' => true, 'type' => 'integer', 'minimum' => 1),
        ),
    ));

    register_rest_route('jvgh/v1', '/team-primary-delegate', array(
        'methods'             => WP_REST_Server::CREATABLE,
        'callback'            => 'jvgh_rest_update_team_primary_delegate',
        'permission_callback' => '__return_true',
        'args'                => array(
            'teamId'  => array('required' => true, 'type' => 'integer', 'minimum' => 1),
            'staffId' => array('required' => false, 'type' => 'integer', 'minimum' => 1),
            'userId'  => array('required' => false, 'type' => 'integer', 'minimum' => 1),
        ),
    ));
    register_rest_route('jvgh/v1', '/whatsapp-settings', array(
        array('methods' => WP_REST_Server::READABLE, 'callback' => 'jvgh_rest_whatsapp_settings',
            'permission_callback' => '__return_true'),
        array('methods' => WP_REST_Server::CREATABLE, 'callback' => 'jvgh_rest_save_whatsapp_settings',
            'permission_callback' => '__return_true'),
    ));
    register_rest_route('jvgh/v1', '/send-primary-delegate-whatsapp', array(
        'methods' => WP_REST_Server::CREATABLE,
        'callback' => 'jvgh_rest_send_primary_delegate_whatsapp',
        'permission_callback' => '__return_true',
        'args' => array(
            'teamId' => array('required' => true, 'type' => 'integer', 'minimum' => 1),
            'staffId' => array('required' => true, 'type' => 'integer', 'minimum' => 1),
        ),
    ));
});

function jvgh_whatsapp_setting_keys() {
    return array('accountSid', 'from', 'contentSid', 'reminderContentSid', 'scheduledContentSid',
        'authToken', 'primaryDelegateWhatsappTemplateId');
}

function jvgh_rest_whatsapp_settings() {
    $settings = get_option(JVGH_WHATSAPP_SETTINGS_OPTION, array());
    return rest_ensure_response(array('ok' => true, 'settings' => is_array($settings) ? $settings : array()));
}

function jvgh_rest_save_whatsapp_settings(WP_REST_Request $request) {
    $settings = array();
    foreach (jvgh_whatsapp_setting_keys() as $key) {
        $value = $request->get_param($key);
        $settings[$key] = sanitize_text_field(is_scalar($value) ? (string) $value : '');
    }
    update_option(JVGH_WHATSAPP_SETTINGS_OPTION, $settings, false);
    return rest_ensure_response(array('ok' => true, 'settings' => $settings));
}

function jvgh_rest_send_primary_delegate_whatsapp(WP_REST_Request $request) {
    $team_id = (int) $request->get_param('teamId');
    $requested_staff_id = (int) $request->get_param('staffId');
    $team = get_post($team_id);
    if (!$team || $team->post_type !== 'sp_team' || !has_excerpt($team_id))
        return new WP_Error('jvgh_invalid_home_team', 'Ongeldige thuisploeg.', array('status' => 400));

    $primary_staff_id = (int) get_post_meta($team_id, JVGH_PRIMARY_DELEGATE_META_KEY, true);
    if (!$primary_staff_id)
        return new WP_Error('jvgh_missing_primary_delegate', get_the_title($team_id) . ': geen primaire afgevaardigde ingesteld.', array('status' => 400));
    if ($requested_staff_id !== $primary_staff_id)
        return new WP_Error('jvgh_primary_delegate_mismatch', 'De gekozen persoon is niet de primaire afgevaardigde van deze ploeg.', array('status' => 400));

    $staff = get_post($primary_staff_id);
    if (!$staff || $staff->post_type !== 'sp_staff')
        return new WP_Error('jvgh_primary_delegate_not_found', get_the_title($team_id) . ': de primaire afgevaardigde kon niet worden gevonden.', array('status' => 400));
    $user_id = (int) get_post_field('post_author', $primary_staff_id);
    if (!$user_id)
        return new WP_Error('jvgh_primary_delegate_user_missing', 'De primaire afgevaardigde heeft geen gekoppelde gebruiker.', array('status' => 400));
    $phone = $user_id ? jvgh_get_user_phone($user_id) : '';
    $digits = preg_replace('/[^0-9+]/', '', $phone);
    if (!preg_match('/^\+?[0-9]{8,15}$/', $digits))
        return new WP_Error('jvgh_primary_delegate_phone_missing', get_the_title($primary_staff_id) . ' heeft geen telefoonnummer.', array('status' => 400));
    if (strpos($digits, '+') !== 0) $digits = strpos($digits, '0') === 0 ? '+32' . substr($digits, 1) : '+' . $digits;

    $settings = get_option(JVGH_WHATSAPP_SETTINGS_OPTION, array());
    $template_id = JVGH_PRIMARY_DELEGATE_WHATSAPP_TEMPLATE_ID;
    if (!$template_id)
        return new WP_Error('jvgh_primary_delegate_template_missing', 'De WhatsApp-template voor primaire afgevaardigden ontbreekt.', array('status' => 500));
    foreach (array('accountSid', 'authToken', 'from') as $key)
        if (empty($settings[$key])) return new WP_Error('jvgh_whatsapp_setting_missing', 'Niet alle verplichte WhatsApp-instellingen zijn ingevuld.', array('status' => 400));
    $team_name = trim(
        wp_strip_all_tags(
            get_the_title($team_id)
        )
    );

    $variables = array(
        '1' => $team_name,
        '2' => (string) $team_id,
    );
    if (!$variables['1'] || !$variables['2'])
        return new WP_Error('jvgh_template_variables_missing', 'Niet alle verplichte templateparameters zijn beschikbaar.', array('status' => 400));

    $endpoint = sprintf('https://api.twilio.com/2010-04-01/Accounts/%s/Messages.json', rawurlencode($settings['accountSid']));
    $response = wp_remote_post($endpoint, array('timeout' => 20,
        'headers' => array('Authorization' => 'Basic ' . base64_encode($settings['accountSid'] . ':' . $settings['authToken'])),
        'body' => array('To' => 'whatsapp:' . $digits, 'From' => $settings['from'], 'ContentSid' => JVGH_PRIMARY_DELEGATE_WHATSAPP_TEMPLATE_ID,
            'ContentVariables' => wp_json_encode($variables))));
    if (is_wp_error($response)) {
        error_log(sprintf(
            'JVGH primary delegate WhatsApp transport error: teamId=%d staffId=%d',
            $team_id,
            $primary_staff_id
        ));
        return new WP_Error('jvgh_whatsapp_failed', 'WhatsApp-verzending is mislukt.', array('status' => 502));
    }
    $status = (int) wp_remote_retrieve_response_code($response);
    if ($status < 200 || $status >= 300) {
        $twilio_error = json_decode(wp_remote_retrieve_body($response), true);
        $twilio_code = is_array($twilio_error) && isset($twilio_error['code']) ? (string) $twilio_error['code'] : '-';
        $twilio_message = is_array($twilio_error) && isset($twilio_error['message'])
            ? sanitize_text_field((string) $twilio_error['message'])
            : '-';
        error_log(sprintf(
            'JVGH primary delegate WhatsApp error: HTTP %d; code=%s; message=%s; teamId=%d; staffId=%d',
            $status,
            $twilio_code,
            $twilio_message,
            $team_id,
            $primary_staff_id
        ));
        return new WP_Error('jvgh_whatsapp_failed', 'WhatsApp-verzending is mislukt.', array('status' => 502));
    }
    return rest_ensure_response(array('ok' => true, 'teamId' => $team_id, 'staffId' => $primary_staff_id));
}

/** Return the shared phone field used by all JVGH people endpoints. */
function jvgh_get_user_phone($user_id) {
    return (string) get_user_meta($user_id, 'billing_phone', true);
}

function jvgh_normalize_parent_phone($phone) {
    $digits = preg_replace('/[^0-9+]/', '', trim((string) $phone));
    if (strpos($digits, '00') === 0) $digits = '+' . substr($digits, 2);
    elseif (strpos($digits, '0') === 0) $digits = '+32' . substr($digits, 1);
    if (!preg_match('/^\+324[0-9]{8}$/', $digits)) return '';
    return $digits;
}

/** Resolve by normalized phone first; only create a volunteer when no match exists. */
function jvgh_rest_resolve_availability_parent(WP_REST_Request $request) {
    $first_name = sanitize_text_field(trim((string) $request->get_param('firstName')));
    $last_name = sanitize_text_field(trim((string) $request->get_param('lastName')));
    $phone = jvgh_normalize_parent_phone($request->get_param('phone'));
    $team_id = (int) $request->get_param('teamId');
    if (!$first_name || !$last_name)
        return new WP_Error('jvgh_parent_name_required', 'Voornaam en naam zijn verplicht.', array('status' => 400));
    if (!$phone)
        return new WP_Error('jvgh_parent_phone_invalid', 'Geef een geldig Belgisch gsm-nummer in.', array('status' => 400));

    // Availability accepts every existing SportsPress team exposed by the team filter.
    $team = get_post($team_id);
    if (!$team_id || !$team || $team->post_type !== 'sp_team')
        return new WP_Error('jvgh_invalid_parent_team', 'Ploeg niet gevonden.', array('status' => 400));

    $matched_user = null;
    foreach (get_users(array('fields' => 'all')) as $candidate) {
        if (jvgh_normalize_parent_phone(jvgh_get_user_phone($candidate->ID)) === $phone) {
            $matched_user = $candidate;
            break;
        }
    }
    $created = false;
    if (!$matched_user) {
        if (!get_role('eventadmin_volunteer'))
            return new WP_Error('jvgh_parent_role_missing', 'De vrijwilligersrol bestaat niet.', array('status' => 500));

        $base = sanitize_user(remove_accents(strtolower($first_name . '.' . $last_name)), true) ?: 'ouder';
        $login = $base;
        for ($suffix = 2; username_exists($login); $suffix++) $login = $base . $suffix;
        $user_id = wp_insert_user(array(
            'user_login' => $login,
            'user_pass' => wp_generate_password(32, true, true),
            'display_name' => $first_name . ' ' . $last_name,
            'first_name' => $first_name,
            'last_name' => $last_name,
            'role' => 'eventadmin_volunteer',
        ));
        if (is_wp_error($user_id))
            return new WP_Error('jvgh_parent_user_creation_failed', 'Gebruiker kon niet worden aangemaakt: ' . $user_id->get_error_message(), array('status' => 500));
        $matched_user = get_userdata($user_id);
        $created = true;
    }
    // Persist the canonical format for both new and previously matched users.
    update_user_meta($matched_user->ID, 'billing_phone', $phone);
    return rest_ensure_response(array(
        'ok' => true,
        'userId' => (int) $matched_user->ID,
        'displayName' => (string) $matched_user->display_name,
        'normalizedPhone' => $phone,
        'teamId' => $team_id,
        'teamName' => get_the_title($team),
        'created' => $created,
    ));
}

function jvgh_rest_volunteers(WP_REST_Request $request) {
    $requested_role = (string) $request->get_param('role');
    $wordpress_role = $requested_role === 'bestuur' ? 'bestuur' : 'eventadmin_volunteer';
    $volunteers = array();

    foreach (get_users(array('role' => $wordpress_role)) as $user) {
        $volunteers[] = array(
            'id'    => (int) $user->ID,
            'name'  => $user->display_name,
            'email' => $user->user_email,
            'phone' => jvgh_get_user_phone($user->ID),
        );
    }

    return rest_ensure_response($volunteers);
}

/** Resolve the installed terms by name; never rely on a guessed slug. */
function jvgh_team_delegate_role_terms() {
    $delegate = get_term_by('name', 'Afgevaardigde', 'sp_role');
    $primary = get_term_by('name', 'Primaire Afgevaardigde', 'sp_role');
    $coordinator = get_term_by('slug', 'coordinator', 'sp_role');
    return array(
        'delegate' => $delegate && !is_wp_error($delegate) ? $delegate : null,
        'primary'  => $primary && !is_wp_error($primary) ? $primary : null,
        'coordinator' => $coordinator && !is_wp_error($coordinator) ? $coordinator : null,
    );
}

function jvgh_team_delegate_team_ids($staff_id) {
    $ids = array();
    foreach (get_post_meta($staff_id, 'sp_team', false) as $value) {
        foreach ((array) maybe_unserialize($value) as $id) {
            if ((int) $id > 0) $ids[(int) $id] = (int) $id;
        }
    }
    return array_values($ids);
}

function jvgh_team_delegate_user_phone($user_id) {
    return jvgh_get_user_phone($user_id);
}

function jvgh_team_delegate_home_teams() {
    $result = array();
    $posts = get_posts(array('post_type' => 'sp_team', 'post_status' => 'publish', 'posts_per_page' => -1,
        'orderby' => array('menu_order' => 'ASC', 'title' => 'ASC')));
    foreach ($posts as $post) {
        // Keep exactly the home-team rule used by the existing timeline.
        if (has_excerpt($post->ID)) $result[(int) $post->ID] = $post;
    }
    return $result;
}

function jvgh_team_delegate_has_role($staff_id, $term) {
    return $term && has_term((int) $term->term_id, 'sp_role', $staff_id);
}

function jvgh_team_delegate_dto($staff, $roles) {
    $user_id = (int) get_post_field('post_author', $staff->ID);
    $user = $user_id ? get_userdata($user_id) : false;
    return array(
        'staffId'      => (int) $staff->ID,
        'userId'       => $user_id,
        'authorId'     => $user_id,
        'name'         => get_the_title($staff),
        'userName'     => $user ? $user->display_name : '',
        'phone'        => $user ? jvgh_team_delegate_user_phone($user_id) : '',
        'isDelegate'   => jvgh_team_delegate_has_role($staff->ID, $roles['delegate']),
        'isCoordinator'=> jvgh_team_delegate_has_role($staff->ID, $roles['coordinator']),
        'isPrimary'    => false,
    );
}

function jvgh_rest_team_delegates() {
    $roles = jvgh_team_delegate_role_terms();
    $home_teams = jvgh_team_delegate_home_teams();

    $staff_posts = get_posts(array('post_type' => 'sp_staff', 'post_status' => 'publish', 'posts_per_page' => -1));
    $staff_by_team = array();
    $coordinator_staff = array();
    $legacy_primary_by_team = array();
    foreach ($staff_posts as $staff) {
        $is_delegate = jvgh_team_delegate_has_role($staff->ID, $roles['delegate']);
        $is_primary = jvgh_team_delegate_has_role($staff->ID, $roles['primary']);
        $is_coordinator = jvgh_team_delegate_has_role($staff->ID, $roles['coordinator']);

        // Coordinators are added to every team later, using their real staff ID.
        if ($is_coordinator) {
            $user_id = (int) get_post_field('post_author', $staff->ID);
            $key = $user_id > 0 ? 'user:' . $user_id : 'staff:' . (int) $staff->ID;
            $coordinator_staff[$key] = $staff;
        }

        if (!$is_delegate && !$is_primary) continue;
        foreach (jvgh_team_delegate_team_ids($staff->ID) as $team_id) {
            if (!isset($home_teams[$team_id])) continue;
            if ($is_delegate || $is_primary) $staff_by_team[$team_id][] = $staff;
            if ($is_primary) $legacy_primary_by_team[$team_id][] = (int) $staff->ID;
        }
    }

    $teams = array();
    foreach ($home_teams as $team_id => $team_post) {
        $has_meta = metadata_exists('post', $team_id, JVGH_PRIMARY_DELEGATE_META_KEY);
        $primary_id = $has_meta ? (int) get_post_meta($team_id, JVGH_PRIMARY_DELEGATE_META_KEY, true) : 0;
        $configuration_error = '';
        if (!$has_meta) {
            $legacy = array_values(array_unique($legacy_primary_by_team[$team_id] ?? array()));
            if (count($legacy) === 1) $primary_id = (int) $legacy[0];
            if (count($legacy) > 1) $configuration_error = 'Configuratiefout: meerdere primaire afgevaardigden gevonden.';
        }

        // Deduplicate on user ID first and staff ID otherwise.
        $delegates = array();
        foreach ($staff_by_team[$team_id] ?? array() as $staff) {
            $dto = jvgh_team_delegate_dto($staff, $roles);
            $key = $dto['userId'] > 0 ? 'user:' . $dto['userId'] : 'staff:' . $dto['staffId'];
            if (!isset($delegates[$key]) || (int) $dto['staffId'] === $primary_id) $delegates[$key] = $dto;
        }

        // Every SportsPress coordinator must be selectable for every team.
        foreach ($coordinator_staff as $key => $staff) {
            $dto = jvgh_team_delegate_dto($staff, $roles);
            $dto['isCoordinator'] = true;
            $dto['isDelegate'] = true;

            if (isset($delegates[$key])) {
                $delegates[$key]['isCoordinator'] = true;
                $delegates[$key]['isDelegate'] = true;
                continue;
            }

            $delegates[$key] = $dto;
        }
        foreach ($delegates as &$delegate) {
            $delegate['isPrimary'] = $primary_id > 0
                && (int) $delegate['staffId'] === $primary_id
                && jvgh_team_delegate_has_role($delegate['staffId'], $roles['primary']);
        }
        unset($delegate);
        $delegates = array_values($delegates);
        usort($delegates, function ($a, $b) { return strnatcasecmp($a['name'], $b['name']); });
        $teams[] = array('teamId' => $team_id, 'teamName' => get_the_title($team_post),
            'primaryDelegateStaffId' => $primary_id, 'primaryConfigurationError' => $configuration_error,
            'delegates' => $delegates);
    }

    return rest_ensure_response(array(
        'ok' => true,
        'codeVersion' => 'sports-press-coordinator-v1',
        'primaryRole' => array(
            'exists' => (bool) $roles['primary'],
            'slug' => $roles['primary'] ? $roles['primary']->slug : null,
        ),
        'coordinatorRole' => array(
            'exists' => (bool) $roles['coordinator'],
            'slug' => $roles['coordinator'] ? $roles['coordinator']->slug : null,
        ),
        'teams' => $teams,
    ));
}

/** Find an existing staff person for a user, preferring one already on this team. */
function jvgh_team_delegate_find_staff($user_id, $team_id) {
    $posts = get_posts(array('post_type' => 'sp_staff', 'post_status' => array('publish', 'draft', 'private'),
        'author' => $user_id, 'posts_per_page' => -1, 'orderby' => 'ID', 'order' => 'ASC'));
    foreach ($posts as $post) if (in_array($team_id, jvgh_team_delegate_team_ids($post->ID), true)) return $post;
    return $posts ? reset($posts) : null;
}

/** Whether a staff post is still primary for another home team. */
function jvgh_team_delegate_is_primary_elsewhere($staff_id, $excluded_team_id) {
    foreach (jvgh_team_delegate_home_teams() as $team_id => $unused) {
        if ($team_id === $excluded_team_id || !in_array($team_id, jvgh_team_delegate_team_ids($staff_id), true)) continue;
        if (metadata_exists('post', $team_id, JVGH_PRIMARY_DELEGATE_META_KEY)) {
            if ((int) get_post_meta($team_id, JVGH_PRIMARY_DELEGATE_META_KEY, true) === $staff_id) return true;
        } else {
            // Unsaved legacy teams still use the global taxonomy role.
            return true;
        }
    }
    return false;
}

function jvgh_rest_update_team_primary_delegate(WP_REST_Request $request) {
    $team_id = (int) $request->get_param('teamId');
    $team = get_post($team_id);
    if (!$team || $team->post_type !== 'sp_team' || !has_excerpt($team_id))
        return new WP_Error('jvgh_invalid_home_team', 'Ongeldige thuisploeg.', array('status' => 400));

    $roles = jvgh_team_delegate_role_terms();
    if (!$roles['delegate'] || !$roles['primary'])
        return new WP_Error('jvgh_missing_staff_role', 'De vereiste SportsPress-rollen bestaan niet.', array('status' => 500));

    $staff_id = (int) $request->get_param('staffId');
    $user_id = (int) $request->get_param('userId');
    $staff = null;
    if ($staff_id) {
        $staff = get_post($staff_id);
        $is_coordinator = $staff && $staff->post_type === 'sp_staff'
            && jvgh_team_delegate_has_role($staff_id, $roles['coordinator']);
        if (!$staff || $staff->post_type !== 'sp_staff' ||
            (!in_array($team_id, jvgh_team_delegate_team_ids($staff_id), true) && !$is_coordinator))
            return new WP_Error('jvgh_invalid_staff', 'Deze medewerker is niet aan de ploeg gekoppeld.', array('status' => 400));

        // A coordinator can be chosen for every team. Persist that team link
        // when the coordinator is actually selected as primary delegate.
        if ($is_coordinator && !in_array($team_id, jvgh_team_delegate_team_ids($staff_id), true))
            add_post_meta($staff_id, 'sp_team', $team_id);
    }

    if (!$staff) {
        $user = $user_id ? get_userdata($user_id) : false;
        if (!$user)
            return new WP_Error('jvgh_invalid_user', 'Selecteer een geldige gebruiker.', array('status' => 400));
        $staff = jvgh_team_delegate_find_staff($user_id, $team_id);
        if (!$staff || !jvgh_team_delegate_has_role($staff->ID, $roles['coordinator']))
            return new WP_Error('jvgh_invalid_coordinator', 'Selecteer een geldige SportsPress-coordinator.', array('status' => 400));
        $staff_id = (int) $staff->ID;
        if (!in_array($team_id, jvgh_team_delegate_team_ids($staff_id), true)) add_post_meta($staff_id, 'sp_team', $team_id);
    }

    $current_user_id = (int) get_post_field('post_author', $staff_id);
    if ($user_id && $current_user_id && $user_id !== $current_user_id)
        return new WP_Error('jvgh_staff_user_mismatch', 'Medewerker en gebruiker komen niet overeen.', array('status' => 400));
    $current_user = $current_user_id ? get_userdata($current_user_id) : false;
    if (!jvgh_team_delegate_has_role($staff_id, $roles['delegate']) &&
        !jvgh_team_delegate_has_role($staff_id, $roles['primary']) &&
        !jvgh_team_delegate_has_role($staff_id, $roles['coordinator']))
        return new WP_Error('jvgh_invalid_delegate_role', 'Deze medewerker is geen afgevaardigde.', array('status' => 400));

    $previous_id = (int) get_post_meta($team_id, JVGH_PRIMARY_DELEGATE_META_KEY, true);
    if (!$previous_id) {
        foreach (get_posts(array('post_type' => 'sp_staff', 'post_status' => 'publish', 'posts_per_page' => -1,
            'tax_query' => array(array('taxonomy' => 'sp_role', 'field' => 'term_id', 'terms' => array($roles['primary']->term_id))))) as $candidate)
            if (in_array($team_id, jvgh_team_delegate_team_ids($candidate->ID), true)) { $previous_id = (int) $candidate->ID; break; }
    }

    $saved = update_post_meta($team_id, JVGH_PRIMARY_DELEGATE_META_KEY, $staff_id);
    if ($saved === false && (int) get_post_meta($team_id, JVGH_PRIMARY_DELEGATE_META_KEY, true) !== $staff_id)
        return new WP_Error('jvgh_primary_not_saved', 'Kon primaire afgevaardigde niet opslaan.', array('status' => 500));
    // append=true preserves every existing SportsPress role.
    $role_result = wp_set_object_terms($staff_id, array((int) $roles['delegate']->term_id, (int) $roles['primary']->term_id), 'sp_role', true);
    if (is_wp_error($role_result)) return $role_result;
    if ($previous_id && $previous_id !== $staff_id && !jvgh_team_delegate_is_primary_elsewhere($previous_id, $team_id))
        wp_remove_object_terms($previous_id, (int) $roles['primary']->term_id, 'sp_role');

    return rest_ensure_response(array('ok' => true, 'teamId' => $team_id, 'staffId' => $staff_id, 'userId' => $current_user_id));
}
