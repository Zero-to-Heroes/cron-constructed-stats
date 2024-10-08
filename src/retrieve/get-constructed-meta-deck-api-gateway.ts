import { S3, getConnection, logBeforeTimeout } from '@firestone-hs/aws-lambda-utils';
import { ALL_CLASSES } from '@firestone-hs/reference-data';
import { Context } from 'aws-lambda';
import { gzipSync } from 'zlib';
import { DECK_STATS_BUCKET, DECK_STATS_KEY_PREFIX } from '../common/config';
import { DeckStat } from '../model';

export const s3 = new S3();

export default async (event, context: Context): Promise<any> => {
	const cleanup = logBeforeTimeout(context);
	console.log('handling event', event);
	const format = event.queryStringParameters.format;
	const rank = event.queryStringParameters.rank;
	const timePeriod = event.queryStringParameters.timePeriod;
	const encodedDeckId = event.queryStringParameters.deckId;
	const deckId = decodeURIComponent(encodedDeckId).replaceAll('/', '-');
	console.debug('arguments', format, rank, timePeriod, deckId);
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

	// const mysql = await getConnectionReadOnly();
	// const query = `
	//     SELECT *
	//     FROM constructed_deck_stats
	//     WHERE
	//         format = '${format}'
	//         AND rankBracket = '${rank}'
	//         AND timePeriod = '${timePeriod}'
	//         AND deckId = '${deckId}'
	// 		AND lastUpdateDate > DATE_SUB(NOW(), INTERVAL 1 DAY)
	// `;
	// // console.debug('query', query);
	// const result: any = await mysql.query(query);
	// mysql.end();

	// const cachedDeckStr: string = result?.[0]?.deckData;
	// if (cachedDeckStr?.length > 0) {
	// 	cleanup();
	// 	return {
	// 		statusCode: 200,
	// 		headers: {
	// 			'Cache-Control': 'public, max-age=3600',
	// 			'Content-Type': 'application/json',
	// 			'X-Timestamp': Date.now(),
	// 		},
	// 		body: cachedDeckStr,
	// 	};
	// }

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

const updateDeckInDb = async (format: string, rank: string, timePeriod: string, deckId: string, deck: DeckStat) => {
	if (!deck) {
		return;
	}

	const updatedDeck: DeckStat = {
		...deck,
		cardsData: deck.cardsData.filter((c) => c.inStartingDeck > deck.totalGames / 50),
	};

	const mysql = await getConnection();
	const query = `
	    INSERT INTO constructed_deck_stats (
	        format,
	        rankBracket,
	        timePeriod,
	        deckId,
	        deckData,
	        lastUpdateDate
	    ) VALUES (
	        '${format}',
	        '${rank}',
	        '${timePeriod}',
	        '${deckId}',
	        '${JSON.stringify(updatedDeck)}',
	        NOW()
	    )
	    ON DUPLICATE KEY UPDATE
	        deckData = '${JSON.stringify(updatedDeck)}',
	        lastUpdateDate = NOW()
	`;
	// console.debug('updating deck in db', deckId);
	await mysql.query(query);
	mysql.end();
};

const readDeckFromS3 = async (format: string, rank: string, timePeriod: string, deckId: string): Promise<DeckStat> => {
	const s3 = new S3();
	const deckIdMap = {};
	// console.log('reading deck from S3', format, rank, timePeriod, deckId);
	await Promise.all(
		ALL_CLASSES.map((playerClass) => {
			const filename = `${DECK_STATS_KEY_PREFIX}/decks/${format}/${rank}/${timePeriod}/all-decks-ids-${playerClass}.gz.json`;
			// console.log('reading fileName', filename)
			return s3.readGzipContent(DECK_STATS_BUCKET, filename, 1, false, 300).then((deckIds) => {
				// if (!deckIds?.length) {
				// 	console.warn('missing deck ids', filename);
				// }
				const allDeckIds: readonly string[] = JSON.parse(deckIds);
				allDeckIds.forEach((deckId) => {
					deckIdMap[deckId] = playerClass;
				});
			});
		}),
	);
	// console.log('all deck ids', Object.keys(deckIdMap).length, deckId, Object.keys(deckIdMap));

	const playerClass = deckIdMap[deckId];
	// console.log('playerClass', playerClass);
	if (!playerClass) {
		// console.error('missing deck id', deckId);
		return null;
	}

	const allDecksStr = await s3.readGzipContent(
		DECK_STATS_BUCKET,
		`${DECK_STATS_KEY_PREFIX}/decks/${format}/${rank}/${timePeriod}/all-decks-${playerClass}.gz.json`,
		1,
		false,
		300,
	);
	// Size of the string in MB
	const size = Buffer.byteLength(allDecksStr, 'utf8') / 1024 / 1024;
	// console.log(
	// 	'fetched all decks raw string',
	// 	`${DECK_STATS_KEY_PREFIX}/decks/${format}/${rank}/${timePeriod}/all-decks-${playerClass}.gz.json`,
	// 	`${size} MB`,
	// );
	const allDecks: readonly DeckStat[] = JSON.parse(allDecksStr);
	// console.log('all decks', allDecks.length);
	const deck = allDecks.find((deck: DeckStat) => deck.decklist.replaceAll('/', '-') === deckId);
	// console.log('deck', deck);
	return deck;

	// for (const playerClass of ALL_CLASSES) {
	// 	const content = await s3.readGzipContent(
	// 		DECK_STATS_BUCKET,
	// 		`${DECK_STATS_KEY_PREFIX}/decks/${format}/${rank}/${timePeriod}/all-decks-ids-${playerClass}.gz.json`,
	// 		1,
	// 		false,
	// 		300,
	// 	);
	// 	const allDeckIds: readonly string[] = JSON.parse(content);
	// 	if (allDeckIds.includes(deckId)) {
	// 		const allDecksStr = await s3.readGzipContent(
	// 			DECK_STATS_BUCKET,
	// 			`${DECK_STATS_KEY_PREFIX}/decks/${format}/${rank}/${timePeriod}/all-decks-${playerClass}.gz.json`,
	// 			1,
	// 			false,
	// 			300,
	// 		);
	// 		const allDecks: readonly DeckStat[] = JSON.parse(allDecksStr);
	// 		const deck = allDecks.find(
	// 			(deck: DeckStat) => encodeURIComponent(deck.decklist.replaceAll('/', '-')) === deckId,
	// 		);
	// 		return deck;
	// 	}
	// }

	// return null;
};
