import { DECK_STATS_BUCKET } from '../common/config';
import { mergeDeckStatsData } from '../common/decks';
import { buildFileKeys, buildFileNamesForGivenDay } from '../common/utils';
import { DeckStat, DeckStats, GameFormat, RankBracket } from '../model';
import { s3 } from './_build-daily-aggregate';

export const mergeAllHourlyStatsForTheDay = async (
	format: GameFormat,
	rankBracket: RankBracket,
	targetDate: string,
): Promise<readonly DeckStat[]> => {
	const fileNames = buildFileNamesForGivenDay(targetDate);
	console.log('fileNames', targetDate, fileNames);
	const fileKeys = buildFileKeys(format, rankBracket, 'hourly', fileNames);
	const hourlyRawData = await Promise.all(
		fileKeys.map((fileKey) => s3.readGzipContent(DECK_STATS_BUCKET, fileKey, 1, false, 300)),
	);
	const hourlyData: readonly DeckStats[] = hourlyRawData.map((data) => JSON.parse(data));

	const dailyDeckStats = hourlyData
		?.flatMap((d) => d?.deckStats ?? [])
		.filter((d) => !!d.decklist)
		.sort((a, b) => a.decklist.localeCompare(b.decklist));
	const result = mergeDeckStatsData(dailyDeckStats, null);
	console.debug('aggregated', dailyDeckStats.length, 'into', result.length, 'deck stats');
	console.debug('unique decklists', [...new Set(dailyDeckStats.map((stat) => stat.decklist))].length);
	console.debug('unique decklists in result', [...new Set(result.map((stat) => stat.decklist))].length);
	// const decksWithEnoughGames = result.filter((stat) => stat.totalGames >= 5);
	// console.debug('decksWithEnoughGames', decksWithEnoughGames.length);
	return result;
};
