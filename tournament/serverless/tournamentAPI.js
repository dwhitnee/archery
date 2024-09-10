/*jslint node: true, esversion: 8 */
//----------------------------------------
//  AWS Lambda Functions to be uploaded.  These are the public API.
//
//  There are two functions for each lambda call:
//    the (public) http GET/POST wrapper, and the call to the DB layer
//  All code related to HTTP requests stays here.
//
/*
  Two main objects Tournament and Archer (in tournament)

  o getTournament( code, date )  // map "XYZA" to 42069
  o getTournament( id )
  o getAllTournaments()       // admin only?
  o getAllTournamentsAfter( date )
  o updateTournament( id )
  o deleteTournament( id )

  o getArcherAllResults( name )             // all of "Brandy Allison"s scores
  o getArchers( tournamentId, [groupId] )   // All archers on a scoring bale or in a tournament
  o updateArcher( tournamentId, archerId )
  o deleteArcher( tournamentId, archerId )  // no PK so can't delete...easily

  // not needed
  o getArcher( tournamentId, archerId )   // No need

  == Data Model ==

_Tournament_
{
  "id",    PK
  "date",
  "description",
  "type" { desc, ends, arrows, rounds }
}

_Archer_
{
  "tournamentId      // HK

  "scoringGroup"      // RK   bale #, could represent several bales
  "scoringGroupOrder" // (1-4) priority of archers in group

  "name"             // GSI secondary HK for stats?
  "bow" "FSLR",
  "ageGender"        // AM, SF, YF, ...
  "ends"             // [["9","9","9"], ["X","8","7",.]
}

*/
//----------------------------------------------------------------------
// Async calls, retrieve records from DB and invoke callback
//----------------------------------------

'use strict';

// import * as archerDB  from './tournamentDB.js';  // All the Dynamo stuff
// import * as message from './responseHandler.js';  // HTTP message handling

let archerDB = require('./tournamentDB');  // All the Dynamo stuff
let message = require('./responseHandler');  // HTTP message handling


//----------------------------------------
// The DB calls (without the GET/POST and callback BS)
//----------------------------------------
let db = {

  //----------------------------------------------------------------------
  // All archers for given coach [optional]
  // @param: coach - optional
  //----------------------------------------------------------------------
  getArchers: async function( request ) {
    let query = request.queryStringParameters;
    let coach = query ? query.coach : undefined;
    return await archerDB.getArchersByCoach( coach );
  },

  //----------------------------------------------------------------------
  // Get basic attributes for an archer
  // @param: userId
  //----------------------------------------------------------------------
  getArcher: async function( request ) {
    message.verifyParam( request, "userId");  // throws on error

    let query = request.queryStringParameters;
    let userId = query.userId;
    userId = userId.replace(/\W/g,'_');    // sanitize ID

    return await archerDB.getArcherById( userId );
  },

  //----------------------------------------------------------------------
  // Update all year's data in DB, this stomps existing data,
  //  should there be subcalls?  UpdateArrows? UpdateCoach?
  //
  // @param all data for archer in request.body
  // @return saved value
  //----------------------------------------------------------------------
  updateArcher: async function( request ) {
    let data = JSON.parse( request.body );

    // Remove spaces/specials from Name (if id is user inputted and not from login)
    // we need to munger on getAecher as well.
    data.id = data.id.replace(/\W/g,'_');       // sanitize ID

    return await archerDB.updateArcher( data );
  },

  //----------------------------------------------------------------------
  // Wipe archer out (delete data, too?)
  // @param userId
  // @return nothing
  //----------------------------------------------------------------------
  deleteArcher: async function( request ) {
    message.verifyParam( request, "userId");

    let params = JSON.parse( request.body );
    return await archerDB.deleteArcher( params.userId );
  },

  //----------------------------------------------------------------------
  // Get array of activites for an archer's year
  // @param: userId
  //----------------------------------------------------------------------
  getArcherData: async function( request ) {
    let query = request.queryStringParameters;

    message.verifyParam( request, "userId");
    message.verifyParam( request, "year");

    return await archerDB.getArcherDataByArcherAndYear( query.userId, query.year );
  },

  //----------------------------------------------------------------------
  // Get array of activites for an archer's year
  // @param: userId
  //----------------------------------------------------------------------
  getAllArchersData: async function( request ) {
    let query = request.queryStringParameters;
    message.verifyParam( request, "year");
    return await archerDB.getAllArcherDataByYear( query.year );
  },

  //----------------------------------------------------------------------
  // Pass in ALL data
  // This would include version, "arrows" (say), and return version at least (updatedDate?)
  // Maybe it's best to pass the whole kit and kaboodle, or make a new table for all the other
  // random crap? ArcherArrows, ArcherScores, ArcherWorkouts. Or make ArcherData *everything*
  // I think it's smarter to send in the whole blob (because versioning)
  // OR load existing blob, merge the two, ick
  // Is the worry that one bad update could destroy everything? Does it matter, once damage done?
  // more important when multiple users, but not so much with a single user.
  //
  //
  // Update all year's data in DB, this stomps existing data of this type.
  /* {
       id: David1234,
       year: 2024,
       data: { arrows: [...], scores: [....]
     }
*/
  // @param data blob with DB keys and data type (key) to save
  // @return savedValue
  //----------------------------------------------------------------------
  updateArcher: async function( request ) {
    message.verifyParam( request, "userId");
    message.verifyParam( request, "year");
    message.verifyParam( request, "data");
    // message.verifyParam( request, "dataType");

    let input = JSON.parse( request.body );

    // parse request into a storable data blob
    let data = input.data;
    data.id = input.userId;
    data.year = ""+input.year;

    return await archerDB.updateArcherData( data );
  },

  //----------------------------------------------------------------------
  // Wipe all year's data out (should there be a way to wipe just one data type?)
  // @param userId
  // @param year
  // @return nothing
  //----------------------------------------------------------------------
  deleteArcherData: async function( request ) {
    message.verifyParam( request, "userId");
    message.verifyParam( request, "year");

    let params = JSON.parse( request.body );
    return await archerDB.deleteArcherData( params.userId, params.year );
  }
};



module.exports = {
  //----------------------------------------
  // API server functions go here
  // function names must be placed in serverless.yml to get wired up
  //----------------------------------------
  // HTTP GET/POST wrappers (to put in Lambda)
  // The real async DB calls are in the "db" object

  //----------------------------------------
  // @param request -  info about the call (URL params, caller, etc)
  // @param context -  info about AWS (generally uninteresting)
  // @param callback - function to invoke when we are done
  //----------------------------------------

  //----------------------------------------
  //  Archers
  //----------------------------------------
  getArchers: function( request, context, callback ) {
    console.log("Hello! " +  message );
    message.runFunctionAndRespond( request, callback, async function() {
      return await db.getArchers( request ); });
  },

  getArcher: function( request, context, callback ) {
    message.runFunctionAndRespond( request, callback, async function() {
      return await db.getArcher( request ); });
  },

  updateArcher: function( request, context, callback ) {
    message.runFunctionAndRespond( request, callback, async function() {
      return await db.updateArcher( request ); });
  },

  deleteArcher: function( request, context, callback ) {
    message.runFunctionAndRespond( request, callback, async function() {
      return await db.deleteArcher( request ); });
  },

  //----------------------------------------
  //  ArcherData
  //----------------------------------------
  getArcherData: function( request, context, callback ) {
    message.runFunctionAndRespond( request, callback, async function() {
      return await db.getArcherData( request ); });
  },

  getAllArchersData: function( request, context, callback ) {
    message.runFunctionAndRespond( request, callback, async function() {
      return await db.getAllArchersData( request ); });
  },

  updateArcherData: function( request, context, callback ) {
    message.runFunctionAndRespond( request, callback, async function() {
      return await db.updateArcherData( request ); });
  },

  deleteArcherData: function( request, context, callback ) {
    message.runFunctionAndRespond( request, callback, async function() {
      return await db.deleteArcherData( request ); });
  }

};
