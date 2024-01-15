//----------------------------------------
//  AWS Lambda Functions to be uploaded.  These are the public API.
//  All code related to HTTP requests here.
//
// TODO: uodateArcher, updateArrows, updateWorkout
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
  // All records for all archers for given year
  // @param: year
  //----------------------------------------------------------------------
  getArchersByYear: function( request, context, callback ) {
    let query = request.queryStringParameters;

    if (!message.verifyParam( request, callback, "year")) {
      return;
    }

    archerDB.getArchersByYear( query.year, function( err, records ) {
      message.respond( err, records, callback );
    });
  },


  //----------------------------------------------------------------------
  // Get data for an archer, all years unless specified
  //
  // @param: userId
  // @param: year (optional) to limit results
  //----------------------------------------------------------------------
  getArcher: function( request, context, callback ) {
    let query = request.queryStringParameters;

    if (!message.verifyParam( request, callback, "userId")) {
        // || !message.verifyParam( request, callback, "year")) {
      return;
    }

    archerDB.getArcher( query.userId, query.year, function( err, data ) {
      if (!err) {
        message.respond( err, data, callback );
      }
    });
  },

  //----------------------------------------------------------------------
  // Create new year's data blob
  // @param userId
  // @param year
  // @return newly created record id (user + year)
  //----------------------------------------------------------------------
  createNewArcherYear: function( request, context, callback ) {
    if (!message.verifyParam( request, callback, "userId") ||
        !message.verifyParam( request, callback, "year")) {
      return;
    }

    let postData = JSON.parse( request.body );

    // This key must agree with code in archerDB (should it go there instead?)

    // Id is name (w/o spaces/specials) plus year of data (new record for each year)
    let newId = postData.userId.replace(/\W/g,'_')+ ":" + postData.year;

    // main data structure
    let newRecord = {

      // fixed data
      id: newId,                            // PK
      createdDate: (new Date()).toISOString(),  // Range Key

      // round data
      userId: postData.userId,
      year: postData.year,
      coach: postData.coach,
      arrows: [],
    };

    // Tell DB to put the data, respond to AWS call here.
    archerDB.saveRecord( newRecord, function( err, data ) {
      let response = {
        id: newId
      };
      message.respond( err, response, callback );
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
  updateArcherYear: function( request, context, callback ) {
    if (!message.verifyParam( request, callback, "userId") ||
        !message.verifyParam( request, callback, "year")) {
      return;
    }

    let data = JSON.parse( request.body );
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
  deleteArcherYear: function( request, context, callback ) {
    if (!message.verifyParam( request, callback, "userId") ||
        !message.verifyParam( request, callback, "year")) {
      return;
    }
    let params = JSON.parse( request.body );

    // Tell DB to put the data, respond to AWS call here.
    archerDB.deleteArcherYear( params.userId, params.year, function( err, response ) {
      message.respond( err, response , callback );
    });
  }
};
