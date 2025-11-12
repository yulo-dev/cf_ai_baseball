/**
 * Seed script to import Lahman Baseball Database into Cloudflare D1
 * Run with: npm run seed
 */

import { readFileSync } from 'fs';
import { join } from 'path';

interface CSVRow {
	[key: string]: string;
}

/**
 * Parse CSV file into array of objects
 */
function parseCSV(filePath: string): CSVRow[] {
	const content = readFileSync(filePath, 'utf-8');
	const lines = content.trim().split('\n');
	const headers = lines[0].split(',').map(h => h.trim());

	return lines.slice(1).map(line => {
		// Simple CSV parser (doesn't handle quoted commas)
		const values = line.split(',').map(v => v.trim());
		const row: CSVRow = {};
		headers.forEach((header, i) => {
			row[header] = values[i] || '';
		});
		return row;
	});
}

/**
 * Generate SQL INSERT statements
 */
function generateInserts(tableName: string, rows: CSVRow[], columns: string[]): string[] {
	const statements: string[] = [];

	for (const row of rows) {
		const values = columns.map(col => {
			const value = row[col];
			// Handle NULL values and proper escaping
			if (!value || value === '') return 'NULL';
			// If it's a number, don't quote it
			if (!isNaN(parseFloat(value)) && isFinite(Number(value))) {
				return value;
			}
			// Escape single quotes for strings
			return `'${value.replace(/'/g, "''")}'`;
		});

		statements.push(
			`INSERT INTO ${tableName} (${columns.join(', ')}) VALUES (${values.join(', ')});`
		);
	}

	return statements;
}

async function main() {
	console.log('🌱 Starting D1 database seeding...\n');

	const dataDir = join(process.cwd(), 'data');

	// Read CSV files
	console.log('📂 Reading CSV files...');
	const peopleData = parseCSV(join(dataDir, 'People.csv'));
	const teamsData = parseCSV(join(dataDir, 'Teams.csv'));
	const pitchingData = parseCSV(join(dataDir, 'Pitching.csv'));

	console.log(`✅ Loaded ${peopleData.length} people`);
	console.log(`✅ Loaded ${teamsData.length} teams`);
	console.log(`✅ Loaded ${pitchingData.length} pitching records\n`);

	// Generate SQL
	console.log('🔨 Generating SQL statements...\n');

	const sql: string[] = [];

	// Drop existing tables
	sql.push('DROP TABLE IF EXISTS pitching;');
	sql.push('DROP TABLE IF EXISTS teams;');
	sql.push('DROP TABLE IF EXISTS people;');
	sql.push('');

	// Create tables
	sql.push(`CREATE TABLE people (
    playerID TEXT PRIMARY KEY,
    nameFirst TEXT,
    nameLast TEXT
);`);
	sql.push('');

	sql.push(`CREATE TABLE teams (
    yearID INTEGER,
    lgID TEXT,
    teamID TEXT,
    franchID TEXT,
    divID TEXT,
    name TEXT,
    G INTEGER,
    W INTEGER,
    L INTEGER,
    PRIMARY KEY (yearID, teamID)
);`);
	sql.push('');

	sql.push(`CREATE TABLE pitching (
    playerID TEXT,
    yearID INTEGER,
	stint INTEGER,
    teamID TEXT,
    lgID TEXT,
    W INTEGER,
    L INTEGER,
    G INTEGER,
    GS INTEGER,
    SV INTEGER,
    IPouts INTEGER,
    H INTEGER,
    ER INTEGER,
    HR INTEGER,
    BB INTEGER,
    SO INTEGER,
    ERA REAL,
	PRIMARY KEY (playerID, yearID, teamID, stint),
    FOREIGN KEY (playerID) REFERENCES people(playerID)
);`);
	sql.push('');

	// Insert data
	console.log('📝 Generating INSERT statements...');

	// People inserts
	sql.push('-- Insert people');
	const peopleInserts = generateInserts('people', peopleData, [
		'playerID',
		'nameFirst',
		'nameLast',
	]);
	sql.push(...peopleInserts);
	sql.push('');

	// Teams inserts
	sql.push('-- Insert teams');
	const teamsInserts = generateInserts('teams', teamsData, [
		'yearID',
		'lgID',
		'teamID',
		'franchID',
		'divID',
		'name',
		'G',
		'W',
		'L',
	]);
	sql.push(...teamsInserts);
	sql.push('');

	// Pitching inserts
	sql.push('-- Insert pitching');
	const pitchingInserts = generateInserts('pitching', pitchingData, [
		'playerID',
		'yearID',
		'stint',
		'teamID',
		'lgID',
		'W',
		'L',
		'G',
		'GS',
		'SV',
		'IPouts',
		'H',
		'ER',
		'HR',
		'BB',
		'SO',
		'ERA',
	]);
	sql.push(...pitchingInserts);

	// Write to file
	const outputPath = join(process.cwd(), 'seed.sql');
	const fs = await import('fs');
	fs.writeFileSync(outputPath, sql.join('\n'), 'utf-8');

	console.log(`\n✅ SQL file generated: ${outputPath}`);
	console.log(`\n📋 Next steps:`);
	console.log(`   1. Create D1 database: npx wrangler d1 create lahman_ai`);
	console.log(`   2. Update wrangler.toml with the database_id`);
	console.log(`   3. Run migrations: npx wrangler d1 execute lahman_ai --file=seed.sql --remote`);
	console.log(`\n🚀 Or run locally: npx wrangler d1 execute lahman_ai --file=seed.sql --local\n`);
}

main().catch(console.error);
