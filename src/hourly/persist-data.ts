import { S3 } from '@firestone-hs/aws-lambda-utils';
import { ALL_CLASSES } from '@firestone-hs/reference-data';
import { gzipSync } from 'zlib';
import { DECK_STATS_BUCKET, DECK_STATS_KEY_PREFIX, HOURLY_DECK_STATS_GAMES_THRESHOLD } from '../common/config';
import { DeckStat, DeckStats, GameFormat, RankBracket } from '../model';

export const saveDeckStats = async (
	deckStats: readonly DeckStat[],
	// archetypeStats: readonly ArchetypeStat[],
	lastGameDate: Date,
	rankBracket: RankBracket,
	format: GameFormat,
	startDate: string,
): Promise<void> => {
	const s3 = new S3();
	await saveGlobalDeckStats(deckStats, lastGameDate, rankBracket, format, startDate, s3);
	// await saveGlobalArchetypeStats(archetypeStats, lastGameDate, rankBracket, format, startDate, s3);
};

const saveGlobalDeckStats = async (
	deckStats: readonly DeckStat[],
	// archetypeStats: readonly ArchetypeStat[],
	lastGameDate: Date,
	rankBracket: RankBracket,
	format: GameFormat,
	startDate: string,
	s3: S3,
): Promise<void> => {
	const filtered = deckStats.filter((d) => d.totalGames > HOURLY_DECK_STATS_GAMES_THRESHOLD);
	console.log(
		'for',
		format,
		rankBracket,
		'using',
		HOURLY_DECK_STATS_GAMES_THRESHOLD,
		'filtered',
		deckStats.length,
		'to',
		filtered.length,
	);
	const result: DeckStats = {
		lastUpdated: lastGameDate,
		rankBracket: rankBracket,
		timePeriod: null,
		format: format,
		dataPoints: filtered.map((d) => d.totalGames).reduce((a, b) => a + b, 0),
		deckStats: filtered,
		// archetypeStats: archetypeStats,
	} as DeckStats;
	const gzippedResult = gzipSync(JSON.stringify(result));
	const destination = `${DECK_STATS_KEY_PREFIX}/decks/${format}/${rankBracket}/hourly/${startDate}.gz.json`;
	// console.log('writing to ', destination);
	await s3.writeFile(gzippedResult, DECK_STATS_BUCKET, destination, 'application/json', 'gzip');

	for (const playerClass of ALL_CLASSES) {
		const classDecks = filtered.filter((deck) => deck.playerClass === playerClass);
		const result: DeckStats = {
			lastUpdated: lastGameDate,
			rankBracket: rankBracket,
			timePeriod: null,
			format: format,
			dataPoints: classDecks.map((d) => d.totalGames).reduce((a, b) => a + b, 0),
			deckStats: classDecks,
			// archetypeStats: archetypeStats,
		} as DeckStats;
		const gzippedResult = gzipSync(JSON.stringify(result));
		const destination = `${DECK_STATS_KEY_PREFIX}/decks/${format}/${rankBracket}/hourly/${startDate}-${playerClass}.gz.json`;
		// console.log('writing to ', destination);
		await s3.writeFile(gzippedResult, DECK_STATS_BUCKET, destination, 'application/json', 'gzip');
	}
};

// const saveGlobalArchetypeStats = async (
// 	archetypeStats: readonly ArchetypeStat[],
// 	lastGameDate: Date,
// 	rankBracket: RankBracket,
// 	format: GameFormat,
// 	startDate: string,
// 	s3: S3,
// ): Promise<void> => {
// 	const result: ArchetypeStats = {
// 		lastUpdated: lastGameDate,
// 		rankBracket: rankBracket,
// 		timePeriod: null,
// 		format: format,
// 		dataPoints: archetypeStats.map((d) => d.totalGames).reduce((a, b) => a + b, 0),
// 		archetypeStats: archetypeStats,
// 	};
// 	const gzippedMinResult = gzipSync(JSON.stringify(result));
// 	const destination = `${DECK_STATS_KEY_PREFIX}/archetypes/${format}/${rankBracket}/hourly/${startDate}.gz.json`;
// 	// console.log('writing to ', destination);
// 	await s3.writeFile(gzippedMinResult, DECK_STATS_BUCKET, destination, 'application/json', 'gzip');
// };
