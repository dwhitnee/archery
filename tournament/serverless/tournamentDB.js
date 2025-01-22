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

const TournamentTableName = "TS_Tournaments";            // PK on id
const TournamentCodeIndex = "tournamentDateCode-index";  // secondary on code+date
// const TournamentLeagueIndex = "tournamentLeague-index";  // secondary on leagueId

const ArcherTableName = "TS_Archers";           // PK on name (+tournament)
const ArcherGroupIndex = "scoringGroup-index";  // secondary index on tournament (+bale)
const ArcherNameIndex = "nameAndTournament-index";  // secondary index on archer name
const ArcherLeagueIndex = "league-index";       // secondary index on league (standings)
const ArcherRegionIndex = "region-index";       // secondary index on region (auto-compl)

const LeagueTableName = "TS_Leagues";           // PK on name (+tournament)
const LeagueDateIndex = "date-index";           // secondary index on tournament (+bale)

const RegionTableName = "TS_Regions";     // id PK
const VenueTableName  = "TS_Venues";      // id PK

// row in AtomicCounters
const TournamentSequence = "TS_Tournaments_sequence";
const LeagueSequence = "TS_League_sequence";
const ArcherSequence = "TS_Archer_sequence";
const RegionSequence = "TS_Region_sequence";
const VenueSequence  = "TS_Venue_sequence";


//Index on Tournament/League doesn't help becuase we are full table scanning on date anyway
// const LeagueRegionIndex = "region-index";       // secondary index on region (list)
// const TournamentRegionIndex = "region-index";   // secondary index on region (list)
// const LeagueVenueIndex = "venue-index";       // secondary index on venue (why? list?)
// const TournamentVenueIndex = "venue-index";   // secondary index on venue (why? list?)




let db = require('./dynamoDB');  // All the Dynamo stuff
let atomicCounter = require('./atomicCounter');  // All the Dynamo stuff

// import db from './dynamoDB.js';  // All the Dynamo stuff
// import atomicCounter from './atomicCounter.js';  // Sequence generator

module.exports = {

  //----------------------------------------
  // wrappers to DB calls
  //----------------------------------------

  //----------------------------------------
  //----------------------------------------
  // ARCHER - tournament results for indivdual archer
  //----------------------------------------

  //----------------------------------------
  // Get archers in a tournament [optional: group]
  // @param tournamentId
  // @param groupId: bale or scoring group [optional]
  //----------------------------------------
  getArchersByScoringGroup: async function( tournamentId, groupId ) {

    let query = "tournamentId = :tournamentId";
    let args = {
      ':tournamentId': tournamentId|0,  // ensure numeric
    };

    if (!groupId || groupId=='0') {      // get all archers in tournament
      return await db.getRecordsBySecondaryIndex( ArcherTableName, ArcherGroupIndex, query, args );
    }

    // get just the archers in this group
    query += " and scoringGroup = :groupId";
    args[':groupId'] = groupId;

    let archers =
        await db.getRecordsBySecondaryIndex( ArcherTableName, ArcherGroupIndex, query, args );

    // sorted by position in group
    archers.sort( (a,b) => a.scoringGroupOrder - b.scoringGroupOrder);

    return archers;
  },

  //----------------------------------------
  // Get archer scoring records in all tournaments in a league.
  // Sorted by tournament creation ascending
  //
  // @param leagueId
  //----------------------------------------
  getArchersByLeague: async function( leagueId ) {
    let query = "leagueId = :leagueId";
    let args = {
      ':leagueId': leagueId|0,  // ensure numeric
    };

    let archers = await db.getRecordsBySecondaryIndex(
      ArcherTableName, ArcherLeagueIndex, query, args );

    // sort by tournamentId ascending (assures right order of results because
    // tournament createdDate is what we care about, not Archer createdDate)
    archers.sort( (a,b) => a.tournamentId - b.tournamentId );

    return archers;
  },

  //----------------------------------------
  // Get all archer base records in region as sorted array by name
  // Only reason for this is list of all archers for auto-completion
  // @param regionId
  //----------------------------------------
  getArchersByRegion: async function( regionId ) {
    let query = "regionId = :regionId";
    let args = {
      ':regionId': regionId|0,  // ensure numeric
    };
    let archers = [];

    let archerRecords = await db.getRecordsBySecondaryIndex(
      ArcherTableName, ArcherRegionIndex, query, args );

    archerRecords.forEach( (entry) => {

      // exclude old entries?  TBD

      // exclude unoffical rounds?
      // if (entry.isUnofficial) { return; }

      let archer = {
        name: entry.name,
        bow: entry.bow,
        age: entry.age,
        gender: entry.gender,
      };

      archers[archer.name] = archer;
    });

    // convert Map into array ordered by name
    let names = Object.keys( archers );
    let outArchers = [];
    names.forEach( (name) => outArchers.push( archers[name] ));
    return outArchers;
  },

  //----------------------------------------
  // One archer's results for all tournaments (TODO: substring? case-insensitive?)
  //----------------------------------------
  getArcherAllResults: async function( archerName ) {
    let query =  "#name = :name";
    let args =      { ":name": archerName };
    let argNames =  { "#name": "name" };     // in case "name" is a reserved word

    return await db.getRecordsBySecondaryIndex( ArcherTableName, ArcherNameIndex, query, args, argNames );
    // return await db.getRecordsByQuery( ArcherTableName, query, argNames, args );
  },


  // Secondary keys (archer.tournamentId, archer.name) are presumed to be present
  updateArcher: async function( data ) {
    if (!data.id) {
      data.id = await atomicCounter.getNextValueInSequence( ArcherSequence );
      console.log("Next ID: " + data.id );
    }
    data.lowerName = this.toLower( data.name );
    return await db.saveRecord( ArcherTableName, data );   // really, overwrite archer
  },

  deleteArcher: async function( id ) {
    return await db.deleteRecord( ArcherTableName, id );
  },


  //----------------------------------------
  //----------------------------------------
  // TOURNAMENTS - tournament description
  //----------------------------------------

  //----------------------------------------
  getTournamentById: async function( id ) {
    return await db.getRecordById( TournamentTableName, id );
  },

  //----------------------------------------
  getTournamentByCodeAndDate: async function( code, date ) {
    let query = "#code = :code AND #date = :date";

    let args = {
      ":code": code,
      ":date": date
    };
    let argNames =  {  // Naming variables avoids reserved words
      "#code": "code",
      "#date": "date"
    };

    let results = await db.getRecordsBySecondaryIndex( TournamentTableName, TournamentCodeIndex,
                                                       query, args, argNames );

    return results[0];  // should be only one
  },

  //----------------------------------------
  // get all tournaments after given date. If no date, then all tournaments ever
  // @param date [optional]
  // @param regionId [optional] - restrict results to this region
  // @param venueId [optional] - restrict results to this venue
  //----------------------------------------
  getTournamentsAfterDate: async function( date, regionId, venueId ) {
    let filter = "";
    let args = {};
    let argNames =  {};
    let outTournaments;

    if (date) {
      filter = this.appendANDClause( filter, "#createdDate > :date");
      args[":date"] = date;
      argNames["#createdDate"] = "createdDate";
    }
    if (regionId) {
      filter = this.appendANDClause( filter, "regionId = :regionId");
      args[":regionId"] = regionId|0;
    }
    if (venueId) {
      filter = this.appendANDClause( filter, "venueId = :venueId");
      args[":venueId"] = venueId|0;
    }

    if (filter) {  // no params, get the whole ball of tournaments
      outTournaments = await db.getRecordsByFilterScan( TournamentTableName,
                                                        filter, args, argNames );
    } else {
      outTournaments = await db.getAllRecords( TournamentTableName );
    }

    // sorted by reverse date (most recent first)
    outTournaments.sort( (a,b) => b.createdDate.localeCompare( a.createdDate ));

    return outTournaments;
  },

  //----------------------------------------
  // overwrite tournament data
  // if new, go get a unique ID
  //----------------------------------------
  updateTournament: async function( data ) {
    if (!data.id) {
      data.id = await atomicCounter.getNextValueInSequence( TournamentSequence );
      console.log("Next ID: " + data.id );
    }
    if (!data.code) {
      data.code = this.generateCode( 4 );
    }

    return await db.saveRecord( TournamentTableName, data ); // really, overwrite
  },

  deleteTournament: async function( id ) {
    return await db.deleteRecord( TournamentTableName, id );
  },


  //----------------------------------------
  //----------------------------------------
  // LEAGUES - a collection of tournaments
  //----------------------------------------

  //----------------------------------------
  getLeagueById: async function( id ) {
    return await db.getRecordById( LeagueTableName, id );
  },

  //----------------------------------------
  // get all after given date. If no date, then all leagues ever
  // @param date [optional]
  // @param regionId [optional] - restrict results to this region
  // @param venueId [optional] - restrict results to this venue
  //----------------------------------------
  getLeaguesAfterDate: async function( date, regionId, venueId ) {
    let filter = "";
    let args = {};
    let argNames = {};
    let outLeagues;

    if (date) {
      filter = this.appendANDClause( filter, "#createdDate > :date");
      args[":date"] = date;
      argNames["#createdDate"] = "createdDate";
    }
    if (regionId) {
      filter = this.appendANDClause( filter, "regionId = :regionId");
      args[":regionId"] = regionId|0;
    }
    if (venueId) {
      filter = this.appendANDClause( filter, "venueId = :venueId");
      args[":venueId"] = venueId|0;
    }

    if (filter) {  // no params, get the whole ball of leagues
      outLeagues = await db.getRecordsByFilterScan( LeagueTableName,
                                                    filter, args, argNames );
    } else {
      outLeagues = await db.getAllRecords( LeagueTableName );
    }

    // sorted by reverse date (most recent first)
    outLeagues.sort( (a,b) => b.createdDate.localeCompare( a.createdDate ));

    return outLeagues;
  },

  //----------------------------------------
  // overwrite
  // if new, go get a unique ID
  //----------------------------------------
  updateLeague: async function( data ) {
    if (!data.id) {
      data.id = await atomicCounter.getNextValueInSequence( LeagueSequence );
    }
    return await db.saveRecord( LeagueTableName, data ); // really, overwrite
  },

  deleteLeague: async function( id ) {
    return await db.deleteRecord( LeagueTableName, id );
  },


  //----------------------------------------
  //----------------------------------------
  // VENUES / REGIONS  - locations
  //----------------------------------------

  //----------------------------------------
  // get all regions and venues, mush 'em together into one data structure
  //----------------------------------------
  getRegionsAndVenues: async function() {
    let regions = await db.getAllRecords( RegionTableName );
    let venues  = await db.getAllRecords( VenueTableName );

    regions.sort( (a,b) => a.id - b.id );
    // venues.sort(  (a,b) => a.id - b.id );
    venues.sort( (a,b) => a.name.localeCompare(b.name));
    // sort anything by id? Dyname sorts on Sort Key (and not Hash Key?)

    regions.forEach( (region) => {
      region.venues = [];
    });

    console.info( regions );
    console.info( venues );

    venues.forEach( (venue) => {
      const ourRegion = regions.find( (region) => region.id == venue.regionId );
      ourRegion.venues.push( venue );
    });

    return regions;
  },

  //----------------------------------------
  //----------------------------------------
  updateVenue: async function( data ) {
    if (!data.id) {
      data.id = await atomicCounter.getNextValueInSequence( VenueSequence );
    }
    return await db.saveRecord( VenueTableName, data );
  },
  //----------------------------------------
  //----------------------------------------
  updateRegion: async function( data ) {
    if (!data.id) {
      data.id = await atomicCounter.getNextValueInSequence( RegionSequence );
    }
    return await db.saveRecord( RegionTableName, data );
  },

  //----------------------------------------
  // Utility routines
  //----------------------------------------

  random: function( max ) { return Math.floor(max * Math.random());  },

  //----------------------------------------
  // Generate random N letter code
  // verify this ID doesn't exist already? TODO
  // This should take place server side to ensure uniqueness
  //----------------------------------------
  generateCode: function( size ) {
    let randomId = "";
    for (let i=0; i < size; i++) {
      randomId += String.fromCharCode(65+this.random(26));
    }
    return randomId;
  },

  //----------------------------------------
  // add an AND condition to the WHERE clause (if necessary)
  //----------------------------------------
  appendANDClause: function( clause, phrase ) {
    if (!clause) {
      return phrase;
    } else {
      return clause + " AND " + phrase;
    }
  },

  //----------------------------------------
  // Makes a consistent lowercase/no-whitepace searchable key
  // whitespace: remove outside whitespace,collpase internal whitespace, convert to dashes
  // so "David Whitney" == " dAvid   Whitney" because david_whitney==david_whitney
  //----------------------------------------
  collapseString: function( name ) {
    name = name || "";
    return name.trim().replace(/\s+/g, ' ').split(" ").join("_").toLowerCase();
  }


};
