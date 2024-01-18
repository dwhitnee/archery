/*jslint node: true, esversion: 6 */
//----------------------------------------
//  AWS Lambda Functions to be uploaded.  These are the public API.
//  All code related to HTTP requests here.
//
/*
 o getArcher( id )
 o getArchers( [coach] )
 o updateArcher( id, [coach] )
 o deleteArcher( id )

 o getAllArcherDataByYear( year ) (ex: get everyone's arrow counts)

 o getArcherData( id, [year] )
 o updateArcherData( id, year )
 o deleteArcherData( id, year )

{
  "id",    PK
  "year",  RK
  "arrows" : [365],
  "exercises" : [365],
  "spts":  [365],
  "mental":  [365],
}

*/
// Async calls, retrieve records from DB and invoke callback
//----------------------------------------

'use strict';

let archerDB = require('archerDB');  // All the Dynamo stuff
let message = require('responseHandler');  // HTTP message handling

//----------------------------------------
//----------------------------------------
// API server functions go here
// function names must be placed in serverless.yml to get wired up
//----------------------------------------
//----------------------------------------

module.exports = {
  //----------------------------------------
  // @param request -  info about the call (URL params, caller, etc)
  // @param context -  info about AWS (generally uninteresting)
  // @param callback - function to invoke when we are done
  //----------------------------------------

  //----------------------------------------------------------------------
  // All archers for given coach [optional]
  // @param: coach - optional
  //----------------------------------------------------------------------
  getArchers: function( request, context, callback ) {
    let query = request.queryStringParameters;

    let coach = query ? query.coach : undefined;
    archerDB.getArchersByCoach( coach, function( err, data ) {
      message.respond( err, data, callback );
    });
  },


  //----------------------------------------------------------------------
  // Get basic attributes for an archer
  // @param: userId
  //----------------------------------------------------------------------
  getArcher: function( request, context, callback ) {
    let query = request.queryStringParameters;

    if (!message.verifyParam( request, callback, "userId")) {
      return;
    }
    archerDB.getArcherById( query.userId, function( err, data ) {
      message.respond( err, data, callback );
    });
  },


  //----------------------------------------------------------------------
  // Update all year's data in DB, this stomps existing data,
  //  should there be subcalls?  UpdateArrows? UpdateCoach?
  //
  // @param all data for archer in request.body
  // @return saved value
  //----------------------------------------------------------------------
  updateArcher: function( request, context, callback ) {
    let data = JSON.parse( request.body );

    // sanitize ID
    // Remove spaces/specials from Name (if id is user inputted and not from login)
    data.id = data.id.replace(/\W/g,'_');

    archerDB.updateArcher( data, function( err, data ) {
      message.respond( err, data, callback );
    });
  },

  //----------------------------------------------------------------------
  // Wipe archer out (delete data, too?)
  // @param userId
  // @return nothing
  //----------------------------------------------------------------------
  deleteArcher: function( request, context, callback ) {
    if (!message.verifyParam( request, callback, "userId")) {
      return;
    }
    let params = JSON.parse( request.body );
    archerDB.deleteArcher( params.userId, function( err, data ) {
      message.respond( err, data, callback );
    });
  },


  //----------------------------------------------------------------------
  // Get array of activites for an archer's year
  // @param: userId
  //----------------------------------------------------------------------
  getArcherData: function( request, context, callback ) {
    let query = request.queryStringParameters;

    if (!message.verifyParam( request, callback, "userId") ||
        !message.verifyParam( request, callback, "year")) {
      return;
    }
    archerDB.getArcherDataByArcherAndYear( query.userId, query.year, function( err, data ) {
      message.respond( err, data, callback );
    });
  },

    //----------------------------------------------------------------------
  // Get array of activites for an archer's year
  // @param: userId
  //----------------------------------------------------------------------
  getAllArchersData: function( request, context, callback ) {
    let query = request.queryStringParameters;

    if (!message.verifyParam( request, callback, "year")) {
      return;
    }
    archerDB.getAllArcherDataByYear( query.year, function( err, data ) {
      message.respond( err, data, callback );
    });
  },


  //----------------------------------------------------------------------
  // Update all year's data in DB, this stomps existing data of this type.
  // ex: where dataType = "arrows"
  /* {
       id: David1234,
       year: 2024,
       "arrows": [..data..]
     }
*/
  // @param data blob with DB keys and data type (key) to save
  // @return savedValue
  //----------------------------------------------------------------------
  updateArcherData: function( request, context, callback ) {
    if (!message.verifyParam( request, callback, "userId") ||
        !message.verifyParam( request, callback, "year") ||
        !message.verifyParam( request, callback, "data") ||
        !message.verifyParam( request, callback, "dataType")) {
      return;
    }

    let input = JSON.parse( request.body );

    // parse request into a storable data blob
    let data = {};
    data.id = input.userId;
    data.year = ""+input.year;
    data[input.dataType] = input.data;

    archerDB.updateArcherData( data, function( err, data ) {
      message.respond( err, data, callback );
    });
  },


  //----------------------------------------------------------------------
  // Wipe all year's data out (should there be a way to wipe just one data type?)
  // @param userId
  // @param year
  // @return nothing
  //----------------------------------------------------------------------
  deleteArcherData: function( request, context, callback ) {
    if (!message.verifyParam( request, callback, "userId") ||
        !message.verifyParam( request, callback, "year")) {
      return;
    }

    let params = JSON.parse( request.body );
    archerDB.deleteArcherData( params.userId, params.year, function( err, data ) {
      message.respond( err, data, callback );
    });
  }
};
