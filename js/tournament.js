/*global fetch, Vue, VueRouter, Util */
/*jslint esversion: 8 */
//-----------------------------------------------------------------------
//  Copyright 2024, David Whitney
//  This file is part of Tournament Tools

// Archery Tournament Scorer is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

// This is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU General Public License for more details.
//-----------------------------------------------------------------------

// merge conflict howto (if development branch can't merge with main cleanly)
//  git co main
//  git merge scoring --no-commit --no-ff
//  git co --theirs .



// TODO:
// TEST league - create league, start tournament, see if QR code and bale creation works)
//  auto-complete name and class for league archers (so typos don't happen)
//  vertical style bars for league overview
//  Try multi round tournament (in league)

// When name typed in and matched (auto complete class) (search for archers in league?)
// auto populate rest of archer if name found (need in-browser DB of all archers)

// Sort out what each page should look like (what's on overview? What's on tournament/
// What if no tournament specified, what should each page do?
//   tournament => create or join
//   overview => select from recent tournaments?

// Can archer data be in cloud with unique ID? (just name currently)
// archer ID is name?  How to avoid dupes at creation? Steal other archer?
//  Enforce each archer on unique phone? Steal vs overwrite?

// Prod CORS on API-Gateway

// Error handling: try/catch on awaits on DB side?

// League: create league page that shows all current archers daily scores and total
//   - page can also create a new tournament day in the league
//   Handicap system? (only on League?)

// hamburger menu
//    Create Tournament
//    Show QR COde
//    Show results

// Tournament Admin page - what does it look like?
//    show tournament results
//    import archers (CSV, what format?)
//    edit target assignments
//    display QR Code for tournament, for each pre-created bale

//----------------------------------------------------------------------
//  OVERVIEW
//----------------------------------------------------------------------
//  A VueJS 2.1 app for entering and viewing archery tournament results
//
/*  Data model example

    // PK,HK,RK (Primary key or hash key, range key) pick two

    // how to select by code? (ie, join a tournament)
    tournament {
      id: 42069,     // PK
      date: "1/1/2024", // secondary HK with code
      code: "XYZ",      // secondary Index on code and date (to replace tournamentCodes)

      leagueId: 0,      // if part of a multiday event (mail in, league, multiday?)
      description: "Peanut Farmer 1000",
      type: { "WA 300", ends: 10, arrows: 3, rounds: 1 }
    }

    // SELECT id from TOURNAMENTS where leagueId=6;
    // SELECT scores from ARCHERS where tournamentId in above;

    // will need maxScores to calculate totals safely/correctly
    league {
      id: 6
      name: "Scott's Tots",
      maxScores: 6,  // how many tournament scores should be counted (per archer) towards league total
      doHandicap: true  // whether to calculate handicap based on scores (which ones? all?)
    }

    // DESIGN TODO: scoringGroup is really just a list of archers,
    // can bale be kept in each archer? can't edit group name then.
    // id could be name, but how to ensure uniqueness in a tournament? I guess I can't,
    // if one group has same name, then both bales/archers get merged.
    // group name lives only in the app to start with (unless created ahead of time)
    // archer menu (join different group) - need a list of
    //     groups then (just UNIQUE archer.scoringGroup?)
    // would have to delete archers if groups get messed up (ie, app starts over)
    //   admin control here?

    // FIXME: Scoring Group/order should be stored independent of scores.
    // It can be aggregated for a day's shooting though.
    // It's OK, because it can change from round to round as long as
    // there is only one current round.


archer (so name can be changed, necessary? Old item destroyed, I think that's OK)
    id PK
    tournamentId, scoringGroup SK
    name, tournamentId SK


    // SELECT * WHERE tournament="XYZ" and group="14" ORDER BY scoringGroupOrder
    archerTournament: {
      id: 143,               // PK (so name can be changed)

      leagueId: 6,           // secondary HK
      tournamentId: 42069,   // HK
      scoringGroup: 14,      // RK   bale #, could represent several/all bales

      scoringGroupOrder: 2,  // (1-4) priority of archers in group

      name: "Brandy Allison",   // secondary HK for stats (RK is tournamentId)
      bow: "FSLR",
      ageGender: "AM",

      total: { score: 600, xCount: 59 }
      rounds: [
        {
           score: 300,
           xCount: 29,
           ends: [
             {
               arrows:  ["9","9","9"]
               score: 27,         // sum/subtotal
               runningTotal: 27,
               xCount: 0
             }
             {
               arrows:  ["X","8","M"]
               score: 18,
               runningTotal: 45,
               xCount: 1
             }
           ]
        },
        // round 2...
      ]
 }
*/
//  ----------------------------------------------------------------------

// AWS Lambda serverless API deployment endpoint

let dev = true;  // if on a desktop (ie, not deployed) FIXME -create prod
let localMode = false;

// FIXME: prod lambda
let serverURL = "https://CREATE_ME.execute-api.us-west-2.amazonaws.com/prod/";
if (dev) {
  serverURL = "https://fc8w67eln8.execute-api.us-west-2.amazonaws.com/dev/";
}

Vue.filter('score', function (value) {
  if (value == null) {
    return "\u00A0";  // nbsp
  } else {
    return value;
  }
});

// const router = createRouter({
//   history: createWebHistory(),
//   routes: [],
// });

// Vue-router 3
var router = new VueRouter({
  mode: 'history',
  routes: [
    // { path: "/archery/tournament" },
    // { path: "/archery/tournament/overview" }
  ]
});


// to, from are the Location objects
// {"path":"/~dwhitney/archery/tournament/"}
// {"path":"/"}
/*
router.beforeEach((to, from) => {
  console.log( JSON.stringify( to ) );
  console.log( JSON.stringify( from ) );
  // return false;   // explicitly return false to cancel the navigation
});
*/

const ViewMode = {
  TOURNAMENT_START: "TOURNAMENT_START",
  ARCHER_LIST: "ARCHER_LIST",
  SCORE_SHEET: "SCORE_SHEET",
  SCORE_END: "SCORE_END",
};

let app = new Vue({
  router,
  el: '#tournamentApp',

  //----------------------------------------
  // Data Model (drives the View, update these values only
  //----------------------------------------
  data: {
    goneFishing: false,
    message: "Lets do a tournament",
    saveInProgress: false,    // prevent other actions while this is going on
    loadingData: false,    // prevent other actions while this is going on
    adminView: false,

    mode: ViewMode.TOURNAMENT_START,    // what page to show
    joinCode: "",  // tournament to join (XYZX)

    // a tournament is a set of rounds and a set of archer scoring
    // groups (e.g., bales) if scoring groups re-order, you need a new
    // tournament object or tournament archers need to be changed in
    // admin mode

    tournament: { },  // description of one day's shooting (target, distance, etc)
    league: {},       // only if this is a multi day event (with multiple "tournaments")

    archers: [],           // on a particular bale (scoring group)
    sortedArchers: [],     // For display only (broken down by division [FSLR-AF])

    newGroupName: "",  // temp for data entry
    groupName: "",     // immutable key for this scoring group

    newArcher: {},     // candidate new archer data model for UI before saving
    nextSequenceId: 0, // ID just for local testing

    archer: {},     // current archer for ScoreSheet
    scoringEnd: {}, // current end of arrows being scored (object, not index)

    currentArrow: 0,  // These are indexes, not objects. Poorly named, d'oh
    currentEnd: 0,    // current number of scoring arrow, end, and round
    currentRound: 0,
    isEndOfScoring: false,  // if this.archer has all arrows scored

    ignoreAgeGender: false,  // if true, only "bow" matters not age or gender

    genders: [
      {full: "Male", abbrev: "M"},
      {full: "Female", abbrev: "F"}  // nope, not going there.
    ],
    ages: [
      { full: "Cub (U12)", abbrev: "U12" },
      { full: "Youth (U15)", abbrev: "U15" },
      { full: "YA (U18)", abbrev: "U18" },
      { full: "College  (U21)", abbrev: "U21" },
      { full: "Adult", abbrev: "A" },
      { full: "Master (50+)", abbrev: "S" },
      { full: "Silver Senior (60+)", abbrev: "SS" },
      { full: "Master Senior (70+)", abbrev: "MS" },
    ],

    bows: [  // Also Trad, Longbow, FS-L,
      { full: "Barebow",   abbrev: "BBR",   nfaa: "Barebow Recurve" },
      { full: "Recurve",   abbrev: "FSLR",  nfaa: "Freestyle Limited Recurve" },
      { full: "Compound",  abbrev: "FS",    nfaa: "Freestyle" },
      { full: "Fixed Pins", abbrev: "BHFS", nfaa: "Bowhunter Freestyle" },
   // { full: "Traditional", abbrev: "TRAD", nfaa: "Traditional" }
   // { full: "Longbow",     abbrev: "LB",   nfaa: "Longbow" }
    ],

    tournamentTypes: [   // TODO: add a "roll your own" here?
      {
        description: "WA Indoor 300",
        arrows: 3, ends: 10, maxArrowScore: 10, rounds:1, swapTargetsEnd: 5
      },
      // {
      //   "description": "WA indoor 600",   // Day one of a Nationals in Indoor FITA
      //   arrows: 3, ends: 10, maxArrowScore: 10, rounds: 2
      // },
      // {
      {
        description: "Lancaster 300",
        arrows: 3, ends: 20, maxArrowScore: 10, rounds: 1,
        xBonus: 1, swapTargetsEnd: 10         // Lancaster X is 11
      },
      {
        description: "Blueface 300",
        arrows: 5, ends: 12, maxArrowScore: 5, rounds: 1, swapTargetsEnd: 6
      },
      {
        description: "Outdoor 720",
        arrows: 6, ends: 6, maxArrowScore: 10, rounds: 2
      },
      {
        description: "NFAA 900",
        arrows: 6, ends: 5, maxArrowScore: 10, rounds: 3
      }
      // {
      //   description: "Blueface 300 x2",   // League?
      //   arrows: 5, ends: 12, maxArrowScore: 5, rounds: 2
      // },
      // {
      //   description: "Outdoor 1440",   // "League"? Nationals
      //   arrows: 6, ends: 6, maxArrowScore: 10, rounds: 4
      // },
      //   description: "Vegas 900",   // "League"
      //   arrows: 3, ends: 10, maxArrowScore: 10, rounds: 3
      // },
      // {
      //   description: "WA indoor 1200",    // FITA or National (this would be a "League")
      //   arrows: 3, ends: 10, maxArrowScore: 10, rounds: 4,
      // },
    ],


    showCredits: false,
    // version: "0.1"  // create a tournament
    version: "0.2"  // archer editable, league creation works
  },

  //----------------------------------------
  // derived attributes, mostly conveniences to pull out of server
  // state for easier rendering
  //----------------------------------------
  computed: {
    // for feedback, this gets cached in DOM when <a> tag built
    deviceData() {
          let CRLF = "%0D%0A";
          return CRLF + "----" + CRLF +
            "build: " + this.version + CRLF +
            "Resolution: " + window.screen.availWidth + "x" +
            window.screen.availHeight + CRLF +
            "Viewport: " + window.innerWidth + "x" + window.innerHeight + CRLF +
            "UserAgent: " + navigator.userAgent + CRLF +
            "";
    },

    // X,10,9,8,7,6,5,4,3,2,1,M
    pointValues() {
      let values = ["M"];
      let i = 1;
      for (; i <= this.tournament.type.maxArrowScore; i++) {
        values[i] = i;
      }
      values[i]="X";
      return values.slice().reverse();
    },
  },

  //----------------------------------------
  // display format
  //----------------------------------------
  filters: {
    minSecondsFormat: function( inSeconds ) {
      let seconds = inSeconds % 60;
      seconds = seconds < 10 ? "0"+seconds : seconds;
      return Math.floor( inSeconds/60 ) + ":" + seconds;
    }
  },

  //----------------------------------------
  // We spin until game loaded so this can be anywhere in lifecycle
  //----------------------------------------
  // mounted: async function() {
  beforeMount: async function() {
    // handle broken promises.
    window.addEventListener('unhandledrejection', function(event) {
      console.error("Rat farts " + JSON.stringify( event ));
      // alert("Rat farts " + JSON.stringify( event ));
      debugger;
    });

    // Ask before leaving page (unfortunately, this includes the reload() button
/*    let showConfirmation = function(e) {
      (e || window.event).returnValue = "you sure?";
      return "you sure?";
    };
    window.addEventListener("beforeunload", function (e) {
      return showConfirmation(e);
    });
*/

    // Should handle routing better instead
    // prevent back button from being used? Bad, but prevents confusion
    window.addEventListener('popstate', function(event) {
      console.log("Preventing back button (Sorry): "+document.location );
      event.stopImmediatePropagation();
      history.go(1);
    });

    Util.setNamespace("TS");  // tournamentScoring
    // should this be a prefs object?
    this.ignoreAgeGender = Util.loadData("ignoreAgeGender");

    let tournamentId = this.$route.query.id;
    let leagueId = this.$route.query.leagueId;
    let groupId = this.$route.query.groupId;  // scoring bale ("0" means all)

    // FIXME - need different behavior for each page
    // /tournament/: no groupId=0

    if (window.location.pathname.match( /overview/ )) {
      groupId = 0;
    }

    // league overview page (page is same as tournament)
    if (leagueId && !tournamentId && window.location.pathname.match( /overview/ )) {

      this.league = await this.getLeagueById( leagueId );
      this.tournament = { type: { rounds: this.league.maxDays|0 + 1 } };  // make renderer happy
      this.archers = await this.getArchersForLeague( leagueId );  // this returns a map
      this.sortArchersForDisplay();
      // need a virtual tournament of numDays*rounds

    } else if (tournamentId) {

      this.tournament = await this.getTournamentById( tournamentId );
      leagueId = leagueId || this.tournament.leagueId;
      if (!this.tournament || !this.tournament.type) {
        alert("There is no tournament " + tournamentId );
      } else {
        // Only load all archers if groupId="0", otherwise it's too
        // easy for a user to load a whole tournament.
        if (groupId !== undefined) {
          this.archers = await this.getArchers( tournamentId, groupId );
          this.sortArchersForDisplay();
          if (!this.archers[0]) {
            this.groupName = groupId;
            console.log("There is no scoring group named " + groupId );
          } else {
            this.groupName = this.archers[0].scoringGroup;
          }
          if (leagueId) {
            this.league = await this.getLeagueById( leagueId );
          }
        }
        // only auto reload the results page, and stop when tournament done
        if (window.location.pathname.match( /overview/ )) {
          this.doAutoReload( 1 );
        }
      }
    }

    // debugging only
    let foo = this;
    this.handleKeypress = (event) => {
      if (event.shiftKey && (event.key === "Z")) {
        console.error( foo );
        debugger;
      }
    };
    document.body.addEventListener("keydown", this.handleKeypress );
  },

  // synchronous app setup before event handling starts
  // beforeCreate: function() {
  // },

  //----------------------------------------------------------------------
  // event handlers and other things that should not be computed
  // functions are accessible from the web page
  //----------------------------------------------------------------------
  methods: {
    // set the message to display lcoally, keep it for 2-3 cycles (6 seconds)
    // (otherwise local messages disappear too fast)
    setMessage: function( message, pause ) {
      this.message = message;
      pause = pause || 0;
      this.messageCountdown = pause + 1;
    },

    isMode: function( mode ) {
      return this.mode == mode;
    },

    setGroupName: function() {
      this.groupName = this.newGroupName;
      window.location.search += "&groupId=" + this.groupName;
    },

    groupName: function() {
      return this.groupName || this.archers[0].groupName;
    },

    updateInProgress: function() {
      return this.saveInProgress || this.loadingData;
    },

    archerInitialized: function( archer ) {
      return archer.rounds && archer.rounds[0] && archer.rounds[0].ends;
    },

    // init archer data struct
    initArcher: function( archer, tournament ) {
      if (!tournament) {
        alert("No tournament specified - BUG"); debugger;
      }

      if (this.archerInitialized( archer )) {
        // alert("Archer already initialzed - BUG"); debugger;
        console.log("Archer already initialzed - " + archer.name);
        return;
      }

      archer.leagueId = this.league.id|0;

      archer.rounds = archer.rounds || [];
      for (let r=0; r < tournament.type.rounds; r++) {
        if (!archer.rounds[r]) {
          archer.rounds[r] = {
            // score: 0,
            // xCount: 0,
            ends : []
          };
          for (let e=0; e < tournament.type.ends; e++) {
            archer.rounds[r].ends[e] = {
              arrows:  [],
              // score: 0,
              // runningTotal: 0,
              // xCount: 0

            };
            for (let a=0; a < tournament.type.arrows; a++) {
              archer.rounds[r].ends[e].arrows[a] = null;  // not 0? ""?
            }
          }
        }
      }
    },

    //----------------------------------------
    // find currentRound and currentEnd base on this.archer's scored arrows
    // @return nothing, but which round and end we are in will get set in this.current*
    //----------------------------------------
    findCurrentEndForArcher: function( archer ) {
      // find first end with unscored arrows

      let rounds = archer.rounds;
      let roundNum = 0, endNum = 0;
      let found = false;

      for (; roundNum < this.tournament.type.rounds; roundNum++) {
        let ends = archer.rounds[roundNum].ends;
        endNum = 0;
        for (; endNum < ends.length; endNum++) {
          if (!ends[endNum].arrows[0]) {
            found = true;  // found an unscored end
            break;
          }
        }
        if (found) {
          break;   // we're done, otherwise keep iterating
        }
      }

      if (found) {
        this.currentRound = roundNum;
        this.currentEnd = endNum;
        this.isEndOfScoring = false;
      } else {
        // there are no more unscored ends.
        this.currentRound = this.tournament.type.rounds - 1;
        this.currentEnd = this.tournament.type.ends - 1;
        this.isEndOfScoring = true;
      }
    },

    // switch mode to show an archer's score for the tournament
    showArcherScoresheet: function( archer ) {
      this.archer = archer;
      this.mode = ViewMode.SCORE_SHEET;
      this.setMessage( archer.name );

      history.pushState( {}, null, "#scoresheet");
    },

    // switch mode to first unscored end for this archer
    // if we came from ARCHER_LIST then go straight to SCORE_END (first empty end)
    scoreArcherNextEnd: function( archer ) {
      this.archer = archer;
      this.setMessage( archer.name );

      this.findCurrentEndForArcher( archer );  // updates this.currentEnd, currentRound

      console.log("Scoring " + archer.name +
                  " round " + this.currentRound+1 + ", end " + this.currentEnd+1);

      if (this.isEndOfScoring) {
        this.showArcherScoresheet( archer ); // go to score display page, not the calculator
      } else {
        this.scoreEnd( archer, archer.rounds[this.currentRound].ends[this.currentEnd],
                       this.currentEnd );
      }
    },

    //----------------------------------------
    // bring up calculator for given end
    // TODO: prevent going past latest unscored end?
    //----------------------------------------
    scoreEnd: function( archer, end, endNum ) {
      this.findCurrentEndForArcher( archer );

      if (endNum > this.currentEnd) {
        this.scoringEnd = archer.rounds[this.currentRound].ends[this.currentEnd];
      } else {
        this.scoringEnd = end;
        this.currentEnd = endNum;
      }

      // which arrow we are scoring, ie, first null arrow
      this.currentArrow = end.arrows.filter((arrow) => arrow != null).length;

      this.mode = ViewMode.SCORE_END;
      history.pushState( {}, null, "#end");
    },

    // calculator button was pushed, update end
    // translate to integers (including X's and M's)
    enterArrowScore: function( score ) {
      if (this.currentArrow >= this.tournament.type.arrows) {
        alert("Too many arrows - delete one first");
        return;
      }

      console.log("Arrow " + (this.currentArrow+1) + " is " + score );
      this.scoringEnd.arrows[this.currentArrow++] = score;

      this.calcEndTotals( this.archer, this.scoringEnd );

      // sort scoring end high to low - sorry Lancaster
      this.scoringEnd.arrows.sort( this.compareArrowScores );
    },

    // "M" < [1-10] < "X"
    compareArrowScores: function(a,b) {
      if (a == "M") { a = 0; }
      if (b == "M") { b = 0; }
      if (a == "X") { a = this.tournament.type.maxArrowScore+1; }  // X > 10, but still 10 pts
      if (b == "X") { b = this.tournament.type.maxArrowScore+1; }
      return b-a;
    },

    // FIXME: need debounce on button clicks?
    deleteArrowScore() {
      if (this.currentArrow > 0) {
        console.log("deleting last arrow " + this.currentArrow );
        this.scoringEnd.arrows[--this.currentArrow] = null;

        this.calcEndTotals( this.archer, this.scoringEnd );

        this.$forceUpdate();  // deep change to this.scoringEnd does not trigger update
      }
    },

    // total arrows to shoot
    arrowsPerTournament: function() {
      return this.tournament.type.arrows * this.tournament.type.ends * this.tournament.type.rounds;
    },

    // have all archers' arrows been scored
    isTournamentDone: function() {
      for (let i = 0; i < this.archers.length; i++) {
        if (this.archers[i].total.arrowCount != this.arrowsPerTournament()) {
          return false;
        }
      }
      return true;
    },

    doAutoReload: function( minutes ) {
      if (!this.isTournamentDone()) {
        setTimeout( function () { window.location.reload(); }, minutes*60*1000); // once a minute
      }
    },

    //----------------------------------------
    // Do the math for the whole round.
    // From scratch each time?  Seems like overkill, but probably worth it
    //----------------------------------------
    computeRunningTotals: function( archer ) {
      let runningTotal = 0,  // for each end and total
          xCount = 0,        // total only
          arrowCount = 0;

      if (!this.archerInitialized( archer )) {
        this.initArcher( archer, this.tournament );
      }

      for (let roundNum=0; roundNum < this.tournament.type.rounds; roundNum++) {
        let round = archer.rounds[roundNum];
        runningTotal = 0;
        xCount = 0;

        // running totals for each end
        for (let endNum=0; endNum < round.ends.length; endNum++) {
          let end = round.ends[endNum];
          runningTotal += end.score|0;
          xCount += end.xCount|0;
          end.runningTotal = runningTotal;

          const scoredArrows = end.arrows.filter( a => (typeof(a) == "number" ||  // [1-10]
                                                        typeof(a) == "string"));  // M,X
          arrowCount += scoredArrows.length;
        }

        // round totals
        round.score = runningTotal;
        round.arrowCount = arrowCount;
        round.xCount = xCount;
      }

      // all round totals - do we need this?
      archer.total = {
        score: 0,
        arrowCount: 0,
        xCount: 0
      };
      for (let r=0; r < archer.rounds.length; r++) {
        archer.total.score += archer.rounds[r].score|0;    // "|0" prevents NaN if anything
        archer.total.xCount += archer.rounds[r].xCount|0;  // is undefined
        archer.total.arrowCount += archer.rounds[r].arrowCount|0;
      }

    },

    //----------------------------------------
    // done scoring this archer, go directly to the next archer
    //----------------------------------------
    doneGoToNextArcher: async function( archer, end ) {
      if (!await this.doneWithEnd( archer, end )) {
        return;
      }

      // get next archer
      let next = this.archers.indexOf( archer ) + 1;

      if (this.archers[next]) {
        this.scoreArcherNextEnd( this.archers[next] );
      } else {
        this.gotoArcherList();  // end of scoring
        if (this.tournament.type.swapTargetsEnd &&
            this.tournament.type.swapTargetsEnd == this.currentEnd+1)
        {
          alert("HALFWAY DONE! Swap top and bottom targets?");
        }
      }
    },

    //----------------------------------------
    // done scoring this archer, go back to scoresheet view
    //----------------------------------------
    doneGoToScoresheet: async function( archer, end ) {
      if (await this.doneWithEnd( archer, end )) {
        this.showArcherScoresheet( archer );
      }
    },

    //----------------------------------------
    doneWithEnd: async function( archer, end ) {
      let arrowsScored = 0;
      for (let i=0; i < end.arrows.length; i++) {
        if (end.arrows[i] != null) {
          arrowsScored++;
        }
      }

      if ((arrowsScored == 0) || (arrowsScored == end.arrows.length)) {
        this.calcEndTotals( archer, end );
        await this.updateArcher( archer );      // running totals calculated here, too
        return true;
      } else {
        alert("Must score all arrows or no arrows");
        return false;
      }
    },

    //----------------------------------------
    // Compute the scores for a single end. Running totals done at update
    // @arg archer
    // @arg round - round number
    // @arg end - end number
    //----------------------------------------
    calcEndTotals: async function( archer, end ) {
      // scores for this end, e.g. ["X", "10", "9", "M", ...]
      let arrows = end.arrows;

      end.score = 0;
      end.runningTotal = 0;  //
      end.xCount = 0;

      for (let a=0; a < end.arrows.length; a++) {
        if (arrows[a] == "X") { // 10 normally. 11 for Lancaster, 5 for BF
          end.score += this.tournament.type.maxArrowScore + (this.tournament.type.xBonus|0);
          end.xCount++;
        } else {
          if (arrows[a] != "M") {  // miss
            end.score += arrows[a] | 0;  // convert "9" to int
          }
        }
      }
      // update the whole round
      this.computeRunningTotals( archer );
    },


    //----------------------------------------
    // generate URLs for QR codes or for display
    //----------------------------------------
    baseURL: function() {
      let url = window.location.origin + window.location.pathname;
      return url.match( /(.*tournament)/ )[0];
    },
    tournamentURL: function() {
      return this.baseURL() + "?id=" + this.tournament.id;
    },
    resultsURL: function() {
      if (this.tournament.id) {
        return this.baseURL() + "/overview?id=" + this.tournament.id;
      } else {
        return this.baseURL() + "/overview?leagueId=" + this.league.id;
      }
    },

    // generate the tournament home page (where you can create a new scoring bale
    generateTouramentQRCode: function() {
      Util.generateQRCode( this.tournamentURL(), "qrcode" );
    },

    joinTournament: async function() {
      this.joinCode = this.joinCode.toUpperCase();
      this.tournament = await this.getTournamentByCode( this.joinCode ) || {};
      if (this.tournament.id) {
        window.location.search = "?id=" + this.tournament.id;
      } else {
        alert("No tournament from today found named " + this.joinCode);
      }
    },

    //----------------------------------------
    // save tournament to DB.
    //----------------------------------------
    createLeague: async function( event ) {
      await this.saveLeague( this.league );

      if (this.league.id) {  // redirect to tournament page
        window.location.href += "../create?leagueId=" + this.league.id;
      } else {
        alert("Failed to create League. Whoops");
      }
    },

    //----------------------------------------
    // save tournament to DB.
    //----------------------------------------
    createTournament: async function( event ) {
      if (this.tournament.id) {
        alert("Cannot modify an existing tournament. You must make a new one");
        return;
      }
      this.tournament.leagueId = this.league.id |0;
      await this.saveTournament();

      if (this.tournament.id) {
        console.log("tournament created " + JSON.stringify( this.tournament ));
        // window.location.href += "../?id=" + this.tournament.id;  // redirect to tournament page
        window.location.pathname += "../";  // redirect to tournament page
        if (!window.location.search) {
          window.location.search = "?id=" + this.tournament.id;
        } else {
          window.location.search += "&id=" + this.tournament.id;
        }
      } else {
        alert("Failed to create tournament");
      }
    },

    //----------------------------------------
    // Change archer info
    // the problem is "name" is the PK so a second record gets created
    // Options: delete and recreate
    //   make name not PK (but queryable Seconday index) what becomes PK? a new ID?
    //   Only make non-name attributes editable
    //----------------------------------------
    editArcher: function( archer ) {
      // deprecated? No way to press and hold vs drag an archer?
      this.newArcher = archer;
      // this doesnt work until PK is immutable (or we do delete/recreate)
      console.log("clicked " + archer.name );
    },


    addNewArcher: async function( event ) {
      this.newArcher.tournamentId = this.tournament.id;
      this.newArcher.scoringGroup = this.groupName;

      if (!this.archerInitialized( this.newArcher )) {
        this.initArcher( this.newArcher, this.tournament );
        this.archers.push( this.newArcher );   // add archer to list (order matters)
      }

      await this.updateArcher( this.newArcher );  // save and update metadata

      this.newArcher = {};

      // hack to dismiss modal, maybe store dialog element when opening?
      this.closeDialogElement( event.target.parentElement.parentElement );
    },

    removeArcherFromBale: function( archer ) {
      // this.bale.pop( archer );
    },

    // save current archer list to DB and begin tournament
    startScoring: async function() {
      for (let i=0; i < this.archers.length; i++) {
        // save the current order of archers
        await this.updateArcher( this.archers[i] );
      }

      this.gotoArcherList();
    },

    gotoArcherList: function() {
      this.mode = ViewMode.ARCHER_LIST;
      this.setMessage( this.tournament.name );
      history.pushState( {}, null, "#archers");
    },

    //----------------------------------------
    // Dialog handlers
    //----------------------------------------
    openDialog( name, openCallback ) {
      this.openDialogElement( document.getElementById( name ));
      if (openCallback)
        openCallback();
    },
    // @input button click that caused the close (ie, button),
    //    assumes it's the immediate child of the dialog
    closeDialog( event ) {
      this.closeDialogElement( event.target.parentElement );
    },
    // @input dialog element itself
    openDialogElement( dialog ) {
      if (!dialog || this.dialogIsOpen) {  // can't open two dialogs at once
        return;
      }
      // grey out game
      document.getElementById("dialogBackdrop").classList.add("backdropObscured");
      this.dialogIsOpen = true;  // flag to disable other dialogs. Vue doesn't respect this on change(in v-if)?

      dialog.open = true;           // Chrome
      dialog.style.display="flex";  // Firefox/Safari

      this.addDialogDismissHandlers( dialog );  // outside click and ESC
    },

    //----------------------------------------------------------------------
    // close dialog, restore background, remove event handlers.
    // @input dialog element itself
    //----------------------------------------------------------------------
    closeDialogElement( dialog ) {
      document.getElementById("dialogBackdrop").classList.remove("backdropObscured");

      this.dialogIsOpen = false;  // FIXME: Vue is not seeing this; Do we just need to add it to the data() section?
      dialog.open = false;
      dialog.style.display="none";

      // dialog gone, stop listening for dismiss events
      let backdrop = document.getElementById("dialogBackdrop");
      backdrop.removeEventListener('click', this.closeDialogOnOutsideClick );
      document.body.removeEventListener("keydown", this.closeDialogOnESC );
    },

    //----------------------------------------------------------------------
    // Close on click outside dialog or ESC key.
    // Save functions for removal after close()
    //----------------------------------------------------------------------
    addDialogDismissHandlers( dialog ) {
      // FIXME, these event handlers happen after Vue event
      // handlers so you can play the game while a dialog is
      // open.  How to disable all of game wile dialog is open?

      this.closeDialogOnOutsideClick = (event) => {
        const clickWithinDialog = event.composedPath().includes( dialog );
        if (!clickWithinDialog) {
          this.closeDialogElement( dialog );
        }
      };
      this.closeDialogOnESC = (event) => {
        if (event.keyCode === 27) {
          this.closeDialogElement( dialog );
        }
      };

      // Could also use dialog::backdrop, but it is not fully supported
      // Fake our own backdrop element to swallow clicks and grey out screen
      // by not using "body" we don't need to worry about click bubbling
      let backdrop = document.getElementById("dialogBackdrop");
      backdrop.addEventListener('click', this.closeDialogOnOutsideClick );
      document.body.addEventListener("keydown", this.closeDialogOnESC );
    },


    //----------------------------------------
    //----------------------------------------
    // Tournament persistence
    //----------------------------------------
    //----------------------------------------
    getTournamentByCode: async function( tournamentCode ) {
      let tournament = {};

      if (!tournamentCode) {
        console.error("Tried to get null tournament");  debugger;
        return tournament;
      }

      if (localMode) {
        tournament = Util.loadData("tournament"+ tournamentCode) || {};
      } else {
        tournament = await this.loadTournamentByCodeFromDB( tournamentCode ) || {};
      }

      if (tournament && tournament.type) { // load fail is {}
        if (!tournament.type.rounds) {
          tournament.type.rounds = 1;  // default
        }
      }
      if (tournament) {
        this.setMessage( tournament.name );
      }
      return tournament;
    },

    //----------------------------------------
    getTournamentById: async function( id ) {
      let tournament = {};

      if (!id) {
        console.error("Tried to get null tournament"); debugger;
        return tournament;
      }
      if (localMode) {
        tournament = Util.loadData("tournament"+ id) || {};
      } else {
        tournament = await this.loadTournamentByIdFromDB( id ) || {};
      }
      if (tournament && tournament.type) {
        tournament.type.rounds = tournament.type.rounds || 1;  // at least one always
      }
      if (tournament) {
        this.setMessage( tournament.name );
      }
      return tournament;
    },

    //----------------------------------------
    getLeagueById: async function( id ) {
      let league = {};

      if (!id) {
        console.error("Tried to get null league"); debugger;
        return league;
      }
      if (localMode) {
        league = Util.loadData("league"+ id) || {};
      } else {
        league = await this.loadLeagueByIdFromDB( id ) || {};
      }
      if (league.id) {
        this.setMessage( league.name );
      }
      return league;
    },

    //----------------------------------------
    // Generate random 4 letter code
    // verify this ID doesn't exist already? TODO
    // This should take place server side to ensure uniqueness
    //----------------------------------------
    generateTournamentId: function() {
      let randomId = "";
      for (let i=0; i<4; i++) {
        randomId += String.fromCharCode( 65 + Util.random(26) );
      }
      return randomId;
    },

    //----------------------------------------
    saveTournament: async function() {
      if (!this.tournament || !this.tournament.name) {
        return;
      }

      // this should take place server-side? No, use the locale of the adhoc app user
      this.tournament.date = new Date().toLocaleDateString('en-CA');  // CA uses 2024-12-25

      if (localMode) {
        this.tournament.code = this.generateTournamentId();
        this.tournament.id = this.tournament.code;
        Util.saveData("tournament"+ this.tournament.id, this.tournament );
      } else {
        await this.saveTournamentToDB( this.tournament );  // ID/Code created in DB
      }
    },

    //----------------------------------------
    saveLeague: async function() {
      if (!this.league || !this.league.name) {
        return;
      }

      // created date I guess. Add expiration date? What good does that do?
      // FIXME - figure out whate dates are needed for a league
      // end-date - don't allow any more tournaments to be added
      // start-date - Show recent leagues (within the last two months?)

      // this.league.date = new Date().toLocaleDateString('en-CA');  // CA uses 2024-12-25

      if (localMode) {
        this.league.id = this.nextSequenceId++;
        Util.saveData("league"+ this.league.id, this.league );
      } else {
        await this.saveLeagueToDB( this.league );  // ID created in DB
      }
    },

    //----------------------------------------
    //----------------------------------------
    // Archer scorecard persistence
    //----------------------------------------
    // getArcher is dumb. Is it needed when two people might be scoring the same archer?
    // Just reload all archers in that case?  What about versioning.
    // Versioning should be on a single archer...  DB load would be on a single archer
    // level. Reload whol bale after each save? No, versioning takes care of that.
    // Versioning is just to prevent a conflict, optimistic locking should do most of the
    // time. Only an error if two people are updating the same archer, which is an error anyway
    async getArcher( tournamentId, archerId ) {
      throw new Error("WTF");
      // return this.archers[ archerId ]; this doesn't even work, archers is an array
      // there is no DB version of this, use loadTournamentArchers instead
    },

    //----------------------------------------
    // load all archers in this tournament and/or on a given bale (scoring group)
    // Called only at the beginning of scoring and if there is a versioning error
    //----------------------------------------
    getArchers: async function( tournamentId, groupId ) {
      if (localMode) {
        return Util.loadData("archers:"+tournamentId+"-"+groupId) || [];
      } else {
        return await this.loadArchersFromDB( tournamentId, groupId ) || [];
      }
    },

    //----------------------------------------
    // handicap is 80% of the distance to perfect
    // (ex: a 270/300 would have a handicap of 0.8/arrow or 2.4 per end or 24 per round)
    // (perfect-you)/#arrows*80%
    //----------------------------------------
    calcHandicap: function( tournament, archer ) {
      let perfectScore = tournament.type.maxArrowScore * archer.total.arrowCount;
      return .80 * (perfectScore - archer.total.score)/archer.total.arrowCount;
    },

    //----------------------------------------
    // Use case: show results-to-date for league, also pre-populate archer name for new league day
    // List of archers with weekly scores, overall score, current handicap
    // Create a virtual tournament object where the rounds are all the rounds shot in the league
    //----------------------------------------
    getArchersForLeague: async function( leagueId ) {
      // list of archer records, archerId will be duplicated
      let archerRecords = await this.loadLeagueArchersFromDB( leagueId );

      // what is best way to display archer, scores, total, and handicap?
      // for a handicap league there may not be archer classes, just one big list of archers
      let archers = [];

      archerRecords.forEach( (oneArcherDay) => {
        let id = oneArcherDay.name;   // name should be the same, id changes each day
        if (!archers[id]) {
          archers[id] = oneArcherDay;
        } else {
          // add this day's rounds and totals to the pile
          archers[id].rounds = archers[id].rounds.concat( oneArcherDay.rounds );
          archers[id].total.score += oneArcherDay.total.score;
          archers[id].total.xCount += oneArcherDay.total.xCount;
          archers[id].total.arrowCount += oneArcherDay.total.arrowCount;
          // archers[id].total.handicap = this.calcHandicap( this.tournament, archers[id] );
        }
      });

      // FIXME: how does this work for a two day regular tournament?
      // eg, changing bales each day.  Does this matter?

      // convert name keyed map back to (sortable) array
      return [...Object.values( archers )];      // same asArray.from( archers.values() );
    },


    //----------------------------------------
    // update archer in DB.
    // @arg archer - data to save, but also updated with DB metadata (version, date)
    //----------------------------------------
    updateArcher: async function( archer ) {

      this.computeRunningTotals( archer );

      // save their order in the group (even if not in a sorted array)
      let i = this.archers.findIndex( a => (a.name == archer.name));
      archer.scoringGroupOrder = (i<0)? 0 : i;

      if (localMode) {
        // hacky way to store single archer in a group, stomp the whole thing
        Util.saveData("archers:"+archer.tournamentId+"-"+archer.scoringGroup, this.archers );

      } else {
        // save and update local copy with DB metadata
        await this.saveArcherToDB( archer );
      }
    },

    //----------------------------------------
    // return all permutations of bow, gender, and age
    // we want a 2-D array of archers, sorted by either bow or bow/age/gender (then by score)
    //----------------------------------------
    getAllCompetitionClasses: function() {
      let outClasses = [];

      if (this.ignoreAgeGender) {
        for (let b=0; b < this.bows.length; b++) {
          outClasses.push( { bow: this.bows[b] } );
        }
      } else {
        for (let b=0; b < this.bows.length; b++) {
          for (let a=0; a < this.ages.length; a++) {
            for (let g=0; g < this.genders.length; g++) {
              outClasses.push( {
                bow: this.bows[b],
                age: this.ages[a],
                gender: this.genders[g]
              } );
            }
          }
        }
      }
      return outClasses;
    },

    //----------------------------------------------------------------------
    // just archers in given division. Cached results (see findArchersByClass)
    // Just for display, sorted by score.
    //----------------------------------------------------------------------
    getArchersByClass: function( cls ) {
      if (this.ignoreAgeGender) {
        return this.sortedArchers[cls.bow.abbrev] || [];
      } else {      // FSLR-AF
        return this.sortedArchers[cls.bow.abbrev + "-" + cls.age.abbrev + cls.gender.abbrev] || [];
      }
    },

    toggleAgeGender: function() {
      Util.saveData("ignoreAgeGender", this.ignoreAgeGender);
      this.sortedArchers = [];
      this.sortArchersForDisplay();
    },

    // either split this array by Bow, or by Bow-Age-Gender
    sortArchersForDisplay: function() {
      for (let b = 0; b < this.bows.length; b++) {

        if (!this.ignoreAgeGender) {
          for (let a = 0; a < this.ages.length; a++) {
            for (let g = 0; g < this.genders.length; g++) {
              const division =
                    this.bows[b].abbrev + "-" + this.ages[a].abbrev + this.genders[g].abbrev;
              this.sortedArchers[division] = this.findArchersByClass(
                this.bows[b], this.ages[a], this.genders[g] );
            }
          }
        } else {
          const division = this.bows[b].abbrev;
          this.sortedArchers[division] = this.findArchersByClass( this.bows[b] );
        }
      }
      this.$forceUpdate();
    },

    // search through all archers to build array of like archers
    // use getArchersByClass() to get cached version for display
    findArchersByClass( bow, age, gender ) {
      let outArchers = [];

      this.archers.forEach(( archer ) => {
        if (this.ignoreAgeGender) {           // ex: FSLR
          if (archer.bow == bow.abbrev) {
            outArchers.push( archer );
          }
        } else {                              // ex: FSLR-AM
          if ((archer.bow == bow.abbrev) &&
              (archer.age == age.abbrev) &&
              (archer.gender == gender.abbrev))
          {
            outArchers.push( archer );
          }
        }
      });

      outArchers.sort( this.compareArcherScores );
      return outArchers;
    },

    // compare scores down to X count tiebreaker
    compareArcherScores: function(a,b) {
      let at = a.total, bt = b.total;

      if (at.score != bt.score) {
        return bt.score - at.score;
      } else {
        return bt.xCount - at.xCount;
      }
    },


    addArchersToCSV: function( tournament, archers, csv) {

      for (let i=0; i < archers.length; i++) {
        let archer = archers[i];
        let row = [archer.name];
        if (tournament.type.rounds > 1) {
          for (let r=0; r < tournament.type.rounds; r++) {
            row.push( archer.rounds[r].score );
            row.push( archer.rounds[r].xCount );
          }
        }
        row.push( archer.total.score );
        row.push( archer.total.xCount );
        // row.push( archer.total.arrowCount );

        csv.push( row );
      }
    },

    //----------------------------------------
    // create 2D array of archers sorted by classification
    //----------------------------------------
    exportToCSV: function( tournament ) {
      let csv = [[tournament.name]];

      let heading = ["Category"];

      if (tournament.type.rounds > 1) {
        for (let r=0; r < tournament.type.rounds; r++) {
          heading.push("Score "+(r+1));
          heading.push("X");
        }
      }
      heading.push("Total");
      heading.push("X");

      csv.push( heading );

      let bowClasses = this.getAllCompetitionClasses();

      for (let c=0; c < bowClasses.length; c++) {
        let cls = bowClasses[c];
        let archers = this.getArchersByClass( cls );
        if (!archers.length) {
          continue;
        }
        csv.push([]);
        if (this.ignoreAgeGender) {
          csv.push( [cls.bow.full] );
        } else {
          csv.push( [cls.age.full + " " +
                     cls.gender.full + " " +
                     cls.bow.full] );
        }

        this.addArchersToCSV( tournament, archers, csv );
      }

      Util.exportToCSV( csv, tournament.name );
    },

    //----------------------------------------------------------------------
    // SERVER CALLS
    //----------------------------------------------------------------------

    //      LOAD

    //----------------------------------------
    // load tournament from 4 letter code that is valid today only
    // code should only be used for ad-hoc tournaments, not ones set up in advance.
    // Server side will use date and short term code to get the persistent ID
    //----------------------------------------
    async loadTournamentByCodeFromDB( tournamentCode ) {
      let date = new Date().toLocaleDateString('en-CA');  // CA uses 2024-12-25
      // date = "2024-09-27"; // testing RTOS

      let serverCmd = "tournament?code=" + tournamentCode + "&date=" + date;
      return await this.loadObjectsFromDB( serverCmd );
    },
    //----------------------------------------
    // load tournament by direct ID
    // in an ad-hoc tournament the code will turn into an ID upon creation
    //----------------------------------------
    async loadTournamentByIdFromDB( id ) {
      return await this.loadObjectsFromDB( "tournament?id=" + id );
    },
    //----------------------------------------
    // load all archers in this tournament and/or on a given bale (scoring group)
    //----------------------------------------
    async loadLeagueByIdFromDB( id ) {
      return await this.loadObjectsFromDB("league?id=" + id );
    },
    //----------------------------------------
    // load all archers in this tournament and/or on a given bale (scoring group)
    //----------------------------------------
    async loadArchersFromDB( tournamentId, groupId ) {
      let serverCmd = "archers?tournamentId=" + tournamentId + "&groupId=" + groupId;
      return await this.loadObjectsFromDB( serverCmd );
    },
    //----------------------------------------
    // load all archer records for this league
    //----------------------------------------
    async loadLeagueArchersFromDB( leagueId ) {
      let serverCmd = "archers?leagueId=" + leagueId;
      return await this.loadObjectsFromDB( serverCmd );
    },

    //----------------------------------------
    // generic object load from remote
    //----------------------------------------
    async loadObjectsFromDB( serverCmd ) {
      if (this.updateInProgress()) {    // one thing at a time...
        alert("Another action was in progress. Try again.");
        return null;
      }

      try {
        this.loadingData = true;
        let response = await fetch(serverURL + serverCmd );
        if (!response.ok) { throw await response.json(); }
        return await response.json();
      }
      catch (err) {
        console.error( err );
        return null;
      }
      finally {
        this.loadingData = false;
      }
    },


    //      SAVE

    //----------------------------------------
    // ID, version, metadata to be generated remotely and populated into given object
    //----------------------------------------
    async saveTournamentToDB( tournament ) {
      await this.saveObjectToDB( tournament, "Tournament");
    },
    async saveLeagueToDB( league ) {
      await this.saveObjectToDB( league, "League");
    },
    async saveArcherToDB( archer ) {
      await this.saveObjectToDB( archer, "Archer");
    },

    //----------------------------------------
    // generic object save call updateTournament, updateArcher, updateLeague
    //----------------------------------------
    async saveObjectToDB( obj, objName ) {
      if (this.updateInProgress()) {    // one thing at a time...
        alert("Another action was in progress. Try again.");
        return;
      }

      try {
        this.saveInProgress = true;

        let response = await fetch( serverURL + "update"+objName,
                                    Util.makeJsonPostParams( obj ));
        if (!response.ok) { throw await response.json(); }

        let result = await response.json();
        // console.log("update resulted in " + JSON.stringify( result ));
        if (result) {
          console.log("update resulted in " + result.name + ", v" + result.version );
        }

        // refresh our local data with whatever goodness the DB thinks
        // we should have (last updated, version)
        Object.assign( obj, result );
        // tournament = {...tournament, ...result};  // ES9 (2018)
      }
      catch( err ) {
        console.error("Update "+objName+": " + JSON.stringify( err ));
        alert("Reload and try again. "+objName+" update failed (possible version conflict)" +
              Util.sadface + (err.message || err));
      }
      finally {
        this.saveInProgress = false;
      }
    },


  },

});
