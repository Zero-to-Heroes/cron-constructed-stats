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
	const debug = archetype.id == 758; // archetypeDecks.length > 1000 || true;
	// if (debug) {
	// 	console.time('buildArchetypeStatsForArchetype');
	// 	console.log('building stats for archetype', archetype.id, archetypeDecks.length);
	// }
	// debug && console.log('achetype', archetype.id, archetype.archetype);
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
	// let index = 0;
	for (const deck of decks) {
		// const debug2 = debug && index % 100 === 0;
		// debug2 && console.debug('looking at deck', deck, cardsMap);
		const cards = deck.cardsData;
		for (const card of cards) {
			const cardsInDeck = (card.inStartingDeck || 0) / deck.totalGames; // 1 or 2
			cardsMap[card.cardId] = (cardsMap[card.cardId] || 0) + cardsInDeck;
			// debug2 && console.debug('considering card', cardsMap[card.cardId], cardsInDeck, card.cardId, card);
		}
		// debug2 && console.debug('after looking at deck', index, cardsMap);
		// index++;
	}
	// debug && console.log('cardMap', numberOfDecks, index++, cardsMap, decks[0], decks[1]);

	const coreCards: string[] = [];
	// For each card, count the number of times it appears in each deck
	for (const cardId of Object.keys(cardsMap)) {
		const totalCardsInDecks = cardsMap[cardId];
		const averagePerDeck = totalCardsInDecks / numberOfDecks;
		// debug && console.log('averagePerDeck', cardId, averagePerDeck, totalCardsInDecks, numberOfDecks);
		if (averagePerDeck >= 2 * CORE_CARD_THRESHOLD) {
			coreCards.push(cardId);
			coreCards.push(cardId);
		} else if (averagePerDeck >= CORE_CARD_THRESHOLD) {
			coreCards.push(cardId);
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
