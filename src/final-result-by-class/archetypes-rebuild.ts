/* eslint-disable no-extra-boolean-cast */
import { groupByFunction } from '@firestone-hs/aws-lambda-utils';
import { AllCardsService, GameFormat } from '@firestone-hs/reference-data';
import { Archetype } from '../archetypes';
import { mergeCardsData } from '../common/cards';
import { CORE_CARD_THRESHOLD } from '../common/config';
import { allClasses } from '../common/utils';
import { ArchetypeStat, ConstructedCardData, ConstructedMatchupInfo, DeckStat } from '../model';
import { round } from '../utils';

export const buildArchetypeStats = (
	refArchetypes: readonly Archetype[],
	dailyDeckData: readonly DeckStat[],
	format: GameFormat,
	allCards: AllCardsService,
	debug = false,
): readonly ArchetypeStat[] => {
	// console.time('groupBy');
	const groupedByArchetype = groupByFunction((deckStat: DeckStat) => deckStat.archetypeId)(dailyDeckData);
	// console.timeEnd('groupBy');
	// console.debug('building', Object.keys(groupedByArchetype).length, 'archetypes');
	const archetypeStats: readonly ArchetypeStat[] = Object.keys(groupedByArchetype)
		.map((archetypeId) =>
			buildArchetypeStat(
				refArchetypes.find((arch) => arch.id === parseInt(archetypeId)),
				groupedByArchetype[archetypeId],
				format,
				allCards,
				debug,
			),
		)
		.filter((a) => a.totalGames > 0);
	return archetypeStats;
};

const buildArchetypeStat = (
	archetype: Archetype,
	archetypeDecks: readonly DeckStat[],
	format: GameFormat,
	allCards: AllCardsService,
	debug = false,
): ArchetypeStat => {
	debug = debug && archetype.id === 1691; // sludge warlock
	// if (debug) {
	// 	// console.time('buildArchetypeStatsForArchetype');
	// 	console.log('building stats for archetype', archetype.id, archetypeDecks.length);
	// }
	// debug && console.log('achetype', archetype.id, archetype.archetype);
	const totalGames: number = archetypeDecks.flatMap((d) => d.totalGames).reduce((a, b) => a + b, 0);
	const totalWins: number = archetypeDecks.flatMap((d) => d.totalWins).reduce((a, b) => a + b, 0);
	const winrate: number = totalWins / totalGames;
	const coreCards: readonly string[] = isOther(archetype.archetype) ? [] : buildCoreCards(archetypeDecks, debug);
	// debug && console.debug('totalGames', totalGames);
	const cardsData: readonly ConstructedCardData[] = buildCardsDataForArchetype(archetypeDecks, debug);
	const matchupInfo: readonly ConstructedMatchupInfo[] = buildMatchupInfoForArchetype(
		archetypeDecks,
		format,
		allCards,
	);
	const result: ArchetypeStat = {
		id: archetype.id,
		name: archetype.archetype,
		format: archetypeDecks[0]?.format,
		heroCardClass: archetypeDecks[0]?.playerClass,
		heroCardIds: [...new Set(archetypeDecks.flatMap((d) => d.heroCardIds ?? []).filter((cardId) => !!cardId))],
		totalGames: totalGames,
		totalWins: totalWins,
		coreCards: coreCards,
		winrate: round(winrate),
		cardsData: cardsData.filter((d) => d.inStartingDeck > totalGames / 1000),
		matchupInfo: matchupInfo,
	};
	// if (debug) {
	// 	// console.timeEnd('buildArchetypeStatsForArchetype');
	// 	console.log('archetype data', result.totalGames, cardsData.find(d => d.cardId === "CFM_696"))
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

const buildMatchupInfoForArchetype = (
	deckStats: readonly DeckStat[],
	format: GameFormat,
	allCards: AllCardsService,
): readonly ConstructedMatchupInfo[] => {
	return allClasses.map((opponentClass) => {
		const infoForClass = deckStats
			.map((d) => d.matchupInfo.find((info) => info.opponentClass === opponentClass))
			.filter((info) => info);
		const totalGames = infoForClass.map((info) => info.totalGames).reduce((a, b) => a + b, 0);
		const wins = infoForClass.map((info) => info.wins).reduce((a, b) => a + b, 0);
		const result: ConstructedMatchupInfo = {
			opponentClass: opponentClass,
			totalGames: totalGames,
			wins: wins,
			losses: infoForClass.map((info) => info.losses).reduce((a, b) => a + b, 0),
			winrate: !!totalGames ? wins / totalGames : null,
			cardsData: mergeCardsData(
				infoForClass.flatMap((info) => info.cardsData),
				format,
				allCards,
			),
		};
		return result;
	});
};

const buildCardsDataForArchetype = (deckStats: readonly DeckStat[], debug = false): readonly ConstructedCardData[] => {
	const cardsDataMap: { [cardId: string]: ConstructedCardData[] } = {};
	for (const deck of deckStats) {
		let previousCardId = null;
		const cardsData = [...deck.cardsData].sort((a, b) => (a.cardId > b.cardId ? 1 : -1));
		// debug && console.debug('deck', deck.totalGames);
		for (const cardData of cardsData) {
			const isFirstDataCopy = !previousCardId || previousCardId !== cardData.cardId;
			const existingDataContainer = cardsDataMap[cardData.cardId] ?? [];
			cardsDataMap[cardData.cardId] = existingDataContainer;
			let existingData: ConstructedCardData = existingDataContainer[isFirstDataCopy ? 0 : 1];
			// debug &&
			// 	cardData.cardId === 'WW_043' &&
			// 	console.debug(
			// 		'isFirstDataCopy',
			// 		isFirstDataCopy,
			// 		cardData.cardId,
			// 		deck.totalGames,
			// 		cardData.inStartingDeck,
			// 		existingDataContainer,
			// 		cardData,
			// 	);
			if (!existingData) {
				existingData = {
					cardId: cardData.cardId,
					inStartingDeck: 0,
					wins: 0,
					drawnBeforeMulligan: 0,
					keptInMulligan: 0,
					inHandAfterMulligan: 0,
					inHandAfterMulliganThenWin: 0,
					drawn: 0,
					drawnThenWin: 0,
				};
				existingDataContainer.push(existingData);
			}
			existingData.inStartingDeck += cardData.inStartingDeck;
			existingData.wins += cardData.wins;
			existingData.drawnBeforeMulligan += cardData.drawnBeforeMulligan;
			existingData.keptInMulligan += cardData.keptInMulligan;
			existingData.inHandAfterMulligan += cardData.inHandAfterMulligan;
			existingData.inHandAfterMulliganThenWin += cardData.inHandAfterMulliganThenWin;
			existingData.drawn += cardData.drawn;
			existingData.drawnThenWin += cardData.drawnThenWin;

			previousCardId = cardData.cardId;
		}
	}
	const result = Object.values(cardsDataMap).flatMap((d) => d);
	// debug && console.log('total cards', result.length, Object.values(cardsDataMap).flatMap((d) => d).length);

	// const deckCardIds: readonly { [cardId: string]: readonly string[] }[] = deckStats.map((d) =>
	// 	groupByFunction((cardId: string) => cardId)(d.cardsData.map((c) => c.cardId)),
	// );
	// const uniqueCardIds = [...new Set(deckCardIds.flatMap((cards) => Object.keys(cards)))].sort();
	// debug && console.log('uniqueCardIds', uniqueCardIds.length);
	// debug && console.log('cardsDataMap uniqueCardIds', Object.keys(cardsDataMap).length);

	return result;

	// // The cards for each deck, with the number of copies in each
	// debug && console.time('cards data - group by card');
	// const deckCardIds: readonly { [cardId: string]: readonly string[] }[] = deckStats.map((d) =>
	// 	groupByFunction((cardId: string) => cardId)(d.cardsData.map((c) => c.cardId)),
	// );
	// debug && console.timeEnd('cards data - group by card');

	// debug && console.time('cards data - building cards list');
	// const uniqueCardIds = [...new Set(deckCardIds.flatMap((cards) => Object.keys(cards)))].sort();
	// const result: ConstructedCardData[] = [];
	// for (const cardId of uniqueCardIds) {
	// 	const maxCopies = Math.max(...deckCardIds.map((cards) => cards[cardId]?.length ?? 0));
	// 	for (let i = 0; i < maxCopies; i++) {
	// 		const archetypeCardData: ConstructedCardData = {
	// 			cardId: cardId,
	// 			inStartingDeck: 0,
	// 			wins: 0,
	// 			drawnBeforeMulligan: 0,
	// 			keptInMulligan: 0,
	// 			inHandAfterMulligan: 0,
	// 			inHandAfterMulliganThenWin: 0,
	// 			drawn: 0,
	// 			drawnThenWin: 0,
	// 		};
	// 		result.push(archetypeCardData);

	// 		const dataForDecks = deckStats.map((d) => d.cardsData.filter((c) => c.cardId === cardId));
	// 		for (const data of dataForDecks) {
	// 			const deckCardData = data[i];
	// 			if (!deckCardData) {
	// 				continue;
	// 			}

	// 			archetypeCardData.inStartingDeck += deckCardData.inStartingDeck;
	// 			archetypeCardData.wins += deckCardData.wins;
	// 			archetypeCardData.drawnBeforeMulligan += deckCardData.drawnBeforeMulligan;
	// 			archetypeCardData.keptInMulligan += deckCardData.keptInMulligan;
	// 			archetypeCardData.inHandAfterMulligan += deckCardData.inHandAfterMulligan;
	// 			archetypeCardData.inHandAfterMulliganThenWin += deckCardData.inHandAfterMulliganThenWin;
	// 			archetypeCardData.drawn += deckCardData.drawn;
	// 			archetypeCardData.drawnThenWin += deckCardData.drawnThenWin;
	// 		}
	// 	}
	// }
	// debug && console.log('total cards', result.length);
	// debug && console.timeEnd('cards data - building cards list');
	// return result;
};

const isOther = (archetypeName: string): boolean => {
	return allClasses.includes(archetypeName?.toLowerCase().replace('xl', '').replace('-', '').trim());
};
