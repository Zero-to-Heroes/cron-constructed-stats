import { S3, logBeforeTimeout, sleep } from '@firestone-hs/aws-lambda-utils';
import { AllCardsService } from '@firestone-hs/reference-data';
import { Context } from 'aws-lambda';
import AWS from 'aws-sdk';
import { ALL_FORMATS } from '../common/config';
import { DeckStat, GameFormat, RankBracket } from '../model';
import { mergeAllHourlyStatsForTheDay } from './data-aggregation-deck';
import { persistData } from './s3-saver';

const allCards = new AllCardsService();
export const s3 = new S3();
const lambda = new AWS.Lambda();

// The date of the day before, in YYYY-MM-dd format
const yesterdayDate = () => {
	const now = new Date();
	const yesterday = new Date(now.setDate(now.getDate() - 1));
	const year = yesterday.getFullYear();
	const month = yesterday.getMonth() + 1;
	const day = yesterday.getDate();
	return `${year}-${month}-${day}`;
};

export default async (event, context: Context): Promise<any> => {
	const cleanup = logBeforeTimeout(context);
	await allCards.initializeCardsDb();

	if (event.catchUp) {
		await dispatchCatchUpEvents(context, +event.catchUp);
		return;
	}

	if (!event.format) {
		await dispatchFormatEvents(context, event);
		return;
	}

	const format: GameFormat = event.format;
	const rankBracket: RankBracket = event.rankBracket;
	const targetDate: string = event.targetDate || yesterdayDate();

	console.log('aggregating daily data', format, rankBracket, targetDate);
	const dailyDeckStats: readonly DeckStat[] = await mergeAllHourlyStatsForTheDay(format, rankBracket, targetDate);
	if (!dailyDeckStats?.length) {
		console.warn('no deck stats for', format, rankBracket, targetDate);
		return;
	}

	const lastUpdateInfo = dailyDeckStats
		.map((d) => ({
			date: new Date(d.lastUpdate),
			dateStr: d.lastUpdate,
			time: new Date(d.lastUpdate).getTime(),
		}))
		.sort((a, b) => b.time - a.time)[0];
	const lastUpdate = lastUpdateInfo.date;
	if (!lastUpdate) {
		console.error(
			'could not find last update date',
			dailyDeckStats.map((d) => ({
				date: new Date(d.lastUpdate),
				dateStr: d.lastUpdate,
				time: new Date(d.lastUpdate).getTime(),
			})),
		);
		throw new Error('could not find last update date');
	}
	// console.log('loaded daily deck data', format, dailyDeckStats.length, lastUpdate, lastUpdateInfo);
	await persistData(dailyDeckStats, lastUpdate, format, rankBracket, targetDate);
	cleanup();
};

const dispatchFormatEvents = async (context: Context, event: any) => {
	const allFormats: readonly GameFormat[] = ALL_FORMATS;
	// const allFormats: readonly GameFormat[] = ['twist'];
	// const allRankBracket: readonly RankBracket[] = ['all'];
	const allRankBracket: readonly RankBracket[] = [
		'top-2000-legend',
		'legend',
		'legend-diamond',
		'diamond',
		'platinum',
		'bronze-gold',
		'all',
	];
	for (const format of allFormats) {
		for (const rankBracket of allRankBracket) {
			// console.log('dispatching events for format', format);
			const newEvent = {
				rankBracket: rankBracket,
				targetDate: event.targetDate,
				format: format,
			};
			const params = {
				FunctionName: context.functionName,
				InvocationType: 'Event',
				LogType: 'Tail',
				Payload: JSON.stringify(newEvent),
			};
			// console.log('\tinvoking lambda', params);
			const result = await lambda
				.invoke({
					FunctionName: context.functionName,
					InvocationType: 'Event',
					LogType: 'Tail',
					Payload: JSON.stringify(newEvent),
				})
				.promise();
			// console.log('\tinvocation result', result);
			await sleep(50);
		}
	}
};

const dispatchCatchUpEvents = async (context: Context, numberOfDays: number) => {
	// Build a list of days for the last 30 days, in the format YYYY-MM-dd
	const now = new Date();
	const days = [];
	for (let i = 0; i < numberOfDays; i++) {
		const day = new Date(now.setDate(now.getDate() - 1));
		const year = day.getFullYear();
		const month = day.getMonth() + 1;
		const dayOfMonth = day.getDate();
		days.push(`${year}-${month}-${dayOfMonth}`);
	}

	for (const targetDate of days) {
		console.log('dispatching catch-up for date', targetDate);
		const newEvent = {
			targetDate: targetDate,
		};
		const params = {
			FunctionName: context.functionName,
			InvocationType: 'Event',
			LogType: 'Tail',
			Payload: JSON.stringify(newEvent),
		};
		// console.log('\tinvoking lambda', params);
		const result = await lambda
			.invoke({
				FunctionName: context.functionName,
				InvocationType: 'Event',
				LogType: 'Tail',
				Payload: JSON.stringify(newEvent),
			})
			.promise();
		// console.log('\tinvocation result', result);
		await sleep(50);
	}
};
