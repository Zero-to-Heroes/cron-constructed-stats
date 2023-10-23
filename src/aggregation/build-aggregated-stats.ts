import { S3, getLastConstructedPatch, sleep } from '@firestone-hs/aws-lambda-utils';
import { AllCardsService } from '@firestone-hs/reference-data';
import { Context } from 'aws-lambda';
import AWS from 'aws-sdk';
import { ArchetypeStats, DeckStats, GameFormat, RankBracket, TimePeriod } from '../model';
import { aggregateDeckData } from './data-aggregation-deck';
import { aggregateArchetypeData } from './data-aggregattion-archetype';
import { loadDailyDataArchetypeFromS3, loadDailyDataDeckFromS3 } from './s3-loader';
import { persistData } from './s3-saver';

export const allCards = new AllCardsService();
export const s3 = new S3();
const lambda = new AWS.Lambda();

export default async (event, context: Context): Promise<any> => {
	await allCards.initializeCardsDb();

	if (!event.format) {
		await dispatchFormatEvents(context);
		return;
	}

	if (event.dailyProcessing && (!event.timePeriod || !event.rankBracket)) {
		await dispatchEvents(context, event.format);
		return;
	}

	const format: GameFormat = event.format;
	const timePeriod: TimePeriod = event.timePeriod;
	const rankBracket: RankBracket = event.rankBracket;

	console.log('aggregating data', format, timePeriod, rankBracket);
	// Build the list of files based on the timeframe, and load all of these
	const patchInfo = await getLastConstructedPatch();
	const dailyDeckData: readonly DeckStats[] = await loadDailyDataDeckFromS3(
		format,
		rankBracket,
		timePeriod,
		patchInfo,
	);
	console.log('loaded daily deck data', dailyDeckData.length);
	const dailyArchetypeData: readonly ArchetypeStats[] = await loadDailyDataArchetypeFromS3(
		format,
		rankBracket,
		timePeriod,
		patchInfo,
	);
	console.log('loaded daily archetype data', dailyArchetypeData.length);

	const aggregatedArchetypeData: ArchetypeStats = dailyArchetypeData.length
		? aggregateArchetypeData(dailyArchetypeData)
		: null;
	console.log(
		'aggregated archetypes',
		aggregatedArchetypeData?.archetypeStats?.length,
		aggregatedArchetypeData?.dataPoints,
	);
	const aggregatedDeckData: DeckStats = dailyArchetypeData.length
		? aggregateDeckData(dailyDeckData, aggregatedArchetypeData)
		: null;
	console.log('aggregated decks', aggregatedDeckData?.deckStats?.length, aggregatedDeckData?.dataPoints);

	await persistData(aggregatedArchetypeData, aggregatedDeckData, rankBracket, timePeriod, format);
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
