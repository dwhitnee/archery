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

const ArcherTableName = "AT_Archers";
const TournamentTableName = "AT_Tournaments";
const TournamentCodesTableName = "AT_TournamentCodes";

const TournamentSequence = "AT_Tournaments";  // row in AtomicCounters


// let db = require('./dynamoDB');  // All the Dynamo stuff
import db from './dynamoDB.js';  // All the Dynamo stuff
import atomicCounter from './atomicCounter.js';  // Sequence generator

module.exports = {

  //----------------------------------------
  // wrappers to DB calls
  //----------------------------------------

  //----------------------------------------
  //----------------------------------------
  // ARCHER - tournament results for indivdual archer
  //----------------------------------------

  //----------------------------------------
  getArcherAllResults: async function( archerName ) {
    let argNames =  { "#name": "name" };
    let filter =  "#name = :name";   // could be "contains( #name )"
    let args = { ":name": archerName };

    return await db.getRecordsByFilter( ArcherTableName, filter, argNames, args );
  },

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
    return await db.getRecordsByQuery( ArcherTableName, query, args );
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
  getTournament: async function( id ) {
    return await db.getRecordById( TournamentTableName, id );
  },

  // //----------------------------------------
  // getTournamentByCode: async function( code, date ) {
  //   let args = { "code": code, "date": date };
  //   let tournament = await db.getRecordByKeys( TournamentCodesTableName, args );
  //   if (tournament) {
  //     return this.getTournamentById( tournament.id );
  //   }
  //   console.error("No tournament found for " + code + " on " + date);
  //   return null;
  // },

  //----------------------------------------
  // get all tournaments after given date. If null, then all tournaments ever
  //----------------------------------------
  getAllTournamentsAfter: async function( date ) {
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
      data.id = atomicCounter.getNextValueInSequence( TournamentSequence );
    }
    return await db.saveRecord( TournamentTableName, data ); // really, overwrite
  },

  deleteTournament: async function( id ) {
    return await db.deleteRecord( TournamentTableName, id );
  },

};
