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

  o getLeague( id )
  o getAllLeagues()       // admin only?
  o updateLeague( id )
  o deleteLeague( id )

  o getArcherAllResults( name )         // all of "Brandy Allison"s scores
  o getArchers( turnmtId, [groupId] )   // All archers on a scoring bale or in a tournament
  o getArchers( leagueId )       // All archer records in any tournament in this league
  o getArchers( regionId )       // All archer records in any tournament in this region
  o updateArcher( tournamentId, archerId )
  o deleteArcher( tournamentId, archerId )  // no PK so can't delete...easily

  o getAllRegionsAndVenues()

  // not needed
  o getArcher( tournamentId, archerId )   // No need

  == Data Model ==

_Tournament_
{
  "id",    PK
  "date",  //  index HK
  "code",  //  index RK   "XYZQ"
  "description",
  "type" { desc, ends, arrows, rounds }
}

_League_
{
  "id",    PK
  "endDate",  //  index HK?
  "description",
  "maxTournamentDays"
}

_Archer_   ( PK name+tournament, query on tournament[+bale] )
{
  "tournamentId       // RK1, HK2

  "scoringGroup"      // RK2   bale #, could represent several bales
  "scoringGroupOrder" // (1-4) priority of archers in group

  "name"             // Hash Key 1 for stats for all tournaments
  "bow" "FSLR",
  "ageGender"        // AM, SF, YF, ...
  "ends"             // [["9","9","9"], ["X","8","7",.]
}

_Region_
   "id"        // PK
   "name"

_Venue_
   "id"         // PK/HK
   "regionId"   // RK
   "name"

*/
//----------------------------------------------------------------------
// Async calls, retrieve records from DB and invoke callback
//----------------------------------------

'use strict';

// import * as archerDB  from './tournamentDB.js';  // All the Dynamo stuff
// import * as message from './responseHandler.js';  // HTTP message handling

let tournamentDB = require('./tournamentDB');  // All the Dynamo stuff
let message = require('./responseHandler');  // HTTP message handling


//----------------------------------------
// The DB calls (without the GET/POST and callback BS)
//----------------------------------------
let db = {

  //----------------------------------------------------------------------
  // All archer scoring data in tournament or league
  // @param: tournamentId
  // @param: groupId - scoring bale [optional]
  // or
  // @param: regionId - all archers in a State, say (for auto-complete)
  // or
  // @param: leagueId - league of tournaments with archers to combine
  //----------------------------------------------------------------------
  getArchers: async function( request ) {
    let query = request.queryStringParameters;

    if (query.leagueId) {
      return await tournamentDB.getArchersByLeague( query.leagueId );
    } else if (query.regionId) {
      return await tournamentDB.getArchersByRegion( query.regionId );
    } else {
      message.verifyParam( request, "tournamentId");  // throws on error
      message.verifyParam( request, "groupId");

      return await tournamentDB.getArchersByScoringGroup( query.tournamentId, query.groupId );
    }
  },

  //----------------------------------------------------------------------
  // Get results for an archer in all tournaments they participated in
  // @param: archerName
  //----------------------------------------------------------------------
  getArcherAllResults: async function( request ) {
    message.verifyParam( request, "name");  // throws on error

    let query = request.queryStringParameters;
    return await tournamentDB.getArcherAllResults( query.name );
  },

  //----------------------------------------------------------------------
  // Update scores for one archer
  //
  // @param all data for archer in request.body
  // @return saved value
  //----------------------------------------------------------------------
  updateArcher: async function( request ) {
    let data = JSON.parse( request.body );
    return await tournamentDB.updateArcher( data );
  },

  //----------------------------------------------------------------------
  // Remove archer from tournament
  // @param id
  // @return nothing
  //----------------------------------------------------------------------
  deleteArcher: async function( request ) {
    message.verifyParam( request, "id");

    let params = JSON.parse( request.body );
    return await tournamentDB.deleteArcher( params.id );
  },


  //----------------------------------------------------------------------
  // Metadata for a tournament. Query by unique ID or by 4 letter code + date
  //  code+date could be considered unique, but that's not certain
  //
  // @param: id - tournament ID
  //  OR
  // @param: code - random 4 letter identifier
  // @param: date - of tournament (so code does not beed to be univerally unique)
  //----------------------------------------------------------------------
  getTournament: async function( request ) {
    let query = request.queryStringParameters;

    if (query.id) {
      return await tournamentDB.getTournamentById( query.id | 0 );  // id is numeric, not str
    } else {
      message.verifyParam( request, "code");
      message.verifyParam( request, "date");
      return await tournamentDB.getTournamentByCodeAndDate( query.code, query.date );
    }
  },

  //----------------------------------------------------------------------
  // Get all tournaments since given date ("2024-01-01")
  // @param: date
  // @param: regionId
  // @param: venueId [optional]
  //----------------------------------------------------------------------
  getTournaments: async function( request ) {
    let query = request.queryStringParameters;
    message.verifyParam( request, "date");
    message.verifyParam( request, "regionId");
    return await tournamentDB.getTournamentsAfterDate( query.date,
                                                       query.regionId, query.venueId );
  },

  //----------------------------------------------------------------------
  // Pass in all data about tournament, but ID and Code might not yet exist
  // if this is creation call
  //
  // @param tournament blob
  // @return savedValue
  //----------------------------------------------------------------------
  updateTournament: async function( request ) {
    let data = JSON.parse( request.body );
    return await tournamentDB.updateTournament( data );
  },

  //----------------------------------------------------------------------
  // Wipe tournament
  // @param id
  // @return nothing
  //----------------------------------------------------------------------
  deleteTournament: async function( request ) {
    message.verifyParam( request, "id");

    let params = JSON.parse( request.body );
    return await tournamentDB.deleteTournament( params.id );
  },

  //----------------------------------------------------------------------
  // League description
  // @param: id - tournament ID
  //----------------------------------------------------------------------
  getLeague: async function( request ) {
    message.verifyParam( request, "id");
    let query = request.queryStringParameters;
    return await tournamentDB.getLeagueById( query.id | 0 );  // id is numeric, not str
  },

  //----------------------------------------------------------------------
  // Get all leagues since given date ("2024-01-01")
  // Get all recent leagues? Unexpired leagues  FIXME
  // @param: date
  // @param: regionId
  // @param: venueId [optional]
  //----------------------------------------------------------------------
  getLeagues: async function( request ) {
    let query = request.queryStringParameters;
    message.verifyParam( request, "date");
    message.verifyParam( request, "regionId");
    return await tournamentDB.getLeaguesAfterDate( query.date,
                                                   query.regionId, query.venueId );
  },

  //----------------------------------------------------------------------
  // @param league data blob
  // @return savedValue
  //----------------------------------------------------------------------
  updateLeague: async function( request ) {
    let data = JSON.parse( request.body );
    return await tournamentDB.updateLeague( data );
  },

  //----------------------------------------------------------------------
  // Wipe object
  // @param id
  // @return nothing
  //----------------------------------------------------------------------
  deleteLeague: async function( request ) {
    message.verifyParam( request, "id");
    let params = JSON.parse( request.body );
    return await tournamentDB.deleteLeague( params.id );
  },


  //----------------------------------------------------------------------
  // Get all regions and venues therein (two DB calls?)
  //----------------------------------------------------------------------
  getRegionsAndVenues: async function( request ) {
    return await tournamentDB.getRegionsAndVenues();
  },

  //----------------------------------------------------------------------
  // @param region data blob
  // @return savedValue
  //----------------------------------------------------------------------
  updateRegion: async function( request ) {
    let data = JSON.parse( request.body );
    return await tournamentDB.updateRegion( data );
  },

  //----------------------------------------------------------------------
  // @param venue data blob
  // @return savedValue
  //----------------------------------------------------------------------
  updateVenue: async function( request ) {
    let data = JSON.parse( request.body );
    return await tournamentDB.updateVenue( data );
  },

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
    message.runFunctionAndRespond( request, callback, async function() {
      return await db.getArchers( request ); });
  },

  getArcherAllResults: function( request, context, callback ) {
    message.runFunctionAndRespond( request, callback, async function() {
      return await db.getArcherAllResults( request ); });
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
  //  Tournament
  //----------------------------------------
  getTournament: function( request, context, callback ) {
    message.runFunctionAndRespond( request, callback, async function() {
      return await db.getTournament( request ); });
  },

  getTournaments: function( request, context, callback ) {
    message.runFunctionAndRespond( request, callback, async function() {
      return await db.getTournaments( request ); });
  },

  updateTournament: function( request, context, callback ) {
    message.runFunctionAndRespond( request, callback, async function() {
      return await db.updateTournament( request ); });
  },

  deleteTournament: function( request, context, callback ) {
    message.runFunctionAndRespond( request, callback, async function() {
      return await db.deleteTournament( request ); });
  },

  //----------------------------------------
  //  League
  //----------------------------------------
  getLeague: function( request, context, callback ) {
    message.runFunctionAndRespond( request, callback, async function() {
      return await db.getLeague( request ); });
  },

  getLeagues: function( request, context, callback ) {
    message.runFunctionAndRespond( request, callback, async function() {
      return await db.getLeagues( request ); });
  },

  updateLeague: function( request, context, callback ) {
    message.runFunctionAndRespond( request, callback, async function() {
      return await db.updateLeague( request ); });
  },

  deleteLeague: function( request, context, callback ) {
    message.runFunctionAndRespond( request, callback, async function() {
      return await db.deleteLeague( request ); });
  },

  //----------------------------------------
  //  Region/Venue
  //----------------------------------------
  getRegionsAndVenues: function( request, context, callback ) {
    message.runFunctionAndRespond( request, callback, async function() {
      return await db.getRegionsAndVenues( request ); });
  },

  updateRegion: function( request, context, callback ) {
    message.runFunctionAndRespond( request, callback, async function() {
      return await db.updateRegion( request ); });
  },

  updateVenue: function( request, context, callback ) {
    message.runFunctionAndRespond( request, callback, async function() {
      return await db.updateVenue( request ); });
  },


};
