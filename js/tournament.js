/*global fetch, Vue, VueRouter, Util, QRCode */
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
// archer data should be in cloud (how to uniquely ID?)
// Round management. It's always round 0

// archer ID is name?  How to avoid dupes at creation? Steal other archer?
//  Enforce each archer on unique phone? Steal vs overwrite?

// way to ensure no skipped (blank) ends - can't select beyond last scored end?

// Prod CORS on API-Gateway

// Tournament Display
//   List all archers and scores, sorted by division (or not)
//   Handicap system?

// Error handling: try/catch on awaits on DB side?

// archer needs secondary index on tournamentId and group (for multiple results)
// unique PK is tourArcherID or touramentId + name

// League: create league page that shows all current archers daily scores and total
//   - page can also create a new tournament day in the league

// fix archerList padding (create vs display), not lined up, add padding override for create?)

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
      date: "1/1/2024", // secondady HK with code
      code: "XYZ",      // secondary Index on code and date (to replace tournamentCodes)

      leagueId: 0,      // if part of a multiday event (mail in, league, multiday?)
      description: "Peanut Farmer 1000",
      type: { "WA 300", ends: 10, arrows: 3, rounds: 1 }

    }

    // SELECT id from TOURNAMENTS where leagueId=6;
    // SELECT scores from ARCHERS where tournamentId in above;

    // should league be denormalilzed into tournament?  FIXME
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




    // SELECT * WHERE tournament="XYZ" and group="14" ORDER BY scoringGroupOrder
    archerTournament: {
      tournamentId: 42069,   // HK

      scoringGroup: 14,      // RK   bale #, could represent several bales
      scoringGroupOrder: 2,  // (1-4) priority of archers in group

      // id: 69,   // (1-999) or "bradyellison"?  unique only to tournament, not globally
      name: "Brandy Allison",   // secondary HK for stats?
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
  OR
          ends: [["9","9","9"], ["X","8","7",.]
          // computed
          endScore: [27, 25, ...]
          endXCount: [0,1...]
          runningTotal: [27, 52, ...]
          roundScore: 300,
          roundXCount: 29,
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
  routes: [ ]
});

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
    message: "Lets do a tournament",
    saveInProgress: false,    // prevent other actions while this is going on
    loadingData: false,    // prevent other actions while this is going on
    adminView: false,

    mode: ViewMode.TOURNAMENT_START,    // what page to show
    foo: "foo",
    joinCode: "",  // tournament to join (XYZX)

    // a tournament is a set of rounds and a set of archer scoring
    // groups (e.g., bales) if scoring groups re-order, you need a new
    // tournament object or tournament archers need to be changed in
    // admin mode

    tournament: { },  // description of one day's shooting (target, distance, etc)
    league: {},       // only if this is a multi day event (with multiple "tournaments")

    round: 0,     // which round of the tournament we are scoring (how is this determined? display only?)  Can we move around rounds?  Display only one round at a time?  All rounds?  How to edit and update previous rounds?

    archers: [],           // on a particular bale (scoring group)
    sortedArchers: [],     // For display only (broken down by division [FSLR-AF])

    newGroupName: "",  // temp for data entry
    groupName: "",     // immutable key for this scoring group

    newArcher: {},     // candidate new archer data model for UI before saving
    nextSequenceId: 0, // ID just for local testing

    archer: {},     // current archer for ScoreSheet
    scoringEnd: {}, // current end of arrows being scored
    currentArrow: 0,
    currentRound: 0,

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

    tournamentTypes: [
      {
        "description": "WA Indoor 300",
        "arrows": 3, "ends": 10, maxArrowScore: 10
      },
      // {
      //   "description": "WA indoor 600",
      //   "arrows": 3, "ends": 10, maxArrowScore: 10, rounds: 2
      // },
      // {
      //   "description": "Vegas 900",
      //   "arrows": 3, "ends": 10, maxArrowScore: 10, rounds: 3
      // },
      // {
      //   "description": "WA indoor 1200",
      //   "arrows": 3, "ends": 10, maxArrowScore: 10, rounds: 4,
      // },
      {
        "description": "Lancaster 300",
        "arrows": 3, "ends": 10, maxArrowScore: 10, xBonus: 1       // Lancaster X is 11
      },
      {
        "description": "Blueface 300",
        "arrows": 5, "ends": 12, maxArrowScore: 5  // 3 rounds of 4 ends?
      },
      // {
      //   "description": "Blueface 300 x2",
      //   "arrows": 5, "ends": 12, maxArrowScore: 5, rounds: 2
      // },
      {
        "description": "Outdoor 720",
        "arrows": 6, "ends": 6, maxArrowScore: 10, rounds: 2
      },
      // {
      //   "description": "Outdoor 1440",
      //   "arrows": 6, "ends": 6, maxArrowScore: 10, rounds: 4
      // },
      {
        "description": "NFAA 900",
        "arrows": 5, "ends": 5, maxArrowScore: 10, rounds: 3
      }
    ],


    showCredits: false,
    version: "0.1"  // create a tournament
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

    Util.setNamespace("TS");  // tournamentScoring

    let tournamentId = this.$route.query.id;
    this.league.id = this.$route.query.leagueId;
    let groupId = this.$route.query.groupId;  // scoring bale ("0" means all)

    if (tournamentId) {
      this.tournament = await this.getTournamentById( tournamentId );
      if (!this.tournament.type) {
        alert("There is no tournament named " + tournamentId );
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
        alert("Archer already initialzed - BUG"); debugger;
      }

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


    // switch mode to show an archer's score for the tournament
    showArcherScoresheet: function( archer ) {
      this.archer = archer;
      this.mode = ViewMode.SCORE_SHEET;
      this.setMessage( archer.name );
    },

    // switch mode to first unscored end for this archer
    // if we came from ARCHER_LIST then go straight to SCORE_END (first empty end)
    scoreArcherNextEnd: function( archer ) {
      this.archer = archer;
      this.setMessage( archer.name );

      // find first end with unscored arrows
      let ends = archer.rounds[this.round].ends;
      let endNum = 0;
      for (; endNum < ends.length; endNum++) {
        if (!ends[endNum].arrows[0]) {
          break;
        }
      }
      console.log("Scoring " + archer.name + " end " + endNum);
      if (endNum < ends.length) {
        this.scoreEnd( archer, ends[endNum], endNum);
      } else {
        this.showArcherScoresheet( archer ); // go to score display page, not the calculator
      }
    },

    // bring up calculator for given end
    scoreEnd: function( archer, end, endNumber ) {
      this.scoringEnd = end;
      this.scoringEndNumber = endNumber;

      // which arrow we are scoring, ie, first null arrow
      this.currentArrow = end.arrows.filter((arrow) => arrow != null).length;

      this.mode = ViewMode.SCORE_END;
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

    // "X" > [1-10] > "M"
    compareArrowScores: function(a,b) {
      if (a == "M") { a = 0; }
      if (b == "M") { b = 0; }
      if (a == "X") { a = this.tournament.type.maxArrowScore+1; }
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

    //----------------------------------------
    // Do the math for the whole round.
    // From scratch each time?  Seems like overkill, but probably worth it
    //----------------------------------------
    computeRunningTotals: function( archer, roundNum ) {
      let runningTotal = 0,  // for each end and total
          xCount = 0,        // total only
          arrowCount = 0;

      if (!this.archerInitialized( archer )) {
        this.initArcher( archer, this.tournament );
      }

      let round = archer.rounds[roundNum];

      // running totals for each end
      for (let endNum=0; endNum < round.ends.length; endNum++) {
        let end = round.ends[endNum];
        runningTotal += end.score|0;
        xCount += end.xCount|0;
        end.runningTotal = runningTotal;

        const scoredArrows = end.arrows.filter( a => (typeof(a) == "number" ||
                                                      typeof(a) == "string"));  // "X"
        arrowCount += scoredArrows.length;
      }

      // round totals
      round.score = runningTotal;
      round.arrowCount = arrowCount;
      round.xCount = xCount;

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
      this.doneWithEnd( archer, end );

      // get next archer
      let next = this.archers.indexOf( archer ) + 1;

      if (this.archers[next]) {
        this.scoreArcherNextEnd( this.archers[next] );
      } else {
        this.gotoArcherList();  // end of scoring
      }
    },

    //----------------------------------------
    // done scoring this archer, go back to scoresheet view
    //----------------------------------------
    doneGoToScoresheet: async function( archer, end ) {
      this.doneWithEnd( archer, end );
      this.showArcherScoresheet( archer );
    },

    //----------------------------------------
    doneWithEnd: async function( archer, end ) {
      // TODO: verify all arrows scored? Or all or nothing perhaps?

      let arrowsScored = 0;
      for (let i=0; i < end.arrows.length; i++) {
        if (end.arrows[i] != null) {
          arrowsScored++;
        }
      }

      if ((arrowsScored == 0) || (arrowsScored == end.arrows.length)) {
        this.calcEndTotals( archer, end );
        await this.updateArcher( archer );      // running totals calculated here, too
      } else {
        alert("Must score all arrows or no arrows");
        return;
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
      this.computeRunningTotals( archer, this.round );
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
      await this.saveTournament();

      if (this.tournament.id) {
        console.log("tournament created " + JSON.stringify( this.tournament ));
        window.location.href += "../?id=" + this.tournament.id;  // redirect to tournament page
      } else {
        alert("Failed to create tournament");
      }
    },

    // open scoring page for this archer
    selectArcher: function( archer ) {
      // deprecated? No way to press and hold vs drag an archer?
    },


    addNewArcher: async function( event ) {
      this.newArcher.tournamentId = this.tournament.id;
      this.newArcher.scoringGroup = this.groupName;
      this.initArcher( this.newArcher, this.tournament );

      this.archers.push( this.newArcher );   // add archer to list (order matters)
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

    //
    qrcode: function( qrcodeURL ) {
      let qrcode = new QRCode( document.getElementById("qrcode"), qrcodeURL);

      let qrcode2 = new QRCode( document.getElementById("qrcode"), {
        text: qrcodeURL,
        width: 256,
        height: 256,
        // typeNumber : 4,   // https://www.qrcode.com/en/codes/
        colorDark : "#000000",
        colorLight : "#ffffff",
        correctLevel : QRCode.CorrectLevel.H  // high (L,M,H)
      });

      qrcode.clear();
      qrcode.makeCode( qrcodeURL );
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
    getTournamentById: async function( tournamentId ) {
      let tournament = {};

      if (!tournamentId) {
        console.error("Tried to get null tournament"); debugger;
        return tournament;
      }
      if (localMode) {
        tournament = Util.loadData("tournament"+ tournamentId) || {};
      } else {
        tournament = await this.loadTournamentByIdFromDB( tournamentId ) || {};
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

      this.league.date = new Date().toLocaleDateString('en-CA');  // CA uses 2024-12-25

      if (localMode) {
        this.league.id = this.nextSequenceId++;
        Util.saveData("league"+ this.league.id, this.league );
      } else {
        await this.saveLagueToDB( this.league );  // ID created in DB
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
    // FIXME - show results-to-date for league?
    // list of archers with weekly scores, overall score, current handicap
    getArchersForLeague: async function( leagueId ) {
      // load tournaments for league
      let tournaments = await this.loadTournamentsForLeague( leagueId );
      let archers = {};

      // make hash keyed by archer name (which wont work for existing archer display algorithms
      // what is best way to display archer, scores, total, and handicap?
      // for a handicap league there may not be archer classes, just one big list of archers
      for (let i=0; i < tournaments.length; i++) {
        let newArchers = await this.loadArchersFromDB( tournaments[i].id, 0 ) || [];
        // add archers to list de-dupe and add scores
        newArchers.forEach( (archer) => {
          if (!archers[archer.name]) {
            archers[archer.name] = [];
          }
          archers[archer.name].push( archer );
        });
      }

      // iterate over archers and compute handicap and total score
      // FIXME: how does this work for a two day regular tournament?
      // eg, changing bales each day
    },


    //----------------------------------------
    // update archer in DB.
    // @arg archer - data to save, but also updated with DB metadata (version, date)
    //----------------------------------------
    updateArcher: async function( archer ) {

      this.computeRunningTotals( archer, this.currentRound );

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

    //----------------------------------------------------------------------
    // just archers in given division
    // Just for display, sorted by score.
    //----------------------------------------------------------------------
    getArchersByClass: function( bow, age, gender ) {
      // FSLR-AF
      return this.sortedArchers[bow.abbrev + "-" + age.abbrev + gender.abbrev] || [];
    },

    sortArchersForDisplay: function() {
      for (let b = 0; b < this.bows.length; b++) {
        for (let a = 0; a < this.ages.length; a++) {
          for (let g = 0; g < this.genders.length; g++) {
            const division =
                  this.bows[b].abbrev + "-" + this.ages[a].abbrev + this.genders[g].abbrev;
            this.sortedArchers[division] = this.findArchersByClass(
              this.bows[b], this.ages[a], this.genders[g] );
          }
        }
      }
      this.$forceUpdate();
    },

    findArchersByClass( bow, age, gender ) {
      let outArchers = [];

      for (let i=0; i< this.archers.length; i++) {
        let archer = this.archers[i];
        // ex: FSLR-AM
        if ((archer.bow == bow.abbrev) &&
            (archer.age == age.abbrev) &&
            (archer.gender == gender.abbrev))
        {
          outArchers.push( archer );
        }
      }

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

      for (let b=0; b < this.bows.length; b++) {
        for (let a=0; a < this.ages.length; a++) {
          for (let g=0; g < this.genders.length; g++) {

            let archers = this.getArchersByClass(
              this.bows[b], this.ages[a], this.genders[g] );
            if (!archers.length) {
              continue;
            }
            csv.push([]);
            csv.push( [this.ages[a].full + " " + this.genders[g].full + " " + this.bows[b].full] );

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
          }
        }
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
    async loadLeagueFromDB( id ) {
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
        console.log("update resulted in " + JSON.stringify( result ));

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
