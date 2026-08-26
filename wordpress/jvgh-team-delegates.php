<?php
/**
 * REST support for the parent availability popup.
 *
 * SportsPress stores staff positions globally on the `sp_staff` post through
 * `sp_role`, while a staff post can contain more than one `sp_team` value.
 * Primary delegates are therefore stored per team in post meta.
 */

define('JVGH_PRIMARY_DELEGATE_META_KEY', '_jvgh_primary_delegate_staff_id');

add_action('rest_api_init', function () {
    register_rest_route('jvgh/v1', '/team-delegates', array(
        'methods'             => WP_REST_Server::READABLE,
        'callback'            => 'jvgh_rest_team_delegates',
        'permission_callback' => function () {
            return current_user_can('edit_posts');
        },
    ));

    register_rest_route('jvgh/v1', '/team-primary-delegate', array(
        'methods'             => WP_REST_Server::CREATABLE,
        'callback'            => 'jvgh_rest_update_team_primary_delegate',
        'permission_callback' => function () {
            return current_user_can('edit_posts');
        },
        'args'                => array(
            'teamId'  => array('required' => true, 'type' => 'integer', 'minimum' => 1),
            'staffId' => array('required' => true, 'type' => 'integer', 'minimum' => 1),
        ),
    ));
});

/** Resolve roles by their real taxonomy terms rather than assuming a slug. */
function jvgh_team_delegate_role_terms() {
    $delegate = get_term_by('name', 'Afgevaardigde', 'sp_role');
    $primary = get_term_by('name', 'Primaire Afgevaardigde', 'sp_role');

    return array(
        'delegate' => $delegate && !is_wp_error($delegate) ? $delegate : null,
        'primary'  => $primary && !is_wp_error($primary) ? $primary : null,
    );
}

/** Return all unique team IDs attached to a SportsPress staff post. */
function jvgh_team_delegate_team_ids($staff_id) {
    $team_ids = array();
    foreach (get_post_meta($staff_id, 'sp_team', false) as $value) {
        foreach ((array) maybe_unserialize($value) as $team_id) {
            $team_id = (int) $team_id;
            if ($team_id > 0) {
                $team_ids[$team_id] = $team_id;
            }
        }
    }
    return array_values($team_ids);
}

/** Use the same phone source as the volunteers response. */
function jvgh_team_delegate_user_phone($user_id) {
    if (function_exists('jvgh_get_user_phone')) {
        return (string) jvgh_get_user_phone($user_id);
    }
    return (string) get_user_meta($user_id, 'billing_phone', true);
}

function jvgh_rest_team_delegates() {
    $role_terms = jvgh_team_delegate_role_terms();
    $role_term_ids = array_values(array_filter(array(
        $role_terms['delegate'] ? (int) $role_terms['delegate']->term_id : 0,
        $role_terms['primary'] ? (int) $role_terms['primary']->term_id : 0,
    )));

    $team_posts = get_posts(array(
        'post_type'      => 'sp_team',
        'post_status'    => 'publish',
        'posts_per_page' => -1,
        'orderby'        => array('menu_order' => 'ASC', 'title' => 'ASC'),
    ));

    $teams = array();
    foreach ($team_posts as $team_post) {
        $team_id = (int) $team_post->ID;
        // Exact dezelfde thuisploegselectie als [sp_teams_timeline].
        if (!has_excerpt($team_id)) {
            continue;
        }
        $teams[$team_id] = array(
            'teamId'                  => $team_id,
            'teamName'                => get_the_title($team_post),
            'primaryDelegateStaffId'  => (int) get_post_meta($team_id, JVGH_PRIMARY_DELEGATE_META_KEY, true),
            'primaryConfigurationError' => '',
            'delegates'               => array(),
        );
    }

    $staff_posts = $role_term_ids ? get_posts(array(
        'post_type'      => 'sp_staff',
        'post_status'    => 'publish',
        'posts_per_page' => -1,
        'tax_query'      => array(array(
            'taxonomy' => 'sp_role',
            'field'    => 'term_id',
            'terms'    => $role_term_ids,
        )),
    )) : array();

    $legacy_primary_by_team = array();
    foreach ($staff_posts as $staff_post) {
        try {
            $staff_role_ids = wp_get_post_terms($staff_post->ID, 'sp_role', array('fields' => 'ids'));
            if (is_wp_error($staff_role_ids)) {
                throw new RuntimeException($staff_role_ids->get_error_message());
            }
            $is_legacy_primary = $role_terms['primary']
                && in_array((int) $role_terms['primary']->term_id, array_map('intval', $staff_role_ids), true);
            $author_id = (int) get_post_field('post_author', $staff_post->ID);
            $user = $author_id > 0 ? get_userdata($author_id) : false;
            $delegate = array(
                'staffId'  => (int) $staff_post->ID,
                'name'     => get_the_title($staff_post),
                'authorId' => $author_id,
                'userId'   => $author_id,
                'userName' => $user ? $user->display_name : '',
                'phone'    => $user ? jvgh_team_delegate_user_phone($author_id) : '',
                'isPrimary' => false,
            );

            foreach (jvgh_team_delegate_team_ids($staff_post->ID) as $team_id) {
                if (!isset($teams[$team_id])) {
                    continue;
                }
                $teams[$team_id]['delegates'][$staff_post->ID] = $delegate;
                if ($is_legacy_primary) {
                    $legacy_primary_by_team[$team_id][] = (int) $staff_post->ID;
                }
            }
        } catch (Throwable $error) {
            error_log(sprintf('[JVGH][PARENT AVAILABILITY] staffId=%d: %s', (int) $staff_post->ID, $error->getMessage()));
        }
    }

    foreach ($teams as &$team) {
        $primary_id = (int) $team['primaryDelegateStaffId'];
        // Backwards-compatible read of the existing taxonomy role until this
        // team is first saved. Team meta is authoritative as soon as it exists.
        if (!$primary_id) {
            $legacy_ids = array_values(array_unique($legacy_primary_by_team[$team['teamId']] ?? array()));
            if (count($legacy_ids) === 1) {
                $primary_id = (int) $legacy_ids[0];
                $team['primaryDelegateStaffId'] = $primary_id;
            } elseif (count($legacy_ids) > 1) {
                $team['primaryConfigurationError'] = 'Configuratiefout: meerdere primaire afgevaardigden gevonden.';
                error_log(sprintf('[JVGH][PARENT AVAILABILITY] teamId=%d has multiple primary role assignments.', $team['teamId']));
            }
        }
        foreach ($team['delegates'] as &$delegate) {
            $delegate['isPrimary'] = $primary_id > 0 && (int) $delegate['staffId'] === $primary_id;
        }
        unset($delegate);
        $team['delegates'] = array_values($team['delegates']);
        usort($team['delegates'], function ($left, $right) {
            return strnatcasecmp($left['name'], $right['name']);
        });
    }
    unset($team);

    return rest_ensure_response(array(
        'ok' => true,
        'primaryRole' => array(
            'exists' => (bool) $role_terms['primary'],
            'slug'   => $role_terms['primary'] ? $role_terms['primary']->slug : null,
        ),
        'teams' => array_values($teams),
    ));
}

function jvgh_rest_update_team_primary_delegate(WP_REST_Request $request) {
    $team_id = (int) $request->get_param('teamId');
    $staff_id = (int) $request->get_param('staffId');
    $team = get_post($team_id);
    if (!$team || $team->post_type !== 'sp_team' || !has_excerpt($team_id)) {
        return new WP_Error('jvgh_invalid_home_team', 'Ongeldige thuisploeg.', array('status' => 400));
    }
    $staff = get_post($staff_id);
    if (!$staff || $staff->post_type !== 'sp_staff') {
        return new WP_Error('jvgh_invalid_staff', 'Ongeldige afgevaardigde.', array('status' => 400));
    }
    if (!in_array($team_id, jvgh_team_delegate_team_ids($staff_id), true)) {
        return new WP_Error('jvgh_staff_not_on_team', 'De afgevaardigde is niet aan deze ploeg gekoppeld.', array('status' => 400));
    }

    $role_terms = jvgh_team_delegate_role_terms();
    $allowed_role_ids = array_values(array_filter(array(
        $role_terms['delegate'] ? (int) $role_terms['delegate']->term_id : 0,
        $role_terms['primary'] ? (int) $role_terms['primary']->term_id : 0,
    )));
    $staff_role_ids = wp_get_post_terms($staff_id, 'sp_role', array('fields' => 'ids'));
    if (is_wp_error($staff_role_ids) || !array_intersect($allowed_role_ids, array_map('intval', (array) $staff_role_ids))) {
        return new WP_Error('jvgh_invalid_delegate_role', 'Deze medewerker is geen afgevaardigde.', array('status' => 400));
    }

    if (update_post_meta($team_id, JVGH_PRIMARY_DELEGATE_META_KEY, $staff_id) === false
        && (int) get_post_meta($team_id, JVGH_PRIMARY_DELEGATE_META_KEY, true) !== $staff_id) {
        return new WP_Error('jvgh_primary_not_saved', 'Kon primaire afgevaardigde niet opslaan.', array('status' => 500));
    }

    return rest_ensure_response(array('ok' => true, 'teamId' => $team_id, 'staffId' => $staff_id));
}
