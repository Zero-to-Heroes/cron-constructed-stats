// This example demonstrates a NodeJS 8.10 async handler[1], however of course you could use
// the more traditional callback-style handler.

import { S3, getConnectionReadOnly, getLastConstructedPatch, sleep } from '@firestone-hs/aws-lambda-utils';
import { AllCardsService } from '@firestone-hs/reference-data';
import { Context } from 'aws-lambda';
import AWS from 'aws-sdk';
import { buildArchetypes, enhanceArchetypeStats } from './archetype-stats';
import { loadArchetypes } from './archetypes';
import { buildDeckStats } from './constructed-deck-stats';
import { isCorrectRank, isCorrectTime } from './constructed-match-stats';
import { ConstructedMatchStatDbRow, DeckStat, GameFormat, RankBracket, TimePeriod } from './model';
import { saveDeckStats } from './persist-data';
import { readRowsFromS3, saveRowsOnS3 } from './rows';
import { formatMemoryUsage } from './utils';

export const DECK_STATS_BUCKET = 'static.zerotoheroes.com';
export const DECK_STATS_KEY_PREFIX = `api/constructed/stats`;
export const WORKING_ROWS_FILE = `${DECK_STATS_KEY_PREFIX}/working-rows-%format%.json`;
export const GAMES_THRESHOLD = 50;
export const CORE_CARD_THRESHOLD = 0.9;

export const allCards = new AllCardsService();
export const s3 = new S3();
const lambda = new AWS.Lambda();

// [1]: https://aws.amazon.com/blogs/compute/node-js-8-10-runtime-now-available-in-aws-lambda/
export default async (event, context: Context): Promise<any> => {
	console.debug(
		'memory usage',
		'before cards init',
		formatMemoryUsage(process.memoryUsage().heapUsed),
		'/',
		formatMemoryUsage(process.memoryUsage().heapTotal),
	);
	await allCards.initializeCardsDb();
	console.debug(
		'memory usage',
		'after cards init',
		formatMemoryUsage(process.memoryUsage().heapUsed),
		'/',
		formatMemoryUsage(process.memoryUsage().heapTotal),
	);
	const mysql = await getConnectionReadOnly();

	if (!event.format) {
		await dispatchFormatEvents(context);
		return;
	}

	if (!event.timePeriod || !event.rankBracket) {
		await dispatchEvents(context, event.format);
		return;
	}

	const format: GameFormat = event.format;
	const timePeriod = event.timePeriod;
	const rankBracket = event.rankBracket;

	console.log('reading rows from s3', format, timePeriod, rankBracket);
	const allRows: readonly ConstructedMatchStatDbRow[] = await readRowsFromS3(format);
	console.debug(
		'memory usage',
		'after reading rows',
		formatMemoryUsage(process.memoryUsage().heapUsed),
		'/',
		formatMemoryUsage(process.memoryUsage().heapTotal),
	);
	const rows = allRows.filter((r) => r.format === format);
	console.log('\t', 'loaded rows', rows.length);
	console.debug(
		'memory usage',
		'after filtered rows',
		formatMemoryUsage(process.memoryUsage().heapUsed),
		'/',
		formatMemoryUsage(process.memoryUsage().heapTotal),
	);
	const archetypes = await loadArchetypes(mysql);
	console.log('\t', 'loaded archetypes', archetypes.length);
	console.debug(
		'memory usage',
		'after loaded archetypes',
		formatMemoryUsage(process.memoryUsage().heapUsed),
		'/',
		formatMemoryUsage(process.memoryUsage().heapTotal),
	);
	const patchInfo = await getLastConstructedPatch();

	const rowsForTime = rows.filter((r) => isCorrectTime(r, timePeriod, patchInfo));
	console.debug(
		'memory usage',
		'after time filter',
		formatMemoryUsage(process.memoryUsage().heapUsed),
		'/',
		formatMemoryUsage(process.memoryUsage().heapTotal),
	);
	const relevantRows = rowsForTime.filter((r) => isCorrectRank(r, rankBracket));
	console.log('\t', 'relevantRows', relevantRows.length, rankBracket);
	console.debug(
		'memory usage',
		'after rank filter',
		formatMemoryUsage(process.memoryUsage().heapUsed),
		'/',
		formatMemoryUsage(process.memoryUsage().heapTotal),
	);
	const archetypeStats = buildArchetypes(relevantRows, archetypes, format);
	console.log('\t', 'built archetype stats', archetypeStats.length);
	console.debug(
		'memory usage',
		'after archetype stats',
		formatMemoryUsage(process.memoryUsage().heapUsed),
		'/',
		formatMemoryUsage(process.memoryUsage().heapTotal),
	);
	const deckStats: readonly DeckStat[] = buildDeckStats(
		relevantRows,
		rankBracket,
		timePeriod,
		format,
		archetypeStats,
	);
	console.debug(
		'memory usage',
		'after deck stats',
		formatMemoryUsage(process.memoryUsage().heapUsed),
		'/',
		formatMemoryUsage(process.memoryUsage().heapTotal),
	);
	const enhancedArchetypes = enhanceArchetypeStats(archetypeStats, deckStats);
	console.log('\t', 'built deck stats', deckStats.length);
	console.debug(
		'memory usage',
		'after archetypes enhanced',
		formatMemoryUsage(process.memoryUsage().heapUsed),
		'/',
		formatMemoryUsage(process.memoryUsage().heapTotal),
	);
	await saveDeckStats(mysql, deckStats, enhancedArchetypes, rankBracket, timePeriod, format);
	console.debug(
		'memory usage',
		'after save decks',
		formatMemoryUsage(process.memoryUsage().heapUsed),
		'/',
		formatMemoryUsage(process.memoryUsage().heapTotal),
	);

	return { statusCode: 200, body: null };
};

const dispatchFormatEvents = async (context: Context) => {
	const allFormats: readonly GameFormat[] = ['standard', 'wild', 'twist'];
	// const allFormats: readonly GameFormat[] = ['standard'];
	for (const format of allFormats) {
		console.log('dispatching events for format', format);
		const newEvent = {
			format: format,
		};
		const params = {
			FunctionName: context.functionName,
			InvocationType: 'Event',
			LogType: 'Tail',
			Payload: JSON.stringify(newEvent),
		};
		console.log('\tinvoking lambda', params);
		const result = await lambda
			.invoke({
				FunctionName: context.functionName,
				InvocationType: 'Event',
				LogType: 'Tail',
				Payload: JSON.stringify(newEvent),
			})
			.promise();
		console.log('\tinvocation result', result);
		await sleep(50);
	}
};

const dispatchEvents = async (context: Context, format: GameFormat) => {
	console.log('saving rows for format', format);
	await saveRowsOnS3(format);

	console.log('dispatching events');
	const allTimePeriod: readonly TimePeriod[] = ['last-patch', 'past-30', 'past-7', 'past-3', 'current-season'];
	const allRankBracket: readonly RankBracket[] = [
		'top-2000-legend',
		'legend',
		'legend-diamond',
		'diamond',
		'platinum',
		'bronze-gold',
		'all',
	];
	// const allTimePeriod: readonly TimePeriod[] = ['past-30'];
	// const allRankBracket: readonly RankBracket[] = ['all'];
	for (const timePeriod of allTimePeriod) {
		for (const rankBracket of allRankBracket) {
			const newEvent = {
				timePeriod: timePeriod,
				rankBracket: rankBracket,
				format: format,
			};
			const params = {
				FunctionName: context.functionName,
				InvocationType: 'Event',
				LogType: 'Tail',
				Payload: JSON.stringify(newEvent),
			};
			console.log('\tinvoking lambda', params);
			const result = await lambda
				.invoke({
					FunctionName: context.functionName,
					InvocationType: 'Event',
					LogType: 'Tail',
					Payload: JSON.stringify(newEvent),
				})
				.promise();
			console.log('\tinvocation result', result);
			await sleep(50);
		}
	}
};
