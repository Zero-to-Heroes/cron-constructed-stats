import { ConstructedCardData, ConstructedMatchupInfo, DeckStat, TimePeriod } from '../model';
import { Mutable, round } from '../utils';
import { mergeCardsData } from './cards';
import { mergeMatchupInfo } from './matchup';

export const mergeDeckStatsData = (sortedData: DeckStat[], timePeriod: TimePeriod): DeckStat[] => {
	if (!sortedData?.length) {
		return [];
	}

	const result = [];
	let currentDecklist: string = null;
	let currentStat: Mutable<DeckStat> = null;
	let cardsData: ConstructedCardData[] = [];
	let matchupInfo: ConstructedMatchupInfo[] = [];
	let stat: DeckStat = null;
	let decksProcessed = 0;
	while ((stat = sortedData.pop()) != null) {
		if (currentDecklist === null || stat.decklist !== currentDecklist) {
			if (currentStat !== null) {
				currentStat.cardsData = mergeCardsData(cardsData);
				currentStat.matchupInfo = mergeMatchupInfo(matchupInfo);
				currentStat.winrate =
					currentStat.totalGames === 0 ? null : round(currentStat.totalWins / currentStat.totalGames, 4);
				result.push(currentStat);
				// if (decksProcessed % 5000 === 0) {
				// 	console.log(
				// 		'memory after processing new deck',
				// 		decksProcessed,
				// 		formatMemoryUsage(process.memoryUsage()),
				// 	);
				// }
				cardsData = [];
				matchupInfo = [];
				decksProcessed++;
			}
			currentStat = {
				archetypeId: stat.archetypeId,
				decklist: stat.decklist,
				format: stat.format,
				lastUpdate: stat.lastUpdate == null ? null : new Date(stat.lastUpdate),
				playerClass: stat.playerClass,
				rankBracket: stat.rankBracket,
				timePeriod: timePeriod,
				totalGames: 0,
				totalWins: 0,
				winrate: null,
				cardsData: null,
				matchupInfo: null,
				archetypeCoreCards: null,
				cardVariations: null,
				archetypeName: null,
			};
		}
		currentDecklist = stat.decklist;
		currentStat.totalGames += stat.totalGames;
		currentStat.totalWins += stat.totalWins;
		// if (decksProcessed === 0) {
		// 	console.log(
		// 		'updating date',
		// 		currentStat.lastUpdate,
		// 		stat.lastUpdate,
		// 		new Date(currentStat.lastUpdate),
		// 		new Date(stat.lastUpdate),
		// 		Math.max(new Date(currentStat.lastUpdate).getTime(), new Date(stat.lastUpdate).getTime()),
		// 		currentStat,
		// 	);
		// }
		currentStat.lastUpdate =
			currentStat.lastUpdate === null
				? stat.lastUpdate
				: stat.lastUpdate === null
				? currentStat.lastUpdate
				: currentStat.lastUpdate > stat.lastUpdate
				? currentStat.lastUpdate
				: stat.lastUpdate;
		cardsData.push(...stat.cardsData.map((d) => ({ ...d } as ConstructedCardData)));
		matchupInfo.push(...stat.matchupInfo.map((m) => ({ ...m } as ConstructedMatchupInfo)));
	}

	currentStat.cardsData = mergeCardsData(cardsData);
	currentStat.matchupInfo = mergeMatchupInfo(matchupInfo);
	result.push(currentStat);
	return result;

	// for (const decklist of Object.keys(groupedByList)) {
	// 	const stats = groupedByList[decklist];
	// 	const mergedStat = mergeDeckStats(stats);
	// 	currentData[decklist] = mergedStat;
	// }

	// for (const newStat of newData) {
	// 	const existingStat = currentData[newStat.decklist];
	// 	if (!existingStat) {
	// 		currentData[newStat.decklist] = newStat;
	// 	} else {
	// 		currentData[newStat.decklist] = mergeDeckStats(existingStat, newStat);
	// 	}
	// }
};

// const mergeDeckStats = (stats: readonly DeckStat[]): DeckStat => {
// 	const cardsData = mergeCardsData(
// 		stats.flatMap((d) => d.cardsData).sort((a, b) => a.cardId.localeCompare(b.cardId)),
// 	);
// 	const matchupInfo = mergeMatchupInfo(
// 		stats.flatMap((d) => d.matchupInfo).sort((a, b) => a.opponentClass.localeCompare(b.opponentClass)),
// 	);
// 	const refStat = stats[0];
// 	const totalGames = stats.map((d) => d.totalGames).reduce((a, b) => a + b, 0);
// 	const totalWins = stats.map((d) => d.totalWins).reduce((a, b) => a + b, 0);
// 	const result: DeckStat = {
// 		...refStat,
// 		winrate: null,
// 		archetypeCoreCards: null,
// 		cardVariations: null,
// 		totalGames: totalGames,
// 		totalWins: totalWins,
// 		cardsData: cardsData,
// 		matchupInfo: matchupInfo,
// 	};
// 	return result;
// };

export const formatMemoryUsage = (memoryData) => ({
	rss: `${formatBytes(memoryData.rss)} -> Resident Set Size - total memory allocated for the process execution`,
	heapTotal: `${formatBytes(memoryData.heapTotal)} -> total size of the allocated heap`,
	heapUsed: `${formatBytes(memoryData.heapUsed)} -> actual memory used during the execution`,
	external: `${formatBytes(memoryData.external)} -> V8 external memory`,
});
const formatBytes = (data) => `${Math.round((data / 1024 / 1024) * 100) / 100} MB`;
