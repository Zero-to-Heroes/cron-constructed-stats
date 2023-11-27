import { getConnectionReadOnly } from '@firestone-hs/aws-lambda-utils';
import { Context } from 'aws-lambda';

// Build a request handler for a GET request on AWS Lambda
// URL is base/:format/:rank/:timePeriod/:deckId
export default async (event, context: Context): Promise<any> => {
	console.log('handling event', event);
	const rawPath: string = event.rawPath;
	const path = rawPath.startsWith('//') ? rawPath.substring(2) : rawPath.substring(1);
	console.debug('path', path);
	const format = path.split('/')[0];
	const rank = path.split('/')[1];
	const timePeriod = path.split('/')[2];
	const encodedDeckId = path.split('/')[3];
	const deckId = decodeURIComponent(encodedDeckId).replaceAll('/', '-');
	console.debug('arguments', format, rank, timePeriod, deckId, path);
	if (!format || !rank || !timePeriod || !deckId) {
		return {
			statusCode: 400,
			body: JSON.stringify({ error: 'format, rank, timePeriod and deckId are all required' }),
		};
	}

	const mysql = await getConnectionReadOnly();
	const query = `
        SELECT *
        FROM constructed_deck_stats
        WHERE
            format = '${format}'
            AND rankBracket = '${rank}'
            AND timePeriod = '${timePeriod}'
            AND deckId = '${deckId}'
    `;
	console.debug('query', query);
	const result = await mysql.query(query);
	mysql.end();

	return {
		statusCode: 200,
		body: result?.[0]?.deckData,
	};
};
