/* eslint-disable no-async-promise-executor */
import { gzipSync } from 'zlib';
import { DECK_STATS_BUCKET, DECK_STATS_KEY_PREFIX } from '../common/config';
import { ArchetypeStat, ArchetypeStats, DeckStat, DeckStats, GameFormat, RankBracket, TimePeriod } from '../model';
import { Mutable } from '../utils';
import { s3 } from './_build-aggregated-stats';

export const persistData = async (
	archetypeStats: readonly ArchetypeStat[],
	deckStats: readonly DeckStat[],
	lastUpdate: Date,
	rankBracket: RankBracket,
	timePeriod: TimePeriod,
	format: GameFormat,
): Promise<void> => {
	// console.time('save-global-archetypes');
	await saveGlobalArchetypeStats(archetypeStats, lastUpdate, rankBracket, timePeriod, format);
	// console.timeEnd('save-global-archetypes');
	// console.log('saved global archetype stats', archetypeStats.length);

	// console.time('save-global-decks');
	await saveGlobalDeckStats(deckStats, lastUpdate, rankBracket, timePeriod, format);
	// console.log('saved global deck stats', deckStats.length);
	// console.timeEnd('save-global-decks');
	// console.log('finished saving data');
};

const saveGlobalArchetypeStats = async (
	archetypeStats: readonly ArchetypeStat[],
	lastUpdate: Date,
	rankBracket: RankBracket,
	timePeriod: TimePeriod,
	format: GameFormat,
): Promise<void> => {
	if (!archetypeStats?.length) {
		console.error('empty archetype stats', archetypeStats, rankBracket, timePeriod, format);
		return;
	}

	const minimalArchetypes: readonly ArchetypeStat[] = archetypeStats
		.map((d) => {
			const result: Mutable<ArchetypeStat> = { ...d };
			delete result.cardsData;
			delete result.matchupInfo;
			return result;
		})
		.filter((d) => d.totalGames >= 50);
	const result: ArchetypeStats = {
		lastUpdated: lastUpdate,
		rankBracket: rankBracket,
		timePeriod: timePeriod,
		format: format,
		dataPoints: archetypeStats.map((d) => d.totalGames).reduce((a, b) => a + b, 0),
		archetypeStats: minimalArchetypes,
	};
	const gzippedMinResult = gzipSync(JSON.stringify(result));
	await s3.writeFile(
		gzippedMinResult,
		DECK_STATS_BUCKET,
		`${DECK_STATS_KEY_PREFIX}/archetypes/${format}/${rankBracket}/${timePeriod}/overview-from-hourly.gz.json`,
		'application/json',
		'gzip',
	);
};

const saveGlobalDeckStats = async (
	deckStats: readonly DeckStat[],
	lastUpdate: Date,
	rankBracket: RankBracket,
	timePeriod: TimePeriod,
	format: GameFormat,
): Promise<void> => {
	if (!deckStats?.length) {
		console.error('empty deck stats', deckStats, rankBracket, timePeriod, format);
		return;
	}

	const minimalDecks: readonly DeckStat[] = deckStats
		.map((d) => {
			const result: Mutable<DeckStat> = { ...d };
			delete result.cardsData;
			delete result.matchupInfo;
			return result;
		})
		.filter((d) => d.totalGames >= 50);

	const result: DeckStats = {
		lastUpdated: lastUpdate,
		rankBracket: rankBracket,
		timePeriod: timePeriod,
		format: format,
		dataPoints: deckStats.map((d) => d.totalGames).reduce((a, b) => a + b, 0),
		deckStats: minimalDecks,
	};
	const gzippedMinResult = gzipSync(JSON.stringify(result));
	await s3.writeFile(
		gzippedMinResult,
		DECK_STATS_BUCKET,
		`${DECK_STATS_KEY_PREFIX}/decks/${format}/${rankBracket}/${timePeriod}/overview-from-hourly.gz.json`,
		'application/json',
		'gzip',
	);
};
