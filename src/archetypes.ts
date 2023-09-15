import serverlessMysql from 'serverless-mysql';

export const loadArchetypes = async (mysql: serverlessMysql.ServerlessMysql): Promise<readonly Archetype[]> => {
	const query = `
		SELECT * FROM constructed_archetypes
	`;
	const rows: readonly Archetype[] = await mysql.query(query);
	return rows.map((r) => ({
		id: r.id,
		archetype: r.archetype,
	}));
};

export interface Archetype {
	readonly id: number;
	readonly archetype: string;
}
