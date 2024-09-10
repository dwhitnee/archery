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

module.exports = {

  //----------------------------------------
  // wrappers to DB calls
  //----------------------------------------

  //----------------------------------------
  //----------------------------------------
  // ARCHER - tournament results for indivdual archer
  //----------------------------------------

  //----------------------------------------
  getArcherAllResults: async function( name ) {
    let argNames =  { "#name": "name" };
    let filter =  "#name = :name";   // could be "contains( #name )"
    let args = { ":name": name };

    return await db.getRecordsByFilter( ArcherTableName, filter, argNames, args );
  },
  //----------------------------------------
  // Scan for all archers and remove entries that are not this coach
  // NOTE: does not scale - should make a secondary index on coach name
  // @param coach: name
  //----------------------------------------
  getArchersByScoringGroup: async function( tournamentId, groupId ) {
    if (!groupId) {
      return await db.getAllRecords( ArcherTableName );
    }

    let args = { "tournamentId": tournamentId, "groupId": groupId };
    return await db.getRecordByKeys( ArcherTableName, args );
  },

  // Keys (archer.tournamentId, archer.name) are presumed to be present
  updateArcher: async function( archer ) {
    return await db.saveRecord( ArcherTableName, archer );   // really, overwrite archer
  },
  deleteArcher: async function( tournamentId, archerName ) {
    throw new Error("deleting Archer unsupported without PK");
    // return await db.deleteRecord( ArcherTableName, ?? );
  },



  //----------------------------------------
  //----------------------------------------
  // TOURNAMENTS - tournament description
  //----------------------------------------

  //----------------------------------------
  getTournament: async function( id ) {
    let args = { "id": id };
    return await db.getRecordByKeys( TournamentTableName, args );
  },

  //----------------------------------------
  getTournamentByCode: async function( code, date ) {
    let args = { "code": code, "date": date };
    let tournament = await db.getRecordByKeys( TournamentCodesTableName, args );
    if (tournament) {
      return this.getTournamentById( tournament.id );
    }
    console.error("No tournament found for " + code + " on " + date);
    return null;
  },

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

  // update either only the given attribute (datatype), or the whole object
  // OK, update doesn't really work, only save
  updateTournament: async function( data ) {
    // PK (data.id) is presumed to be present
    return await db.saveRecord( TournamentTableName, data ); // really, overwrite
  },
  deleteTournament: async function( id ) {
    let keys = {"id": id };
    return await db.deleteRecordByKeys( TournamentTableName, keys );
  },

};
