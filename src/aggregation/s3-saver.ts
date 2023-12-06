import { getConnection, sleep } from '@firestone-hs/aws-lambda-utils';
import { gzipSync } from 'zlib';
import { DECK_STATS_BUCKET, DECK_STATS_KEY_PREFIX } from '../daily/build-constructed-deck-stats';
import { ArchetypeStat, ArchetypeStats, DeckStat, DeckStats, GameFormat, RankBracket, TimePeriod } from '../model';
import { chunk } from '../utils';
import { s3 } from './build-aggregated-stats';

export const persistData = async (
	archetypeStats: readonly ArchetypeStat[],
	deckStats: readonly DeckStat[],
	rankBracket: RankBracket,
	timePeriod: TimePeriod,
	format: GameFormat,
): Promise<void> => {
	await saveGlobalArchetypeStats(archetypeStats, rankBracket, timePeriod, format);
	console.log('saved global archetype stats', archetypeStats.length);
	await saveGlobalDeckStats(deckStats, rankBracket, timePeriod, format);
	console.log('saved global deck stats', deckStats.length);
	await saveDetailedArchetypeStats(archetypeStats, rankBracket, timePeriod, format);
	console.log('saved detailed archetype stats', archetypeStats.length);
	await saveDetailedDeckStats(deckStats, rankBracket, timePeriod, format);
	console.log('saved detailed deck stats', deckStats.length);
	console.log('finished saving data');
};

const saveGlobalArchetypeStats = async (
	archetypeStats: readonly ArchetypeStat[],
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
		lastUpdated: new Date(),
		rankBracket: rankBracket,
		timePeriod: timePeriod,
		format: format,
		dataPoints: minimalArchetypes.map((d) => d.totalGames).reduce((a, b) => a + b, 0),
		archetypeStats: minimalArchetypes,
	};
	const gzippedMinResult = gzipSync(JSON.stringify(result));
	await s3.writeFile(
		gzippedMinResult,
		DECK_STATS_BUCKET,
		`${DECK_STATS_KEY_PREFIX}/archetypes/${format}/${rankBracket}/${timePeriod}/overview.gz.json`,
		'application/json',
		'gzip',
	);
};

const saveGlobalDeckStats = async (
	deckStats: readonly DeckStat[],
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
		lastUpdated: new Date(),
		rankBracket: rankBracket,
		timePeriod: timePeriod,
		format: format,
		dataPoints: minimalDecks.map((d) => d.totalGames).reduce((a, b) => a + b, 0),
		deckStats: minimalDecks,
	};
	const gzippedMinResult = gzipSync(JSON.stringify(result));
	await s3.writeFile(
		gzippedMinResult,
		DECK_STATS_BUCKET,
		`${DECK_STATS_KEY_PREFIX}/decks/${format}/${rankBracket}/${timePeriod}/overview.gz.json`,
		'application/json',
		'gzip',
	);
};

const saveDetailedDeckStats = async (
	deckStats: readonly DeckStat[],
	rankBracket: RankBracket,
	timePeriod: TimePeriod,
	format: GameFormat,
): Promise<void> => {
	const workingCopy = deckStats.filter((d) => d.totalGames >= 50).sort((a, b) => b.totalGames - a.totalGames);
	console.debug('saving detailed deck stats', workingCopy.length);
	const chunks = chunk(workingCopy, 100);

	const mysql = await getConnection();
	const date = new Date();
	// Try to insert based on format, rankBracket, timePeriod and if it exists, update
	// the existing row
	for (const chunk of chunks) {
		const values = chunk.map((deck) => {
			const deckId = deck.decklist.replaceAll('/', '-');
			return [date, format, rankBracket, timePeriod, deckId, JSON.stringify(deck)];
		});
		await saveDecksChunk(mysql, values);
		// break;
	}
	mysql.end();
};

const defaultRetries = 5;
const saveDecksChunk = async (mysql, values: any[][], retries = defaultRetries) => {
	while (retries > 0) {
		try {
			const query = `
                INSERT INTO constructed_deck_stats
                (lastUpdateDate, format, rankBracket, timePeriod, deckId, deckData)
                VALUES ?
                ON DUPLICATE KEY UPDATE
                deckData = VALUES(deckData),
                lastUpdateDate = VALUES(lastUpdateDate)
            `;
			const result = await mysql.query(query, [values]);
			if (retries != defaultRetries) {
				console.log('retry successful', retries);
			}
			return;
		} catch (error) {
			if (error.code === 'ER_LOCK_DEADLOCK' && retries > 0) {
				console.log('Deadlock detected, retrying operation...', retries);
				await sleep(1000);
				retries--;
			} else {
				throw error;
			}
		}
	}
	throw new Error('Max retries exceeded');
};

const saveDetailedArchetypeStats = async (
	archetypeStats: readonly ArchetypeStat[],
	rankBracket: RankBracket,
	timePeriod: TimePeriod,
	format: GameFormat,
): Promise<void> => {
	const workingCopy = archetypeStats.filter((d) => d.totalGames >= 50);
	const result: readonly boolean[] = await Promise.all(
		workingCopy.map((archetype) => {
			const gzippedResult = gzipSync(JSON.stringify(archetype));
			return s3.writeFile(
				gzippedResult,
				DECK_STATS_BUCKET,
				`${DECK_STATS_KEY_PREFIX}/archetypes/${format}/${rankBracket}/${timePeriod}/archetype/${archetype.id}.gz.json`,
				'application/json',
				'gzip',
			);
		}),
	);
	console.log('uploaded successfully', result.filter((r) => r).length, '/', workingCopy.length, 'archetypes');
};

type Mutable<T> = {
	-readonly [P in keyof T]: T[P];
};
