import { AllCardsService } from '@firestone-hs/reference-data';
import { buildCardVariations } from '../hourly/constructed-deck-stats';
import { ArchetypeStat, DeckStat, GameFormat, RankBracket, TimePeriod } from '../model';
import { chunk } from '../utils';
import { mergeCardsData, mergeMatchupInfo } from './data-aggregattion-archetype';
import { getFileNamesToLoad, loadRawHourlyDeckStatFromS3 } from './s3-loader';

export const buildDeckStatsWithoutArchetypeInfo = async (
	format: GameFormat,
	rankBracket: RankBracket,
	timePeriod: TimePeriod,
	patchInfo: any,
	allCards: AllCardsService,
): Promise<readonly DeckStat[]> => {
	// Here, let's try to load files one by one, and merge them as they arrive, so we limit the total
	// memory footprint
	const fileNames = getFileNamesToLoad(timePeriod, patchInfo);
	const tempResult: { [decklist: string]: DeckStat } = {};
	const chunkSize = 30;
	const chunks = chunk(fileNames, chunkSize);

	for (const fileNames of chunks) {
		const start = Date.now();
		// const hourlyData = await Promise.all(
		// 	fileNames.map((fileName) => loadHourlyDeckStatFromS3(format, rankBracket, fileName)),
		// );
		const hourlyRawData = await Promise.all(
			fileNames.map((fileName) => loadRawHourlyDeckStatFromS3(format, rankBracket, fileName)),
		);
		console.debug('loaded hourly raw data', Date.now() - start, fileNames.length);
		const hourlyData = hourlyRawData.map((data) => JSON.parse(data));
		console.debug('loaded hourly data', Date.now() - start, fileNames.length);
		mergeDeckStatsData(
			tempResult,
			hourlyData?.flatMap((d) => d?.deckStats ?? []),
		);
	}
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
