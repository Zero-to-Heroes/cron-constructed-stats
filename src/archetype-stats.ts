import { groupByFunction } from '@firestone-hs/aws-lambda-utils';
import { CardClass } from '@firestone-hs/reference-data';
import { Archetype } from './archetypes';
import { CORE_CARD_THRESHOLD } from './build-constructed-deck-stats';
import { extractCardsForList } from './hs-utils';
import { ArchetypeStat, ConstructedMatchStatDbRow } from './model';

// Build the list of all classes from the CardClass enum
const allClasses: readonly string[] = Object.keys(CardClass)
	.map((key) => CardClass[key])
	.filter((value) => typeof value === 'string')
	.map((value) => value.toLowerCase());

export const buildArchetypes = async (
	rows: readonly ConstructedMatchStatDbRow[],
	refArchetypes: readonly Archetype[],
): Promise<readonly ArchetypeStat[]> => {
	const groupedByArchetype = groupByFunction((row: ConstructedMatchStatDbRow) => row.playerArchetypeId)(rows);
	const archetypeStats: readonly ArchetypeStat[] = Object.keys(groupedByArchetype).map((archetypeId) => {
		const archetypeRows: readonly ConstructedMatchStatDbRow[] = groupedByArchetype[archetypeId];
		const totalGames: number = archetypeRows.length;
		const totalWins: number = archetypeRows.filter((row) => row.result === 'won').length;
		const winrate: number = totalWins / totalGames;
		const archetype = refArchetypes.find((arch) => arch.id === parseInt(archetypeId));
		const coreCards: readonly string[] = isOther(archetype.archetype) ? [] : buildCoreCards(archetypeRows);
		const result: ArchetypeStat = {
			id: +archetypeId,
			name: archetype.archetype,
			heroCardClass: archetypeRows[0]?.playerClass,
			totalGames: totalGames,
			coreCards: coreCards,
			winrate: winrate,
		};
		return result;
	});
	return archetypeStats;
};

const isOther = (archetypeName: string): boolean => {
	return allClasses.includes(archetypeName?.toLowerCase());
};

// Build the list of the cards that are present in all of the decks of the archetype
// When a card appears multiple times in each deck, it should appear multiple times
// in the archetype
const buildCoreCards = (rows: readonly ConstructedMatchStatDbRow[]): readonly string[] => {
	const cardsForDecks = rows
		.map((row) => extractCardsForList(row.playerDecklist))
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
