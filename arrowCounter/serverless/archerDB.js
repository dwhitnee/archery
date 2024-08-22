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

const ArcherTableName = "Archers";
const ArcherDataTableName = "ArcherData";

let db = require('./dynamoDB');  // All the Dynamo stuff
// import db from './dynamoDB.js';  // All the Dynamo stuff

module.exports = {

  //----------------------------------------
  // wrappers to DB calls
  //----------------------------------------

  //----------------------------------------
  //----------------------------------------
  // ARCHER
  // Get static attribues for indiivdual archer (name, coach, etc)
  //----------------------------------------
  getArcherById: async function( id ) {
    return await db.getRecordById( ArcherTableName, id );
  },
  getAllArchers: async function() {
    return await this.getArchersByCoach( undefined );
  },
  //----------------------------------------
  // Scan for all archers and remove entries that are not this coach
  // NOTE: does not scale - should make a secondary index on coach name
  // @param coach: name
  //----------------------------------------
  getArchersByCoach: async function( coach ) {
    if (!coach) {
      return await db.getAllRecords( ArcherTableName );
    }

    let argNames =  { "#coach": "coach" };
    let filter =  "#coach = :coach";   // could be "contains( #coach )"
    let args = { ":coach": coach };

    return await db.getRecordsByFilter( ArcherTableName, filter, argNames, args );

    // brute force way
    // if (response.Items) {
    //   let archers = response.Items;
    //   for (let i=0; i< archers.length; i++) {
    //     if (!archers[i].coach != coach) {
    //       delete archers[i];
    //     }
    //   }
    // }
  },

  updateArcher: async function( data ) {
    // PK (data.id) is presumed to be present
    return await db.saveRecord( ArcherTableName, data );   // really, overwrite archer
  },
  deleteArcher: async function( id ) {
    return await db.deleteRecord( ArcherTableName, id );
  },



  //----------------------------------------
  //----------------------------------------
  // ARCHER_DATA
  // Get training data for indivdual archers
  //----------------------------------------

  //----------------------------------------
  getArcherDataByArcherAndYear: async function( id, year ) {
    let args = { "id": id, "year": year };
    return await db.getRecordByKeys( ArcherDataTableName, args );
  },

  //----------------------------------------
  // get all data for the year for everyone
  //----------------------------------------
  getAllArcherDataByYear: async function( year ) {
    let argNames =  { "#year": "year" };  // Naming variables avoids reserved words
    let filter = "#year = :year";
    let args = { ":year": year };

    return await db.getRecordsByFilter( ArcherDataTableName, filter, argNames, args );
  },

  // update either only the given attribute (datatype), or the whole object
  // OK, update doesn't really work, only save
  updateArcherData: async function( data, dataType ) {
    // PK (data.id and data.year) is presumed to be present
    if (dataType) {
      return await db.updateRecord( ArcherDataTableName, data, dataType );
    } else {
      return await db.saveRecord( ArcherDataTableName, data ); // really, overwrite
    }
  },
  deleteArcherData: async function( id, year ) {
    let keys = {"id": id, "year": year };
    return await db.deleteRecordByKeys( ArcherDataTableName, keys );
  },

};
