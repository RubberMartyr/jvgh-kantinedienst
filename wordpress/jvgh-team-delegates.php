<?php
/**
 * Add this to the existing JVGH REST snippet/plugin.
 * SportsPress stores staff positions in the `sp_role` taxonomy and the teams
 * attached to a staff post in its `sp_team` post meta.
 */

add_action('rest_api_init', function () {
    register_rest_route('jvgh/v1', '/team-delegates', array(
        'methods'             => WP_REST_Server::READABLE,
        'callback'            => 'jvgh_rest_team_delegates',
        'permission_callback' => function () {
            return current_user_can('edit_posts');
        },
    ));
});

/** Use the same phone source as the volunteers response. */
function jvgh_team_delegate_user_phone($user_id) {
    // The main JVGH snippet may already expose its user -> phone helper.
    if (function_exists('jvgh_get_user_phone')) {
        return (string) jvgh_get_user_phone($user_id);
    }

    return (string) get_user_meta($user_id, 'billing_phone', true);
}

function jvgh_rest_team_delegates() {
    $team_posts = get_posts(array(
        'post_type'      => 'sp_team',
        'post_status'    => 'publish',
        'posts_per_page' => -1,
        'orderby'        => array('menu_order' => 'ASC', 'title' => 'ASC'),
    ));

    $teams = array();
    foreach ($team_posts as $team_post) {
        $team_id = (int) $team_post->ID;

        // Zelfde selectie als [sp_teams_timeline]:
        // alleen JVGH/eigen ploegen met een Summary/excerpt.
        if (!has_excerpt($team_id)) {
            continue;
        }

        $teams[$team_id] = array(
            'teamId'    => $team_id,
            'teamName'  => get_the_title($team_post),
            'delegates' => array(),
        );
    }

    $staff_posts = get_posts(array(
        'post_type'      => 'sp_staff',
        'post_status'    => 'publish',
        'posts_per_page' => -1,
        'tax_query'      => array(array(
            'taxonomy' => 'sp_role',
            'field'    => 'slug',
            'terms'    => array('afgevaardigde'),
        )),
    ));

    foreach ($staff_posts as $staff_post) {
        try {
            $roles = wp_get_post_terms($staff_post->ID, 'sp_role', array('fields' => 'names'));
            if (is_wp_error($roles)) {
                throw new RuntimeException($roles->get_error_message());
            }
            $is_delegate = false;
            foreach ($roles as $role) {
                if (sanitize_title(trim($role)) === 'afgevaardigde') {
                    $is_delegate = true;
                    break;
                }
            }
            if (!$is_delegate) {
                continue;
            }

            $team_ids = array();
            foreach (get_post_meta($staff_post->ID, 'sp_team', false) as $value) {
                foreach ((array) maybe_unserialize($value) as $team_id) {
                    $team_id = (int) $team_id;
                    if ($team_id > 0) {
                        $team_ids[$team_id] = $team_id;
                    }
                }
            }

            $author_id = (int) get_post_field('post_author', $staff_post->ID);
            $user = $author_id > 0 ? get_userdata($author_id) : false;
            $delegate = array(
                'staffId'   => (int) $staff_post->ID,
                'name'      => get_the_title($staff_post),
                'role'      => 'afgevaardigde',
                'authorId'  => $author_id,
                'userId'    => $author_id,
                'userName'  => $user ? $user->display_name : '',
                'phone'     => $user ? jvgh_team_delegate_user_phone($author_id) : '',
            );

            foreach ($team_ids as $team_id) {
                if (isset($teams[$team_id])) {
                    $teams[$team_id]['delegates'][$staff_post->ID] = $delegate;
                }
            }
        } catch (Throwable $error) {
            error_log(sprintf(
                '[JVGH][PARENT AVAILABILITY] staffId=%d: %s',
                (int) $staff_post->ID,
                $error->getMessage()
            ));
        }
    }

    foreach ($teams as &$team) {
        $team['delegates'] = array_values($team['delegates']);
        usort($team['delegates'], function ($left, $right) {
            return strnatcasecmp($left['name'], $right['name']);
        });
    }
    unset($team);

    return rest_ensure_response(array('ok' => true, 'teams' => array_values($teams)));
}
