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


// TODO:
// archer data should be in cloud (how to uniquely ID?)
// Round management. It's always round 0

// archer ID is name?  How to avoid dupes at creation? Steal other archer?
//  Enforce each archer on unique phone? Steal vs overwrite?

// way to ensure no skipped (blank) ends - can't select beyond last scored end?

// Tournament Displey
//   List all archers and scores, sorted by division (or not)
//   Handicap system?


//----------------------------------------------------------------------
//  OVERVIEW
//----------------------------------------------------------------------
//  A VueJS 2.1 app for entering and viewing archery tournament results
//
/*  Data model example

    // PK,HK,RK (Primary key or hash key, range key) pick two

    // redundant, denormalize into Tournament obejct
    tournamentCodes {
      code: "XYZ"   // HK
      date: "1/1/2024"  // RK  (allows querying all of a day's tournaments...why?)
      id: 42069
    }

    // how to select by code? (ie, join a tournament)
    tournament {
      id: 42069,     // PK
      date: "1/1/2024", // secondady HK with code
      code: "XYZ",      // secondary Index on code and date (to replace tournamentCodes)

      description: "Peanut Farmer 1000",
      type: { "WA 300", ends: 10, arrows: 3, rounds: 1 }

      //  archers: [id, id, id, ...]
      //  bales: { name: "14", archers: [...] }
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

let dev = true;  // if on a desktop (ie, not deployed)
let localMode = true;

// FIXME: new lambda?
let serverURL = "https://ox5gprrilk.execute-api.us-west-2.amazonaws.com/prod/";
if (dev) {
  serverURL = "https://317bll5em3.execute-api.us-west-2.amazonaws.com/dev/";
}

Vue.filter('score', function (value) {
  if (value == null) {
    return "\u00A0";  // nbsp
  } else {
    return value;
  }
});

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

    tournament: { },
    round: 0,     // which round of the tournament we are scoring (how is this determined? display only?)  Can we move around rounds?  Display only one round at a time?  All rounds?  How to edit and update previous rounds?

    archers: [],           // on a particular bale (scoring group)
    scoringArcher: null,   // which archer we are currenty editing

    newGroupName: "",  // temp for data entry
    groupName: "",     // immutable key for this scoring group

    newArcher: {},     // candidate new archer data model for UI before saving
    nextArcherId: 0,   // using name as Id. Not great, but numbers are not unique.

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
        "arrows": 3, "ends": 10, maxArrowScore: 11
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

    // X,9,8,7,6,5,4,3,2,1,M
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
  async mounted() {
    // handle broken promises.
    window.addEventListener('unhandledrejection', function(event) {
      console.error("Rat farts " + JSON.stringify( event ));
      // alert("Rat farts " + JSON.stringify( event ));
      debugger;
    });

    Util.setNamespace("TS");

    let tournamentId = this.$route.query.id;
    if (tournamentId) {
      this.tournament = await this.getTournamentById( tournamentId );
      if (!this.tournament.type) {
        alert("There is no tournament named " + tournamentId );
      } else {
        let groupId = this.$route.query.groupId;  // scoring bale
        if (groupId) {
          this.archers = await this.getArchers( tournamentId, groupId );
          if (!this.archers[0]) {
            this.groupName = groupId;
            console.log("There is no scoring group named " + groupId );
          } else {
            this.groupName = this.archers[0].groupId;
          }
        }
      }
    }

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
  beforeCreate: function() {
  },

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
      window.location.href += "&groupId=" + this.groupName;
    },

    groupName: function() {
      return this.groupName || this.archers[0].groupName;
    },

    updateInProgress: function() {
      return this.saveInProgress || this.loadingData;
    },


    // switch mode to show an archer's score for the tournament
    scoreArcher: function( archer ) {
      this.archer = archer;
      this.mode = ViewMode.SCORE_SHEET;
    },

    scoreEnd: function( archer, end, endNumber ) {
      this.scoringEnd = end;
      this.scoringEndNumber = endNumber;
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

      // FIXME: sort scoring end high to low (add X to this)
      this.scoringEnd.arrows.sort( this.compareArrowScores );
    },

    compareArrowScores: function(a,b) {
      if (a == "M") { a = 0; }
      if (b == "M") { b = 0; }
      if (a == "X") { a = this.tournament.type.maxArrowScore+1; }
      if (b == "X") { b = this.tournament.type.maxArrowScore+1; }
      return b-a;
    },

    deleteArrowScore() {
      console.log("deleting last arrow " + this.currentArrow );
      this.scoringEnd.arrows[--this.currentArrow] = null;

      this.$forceUpdate();  // deep change to this.scoringEnd does not trigger update
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
            };
          }
        }
      }
    },

    //----------------------------------------
    // Do the math for the whole round.
    // From scratch each time?  Seems like overkill, but probably worth it
    //----------------------------------------
    computeRunningTotals: function( archer, roundNum ) {
      let runningTotal = 0,  // for each end and total
          xCount = 0;        // total only

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
      }

      // round totals
      round.score = runningTotal;
      round.xCount = xCount;

      // all round totals - do we need this?
      archer.total = {
        score: 0,
        xCount: 0
      };
      for (let r=0; r < archer.rounds.length; r++) {
        archer.total.score += archer.rounds[r].score|0;    // "|0" prevents NaN if anything
        archer.total.xCount += archer.rounds[r].xCount|0;  // is undefined
      }

    },


    //----------------------------------------
    doneWithEnd: function( archer, end ) {
      // TODO: verify all arrows scored? Or all or nothing perhaps?

      let arrowsScored = 0;
      for (let i=0; i < end.arrows.length; i++) {
        if (end.arrows[i] != null) {
          arrowsScored++;
        }
      }

      if ((arrowsScored == 0) || (arrowsScored == end.arrows.length)) {
        this.enterScoresForEnd( archer, end );
        this.mode = ViewMode.SCORE_SHEET;
      } else {
        alert("Must score all arrows or no arrows");
        return;
      }

    },

    //----------------------------------------
    // Update the scores for a single end.  Then updated round running totals
    // @arg archer
    // @arg round - round number
    // @arg end - end number
    //----------------------------------------
    enterScoresForEnd: function( archer, end ) {
      // scores for this end, e.g. ["X", "10", "9", "M", ...]
      let arrows = end.arrows;

      end.score = 0;
      end.runningTotal = 0;  //
      end.xCount = 0;

      for (let a=0; a < end.arrows.length; a++) {
        if (arrows[a] == "X") { // 10 normally. 11 for Lancaster, 5 for BF
          end.score += this.tournament.type.maxArrowScore;
          end.xCount++;
        } else {
          if (arrows[a] != "M") {  // miss
            end.score += arrows[a] | 0;  // convert "9" to int
          }
        }
      }

      // running totals calculated here, too
      this.updateArcher( archer );
    },

    joinTournament: function() {
      this.joinCode = this.joinCode.toUpperCase();
      this.tournament = this.getTournamentByCode( this.joinCode );
      if (!this.tournament.id) {
        alert("No tournament found named " + this.joinCode);
      }
    },

    // save to DB
    createTournament: function( event ) {
      if (this.tournament.id) {
        alert("Cannot modify an existing tournament. You must make a new one");
        return;
      }
      this.saveTournament();

      // hack to dismiss modal, maybe store dialog element when opening?
      // this.closeDialogElement( event.target.parentElement.parentElement );
      // this.$forceUpdate();  // deep change to this.tournament does not trigger update

      console.log("tournament created " + JSON.stringify( this.tournament ));

      // redirect to tournament page
      window.location.href += "../?id=" + this.tournament.id;
    },

    // open scoring page for this archer  TODO
    selectArcher: function( archer ) {
      console.log("Here we go! " + archer.name);
      this.scoringArcher = archer;
    },


    addNewArcher: function( event ) {
      this.newArcher.tournamentId = this.tournament.id;
      this.newArcher.groupId = this.groupName;
      this.initArcher( this.newArcher, this.tournament );

      // Adding to list then updating the list is wonky.

      // NOTE: Archer order is part of metadata so we need to add them to
      // the list before we can save. But metadata (like versioning
      // and any ID) isn't created until archer saved so we still need
      // to update our local copy.  This isn't an issue if we save the
      // whole array at once, but I felt it was better to save archers
      // individually, even though their order on the bale is also
      // saved with each archer

      // yes this code is weird, but there's a reason
      this.archers.push( this.newArcher );   // add archer to list (order matters)
      let updatedArcher = this.updateArcher( this.newArcher );  // save and update metadata
      this.archers[this.archers.length-1] = updatedArcher;  // put updated archer in list

      this.newArcher = {};

      // hack to dismiss modal, maybe store dialog element when opening?
      this.closeDialogElement( event.target.parentElement.parentElement );
    },

    removeArcherFromBale: function( archer ) {
      // this.bale.pop( archer );
    },

    // save current archer list to DB and begin tournament
    startScoring: function() {
      for (let i=0; i < this.archers.length; i++) {
        this.updateArcher( this.archers[i]);  // save the current order of archers
      }

      this.gotoArcherLlist();
    },

    gotoArcherLlist: function() {
      this.mode = ViewMode.ARCHER_LIST;
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

    qrcode: function() {
      let qrcode = new QRCode( document.getElementById("qrcode"),
                               "http://jindo.dev.naver.com/collie");

      let qrcode2 = new QRCode( document.getElementById("qrcode"), {
        text: "http://jindo.dev.naver.com/collie",
        width: 256,
        height: 256,
        // typeNumber : 4,   // https://www.qrcode.com/en/codes/
        colorDark : "#000000",
        colorLight : "#ffffff",
        correctLevel : QRCode.CorrectLevel.H  // high (L,M,H)
      });

      qrcode.clear();
      qrcode.makeCode("http://naver.com");
    },


    //----------------------------------------
    //----------------------------------------
    // Tournament persistence
    //----------------------------------------
    //----------------------------------------
    getTournamentByCode: function( tournamentCode ) {
      let tournament = {};

      if (!tournamentCode) {
        console.error("Tried to get null tournament");  debugger
        return tournament;
      }

      if (localMode) {
        tournament = Util.loadData("tournament"+ tournamentCode) || {};
      } else {
        tournamentCode =  this.loadTournamentByCodeFromDB( tournamentCode ) || {};
      }

      if (tournament && !tournament.type.rounds) {
        tournament.type.rounds = 1;  // default
      }
      return tournament;
    },

    //----------------------------------------
    getTournamentById: function( tournamentId ) {
      let tournament = {};

      if (!tournamentId) {
        console.error("Tried to get null tournament"); debugger
        return tournament;
      }
      if (localMode) {
        tournament = Util.loadData("tournament"+ tournamentId) || {};
      } else {
        tournamentId = this.loadTournamentByIdFromDB( tournamentId ) || {};
      }
      if (tournament && tournament.type) {
        tournament.type.rounds = tournament.type.rounds || 1;  // at least one always
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
    saveTournament: function() {
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
        this.tournament = this.saveTournamentToDB( this.tournament );  // ID/Code created in DB
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
    getArchers: function( tournamentId, groupId ) {
      if (localMode) {
        return Util.loadData("archers:"+tournamentId+"-"+groupId) || [];
      } else {
        return this.loadArchersFromDB( tournamentId, groupId ) || [];
      }
    },

    //----------------------------------------
    // update archer in DB.
    // @return archer so any metadata added can be updated in local copy
    //----------------------------------------
    updateArcher: function( archer ) {

      this.computeRunningTotals( archer, this.currentRound );

      // save their order in the group (even if not in a sorted array)
      let i = this.archers.findIndex( a => (a.name == archer.name));
      archer.scoringGroupOrder = (i<0)? 0 : i;

      if (localMode) {
        // hacky way to store single archer in a group, stomp the whole thing
        Util.saveData("archers:"+archer.tournamentId+"-"+archer.groupId, this.archers );

        return archer;
      } else {
        // save and update local copy with DB versioning and ID creation (if necessary)
        return this.saveArcherToDB( archer );
      }
    },

    //----------------------------------------------------------------------
    // just archers in given division
    // Just for display.  Could sort them I suppose, nahhh
    //----------------------------------------------------------------------
    getArchersByClass( bow, age, gender ) {
      let outArchers = [];

      for (let i=0; i< this.archers.length; i++) {
        let archer = this.archers[i];
        // ex: FSLR-AM
        if ((archer.bow == bow.abbrev) && (archer.ageGender == (age.abbrev+gender.abbrev))) {
          outArchers.push( archer );
        }
      }
      return outArchers;
    },


    //----------------------------------------------------------------------
    // SERVER CALLS
    //----------------------------------------------------------------------

    //----------------------------------------
    // load tournament from 4 letter code that is valid today only, use ID from here on out
    // code should only be used for ad-hoc tournaments, not ones set up in advance.
    //----------------------------------------
    async loadTournamentByCodeFromDB( tournamentCode ) {
      if (this.updateInProgress()) {    // one thing at a time...
        alert("Another action was in progress. Try again.");
        return null;
      }

      // server side will use date and short term code to get the persistent ID
      let date = new Date().toLocaleDateString('en-CA');  // CA uses 2024-12-25

      try {
        this.loadingData = true;

        let response = await fetch(serverURL +
                                   "tournaments?code=" + tournamentCode +
                                   "&date=" + date);
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

    //----------------------------------------
    // load tournament by direct ID (when would this get used?)
    // in an ad-hoc tournament you'd only have the tournament code (XYZQ).
    // in an organized tournament you'd have the tournament and bale ID's
    // .../tournament?tournamentId=69&scoringGroup=42
    //----------------------------------------
    async loadTournamentByIdFromDB( tournamentId ) {
      if (this.updateInProgress()) {    // one thing at a time...
        alert("Another action was in progress. Try again.");
        return null;
      }

      try {
        this.loadingData = true;

        let response = await fetch(serverURL + "tournaments?id=" + tournamentId );
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

    // async loadArcher() Not needed
    //----------------------------------------
    // load all archers in this tournament and/or on a given bale (scoring group)
    //----------------------------------------
    async loadArchersFromDB( tournamentId, groupId ) {
      if (this.updateInProgress()) {    // one thing at a time...
        alert("Another action was in progress. Try again.");
        return null;
      }

      try {
        this.loadingData = true;

        let response = await fetch(serverURL + "archers?tournamentId" + tournamentId +
                                   "&groupId = " + groupId );
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


    //----------------------------------------
    // save descriptor for tournament with scoring groups
    // ID to be generated remotely.
    //----------------------------------------
    async saveTournamentToDB( tournament ) {
      if (this.updateInProgress()) {    // one thing at a time...
        alert("Another action was in progress. Try again.");
        return null;
      }

      try {
        this.saveInProgress = true;

        let response = await fetch( serverURL + "updateTournament",
                                    Util.makeJsonPostParams( tournament ));
        if (!response.ok) { throw await response.json(); }

        let result = await response.json();
        console.log("update resulted in " + JSON.stringify( result ));
        return result;  // now with ID and code(?)
      }
      catch( err ) {
        console.error("Change name: " + JSON.stringify( err ));
        alert("Try again. Change name failed " +
              Util.sadface + (err.message || err));
        return null;
      }
      finally {
        this.saveInProgress = false;
      }
    },

    //----------------------------------------
    // save descriptor for tournament with scoring groups
    // Should ID be generated remotely? Probably.
    //----------------------------------------
    async saveArcherToDB( archer ) {
      if (this.updateInProgress()) {    // one thing at a time...
        alert("Another action was in progress. Try again.");
        return null;
      }

      try {
        this.saveInProgress = true;

        let response = await fetch( serverURL + "updateArcher",
                                    Util.makeJsonPostParams( archer ));
        if (!response.ok) { throw await response.json(); }

        // refresh our local data with whatever goodness the DB thinks
        // we should have (last updated, version)
        let result = await response.json();
        console.log("update resulted in " + JSON.stringify( result ));

        // return updated object (with versioning data, etc)
        return result;
      }
      catch( err ) {
        console.error("Change name: " + JSON.stringify( err ));
        alert("Try again. Change name failed " +
              Util.sadface + (err.message || err));
        return null;
      }
      finally {
        this.saveInProgress = false;
      }
    },

  },

});
