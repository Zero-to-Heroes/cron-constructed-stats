import {
	S3,
	getConnectionProxy,
	getLastConstructedPatch,
	getLastTwistPatch,
	logBeforeTimeout,
	sleep,
} from '@firestone-hs/aws-lambda-utils';
import { ALL_CLASSES, AllCardsService, formatFormatReverse } from '@firestone-hs/reference-data';
import { Context } from 'aws-lambda';
import AWS from 'aws-sdk';
import { loadArchetypes } from '../archetypes';
import { ALL_FORMATS } from '../common/config';
import { ArchetypeStat, DeckStat, GameFormat, RankBracket, TimePeriod } from '../model';
import { buildArchetypeStats } from './archetypes-rebuild';
import { buildDeckStatsWithoutArchetypeInfo, enhanceDeckStats } from './deck-stats-rebuild';
import { perf } from './performance-analyzer';
import { persistData } from './s3-saver';

const allCards = new AllCardsService();
export const s3 = new S3();
const lambda = new AWS.Lambda();

export default async (event, context: Context): Promise<any> => {
	const cleanup = logBeforeTimeout(context);
	perf.startTimer('total-execution');

	await allCards.initializeCardsDb();

	if (!event.format) {
		await dispatchFormatEvents(context);
		cleanup();
		return;
	}

	if (!event.timePeriod || !event.rankBracket) {
		await dispatchEvents(context, event.format);
		cleanup();
		return;
	}

	const format: GameFormat = event.format;
	const timePeriod: TimePeriod = event.timePeriod;
	const rankBracket: RankBracket = event.rankBracket;
	const playerClass: string = event.playerClass;

	console.log('🔍 Analyzing performance for:', format, timePeriod, rankBracket, playerClass);

	const patchInfo = format === 'twist' ? await getLastTwistPatch() : await getLastConstructedPatch();

	if (!patchInfo) {
		console.error('Could not retrieve patch info', format);
		throw new Error('Could not retrieve patch info');
	}

	const deckStatsWithoutArchetypeInfo: readonly DeckStat[] = await buildDeckStatsWithoutArchetypeInfo(
		format,
		rankBracket,
		timePeriod,
		playerClass,
		patchInfo,
		allCards,
	);

	console.log(`📊 Loaded ${deckStatsWithoutArchetypeInfo?.length || 0} deck stats`);

	if (!deckStatsWithoutArchetypeInfo?.length) {
		perf.endTimer('total-execution');
		perf.logSummary();
		cleanup();
		return;
	}

	// Time archetype loading
	perf.startTimer('archetype-db-query');
	const mysql = await getConnectionProxy();
	const archetypes = await loadArchetypes(mysql);
	mysql.end();
	perf.endTimer('archetype-db-query');

	console.log(`🏗️  Loaded ${archetypes?.length || 0} archetypes`);

	const archetypeStats: readonly ArchetypeStat[] = buildArchetypeStats(
		archetypes,
		deckStatsWithoutArchetypeInfo,
		formatFormatReverse(format),
		allCards,
	);

	console.log(`🎯 Built ${archetypeStats?.length || 0} archetype stats`);

	// Time deck enhancement
	perf.startTimer('deck-enhancement');
	const deckStats: readonly DeckStat[] = enhanceDeckStats(deckStatsWithoutArchetypeInfo, archetypeStats, allCards);
	perf.endTimer('deck-enhancement');

	console.log(`✨ Enhanced ${deckStats?.length || 0} deck stats`);

	// Time data persistence
	perf.startTimer('data-persistence');
	const lastUpdate = getLastUpdate(deckStats);
	await persistData(archetypeStats, deckStats, lastUpdate, rankBracket, timePeriod, format, playerClass);
	perf.endTimer('data-persistence');

	perf.endTimer('total-execution');
	perf.logSummary();

	// Log memory usage
	const memUsage = process.memoryUsage();
	console.log('💾 Memory Usage:');
	console.log(`  RSS: ${Math.round(memUsage.rss / 1024 / 1024)}MB`);
	console.log(`  Heap Used: ${Math.round(memUsage.heapUsed / 1024 / 1024)}MB`);
	console.log(`  Heap Total: ${Math.round(memUsage.heapTotal / 1024 / 1024)}MB`);
	console.log(`  External: ${Math.round(memUsage.external / 1024 / 1024)}MB`);

	cleanup();
	return {
		statusCode: 200,
		performance: perf.getResults(),
		memoryUsage: memUsage,
		dataProcessed: {
			deckStats: deckStats.length,
			archetypeStats: archetypeStats.length,
		},
	};
};

const getLastUpdate = (deckStats: readonly DeckStat[]): Date => {
	if (!deckStats?.length) return new Date();

	return (
		deckStats
			.map((d) => new Date(d.lastUpdate))
			.filter((date) => !isNaN(date.getTime()))
			.sort((a, b) => b.getTime() - a.getTime())[0] || new Date()
	);
};

const dispatchFormatEvents = async (context: Context) => {
	const allFormats: readonly GameFormat[] = ALL_FORMATS;

	for (const format of allFormats) {
		console.log('dispatching events for format', format);
		const newEvent = {
			dailyProcessing: true,
			format: format,
		};
		const params = {
			FunctionName: context.functionName,
			InvocationType: 'Event',
			LogType: 'Tail',
			Payload: JSON.stringify(newEvent),
		};
		await lambda.invoke(params).promise();
		await sleep(50);
	}
};

const dispatchEvents = async (context: Context, format: GameFormat) => {
	const allTimePeriod: readonly TimePeriod[] = ['last-patch', 'past-20', 'past-7', 'past-3', 'current-season'];
	const allRankBracket: readonly RankBracket[] = [
		'competitive',
		'top-2000-legend',
		'legend',
		'legend-diamond',
		'diamond',
		'platinum',
		'bronze-gold',
		'all',
	];

	for (const timePeriod of allTimePeriod) {
		for (const rankBracket of allRankBracket) {
			for (const playerClass of ALL_CLASSES) {
				console.log('dispatching events for', timePeriod, rankBracket, playerClass);
				const newEvent = {
					dailyProcessing: true,
					timePeriod: timePeriod,
					rankBracket: rankBracket,
					format: format,
					playerClass: playerClass,
				};
				const params = {
					FunctionName: context.functionName,
					InvocationType: 'Event',
					LogType: 'Tail',
					Payload: JSON.stringify(newEvent),
				};
				await lambda.invoke(params).promise();
				// await sleep(50);
			}
		}
	}
};
