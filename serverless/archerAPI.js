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

 o getAllArcherDataByYear( year )

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
let thomas = require('thomas');   // Thomas is our private middleware (between HTTP and Node/Dynamo)
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
    archerDB.getArchersByCoach( coach, function( err, records ) {
      message.respond( err, records, callback );
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
    archerDB.getArcher( query.userId, function( err, data ) {
      if (!err) {
        message.respond( err, data, callback );
      }
    });
  },


  //----------------------------------------------------------------------
  // Update all year's data in DB, this stomps existing data,
  //  should there be subcalls?  UpdateArrows? UpdateCoach?
  //
  // @param userId
  // @param year
  // @return nothing
  //----------------------------------------------------------------------
  updateArcher: function( request, context, callback ) {
    if (!message.verifyParam( request, callback, "userId")) {
      return;
    }

    let data = JSON.parse( request.body );

    // Remove spaces/specials from Name (if id is user inputted and not from login)
    data.id = data.userId.replace(/\W/g,'_');

    archerDB.saveRecord( data, function( err, response ) {
      callback( err, response );
    });
  },

  //----------------------------------------------------------------------
  // Wipe data out
  // @param userId
  // @param year
  // @return nothing
  //----------------------------------------------------------------------
  deleteArcher: function( request, context, callback ) {
    if (!message.verifyParam( request, callback, "userId")) {
      return;
    }
    let params = JSON.parse( request.body );
    archerDB.deleteArcher( params.userId, function( err, response ) {
      message.respond( err, response , callback );
    });
  }
};
