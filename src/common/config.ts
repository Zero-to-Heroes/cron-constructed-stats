import { GameFormat } from '../model';

export const HOURLY_DECK_STATS_GAMES_THRESHOLD = 3;
export const DAILY_DECK_STATS_GAMES_THRESHOLD = 30;
export const CORE_CARD_THRESHOLD = 0.9;
export const DECK_STATS_BUCKET = 'static.zerotoheroes.com';
export const DECK_STATS_KEY_PREFIX = `api/constructed/stats`;
export const WORKING_ROWS_FILE = `${DECK_STATS_KEY_PREFIX}/working/working-rows-%format%-%time%.json`;
// export const ALL_FORMATS: readonly GameFormat[] = ['standard', 'wild'];
export const ALL_FORMATS: readonly GameFormat[] = ['standard', 'wild', 'twist'];
