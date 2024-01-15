/*jslint node: true, esversion: 6 */
//----------------------------------------------------------------------
// Weird global layer between HTTP calls, app logic, and DB
// Really just thin layer over DB (private GET/PUT for game data)
//
// Used primarily to hide DB when a DB call is made, some logic must occur, a DB update is made,
//   and an an HTTP response must be constructed
// Not needed for simple DB pass-through calls
//
// I think the original intent here was to wrap calls in Promises with "await", but...
// It does centralize logging, and could potentially hide the DB object if used better.
//
// This could be async/await, but we'll stick to the stupid node convention of
// callback( err, data );
//----------------------------------------------------------------------

// All the Dynamo stuff
let db = require('archerDB');

module.exports = {
  //----------------------------------------------------------------------
  // Async, retrieve a single record from DB and invoke callback
  // This is intended to be called internally
  //----------------------------------------------------------------------
  getRecord: function( id, callback ) {
    db.getRecord( id, function( err, data ) {
      console.log("Retrieved record: " + JSON.stringify( data ));
      callback( err, data );  // forkin node, why not async here?
    });
  },

  //----------------------------------------------------------------------
  // Update record in DB.
  // @param table row data blob
  // @return nothing
  //----------------------------------------------------------------------
  updateRecord: function( data, callback ) {
    console.log("Updating record : " + JSON.stringify( data ));
    db.saveRecord( data, function( err, response ) {
      callback( err, response );  // forkin node, why not async here?
    });
  },

};
