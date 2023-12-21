// This example demonstrates a NodeJS 8.10 async handler[1], however of course you could use
// the more traditional callback-style handler.

import { S3, getConnectionReadOnly, sleep } from '@firestone-hs/aws-lambda-utils';
import { AllCardsService } from '@firestone-hs/reference-data';
import { Context } from 'aws-lambda';
import AWS from 'aws-sdk';
import { loadArchetypes } from '../archetypes';
import { ConstructedMatchStatDbRow, DeckStat, GameFormat, RankBracket } from '../model';
import { buildArchetypes, enhanceArchetypeStats } from './archetype-stats';
import { buildDeckStats } from './constructed-deck-stats';
import { isCorrectRank } from './constructed-match-stats';
import { saveDeckStats } from './persist-data';
import { readRowsFromS3, saveRowsOnS3 } from './rows';

// export const GAMES_THRESHOLD = 50;

const allCards = new AllCardsService();
export const s3 = new S3();
const lambda = new AWS.Lambda();

// The date of the day before, in YYYY-MM-dd format
// const yesterdayDate = () => {
// 	const now = new Date();
// 	const yesterday = new Date(now.setDate(now.getDate() - 1));
// 	const year = yesterday.getFullYear();
// 	const month = yesterday.getMonth() + 1;
// 	const day = yesterday.getDate();
// 	return `${year}-${month}-${day}`;
// };
// export let targetDate = yesterdayDate();

// [1]: https://aws.amazon.com/blogs/compute/node-js-8-10-runtime-now-available-in-aws-lambda/
export default async (event, context: Context): Promise<any> => {
	await allCards.initializeCardsDb();

	if (!event.format) {
		await dispatchFormatEvents(context);
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
	const allRows: readonly ConstructedMatchStatDbRow[] = await readRowsFromS3(format, startDate);
	const rows = allRows.filter((r) => r.format === format);
	console.log('\t', 'loaded rows', rows.length);
	const mysql = await getConnectionReadOnly();
	const archetypes = await loadArchetypes(mysql);
	mysql.end();
	console.log('\t', 'loaded archetypes', archetypes.length);
	const relevantRows = rows.filter((r) => isCorrectRank(r, rankBracket));
	console.log('\t', 'relevantRows', relevantRows.length, rankBracket);
	const lastGameDate = relevantRows
		.map((r) => new Date(r.creationDate))
		.sort()
		.reverse()[0];
	const archetypeStats = buildArchetypes(relevantRows, archetypes, format, allCards);
	console.log('\t', 'built archetype stats', archetypeStats.length);
	const deckStats: readonly DeckStat[] = buildDeckStats(relevantRows, rankBracket, format, archetypeStats, allCards);
	const enhancedArchetypes = enhanceArchetypeStats(archetypeStats, deckStats);
	console.log('\t', 'built deck stats', deckStats.length);
	await saveDeckStats(deckStats, enhancedArchetypes, lastGameDate, rankBracket, format, startDate);

	return { statusCode: 200, body: null };
};

const dispatchFormatEvents = async (context: Context) => {
	// Start from the start of the current hour
	const processStartDate = new Date();
	processStartDate.setMinutes(0);
	processStartDate.setSeconds(0);
	processStartDate.setMilliseconds(0);
	processStartDate.setHours(processStartDate.getHours() - 1);
	console.log('processStartDate', processStartDate);
	// End one hour later
	const processEndDate = new Date(processStartDate);
	processEndDate.setHours(processEndDate.getHours() + 1);

	const allFormats: readonly GameFormat[] = ['standard', 'wild', 'twist'];
	// const allFormats: readonly GameFormat[] = ['standard'];
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

const dispatchEvents = async (context: Context, format: GameFormat, startDate: string, endDate: string) => {
	console.log('saving rows for format', format);
	await saveRowsOnS3(format, startDate, endDate);

	console.log('dispatching events');
	const allRankBracket: readonly RankBracket[] = [
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
		console.log('\tinvocation result', result);
		await sleep(50);
	}
	// }
};
