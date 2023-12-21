import { groupByFunction } from '@firestone-hs/aws-lambda-utils';
import { AllCardsService } from '@firestone-hs/reference-data';
import { Archetype } from '../archetypes';
import { CORE_CARD_THRESHOLD } from '../common/config';
import { allClasses } from '../common/utils';
import { isOther } from '../hourly/archetype-stats';
import { buildCardsDataForArchetype } from '../hourly/constructed-card-data';
import { ArchetypeStat, ConstructedCardData, ConstructedMatchupInfo, DeckStat } from '../model';
import { round } from '../utils';

export const buildArchetypeStats = (
	refArchetypes: readonly Archetype[],
	dailyDeckData: readonly DeckStat[],
	allCards: AllCardsService,
): readonly ArchetypeStat[] => {
	console.time('groupBy');
	const groupedByArchetype = groupByFunction((deckStat: DeckStat) => deckStat.archetypeId)(dailyDeckData);
	console.timeEnd('groupBy');
	console.debug('building', Object.keys(groupedByArchetype).length, 'archetypes');
	const archetypeStats: readonly ArchetypeStat[] = Object.keys(groupedByArchetype).map((archetypeId) =>
		buildArchetypeStat(
			refArchetypes.find((arch) => arch.id === parseInt(archetypeId)),
			groupedByArchetype[archetypeId],
			allCards,
		),
	);
	return archetypeStats;
};

const buildArchetypeStat = (archetype: Archetype, archetypeDecks: readonly DeckStat[], allCards): ArchetypeStat => {
	const debug = archetypeDecks.length > 10000;
	// if (debug) {
	// 	console.time('buildArchetypeStatsForArchetype');
	// 	console.log('building stats for archetype', archetype.id, archetypeDecks.length);
	// }
	const totalGames: number = archetypeDecks.flatMap((d) => d.totalGames).reduce((a, b) => a + b, 0);
	const totalWins: number = archetypeDecks.flatMap((d) => d.totalWins).reduce((a, b) => a + b, 0);
	const winrate: number = totalWins / totalGames;
	const coreCards: readonly string[] = isOther(archetype.archetype) ? [] : buildCoreCards(archetypeDecks, debug);
	const cardsData: readonly ConstructedCardData[] = buildCardsDataForArchetype(archetypeDecks, debug);
	const matchupInfo: readonly ConstructedMatchupInfo[] = buildMatchupInfoForArchetype(archetypeDecks);
	const result: ArchetypeStat = {
		id: archetype.id,
		name: archetype.archetype,
		format: archetypeDecks[0]?.format,
		heroCardClass: archetypeDecks[0]?.playerClass,
		totalGames: totalGames,
		totalWins: totalWins,
		coreCards: coreCards,
		winrate: round(winrate),
		cardsData: cardsData.filter((d) => d.inStartingDeck > totalGames / 1000),
		matchupInfo: matchupInfo,
	};
	// if (debug) {
	// 	console.timeEnd('buildArchetypeStatsForArchetype');
	// }
	return result;
};

// Build the list of the cards that are present in all of the decks of the archetype
// When a card appears multiple times in each deck, it should appear multiple times
// in the archetype
const buildCoreCards = (decks: readonly DeckStat[], debug = false): readonly string[] => {
	const numberOfDecks = decks.length;
	const cardsMap: { [cardId: string]: number } = {};
	for (const deck of decks) {
		const cards = deck.cardsData.map((card) => card.cardId);
		for (const card of cards) {
			cardsMap[card] = (cardsMap[card] || 0) + 1;
		}
	}
	// const uniqueIds = Object.values(cardsMap)

	// const cardsForDecks = decks
	// 	.map((deck) => deck.cardsData.map((card) => card.cardId))
	// 	.filter((cards) => cards.length > 0);

	// First build the list of all unique cards
	// const uniqueIds = [...new Set(cardsForDecks.flat())];

	const coreCards: string[] = [];
	// For each card, count the number of times it appears in each deck
	for (const card of Object.keys(cardsMap)) {
		const totalCardsInDecks = cardsMap[card];
		const averagePerDeck = totalCardsInDecks / numberOfDecks;
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
