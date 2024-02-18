import { AllCardsService } from '@firestone-hs/reference-data';
import { extractCardsForList } from '../hs-utils';

export const buildCardVariations = (
	decklist: string,
	coreCards: readonly string[],
	allCards: AllCardsService,
): {
	added: readonly string[];
	removed: readonly string[];
} => {
	const result: {
		added: string[];
		removed: string[];
	} = {
		added: [],
		removed: [],
	};
	const deckCards = extractCardsForList(decklist, allCards);
	if (!deckCards?.length) {
		throw new Error('Invalid decklist: ' + decklist);
	}

	const archetypeCards = [...coreCards];
	for (const card of deckCards) {
		if (!archetypeCards.includes(card)) {
			result.added.push(card);
		} else {
			archetypeCards.splice(archetypeCards.indexOf(card), 1);
		}
	}

	result.removed = archetypeCards;

	return result;
};
