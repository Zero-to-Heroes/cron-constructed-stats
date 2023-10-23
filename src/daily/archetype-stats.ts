import { groupByFunction } from '@firestone-hs/aws-lambda-utils';
import { CardClass } from '@firestone-hs/reference-data';
import { Archetype } from '../archetypes';
import { extractCardsForList } from '../hs-utils';
import {
	ArchetypeStat,
	ConstructedCardData,
	ConstructedMatchStatDbRow,
	ConstructedMatchupInfo,
	DeckStat,
	GameFormat,
} from '../model';
import { CORE_CARD_THRESHOLD, allCards } from './build-constructed-deck-stats';
import { buildCardsDataForArchetype } from './constructed-card-data';

// Build the list of all classes from the CardClass enum
export const allClasses: readonly string[] = Object.keys(CardClass)
	.map((key) => CardClass[key])
	.filter((value) => typeof value === 'string')
	.filter((value) => ![CardClass.INVALID, CardClass.NEUTRAL, CardClass.DREAM, CardClass.WHIZBANG].includes(value))
	.map((value) => value.toLowerCase());

export const buildArchetypes = (
	rows: readonly ConstructedMatchStatDbRow[],
	refArchetypes: readonly Archetype[],
	format: GameFormat,
): readonly ArchetypeStat[] => {
	// console.log('building archetypes from rows', rows.length, rows[0]);
	const groupedByArchetype = groupByFunction((row: ConstructedMatchStatDbRow) => row.playerArchetypeId)(rows);
	// console.log('number of archetypes', Object.keys(groupedByArchetype).length);
	const archetypeStats: readonly ArchetypeStat[] = Object.keys(groupedByArchetype).map((archetypeId) => {
		const archetypeRows: readonly ConstructedMatchStatDbRow[] = groupedByArchetype[archetypeId];
		const totalGames: number = archetypeRows.length;
		const totalWins: number = archetypeRows.filter((row) => row.result === 'won').length;
		// const winrate: number = totalWins / totalGames;
		const archetype = refArchetypes.find((arch) => arch.id === parseInt(archetypeId));
		const coreCards: readonly string[] = isOther(archetype.archetype) ? [] : buildCoreCards(archetypeRows);
		const result: ArchetypeStat = {
			id: +archetypeId,
			name: archetype.archetype,
			format: format,
			heroCardClass: archetypeRows[0]?.playerClass,
			totalGames: totalGames,
			totalWins: totalWins,
			coreCards: coreCards,
			winrate: null,
			cardsData: [],
			matchupInfo: [],
		};
		return result;
	});
	return archetypeStats;
};

export const enhanceArchetypeStats = (
	archetypeStats: readonly ArchetypeStat[],
	deckStats: readonly DeckStat[],
): readonly ArchetypeStat[] => {
	return archetypeStats.map((archetype) => {
		const deckStatsForArchetype: readonly DeckStat[] = deckStats.filter(
			(deckStat) => deckStat.archetypeId === archetype.id,
		);
		const cardsData: readonly ConstructedCardData[] = buildCardsDataForArchetype(deckStatsForArchetype);
		const matchupInfo: readonly ConstructedMatchupInfo[] = buildMatchupInfoForArchetype(deckStatsForArchetype);
		const result: ArchetypeStat = {
			...archetype,
			cardsData: cardsData.filter((d) => d.inStartingDeck > archetype.totalGames / 1000),
			matchupInfo: matchupInfo,
		};
		return result;
	});
};

const isOther = (archetypeName: string): boolean => {
	return allClasses.includes(archetypeName?.toLowerCase().replace('xl', '').replace('-', '').trim());
};

// Build the list of the cards that are present in all of the decks of the archetype
// When a card appears multiple times in each deck, it should appear multiple times
// in the archetype
const buildCoreCards = (rows: readonly ConstructedMatchStatDbRow[]): readonly string[] => {
	const cardsForDecks = rows
		.map((row) => extractCardsForList(row.playerDecklist, allCards))
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

const buildMatchupInfoForArchetype = (deckStats: readonly DeckStat[]): readonly ConstructedMatchupInfo[] => {
	return allClasses.map((opponentClass) => {
		const infoForClass = deckStats
			.map((d) => d.matchupInfo.find((info) => info.opponentClass === opponentClass))
			.filter((info) => info);
		const result: ConstructedMatchupInfo = {
			opponentClass: opponentClass,
			totalGames: infoForClass.map((info) => info.totalGames).reduce((a, b) => a + b, 0),
			wins: infoForClass.map((info) => info.wins).reduce((a, b) => a + b, 0),
			losses: infoForClass.map((info) => info.losses).reduce((a, b) => a + b, 0),
		};
		return result;
	});
};
