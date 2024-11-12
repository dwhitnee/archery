/*jslint node: true, esversion: 8 */
//----------------------------------------------------------------------
// Internal DynamoDB functions, not the API
// DB Key is generated here from API calls.
//
// No HTTP here, just Dynamo.
// A pretty thin semantic layer to translate from the Archer keys to the DB layer
// Therefore most callbacks just return data and no HTTP response stuff.
// Errors are passed on up to be handled by the HTTP response handler.

// Explanation of HASH vs RANGE keys (basically PK is "HASH+RANGE")
//   https://stackoverflow.com/questions/27329461/what-is-hash-and-range-primary-key
//
// All functions are async/await and might throw an Error for someone else to catch
// No longer using Node-style callback( err, data );
//----------------------------------------------------------------------

const TournamentTableName = "TS_Tournaments";            // PK on id
const TournamentCodeIndex = "tournamentDateCode-index";  // secondary on code+date

const ArcherTableName = "TS_Archers";           // PK on name (+tournament)
const ArcherGroupIndex = "scoringGroup-index";  // secondary index on tournament (+bale)
const ArcherNameIndex = "nameAndTournament-index";  // secondary index on archer name

const LeagueTableName = "TS_Leagues";           // PK on name (+tournament)
const LeagueDateIndex = "date-index";           // secondary index on tournament (+bale)

// row in AtomicCounters
const TournamentSequence = "TS_Tournaments_sequence";
const LeagueSequence = "TS_League_sequence";
const ArcherSequence = "TS_Archer_sequence";


let db = require('./dynamoDB');  // All the Dynamo stuff
let atomicCounter = require('./atomicCounter');  // All the Dynamo stuff

// import db from './dynamoDB.js';  // All the Dynamo stuff
// import atomicCounter from './atomicCounter.js';  // Sequence generator

module.exports = {

  //----------------------------------------
  // wrappers to DB calls
  //----------------------------------------

  //----------------------------------------
  //----------------------------------------
  // ARCHER - tournament results for indivdual archer
  //----------------------------------------

  //----------------------------------------
  // Get archers in a tournament [optional: group]
  // @param tournamentId
  // @param groupId: bale or scoring group
  //----------------------------------------
  getArchersByScoringGroup: async function( tournamentId, groupId ) {

    let query = "tournamentId = :tournamentId";
    let args = {
      ':tournamentId': tournamentId|0,  // ensure numeric
    };

    if (!groupId || groupId=='0') {      // get all archers in tournament
      return await db.getRecordsBySecondaryIndex( ArcherTableName, ArcherGroupIndex, query, args );
    }

    // get just the archers in this group
    query += " and scoringGroup = :groupId";
    args[':groupId'] = groupId;

    let archers =
        await db.getRecordsBySecondaryIndex( ArcherTableName, ArcherGroupIndex, query, args );

    // sorted by position in group
    archers.sort( (a,b) => a.scoringGroupOrder - b.scoringGroupOrder);

    return archers;
  },

  //----------------------------------------
  // One archer's results for all tournaments (TODO: substring?)
  //----------------------------------------
  getArcherAllResults: async function( archerName ) {
    let query =  "#name = :name";
    let argNames =  { "#name": "name" };     // in case "name" is a reserved word
    let args =      { ":name": archerName };

    return await db.getRecordsBySecondaryIndex( ArcherTableName, ArcherNameIndex, query, args);
    // return await db.getRecordsByQuery( ArcherTableName, query, argNames, args );
  },


  // Secondary keys (archer.tournamentId, archer.name) are presumed to be present
  updateArcher: async function( data ) {
    if (!data.id) {
      data.id = await atomicCounter.getNextValueInSequence( ArcherSequence );
      console.log("Next ID: " + data.id );
    }

    return await db.saveRecord( ArcherTableName, data );   // really, overwrite archer
  },

  deleteArcher: async function( id ) {
    return await db.deleteRecord( ArcherTableName, id );
  },


  //----------------------------------------
  //----------------------------------------
  // TOURNAMENTS - tournament description
  //----------------------------------------

  //----------------------------------------
  getTournamentById: async function( id ) {
    return await db.getRecordById( TournamentTableName, id );
  },

  //----------------------------------------
  getTournamentByCodeAndDate: async function( code, date ) {
    let query = "#code = :code AND #date = :date";

    let argNames =  {  // Naming variables avoids reserved words
      "#code": "code",
      "#date": "date"
    };
    let args = {
      ":code": code,
      ":date": date
    };

    let results = await db.getRecordsBySecondaryIndex( TournamentTableName, TournamentCodeIndex,
                                                       query, args, argNames );

    return results[0];  // should be only one
  },

  //----------------------------------------
  // get all tournaments after given date. If null, then all tournaments ever
  //----------------------------------------
  getTournamentsAfterDate: async function( date ) {
    if (!date) {
      return await db.getAllRecords( TournamentTableName );
    } else {
      let argNames =  { "#date": "date" };  // Naming variables avoids reserved words
      let filter = "#date > :date";
      let args = { ":date": date };

      let tournaments = await db.getRecordsByFilterScan( TournamentTableName,
                                                         filter, args, argNames );
      // sorted by reverse date (most recent first)
      tournaments.sort( (a,b) => b.createdDate.localeCompare( a.createdDate ));

      return tournaments;
    }
  },

  //----------------------------------------
  // overwrite tournament data
  // if new, go get a unique ID
  //----------------------------------------
  updateTournament: async function( data ) {
    if (!data.id) {
      data.id = await atomicCounter.getNextValueInSequence( TournamentSequence );
      console.log("Next ID: " + data.id );
    }
    if (!data.code) {
      data.code = this.generateCode( 4 );
    }

    return await db.saveRecord( TournamentTableName, data ); // really, overwrite
  },

  deleteTournament: async function( id ) {
    return await db.deleteRecord( TournamentTableName, id );
  },




  //----------------------------------------
  //----------------------------------------
  // LEAGUES - a collection of tournaments
  //----------------------------------------

  //----------------------------------------
  getLeagueById: async function( id ) {
    return await db.getRecordById( LeagueTableName, id );
  },

  //----------------------------------------
  // get all after given date. If null, then all leagues ever
  //----------------------------------------
  getLeaguesAfterDate: async function( date ) {
    if (!date) {
      return await db.getAllRecords( LeagueTableName );
    } else {
      let argNames =  { "#date": "date" };  // Naming variables avoids reserved words
      let filter = "#date > :date";
      let args = { ":date": date };

      let leagues = await db.getRecordsByFilterScan( LeagueTableName,
                                                     filter, args, argNames );
      // sorted by reverse date (most recent first)
      leagues.sort( (a,b) => b.createdDate.localeCompare( a.createdDate ));

      return leagues;
    }
  },

  //----------------------------------------
  // overwrite
  // if new, go get a unique ID
  //----------------------------------------
  updateLeague: async function( data ) {
    if (!data.id) {
      data.id = await atomicCounter.getNextValueInSequence( LeagueSequence );
    }
    return await db.saveRecord( LeagueTableName, data ); // really, overwrite
  },

  deleteLeague: async function( id ) {
    return await db.deleteRecord( LeagueTableName, id );
  },


  //----------------------------------------
  // Utility routines
  //----------------------------------------

  random: function( max ) { return Math.floor(max * Math.random());  },

  //----------------------------------------
  // Generate random N letter code
  // verify this ID doesn't exist already? TODO
  // This should take place server side to ensure uniqueness
  //----------------------------------------
  generateCode: function( size ) {
    let randomId = "";
    for (let i=0; i < size; i++) {
      randomId += String.fromCharCode(65+this.random(26));
    }
    return randomId;
  },


};
