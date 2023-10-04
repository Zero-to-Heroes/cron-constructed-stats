import { decode } from '@firestone-hs/deckstrings';
import { allCards } from './build-constructed-deck-stats';

export const extractCardsForList = (decklist: string): readonly string[] => {
	// Legacy decklist truncated because of the database column size
	if (decklist?.length === 145) {
		return [];
	}
	try {
		const deck = decode(decklist);
		return deck.cards
			.flatMap((card) => new Array(card[1]).fill(card[0]))
			.map((dbfId) => allCards.getCard(dbfId).id);
	} catch (e) {
		console.warn('Could not extract cards for decklist', decklist);
		return [];
	}
};
