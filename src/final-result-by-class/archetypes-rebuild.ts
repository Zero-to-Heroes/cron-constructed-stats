/* eslint-disable no-extra-boolean-cast */
import { groupByFunction } from '@firestone-hs/aws-lambda-utils';
import { AllCardsService, GameFormat } from '@firestone-hs/reference-data';
import { Archetype } from '../archetypes';
import { mergeCardsData, mergeDiscoverData } from '../common/cards';
import { mergeCoinPlayInfo } from '../common/coin-play';
import { CORE_CARD_THRESHOLD } from '../common/config';
import { allClasses } from '../common/utils';
import {
	ArchetypeStat,
	ConstructedCardData,
	ConstructedCoinPlayInfo,
	ConstructedDiscoverCardData,
	ConstructedMatchupInfo,
	DeckStat,
} from '../model';
import { round } from '../utils';
import { perf } from './performance-analyzer';

export const buildArchetypeStats = (
	refArchetypes: readonly Archetype[],
	dailyDeckData: readonly DeckStat[],
	format: GameFormat,
	allCards: AllCardsService,
	debug = false,
): readonly ArchetypeStat[] => {
	perf.startTimer('archetype-stats-building');
	const groupedByArchetype = groupByFunction((deckStat: DeckStat) => deckStat.archetypeId)(dailyDeckData);
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
	perf.endTimer('archetype-stats-building');
	return archetypeStats;
};

const buildArchetypeStat = (
	archetype: Archetype,
	archetypeDecks: readonly DeckStat[],
	format: GameFormat,
	allCards: AllCardsService,
	debug = false,
): ArchetypeStat => {
	const totalGames: number = archetypeDecks.flatMap((d) => d.totalGames).reduce((a, b) => a + b, 0);
	const totalWins: number = archetypeDecks.flatMap((d) => d.totalWins).reduce((a, b) => a + b, 0);
	const winrate: number = totalWins / totalGames;
	const coreCards: readonly string[] = isOther(archetype.archetype) ? [] : buildCoreCards(archetypeDecks, debug);
	const cardsData: readonly ConstructedCardData[] = buildCardsDataForArchetype(archetypeDecks, debug);
	const discoverData: readonly ConstructedDiscoverCardData[] = buildDiscoverDataForArchetype(archetypeDecks);
	const matchupInfo: readonly ConstructedMatchupInfo[] = buildMatchupInfoForArchetype(
		archetypeDecks,
		format,
		allCards,
	);
	const coinPlayInfo: readonly ConstructedCoinPlayInfo[] = buildCoinPlayInfoForArchetype(
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
		discoverData: discoverData,
		matchupInfo: matchupInfo,
		coinPlayInfo: coinPlayInfo,
	};
	return result;
};

// Build the list of the cards that are present in all of the decks of the archetype
// When a card appears multiple times in each deck, it should appear multiple times
// in the archetype
const buildCoreCards = (decks: readonly DeckStat[], debug = false): readonly string[] => {
	const numberOfDecks = decks.length;
	const cardsMap: { [cardId: string]: number } = {};
	for (const deck of decks) {
		const cards = deck.cardsData;
		for (const card of cards) {
			const cardsInDeck = (card.inStartingDeck || 0) / deck.totalGames; // 1 or 2
			cardsMap[card.cardId] = (cardsMap[card.cardId] || 0) + cardsInDeck;
		}
	}
	const coreCards: string[] = [];
	// For each card, count the number of times it appears in each deck
	for (const cardId of Object.keys(cardsMap)) {
		const totalCardsInDecks = cardsMap[cardId];
		const averagePerDeck = totalCardsInDecks / numberOfDecks;
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
			discoverData: mergeDiscoverData(
				infoForClass.flatMap((info) => info.discoverData),
				format,
				allCards,
			),
			coinPlayInfo: mergeCoinPlayInfo(
				infoForClass.flatMap((info) => info.coinPlayInfo),
				format,
				allCards,
			),
		};
		return result;
	});
};

const buildCoinPlayInfoForArchetype = (
	deckStats: readonly DeckStat[],
	format: GameFormat,
	allCards: AllCardsService,
): readonly ConstructedCoinPlayInfo[] => {
	return ['coin', 'play'].map((coinPlay: 'coin' | 'play') => {
		const infoForCoinPlay = deckStats
			.map((d) => d.coinPlayInfo.find((info) => info.coinPlay === coinPlay))
			.filter((info) => info);
		const totalGames = infoForCoinPlay.map((info) => info.totalGames).reduce((a, b) => a + b, 0);
		const wins = infoForCoinPlay.map((info) => info.wins).reduce((a, b) => a + b, 0);
		const result: ConstructedCoinPlayInfo = {
			coinPlay: coinPlay,
			totalGames: totalGames,
			wins: wins,
			losses: infoForCoinPlay.map((info) => info.losses).reduce((a, b) => a + b, 0),
			winrate: !!totalGames ? wins / totalGames : null,
			cardsData: mergeCardsData(
				infoForCoinPlay.flatMap((info) => info.cardsData),
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
		for (const cardData of cardsData) {
			const isFirstDataCopy = !previousCardId || previousCardId !== cardData.cardId;
			const existingDataContainer = cardsDataMap[cardData.cardId] ?? [];
			cardsDataMap[cardData.cardId] = existingDataContainer;
			let existingData: ConstructedCardData = existingDataContainer[isFirstDataCopy ? 0 : 1];
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
	return result;
};

const buildDiscoverDataForArchetype = (deckStats: readonly DeckStat[]): readonly ConstructedDiscoverCardData[] => {
	const discoverDataMap: { [cardId: string]: ConstructedDiscoverCardData } = {};
	for (const deck of deckStats) {
		for (const discoverData of deck.discoverData) {
			const existingData = discoverDataMap[discoverData.cardId];
			if (!existingData) {
				discoverDataMap[discoverData.cardId] = {
					cardId: discoverData.cardId,
					discovered: 0,
					discoveredThenWin: 0,
				};
			}
			discoverDataMap[discoverData.cardId].discovered += discoverData.discovered;
			discoverDataMap[discoverData.cardId].discoveredThenWin += discoverData.discoveredThenWin;
		}
	}
	const result = Object.values(discoverDataMap);
	return result;
};

const isOther = (archetypeName: string): boolean => {
	return allClasses.includes(archetypeName?.toLowerCase().replace('xl', '').replace('-', '').trim());
};
