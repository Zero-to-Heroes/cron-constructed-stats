import { S3, getConnectionReadOnly, getLastConstructedPatch, sleep } from '@firestone-hs/aws-lambda-utils';
import { AllCardsService } from '@firestone-hs/reference-data';
import { Context } from 'aws-lambda';
import AWS from 'aws-sdk';
import { loadArchetypes } from '../archetypes';
import { ArchetypeStat, DeckStat, GameFormat, RankBracket, TimePeriod } from '../model';
import { buildArchetypeStats } from './archetypes-rebuild';
import { buildDeckStatsWithoutArchetypeInfo, enhanceDeckStats } from './deck-stats-rebuild';
import { persistData } from './s3-saver';

const allCards = new AllCardsService();
export const s3 = new S3();
const lambda = new AWS.Lambda();

export default async (event, context: Context): Promise<any> => {
	await allCards.initializeCardsDb();

	if (!event.format) {
		await dispatchFormatEvents(context);
		return;
	}

	if (!event.timePeriod || !event.rankBracket) {
		await dispatchEvents(context, event.format);
		return;
	}

	const format: GameFormat = event.format;
	const timePeriod: TimePeriod = event.timePeriod;
	const rankBracket: RankBracket = event.rankBracket;

	console.log('aggregating data', format, timePeriod, rankBracket);
	const patchInfo = await getLastConstructedPatch();
	// console.log('memory before buildDeckStatsWithoutArchetypeInfo', formatMemoryUsage(process.memoryUsage()));
	const deckStatsWithoutArchetypeInfo: readonly DeckStat[] = await buildDeckStatsWithoutArchetypeInfo(
		format,
		rankBracket,
		timePeriod,
		patchInfo,
		allCards,
	);
	console.log(
		'deckStatsWithoutArchetypeInfo',
		deckStatsWithoutArchetypeInfo?.length,
		deckStatsWithoutArchetypeInfo?.map((a) => a.totalGames).reduce((a, b) => a + b, 0),
		deckStatsWithoutArchetypeInfo[0],
	);

	console.time('archetypesSql');
	const mysql = await getConnectionReadOnly();
	const archetypes = await loadArchetypes(mysql);
	mysql.end();
	console.timeEnd('archetypesSql');

	console.time('archetypeStats');
	// console.log('memory before buildArchetypeStats', formatMemoryUsage(process.memoryUsage()));
	const archetypeStats: readonly ArchetypeStat[] = buildArchetypeStats(
		archetypes,
		deckStatsWithoutArchetypeInfo,
		allCards,
	);
	console.timeEnd('archetypeStats');
	console.log(
		'archetypeStats',
		archetypeStats?.length,
		archetypes?.length,
		archetypeStats?.map((a) => a.totalGames).reduce((a, b) => a + b, 0),
	);

	console.time('deckStats');
	// console.log('memory before enhanceDeckStats', formatMemoryUsage(process.memoryUsage()));
	const deckStats: readonly DeckStat[] = enhanceDeckStats(deckStatsWithoutArchetypeInfo, archetypeStats, allCards);
	console.timeEnd('deckStats');
	console.log(
		'deckStats',
		deckStats?.length,
		deckStats?.map((a) => a.totalGames).reduce((a, b) => a + b, 0),
	);

	const lastUpdate = getLastUpdate(deckStats);

	// Only persist detailed decks twice a day, at 00 hours and 12 hours
	console.time('persistData');
	const shouldPersistDetailedDecks = false; // new Date().getHours() % 12 === 0;
	await persistData(
		archetypeStats,
		deckStats,
		lastUpdate,
		rankBracket,
		timePeriod,
		format,
		shouldPersistDetailedDecks,
	);
	console.timeEnd('persistData');
};

const getLastUpdate = (deckStats: readonly DeckStat[]): Date => {
	const lastUpdateInfo = deckStats
		.map((d) => ({
			date: new Date(d.lastUpdate),
			dateStr: d.lastUpdate,
			time: new Date(d.lastUpdate).getTime(),
		}))
		.filter((date) => !isNaN(date.time))
		.sort((a, b) => b.time - a.time)[0];
	const lastUpdate = lastUpdateInfo.date;
	if (!lastUpdate) {
		console.error(
			'could not find last update date',
			deckStats.map((d) => ({
				date: new Date(d.lastUpdate),
				dateStr: d.lastUpdate,
				time: new Date(d.lastUpdate).getTime(),
			})),
		);
		throw new Error('could not find last update date');
	}
	console.log('loaded hourly deck data', deckStats.length, lastUpdate, lastUpdateInfo);
	return lastUpdate;
};

const dispatchFormatEvents = async (context: Context) => {
	// const allFormats: readonly GameFormat[] = ['standard', 'wild', 'twist'];
	const allFormats: readonly GameFormat[] = ['standard'];
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
		// console.log('\tinvoking lambda', params);
		const result = await lambda.invoke(params).promise();
		// console.log('\tinvocation result', result);
		await sleep(50);
	}
};

const dispatchEvents = async (context: Context, format: GameFormat) => {
	// console.log('dispatching events');
	const allTimePeriod: readonly TimePeriod[] = ['last-patch', 'past-20', 'past-7', 'past-3', 'current-season'];
	// const allTimePeriod: readonly TimePeriod[] = ['last-patch'];
	const allRankBracket: readonly RankBracket[] = [
		'top-2000-legend',
		'legend',
		'legend-diamond',
		'diamond',
		'platinum',
		'bronze-gold',
		'all',
	];
	// const allRankBracket: readonly RankBracket[] = ['top-2000-legend'];
	for (const timePeriod of allTimePeriod) {
		for (const rankBracket of allRankBracket) {
			console.log('dispatching events for timePeriod and rank', timePeriod, rankBracket);
			const newEvent = {
				dailyProcessing: true,
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
			// console.log('\tinvoking lambda', params);
			const result = await lambda.invoke(params).promise();
			// console.log('\tinvocation result', result);
			await sleep(50);
		}
	}
};
