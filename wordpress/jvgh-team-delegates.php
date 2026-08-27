<?php
/**
 * REST support for volunteers and the parent availability popup.
 *
 * `sp_role` belongs to a staff post, not to a staff/team relation. A staff post
 * can serve several teams, so the selected staff ID is also stored on each team.
 * The SportsPress role remains synchronised and visible in WordPress.
 */

define('JVGH_PRIMARY_DELEGATE_META_KEY', '_jvgh_primary_delegate_staff_id');

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
});

/** Return the shared phone field used by all JVGH people endpoints. */
function jvgh_get_user_phone($user_id) {
    return (string) get_user_meta($user_id, 'billing_phone', true);
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
    return array(
        'delegate' => $delegate && !is_wp_error($delegate) ? $delegate : null,
        'primary'  => $primary && !is_wp_error($primary) ? $primary : null,
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

function jvgh_team_delegate_dto($staff, $coordinator_user_ids, $roles) {
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
        'isCoordinator'=> $user_id > 0 && isset($coordinator_user_ids[$user_id]),
        'isPrimary'    => false,
    );
}

function jvgh_rest_team_delegates() {
    $roles = jvgh_team_delegate_role_terms();
    $home_teams = jvgh_team_delegate_home_teams();
    $coordinators = get_users(array('role' => 'coordinator'));
    $coordinator_ids = array();
    foreach ($coordinators as $user) $coordinator_ids[(int) $user->ID] = true;

    $staff_posts = get_posts(array('post_type' => 'sp_staff', 'post_status' => 'publish', 'posts_per_page' => -1));
    $staff_by_team = array();
    $legacy_primary_by_team = array();
    foreach ($staff_posts as $staff) {
        $is_delegate = jvgh_team_delegate_has_role($staff->ID, $roles['delegate']);
        $is_primary = jvgh_team_delegate_has_role($staff->ID, $roles['primary']);
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
            $dto = jvgh_team_delegate_dto($staff, $coordinator_ids, $roles);
            $key = $dto['userId'] > 0 ? 'user:' . $dto['userId'] : 'staff:' . $dto['staffId'];
            if (!isset($delegates[$key]) || (int) $dto['staffId'] === $primary_id) $delegates[$key] = $dto;
        }
        foreach ($coordinators as $user) {
            $key = 'user:' . (int) $user->ID;
            if (isset($delegates[$key])) {
                $delegates[$key]['isCoordinator'] = true;
                continue;
            }
            $delegates[$key] = array('staffId' => null, 'userId' => (int) $user->ID, 'authorId' => (int) $user->ID,
                'name' => $user->display_name, 'userName' => $user->display_name,
                'phone' => jvgh_team_delegate_user_phone($user->ID), 'isDelegate' => false,
                'isCoordinator' => true, 'isPrimary' => false);
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

    return rest_ensure_response(array('ok' => true, 'primaryRole' => array(
        'exists' => (bool) $roles['primary'], 'slug' => $roles['primary'] ? $roles['primary']->slug : null), 'teams' => $teams));
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
        if (!$staff || $staff->post_type !== 'sp_staff' ||
            !in_array($team_id, jvgh_team_delegate_team_ids($staff_id), true))
            return new WP_Error('jvgh_invalid_staff', 'Deze medewerker is niet aan de ploeg gekoppeld.', array('status' => 400));
    }

    if (!$staff) {
        $user = $user_id ? get_userdata($user_id) : false;
        if (!$user || !in_array('coordinator', (array) $user->roles, true))
            return new WP_Error('jvgh_invalid_coordinator', 'Selecteer een geldige coordinator.', array('status' => 400));
        $staff = jvgh_team_delegate_find_staff($user_id, $team_id);
        if (!$staff) {
            $inserted = wp_insert_post(array('post_type' => 'sp_staff', 'post_status' => 'publish',
                'post_title' => $user->display_name, 'post_author' => $user->ID), true);
            if (is_wp_error($inserted)) return $inserted;
            $staff = get_post($inserted);
        }
        $staff_id = (int) $staff->ID;
        if (!in_array($team_id, jvgh_team_delegate_team_ids($staff_id), true)) add_post_meta($staff_id, 'sp_team', $team_id);
    }

    $current_user_id = (int) get_post_field('post_author', $staff_id);
    if ($user_id && $current_user_id && $user_id !== $current_user_id)
        return new WP_Error('jvgh_staff_user_mismatch', 'Medewerker en gebruiker komen niet overeen.', array('status' => 400));
    $current_user = $current_user_id ? get_userdata($current_user_id) : false;
    if (!jvgh_team_delegate_has_role($staff_id, $roles['delegate']) &&
        !jvgh_team_delegate_has_role($staff_id, $roles['primary']) &&
        !($current_user && in_array('coordinator', (array) $current_user->roles, true)))
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
