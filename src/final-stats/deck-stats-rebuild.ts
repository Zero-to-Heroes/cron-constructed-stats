import { DeckStat, DeckStats } from '../model';

export const mergeDecks = (decks: readonly DeckStats[]): readonly DeckStat[] => {
	return decks.flatMap((d) => d.deckStats);
};
