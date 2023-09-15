import { decode } from '@firestone-hs/deckstrings';
import { allCards } from './build-constructed-deck-stats';

export const round = (input: number, decimals = 2): number => {
	const multiplier = Math.pow(10, decimals);
	return Math.round(input * multiplier) / multiplier;
};

export const extractCardsForList = (decklist: string): readonly string[] => {
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
