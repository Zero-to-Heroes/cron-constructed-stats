import { AllCardsService } from '@firestone-hs/reference-data';
import { mergeCardsData } from '../common/cards';
import { DECK_STATS_BUCKET } from '../common/config';
import { mergeMatchupInfo } from '../common/matchup';
import { buildCardVariations } from '../hourly/constructed-deck-stats';
import { ArchetypeStat, DeckStat, GameFormat, RankBracket, TimePeriod } from '../model';
import { s3 } from './build-aggregated-stats';
import { getFileKeysToLoad } from './file-keys';

export const buildDeckStatsWithoutArchetypeInfo = async (
	format: GameFormat,
	rankBracket: RankBracket,
	timePeriod: TimePeriod,
	patchInfo: any,
	allCards: AllCardsService,
): Promise<readonly DeckStat[]> => {
	const start = Date.now();
	const fileKeys = getFileKeysToLoad(format, rankBracket, timePeriod, patchInfo);
	const rawData = await Promise.all(
		fileKeys.map((fileKey) => s3.readGzipContent(DECK_STATS_BUCKET, fileKey, 1, false, 300)),
	);
	console.debug('loaded raw data', Date.now() - start, fileKeys.length);
	const data = rawData.map((data) => JSON.parse(data));
	console.debug('loaded data', Date.now() - start, fileKeys.length);

	const tempResult: { [decklist: string]: DeckStat } = {};
	mergeDeckStatsData(
		tempResult,
		data?.flatMap((d) => d?.deckStats ?? []),
	);
	return Object.values(tempResult);
};

const mergeDeckStatsData = (currentData: { [decklist: string]: DeckStat }, newData: readonly DeckStat[]) => {
	if (!newData?.length) {
		return currentData;
	}

	for (const newStat of newData) {
		const existingStat = currentData[newStat.decklist];
		if (!existingStat) {
			currentData[newStat.decklist] = newStat;
		} else {
			currentData[newStat.decklist] = mergeDeckStats(existingStat, newStat);
		}
	}

	// const mergedData = [...currentData];
	// for (const newStat of newData) {
	// 	const existingStat = mergedData.find((stat) => stat.decklist === newStat.decklist);
	// 	if (!existingStat) {
	// 		mergedData.push(newStat);
	// 	} else {
	// 		mergedData.splice(mergedData.indexOf(existingStat), 1, mergeDeckStats(existingStat, newStat));
	// 	}
	// }
	// return mergedData;
};

const mergeDeckStats = (currentStat: DeckStat, newStat: DeckStat): DeckStat => {
	const cardsData = mergeCardsData(currentStat.cardsData.concat(newStat.cardsData));
	const matchupInfo = mergeMatchupInfo(currentStat.matchupInfo.concat(newStat.matchupInfo));
	const result: DeckStat = {
		...currentStat,
		totalGames: currentStat.totalGames + newStat.totalGames,
		totalWins: currentStat.totalWins + newStat.totalWins,
		winrate:
			Math.round(
				((currentStat.totalWins + newStat.totalWins) / (currentStat.totalGames + newStat.totalGames)) * 100,
			) / 100,
		cardsData: cardsData,
		matchupInfo: matchupInfo,
	};
	return result;
};

// export const buildDecksStats = (
// 	dailyData: readonly DeckStats[],
// 	// archetypeData: readonly ArchetypeStat[],
// 	// allCards: AllCardsService,
// ): readonly DeckStat[] => {
// 	const deckStats = buildDeckStats(
// 		dailyData.flatMap((d) => d.deckStats),
// 		// archetypeData,
// 		// allCards,
// 	);
// 	return deckStats;
// };

// const buildDeckStats = (
// 	deckStats: readonly DeckStat[],
// 	// archetypeData: readonly ArchetypeStat[],
// 	// allCards: AllCardsService,
// ): readonly DeckStat[] => {
// 	const groupedByDecklist = groupByFunction((a: DeckStat) => a.decklist)(deckStats);
// 	return Object.values(groupedByDecklist).map((group) =>
// 		mergeDeckStatsForDecklist(
// 			group,
// 			// archetypeData.find((a) => a.id === group[0].archetypeId),
// 			// allCards,
// 		),
// 	);
// };

const mergeDeckStatsForDecklist = (
	deckStats: readonly DeckStat[],
	// archetypeData: ArchetypeStat,
	// allCards: AllCardsService,
): DeckStat => {
	const totalGames = deckStats.map((d) => d.totalGames).reduce((a, b) => a + b, 0);
	const totalWins = deckStats.map((d) => d.totalWins).reduce((a, b) => a + b, 0);
	const cardsData = mergeCardsData(deckStats.flatMap((d) => d.cardsData));
	const result: DeckStat = {
		lastUpdate: deckStats
			.map((d) => new Date(d.lastUpdate))
			.filter((date) => !isNaN(date.getTime()))
			.sort((a, b) => b.getTime() - a.getTime())[0],
		decklist: deckStats[0].decklist,
		archetypeId: deckStats[0].archetypeId,
		archetypeName: deckStats[0].archetypeName,
		playerClass: deckStats[0].playerClass,
		format: deckStats[0].format,
		rankBracket: deckStats[0].rankBracket,
		timePeriod: deckStats[0].timePeriod,
		totalGames: totalGames,
		totalWins: totalWins,
		winrate: totalGames > 0 ? Math.round((totalWins / totalGames) * 100) / 100 : 0,
		cardsData: cardsData,
		cardVariations: null,
		archetypeCoreCards: null,
		// cardVariations: buildCardVariations(deckStats[0].decklist, archetypeData.coreCards, allCards),
		// archetypeCoreCards: archetypeData.coreCards,
		matchupInfo: mergeMatchupInfo(deckStats.flatMap((d) => d.matchupInfo)),
	};
	return result;
};

export const enhanceDeckStats = (
	deckStats: readonly DeckStat[],
	archetypeData: readonly ArchetypeStat[],
	allCards: AllCardsService,
): readonly DeckStat[] => {
	return deckStats.map((deck) => {
		const archetype = archetypeData.find((a) => a.id === deck.archetypeId);
		return {
			...deck,
			cardVariations: buildCardVariations(deck.decklist, archetype.coreCards, allCards),
			archetypeCoreCards: archetype.coreCards,
		};
	});
};
