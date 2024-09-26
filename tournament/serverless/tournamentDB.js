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

const ArcherTableName = "TS_Archers";
const TournamentTableName = "TS_Tournaments";

const TournamentSequence = "TS_Tournaments";  // row in AtomicCounters


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
  // @param tournamentId
  // @param groupId: bale or scoring group
  //----------------------------------------
  getArchersByScoringGroup: async function( tournamentId, groupId ) {
    if (!groupId) {
      return await db.getAllRecords( ArcherTableName );
    }
    let args = {
      ':tournamentId': 'tournamentId',
      ':groupId': groupId
    };
    let query = "tournamentId = :tournamentId and scoringGroup = :groupId";

    // this array needs to be sorted by scoringGroupOrder  FIXME
    return await db.getRecordsByQuery( ArcherTableName, query, args );
  },

  //----------------------------------------
  getArcherAllResults: async function( archerName ) {
    let argNames =  { "#name": "name" };
    let filter =  "#name = :name";   // could be "contains( #name )"
    let args = { ":name": archerName };

    return await db.getRecordsByFilter( ArcherTableName, filter, argNames, args );
  },

  // Keys (archer.tournamentId, archer.name) are presumed to be present
  updateArcher: async function( archer ) {
    return await db.saveRecord( ArcherTableName, archer );   // really, overwrite archer
  },
  deleteArcher: async function( tournamentId, archerName ) {
    let keys = {
      "tournamentId": tournamentId,
      "name": archerName
    };
    return await db.deleteRecordByKeys( ArcherTableName, keys );
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
    let filter = "#code = :code AND #date = :date";

    let argNames =  {  // Naming variables avoids reserved words
      "#code": "code",
      "#date": "date"
    };
    let args = {
      ":code": code,
      ":date": date
    };

    let result = await db.getRecordsByFilter( TournamentTableName, filter, argNames, args );
    return result[0];  // should be only one
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

      return await db.getRecordsByFilter( TournamentTableName, filter, argNames, args );
    }
  },

  //----------------------------------------
  // overwrite tournament data
  // if new, go get a unique ID
  //----------------------------------------
  updateTournament: async function( data ) {
    if (!data.id) {
      // run this only once, put this in the catch?
      // await atomicCounter.createSequence( TournamentSequence );

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
