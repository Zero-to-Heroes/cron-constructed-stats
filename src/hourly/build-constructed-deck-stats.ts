// This example demonstrates a NodeJS 8.10 async handler[1], however of course you could use
// the more traditional callback-style handler.

import { S3, logBeforeTimeout, sleep } from '@firestone-hs/aws-lambda-utils';
import { AllCardsService } from '@firestone-hs/reference-data';
import { Context } from 'aws-lambda';
import AWS from 'aws-sdk';
import { ALL_FORMATS } from '../common/config';
import { ConstructedMatchStatDbRow, DeckStat, GameFormat, RankBracket } from '../model';
import { buildDeckStats } from './constructed-deck-stats';
import { isCorrectRank } from './constructed-match-stats';
import { saveDeckStats } from './persist-data';
import { readRowsFromS3, saveRowsOnS3 } from './rows';

const allCards = new AllCardsService();
const s3 = new S3();
const lambda = new AWS.Lambda();

// [1]: https://aws.amazon.com/blogs/compute/node-js-8-10-runtime-now-available-in-aws-lambda/
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
	if (!event.rankBracket) {
		await dispatchEvents(context, event.format, event.startDate, event.endDate);
		return;
	}

	const startDate = event.startDate;
	const endDate = event.endDate;
	const format: GameFormat = event.format;
	const rankBracket = event.rankBracket;

	console.log('reading rows from s3', format, rankBracket);
	const allRows: readonly ConstructedMatchStatDbRow[] = await readRowsFromS3(format, startDate, s3);
	const rows = allRows.filter((r) => r.format === format);
	const relevantRows = rows.filter((r) => isCorrectRank(r, rankBracket));
	const lastGameDate = relevantRows
		.map((r) => new Date(r.creationDate))
		.sort()
		.reverse()[0];
	const deckStats: readonly DeckStat[] = buildDeckStats(relevantRows, rankBracket, format, allCards);
	await saveDeckStats(deckStats, lastGameDate, rankBracket, format, startDate);
	cleanup();

	return { statusCode: 200, body: null };
};

const dispatchFormatEvents = async (context: Context, event) => {
	const processStartDate = buildProcessStartDate(event);
	// End one hour later
	const processEndDate = new Date(processStartDate);
	processEndDate.setHours(processEndDate.getHours() + 1);

	const allFormats: readonly GameFormat[] = ALL_FORMATS;
	// const allFormats: readonly GameFormat[] = ['twist'];
	for (const format of allFormats) {
		console.log('dispatching events for format', format);
		const newEvent = {
			dailyProcessing: true,
			format: format,
			startDate: processStartDate,
			endDate: processEndDate,
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

const buildProcessStartDate = (event): Date => {
	if (event?.targetDate) {
		const targetDate = new Date(event.targetDate);
		return targetDate;
	}

	// Start from the start of the current hour
	const processStartDate = new Date();
	processStartDate.setMinutes(0);
	processStartDate.setSeconds(0);
	processStartDate.setMilliseconds(0);
	processStartDate.setHours(processStartDate.getHours() - 1);
	return processStartDate;
};

const dispatchEvents = async (context: Context, format: GameFormat, startDate: string, endDate: string) => {
	// console.log('saving rows for format', format);
	await saveRowsOnS3(format, startDate, endDate, s3);

	// console.log('dispatching events');
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
	// const allRankBracket: readonly RankBracket[] = ['all'];
	// for (const timePeriod of allTimePeriod) {
	for (const rankBracket of allRankBracket) {
		const newEvent = {
			dailyProcessing: true,
			rankBracket: rankBracket,
			format: format,
			startDate: startDate,
			endDate: endDate,
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
		// console.log('\tinvocation result', result);
		await sleep(50);
	}
	// }
};

const dispatchCatchUpEvents = async (context: Context, daysInThePast: number) => {
	// Build a list of hours for the last `daysInThePast` days, in the format YYYY-MM-ddTHH:mm:ss.sssZ
	const now = new Date();
	const hours = [];
	for (let i = 0; i < 24 * daysInThePast; i++) {
		const baseDate = new Date(now);
		baseDate.setMinutes(0);
		baseDate.setSeconds(0);
		baseDate.setMilliseconds(0);
		const hour = new Date(baseDate.getTime() - i * 60 * 60 * 1000);
		hours.push(hour.toISOString());
	}

	for (const targetDate of hours) {
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
