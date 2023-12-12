import { S3, getConnectionReadOnly, getLastConstructedPatch, sleep } from '@firestone-hs/aws-lambda-utils';
import { AllCardsService } from '@firestone-hs/reference-data';
import { Context } from 'aws-lambda';
import AWS from 'aws-sdk';
import { loadArchetypes } from '../archetypes';
import { enhanceArchetypeStats } from '../daily/archetype-stats';
import { ArchetypeStat, DeckStat, DeckStats, GameFormat, RankBracket, TimePeriod } from '../model';
import { buildArchetypeStats } from './archetypes-rebuild';
import { buildDecksStats } from './deck-stats-rebuild';
import { loadDailyDataDeckFromS3 as loadHourlyDataDeckFromS3 } from './s3-loader';
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
	// Build the list of files based on the timeframe, and load all of these
	const patchInfo = await getLastConstructedPatch();
	const hourlyDeckData: readonly DeckStats[] = await loadHourlyDataDeckFromS3(
		format,
		rankBracket,
		timePeriod,
		patchInfo,
	);
	const lastUpdate = hourlyDeckData
		.map((d) => ({
			date: new Date(d.lastUpdated),
			dateStr: d.lastUpdated,
			time: new Date(d.lastUpdated).getTime(),
		}))
		.sort((a, b) => b.time - a.time)[0].date;
	console.log('loaded hourly deck data', format, timePeriod, rankBracket, hourlyDeckData.length, lastUpdate);

	const mysql = await getConnectionReadOnly();
	const archetypes = await loadArchetypes(mysql);
	mysql.end();

	const archetypeStats: readonly ArchetypeStat[] = buildArchetypeStats(archetypes, hourlyDeckData, allCards);
	console.log(
		'archetypeStats',
		archetypeStats?.length,
		archetypeStats?.map((a) => a.totalGames).reduce((a, b) => a + b, 0),
	);
	const deckStats: readonly DeckStat[] = buildDecksStats(hourlyDeckData, archetypeStats, allCards);
	console.log(
		'deckStats',
		deckStats?.length,
		deckStats?.map((a) => a.totalGames).reduce((a, b) => a + b, 0),
	);

	const enhancedArchetypes = enhanceArchetypeStats(archetypeStats, deckStats);

	await persistData(enhancedArchetypes, deckStats, lastUpdate, rankBracket, timePeriod, format);
};

const dispatchFormatEvents = async (context: Context) => {
	const allFormats: readonly GameFormat[] = ['standard', 'wild', 'twist'];
	// const allFormats: readonly GameFormat[] = ['standard'];
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
	console.log('dispatching events');
	const allTimePeriod: readonly TimePeriod[] = ['last-patch', 'past-20', 'past-7', 'past-3', 'current-season'];
	const allRankBracket: readonly RankBracket[] = [
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
