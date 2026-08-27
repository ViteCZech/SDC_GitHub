/**
 * Navigační strom Domů / Zpět pro AppNavBar.
 * Zpět ve stepperu turnaje = předchozí krok; Domů = home (+ park session v App).
 */

/** Stavy, kde má smysl „parkovat“ turnaj při Domů. */
export const TOURNAMENT_PARKABLE_STATES = [
  'tournament_setup',
  'tournament_board_assignment',
  'tournament_groups',
  'tournament_bracket',
  'tournament_stats',
];

/**
 * @param {{
 *   appState: string,
 *   tournamentSetupStep?: number,
 *   homeSubmenu?: string|null,
 *   preregReturnToCatalog?: boolean,
 *   userRole?: string|null,
 *   hasTournamentData?: boolean,
 *   canGoToBoardAssignment?: boolean,
 * }} ctx
 * @returns {{ showBack: boolean, showHome: boolean, backTarget: object|null }}
 */
export function resolveAppNav(ctx) {
  const {
    appState,
    tournamentSetupStep = 1,
    homeSubmenu = null,
    preregReturnToCatalog = false,
    userRole = null,
    canGoToBoardAssignment = true,
  } = ctx;

  if (appState === 'home') {
    if (homeSubmenu) {
      return { showBack: true, showHome: false, backTarget: { type: 'clearHomeSubmenu' } };
    }
    return { showBack: false, showHome: false, backTarget: null };
  }

  // Herní plocha má vlastní Pause — AppNavBar se nepoužívá
  if (appState === 'playing' || appState === 'match_finished') {
    return { showBack: false, showHome: false, backTarget: null };
  }

  if (appState === 'setup') {
    return { showBack: true, showHome: true, backTarget: { type: 'state', state: 'home' } };
  }

  if (appState === 'history' || appState === 'profile' || appState === 'tutorial' || appState === 'about') {
    return { showBack: true, showHome: true, backTarget: { type: 'state', state: 'home' } };
  }

  if (appState === 'public_results_home') {
    return { showBack: true, showHome: true, backTarget: { type: 'state', state: 'home' } };
  }

  if (appState === 'public_top_performances') {
    return {
      showBack: true,
      showHome: true,
      backTarget: { type: 'state', state: 'public_results_home' },
    };
  }

  if (appState === 'public_results_detail') {
    return {
      showBack: true,
      showHome: true,
      backTarget: { type: 'state', state: 'public_results_home' },
    };
  }

  if (appState === 'tournament_hub') {
    return { showBack: true, showHome: true, backTarget: { type: 'state', state: 'home' } };
  }

  if (appState === 'tournament_history') {
    return {
      showBack: true,
      showHome: true,
      backTarget: { type: 'state', state: 'tournament_hub' },
    };
  }

  if (appState === 'tournament_viewer_preparing') {
    return {
      showBack: true,
      showHome: true,
      backTarget: { type: 'leaveViewer' },
    };
  }

  if (appState === 'tournament_tablet') {
    return {
      showBack: true,
      showHome: true,
      backTarget: { type: 'leaveTablet' },
    };
  }

  if (appState === 'tournament_setup') {
    if (tournamentSetupStep > 1) {
      return {
        showBack: true,
        showHome: true,
        backTarget: { type: 'setupStep', step: tournamentSetupStep - 1 },
      };
    }
    return {
      showBack: true,
      showHome: true,
      backTarget: { type: 'leaveTournamentSetup' },
    };
  }

  if (appState === 'tournament_board_assignment') {
    return {
      showBack: true,
      showHome: true,
      backTarget: { type: 'setupStepAndState', step: 3, state: 'tournament_setup' },
    };
  }

  if (appState === 'tournament_groups') {
    if (userRole === 'viewer') {
      return {
        showBack: true,
        showHome: true,
        backTarget: { type: 'leaveViewer' },
      };
    }
    if (!canGoToBoardAssignment) {
      return { showBack: false, showHome: true, backTarget: null };
    }
    return {
      showBack: true,
      showHome: true,
      backTarget: { type: 'state', state: 'tournament_board_assignment' },
    };
  }

  if (appState === 'tournament_bracket') {
    return {
      showBack: true,
      showHome: true,
      backTarget: { type: 'state', state: 'tournament_groups' },
    };
  }

  if (appState === 'tournament_stats') {
    return {
      showBack: true,
      showHome: true,
      backTarget: { type: 'state', state: 'tournament_bracket' },
    };
  }

  if (appState === 'prereg_list') {
    return {
      showBack: true,
      showHome: true,
      backTarget: { type: 'state', state: 'tournament_hub' },
    };
  }

  if (appState === 'prereg_setup') {
    return {
      showBack: true,
      showHome: true,
      backTarget: { type: 'state', state: 'prereg_list' },
    };
  }

  if (appState === 'prereg_admin') {
    return {
      showBack: true,
      showHome: true,
      backTarget: { type: 'state', state: 'prereg_list' },
    };
  }

  if (appState === 'prereg_catalog') {
    return {
      showBack: true,
      showHome: true,
      backTarget: { type: 'state', state: 'tournament_hub' },
    };
  }

  if (appState === 'prereg_public') {
    return {
      showBack: true,
      showHome: true,
      backTarget: preregReturnToCatalog
        ? { type: 'preregBackToCatalog' }
        : { type: 'state', state: 'home' },
    };
  }

  return { showBack: true, showHome: true, backTarget: { type: 'state', state: 'home' } };
}

/**
 * Má se při Domů parkovat turnajová relace?
 */
export function shouldParkTournamentSession(appState, userRole, hasTournamentData) {
  if (!hasTournamentData) return false;
  if (userRole !== 'admin' && userRole !== 'viewer') return false;
  return TOURNAMENT_PARKABLE_STATES.includes(appState);
}
