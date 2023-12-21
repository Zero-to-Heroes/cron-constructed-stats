import { S3Multipart } from '@firestone-hs/aws-lambda-utils';
import { S3 as S3AWS } from 'aws-sdk';
import SecretsManager, { GetSecretValueRequest, GetSecretValueResponse } from 'aws-sdk/clients/secretsmanager';
import { Connection, createPool } from 'mysql';
import { Readable } from 'stream';
import { WORKING_ROWS_FILE } from '../common/config';
import { ConstructedMatchStatDbRow, GameFormat } from '../model';
import { s3 } from './build-constructed-deck-stats';

export const readRowsFromS3 = async (
	format: GameFormat,
	startDate: string,
): Promise<readonly ConstructedMatchStatDbRow[]> => {
	return new Promise<readonly ConstructedMatchStatDbRow[]>((resolve, reject) => {
		const workingRowsFile = `${WORKING_ROWS_FILE.replace('%format%', format).replace('%time%', startDate)}`;
		console.debug('reading rows from s3', workingRowsFile);
		let parseErrors = 0;
		let totalParsed = 0;
		const stream: Readable = s3.readStream('static.zerotoheroes.com', workingRowsFile);
		const result: ConstructedMatchStatDbRow[] = [];
		let previousString = '';
		let emptyRowsInARow = 0;
		stream
			.on('data', (chunk) => {
				const str = Buffer.from(chunk).toString('utf-8');
				const newStr = previousString + str;
				const split = newStr.split('\n');
				const rows: readonly ConstructedMatchStatDbRow[] = split.slice(0, split.length - 1).map((row) => {
					try {
						const result: ConstructedMatchStatDbRow = JSON.parse(row);
						totalParsed++;
						return result;
					} catch (e) {
						// logger.warn('could not parse row', row);
						parseErrors++;
					}
				});
				previousString = split[split.length - 1];
				result.push(...rows);

				// Do this to avoid errors in case the chunks are small compared to the row sizes
				if (result.length === 0 && rows.length === 0) {
					emptyRowsInARow++;
				} else {
					emptyRowsInARow = 0;
				}
				if (emptyRowsInARow > 50) {
					console.error(newStr);
					console.error(split);
					throw new Error('Could not parse any row');
				}
			})
			.on('end', () => {
				const finalResult = result.filter((row) => !!row);
				console.log('stream end', result.length, finalResult.length);
				console.log('parsing errors', parseErrors, 'and successes', totalParsed);
				resolve(finalResult);
			});
	});
};

export const saveRowsOnS3 = async (format: GameFormat, startDate: string, endDate: string) => {
	console.log('will export rows to S3', format);
	const secretRequest: GetSecretValueRequest = {
		SecretId: 'rds-connection',
	};
	const secret: SecretInfo = await getSecret(secretRequest);
	const pool = createPool({
		connectionLimit: 1,
		host: secret.hostReadOnly,
		user: secret.username,
		password: secret.password,
		database: 'replay_summary',
		port: secret.port,
	});

	try {
		await performRowProcessIngPool(pool, format, startDate, endDate);
	} finally {
		pool.end((err) => {
			console.log('ending pool', err);
		});
	}
};

const performRowProcessIngPool = async (pool: any, format: GameFormat, startDate: string, endDate: string) => {
	return new Promise<void>((resolve) => {
		pool.getConnection(async (err, connection) => {
			if (err) {
				console.log('error with connection', err);
				throw new Error('Could not connect to DB');
			} else {
				await performRowsProcessing(connection, format, startDate, endDate);
				connection.release();
			}
			resolve();
		});
	});
};

const performRowsProcessing = async (
	connection: Connection,
	format: GameFormat,
	startDate: string,
	endDate: string,
) => {
	const multipartUpload = new S3Multipart(new S3AWS());
	const workingRowsFile = `${WORKING_ROWS_FILE.replace('%format%', format).replace('%time%', startDate)}`;
	await multipartUpload.initMultipart('static.zerotoheroes.com', workingRowsFile, 'application/json');
	console.log('multipart upload init', workingRowsFile);

	return new Promise<void>((resolve) => {
		const queryStr = `
			SELECT * FROM constructed_match_stats
			WHERE creationDate >= '${startDate}'
			AND creationDate < '${endDate}'
			AND format = '${format}'
		`;
		console.log('running query', queryStr);
		const query = connection.query(queryStr);

		let rowsToProcess = [];
		let rowCount = 0;
		query
			.on('error', (err) => {
				console.error('error while fetching rows', err);
			})
			.on('fields', (fields) => {
				console.log('fields', fields);
			})
			.on('result', async (row: ConstructedMatchStatDbRow) => {
				if (!row?.matchAnalysis?.length) {
					return;
				}

				rowsToProcess.push(row);
				if (rowsToProcess.length > 50000 && !multipartUpload.processing) {
					connection.pause();
					// console.log('before upload', rowsToProcess.length);
					const toUpload = rowsToProcess;
					rowsToProcess = [];
					// console.log('will upload', toUpload.length, 'rows');
					const uploaded = await processRows(toUpload, multipartUpload);
					rowCount += uploaded;
					console.log('processed rows', uploaded, '/', toUpload.length, rowCount);
					connection.resume();
				}
			})
			.on('end', async () => {
				console.log('end');
				const toUpload = rowsToProcess;
				rowsToProcess = [];
				// console.log('will upload', toUpload.length, 'rows');
				const uploaded = await processRows(toUpload, multipartUpload);
				rowCount += uploaded;
				console.log('processed rows', uploaded, rowCount);
				// connection.resume();
				await multipartUpload.completeMultipart();
				resolve();
			});
	});
};

const processRows = async (rows: readonly ConstructedMatchStatDbRow[], multipartUpload: S3Multipart) => {
	const validRows = rows;
	if (validRows.length > 0) {
		// console.log('\t', 'uploading', validRows.length, 'rows');
		await multipartUpload.uploadPart(validRows.map((r) => JSON.stringify(r)).join('\n'));
	}
	return validRows.length;
};

const getSecret = (secretRequest: GetSecretValueRequest) => {
	const secretsManager = new SecretsManager({ region: 'us-west-2' });
	return new Promise<SecretInfo>((resolve) => {
		secretsManager.getSecretValue(secretRequest, (err, data: GetSecretValueResponse) => {
			const secretInfo: SecretInfo = JSON.parse(data.SecretString);
			resolve(secretInfo);
		});
	});
};

interface SecretInfo {
	readonly username: string;
	readonly password: string;
	readonly host: string;
	readonly hostReadOnly: string;
	readonly port: number;
	readonly dbClusterIdentifier: string;
}
