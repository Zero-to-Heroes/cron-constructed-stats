// This example demonstrates a NodeJS 8.10 async handler[1], however of course you could use
// the more traditional callback-style handler.

import { getConnectionReadOnly, getLastConstructedPatch } from '@firestone-hs/aws-lambda-utils';
import { AllCardsService } from '@firestone-hs/reference-data';
import { Context } from 'aws-lambda';
import AWS from 'aws-sdk';
import { buildArchetypes } from './archetype-stats';
import { loadArchetypes } from './archetypes';
import { buildDeckStats, saveDeckStats } from './constructed-deck-stats';
import { isCorrectRank, isCorrectTime, loadRows } from './constructed-match-stats';
import { ConstructedMatchStatDbRow, DeckStat, GameFormat, RankBracket, TimePeriod } from './model';

export const DECK_STATS_BUCKET = 'static.zerotoheroes.com';
export const DECK_STATS_KEY_PREFIX = `api/constructed/stats`;
export const GAMES_THRESHOLD = 50;
export const CORE_CARD_THRESHOLD = 0.9;

export const allCards = new AllCardsService();
const lambda = new AWS.Lambda();

// [1]: https://aws.amazon.com/blogs/compute/node-js-8-10-runtime-now-available-in-aws-lambda/
export default async (event, context: Context): Promise<any> => {
	await allCards.initializeCardsDb();
	const mysql = await getConnectionReadOnly();

	if (!event.format) {
		// await moveRowsToS3(mysql);
		await dispatchEvents(context);
		return;
	}

	const format: GameFormat = event.format;
	const rows: readonly ConstructedMatchStatDbRow[] = await loadRows(mysql, format);
	console.log('loaded rows', rows.length);
	const archetypes = await loadArchetypes(mysql);
	console.log('loaded archetypes', archetypes.length);
	const patchInfo = await getLastConstructedPatch();

	const allTimePeriod: readonly TimePeriod[] = ['past-30', 'past-7', 'past-3', 'current-season', 'last-patch'];
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
			const relevantRows = rows
				.filter((r) => isCorrectTime(r, timePeriod, patchInfo))
				.filter((r) => isCorrectRank(r, rankBracket));
			const archetypeStats = await buildArchetypes(relevantRows, archetypes);
			console.log('built archetype stats', archetypeStats.length);
			const deckStats: readonly DeckStat[] = buildDeckStats(
				relevantRows,
				rankBracket,
				timePeriod,
				format,
				archetypeStats,
			);
			console.log('built deck stats', deckStats.length);
			await saveDeckStats(mysql, deckStats, archetypeStats, rankBracket, timePeriod, format);
		}
	}

	return { statusCode: 200, body: null };
};

const dispatchEvents = async (context: Context) => {
	const allFormats: readonly GameFormat[] = ['standard', 'wild', 'twist'];

	for (const format of allFormats) {
		const newEvent = {
			// timePeriod: timePeriod,
			// rankBracket: rankBracket,
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
	}
};
