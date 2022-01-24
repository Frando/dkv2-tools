const sqlite = require('better-sqlite3')
const parseCSV = require('csv-parse/lib/sync')
const DU = require('date-format-parse')
const debug = require('debug')('dkv2')
const fs = require('fs')

const args = require('minimist')(process.argv.slice(2))

const csvPath = args.i
const dbPath = args.b
const outPath = args.o
if (!csvPath || !dbPath || !outPath) usage()
else main({ csvPath, dbPath, outPath })

function usage () {
  console.log('node bin.js -b <db.dkdb> -i <input.csv> -o <output.dkdb>')
  process.exit(1)
}

function main ({ csvPath, dbPath, outPath }) {
  const buf = fs.readFileSync(csvPath)
  const data = parseCSV(buf)

  const headers = data[0].map(header => header.trim())
	// console.log(headers)
	// process.exit(1)
  const rows = data.slice(1)

  fs.cpSync(dbPath, outPath)
  const db = sqlite(outPath)

  const errors = []
  const skipped = []
  let idx = 0
  for (const row of rows) {
    idx += 1
    try {
      // Ignore empty lines
      if (!row[0]) {
        continue
      }
      const data = parseRow(headers, row)
      if (!data) {
         console.log('skipping row', idx, row[0])
	 skipped.push({ idx, row })
	 continue
      }
      try {
        const res = insertRow(db, data)
        console.log('Inserted row', idx, res)
      } catch (error) {
        console.log('Failed to insert row %s: %s %s', idx, error.message, row[0])
	console.log(error.error)
	console.log(error.row.join('   |    '))
	console.log(error.data)
        errors.push({ idx, error, row, data })
      }
    } catch (err) {
      console.log('Failed to parse row %s: %s %s', err.message, row[0])
      errors.push({ idx, error: err, row })
    }
  }
  for (const error of errors) {
    debug('Error for row %s: %s\n    %s', error.idx, error.error.message, error.row[0])
    debug(error.error)
    debug(error.row.join('   |    '))
    debug(error.data)
  }
  for (const row of skipped) {
	  console.log('Skipped row %s %s', row.idx, row.row[0])
  }
  for (const error of errors) {
    console.log('Error for row %s: %s\n    %s', error.idx, error.error.message, error.row[0])
  }
  console.log('Written: ' + outPath)
}

function parseRow (headers, row) {
  const field = name => row[headers.indexOf(name)].trim()
  const { firstName, lastName } = parseName(field('Name Kreditgeber*In'))
  const address = parseAddress(field('Post-Adresse'))
  let note = ''
  const tel = field('Telefon')
  if (tel) note += 'Telefon: ' + tel + '\n'

  const entry1Date = field('Einzahlung 1 Datum')
  if (!entry1Date) return null
  if (!field('Vertrags-Nr')) return null

  const creditor = {
    id: null,
    Vorname: firstName,
    Nachname: lastName,
    Strasse: address.street + ' ' + address.houseno,
    Plz: address.zip,
    Stadt: address.locality,
    Land: 'Deutschland',
    Email: field('Mail'),
    Anmerkung: note,
    IBAN: null,
    BIC: null,
    Zeitstempel: formatDateStamp(new Date())
  }

  const contract = {
    id: null,
    KreditorId: null,
    Kennung: 'DK-S27-' + field('Vertrags-Nr'),
    Anmerkung: field('Anmerkungen'),
    ZSatz: parsePercent(field('Zinssatz')),
    Betrag: parseNumber(field('Summe')) * 100,
    thesaurierend: parseZinsmodus(field('Zinsen auszahlen?')),
    Vertragsdatum: formatDate(parseDate(field('Vertrag signiert?'))),
    Kfrist: Number(field('Kündigungsfrist').replace(' Monate', '')) || 0,
    AnlagenId: null,
    LaufzeitEnde: formatDate(parseDate(field('Befristet bis'))) || '9999-12-31',
    Zeitstempel: formatDateStamp(new Date())
  }

  const entries = []
  const entry1 = {
    id: null,
    VertragsId: null,
    Datum: formatDate(parseDate(field('Einzahlung 1 Datum'))),
    BuchungsArt: 1,
    Betrag: parseNumber(field('Einzahlung 1 Summe')) * 100,
    Zeitstempel: formatDateStamp(new Date())
  }
  entries.push(entry1)
  const entry2Sum = field('Einzahlung 2 Summe')
  if (entry2Sum) {
	  const entry2 = {
	    id: null,
	    VertragsId: null,
	    Datum: formatDate(parseDate(field('Einzahlung 2 Datum'))),
	    BuchungsArt: 1,
	    Betrag: parseNumber(entry2Sum) * 100,
	    Zeitstempel: formatDateStamp(new Date())
	  }
	  entries.push(entry2)
  }
  return {
    creditor,
    contract,
    entries
  }
}

function insertRow (db, data) {
  const { creditor, contract, entries } = data
  let creditorId
  let stmt, info
  try {
    stmt = db.prepare('INSERT INTO Kreditoren VALUES (@id, @Vorname, @Nachname, @Strasse, @Plz, @Stadt, @Land, @Email, @Anmerkung, @IBAN, @BIC, @Zeitstempel)')
    info = stmt.run(creditor)
    creditorId = info.lastInsertRowid
  } catch (err) {
    stmt = db.prepare('SELECT id from Kreditoren WHERE Vorname = @Vorname AND Nachname = @Nachname AND Strasse = @Strasse AND Stadt = @Stadt')
    info = stmt.get(creditor)
    creditorId = info.id
  }

  contract.KreditorId = creditorId
  contract.zActive = '1'

  // console.log('insert contract', contract)
  stmt = db.prepare('INSERT INTO Vertraege VALUES (@id, @KreditorId, @Kennung, @Anmerkung, @ZSatz, @Betrag, @thesaurierend, @Vertragsdatum, @Kfrist, @AnlagenId, @LaufzeitEnde, @Zeitstempel, @zActive)')
  info = stmt.run(contract)
  const contractId = info.lastInsertRowid

  const entryIds = []
  for (const entry of entries) {
    stmt = db.prepare('INSERT INTO Buchungen VALUES (@id, @VertragsId, @Datum, @BuchungsArt, @Betrag, @Zeitstempel)')
    entry.VertragsId = contractId
    info = stmt.run(entry)
    entryIds.push(info.lastInsertRowid)
  }
  return { creditorId, contractId, entryIds }
}

function parseZinsmodus (string) {
  string = string.trim()
  // (V.thesaurierend = 0, 'Auszahlend',
  // IIF( V.thesaurierend = 1, 'Thesaur.',
  // IIF( V.thesaurierend = 2, 'Fester Zins',
  // IIF( V.thesaurierend = 3, 'Zinslos', 'ERROR')))) AS Zinsmodus
  if (string === 'ja') return 0
  if (string === 'nein') return 1
  return 1
  // throw new Error('Invalid word: ' + string)
}

function formatDate (date) {
  if (!date) return null
  return DU.format(date, 'YYYY-MM-DD')
}

function formatDateStamp (date) {
  return date.toISOString().replace('T', ' ').replace('Z', '').slice(0, -4)
}

function parseNumber (string) {
  string = string.replace('.', '').replace(' ', '').replace('€', '').replace(',', '.')
  return Number(string)
}

function parsePercent (string) {
  string = string.replace(',', '').replace(' ', '').replace('%', '')
  return Number(string)
}

function parseDate (string) {
  if (!string) return null
  const parts = string.split('.')
  let year = Number(parts[2])
  if (year < 100) year = year + 2000
  const date = new Date(year, Number(parts[1]) - 1, Number(parts[0]))
  return date
}

function parseName (string) {
  let parts = string.split(',')
  if (parts.length === 2) {
    return { lastName: parts[0].trim(), firstName: parts[1].trim() }
  }
  parts = string.split(' ')
  if (parts.length === 2) {
    return { lastName: parts[1].trim(), firstName: parts[0].trim() }
  }
  return { lastName: string.trim(), firstName: '' }
}

function parseAddress (string) {
  if (!string || !string.length) return
  //                street     houseno           COMMA plz        loc
  const regex = /^([^\d]+?)\s*(\d+\w*)\s*,\s*(\d+)\s*([\w\säöüAÄÖÜ]+)\s*$/
  const matches = string.match(regex)
  if (!matches) throw new Error('Invalid address string: ' + string)
  const parts = {
    street: matches[1],
    houseno: matches[2],
    zip: matches[3],
    locality: matches[4]
  }
  return parts
}
