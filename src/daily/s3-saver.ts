import { gzipSync } from 'zlib';
import { DECK_STATS_BUCKET, DECK_STATS_KEY_PREFIX } from '../common/config';
import { allClasses } from '../common/utils';
import { DeckStat, DeckStats, GameFormat, RankBracket } from '../model';
import { s3 } from './_build-daily-aggregate';

export const persistData = async (
	dailyDeckStats: readonly DeckStat[],
	lastUpdate: Date,
	format: GameFormat,
	rankBracket: RankBracket,
	targetDateStr: string,
): Promise<void> => {
	if (!dailyDeckStats?.length) {
		console.error('empty deck stats', dailyDeckStats, rankBracket, format);
		return;
	}

	const targetDate = new Date(targetDateStr);
	targetDate.setHours(0);
	targetDate.setMinutes(0);
	targetDate.setSeconds(0);
	targetDate.setMilliseconds(0);
	// The date in the format YYYY-MM-ddTHH:mm:ss.sssZ
	const startDate = targetDate.toISOString();

	for (const playerClass of allClasses) {
		const classDecks = dailyDeckStats.filter((deck) => deck.playerClass === playerClass);
		const result: DeckStats = {
			lastUpdated: lastUpdate,
			rankBracket: rankBracket,
			timePeriod: null,
			format: format,
			dataPoints: classDecks.map((d) => d.totalGames).reduce((a, b) => a + b, 0),
			deckStats: classDecks,
		};
		console.log('zipping for class', playerClass, format, rankBracket, targetDateStr, classDecks.length);
		const gzippedMinResult = gzipSync(JSON.stringify(result));
		const destination = `${DECK_STATS_KEY_PREFIX}/decks/${format}/${rankBracket}/daily/${startDate}-${playerClass}.gz.json`;
		console.log('\twriting to', destination);
		await s3.writeFile(gzippedMinResult, DECK_STATS_BUCKET, destination, 'application/json', 'gzip');
	}

	// Is this used anywhere??
	// const result: DeckStats = {
	// 	lastUpdated: lastUpdate,
	// 	rankBracket: rankBracket,
	// 	timePeriod: null,
	// 	format: format,
	// 	dataPoints: dailyDeckStats.map((d) => d.totalGames).reduce((a, b) => a + b, 0),
	// 	deckStats: dailyDeckStats,
	// };
	// console.log('zipping', format, rankBracket, targetDateStr, dailyDeckStats.length);
	// const gzippedMinResult = gzipSync(JSON.stringify(result));
	// const destination = `${DECK_STATS_KEY_PREFIX}/decks/${format}/${rankBracket}/daily/${startDate}.gz.json`;
	// console.log('\twriting to', destination);
	// await s3.writeFile(gzippedMinResult, DECK_STATS_BUCKET, destination, 'application/json', 'gzip');
};
