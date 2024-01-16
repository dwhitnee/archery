/*jslint node: true, esversion: 6 */
//----------------------------------------------------------------------
// Internal DynamoDB functions, not the API
// DB Key is generated here from API calls.
//
// No HTTP here, just Dynamo. Therefore most callbacks just return data
// and no HTTP response stuff.

// Explanation of HASH vs RANGE keys (basically PK is "HASH+RANGE")
//   https://stackoverflow.com/questions/27329461/what-is-hash-and-range-primary-key
//
// All functions are async and invoke the callback function when done
// All callback functions are Node-style callback( err, data );
//
// FIXME: would love to make these async await-style calls, until AWS library
// supports this probably wont
//----------------------------------------------------------------------

const ArcherTableName = "Archers";
const ArcherDataTableName = "ArcherData";

let db  = require('dynamoDB');  // All the Dynamo stuff

module.exports = {

  //----------------------------------------
  // wrappers to DB calls
  //----------------------------------------

  //----------------------------------------
  //----------------------------------------
  // ARCHER
  // Get static attribues for indiivdual archer (name, coach, etc)
  //----------------------------------------
  getArcherById: function( id, callback ) {
    return db.getRecordById( ArcherTableName, id, callback );
  },
  getAllArchers: function( callback ) {
    return this.getArchersByCoach( undefined, callback );
  },
  //----------------------------------------
  // Scan for all archers and remove entries that are not this coach
  // NOTE: does not scale - should make a secondary index on coach name
  // @param coach: name
  //----------------------------------------
  getArchersByCoach: function( coach, callback ) {
    if (!coach) {
      return db.getAllRecords( ArcherTableName, callback );
    }

    let filter =  "#coach = :coach";   // could be "contains( #coach )"
    let argNames =  { "#coach": "coach" };  // Is this necessary? why #?
    let args = { ":coach": coach };

    return db.getRecordsByFilter( ArcherTableName, filter, argNames, args, callback );

    // this.getArchers( function( err, data ) {
    //   if (data.Items) {
    //     let archers = data.Items;
    //     for (let i=0; i< archers.length; i++) {
    //       if (!archers[i].coach != coach) {
    //         delete archers[i];
    //       }
    //     }
    //   }
    //   callback( err, data );
    // });
  },

  updateArcher: function( data, callback ) {
    // PK (data.id) is presumed to be present
    return db.saveRecord( ArcherTableName, data, callback );
  },
  deleteArcher: function( id, callback ) {
    return db.deleteRecord( ArcherTableName, id, callback );
  },



  //----------------------------------------
  //----------------------------------------
  // ARCHER_DATA
  // Get training data for indiivdual archers
  //----------------------------------------

  //----------------------------------------
  getArcherDataForYear: function( id, year, callback ) {
    let query = "id = :id and year = :year";
    let args = { ':id': 'id', ':year': year };
    return db.getRecordsByQuery( ArcherDataTableName, query, args, callback );
  },

  //----------------------------------------
  // get all data for the year for everyone
  //----------------------------------------
  getAllArcherDataByYear: function( id, year, callback ) {
    let filter =  "#id = :id, #year = :year";
    let argNames =  { "#id": "id", "#year": "year" };  // Is this necessary? why #?
    let args = { ":id": id,":year": year };

    return db.getRecordsByFilter( ArcherDataTableName, filter, argNames, args, callback );
  },

  getArcherData: function( id, year, callback ) {
    return db.getRecordById( ArcherDataTableName, id, callback );
  },
  updateArcherData: function( data, callback ) {
    // PK (data.id and data.year) is presumed to be present
    return db.saveRecord( ArcherDataTableName, data, callback );
  },
  deleteArcherData: function( id, year, callback ) {
    let keys = {"id": id, "year": year };
    return db.deleteRecordByKeys( ArcherDataTableName, keys, callback );
  },




};
