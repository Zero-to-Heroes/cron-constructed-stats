import { S3, logBeforeTimeout, sleep } from '@firestone-hs/aws-lambda-utils';
import { ALL_CLASSES, AllCardsService } from '@firestone-hs/reference-data';
import { Context } from 'aws-lambda';
import AWS from 'aws-sdk';
import { ALL_FORMATS, DECK_STATS_BUCKET, DECK_STATS_KEY_PREFIX } from '../common/config';
import { ArchetypeStats, DeckStats, GameFormat, RankBracket, TimePeriod } from '../model';
import { mergeArchetypes } from './archetypes-rebuild';
import { mergeDecks } from './deck-stats-rebuild';
import { persistData } from './s3-saver';

const allCards = new AllCardsService();
export const s3 = new S3();
const lambda = new AWS.Lambda();

export default async (event, context: Context): Promise<any> => {
	const cleanup = logBeforeTimeout(context);
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

	const classDecks = (
		await Promise.all(
			ALL_CLASSES.map((playerClass) =>
				s3.readGzipContent(
					DECK_STATS_BUCKET,
					`${DECK_STATS_KEY_PREFIX}/decks/${format}/${rankBracket}/${timePeriod}/overview-from-hourly-${playerClass}.gz.json`,
					1,
					false,
					300,
				),
			),
		)
	)
		.map((content) => JSON.parse(content) as DeckStats)
		// Because some game modes, like Twist, don't have all the classes
		.filter((stat) => !!stat);
	const classArchetypes = (
		await Promise.all(
			ALL_CLASSES.map((playerClass) =>
				s3.readGzipContent(
					DECK_STATS_BUCKET,
					`${DECK_STATS_KEY_PREFIX}/archetypes/${format}/${rankBracket}/${timePeriod}/overview-from-hourly-${playerClass}.gz.json`,
					1,
					false,
					300,
				),
			),
		)
	)
		.map((content) => JSON.parse(content) as ArchetypeStats)
		.filter((archetype) => !!archetype);
	const allArchetypes = mergeArchetypes(classArchetypes);
	const allDecks = mergeDecks(classDecks);
	const lastUpdate = getLastUpdate(classDecks);

	await persistData(allArchetypes, allDecks, lastUpdate, rankBracket, timePeriod, format);
	cleanup();
};

const getLastUpdate = (deckStats: readonly DeckStats[]): Date => {
	const lastUpdateInfo = deckStats
		.map((s) => s.lastUpdated)
		.map((d) => ({
			date: new Date(d),
			dateStr: d,
			time: new Date(d).getTime(),
		}))
		.filter((date) => !isNaN(date.time))
		.sort((a, b) => b.time - a.time)[0];
	const lastUpdate = lastUpdateInfo.date;
	if (!lastUpdate) {
		throw new Error('could not find last update date');
	}
	// console.log('loaded hourly deck data', deckStats.length, lastUpdate, lastUpdateInfo);
	return lastUpdate;
};

const dispatchFormatEvents = async (context: Context) => {
	const allFormats: readonly GameFormat[] = ALL_FORMATS;
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
