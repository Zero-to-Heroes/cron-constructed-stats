import { S3, logBeforeTimeout } from '@firestone-hs/aws-lambda-utils';
import { ALL_CLASSES } from '@firestone-hs/reference-data';
import { Context } from 'aws-lambda';
import { gzipSync } from 'zlib';
import { DECK_STATS_BUCKET, DECK_STATS_KEY_PREFIX } from '../common/config';
import { DeckStat } from '../model';

export const s3 = new S3();

let globalDeckIdCache = {};
const globalDeckCache = {};
const globalDeckIdLastUpdate = null;
const DECK_ID_VALIDITY = 1000 * 60 * 60 * 3; // 3 hours

export default async (event, context: Context): Promise<any> => {
	const cleanup = logBeforeTimeout(context);
	// console.log('handling event', event);
	const format = event.queryStringParameters.format;
	const rank = event.queryStringParameters.rank;
	const timePeriod = event.queryStringParameters.timePeriod;
	const encodedDeckId = event.queryStringParameters.deckId;
	const deckId = decodeURIComponent(encodedDeckId).replaceAll('/', '-');
	console.debug(
		'arguments',
		format,
		rank,
		timePeriod,
		deckId,
		Object.values(globalDeckCache).length,
		Object.values(globalDeckIdCache).length,
	);
	if (!format || !rank || !timePeriod || !deckId) {
		cleanup();
		return {
			statusCode: 400,
			body: JSON.stringify({
				error: 'format, rank, timePeriod and deckId are all required',
				timestamp: Date.now(),
			}),
		};
	}

	const cachedDeck = globalDeckCache[deckId];
	if (cachedDeck) {
		cleanup();
		return {
			statusCode: 200,
			isBase64Encoded: true,
			headers: {
				'Cache-Control': `public, max-age=${12 * 3600}`,
				'Content-Type': 'text/html',
				'Content-Encoding': 'gzip',
			},
			body: cachedDeck,
		};
	}

	// The cached deck is not available, let's try to read it from S3
	const deck = await readDeckFromS3(format, rank, timePeriod, deckId);
	if (!deck) {
		cleanup();
		return {
			statusCode: 404,
			body: JSON.stringify({ error: 'deck not found', timestamp: Date.now() }),
		};
	}

	// await updateDeckInDb(format, rank, timePeriod, deckId, deck);
	cleanup();
	const zippedDeck = gzipSync(
		JSON.stringify({
			...deck,
			timestamp: Date.now(),
		}),
	).toString('base64');
	// globalDeckCache[deckId] = zippedDeck;
	return {
		statusCode: 200,
		isBase64Encoded: true,
		headers: {
			'Cache-Control': `public, max-age=${12 * 3600}`,
			'Content-Type': 'text/html',
			'Content-Encoding': 'gzip',
		},
		body: zippedDeck,
	};
};

// Read the deck aggregates from all classes, and picks the correct deck from there

const readDeckFromS3 = async (format: string, rank: string, timePeriod: string, deckId: string): Promise<DeckStat> => {
	const s3 = new S3();

	if (
		!globalDeckIdCache ||
		!Object.keys(globalDeckIdCache).length ||
		!globalDeckIdLastUpdate ||
		Date.now() - globalDeckIdLastUpdate > DECK_ID_VALIDITY
	) {
		console.debug('rebulding deck id cache', Object.keys(globalDeckIdCache).length);
		globalDeckIdCache = {};
		// First map each deck id to a class
		await Promise.all(
			ALL_CLASSES.map((playerClass) => {
				const filename = `${DECK_STATS_KEY_PREFIX}/decks/${format}/${rank}/${timePeriod}/all-decks-ids-${playerClass}.gz.json`;
				return s3.readGzipContent(DECK_STATS_BUCKET, filename, 1, false, 300).then((deckIds) => {
					const allDeckIds: readonly string[] = JSON.parse(deckIds);
					allDeckIds.forEach((deckId) => {
						globalDeckIdCache[deckId] = playerClass;
					});
				});
			}),
		);
	}
	const playerClass = globalDeckIdCache[deckId];
	if (!playerClass) {
		console.error('missing deck id', deckId);
		return null;
	}

	// Then read the actual deck contents
	const allDecksStr = await s3.readGzipContent(
		DECK_STATS_BUCKET,
		`${DECK_STATS_KEY_PREFIX}/decks/${format}/${rank}/${timePeriod}/all-decks-${playerClass}.gz.json`,
		1,
		false,
		300,
	);
	// const size = Buffer.byteLength(allDecksStr, 'utf8') / 1024 / 1024;
	const allDecks: readonly DeckStat[] = JSON.parse(allDecksStr);
	const deck = allDecks.find((deck: DeckStat) => deck.decklist.replaceAll('/', '-') === deckId);
	return deck;
};
