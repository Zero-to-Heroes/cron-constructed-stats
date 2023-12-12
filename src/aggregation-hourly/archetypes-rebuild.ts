import { groupByFunction } from '@firestone-hs/aws-lambda-utils';
import { AllCardsService } from '@firestone-hs/reference-data';
import { Archetype } from '../archetypes';
import { isOther } from '../daily/archetype-stats';
import { CORE_CARD_THRESHOLD } from '../daily/build-constructed-deck-stats';
import { extractCardsForList } from '../hs-utils';
import { ArchetypeStat, DeckStat, DeckStats } from '../model';
import { round } from '../utils';

export const buildArchetypeStats = (
	refArchetypes: readonly Archetype[],
	dailyDeckData: readonly DeckStats[],
	allCards: AllCardsService,
): readonly ArchetypeStat[] => {
	const allDeckStats = dailyDeckData.flatMap((data) => data.deckStats);
	const groupedByArchetype = groupByFunction((deckStat: DeckStat) => deckStat.archetypeId)(allDeckStats);
	const archetypeStats: readonly ArchetypeStat[] = Object.keys(groupedByArchetype).map((archetypeId) => {
		const archetypeDecks: readonly DeckStat[] = groupedByArchetype[archetypeId];
		const totalGames: number = archetypeDecks.flatMap((d) => d.totalGames).reduce((a, b) => a + b, 0);
		const totalWins: number = archetypeDecks.flatMap((d) => d.totalWins).reduce((a, b) => a + b, 0);
		const winrate: number = totalWins / totalGames;
		const archetype = refArchetypes.find((arch) => arch.id === parseInt(archetypeId));
		const coreCards: readonly string[] = isOther(archetype.archetype)
			? []
			: buildCoreCards(archetypeDecks, allCards);
		const result: ArchetypeStat = {
			id: +archetypeId,
			name: archetype.archetype,
			format: archetypeDecks[0]?.format,
			heroCardClass: archetypeDecks[0]?.playerClass,
			totalGames: totalGames,
			totalWins: totalWins,
			coreCards: coreCards,
			winrate: round(winrate),
			cardsData: [],
			matchupInfo: [],
		};
		return result;
	});
	return archetypeStats;
};

// Build the list of the cards that are present in all of the decks of the archetype
// When a card appears multiple times in each deck, it should appear multiple times
// in the archetype
const buildCoreCards = (deck: readonly DeckStat[], allCards: AllCardsService): readonly string[] => {
	const cardsForDecks = deck
		.map((row) => extractCardsForList(row.decklist, allCards))
		.filter((cards) => cards.length > 0);

	// First build the list of all unique cards
	const uniqueDbfIds = [...new Set(cardsForDecks.flatMap((cards) => [...cards]))];

	const coreCards: string[] = [];
	// For each card, count the number of times it appears in each deck
	for (const card of uniqueDbfIds) {
		const cardCounts = cardsForDecks.map((cards) => cards.filter((c) => c === card).length);
		const averagePerDeck = cardCounts.reduce((a, b) => a + b, 0) / cardCounts.length;
		if (averagePerDeck >= 2 * CORE_CARD_THRESHOLD) {
			coreCards.push(card);
			coreCards.push(card);
		} else if (averagePerDeck >= CORE_CARD_THRESHOLD) {
			coreCards.push(card);
		}
	}

	return coreCards;
};
